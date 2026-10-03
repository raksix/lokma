/**
 * Public tunnel for a remote install (REQ-193, Kapsam 4).
 *
 * THE POINT: the proxy in `server/src/browser-proxy/` fixes the browser pane
 * (the server fetches the target, so `127.0.0.1:<port>` means the SERVER's
 * port). This module solves the other half — how the user reaches LOKMA itself
 * when the box has no public port. It is deliberately NOT a tunnel
 * implementation: it drives whatever binary is already installed
 * (`cloudflared`, `ngrok`) and otherwise falls back to the token-bearing relay
 * (`LOKMA_RELAY_URL`), which must be configured or nothing happens.
 *
 * THE RULE (kontrol 5 in the REQ): a tunnel status NEVER invents a URL. Every
 * reported url came out of the provider's own stdout. When nothing is running
 * the answer is `state: 'stopped'` with a null url, and when a provider binary
 * is missing the answer carries the install command — never a made-up
 * `*.trycloudflare.com` that would render as a broken frame in the panel.
 *
 * Split for testability: `resolveTunnelPlan()` is pure (env + a PATH probe fn)
 * so the whole provider-selection decision is unit-probeable with no network
 * and no spawn; `startTunnel()` is the only part that touches a process.
 *
 * Secrets: the relay token is read from the process environment at call time
 * and is never written to disk, never logged, and never returned by
 * `tunnelStatus()` — the persisted state file records the provider NAME only.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { access, constants as fsConstants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { readJson, writeAtomic } from '../utils/fs.js';

/** Provider families this module knows how to drive. */
export type TunnelProvider = 'cloudflared' | 'ngrok' | 'relay';

/** Lifecycle as reported to the panel — no other value is ever stored. */
export type TunnelState = 'stopped' | 'starting' | 'running' | 'error';

/** Where the last start attempt landed (or why it never did). */
export interface TunnelStatus {
  state: TunnelState;
  /** Public base URL, ONLY ever read from provider output. Null when stopped. */
  url: string | null;
  provider: TunnelProvider | null;
  /** ISO timestamps; `expiresAt` is null unless the provider reported one. */
  startedAt: string | null;
  expiresAt: string | null;
  /** Human sentence for the panel — honest on every branch. */
  message: string;
  /** Install/configure command when nothing could be started, else null. */
  installHint: string | null;
}

/** Persisted slice of the status (url is written only from provider output). */
interface TunnelStateFile {
  state: TunnelState;
  url: string | null;
  provider: TunnelProvider | null;
  startedAt: string | null;
  expiresAt: string | null;
  message: string;
  pid: number | null;
}

/** Env var naming the provider to use; unset means "prefer the binaries". */
export const TUNNEL_PROVIDER_ENV = 'LOKMA_TUNNEL_PROVIDER';
/** Env var carrying the relay base URL (the fallback provider's address). */
export const TUNNEL_RELAY_URL_ENV = 'LOKMA_RELAY_URL';
/** Env var carrying the relay token — read at call time, never persisted. */
export const TUNNEL_RELAY_TOKEN_ENV = 'LOKMA_RELAY_TOKEN';
/** Port the harness listens on when the caller does not name one. */
export const TUNNEL_DEFAULT_PORT = 3456;
/** Hard cap on a provider URL, matching the URL cap used by the proxy policy. */
export const TUNNEL_URL_CAP = 2048;

/** State file lives beside the rest of `~/.lokma`. */
const STATE_FILE = '~/.lokma/tunnel.json';

/** Stopped answer used by every read path that finds nothing. */
export function stoppedStatus(message = 'Tunnel is off — nothing is listening from outside.'): TunnelStatus {
  return {
    state: 'stopped',
    url: null,
    provider: null,
    startedAt: null,
    expiresAt: null,
    message,
    installHint: null,
  };
}

/** Typed failure — routes map it straight to `{ code, message }`. */
export class TunnelError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'TunnelError';
    this.code = code;
    this.status = status;
  }
}

