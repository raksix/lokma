/**
 * Office data-contract probe (REQ-204 slice 1) — run with:
 *   `bun src/components/office/office-view.test.ts` from `packages/lokma-web/web`.
 *
 * Plain asserts, no framework, no DOM (matches `loop-view.test.ts`'s shape).
 *
 * Subject: every honesty rule the contract stands on. Each rule gets a
 * DISCRIMINATING pair — cases that differ ONLY in the rule under test —
 * because the failure this file guards against is a rule that looks covered
 * while nothing actually depends on it.
 */
import {
  applyGatePending,
  applyGateSettled,
  applyRunEnd,
  applySessionsSnapshot,
  applyToolResult,
  applyToolStart,
  currentToolOf,
  deriveOfficeDeliveries,
  deriveOfficeWorkers,
  emptyOfficeLive,
  foldOfficeFrame,
  loopOutcomeOk,
  OFFICE_DETAIL_MAX,
  OFFICE_TOOL_HISTORY_CAP,
  officeLiveFor,
  officeStats,
  officeWorkerId,
  promptFirstLine,
  sortOfficeDeliveries,
  toolDetail,
  type OfficeLiveMap,
  type OfficeLoopRow,
  type OfficeSessionRow,
  type OfficeSources,
} from './office-view';
import { officeFrameOf, runEndOkFromDone } from '@/lib/office-frame';
import type { ServerMessage } from '@lokma/shared/protocol/ws';
import type { AuthProject } from '@/lib/api';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
  passed++;
  console.log('PASS: ' + label);
}

// ── fixtures ───────────────────────────────────────────────────────────────

function project(id: string, name: string, cwd: string): AuthProject {
  return { id, name, cwd, visibility: 'private', ownerId: 'u_owner', createdAt: '2026-09-01T00:00:00.000Z' };
}

const PROJECTS: AuthProject[] = [
  project('p_alpha', 'Alpha', '/mnt/apopic/lokma'),
  project('p_beta', 'Beta', '/mnt/apopic/other'),
  // A record with NO cwd is not a location: it must not claim everything.
  project('p_ghost', 'Ghost', ''),
];

function session(over: Partial<OfficeSessionRow> & { id: string }): OfficeSessionRow {
  return { cwd: '/mnt/apopic/lokma', title: 'Probe session', botId: null, running: true, ...over };
}

function loopRow(over: Partial<OfficeLoopRow> & { id: string }): OfficeLoopRow {
  return {
    name: 'loop ' + over.id,
    cwd: '/mnt/apopic/lokma',
    projectId: null,
    prompt: 'do the thing',
    status: 'running',
    lastRunStartedAt: null,
    lastRunOutcome: null,
    ...over,
  };
}

function sources(over: Partial<OfficeSources> = {}): OfficeSources {
  return { sessions: [], loops: [], projects: PROJECTS, live: {}, activeSessionId: null, ...over };
}

// ── A. no fabrication: idle sources produce NO workers/deliveries ──────────

assert(deriveOfficeWorkers(sources()).length === 0, 'no sources -> no workers');
assert(deriveOfficeDeliveries(sources()).length === 0, 'no sources -> no deliveries');

assert(
  deriveOfficeWorkers(sources({ sessions: [session({ id: 's_idle', running: false })] })).length === 0,
  'an idle session is NOT a worker',
);
assert(
  deriveOfficeWorkers(sources({ loops: [loopRow({ id: 'l_draft', status: 'draft' })] })).length === 0,
  'an armed-but-idle loop is NOT a worker',
);
assert(
  deriveOfficeWorkers(sources({ loops: [loopRow({ id: 'l_paused', status: 'paused' })] })).length === 0,
  'a paused loop is NOT a worker',
);

// ── B. run workers ─────────────────────────────────────────────────────────

const runWorkers = deriveOfficeWorkers(
  sources({ sessions: [session({ id: 's1', title: 'Fix the thing' })] }),
);
assert(runWorkers.length === 1, 'a running session is one worker');
assert(runWorkers[0].type === 'run' && runWorkers[0].status === 'working', 'run worker type/status');
assert(runWorkers[0].label === 'Fix the thing', 'run worker label is the session title');
assert(runWorkers[0].sessionId === 's1' && runWorkers[0].loopId === null, 'run worker ids');
assert(runWorkers[0].runId === null && runWorkers[0].agentId === null, 'run worker has NO invented run/agent id');
assert(runWorkers[0].startedAt === null, 'startedAt is null before any observation');
assert(
  runWorkers[0].currentTool === null && runWorkers[0].lastTools.length === 0,
  'no tools observed -> empty tool fields',
);

