/**
 * Office canvas model probe (REQ-204 slice 3) — run with:
 *   `bun src/components/office/office-canvas-model.test.ts` from `packages/lokma-web/web`.
 *
 * Plain asserts, no framework, no DOM (same shape as `office-view.test.ts`).
 *
 * Subject: every honesty rule the canvas mapping stands on. Each rule gets a
 * DISCRIMINATING pair — cases that differ ONLY in the rule under test — so a
 * rule that nothing actually depends on shows up as an unasserted no-op.
 */
import {
  buildCanvasData,
  canvasProjects,
  canvasTypeTag,
  OFFICE_CANVAS_MIN_WIDTH,
  resolveCanvasSelection,
  toCanvasWorker,
} from './office-canvas-model';
import type { OfficeDelivery, OfficeWorker } from './office-view';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
  passed++;
}

// ── fixtures ───────────────────────────────────────────────────────────────

function worker(over: Partial<OfficeWorker> & { id: string }): OfficeWorker {
  return {
    type: 'run',
    status: 'working',
    projectId: null,
    projectBadge: 'no project',
    cwd: null,
    sessionId: null,
    loopId: null,
    runId: null,
    botId: null,
    agentId: null,
    label: over.id,
    task: null,
    currentTool: null,
    lastTools: [],
    startedAt: null,
    endedAt: null,
    ok: null,
    isBoss: false,
    ...over,
  };
}

function delivery(over: Partial<OfficeDelivery> & { id: string }): OfficeDelivery {
  return {
    type: 'run',
    projectId: null,
    projectBadge: 'no project',
    label: over.id,
    startedAt: null,
    endedAt: null,
    ok: null,
    toolCount: null,
    ...over,
  };
}

const SEEN = new Map<string, number>([
  ['run:s1', 1000],
  ['loop:l1', 2000],
]);
const NOW = 9_999_999;

// ── A. the boss is not a desk worker ───────────────────────────────────────

const bossWorking = worker({ id: 'run:boss', isBoss: true, status: 'working' });
const crewRun = worker({ id: 'run:s1', currentTool: 'terminal' });
const data1 = buildCanvasData({ workers: [bossWorking, crewRun], deliveries: [], seenAt: SEEN, nowMs: NOW });
assert(data1.workers.length === 1 && data1.workers[0]!.id === 'run:s1', 'the boss is kept OUT of the crew list');
assert(data1.isBossBusy === true, 'a working boss sets isBossBusy');
assert(data1.isBossAsking === false, 'a working boss is not asking');

// Discrimination: flip ONLY the boss status to waiting.
const dataAsk = buildCanvasData({
  workers: [worker({ id: 'run:boss', isBoss: true, status: 'waiting' }), crewRun],
  deliveries: [],
  seenAt: SEEN,
  nowMs: NOW,
});
assert(dataAsk.isBossBusy === false && dataAsk.isBossAsking === true, 'a waiting boss asks instead of working');

// No boss at all: neither flag claims anything.
const dataNoBoss = buildCanvasData({ workers: [crewRun], deliveries: [], seenAt: SEEN, nowMs: NOW });
assert(dataNoBoss.isBossBusy === false && dataNoBoss.isBossAsking === false, 'no boss -> no invented boss state');

// ── B. live workers carry no verdict and no fake start ─────────────────────

const live = toCanvasWorker(worker({ id: 'run:s1', ok: false, startedAt: '2026-10-18T10:00:00.000Z' }), SEEN, NOW);
assert(live.doneAt === null && live.isOk === null, 'a live worker has no doneAt and no invented verdict (ok:false is NOT passed through)');
assert(live.spawnAt === 1000, 'spawnAt is the pane\'s first observation of that worker id');

const unseen = toCanvasWorker(worker({ id: 'run:never-seen' }), SEEN, NOW);
assert(unseen.spawnAt === NOW, 'a worker with no observation stamp falls back to nowMs (never a made-up earlier time)');

// ── C. project desks are real or absent ────────────────────────────────────

const deskless = toCanvasWorker(worker({ id: 'run:x', projectId: null, projectBadge: 'no project' }), SEEN, NOW);
assert(deskless.project === null, 'an unresolved project is null, so the badge text never becomes a desk column');
const desked = toCanvasWorker(worker({ id: 'run:y', projectId: 'p_alpha', projectBadge: 'Alpha' }), SEEN, NOW);
assert(desked.project === 'Alpha', 'a resolved project carries its name');

