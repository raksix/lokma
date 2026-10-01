import { z } from 'zod';
import { TerminalError, terminalManager } from '../terminal/terminal.js';
import type { ToolDefinition } from './registry.js';

/**
 * Terminal tool family (REQ-181 wave 5) — the agent types into the SAME live
 * shells the TerminalPane drives (`terminal/terminal.ts`). `open_terminal`
 * (ui-control) spawns the shell; `terminal_write` sends the line and waits a
 * bounded moment for the shell's reply, so a command and its output land in
 * the chat together instead of the model typing blind. Failures come back as
 * `{ ok: false, code, message }` (e.g. `no_terminal`, `terminal_exited`),
 * never as a silent no-op.
 */

const TerminalWriteInput = z.object({
  /** Target shell id (from `open_terminal`); defaults to this session's newest live shell. */
  terminalId: z.string().min(1).max(64).optional(),
  /** What to type: a command, an answer (`y`), or a raw key sequence (Ctrl+C as its control byte). */
  data: z.string().min(1).max(16_000),
  /** Append Enter after `data` — default true; pass false for raw key sequences. */
  enter: z.boolean().optional(),
});

export const TERMINAL_TOOL_NAMES = ['terminal_write'] as const;

/**
 * Output capture window: poll the shell's tail until it has been quiet for
 * OUTPUT_QUIET_MS, or give up at OUTPUT_MAX_WAIT_MS and return the honest
 * partial output (a long build keeps running; the pane shows the rest).
 */
const OUTPUT_POLL_MS = 60;
const OUTPUT_QUIET_MS = 300;
const OUTPUT_MAX_WAIT_MS = 2200;
const OUTPUT_MAX_CHARS = 12_000;

export type TerminalToolOpts = {
  /** Owning loop session — the default write target is its newest live shell. */
  sessionId?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Newest still-running shell this session opened (mirrors the WS fan-out
 * scoping: session-tagged shells belong to their session, untagged ones are
 * CLI shells visible everywhere). Null when the session has no live shell.
 */
export function newestSessionTerminal(sessionId: string | undefined): string | null {
  const wanted = sessionId ?? '';
  let newest: { id: string; startedAt: string } | null = null;
  for (const record of terminalManager.list()) {
    if (record.status !== 'running') continue;
    if (record.sessionId !== wanted) continue;
    if (!newest || record.startedAt > newest.startedAt) {
      newest = { id: record.id, startedAt: record.startedAt };
    }
  }
  return newest ? newest.id : null;
}

/**
 * Wait for fresh output after a write, then return exactly what arrived.
 * The tail is a suffix of the live stream: a pure append extends the
 * previous snapshot; a ring-buffer wrap (64KB spilled) replaces it.
 */
async function drainFreshOutput(terminalId: string, before: string): Promise<string> {
  const startedAt = Date.now();
  let last = before;
  let collected = '';
  let lastChangeAt = 0;
  while (Date.now() - startedAt < OUTPUT_MAX_WAIT_MS) {
    await sleep(OUTPUT_POLL_MS);
    let current: string;
    try {
      current = terminalManager.get(terminalId).tail;
    } catch {
      break; // the record vanished mid-capture — return what we have
    }
    if (current !== last) {
      collected = current.startsWith(last) ? collected + current.slice(last.length) : current;
      last = current;
      lastChangeAt = Date.now();
    } else if (lastChangeAt > 0 && Date.now() - lastChangeAt >= OUTPUT_QUIET_MS) {
      break;
    }
  }
  if (collected.length <= OUTPUT_MAX_CHARS) return collected;
  return '[truncated to the last ' + OUTPUT_MAX_CHARS + ' chars]\n' + collected.slice(-OUTPUT_MAX_CHARS);
}

export function buildTerminalTools(opts: TerminalToolOpts = {}): ToolDefinition[] {
  const sessionId = opts.sessionId ?? '';
  return [
    {
      name: 'terminal_write',
      description:
        'Type input into an open terminal session (a command, an answer, a key sequence) and return the output it produced; targets the newest shell this session opened unless terminalId is given.',
      inputSchema: TerminalWriteInput,
      readOnly: false,
      maxResultSizeChars: 14_000,
      handler: async (input) => {
        const { terminalId, data, enter } = input as z.infer<typeof TerminalWriteInput>;
        try {
          let target: string;
          if (terminalId) {
            const record = terminalManager.peek(terminalId);
            // Session-tagged shells stay with their session; untagged (CLI)
            // shells are reachable from anywhere, same rule as the WS fan-out.
            if (record && record.sessionId !== '' && record.sessionId !== sessionId) {
              return {
                ok: false,
                code: 'not_your_terminal',
                message: 'Terminal ' + terminalId + ' belongs to another session',
              };
            }
            target = terminalId;
          } else {
            const newest = newestSessionTerminal(sessionId);
            if (!newest) {
              return {
                ok: false,
                code: 'no_terminal',
                message: 'No open terminal in this session — call open_terminal first',
              };
            }
            target = newest;
          }
          const payload = enter === false || data.endsWith('\n') ? data : data + '\n';
          const before = terminalManager.get(target).tail;
          const { bytes } = terminalManager.write(target, payload);
          const output = await drainFreshOutput(target, before);
          return { ok: true, terminalId: target, bytes, output };
        } catch (e) {
          if (e instanceof TerminalError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
  ];
}
