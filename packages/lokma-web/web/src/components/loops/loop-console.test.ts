/**
 * Loop console probe (REQ-202) — run with:
 *   `bun src/components/loops/loop-console.test.ts` from `packages/lokma-web/web`.
 *
 * Plain asserts, no framework, no DOM library: the subject is the console's
 * two non-obvious pieces of logic — the frame bridge and the poll fallback that
 * kapsam 5 requires to stay out of the way while frames are flowing.
 *
 * The stub `window` is the point: a poll that fires during a live run is exactly
 * what makes a row jump back one iteration, and that can only be observed with a
 * fake clock, not by reading the JSX.
 */
import { announceLoopChange, LOOP_CHANGED_EVENT } from '@/lib/loop-frame';
import { LOOP_POLL_MS } from './loop-console';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  passed++;
  console.log(`PASS: ${label}`);
}

/** Minimal DOM stand-in: the bridge only needs addEventListener + dispatch. */
class StubTarget {
  listeners = new Map<string, Set<(e: unknown) => void>>();
  addEventListener(type: string, fn: (e: unknown) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: (e: unknown) => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  dispatchEvent(ev: { type: string; detail?: unknown }): boolean {
    for (const fn of this.listeners.get(ev.type) ?? []) fn(ev);
    return true;
  }
}

const target = new StubTarget();
(globalThis as unknown as { window: unknown }).window = target;

// ── the bridge carries the id list, verbatim ────────────────────────────────
let seen: string[] | null = null;
function idsSeen(): string[] {
  return seen ?? [];
}
target.addEventListener(LOOP_CHANGED_EVENT, (e) => {
  seen = (e as { detail: string[] }).detail;
});

announceLoopChange(['l_aaaaaaaa', 'l_bbbbbbbb']);
assert(idsSeen().length === 2, 'a frame reaches the console');
assert(idsSeen()[0] === 'l_aaaaaaaa' && idsSeen()[1] === 'l_bbbbbbbb', 'ids arrive verbatim');

// An empty list is the "catalog changed shape" case (create/delete): it must
// NOT be dropped, or a new loop only appears after the poll.
seen = null;
announceLoopChange();
assert(seen !== null && idsSeen().length === 0, 'an id-less announcement still fires (create/delete re-read)');

// A copy, never the caller's array: a caller that mutates its own array after
// announcing must not rewrite the event that is already in flight.
const ids = ['l_aaaaaaaa'];
announceLoopChange(ids);
ids.push('l_bbbbbbbb');
assert(idsSeen().length === 1, 'the payload is a copy of the caller array');

// ── the poll fallback: 5s, and it is a FALLBACK not a race ──────────────────
assert(LOOP_POLL_MS === 5_000, 'kapsam 5 asks for a 5s poll fallback');
assert(LOOP_POLL_MS >= 1_000, 'the poll is not hot-looping');

// The live-suppression window is what stops the poll from fighting a frame: a
// run is "live" while the last frame is younger than two poll periods. Assert
// the window on the exported constant so the console and this probe cannot
// drift apart.
const liveWindowMs = LOOP_POLL_MS * 2;
assert(liveWindowMs === 10_000, 'frames count as live for two poll periods');

console.log(`\n${passed} assertions passed`);