// ── D. type tags stay short ────────────────────────────────────────────────

assert(canvasTypeTag('run') === 'run', 'run tag');
assert(canvasTypeTag('loop-turn') === 'loop', 'loop turns tag as loop (fits the 8-char chest badge)');
assert(canvasTypeTag('loop-turn') !== canvasTypeTag('run'), 'the two kinds never render the same tag');

// ── E. the board is measured, single-project offices stay on the whiteboard ─

const alpha1 = worker({ id: 'run:a1', projectId: 'p_alpha', projectBadge: 'Alpha' });
const alpha2 = worker({ id: 'run:a2', projectId: 'p_alpha', projectBadge: 'Alpha', status: 'waiting' });
const beta1 = worker({ id: 'loop:b1', type: 'loop-turn', projectId: 'p_beta', projectBadge: 'Beta' });

const single = buildCanvasData({ workers: [alpha1], deliveries: [], seenAt: SEEN, nowMs: NOW });
assert((single.projects ?? []).length === 0, 'a single-project office passes no board rows (the renderer keeps its whiteboard)');

const multi = buildCanvasData({
  workers: [alpha1, alpha2, beta1],
  deliveries: [delivery({ id: 'd1', projectId: 'p_alpha', projectBadge: 'Alpha' }), delivery({ id: 'd2' })],
  seenAt: SEEN,
  nowMs: NOW,
});
const multiProjects = multi.projects ?? [];
assert(multiProjects.length === 2, 'two real projects -> two board columns');
const alphaCol = multiProjects.find((p) => p.name === 'Alpha');
assert(
  alphaCol !== undefined && alphaCol.working === 2 && alphaCol.waiting === 1 && alphaCol.delivered === 1,
  'board counts are measured from the same rows (2 working, 1 waiting, 1 delivered)',
);
assert(multi.delivered === 2, 'delivered counts every delivery the pane holds, desk or not');

// Discrimination for the boss mark: only the boss's own project is flagged.
const multiBoss = buildCanvasData({
  workers: [worker({ id: 'run:boss', isBoss: true, projectId: 'p_beta', projectBadge: 'Beta' }), alpha1, beta1],
  deliveries: [],
  seenAt: SEEN,
  nowMs: NOW,
});
const betaCol = (multiBoss.projects ?? []).find((p) => p.name === 'Beta');
const alphaCol2 = (multiBoss.projects ?? []).find((p) => p.name === 'Alpha');
assert(betaCol?.isBossBusy === true && alphaCol2?.isBossBusy === false, 'only the boss project carries the boss mark');

// A desk-less worker (and a desk-less delivery) contributes NO column.
const noDeskBoard = canvasProjects({
  workers: [worker({ id: 'run:z', projectId: null }), alpha1],
  deliveries: [delivery({ id: 'd3', projectId: null })],
  seenAt: SEEN,
  nowMs: NOW,
});
assert(noDeskBoard.length === 1 && noDeskBoard[0]!.name === 'Alpha', 'desk-less rows never add a column');

// ── F. hit resolution ──────────────────────────────────────────────────────

assert(resolveCanvasSelection('run:s1', 'run:boss', '@boss', '@today') === 'run:s1', 'a crew hit selects that worker');
assert(resolveCanvasSelection('@boss', 'run:boss', '@boss', '@today') === 'run:boss', 'the boss sentinel maps to the boss worker id');
assert(resolveCanvasSelection('@boss', null, '@boss', '@today') === null, 'boss sentinel with no boss selects nothing');
assert(resolveCanvasSelection('@today', 'run:boss', '@boss', '@today') === null, 'the board is not a worker');
assert(resolveCanvasSelection(null, 'run:boss', '@boss', '@today') === null, 'a miss on empty floor clears the selection');

// ── G. surface constant ────────────────────────────────────────────────────

assert(OFFICE_CANVAS_MIN_WIDTH === 600, 'the narrow-screen switch point is pinned (REQ-204 §4.8)');

console.log('---');
console.log(passed + ' assertions passed');