const deskMatch = deriveOfficeWorkers(sources({ sessions: [session({ id: 's1' })] }))[0];
assert(deskMatch.projectId === 'p_alpha' && deskMatch.projectBadge === 'Alpha', 'a run desk resolves by cwd');
const deskStray = deriveOfficeWorkers(sources({ sessions: [session({ id: 's2', cwd: '/mnt/nowhere' })] }))[0];
assert(
  deskStray.projectId === null && deskStray.projectBadge === 'no project',
  'an unknown cwd lands in the no-project bucket',
);

const bossy = deriveOfficeWorkers(
  sources({ sessions: [session({ id: 's1' }), session({ id: 's2' })], activeSessionId: 's2' }),
);
assert(bossy.find((w) => w.sessionId === 's2')?.isBoss === true, 'the active session is the boss');
assert(bossy.find((w) => w.sessionId === 's1')?.isBoss === false, 'other sessions are not the boss');

const untitled = deriveOfficeWorkers(sources({ sessions: [session({ id: 's7', title: '' })] }))[0];
assert(untitled.label === 's7' && untitled.task === null, 'an untitled session falls back to its id, task stays null');

// ── C. loop workers ────────────────────────────────────────────────────────

const loopWorkers = deriveOfficeWorkers(
  sources({
    loops: [loopRow({ id: 'l1', name: 'Docs sweep', lastRunStartedAt: '2026-10-18T10:00:00.000Z' })],
  }),
);
assert(loopWorkers.length === 1 && loopWorkers[0].type === 'loop-turn', 'a running loop is one loop-turn worker');
assert(loopWorkers[0].startedAt === '2026-10-18T10:00:00.000Z', 'loop startedAt is the REAL lastRunStartedAt');
assert(
  loopWorkers[0].currentTool === null && loopWorkers[0].lastTools.length === 0 && loopWorkers[0].sessionId === null,
  'loop workers carry no fabricated tool fields',
);

const orphanLoop = deriveOfficeWorkers(
  sources({ loops: [loopRow({ id: 'l2', projectId: 'p_gone', cwd: '/mnt/gone' })] }),
)[0];
assert(orphanLoop.projectId === null && orphanLoop.projectBadge === 'project missing', 'a deleted project stays visible as a badge');
assert(orphanLoop.status === 'working', 'a loop whose project vanished is still working');

const noProjectLoop = deriveOfficeWorkers(sources({ loops: [loopRow({ id: 'l3', cwd: '/mnt/nope' })] }))[0];
assert(noProjectLoop.projectBadge === 'no project', 'a loop outside every project says so');

// ── D. live tool folds (frames -> per-session state) ───────────────────────

let live: OfficeLiveMap = {};
live = applyToolStart(
  live,
  { sessionId: 's1', callId: 'c1', tool: 'run_command', input: { command: 'npm test', args: [] } },
  'T1',
);
const afterStart = officeLiveFor(live, 's1');
assert(afterStart.tools.length === 1 && afterStart.tools[0].running === true, 'a tool_start adds an in-flight row');
assert(afterStart.tools[0].detail === 'npm test', 'the row detail comes from the input');
assert(afterStart.toolCount === 1, 'the window counts every call');

const runWorkerLive = deriveOfficeWorkers(sources({ sessions: [session({ id: 's1' })], live }))[0];
assert(runWorkerLive.currentTool === 'run_command', 'currentTool is the in-flight tool');

live = applyToolStart(
  live,
  { sessionId: 's1', callId: 'c1', tool: 'run_command', input: { command: 'npm test' } },
  'T2',
);
const afterDup = officeLiveFor(live, 's1');
assert(afterDup.tools.length === 1 && afterDup.toolCount === 1, 'a resent tool_start never doubles the row');

live = applyToolResult(live, { sessionId: 's1', callId: 'c1', result: { ok: true }, isError: false });
assert(
  officeLiveFor(live, 's1').tools[0].running === false && officeLiveFor(live, 's1').tools[0].ok === true,
  'tool_result completes the row',
);

live = applyToolStart(live, { sessionId: 's1', callId: 'c2', tool: 'grep', input: { pattern: 'needle' } }, 'T3');
live = applyToolResult(live, { sessionId: 's1', callId: 'c2', result: null, isError: true });
assert(officeLiveFor(live, 's1').tools[0].ok === false, 'an errored result marks the row not-ok');

