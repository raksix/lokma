/**
 * Chat message windowing (Phase 3 perf wave 2b) — long transcripts render
 * only their tail instead of hundreds of rows. Pure helpers so they run
 * under `bun` probes; rendering lives in `single-chat-view.tsx`.
 *
 * Contract: indices are NEVER remapped — the visible slice keeps its real
 * transcript indices (edit/rewind/copy/DotNav all use them), only the
 * head of the list is collapsed behind a "Show earlier" control.
 */

/** Tail size for a fresh or short transcript (rows). */
export const MESSAGE_WINDOW_INITIAL = 40;

/** Rows revealed per "Show earlier" expansion. */
export const MESSAGE_WINDOW_STEP = 40;

export type MessageWindow = {
  /** Real transcript index of the first rendered row. */
  start: number;
  /** Rows hidden above the window (0 = everything visible). */
  hidden: number;
  /** Rows rendered (`total - start`). */
  visible: number;
};

/**
 * Compute which transcript rows to render. `shown` is how many tail rows
 * the user wants (starts at MESSAGE_WINDOW_INITIAL, grows by
 * MESSAGE_WINDOW_STEP per expansion, capped at `total`).
 */
export function visibleMessageWindow(total: number, shown: number): MessageWindow {
  const safeTotal = Math.max(0, Math.floor(total));
  const safeShown = Math.max(0, Math.floor(shown));
  const visible = Math.min(safeShown, safeTotal);
  const start = safeTotal - visible;
  return { start, hidden: start, visible };
}

/** Grow the window by one step, capped at the transcript length. */
export function expandMessageWindow(shown: number, total: number, step: number = MESSAGE_WINDOW_STEP): number {
  return Math.min(Math.max(0, Math.floor(shown)) + Math.max(1, Math.floor(step)), Math.max(0, Math.floor(total)));
}

/**
 * Whether the window must collapse back to the initial tail: only when the
 * transcript SHRANK (session switch to a shorter session, rewind, edit +
 * resend). Growth (new messages, longer session) keeps the user's current
 * window so the live tail keeps following.
 */
export function shouldResetMessageWindow(prevTotal: number, nextTotal: number): boolean {
  return nextTotal < prevTotal;
}
