/**
 * Message-windowing probe for Phase 3 perf wave 2b (`./message-window.test.ts`).
 * Run: `bun src/components/chat/message-window.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain asserts so `tsc -b` stays dependency-free.
 * Not imported by app code, so the Vite bundle ignores it.
 */
import {
  MESSAGE_WINDOW_INITIAL,
  MESSAGE_WINDOW_STEP,
  expandMessageWindow,
  shouldResetMessageWindow,
  visibleMessageWindow,
} from './message-window';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

// 1. Short transcripts render whole (no collapsing, no "show earlier").
let w = visibleMessageWindow(0, MESSAGE_WINDOW_INITIAL);
assert(w.start === 0 && w.hidden === 0 && w.visible === 0, 'empty transcript renders nothing');
w = visibleMessageWindow(10, MESSAGE_WINDOW_INITIAL);
assert(w.start === 0 && w.hidden === 0 && w.visible === 10, 'short transcript fully visible');
w = visibleMessageWindow(40, MESSAGE_WINDOW_INITIAL);
assert(w.start === 0 && w.hidden === 0 && w.visible === 40, 'exactly-initial transcript fully visible');

// 2. Long transcripts render only the tail; head stays hidden behind the control.
w = visibleMessageWindow(100, MESSAGE_WINDOW_INITIAL);
assert(w.start === 60 && w.hidden === 60 && w.visible === 40, 'long transcript shows last 40');
assert(w.start + w.visible === 100, 'window end always equals total (tail-anchored)');

// 3. Expansion grows by one step and caps at the full length.
let shown = expandMessageWindow(MESSAGE_WINDOW_INITIAL, 100);
assert(shown === MESSAGE_WINDOW_INITIAL + MESSAGE_WINDOW_STEP, 'expand grows by one step');
w = visibleMessageWindow(100, shown);
assert(w.start === 20 && w.hidden === 20 && w.visible === 80, 'expanded window still tail-anchored');
shown = expandMessageWindow(shown, 100);
assert(shown === 100, 'expand caps at total');
w = visibleMessageWindow(100, shown);
assert(w.start === 0 && w.hidden === 0 && w.visible === 100, 'fully expanded hides nothing');
shown = expandMessageWindow(100, 100);
assert(shown === 100, 'expand past total stays capped');

// 4. Indices are never remapped: slice(start) keeps real transcript indices.
const total = 100;
const win = visibleMessageWindow(total, MESSAGE_WINDOW_INITIAL);
const renderedIndices = Array.from({ length: win.visible }, (_, k) => win.start + k);
assert(renderedIndices[0] === 60 && renderedIndices[renderedIndices.length - 1] === 99, 'rendered rows keep real indices');
assert(new Set(renderedIndices).size === renderedIndices.length, 'rendered indices unique (stable React keys)');

// 5. Reset only on shrink (session switch to shorter, rewind, edit+resend).
assert(shouldResetMessageWindow(100, 20) === true, 'shrink resets to initial tail');
assert(shouldResetMessageWindow(100, 100) === false, 'same length keeps window');
assert(shouldResetMessageWindow(20, 100) === false, 'growth keeps window (live tail follows)');
assert(shouldResetMessageWindow(0, 5) === false, 'fresh session growth keeps default window');

// 6. Defensive inputs never produce negative windows.
w = visibleMessageWindow(-5, MESSAGE_WINDOW_INITIAL);
assert(w.start === 0 && w.hidden === 0 && w.visible === 0, 'negative total clamps to empty');
w = visibleMessageWindow(10, -3);
assert(w.start === 10 && w.hidden === 10 && w.visible === 0, 'negative shown hides all rows honestly');
assert(MESSAGE_WINDOW_INITIAL === 40 && MESSAGE_WINDOW_STEP === 40, 'window constants pinned');

console.log('message-window probe: all checks passed');
