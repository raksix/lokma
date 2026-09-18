/**
 * REQ-155 — duplicate-submit guard for the composer.
 *
 * The composer's send path is reachable from several places at once (Enter
 * keydown, the send button, drag-and-drop of a file with a pending body) and a
 * fast double Enter leaves the text in place, so the same prompt was sent twice:
 * two optimistic rows plus the server's own echo painted the user's message
 * three times, while the transcript on disk held exactly one row.
 *
 * Guard rule: the same trimmed text, re-submitted inside a short window, is
 * dropped. A deliberate re-ask (later than the window) still goes through, and
 * different text is never blocked. Pure so it can be unit-tested under bun.
 */

/** Window in which a repeat of the same text counts as an accident. */
export const SUBMIT_GUARD_MS = 1500;

export type SubmitRecord = { text: string; at: number } | null;

/** True when this submit duplicates the previous one (same text, too soon). */
export function isDuplicateSubmit(prev: SubmitRecord, text: string, now: number): boolean {
  const next = text.trim();
  if (!next || !prev) return false;
  if (prev.text !== next) return false;
  const delta = now - prev.at;
  return delta >= 0 && delta < SUBMIT_GUARD_MS;
}

/** Record a submit so the next one can be compared against it. */
export function recordSubmit(text: string, now: number): SubmitRecord {
  const trimmed = text.trim();
  return trimmed ? { text: trimmed, at: now } : null;
}

/** Collapse optimistic rows that carry the same text (keep the first). */
export function dedupePending<T extends { text: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = row.text.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