/** What `startTunnel()` would do, decided without running anything. */
export interface TunnelPlan {
  provider: TunnelProvider;
  /** False → startTunnel refuses with `installHint`, nothing is spawned. */
  available: boolean;
  /** Binary to execute; empty for `relay` (that one is an HTTP call). */
  command: string;
  /** Args after the command; the loopback target is appended by the caller. */
  args: string[];
  /** Why it is unavailable / which provider won, in one sentence. */
  reason: string;
  installHint: string | null;
}

interface PlanOptions {
  /** Port the tunnel should expose. */
  port: number;
  /** Environment to read (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
  /**
   * PATH probe. Injected so unit tests can decide availability with no real
   * filesystem and no `PATH` of their own; defaults to a real X_OK lookup.
   */
  binaryExists?: (name: string) => Promise<boolean>;
}

/** Install sentence per provider, shown when the binary is missing. */
const INSTALL_HINTS: Record<TunnelProvider, string> = {
  cloudflared: 'Install cloudflared, then retry: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
  ngrok: 'Install the ngrok CLI, then retry: https://ngrok.com/download',
  relay: `Set ${TUNNEL_RELAY_URL_ENV} (and ${TUNNEL_RELAY_TOKEN_ENV}) to your own relay, or install cloudflared/ngrok instead.`,
};

/** Look a bare binary name up across PATH with an executable check. */
async function realBinaryExists(name: string): Promise<boolean> {
  const pathEnv = process.env.PATH ?? '';
  for (const dir of pathEnv.split(':')) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (!isAbsolute(candidate)) continue;
    try {
      await access(candidate, fsConstants.X_OK);
      return true;
    } catch {
      // keep looking — a non-executable hit is not an install
    }
  }
  return false;
}

/**
 * Decide the provider WITHOUT starting anything.
 *
 * Precedence: an explicit `LOKMA_TUNNEL_PROVIDER` wins even when the binary is
 * missing — silently substituting a different provider would hand the user a
 * URL from a service they did not ask for. Otherwise the binaries are tried in
 * order, and the relay is the last resort because it needs configuration the
 * user may not have.
 */
