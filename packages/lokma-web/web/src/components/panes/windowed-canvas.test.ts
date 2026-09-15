/**
 * Unit checks for the REQ-096 windowed-geometry helpers
 * (`./windowed-canvas`). Run: `bun src/components/panes/windowed-canvas.test.ts`
 * from `packages/lokma-web/web`. No framework — plain asserts.
 * Not imported by library code.
 */
import {
  clampWindowPos,
  fillWindowPos,
  orderWindows,
  parseWindowOrder,
  raiseWindow,
  snapEdgeForPoint,
  snapWindowPos,
  windowZ,
} from './windowed-canvas';

let passed = 0;
function check(label: string, cond: boolean): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

const BOX = { left: 100, top: 50, w: 1200, h: 800 };

// fill: whole canvas minus the 8px margin.
const full = fillWindowPos(BOX);
check('fill x/y at margin', full.x === 8 && full.y === 8);
check('fill spans canvas', full.w === 1184 && full.h === 784);

// clamp: oversized + off-canvas windows come back inside.
const big = clampWindowPos({ x: -50, y: 900, w: 5000, h: 5000 }, BOX);
check('clamp caps size', big.w === 1184 && big.h === 784);
// REQ-151: containment is full — the WHOLE window stays inside on both axes
// (the y rule used to keep only a 40px title strip, so dragging down parked
// the window below the canvas and the canvas clipped it).
check('clamp keeps inside', big.x >= 0 && big.y >= 0 && big.x + big.w <= 1200 && big.y + big.h <= 800);
const dragged = clampWindowPos({ x: 100, y: 10_000, w: 400, h: 300 }, BOX);
check('clamp stops a downward drag at the bottom edge', dragged.y === 800 - 8 - 300);
const draggedUp = clampWindowPos({ x: 100, y: -50, w: 400, h: 300 }, BOX);
check('clamp stops an upward drag at the top edge', draggedUp.y === 0);
const small = clampWindowPos({ x: 100, y: 100, w: 400, h: 300 }, BOX);
check('clamp leaves interior alone', small.x === 100 && small.y === 100 && small.w === 400 && small.h === 300);
check('clamp no-op before measure', clampWindowPos({ x: 5, y: 5, w: 9, h: 9 }, { w: 0, h: 0 }).w === 9);

// REQ-152: stacking order — focus raises, stale ids drop, new ids land in front.
check('order keeps known windows and appends new ones in front',
  JSON.stringify(orderWindows(['b', 'a'], ['a', 'b', 'c'])) === JSON.stringify(['b', 'a', 'c']));
check('order drops windows that no longer exist',
  JSON.stringify(orderWindows(['b', 'a', 'dead'], ['a', 'b'])) === JSON.stringify(['b', 'a']));
check('raise moves a window to the front', JSON.stringify(raiseWindow(['a', 'b'], 'a')) === JSON.stringify(['b', 'a']));
check('raise keeps the order when the target is already front',
  JSON.stringify(raiseWindow(['b', 'a'], 'a')) === JSON.stringify(['b', 'a']));
const sameOrder = ['b', 'a'];
check('raise returns the same array when already front', raiseWindow(sameOrder, 'a') === sameOrder);
check('z follows the stack', windowZ(['b', 'a'], 'a') === 2 && windowZ(['b', 'a'], 'b') === 1 && windowZ(['b'], 'x') === 0);
check('parseWindowOrder drops junk', JSON.stringify(parseWindowOrder(['a', 5, '', null, 'b'])) === JSON.stringify(['a', 'b']));
check('parseWindowOrder rejects non-arrays', parseWindowOrder({ a: 1 }).length === 0);

// snap: halves + full.
const left = snapWindowPos(BOX, 'left');
const right = snapWindowPos(BOX, 'right');
check('snap halves tile', left.x === 8 && right.x + right.w === 1192 && left.w === right.w);
check('snap halves full height', left.h === 784 && right.h === 784);
check('snap top is full', JSON.stringify(snapWindowPos(BOX, 'top')) === JSON.stringify(full));

// edge detection: 20px tolerance, null in the middle and before measure.
check('edge top', snapEdgeForPoint(BOX, 700, 55) === 'top');
check('edge left', snapEdgeForPoint(BOX, 105, 400) === 'left');
check('edge right', snapEdgeForPoint(BOX, 1295, 400) === 'right');
check('edge none inside', snapEdgeForPoint(BOX, 700, 400) === null);
check('edge none unmeasured', snapEdgeForPoint({ left: 0, top: 0, w: 0, h: 0 }, 5, 5) === null);

console.log(`\n${passed} checks passed`);