const beforeUnknown = officeLiveFor(live, 's1').tools.length;
live = applyToolResult(live, { sessionId: 's1', callId: 'nope', result: null, isError: false });
assert(officeLiveFor(live, 's1').tools.length === beforeUnknown, 'a result for an unseen call invents no row');

let many: OfficeLiveMap = {};
for (let i = 0; i < OFFICE_TOOL_HISTORY_CAP + 1; i++) {
  many = applyToolStart(
    many,
    { sessionId: 's9', callId: 'k' + i, tool: 'read_file', input: { path: 'f' + i } },
    'T',
  );
}
assert(officeLiveFor(many, 's9').tools.length === OFFICE_TOOL_HISTORY_CAP, 'the tool list stays capped at 20');
assert(officeLiveFor(many, 's9').toolCount === OFFICE_TOOL_HISTORY_CAP + 1, 'the COUNT is never capped (no undercount)');
assert(officeLiveFor(many, 's9').tools[0].callId === 'k20', 'newest tool first');

assert(currentToolOf(officeLiveFor(live, 's1')) === 'grep', 'with none in flight, currentTool falls back to the latest completed');

assert(toolDetail({ path: 'a.ts', command: 'npm test' }) === 'npm test', 'detail prefers command over path');
assert(toolDetail({ path: 'src/app.ts' }) === 'src/app.ts', 'detail falls back to path');
assert(toolDetail({ url: 'https://x.test' }) === 'https://x.test', 'detail reads url');
assert(toolDetail(null) === '' && toolDetail('hi') === '' && toolDetail(undefined) === '', 'a non-record input yields no detail');
assert(toolDetail({ blob: { deep: true } }) === '', 'an input with no scalar yields no detail');
assert(toolDetail({ path: 'a\nb' }) === 'a b', 'detail collapses whitespace to one line');
const longDetail = toolDetail({ command: 'x'.repeat(200) });
assert(longDetail.length === OFFICE_DETAIL_MAX && longDetail.endsWith('...'), 'a long detail is capped with an ellipsis');

// ── E. waiting = a gate observed pending ───────────────────────────────────

live = applyGatePending(live, 's1');
const waitingWorker = deriveOfficeWorkers(sources({ sessions: [session({ id: 's1' })], live }))[0];
assert(waitingWorker.status === 'waiting', 'a pending gate flips the worker to waiting');
assert(
  officeStats(deriveOfficeWorkers(sources({ sessions: [session({ id: 's1' })], live })), []).waiting === 1,
  'stats count the waiting worker',
);

live = applyGateSettled(live, 's1');
const settledWorker = deriveOfficeWorkers(sources({ sessions: [session({ id: 's1' })], live }))[0];
assert(settledWorker.status === 'working', 'settling the only gate returns the worker to working');

live = applyGateSettled(live, 's1');
assert(officeLiveFor(live, 's1').waiting === 0, 'settling with no pending gate never goes negative');

// ── F. snapshot windows + deliveries ───────────────────────────────────────

const W0 = '2026-10-18T08:00:00.000Z';
const W2 = '2026-10-18T08:05:00.000Z';
const W3 = '2026-10-18T09:00:00.000Z';
const W4 = '2026-10-18T09:10:00.000Z';

let windows: OfficeLiveMap = {};
windows = applySessionsSnapshot(windows, [{ id: 'w1', running: true }], W0);
assert(officeLiveFor(windows, 'w1').seenRunningAt === W0, 'a running snapshot opens the window');

windows = applyToolStart(windows, { sessionId: 'w1', callId: 't1', tool: 'write_file', input: { path: 'x.ts' } }, W0);
windows = applyToolResult(windows, { sessionId: 'w1', callId: 't1', result: {}, isError: false });
windows = applySessionsSnapshot(windows, [{ id: 'w1', running: false }], W2);
const closed1 = officeLiveFor(windows, 'w1');
assert(closed1.seenRunningAt === null && closed1.toolCount === 0, 'closing resets the open window');
assert(closed1.closed.length === 1, 'closing files the window as a delivery');

const deliveries1 = deriveOfficeDeliveries(
  sources({ sessions: [session({ id: 'w1', running: false })], live: windows }),
);
assert(deliveries1.length === 1, 'a closed window is one delivery');
assert(
  deliveries1[0].endedAt === W2 && deliveries1[0].startedAt === W0,
  'delivery window stamps come from the observations',
);
assert(deliveries1[0].toolCount === 1, 'delivery carries the observed tool count');
assert(deliveries1[0].ok === null, 'NO verdict observed -> delivery ok stays null (no invented success)');