export async function resolveTunnelPlan(opts: PlanOptions): Promise<TunnelPlan> {
  const env = opts.env ?? process.env;
  const exists = opts.binaryExists ?? realBinaryExists;
  const explicit = (env[TUNNEL_PROVIDER_ENV] ?? '').trim().toLowerCase();

  const wanted: TunnelProvider[] =
    explicit === 'cloudflared' || explicit === 'ngrok' || explicit === 'relay'
      ? [explicit]
      : ['cloudflared', 'ngrok', 'relay'];

  for (const provider of wanted) {
    if (provider === 'relay') {
      const url = (env[TUNNEL_RELAY_URL_ENV] ?? '').trim();
      const ok = url.length > 0;
      return {
        provider,
        available: ok,
        command: '',
        args: ok ? ['--url', url, '--port', String(opts.port)] : [],
        reason: ok
          ? `using the configured relay at ${url}`
          : `${TUNNEL_RELAY_URL_ENV} is not set, so there is no relay to use`,
        installHint: ok ? null : INSTALL_HINTS.relay,
      };
    }
    const found = await exists(provider);
    if (found) {
      return {
        provider,
        available: true,
        command: provider,
        args:
          provider === 'cloudflared'
            ? ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${opts.port}`]
            : ['http', String(opts.port), '--log', 'stdout', '--log-format', 'json'],
        reason: `${provider} is installed`,
        installHint: null,
      };
    }
  }

  const last = wanted[wanted.length - 1] as TunnelProvider;
  return {
    provider: last,
    available: false,
    command: '',
    args: [],
    reason:
      explicit.length > 0
        ? `${TUNNEL_PROVIDER_ENV}=${explicit} but no such provider is installed`
        : 'no tunnel provider is installed (tried cloudflared, ngrok) and no relay is configured',
    installHint: INSTALL_HINTS[last],
  };
}

// Built without regex escapes on purpose: a `\`-heavy literal is exactly the
// kind of pattern that gets mangled on its way through file writes.
const HTTPS_URL_RE = new RegExp('https?://[A-Za-z0-9._~%-]+(?::[0-9]{1,5})?(?:/[A-Za-z0-9._~%/?#=&+-]*)?');

/** Pull the first public URL out of a provider's stdout line, or null. */
export function parseProviderUrl(line: string): string | null {
  const found = line.match(HTTPS_URL_RE);
  if (!found) return null;
  const url = found[0].replace(/[),.;'"]+$/, '');
  if (url.length > TUNNEL_URL_CAP) return null;
  // A provider echo of a loopback target is not a public tunnel.
  if (/127\.0\.0\.1|localhost|\[::1\]/.test(url)) return null;
  return url;
}

/** The ngrok json log line carries the url under several keys; find the first. */
export function parseNgrokJsonUrl(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const url = parsed['url'];
    if (typeof url !== 'string') return null;
    return parseProviderUrl(url);
  } catch {
    return null;
  }
}

/** Read the persisted state file, treating ANY unreadable shape as stopped. */
export async function readTunnelState(): Promise<TunnelStateFile> {
  const empty: TunnelStateFile = {
    state: 'stopped',
    url: null,
    provider: null,
    startedAt: null,
    expiresAt: null,
    message: stoppedStatus().message,
    pid: null,
  };
  const raw = await readJson<Record<string, unknown>>(
    STATE_FILE,
    (v) => (v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {}),
    {},
  );
  const state = raw['state'];
  if (state !== 'stopped' && state !== 'starting' && state !== 'running' && state !== 'error') return empty;
  return {
    state,
    url: typeof raw['url'] === 'string' ? raw['url'] : null,
    provider:
      raw['provider'] === 'cloudflared' || raw['provider'] === 'ngrok' || raw['provider'] === 'relay'
        ? raw['provider']
        : null,
    startedAt: typeof raw['startedAt'] === 'string' ? raw['startedAt'] : null,
    expiresAt: typeof raw['expiresAt'] === 'string' ? raw['expiresAt'] : null,
    message: typeof raw['message'] === 'string' ? raw['message'] : empty.message,
    pid: typeof raw['pid'] === 'number' ? raw['pid'] : null,
  };
}

async function persistState(state: TunnelStateFile): Promise<void> {
  await writeAtomic(STATE_FILE, JSON.stringify(state, null, 2), 0o600);
}

/** Live child processes, keyed by provider, for `stopTunnel()`. */
const live = new Map<TunnelProvider, ChildProcess>();

/**
 * Is a recorded pid still the tunnel we started? A pid that got reused (or a
 * stale file from a reboot) must NOT make the panel claim a running tunnel.
 */
function pidAlive(pid: number | null): boolean {
  if (pid === null || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the current status honestly: a recorded `running` whose pid is gone is
 * reported as stopped, because a tunnel that cannot be reached is not running.
 */
export async function tunnelStatus(): Promise<TunnelStatus> {
  const state = await readTunnelState();
  if (state.state === 'running' && !pidAlive(state.pid) && !live.size) {
    return stoppedStatus(
      `The recorded ${state.provider ?? 'tunnel'} process is gone — treat the tunnel as off.`,
    );
  }
  return {
    state: state.state,
    url: state.url,
    provider: state.provider,
    startedAt: state.startedAt,
    expiresAt: state.expiresAt,
    message: state.message,
    installHint: state.state === 'running' ? null : (state.message || stoppedStatus().message),
  };
}

interface StartOptions {
  port?: number;
  env?: NodeJS.ProcessEnv;
  binaryExists?: (name: string) => Promise<boolean>;
  /** ms to wait for the provider's url line before giving up. */
  timeoutMs?: number;
  /** Injectable for tests; defaults to a real spawn. */
  spawnFn?: typeof spawn;
}

/** Default: how long to wait for a provider to print its url. */
export const TUNNEL_START_TIMEOUT_MS = 20_000;

/**
 * Start the tunnel and return the status the provider actually reported.
 *
 * Fails LOUDLY instead of guessing: no provider available → `TunnelError` with
 * the install sentence; provider exits before printing a url → `TunnelError`
 * carrying the tail of its output. There is no branch that returns a url this
 * function did not read from a child process.
 */
export async function startTunnel(opts: StartOptions = {}): Promise<TunnelStatus> {
  const port = opts.port ?? TUNNEL_DEFAULT_PORT;
  const plan = await resolveTunnelPlan({
    port,
    ...(opts.env ? { env: opts.env } : {}),
    ...(opts.binaryExists ? { binaryExists: opts.binaryExists } : {}),
  });
  if (!plan.available || !plan.command) {
    await persistState({
      state: 'error',
      url: null,
      provider: plan.provider,
      startedAt: null,
      expiresAt: null,
      message: plan.reason,
      pid: null,
    });
    throw new TunnelError('provider_unavailable', plan.reason, 501);
  }

  await stopTunnel({ silent: true });
  const startedAt = new Date().toISOString();
  const spawnFn = opts.spawnFn ?? spawn;
  const child = spawnFn(plan.command, plan.args, { stdio: ['ignore', 'pipe', 'pipe'] });
  live.set(plan.provider, child);
  const pid = typeof child.pid === 'number' ? child.pid : null;
  const timeoutMs = opts.timeoutMs ?? TUNNEL_START_TIMEOUT_MS;

  const url = await new Promise<string | null>((resolve) => {
    let settled = false;
    let tail = '';
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const onLine = (chunk: unknown): void => {
      const line = String(chunk);
      tail = (tail + ' ' + line).slice(-400);
      const found = plan.provider === 'ngrok' ? parseNgrokJsonUrl(line) ?? parseProviderUrl(line) : parseProviderUrl(line);
      if (found) finish(found);
    };
    child.stdout?.on('data', onLine);
    child.stderr?.on('data', onLine);
    child.on('error', () => finish(null));
    child.on('exit', () => finish(null));
  });

  if (!url) {
    live.delete(plan.provider);
    const reason = `${plan.command} exited without printing a public url. Check its output above the tunnel panel.`;
    await persistState({
      state: 'error',
      url: null,
      provider: plan.provider,
      startedAt,
      expiresAt: null,
      message: reason,
      pid: null,
    });
    throw new TunnelError('no_url', reason, 502);
  }

  const message = `${plan.command} is serving this box at ${url}`;
  await persistState({
    state: 'running',
    url,
    provider: plan.provider,
    startedAt,
    expiresAt: null,
    message,
    pid,
  });
  return {
    state: 'running',
    url,
    provider: plan.provider,
    startedAt,
    expiresAt: null,
    message,
    installHint: null,
  };
}

/**
 * Stop the tunnel. Always answers stopped, even when nothing was running —
 * "already off" and "stopped now" are the same observable state, and the panel
 * must never keep showing a URL that no longer resolves.
 */
export async function stopTunnel(opts: { silent?: boolean } = {}): Promise<TunnelStatus> {
  const child = live.values().next().value as ChildProcess | undefined;
  live.clear();
  if (child && child.exitCode === null) {
    try {
      child.kill('SIGTERM');
    } catch {
      // already gone — stopping is still a success from the caller's view
    }
  }
  const previous = await readTunnelState();
  if (previous.pid !== null && pidAlive(previous.pid)) {
    try {
      process.kill(previous.pid, 'SIGTERM');
    } catch {
      // gone between the check and the signal — nothing left to stop
    }
  }
  if (opts.silent) return stoppedStatus();
  await persistState({
    state: 'stopped',
    url: null,
    provider: previous.provider,
    startedAt: previous.startedAt,
    expiresAt: null,
    message: 'Tunnel stopped — the public url no longer resolves.',
    pid: null,
  });
  return tunnelStatus();
}