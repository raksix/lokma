/**
 * Live probe for the loop RUN route (REQ-201 slice 3).
 * Run:
 *   HOME=$(mktemp -d) bun src/loops/run-route.test.ts
 * from `packages/lokma-web/server`.
 *
 * What this proves on the REAL Fastify handler (no framework, plain asserts):
 * the route answers 202 WITHOUT awaiting the turn, and — the load-bearing
 * part — the background call it fired really dispatches a turn.
 *
 * That second half is the whole point of this probe. A route that returns 202
 * and then quietly does nothing passes every shape assertion below (accepted,
 * sessionId, status code) while the loop never runs; it reads as a working
 * Run button that silently burns nothing. So each accepted case asserts the
 * TRANSCRIPT row and the `running` status that only a real dispatch produces.
 *
 * Refusals stay synchronous on purpose (404 / 409): a rejected click must be
 * reported as a rejection, not as an accepted run the user waits on forever.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { strict as assert } from 'node:assert';
import Fastify from 'fastify';

// --- temp HOME guard: never touch the live ~/.lokma ------------------------
const home = homedir();
if (!home.startsWith(tmpdir())) {
  console.error('REFUSING: HOME=' + home + ' is not a temp dir — set HOME=$(mktemp -d)');
  process.exit(2);
}
mkdirSync(home + '/.lokma/projects', { recursive: true });

const { createLoop, getLoop, setLoopStatus, SessionStore } = await import('@lokma/core');
const { loopRoutes } = await import('../routes/loops.js');
const { loopSessionId, runLoopTurn } = await import('./executor.js');

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

let dirSeq = 0;
function freshCwd(): string {
  dirSeq += 1;
  const dir = home + '/work-' + dirSeq;
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function makeLoop(over: Record<string, unknown> = {}): Promise<string> {
  const loop = await createLoop({
    name: 'route-' + Math.random().toString(36).slice(2, 8),
    cwd: freshCwd(),
    prompt: 'do the thing',
    model: 'test/model',
    budget: { maxIters: 10, maxHours: 24, maxUsd: 5 },
    trigger: { kind: 'manual', cooldownSeconds: 0 },
    ...(over as object),
  } as never);
  return loop.id;
}

const app = Fastify({ logger: false });
await loopRoutes(app);
await app.ready();

// ===========================================================================
console.log('# an accepted run answers 202 and really dispatches a turn');
// ===========================================================================
{
  const id = await makeLoop();
  const res = await app.inject({ method: 'POST', url: '/api/loops/' + id + '/run', payload: {} });
  ok('a run is accepted with 202', res.statusCode === 202);
  const body = res.json() as { accepted?: boolean; sessionId?: string; loop?: { id: string } };
  ok('the body says accepted', body.accepted === true);
  ok('the body carries the loop session id', body.sessionId === loopSessionId(id));
  ok('the echoed record is the requested loop', body.loop?.id === id);

  // THE load-bearing assertion: a real dispatch, not just a 202.
  const store = new SessionStore((await getLoop(id)).cwd);
  let rows: { role: string; content: string }[] = [];
  for (let i = 0; i < 40; i += 1) {
    rows = (await store.read(loopSessionId(id))) as { role: string; content: string }[];
    if (rows.some((r) => r.role === 'user' && r.content === 'do the thing')) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  ok(
    'the background call wrote the prompt to the transcript',
    rows.filter((r) => r.role === 'user' && r.content === 'do the thing').length === 1,
  );
  // `status === 'running'` is a RACE here and asserting it made the probe a
  // coin flip: this HOME has no provider, so the turn settles almost instantly
  // and `running` is gone before the next poll. A race is not a measurement.
  // `lastRunStartedAt` is the durable trace of "a turn really started" — it is
  // stamped before the turn runs and never cleared.
  let startedAt: string | null = null;
  for (let i = 0; i < 40; i += 1) {
    startedAt = (await getLoop(id)).lastRunStartedAt;
    if (startedAt) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  ok('the background call really started a turn', typeof startedAt === 'string');
  // The turn itself has no provider in this probe HOME, so it settles as an
  // honest error — that is the harness being truthful with no credentials, and
  // it also proves the report reached the waiter (the loop left `running`).
  let settled = false;
  for (let i = 0; i < 80; i += 1) {
    const status = (await getLoop(id)).status;
    if (status !== 'running' && status !== 'draft') {
      settled = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  ok('the turn settled instead of hanging', settled);
  const settledLoop = await getLoop(id);
  ok('the settled outcome was booked honestly', settledLoop.lastRunOutcome === 'error');
  ok('the settled stop reason is error', settledLoop.stopReason === 'error');
}

// ===========================================================================
console.log('# refusals are synchronous and honest');
// ===========================================================================
{
  // `assertLoopIdShape` validates the SHAPE (`l_` prefix + length), and an
  // off-shape id is a 400 `bad_loop_id` — a different, earlier rejection than
  // "no such loop". Both are asserted because a probe that only knows one of
  // them cannot tell a real 404 path from the shape guard.
  const offShape = await app.inject({ method: 'POST', url: '/api/loops/not-an-id/run', payload: {} });
  ok('an off-shape id is a 400 bad_loop_id', offShape.statusCode === 400);
  ok('the 400 names bad_loop_id', (offShape.json() as { code?: string }).code === 'bad_loop_id');

  // Well-shaped but never created — the real not-found path.
  const unknown = await app.inject({
    method: 'POST',
    url: '/api/loops/l_' + '0'.repeat(8) + '/run',
    payload: {},
  });
  ok('a well-shaped unknown loop is a 404', unknown.statusCode === 404);
  ok('the 404 carries a machine code', (unknown.json() as { code?: string }).code !== undefined);
  ok('the 404 is NOT bad_loop_id (shape was valid)', (unknown.json() as { code?: string }).code !== 'bad_loop_id');

  // A zero-cost loop is the documented OFF SWITCH. The route itself has no
  // business second-guessing it — the DECISION layer owns that rule — so the
  // request is accepted and the background turn refuses, leaving the record
  // untouched. Asserting 202 here proves the route did not smuggle a second
  // policy in front of `shouldStart`.
  const zeroId = await makeLoop({ budget: { maxIters: 10, maxHours: 24, maxUsd: 0 } });
  const zero = await app.inject({ method: 'POST', url: '/api/loops/' + zeroId + '/run', payload: {} });
  ok('a zero-cost run is accepted at the route', zero.statusCode === 202);
  await new Promise((r) => setTimeout(r, 500));
  const zeroLoop = await getLoop(zeroId);
  ok('the zero-cost turn never started (still draft)', zeroLoop.status === 'draft');
  ok('the zero-cost loop never spent', zeroLoop.spent.iters === 0 && zeroLoop.spent.usd === 0);
  ok(
    'a refused turn wrote no transcript row',
    (await new SessionStore(zeroLoop.cwd).read(loopSessionId(zeroId))).length === 0,
  );
}

{
  // A loop parked mid-turn (status running) refuses a SECOND start with 409,
  // synchronously — otherwise the UI would show two accepted runs.
  //
  // Driven through the STORE, not through a real first run: the honest
  // "in flight" state is set directly so the assertion cannot race the
  // previous turn's settlement (which lands within milliseconds in this
  // provider-less HOME and turns the loop `error` before the second request
  // is even sent).
  const id = await makeLoop();
  const parked = await setLoopStatus(id, 'running');
  ok('the parked loop is running', parked.status === 'running');
  const second = await app.inject({ method: 'POST', url: '/api/loops/' + id + '/run', payload: {} });
  ok('a run while a turn is in flight is a 409', second.statusCode === 409);
  ok('the 409 names already_running', (second.json() as { code?: string }).code === 'already_running');
  ok('the parked loop was not touched by the refusal', (await getLoop(id)).lastRunStartedAt === null);
}

{
  // Terminal loop: `done` and `error` are both terminal (store assertTransition).
  const id = await makeLoop();
  await runLoopTurn(id, {
    // A pump that settles NOTHING but the waiter timeout is the cheapest honest
    // way to drive a loop to its `error` terminal through the real executor.
    pump: () => {},
    timeoutMs: 120,
  });
  const settled = (await getLoop(id)).status;
  ok('the probe loop reached a terminal state', settled === 'error' || settled === 'done');
  const again = await app.inject({ method: 'POST', url: '/api/loops/' + id + '/run', payload: {} });
  ok('a terminal loop refuses a new run', again.statusCode !== 202);
  ok('the terminal refusal names loop_terminal', (again.json() as { code?: string }).code === 'loop_terminal');
}

// ===========================================================================
console.log('# the response does not wait for the turn');
// ===========================================================================
{
  const id = await makeLoop();
  const started = Date.now();
  await app.inject({ method: 'POST', url: '/api/loops/' + id + '/run', payload: {} });
  const elapsed = Date.now() - started;
  // The live proxy reads /api/ for 60s; the turn ceiling is 180s. A route that
  // awaited the turn would blow past that and 504 on a real token spend.
  ok('the 202 came back fast (did not await the turn)', elapsed < 10_000);
}

/*
 * The DISCRIMINATING case for "the route must not await the turn".
 *
 * The timing check above is not enough on its own: this probe HOME has no
 * provider, so a turn settles in milliseconds and `elapsed < 10_000` is true
 * for BOTH the real route and a route that awaits. The proven-to-fail mutation
 * that turned `void` into `await` stayed GREEN — the rule was untested.
 *
 * The discriminating signal is the RECORD the response carries. The route
 * reads the loop, hands the turn to the executor, and answers with the record
 * it read. The executor performs its state changes ASYNCHRONOUSLY after that
 * read — its first await is `getLoop`/`shouldStart`, which resumes on a later
 * microtask. So:
 *
 *  - a route that answers BEFORE dispatch returns the pre-turn record
 *    (`status: 'draft'`, `lastRunStartedAt: null`);
 *  - a route that AWAITS the turn returns the SETTLED record, because the
 *    executor has by then stamped the start and booked the outcome
 *    (`status: 'error'`, `lastRunStartedAt` set) — the mutation's red.
 *
 * This is an ordering assertion, not a duration, which is why it discriminates
 * even though every turn in this probe settles in milliseconds.
 */
{
  const id = await makeLoop();
  const res = await app.inject({ method: 'POST', url: '/api/loops/' + id + '/run', payload: {} });
  ok('a run answers 202', res.statusCode === 202);
  const body = res.json() as { loop?: { status?: string; lastRunStartedAt: string | null } };
  ok('the 202 body is the PRE-turn record (route did not await)', body.loop?.lastRunStartedAt === null);
  ok('the 202 body still reports draft', body.loop?.status === 'draft');
  // And the background dispatch really ran AFTER the response went out.
  await new Promise((r) => setTimeout(r, 1500));
  ok('the turn ran after the response was sent', (await getLoop(id)).lastRunStartedAt !== null);
  ok('the background turn is still on record as settled', (await getLoop(id)).lastRunOutcome === 'error');
}

await app.close();
rmSync(home + '/.lokma/loops', { recursive: true, force: true });
rmSync(home + '/.lokma/projects', { recursive: true, force: true });
for (let i = 0; i <= dirSeq; i += 1) {
  rmSync(home + '/work-' + i, { recursive: true, force: true });
}

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
if (fail > 0) {
  console.log('failures: ' + failures.join(' | '));
  process.exit(1);
}