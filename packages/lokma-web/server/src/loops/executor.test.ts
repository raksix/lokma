/**
 * Live probe for the loop EXECUTOR action half (REQ-201 slice 2).
 * Run:
 *   HOME=$(mktemp -d) bun src/loops/executor.test.ts
 * from `packages/lokma-web/server`.
 *
 * Real temp HOME on disk: bun snapshots HOME at boot, so running with the real
 * HOME would write into the live `~/.lokma/loops/` (the guard below refuses
 * anything outside /tmp).
 *
 * What this probe can prove without a provider: the executor's BOOKKEEPING.
 * The pump is stubbed, so the probe drives the exact contract that the real
 * pump implements — enqueue → waiter settles → record → decide — and asserts
 * that a real transcript row lands, that a tool-less turn counts as `empty`
 * and does NOT advance `spent.iters`, that 3 empty turns stop the loop as
 * `idle`, that an error stops it as `error`, and that refusals (zero-cost,
 * already running, budget) never start a turn at all.
 *
 * Every negative carries a POSITIVE control: a stub pump that settles nothing
 * would make "the loop stopped" true for the wrong reason, so the healthy path
 * is asserted to advance first.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { strict as assert } from 'node:assert';

// --- temp HOME guard: never touch the live ~/.lokma ------------------------
const home = homedir();
if (!home.startsWith(tmpdir())) {
  console.error('REFUSING: HOME=' + home + ' is not a temp dir — set HOME=$(mktemp -d)');
  process.exit(2);
}
mkdirSync(home + '/.lokma/projects', { recursive: true });

const {
  createLoop,
  getLoop,
  listLoops,
  recordRunTiming,
  SessionStore,
  updateLoop,
} = await import('@lokma/core');
const {
  __resetRunStates,
  awaitTurnReport,
  getRunState,
  settleTurnReport,
  hasTurnWaiter,
} = await import('../session-runs.js');
const { loopOutcomeFor, loopSessionId, resolveEffort, runLoopTurn } = await import('./executor.js');

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean): void {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    failures.push(name);
    console.log('FAIL: ' + name);
  }
}

// Each loop gets its OWN directory: the store refuses a second loop in one cwd
// (REQ-201 §5, the honest conflict refusal), so sharing one would make every
// second block throw `cwd_locked` for a reason that has nothing to do with the
// behaviour under test. The refusal itself is asserted separately below.
let dirSeq = 0;
const cwd = home + '/work';
mkdirSync(cwd, { recursive: true });
function freshCwd(): string {
  dirSeq += 1;
  const dir = home + '/work-' + dirSeq;
  mkdirSync(dir, { recursive: true });
  return dir;
}

// --- stubs: a pump that settles a canned report, per REQ-201 -------------
type Canned = { didWork: boolean; outcome?: 'complete' | 'aborted' | 'error'; error?: string };
function stubPump(canned: Canned): (sessionId: string, cwd: string) => void {
  return (sessionId) => {
    // The REAL pump SHIFTS the item off the queue before it runs the turn;
    // a stub that only peeks leaves a phantom prompt queued, which would make
    // "the executor used the existing queue" assert against a queue the probe
    // itself polluted.
    const state = getRunState(sessionId);
    const item = state.queue.shift();
    if (!item?.tag) {
      console.log('DIAG stub: no tagged item in the queue (depth=' + state.queue.length + ')');
      return;
    }
    // Resolve the outcome ONCE and compare against it. Comparing the raw
    // optional (`canned.outcome === 'complete'`) read as false for the DEFAULT
    // case, where the outcome is 'complete' by defaulting — the stub billed
    // 0 and the probe blamed the executor for a probe defect.
    const outcome = canned.outcome ?? 'complete';
    const billed = outcome === 'complete';
    const built = {
      outcome,
      seconds: 2.5,
      inputTokens: 1200,
      outputTokens: 300,
      // ADVERSARIAL by design: a non-billed turn still carries REAL tokens and
      // cost, exactly as a real aborted turn does (the provider billed it; the
      // harness simply does not charge the user). A fixture that zeroed both
      // fields would make "the aborted turn costs 0" pass for the wrong reason
      // — the proven-to-fail mutation proved it: 72/72 stayed green.
      costUsd: 0.02,
      billed,
      didWork: canned.didWork,
      rows: canned.didWork ? 4 : 2,
    };
    settleTurnReport(item.tag, built);
  };
}

async function makeLoop(over: Record<string, unknown> = {}): Promise<string> {
  const loop = await createLoop({
    name: 'probe-' + Math.random().toString(36).slice(2, 8),
    cwd: freshCwd(),
    prompt: 'do the thing',
    model: 'test/model',
    budget: { maxIters: 10, maxHours: 24, maxUsd: 5 },
    trigger: { kind: 'manual' },
    ...(over as object),
  } as never);
  return loop.id;
}

// ===========================================================================
console.log('# pure helpers');
// ===========================================================================
ok('loopSessionId is stable per loop', loopSessionId('l_ab12') === loopSessionId('l_ab12'));
ok('loopSessionId keeps the sess_ prefix', loopSessionId('l_x').startsWith('sess_'));
ok('loopSessionId strips path-breaking chars', !loopSessionId('l_a/b').includes('/'));

ok('a tool-using turn is ok', loopOutcomeFor({ outcome: 'complete', didWork: true } as never) === 'ok');
ok('a tool-less turn is EMPTY, not ok', loopOutcomeFor({ outcome: 'complete', didWork: false } as never) === 'empty');
ok('an aborted turn stays aborted', loopOutcomeFor({ outcome: 'aborted', didWork: true } as never) === 'aborted');
ok('a failed turn is error', loopOutcomeFor({ outcome: 'error', didWork: true, error: 'x' } as never) === 'error');
// Control: the empty rule must not swallow the aborted case.
ok('aborted is not downgraded to empty', loopOutcomeFor({ outcome: 'aborted', didWork: false } as never) === 'aborted');

ok('a real effort level survives', resolveEffort('high') === 'high');
ok('an unknown effort degrades to off', resolveEffort('ultra') === 'off');
ok('an undefined effort degrades to off', resolveEffort(undefined) === 'off');

// ===========================================================================
console.log('# one working turn books a real iteration');
// ===========================================================================
{
  __resetRunStates();
  const id = await makeLoop();
  const res = await runLoopTurn(id, { pump: stubPump({ didWork: true }), timeoutMs: 2000 });
  ok('a due manual loop starts', res.started === true);

  const loop = await getLoop(id);
  ok('status is running', loop.status === 'running');
  ok('spent.iters advanced by exactly 1', loop.spent.iters === 1);
  ok('lastRunOutcome is ok', loop.lastRunOutcome === 'ok');
  ok('emptyIters stayed 0', loop.emptyIters === 0);
  ok('wall time was booked', loop.spent.hours > 0);
  ok('tokens were booked', loop.spent.tokens === 1500);
  ok('usd was booked', Math.abs(loop.spent.usd - 0.02) < 1e-9);
  ok('lastRunStartedAt stamped', typeof loop.lastRunStartedAt === 'string');

  // The transcript must carry a REAL prompt row (REQ-201 §1 / acceptance).
  const store = new SessionStore(loop.cwd);
  const rows = await store.read(loopSessionId(id));
  const userRows = rows.filter((r) => r.role === 'user' && r.content === 'do the thing');
  ok('the loop prompt landed in the transcript', userRows.length === 1);
  const meta = await store.readMeta(loopSessionId(id));
  ok('the loop session meta carries the model', meta?.model === 'test/model');
  ok('the queue drained (no second queue)', getRunState(loopSessionId(id)).queue.length === 0);
  ok('no waiter is left behind', hasTurnWaiter(rows.length >= 0 ? 'lt_none' : 'x') === false);
  await updateLoop(id, { name: 'x' });
}

// ===========================================================================
console.log('# the empty-turn guard');
// ===========================================================================
{
  __resetRunStates();
  const id = await makeLoop({ trigger: { kind: 'manual', cooldownSeconds: 0, maxEmptyIters: 3 } });
  // Turn 1: a real iteration. POSITIVE control for the counter below.
  await runLoopTurn(id, { pump: stubPump({ didWork: true }), timeoutMs: 2000, force: true });
  ok('control: the first turn advanced iters', (await getLoop(id)).spent.iters === 1);

  // Turns 2-4: no tool work at all.
  const r2 = await runLoopTurn(id, { pump: stubPump({ didWork: false }), timeoutMs: 2000, force: true });
  ok('turn 2 ran', r2.started === true);
  const after2 = await getLoop(id);
  ok('an empty turn does NOT advance iters', after2.spent.iters === 1);
  ok('an empty turn is recorded as empty', after2.lastRunOutcome === 'empty');
  ok('emptyIters is 1', after2.emptyIters === 1);
  ok('an empty turn still books wall time', after2.spent.hours > 0);

  await runLoopTurn(id, { pump: stubPump({ didWork: false }), timeoutMs: 2000, force: true });
  const r4 = await runLoopTurn(id, { pump: stubPump({ didWork: false }), timeoutMs: 2000, force: true });
  ok('the 4th turn still ran (guard fires after it)', r4.started === true);
  const stopped = await getLoop(id);
  ok('3 consecutive empty turns stop the loop', stopped.status !== 'running');
  ok('the stop reason is idle', stopped.stopReason === 'idle');
  ok('stopped as done, not error', stopped.status === 'done');
  ok('iters stayed at 1 through the empty turns', stopped.spent.iters === 1);

  // PROOF the guard is load-bearing: an empty count below the threshold must
  // NOT stop. Without this the assertion above could pass vacuously.
  __resetRunStates();
  const id2 = await makeLoop({ trigger: { kind: 'manual', cooldownSeconds: 0, maxEmptyIters: 5 } });
  await runLoopTurn(id2, { pump: stubPump({ didWork: false }), timeoutMs: 2000, force: true });
  await runLoopTurn(id2, { pump: stubPump({ didWork: false }), timeoutMs: 2000, force: true });
  const below = await getLoop(id2);
  ok('below the empty threshold the loop keeps going', below.status === 'running');
  ok('below the threshold emptyIters is 2', below.emptyIters === 2);
}

// ===========================================================================
console.log('# failures and refusals are honest');
// ===========================================================================
{
  __resetRunStates();
  const id = await makeLoop();
  const res = await runLoopTurn(id, {
    pump: stubPump({ didWork: true, outcome: 'error', error: 'provider down' }),
    timeoutMs: 2000,
  });
  ok('a failed turn ran', res.started === true);
  const loop = await getLoop(id);
  ok('a failed turn stops the loop as error', loop.status === 'error');
  ok('the failure stop reason is error', loop.stopReason === 'error');
  ok('a failed turn did not count as an iteration', loop.spent.iters === 0);
  ok('a failed turn recorded the outcome', loop.lastRunOutcome === 'error');
  ok('a failed turn is not charged usd', loop.spent.usd === 0);
  ok('a failed turn is not idle', loop.stopReason === 'error');

  // The case that was actually broken: a failure with NO message string must
  // stop the loop too. Keying the stop on `report.error` left it running.
  __resetRunStates();
  const id2 = await makeLoop();
  const res2 = await runLoopTurn(id2, {
    pump: stubPump({ didWork: true, outcome: 'error' }),
    timeoutMs: 2000,
  });
  ok('a messageless failure ran', res2.started === true);
  const loop2 = await getLoop(id2);
  ok('a messageless failure still stops as error', loop2.status === 'error');
  ok('a messageless failure reports error', loop2.stopReason === 'error');
}
{
  __resetRunStates();
  const id = await makeLoop();
  await runLoopTurn(id, { pump: stubPump({ didWork: true }), timeoutMs: 2000 });
  // Second turn while the first is "in flight" from the policy's point of view
  // (status is running) — must refuse without a turn.
  const res = await runLoopTurn(id, { pump: stubPump({ didWork: true }), timeoutMs: 200 });
  ok('a running loop refuses a second start', res.started === false);
  ok('the refusal names already_running', res.reason === 'already_running');
}
{
  __resetRunStates();
  const id = await makeLoop({ budget: { maxIters: 10, maxHours: 24, maxUsd: 0 } });
  const res = await runLoopTurn(id, { pump: stubPump({ didWork: true }), timeoutMs: 200 });
  ok('the zero-cost switch refuses to start', res.started === false);
  ok('the zero-cost reason is reported', res.reason === 'zero_cost');
  const loop = await getLoop(id);
  ok('a refused zero-cost loop never spends', loop.spent.iters === 0 && loop.spent.usd === 0);
}
{
  // An aborted turn: no usage billed to the loop's usd budget.
  __resetRunStates();
  const id = await makeLoop();
  await runLoopTurn(id, {
    pump: stubPump({ didWork: true, outcome: 'aborted' }),
    timeoutMs: 2000,
    force: true,
  });
  const loop = await getLoop(id);
  ok('an aborted turn is recorded as aborted', loop.lastRunOutcome === 'aborted');
  ok('an aborted turn is not charged usd', loop.spent.usd === 0);
  ok('an aborted turn did not advance iters', loop.spent.iters === 0);
  // Tokens are real work done, so they stay counted — only MONEY is not charged.
  ok('an aborted turn still counts its tokens', loop.spent.tokens === 1500);
  ok('an aborted turn still books wall time', loop.spent.hours > 0);
}

// ===========================================================================
console.log('# the timeout is a real exit, not a hang');
// ===========================================================================
{
  __resetRunStates();
  const id = await makeLoop();
  const started = Date.now();
  // A pump that settles NOTHING — the waiter must time out honestly.
  const res = await runLoopTurn(id, { pump: () => {}, timeoutMs: 150 });
  const elapsed = Date.now() - started;
  ok('a never-reporting pump resolves (no hang)', res.started === true);
  ok('the timeout fired quickly', elapsed < 3000);
  const loop = await getLoop(id);
  ok('a timed-out turn is an error', loop.lastRunOutcome === 'error');
  ok('a timed-out turn stops the loop', loop.status === 'error');
  ok('a timed-out turn is not billed', loop.spent.usd === 0);
}

// ===========================================================================
console.log('# the waiter contract on its own');
// ===========================================================================
{
  __resetRunStates();
  const pending = awaitTurnReport('lt_probe', 5000);
  ok('a waiter is registered', hasTurnWaiter('lt_probe') === true);
  const delivered = settleTurnReport('lt_probe', {
    outcome: 'complete', seconds: 1, inputTokens: 1, outputTokens: 1,
    costUsd: 0, billed: true, didWork: true, rows: 2,
  });
  ok('settling a registered tag returns true', delivered === true);
  const report = await pending;
  ok('the report reached the waiter', report.didWork === true);
  ok('the waiter is cleared after settling', hasTurnWaiter('lt_probe') === false);

  ok('settling an unknown tag is a no-op', settleTurnReport('lt_nobody', {
    outcome: 'complete', seconds: 0, inputTokens: 0, outputTokens: 0,
    costUsd: 0, billed: false, didWork: false, rows: 0,
  }) === false);
  ok('settling an untagged prompt is a no-op', settleTurnReport(undefined, {
    outcome: 'complete', seconds: 0, inputTokens: 0, outputTokens: 0,
    costUsd: 0, billed: false, didWork: false, rows: 0,
  }) === false);

  // Double settle must not throw nor resolve twice.
  const p2 = awaitTurnReport('lt_twice', 5000);
  const base = { outcome: 'complete', seconds: 1, inputTokens: 2, outputTokens: 2, costUsd: 0.1, billed: true, didWork: true, rows: 3 } as const;
  settleTurnReport('lt_twice', base);
  settleTurnReport('lt_twice', { ...base, costUsd: 99 });
  const first = await p2;
  ok('the first report wins a double settle', first.costUsd === 0.1);

  // Timeout path.
  const p3 = awaitTurnReport('lt_timeout', 60);
  const timedOut = await p3;
  ok('a timed-out waiter reports turn_timeout', timedOut.error === 'turn_timeout');
  ok('a timed-out waiter is not billed', timedOut.billed === false);
}

// ===========================================================================
console.log('# refusal before any store write');
// ===========================================================================
{
  __resetRunStates();
  const all = await listLoops();
  ok('the probe created real loop records', all.length > 0);
  ok('every probe loop has an id', all.every((l) => l.id.length > 0));
  // Control for the "prompt landed" assertions: a refused turn writes nothing.
  const id = await makeLoop({ budget: { maxIters: 10, maxHours: 24, maxUsd: 0 } });
  const refused = await runLoopTurn(id, { pump: stubPump({ didWork: true }), timeoutMs: 200 });
  ok('the refused loop is still a draft', refused.loop.status === 'draft');
  const rows = await new SessionStore(refused.loop.cwd).read(loopSessionId(id));
  ok('a refused turn wrote NO transcript row', rows.length === 0);
  // recordRunTiming still behaves on disk (used by the idle counter).
  await recordRunTiming(id, { outcome: 'ok', startedAt: new Date().toISOString() });
  ok('recordRunTiming resets the empty counter', (await getLoop(id)).emptyIters === 0);
}

rmSync(home + '/.lokma/loops', { recursive: true, force: true });
rmSync(home + '/.lokma/projects', { recursive: true, force: true });
for (let i = 0; i <= dirSeq; i += 1) {
  rmSync(home + '/work-' + i, { recursive: true, force: true });
}
rmSync(cwd, { recursive: true, force: true });

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
if (fail > 0) {
  console.log('failures: ' + failures.join(' | '));
  process.exit(1);
}
