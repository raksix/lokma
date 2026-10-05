/**
 * Loop frame bridge — the client half of REQ-202 kapsam 5.
 *
 * Lives in `lib/` (not `components/loops/`) on purpose: `hooks/use-ws.ts` is
 * the socket layer and must not import a component module, or the chat's
 * initial chunk pulls the whole console in. The console subscribes to the
 * event; the socket dispatches it. Neither imports the other.
 *
 * The payload is the CHANGED loop ids (see the `loop` frame in
 * `@lokma/shared` protocol/ws.ts); an empty list means "the catalog changed
 * shape — re-read the list".
 */

/** Frame → console bridge: the payload is the loop ids that changed. */
export const LOOP_CHANGED_EVENT = 'lokma:loop-changed';

/** Announce changed loops to every mounted console (empty = reload the list). */
export function announceLoopChange(loopIds: readonly string[] = []): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent<string[]>(LOOP_CHANGED_EVENT, { detail: [...loopIds] }));
  } catch {
    // Non-browser runtimes have no console to refresh.
  }
}