let verdictMap: OfficeLiveMap = {};
verdictMap = applySessionsSnapshot(verdictMap, [{ id: 'w2', running: true }], '2026-10-18T10:00:00.000Z');
verdictMap = applyRunEnd(verdictMap, 'w2', false);
verdictMap = applySessionsSnapshot(verdictMap, [{ id: 'w2', running: false }], '2026-10-18T10:02:00.000Z');
const verdictDelivery = deriveOfficeDeliveries(
  sources({ sessions: [session({ id: 'w2', running: false })], live: verdictMap }),
)[0];
assert(verdictDelivery.ok === false, 'an observed error frame lands on the delivery');

windows = applySessionsSnapshot(windows, [{ id: 'w1', running: true }], W3);
const secondWindow = officeLiveFor(windows, 'w1');
assert(
  secondWindow.seenRunningAt === W3 && secondWindow.tools.length === 0 && secondWindow.toolCount === 0,
  'a new run opens a FRESH window',
);
assert(secondWindow.closed.length === 1, 'the previous delivery survives the new run');
windows = applySessionsSnapshot(windows, [{ id: 'w1', running: false }], W4);
assert(officeLiveFor(windows, 'w1').closed.length === 2, 'the second close files a second delivery');
const deliveries2 = deriveOfficeDeliveries(
  sources({ sessions: [session({ id: 'w1', running: false })], live: windows }),
);
assert(deliveries2.map((d) => d.endedAt).join(',') === W4 + ',' + W2, 'deliveries list newest window first');

let untouched: OfficeLiveMap = {};
untouched = applySessionsSnapshot(untouched, [{ id: 'idle1', running: false }], 'X0');
assert(untouched['idle1'] === undefined, 'an idle snapshot files nothing (no fabricated window)');
assert(
  deriveOfficeDeliveries(sources({ sessions: [session({ id: 'idle1', running: false })], live: untouched })).length === 0,
  'and yields no delivery',
);

// ── G. loop deliveries ─────────────────────────────────────────────────────

const okLoop = deriveOfficeDeliveries(
  sources({ loops: [loopRow({ id: 'ld1', status: 'done', lastRunOutcome: 'ok' })] }),
);
assert(okLoop.length === 1 && okLoop[0].ok === true, 'a done loop with ok outcome is an ok delivery');
assert(okLoop[0].toolCount === null, 'loops have no observable tool count (null, not 0)');

assert(loopOutcomeOk('empty') === null && loopOutcomeOk('aborted') === null, 'empty/aborted carry no ok/fail verdict');
assert(loopOutcomeOk('error') === false && loopOutcomeOk(null) === null, 'error is a fail; null stays null');
assert(
  deriveOfficeDeliveries(sources({ loops: [loopRow({ id: 'lp', status: 'paused', lastRunOutcome: 'aborted' })] })).length === 0,
  'a paused loop is NOT a delivery',
);
assert(
  deriveOfficeDeliveries(sources({ loops: [loopRow({ id: 'lr', status: 'done', lastRunOutcome: null })] })).length === 0,
  'done without a run outcome files nothing',
);

// ── H. ordering + stats ────────────────────────────────────────────────────

const orderSources = sources({
  sessions: [
    session({ id: 'a', title: 'Aaa' }),
    session({ id: 'b', title: 'Bbb' }),
    session({ id: 'c', title: 'Ccc' }),
    session({ id: 'd', title: 'Ddd' }),
  ],
  live: {
    a: { ...emptyOfficeLive(), seenRunningAt: '2026-10-18T09:00:00.000Z' },
    b: { ...emptyOfficeLive(), seenRunningAt: '2026-10-18T08:00:00.000Z', waiting: 1 },
    c: { ...emptyOfficeLive(), seenRunningAt: '2026-10-18T07:00:00.000Z' },
  },
});
const ordered = deriveOfficeWorkers(orderSources);
assert(ordered[0].sessionId === 'b' && ordered[0].status === 'waiting', 'waiting workers come first');
assert(ordered[1].sessionId === 'c' && ordered[2].sessionId === 'a', 'then the rest oldest-window-first');
assert(ordered[3].sessionId === 'd', 'a worker with no observed window sorts last');

