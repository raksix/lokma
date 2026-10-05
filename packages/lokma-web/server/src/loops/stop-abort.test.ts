/**
 * Live probe for loop STOP / ABORT / BOOT RECOVERY (REQ-201 slice 5, kapsam 6).
 * Run:
 *   HOME=$(mktemp -d) bun src/loops/stop-abort.test.ts
 * from `packages/lokma-web/server`.
 *
 * Why these three live together: they are the three ways a loop stops touching a
 * user's directory, and each has exactly one honest answer.
 *
 *  - `requestStop` must NOT cut the turn in flight (half-written files, lost
 *    billing). It records the request; the executor pauses AFTER the turn books
 *    its real usage. A probe that only calls `requestStop` proves nothing about
 *    the pause — so the deferred case here runs a REAL turn through `runLoopTurn`
 *    with a pump that presses Stop mid-turn.
 *  - `abortLoop` must cut it. The cut itself needs the session's AbortController
 *    (the route's job), so this probe asserts the store's half — that the route
 *    can learn a turn existed — plus the full route, which owns the controller.
 *  - `resumeLoopsOnBoot` must tell an ARMED loop (nothing in flight) apart from a
 *    loop whose turn died with the process. Collapsing the two is the bug: one
 *    of them has real work to settle and the other has nothing to settle.
 *
 * Every negative carries a positive control, so "the loop stopped" can never be
 * true for a reason the probe did not intend.
 */
import { mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';

// --- temp HOME guard: never touch the live ~/.lokma ------------------------
const home = homedir();
if (!home.startsWith(tmpdir())) {
  console.error('REFUSING: HOME=' + home + ' is not a temp dir — set HOME=$(mktemp -d)');
  process.exit(2);
}
mkdirSync(home + '/.lokma/projects', { recursive: true });

const {
  abortLoop,
  createLoop,
  getLoop,
  markTurnDispatched,
  readLedger,
  requestStop,
  resumeLoopsOnBoot,
  setLoopStatus,
  stopLoop,
} = await import('@lokma/core');
const { __resetRunStates, getRunState, settleTurnReport } = await import('../session-runs.js');
const { loopSessionId, loopTurnInFlight, runLoopTurn } = await import('./executor.js');
const Fastify = (await import('fastify')).default;
const { loopRoutes } = await import('../routes/loops.js');

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean): void {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    console.log('FAIL: ' + name);
  }
}

