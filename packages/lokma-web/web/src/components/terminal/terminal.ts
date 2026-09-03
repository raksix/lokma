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