const shifted = sortOfficeDeliveries([
  {
    id: 'old',
    type: 'run',
    projectId: null,
    projectBadge: null,
    label: 'old',
    startedAt: null,
    endedAt: '2026-10-18T08:05:00.000Z',
    ok: null,
    toolCount: 0,
  },
  {
    id: 'new',
    type: 'run',
    projectId: null,
    projectBadge: null,
    label: 'new',
    startedAt: null,
    endedAt: '2026-10-18T09:10:00.000Z',
    ok: null,
    toolCount: 0,
  },
]);
assert(shifted[0].id === 'new', 'sortOfficeDeliveries orders by endedAt (input order cannot save a stale row)');

const stats = officeStats(ordered, okLoop);
assert(stats.working === 4 && stats.waiting === 1 && stats.delivered === 1, 'stats are measured from the rows');

// ── I. id + task-line helpers ──────────────────────────────────────────────

assert(officeWorkerId('run', 's1') === 'run:s1', 'run ids are namespaced');
assert(officeWorkerId('loop-turn', 'l1') === 'loop:l1', 'loop ids are namespaced');
assert(officeWorkerId('run', 'x') !== officeWorkerId('loop-turn', 'x'), 'a run and a loop never share a canvas id');

assert(promptFirstLine('\n\n  Ship the docs  \nmore') === 'Ship the docs', 'the task line is the first non-empty trimmed line');
assert(promptFirstLine('') === null && promptFirstLine('  \n ') === null, 'a blank prompt has no task line');
const longTask = promptFirstLine('y'.repeat(400));
assert(longTask !== null && longTask.length === 200 && longTask.endsWith('...'), 'a long task line is capped');

// ── J. bridged office frames (REQ-204 slice 3) ─────────────────────────────

// A gate is settled by the NEXT observable event of that session — without
// this rule an approved gate would pin `waiting` on forever.
const gated = foldOfficeFrame({}, { kind: 'gate', sessionId: 's1' }, 'T1');
assert(officeLiveFor(gated, 's1').waiting === 1, 'a gate frame raises the pending count');
const settled = foldOfficeFrame(
  gated,
  { kind: 'tool_start', sessionId: 's1', callId: 'c1', tool: 'read', input: { path: 'a' } },
  'T2',
);
assert(officeLiveFor(settled, 's1').waiting === 0, 'the next tool start settles the observed gate');
assert(officeLiveFor(settled, 's1').tools.length === 1, 'and that same frame still records its tool row');
// Discrimination: the SAME frame with no pending gate still records the row —
// only the settle half differs, so this pair proves the settle is real.
const noGate = foldOfficeFrame({}, { kind: 'tool_start', sessionId: 's1', callId: 'c2', tool: 'read', input: {} }, 'T3');
assert(
  officeLiveFor(noGate, 's1').waiting === 0 && officeLiveFor(noGate, 's1').tools.length === 1,
  'tool start with no gate: row yes, waiting untouched',
);
// A tool_result for a call this pane never saw start is dropped, not invented.
const orphan = foldOfficeFrame({}, { kind: 'tool_result', sessionId: 's1', callId: 'never', result: {}, isError: false }, 'T4');
assert(officeLiveFor(orphan, 's1').tools.length === 0, 'an orphan tool_result invents nothing');
// Run end records the observed verdict and clears any pending gate.
const ended = foldOfficeFrame(gated, { kind: 'run_end', sessionId: 's1', ok: false }, 'T5');
assert(
  officeLiveFor(ended, 's1').lastRunOk === false && officeLiveFor(ended, 's1').waiting === 0,
  'run end carries the verdict and clears waiting',
);

// done -> verdict: only complete/error are verdicts; aborted stays null.
assert(runEndOkFromDone('complete') === true, 'done complete is an ok delivery');
assert(runEndOkFromDone('error') === false, 'done error is a failed delivery');
assert(runEndOkFromDone('aborted') === null, 'an aborted run claims no verdict');
// Wire mapping: only office-relevant frames cross; an unattributable error is
// dropped rather than filed against every worker.
assert(
  officeFrameOf({ type: 'text_delta', delta: 'x', sessionId: 's1' } as ServerMessage) === null,
  'chat-only frames do not cross the office bridge',
);
assert(officeFrameOf({ type: 'error', message: 'boom' } as ServerMessage) === null, 'an unattributable error is dropped');
const gateFrame = officeFrameOf(
  { type: 'permission_request', requestId: 'r1', tool: 'terminal', description: 'run it', sessionId: 's7' } as ServerMessage,
);
assert(
  gateFrame !== null && gateFrame.kind === 'gate' && gateFrame.sessionId === 's7',
  'a permission request becomes a gate frame for that session',
);

console.log('---');
console.log(passed + ' assertions passed');



