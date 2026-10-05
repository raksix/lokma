/**
 * Loop change events — the server half of REQ-202 kapsam 5 (live console rows).
 *
 * Shape mirrors `agents/events.ts` exactly: a tiny in-process pub/sub where the
 * WRITER never awaits a listener and a throwing listener never fails a turn.
 * That ordering is the whole reason this exists instead of the executor calling
 * `broadcast()` itself: the executor runs inside the session queue and has no
 * socket set of its own (loop turns ride a per-loop session), so it cannot
 * address the attached sockets without knowing about them.
 *
 * The payload is the CHANGED ids, never the records — see the `loop` frame in
 * `@lokma/shared` protocol/ws.ts. A reader re-reads through the same route the
 * console already uses, so a new loop field never needs a wire migration.
 */

/** Loop ids whose record just changed; `['*']` means "the catalog changed". */
export type LoopChangeEvent = { loopIds: readonly string[] };

export type LoopChangeListener = (ev: LoopChangeEvent) => void;

const listeners = new Set<LoopChangeListener>();

/** Subscribe to loop change events. Returns the unsubscribe function. */
export function onLoopChange(fn: LoopChangeListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Announce that loops changed.
 *
 * `[]` asks every reader for a FULL re-read (a create or a delete changes the
 * catalog, not one row).
 *
 * Two different signals are deliberately NOT treated alike, because conflating
 * them makes one of them silently untestable:
 *
 *  - `'*'` is a MEANINGFUL sentinel — "something changed and I cannot name
 *    it". Even when it arrives ALONGSIDE real ids the catalog may have changed
 *    shape, so the frame degrades to a full re-read.
 *  - a blank id is NOISE — an id that cannot be fetched. The named ids beside it
 *    are still valid, so they are delivered and the blank one is dropped.
 *
 * Deriving the degrade from "did the filter drop anything" (the obvious short
 * form) makes a blank id cost every reader a full list fetch, and — worse —
 * leaves the `'*'` rule passing vacuously: a lone `['*']` filters to `[]` with
 * or without any wildcard handling, so that assertion cannot fail.
 */
export function emitLoopChange(loopIds: readonly string[] = []): void {
  const wildcard = loopIds.includes('*');
  const ids = loopIds.filter((id) => id !== '*' && id.length > 0);
  const ev: LoopChangeEvent = { loopIds: wildcard ? [] : ids };
  for (const fn of listeners) {
    try {
      fn(ev);
    } catch {
      // A dead listener must never break a turn or a route.
    }
  }
}

/** Test seam — drop every listener between probe cases. */
export function __resetLoopEvents(): void {
  listeners.clear();
}