let dirSeq = 0;
function freshCwd(): string {
  dirSeq += 1;
  const dir = home + '/work-' + dirSeq;
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function makeLoop(over: Record<string, unknown> = {}): Promise<string> {
  const loop = await createLoop({
    name: 'stop-' + Math.random().toString(36).slice(2, 8),
    cwd: freshCwd(),
    prompt: 'do the thing',
    model: 'test/model',
    budget: { maxIters: 10, maxHours: 24, maxUsd: 5 },
    trigger: { kind: 'manual', cooldownSeconds: 0 },
    ...(over as object),
  } as never);
  return loop.id;
}

/**
 * A pump that presses Stop in the middle of the turn, then settles it as a
 * real completed turn. This is the deferred-stop path end to end: the stop
 * arrives while work is in flight, and the turn must still book.
 */
function pumpThatStopsMidTurn(loopId: string): (sessionId: string, cwd: string) => void {
  return (sessionId) => {
    const state = getRunState(sessionId);
    const item = state.queue.shift();
    if (!item?.tag) return;
    void requestStop(loopId);
    settleTurnReport(item.tag, {
      outcome: 'complete',
      seconds: 1.5,
      inputTokens: 900,
      outputTokens: 100,
      costUsd: 0.03,
      billed: true,
      didWork: true,
      rows: 5,
    });
  };
}

// ===========================================================================
console.log('# a stop with a turn in flight defers instead of cutting');
// ===========================================================================
{
  __resetRunStates();
  const id = await makeLoop();
  await setLoopStatus(id, 'running');
  // A turn in flight, marked the way the executor marks it.
  await markTurnDispatched(id, new Date().toISOString());

  const { loop, deferred } = await requestStop(id);
  ok('a stop during a turn is DEFERRED', deferred === true);
  ok('the loop is still running while the turn finishes', loop.status === 'running');
  ok('the stop request is recorded', loop.stopRequested === true);
  ok('no stopReason is claimed yet', loop.stopReason === null);
  // The negative control for the block below: the loop really was still busy,
  // so the pause that follows can only come from the deferred request being
  // applied after the turn — not from a loop that was never running.
  ok('CONTROL: a turn really is in flight before the turn settles', loop.inFlightSince !== null);
}

// ===========================================================================
console.log('# the deferred stop is applied AFTER the turn books its real usage');
// ===========================================================================
{
  // The realistic ordering, and it is the ONLY correct one: the executor
  // dispatches the turn, the pump presses Stop while that turn is mid-flight,
  // and the pause lands once the turn has settled. (Starting a SECOND turn after
  // a deferred stop is refused as `already_running` — which is the truth, and
  // the reason this cannot be modelled by marking a turn and then running one.)
  __resetRunStates();
  const id = await makeLoop();
  const turned = await runLoopTurn(id, { pump: pumpThatStopsMidTurn(id), timeoutMs: 2000 });
  ok('the deferred turn actually ran', turned.started === true);
  const settled = await getLoop(id);
  ok('the loop is paused once the turn settled', settled.status === 'paused');
  ok('the pause is recorded as a user stop', settled.stopReason === 'stopped');
  // The load-bearing half: the turn was NOT cut, so its real usage was booked.
  ok('the finished turn still counted as an iteration', settled.spent.iters === 1);
  ok('the finished turn still booked its tokens', settled.spent.tokens === 1000);
  ok('the finished turn still booked its usd', Math.abs(settled.spent.usd - 0.03) < 1e-9);
  ok('the turn outcome was ok, not aborted', settled.lastRunOutcome === 'ok');
  ok('the in-flight stamp was cleared', settled.inFlightSince === null);
  const ledger = await readLedger(id);
  ok('the ledger records the finished turn', ledger.includes('turn completed with tool work'));
  // A loop that stopped must not run again without being resumed.
  const again = await runLoopTurn(id, { pump: completingPump(), timeoutMs: 2000 });
  ok('a stopped loop does not start another turn', again.started === false);
  ok('a stopped loop refuses for the paused state', again.reason !== '');
}

// ===========================================================================
console.log('# a stop with NOTHING in flight pauses immediately');
// ===========================================================================
{
  __resetRunStates();
  const id = await makeLoop();
  await setLoopStatus(id, 'running');
  const { loop, deferred } = await requestStop(id);
  ok('an idle-loop stop is immediate, not deferred', deferred === false);
  ok('an idle-loop stop pauses the loop', loop.status === 'paused');
  ok('an idle-loop stop records the reason', loop.stopReason === 'stopped');
  ok('an idle-loop stop does not set the request flag', loop.stopRequested === false);

  // Idempotent: pressing Stop twice must not throw or invent state.
  const again = await requestStop(id);
  ok('stopping a paused loop is idempotent', again.loop.status === 'paused');

  // Refusals stay refusals — and each names its code so a silent no-op cannot
  // pass as a refusal.
  const draft = await makeLoop();
  ok('a draft loop refuses to stop', (await loopErrorCode(() => stopLoop(draft))) === 'bad_transition');
  ok('a draft loop refuses to abort', (await loopErrorCode(() => abortLoop(draft))) === 'bad_transition');

  // A loop that finished its budget is terminal: stopping it is `loop_terminal`,
  // never a silent success.
  const spent = await makeLoop({ budget: { maxIters: 1, maxHours: 24, maxUsd: 5 } });
  await runLoopTurn(spent, { pump: completingPump(), timeoutMs: 2000 });
  // CONTROL: this loop must really have run, otherwise the terminal refusal below
  // would be true for a different reason than the one under test.
  ok('CONTROL: the terminal loop really ran a turn', (await getLoop(spent)).spent.iters === 1);
  await runLoopTurn(spent, { pump: completingPump(), timeoutMs: 2000, force: true });
  ok('CONTROL: the control loop is terminal', (await getLoop(spent)).status === 'done');
  ok('a terminal loop refuses to stop', (await loopErrorCode(() => stopLoop(spent))) === 'loop_terminal');
  ok('a terminal loop refuses to abort', (await loopErrorCode(() => abortLoop(spent))) === 'loop_terminal');
}

// ===========================================================================
console.log('# an abort cuts the in-flight turn, a stop does not');
// ===========================================================================
{
  __resetRunStates();
  const id = await makeLoop();
  await setLoopStatus(id, 'running');
  ok('an armed loop reports no turn in flight', loopTurnInFlight(await getLoop(id)) === false);

  // Nothing in flight: abort must NOT claim it cut a turn that never existed.
  const idle = await abortLoop(id);
  ok('aborting an idle loop cuts nothing', idle.cutTurn === false);
  ok('aborting an idle loop still pauses it', idle.loop.status === 'paused');

  // Turn in flight: the store reports the truth, the route does the cut.
  const id2 = await makeLoop();
  await setLoopStatus(id2, 'running');
  await markTurnDispatched(id2, new Date().toISOString());
  ok('a dispatched loop reports a turn in flight', loopTurnInFlight(await getLoop(id2)) === true);
  const cut = await abortLoop(id2);
  ok('aborting with a turn in flight reports the cut', cut.cutTurn === true);
  ok('the aborted loop is paused', cut.loop.status === 'paused');
  ok('the aborted loop does not defer', cut.loop.stopRequested === false);

  // Control: a stop on the SAME state defers — proving the difference is the
  // verb, not the loop.
  const id3 = await makeLoop();
  await setLoopStatus(id3, 'running');
  await markTurnDispatched(id3, new Date().toISOString());
  const stopped = await requestStop(id3);
  ok('CONTROL: stop with a turn in flight defers where abort cuts', stopped.deferred === true);
}

// ===========================================================================
console.log('# the abort route really cuts the turn through the AbortController');
// ===========================================================================
{
  __resetRunStates();
  const id = await makeLoop();
  await setLoopStatus(id, 'running');
  await markTurnDispatched(id, new Date().toISOString());

  // A stand-in for the agent loop's controller: aborting it is what makes a real
  // turn die, so the route's `state.abort?.abort()` must reach this exact object.
  const controller = new AbortController();
  let cut = false;
  controller.signal.addEventListener('abort', () => {
    cut = true;
  });
  getRunState(loopSessionId(id)).abort = controller;

  const app = Fastify({ logger: false });
  await loopRoutes(app);
  const res = await app.inject({ method: 'POST', url: '/api/loops/' + id + '/abort' });
  ok('the abort route answers 200', res.statusCode === 200);
  const body = JSON.parse(res.body) as { loop: { status: string }; cutTurn: boolean };
  ok('the route reports the cut', body.cutTurn === true);
  ok('the route paused the loop', body.loop.status === 'paused');
  ok('the real turn controller was aborted', cut === true);
  getRunState(loopSessionId(id)).abort = null;
  await app.close();
}

// ===========================================================================
console.log('# boot recovery tells an ARMED loop from a loop that lost its turn');
// ===========================================================================
{
  __resetRunStates();
  // (a) Armed: `running`, nothing in flight. Nothing to settle.
  const armed = await makeLoop();
  await setLoopStatus(armed, 'running');
  const armedNotes = await resumeLoopsOnBoot();
  const armedAfter = await getLoop(armed);
  ok('CONTROL: an armed loop is still running after boot', armedAfter.status === 'running');
  ok('CONTROL: an armed loop keeps its measurements', armedAfter.spent.iters === 0);
  ok('an armed loop is reported', armedNotes.some((n) => n.includes(armed)));

  // (b) Interrupted: `running` with a turn that died with the process.
  const dead = await makeLoop();
  await setLoopStatus(dead, 'running');
  await markTurnDispatched(dead, '2026-10-03T10:00:00.000Z');
  await resumeLoopsOnBoot();
  const deadAfter = await getLoop(dead);
  ok('an interrupted loop stays running for the next tick', deadAfter.status === 'running');
  ok('an interrupted turn is settled as aborted', deadAfter.lastRunOutcome === 'aborted');
  ok('an interrupted turn earns NO iteration credit', deadAfter.spent.iters === 0);
  ok('the in-flight stamp is cleared so it is not retried', deadAfter.inFlightSince === null);
  ok('the in-flight stamp is a real timestamp, not a sentinel', deadAfter.lastRunStartedAt === '2026-10-03T10:00:00.000Z');
  const deadLedger = await readLedger(dead);
  ok('the ledger admits the interruption', deadLedger.includes('interrupted by a server restart'));
  ok('the ledger does not invent usage', deadLedger.includes('no usage recovered'));

  // (c) The zero-cost off switch wins over recovery.
  const free = await makeLoop({ budget: { maxIters: 10, maxHours: 24, maxUsd: 0 } });
  await setLoopStatus(free, 'running');
  const freeNotes = await resumeLoopsOnBoot();
  const freeAfter = await getLoop(free);
  ok('a zero-cost loop is NOT resumed', freeAfter.status === 'paused');
  ok('a zero-cost loop explains why', freeAfter.stopReason === 'budget');
  ok('a zero-cost loop is reported honestly', freeNotes.some((n) => n.includes('zero cost')));

  // (d) Terminal and draft loops are untouched — recovery is not a reset button.
  const done = await makeLoop();
  await runLoopTurn(done, {
    pump: (sessionId) => {
      const state = getRunState(sessionId);
      const item = state.queue.shift();
      if (!item?.tag) return;
      settleTurnReport(item.tag, {
        outcome: 'complete', seconds: 1, inputTokens: 1, outputTokens: 1,
        costUsd: 0, billed: true, didWork: true, rows: 2,
      });
    },
    timeoutMs: 2000,
  });
  const doneBefore = await getLoop(done);
  await resumeLoopsOnBoot();
  const doneAfter = await getLoop(done);
  ok('a terminal loop keeps its status', doneAfter.status === doneBefore.status);
  ok('a terminal loop keeps its stop reason', doneAfter.stopReason === doneBefore.stopReason);
}

// ===========================================================================
console.log('# resuming clears a pending stop request');
// ===========================================================================
{
  __resetRunStates();
  const id = await makeLoop();
  // Stop it for real: a turn runs and the user presses Stop mid-turn, so the
  // loop ends genuinely PAUSED with the flag consumed.
  await runLoopTurn(id, { pump: pumpThatStopsMidTurn(id), timeoutMs: 2000 });
  const stopped = await getLoop(id);
  ok('CONTROL: the loop is paused before the resume', stopped.status === 'paused');

  // Park a stop request on the paused loop. A real one cannot survive here (the
  // flag is consumed by the turn it applied to), so this is the state a CRASH
  // leaves behind: the request was written, then the process died before the
  // turn settled. Recovery must not hand that flag to the next run.
  const { readFile: read201, writeFile: write201 } = await import('node:fs/promises');
  const { join: join201 } = await import('node:path');
  const statePath201 = join201(home, '.lokma', 'loops', id, 'state.json');
  const raw201 = JSON.parse(await read201(statePath201, 'utf-8')) as Record<string, unknown>;
  raw201.stopRequested = true;
  await write201(statePath201, JSON.stringify(raw201, null, 2));
  ok('a stale stop request is parked on the paused loop', (await getLoop(id)).stopRequested === true);

  await setLoopStatus(id, 'running');
  ok('resuming clears the pending stop', (await getLoop(id)).stopRequested === false);
  // A resumed loop must then be able to run a real turn and STAY running,
  // instead of silently pausing itself after one turn.
  const res = await runLoopTurn(id, { pump: completingPump(), timeoutMs: 2000, force: true });
  ok('the resumed turn ran', res.started === true);
  ok('the resumed loop keeps running (no inherited stop)', (await getLoop(id)).status === 'running');
  ok('the resumed turn counted', (await getLoop(id)).spent.iters === 2);
}

// ===========================================================================
console.log('# legacy rows without the new fields still parse');
// ===========================================================================
{
  // A record written before `stopRequested` / `inFlightSince` existed must not
  // vanish from listLoops — Zod `.default()` is what keeps it visible. Asserted
  // through the real store: create, strip the fields from disk, list.
  const id = await makeLoop();
  const { readFile, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const path = join(home, '.lokma', 'loops', id, 'state.json');
  const raw = JSON.parse(await readFile(path, 'utf-8')) as Record<string, unknown>;
  delete raw.stopRequested;
  delete raw.inFlightSince;
  await writeFile(path, JSON.stringify(raw, null, 2));
  const { listLoops } = await import('@lokma/core');
  const listed = await listLoops();
  ok('a pre-field loop is still listed (not silently dropped)', listed.some((l) => l.id === id));
  const reread = await getLoop(id);
  ok('a pre-field loop defaults the stop request to false', reread.stopRequested === false);
  ok('a pre-field loop defaults the in-flight stamp to null', reread.inFlightSince === null);
}

// ===========================================================================
console.log('# concurrent writers to one file must not collide');
// ===========================================================================
{
  // PTF 8 measured that this rule is NOT covered by the store blocks above: with
  // a per-process temp name, none of them fail — the collision needs two
  // overlapping writes to the SAME path. They are real here (a Stop landing
  // while the turn settles persists `prompt.md` twice at once), so the probe
  // makes them real instead of asserting the fix from the source.
  const { writeAtomic } = await import('@lokma/core');
  const { readFile } = await import('node:fs/promises');
  const { join: joinW } = await import('node:path');
  const target = joinW(home, 'atomic-probe.json');

  // Both writes are awaited together: the second `writeFile` must not clobber
  // the first's temp file, or the first `rename` has nothing to move.
  const many = 24;
  const results = await Promise.allSettled(
    Array.from({ length: many }, (_, i) => writeAtomic(target, JSON.stringify({ i }))),
  );
  const rejected = results.filter((r) => r.status === 'rejected');
  ok(`${many} concurrent writes to one file all succeed`, rejected.length === 0);
  // Whichever writer landed last, the file must be one of the written values —
  // never a torn mixture and never missing.
  const raw = await readFile(target, 'utf-8').catch(() => '');
  let parsed: { i?: number } | null = null;
  try {
    parsed = JSON.parse(raw) as { i?: number };
  } catch {
    parsed = null;
  }
  ok('the surviving content is a whole value, never torn', parsed !== null && typeof parsed.i === 'number');
  ok('the surviving content is one of the writes', parsed !== null && parsed.i !== undefined && parsed.i >= 0 && parsed.i < many);

  // No `.tmp` litter may survive: a crashed write used to leave the scratch file
  // next to every config file forever.
  const { readdir } = await import('node:fs/promises');
  const litter = (await readdir(home)).filter((f) => f.includes('.tmp.'));
  ok('no .tmp scratch files are left behind', litter.length === 0);
}

console.log('');
console.log('PASS ' + pass + ' / FAIL ' + fail);
if (fail > 0) process.exit(1);

// ---------------------------------------------------------------------------
/** A pump that settles one ordinary completed turn — the happy-path control. */
function completingPump(): (sessionId: string, cwd: string) => void {
  return (sessionId) => {
    const state = getRunState(sessionId);
    const item = state.queue.shift();
    if (!item?.tag) return;
    settleTurnReport(item.tag, {
      outcome: 'complete',
      seconds: 1,
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0,
      billed: true,
      didWork: true,
      rows: 2,
    });
  };
}

/**
 * Run `fn` and report the `LoopError` code it threw, or `'threw_nothing'`.
 *
 * A refusal asserted only by "it did not succeed" passes vacuously when the call
 * returns normally for an unrelated reason, so the code is compared — that is
 * what makes `loop_terminal` distinguishable from `cwd_locked`.
 */
async function loopErrorCode(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'threw_nothing';
  } catch (e) {
    return (e as { code?: string }).code ?? 'unknown';
  }
}