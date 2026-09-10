import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';

/**
 * Terminal manager — real shell processes behind the TerminalPane (W3-10).
 * Each terminal is a live `$SHELL` child: stdin arrives via WS
 * `terminal/input` (or POST input), stdout+stderr stream back as WS
 * `terminal/data`, process end as `terminal/exit`. Kill ends the real PID.
 *
 * REQ-059: shells run inside a REAL PTY via `script(1)` (util-linux,
 * zero-dep) when available — prompts echo, readline history/completion
 * work, Ctrl+C (`\x03`) interrupts, interactive programs behave. Without
 * `script` (or with `LOKMA_NO_PTY=1`) it falls back to plain pipes
 * (`pty: false` on the record) — same API, no echo/job-control.
 * See Docs/24 §terminal pane.
 */

/** Max concurrently running shells (429 `terminal_limit` past this). */
export const TERMINAL_MAX_LIVE = 10;
/** Max stdin bytes accepted per write (400 `too_large` past this). */
export const TERMINAL_INPUT_CAP = 64 * 1024;
/** Per-terminal scrollback kept for late-joining panes (GET :id `tail`). */
export const TERMINAL_TAIL_CAP = 64 * 1024;
/** Grace period between SIGTERM and SIGKILL on `kill()`. */
const KILL_GRACE_MS = 3000;

export type TerminalStatus = 'running' | 'exited' | 'error';

export type TerminalRecord = {
  id: string;
  shell: string;
  cwd: string;
  pid: number | null;
  /** True when the shell runs inside a real PTY (`script(1)`), false on plain pipes. */
  pty: boolean;
  /** Owning agent (optional label) — tabs group by this when set. */
  agentId: string | null;
  /** Spawning web session — WS broadcast only reaches this session's sockets. */
  sessionId: string;
  status: TerminalStatus;
  startedAt: string;
  exitCode: number | null;
  signal: string | null;
  cols: number;
  rows: number;
};

export type SpawnTerminalOpts = {
  cwd?: string;
  agentId?: string;
  sessionId?: string;
  cols?: number;
  rows?: number;
};

export type KillResult = { killed: boolean; exitCode: number | null; signal: string | null };

/** Typed error — routes map `code`/`status` straight into `{ code, message }`. */
export class TerminalError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'TerminalError';
    this.code = code;
    this.status = status;
  }
}

const TERMINAL_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Whether `script(1)` (util-linux) is usable for real PTYs.
 * Cached after the first check; `LOKMA_NO_PTY=1` forces pipe mode.
 */
let ptyAvailable: boolean | null = null;

export function isPtyAvailable(): boolean {
  if (ptyAvailable !== null) return ptyAvailable;
  if (process.env.LOKMA_NO_PTY === '1') {
    ptyAvailable = false;
    return false;
  }
  ptyAvailable = existsSync('/usr/bin/script') || existsSync('/bin/script');
  return ptyAvailable;
}

/** Shell command line for `script -c`: interactive (prompt, history, completion). */
function shellCommand(shell: string): string {
  const base = shell.split('/').pop() || shell;
  // REQ-087: login shell (no --norc) so profile/bashrc load and the prompt
  // looks like SSH (root@host:path) instead of bare `bash-5.2#`.
  if (base === 'bash') return `${shell} --login -i`;
  return `${shell} -i -l`;
}

