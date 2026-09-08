/**
 * Live probe for project todos + agent claim leases (`./todos`).
 * Run: `HOME=$(mktemp -d) bun src/todos/store.test.ts` from
 * `packages/lokma-core`. No test framework — plain asserts so the
 * package stays dependency-free. Real temp HOME on disk (startup env —
 * bun snapshots HOME at boot; the guard below refuses anything outside
 * `/tmp/`). Covers REQ-062 Parça C / REQ-065: atomic claim, чужой RED
 * with holder, same-session idempotent re-claim, heartbeat extension,
 * expiry auto-release, and cross-project `heartbeatSession`.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import {
  claimTodo,
  completeTodo,
  createTodo,
  deleteTodo,
  heartbeatSession,
  heartbeatTodo,
  listTodos,
  releaseTodo,
  TodoError,
} from './store.js';

const HOME = process.env.HOME ?? '';
if (!HOME.startsWith('/tmp/')) {
  throw new Error(`REFUSE: HOME=${HOME || '(empty)'} — rerun with HOME=$(mktemp -d) bun ...`);
}

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

async function expectCode(fn: () => Promise<unknown>, code: string, label: string): Promise<TodoError> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof TodoError && e.code === code) {
      passed += 1;
      console.log(`PASS: ${label}`);
      return e;
    }
    throw new Error(`FAIL: ${label} — wrong error ${(e as Error)?.message}`);
  }
  throw new Error(`FAIL: ${label} — did not throw`);
}

const PID = 'p_probe_todos';

const created = await createTodo(PID, 'Wire the claim gate');
assert(created.status === 'open', 'new todo is open');
assert((await listTodos(PID)).length === 1, 'board lists one todo');

// First claim wins.
const claimed = await claimTodo(PID, created.id, { sessionId: 'sess_a', userId: 'u_a' });
assert(claimed.status === 'claimed', 'claim flips to claimed');
assert(claimed.claimedBy?.sessionId === 'sess_a', 'claim records the holder session');

// Second session gets RED with the holder attached.
const red = await expectCode(
  () => claimTodo(PID, created.id, { sessionId: 'sess_b', userId: 'u_b' }),
  'todo_claimed',
  'чужой claim REDs with todo_claimed',
);
assert(red.holder?.sessionId === 'sess_a', 'RED carries the holder session');
assert(red.status === 409, 'RED answers 409');

// Same session re-claims idempotently (lease extends, no error).
const again = await claimTodo(PID, created.id, { sessionId: 'sess_a', userId: 'u_a' });
assert(again.status === 'claimed', 'same-session re-claim stays claimed');

// чужой heartbeat is a quiet false (never throws into a turn).
assert((await heartbeatTodo(PID, created.id, 'sess_b')) === false, 'чужой heartbeat is false');
// Holder heartbeat extends.
assert((await heartbeatTodo(PID, created.id, 'sess_a')) === true, 'holder heartbeat extends');
// Cross-project sweep finds the holder claim.
assert((await heartbeatSession('sess_a')) >= 1, 'heartbeatSession extends holder claims');

// чужой cannot complete a live чужой claim.
await expectCode(() => completeTodo(PID, created.id, 'sess_b'), 'todo_claimed', 'чужой complete REDs');
// Holder completes.
const done = await completeTodo(PID, created.id, 'sess_a');
assert(done.status === 'done', 'holder completes the todo');
// Done todos refuse new claims.
await expectCode(() => claimTodo(PID, created.id, { sessionId: 'sess_b', userId: 'u_b' }), 'todo_done', 'done todo refuses claims');

// Expiry auto-releases: short lease, wait it out, чужой takes over.
const quick = await createTodo(PID, 'Short lease');
await claimTodo(PID, quick.id, { sessionId: 'sess_old', userId: 'u_old' }, 50);
await new Promise((r) => setTimeout(r, 80));
const taken = await claimTodo(PID, quick.id, { sessionId: 'sess_new', userId: 'u_new' });
assert(taken.claimedBy?.sessionId === 'sess_new', 'expired lease is taken over');
assert((await listTodos(PID)).filter((t) => t.status === 'claimed').length === 1, 'sweep leaves one live claim');

// Release frees the todo for others.
const rel = await createTodo(PID, 'Releasable');
await claimTodo(PID, rel.id, { sessionId: 'sess_x', userId: 'u_x' });
const freed = await releaseTodo(PID, rel.id, 'sess_x');
assert(freed.status === 'open', 'release returns the todo to open');
await claimTodo(PID, rel.id, { sessionId: 'sess_y', userId: 'u_y' });
assert(true, 'released todo is claimable again');

// Delete removes the row; unknown ids 404.
await deleteTodo(PID, rel.id);
assert((await listTodos(PID)).every((t) => t.id !== rel.id), 'deleted todo leaves the board');
await expectCode(() => deleteTodo(PID, 't_missing'), 'todo_not_found', 'unknown todo 404s');
await expectCode(() => createTodo(PID, '   '), 'bad_title', 'blank title 400s');
await expectCode(() => claimTodo('bogus pid!!', created.id, { sessionId: 's', userId: 'u' }), 'bad_project_id', 'bad project 400s');

console.log(`\n${passed} checks passed`);
