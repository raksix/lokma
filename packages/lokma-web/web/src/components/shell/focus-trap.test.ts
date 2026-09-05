/**
 * focus-trap.test.ts — probe for the shared focus-trap helper (wave 2c).
 * DOM-free: exercises `nextTrapIndex` wrap math + the selector contract.
 * Run: `bun src/components/shell/focus-trap.test.ts` (no DOM).
 */
import { FOCUSABLE_SELECTOR, nextTrapIndex } from './use-focus-trap';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${name}`);
  }
}

// Forward wrap.
check('tab from first goes to second', nextTrapIndex(0, 3, false) === 1);
check('tab from last wraps to first', nextTrapIndex(2, 3, false) === 0);
// Backward wrap.
check('shift+tab from first wraps to last', nextTrapIndex(0, 3, true) === 2);
check('shift+tab from last goes to middle', nextTrapIndex(2, 3, true) === 1);
// Edges.
check('single control tabs to itself', nextTrapIndex(0, 1, false) === 0);
check('single control shift+tabs to itself', nextTrapIndex(0, 1, true) === 0);
check('empty panel stays at zero', nextTrapIndex(0, 0, false) === 0);
check('empty panel shift stays at zero', nextTrapIndex(5, 0, true) === 0);
check('middle steps forward', nextTrapIndex(1, 5, false) === 2);
check('middle steps back', nextTrapIndex(1, 5, true) === 0);
// Direction is the only thing that matters — same index, both ways differ.
check('directions diverge', nextTrapIndex(0, 4, false) !== nextTrapIndex(0, 4, true));
// Full cycle returns home (invariant: N tabs from anywhere lands back).
for (let start = 0; start < 4; start += 1) {
  let i = start;
  for (let step = 0; step < 4; step += 1) i = nextTrapIndex(i, 4, false);
  check(`forward cycle returns home from ${start}`, i === start);
}
for (let start = 0; start < 4; start += 1) {
  let i = start;
  for (let step = 0; step < 4; step += 1) i = nextTrapIndex(i, 4, true);
  check(`backward cycle returns home from ${start}`, i === start);
}

// Selector contract — every interactive control kind is trappable, and
// disabled controls + tabindex=-1 are excluded from the trap ring.
for (const kind of ['a[href]', 'button', 'input', 'select', 'textarea', '[tabindex]']) {
  check(`selector covers ${kind}`, FOCUSABLE_SELECTOR.includes(kind));
}
check('selector skips disabled buttons', FOCUSABLE_SELECTOR.includes('button:not([disabled])'));
check('selector skips tabindex=-1', FOCUSABLE_SELECTOR.includes('[tabindex="-1"]'));

console.log(`focus-trap: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
