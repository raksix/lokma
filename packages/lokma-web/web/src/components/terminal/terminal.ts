import type { TerminalInfo } from '@/lib/api';
import type { WsStatus } from '@/lib/ws';

/**
 * Pure TerminalPane helpers — no DOM, no server (unit-tested in
 * `terminal.test.ts`). The pane itself only renders what these return.
 *
 * REQ-162: the pane is a real xterm emulator now. The helpers that existed
 * for the plain-text scrollback (ANSI stripping, key→byte mapping, line
 * filtering, the clipboard shim) are gone — the emulator owns cursor
 * motion, redraws, colours, key encodings and copy/paste itself.
 */

/** Max raw PTY bytes kept per terminal in the browser (server keeps 64k). */
export const TERMINAL_BUFFER_CAP = 200_000;

/** Human summary of how a shell ended (footer + exit banner). */
export function exitSummary(info: TerminalInfo): string | null {
  if (info.status === 'running') return null;
  if (info.status === 'error') return 'Shell failed to start';
  if (info.signal) return `Process ended (${info.signal})`;
  return `Process exited with code ${info.exitCode ?? '?'}`;
}

/**
 * REQ-107 — SSH-style connection notice for the pane footer.
 * The socket is invisible in the pane: when it drops, typing silently
 * goes nowhere. This maps every non-open socket state to one thin notice
 * strip (null = connected, render nothing). `action: 'reconnect'` means
 * the strip is a button that calls `ws.reconnect()`; otherwise the socket
 * is still retrying on its own (auto-backoff in use-ws).
 */
export type ConnectionNotice = {
  text: string;
  action: 'reconnect' | null;
};

export function connectionNotice(status: WsStatus): ConnectionNotice | null {
  if (status === 'open') return null;
  if (status === 'idle' || status === 'connecting') {
    return { text: 'Connecting to shell backend…', action: null };
  }
  if (status === 'closed') {
    return { text: 'Disconnected — click to reconnect', action: 'reconnect' };
  }
  return { text: 'Connection failed — click to retry', action: 'reconnect' };
}

/**
 * Append a chunk to the raw scrollback, keeping the tail under the cap.
 * Pure + capped so a runaway `yes` loop cannot grow the tab forever.
 * REQ-162: this is the emulator's replay log — raw PTY bytes, never
 * stripped, so a selection switch can be replayed losslessly.
 */
export function appendCapped(prev: string, chunk: string, cap: number = TERMINAL_BUFFER_CAP): string {
  if (!chunk) return prev;
  const next = prev + chunk;
  return next.length > cap ? next.slice(-cap) : next;
}

/**
 * REQ-158: the same `terminal/data` chunk can reach the client twice when more
 * than one socket feeds a session, which painted typed lines 2-3 times.
 * Identical bytes for one terminal inside the window are one delivery; a real
 * repeat (Enter twice) is always separated by the shell's own echo output.
 */
export const FRAME_DEDUPE_MS = 750;

/**
 * REQ-158: duplicates from the fan-out do not always arrive back-to-back — a
 * live run measured the typed marker painted 4× (echo, output, echo, output),
 * so a "previous frame only" check misses them. Recent deliveries are kept in a
 * tiny ring instead: identical bytes for one terminal inside the window were
 * already applied, so they are dropped. Only chunks long enough to be real
 * shell text are candidates, which keeps repeated Enter keys intact.
 */
export function isRecentDuplicate(
  recent: { terminalId: string; data: string; at: number }[],
  frame: { terminalId: string; data: string },
  now: number,
  windowMs: number = FRAME_DEDUPE_MS,
): boolean {
  if (frame.data.length < 8) return false;
  return recent.some((r) => r.terminalId === frame.terminalId && r.data === frame.data && now - r.at < windowMs);
}

/**
 * REQ-162 — resize frames mirror the emulator's fitted size.
 * `terminal/resize` must go out only when the fitted cols/rows actually
 * changed (or nothing was recorded for that shell yet): a hidden pane fits
 * to a degenerate box, and junk sizes would be clamped by the server. The
 * caller separately gates on a live shell — the server raises
 * `terminal_not_found` for shells that already exited — this helper only
 * answers "is this size news?".
 */
export function shouldSendResize(
  last: { cols: number; rows: number } | null,
  next: { cols: number; rows: number },
): boolean {
  if (!Number.isFinite(next.cols) || !Number.isFinite(next.rows)) return false;
  if (next.cols < 2 || next.rows < 2) return false;
  if (!last) return true;
  return last.cols !== next.cols || last.rows !== next.rows;
}

/**
 * REQ-060 — default a new terminal to the selected session/project cwd.
 * Pure decision helper so the pane adopts the project dir on session
 * switch but never clobbers a manual cwd edit on plain session-list
 * refreshes (the list cache hands out a new object identity per refresh).
 * - session switch → adopt the newly selected session cwd (manual edits
 *   belonged to the old session; open shells are server processes and
 *   are unaffected);
 * - same session → adopt a late-arriving cwd only into a pristine (empty)
 *   input, i.e. the list was still loading at mount; otherwise keep the
 *   current input untouched.
 * Returns the cwd the pane should store plus whether it counts as adopted.
 */
export function resolveTerminalCwd(input: {
  sessionChanged: boolean;
  knownCwd: string | null | undefined;
  currentCwd: string;
  adopted: boolean;
}): { cwd: string; adopted: boolean } {
  const known = (input.knownCwd ?? '').trim();
  if (input.sessionChanged) {
    return { cwd: known, adopted: known !== '' };
  }
  if (!input.adopted && input.currentCwd === '' && known !== '') {
    return { cwd: known, adopted: true };
  }
  return { cwd: input.currentCwd, adopted: input.adopted };
}
