import type { TerminalInfo } from '@/lib/api';

/**
 * Pure TerminalPane helpers — no DOM, no server (unit-tested in
 * `terminal.test.ts`). The pane itself only renders what these return.
 */

/** Max scrollback chars kept per terminal in the browser (server keeps 64k). */
export const TERMINAL_BUFFER_CAP = 200_000;

/** Short tab label: agent shells show the agent, plain shells `shell · pid`. */
export function terminalLabel(info: TerminalInfo): string {
  if (info.agentId) return info.agentId;
  const shell = info.shell.split('/').pop() || info.shell;
  return info.pid ? `${shell} · ${info.pid}` : shell;
}

/** One-line status for the tab tooltip / footer. */
export function statusLabel(info: TerminalInfo): string {
  if (info.status === 'running') return `running · pid ${info.pid ?? '?'}`;
  if (info.status === 'error') return 'spawn failed';
  if (info.signal) return `killed (${info.signal})`;
  return `exit ${info.exitCode ?? '?'}`;
}

/** Human summary of how a shell ended (footer + exit banner). */
export function exitSummary(info: TerminalInfo): string | null {
  if (info.status === 'running') return null;
  if (info.status === 'error') return 'Shell failed to start';
  if (info.signal) return `Process ended (${info.signal})`;
  return `Process exited with code ${info.exitCode ?? '?'}`;
}

/**
 * Append a chunk to the scrollback, keeping the tail under the cap.
 * Pure + capped so a runaway `yes` loop cannot grow the tab forever.
 */
export function appendCapped(prev: string, chunk: string, cap: number = TERMINAL_BUFFER_CAP): string {
  if (!chunk) return prev;
  const next = prev + chunk;
  return next.length > cap ? next.slice(-cap) : next;
}

/** Strip ANSI escape sequences for the plain-text scrollback view. */
export function stripAnsi(text: string): string {
  return text
    .replace(/\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\][^\u0007]*\u0007/g, '')
    .replace(/[()][0-9A-B]/g, '');
}

/** Case-insensitive line filter for the pane search box (empty = all). */
export function filterLines(text: string, query: string): string[] {
  const lines = text.split('\n');
  const q = query.trim().toLowerCase();
  if (!q) return lines;
  return lines.filter((line) => line.toLowerCase().includes(q));
}

/** Minimal key shape for direct terminal typing (DOM-free, unit-tested). */
export type TermKey = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

/**
 * Map a browser key event to raw PTY bytes (REQ-059 direct typing).
 * Returns the bytes to send, or null when the browser should handle the
 * key itself (Cmd-combos, Alt-combos, unmapped function keys).
 * Ctrl+letter folds to control codes (Ctrl+C = \x03 interrupts, Ctrl+D =
 * \x04 EOF, Ctrl+L clears), arrows/history keys become ANSI sequences so
 * the shell's own readline owns history and completion.
 */
export function keyToBytes(e: TermKey): string | null {
  if (e.metaKey || e.altKey) return null;
  const { key } = e;
  if (e.ctrlKey) {
    if (key === '[') return '\u001b';
    if (key.length === 1) {
      const code = key.toLowerCase().charCodeAt(0);
      if (code >= 97 && code <= 122) return String.fromCharCode(code - 96);
    }
    return null;
  }
  switch (key) {
    case 'Enter':
      return '\n';
    case 'Backspace':
      return '\u007f';
    case 'Tab':
      return '\t';
    case 'Escape':
      return '\u001b';
    case 'ArrowUp':
      return '\u001b[A';
    case 'ArrowDown':
      return '\u001b[B';
    case 'ArrowRight':
      return '\u001b[C';
    case 'ArrowLeft':
      return '\u001b[D';
    case 'Delete':
      return '\u001b[3~';
    case 'Home':
      return '\u001b[H';
    case 'End':
      return '\u001b[F';
    case 'PageUp':
      return '\u001b[5~';
    case 'PageDown':
      return '\u001b[6~';
    default:
      return key.length === 1 ? key : null;
  }
}

/** Copy helper — clipboard API with a textarea fallback (non-secure contexts). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
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