function newTerminalId(): string {
  return `term_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function assertTerminalId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !TERMINAL_ID_PATTERN.test(id)) {
    throw new TerminalError('bad_terminal_id', 'Invalid terminal id', 400);
  }
}

type LiveEntry = {
  proc: ChildProcess;
  record: TerminalRecord;
  tail: string;
  exitWaiters: Array<() => void>;
};

export class TerminalManager {
  private readonly live = new Map<string, LiveEntry>();
  private readonly dataListeners = new Set<(terminalId: string, data: string) => void>();
  private readonly exitListeners = new Set<(record: TerminalRecord) => void>();

  /** Subscribe to process output (WS routes fan out from here). Returns unsubscribe. */
  onData(listener: (terminalId: string, data: string) => void): () => void {
    this.dataListeners.add(listener);
    return () => {
      this.dataListeners.delete(listener);
    };
  }

  /** Subscribe to process end (WS routes fan out from here). Returns unsubscribe. */
  onExit(listener: (record: TerminalRecord) => void): () => void {
    this.exitListeners.add(listener);
    return () => {
      this.exitListeners.delete(listener);
    };
  }

  runningCount(): number {
    let n = 0;
    for (const entry of this.live.values()) {
      if (entry.record.status === 'running') n += 1;
    }
    return n;
  }

  /** Spawn a shell in `cwd` (must be an existing dir). Throws TerminalError. */
  async spawn(opts: SpawnTerminalOpts = {}): Promise<{ record: TerminalRecord; tail: string }> {
    if (this.runningCount() >= TERMINAL_MAX_LIVE) {
      throw new TerminalError(
        'terminal_limit',
        `Too many live terminals (max ${TERMINAL_MAX_LIVE}) — kill one first`,
        429,
      );
    }
    const cwd = opts.cwd && opts.cwd.trim() ? opts.cwd : process.cwd();
    try {
      const info = await stat(cwd);
      if (!info.isDirectory()) throw new Error('not a directory');
    } catch {
      throw new TerminalError('bad_cwd', `Terminal cwd is not a directory: ${cwd}`, 400);
    }
    const agentId = opts.agentId?.trim() ? opts.agentId.trim().slice(0, 128) : null;
    const shell = process.env.SHELL || 'bash';
    const usePty = isPtyAvailable();
    const id = newTerminalId();
    const record: TerminalRecord = {
      id,
      shell,
      cwd,
      pid: null,
      pty: usePty,
      agentId,
      sessionId: opts.sessionId ?? '',
      status: 'running',
      startedAt: new Date().toISOString(),
      exitCode: null,
      signal: null,
      cols: clampInt(opts.cols, 80, 1, 500),
      rows: clampInt(opts.rows, 24, 1, 200),
    };
    const entry: LiveEntry = { proc: null as unknown as ChildProcess, record, tail: '', exitWaiters: [] };
    this.live.set(id, entry);
    try {
      // REQ-059: `script -qec` gives the shell a real slave PTY while our
      // stdio stays plain pipes — zero native deps. Control chars
      // (Ctrl+C = \x03, Ctrl+D = \x04) arrive as PTY input and behave.
      // REQ-087: explicit HOME/USER/LOGNAME/LANG so the login shell always
      // builds its SSH-style prompt even when the daemon env is thin.
      const shellEnv = {
        ...process.env,
        TERM: 'xterm-256color',
        HOME: process.env.HOME || '/root',
        USER: process.env.USER || 'root',
        LOGNAME: process.env.LOGNAME || process.env.USER || 'root',
        LANG: process.env.LANG || 'C.UTF-8',
      };
      const proc = usePty
        ? spawn('script', ['-qec', shellCommand(shell), '/dev/null'], {
            cwd,
            env: shellEnv,
            stdio: ['pipe', 'pipe', 'pipe'],
          })
        : spawn(shell, [], {
            cwd,
            env: shellEnv,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
      entry.proc = proc;
      record.pid = proc.pid ?? null;
    } catch (e) {
      record.status = 'error';
      this.emitExit(record);
      throw new TerminalError('spawn_failed', `Could not start ${shell}: ${String(e)}`, 500);
    }
    const proc = entry.proc;
    proc.stdout?.on('data', (chunk: Buffer) => this.pushData(entry, chunk.toString('utf-8')));
    proc.stderr?.on('data', (chunk: Buffer) => this.pushData(entry, chunk.toString('utf-8')));
    proc.on('error', () => {
      if (record.status !== 'running') return;
      record.status = 'error';
      this.emitExit(record);
      this.wakeExitWaiters(entry);
    });
    proc.on('exit', (code, signal) => {
      if (record.status !== 'running') return;
      record.status = 'exited';
      record.exitCode = code;
      record.signal = signal;
      this.emitExit(record);
      this.wakeExitWaiters(entry);
    });
    // Records (incl. exited ones) stay until DELETE — panes read the exit code.
    return { record: { ...record }, tail: '' };
  }

  /** Write stdin bytes. Throws TerminalError (404 unknown, 409 exited, 400 bad). */
  write(id: string, data: unknown): { bytes: number } {
    assertTerminalId(id);
    const entry = this.live.get(id);
    if (!entry) throw new TerminalError('terminal_not_found', `No terminal ${id}`, 404);
    if (entry.record.status !== 'running' || !entry.proc.stdin) {
      throw new TerminalError('terminal_exited', `Terminal ${id} already exited`, 409);
    }
    if (typeof data !== 'string' || data.length === 0) {
      throw new TerminalError('bad_data', 'input needs { data: non-empty string }', 400);
    }
    if (data.length > TERMINAL_INPUT_CAP) {
      throw new TerminalError('too_large', `input capped at ${TERMINAL_INPUT_CAP} bytes`, 400);
    }
    entry.proc.stdin.write(data);
    return { bytes: data.length };
  }

  /** Record the pane size (stored for the UI; `script(1)` inherits the daemon winsize). */
  resize(id: string, cols: unknown, rows: unknown): { cols: number; rows: number } {
    assertTerminalId(id);
    const entry = this.live.get(id);
    if (!entry) throw new TerminalError('terminal_not_found', `No terminal ${id}`, 404);
    entry.record.cols = clampInt(cols, entry.record.cols, 1, 500);
    entry.record.rows = clampInt(rows, entry.record.rows, 1, 200);
    return { cols: entry.record.cols, rows: entry.record.rows };
  }

  /**
   * End the real process (SIGTERM, SIGKILL after grace). Resolves once the
   * process is reaped. Already-exited terminals report `killed: false`.
   */
  async kill(id: string): Promise<KillResult> {
    assertTerminalId(id);
    const entry = this.live.get(id);
    if (!entry) throw new TerminalError('terminal_not_found', `No terminal ${id}`, 404);
    const { record, proc } = entry;
    if (record.status !== 'running') {
      return { killed: false, exitCode: record.exitCode, signal: record.signal };
    }
    const exited = new Promise<void>((resolve) => entry.exitWaiters.push(resolve));
    try {
      proc.kill('SIGTERM');
    } catch {
      // Already gone — the exit event (or the timeout below) settles it.
    }
    const timeout = await withTimeout(exited, KILL_GRACE_MS);
    if (!timeout && record.status === 'running') {
      try {
        proc.kill('SIGKILL');
      } catch {
        // Gone between the check and the signal.
      }
      await withTimeout(exited, KILL_GRACE_MS);
    }
    return { killed: true, exitCode: record.exitCode, signal: record.signal };
  }

  /** Forget a record (kills it first when still running). */
  async remove(id: string): Promise<KillResult> {
    const result = await this.kill(id);
    this.live.delete(id);
    return result;
  }

  list(): TerminalRecord[] {
    return [...this.live.values()].map((e) => ({ ...e.record }));
  }

  /** Full record + scrollback tail for late-joining panes. */
  get(id: string): { record: TerminalRecord; tail: string } {
    assertTerminalId(id);
    const entry = this.live.get(id);
    if (!entry) throw new TerminalError('terminal_not_found', `No terminal ${id}`, 404);
    return { record: { ...entry.record }, tail: entry.tail };
  }

  /** Non-throwing record lookup for WS broadcast scoping. */
  peek(id: string): TerminalRecord | null {
    const entry = this.live.get(id);
    return entry ? { ...entry.record } : null;
  }

  private pushData(entry: LiveEntry, chunk: string): void {
    if (!chunk) return;
    entry.tail = (entry.tail + chunk).slice(-TERMINAL_TAIL_CAP);
    for (const listener of this.dataListeners) {
      try {
        listener(entry.record.id, chunk);
      } catch {
        // One bad subscriber must never break process output.
      }
    }
  }

  private emitExit(record: TerminalRecord): void {
    const snapshot = { ...record };
    for (const listener of this.exitListeners) {
      try {
        listener(snapshot);
      } catch {
        // One bad subscriber must never break exit reporting.
      }
    }
  }

  private wakeExitWaiters(entry: LiveEntry): void {
    const waiters = entry.exitWaiters.splice(0);
    for (const wake of waiters) wake();
  }
}

/** Process-wide registry — WS routes and REST routes share the same shells. */
export const terminalManager = new TerminalManager();

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Resolve `true` when `p` settles first, `false` on timeout. */
function withTimeout(p: Promise<void>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  return Promise.race([
    p.then(() => true),
    timeout,
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
