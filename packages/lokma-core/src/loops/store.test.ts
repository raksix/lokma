/**
 * Live probe for the loop store + ledger (REQ-200). Run:
 *   HOME=$(mktemp -d) bun src/loops/store.test.ts
 * from `packages/lokma-core`. No test framework — plain asserts so the package
 * stays dependency-free (`tsconfig.json` excludes `*.test.ts`).
 *
 * Real temp HOME on disk: bun snapshots HOME at boot, so the guard below
 * refuses anything outside `/tmp/` (running with the real HOME would write into
 * the live `~/.lokma/loops/`).
 *
 * Covers: mint + state.json on disk, measured-only counters (there is no setter
 * — the probe proves it by type, not by call), budget self-stop at maxIters /
 * maxUsd, the target-score stop, empty-turn guard (iters do NOT advance),
 * terminal-is-terminal refusal, illegal transitions, project scoping, ledger
 * append + trim (never delete), corrupt state row skipped not fatal, and the
 * cwd lock discipline: one directory one owner, both entry points into
 * `running` guarded, every exit path (pause / terminal stop / delete / cwd
 * change) handing the directory back, and an expired lease never wedging it.
 */
import {
  acquireLoopCwd,
  cwdLockConflict,
  heartbeatLoopCwd,
  listLoopLocks,
  loopIdFromLockOwner,
  loopLockOwner,
  normalizeLoopCwd,
  releaseLoopCwd,
  budgetBreach,
  betterScore,
  createLoop,
  deleteLoop,
  getLoop,
  getLoopDetail,
  listLoops,
  listProjectLoops,
  LoopError,
  parseLedger,
  recordIteration,
  resolveBudget,
  setLoopStatus,
  stopLoop,
  targetReached,
  trimLedger,
  updateLoop,
  appendLedger,
  formatLedgerEntry,
  ledgerPath,
  loopDir,
  LOOPS_DIR,
  parseScopeRemaining,
} from './index.js';
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { sha1HexSync } from '@lokma/shared';
import { ensureDir } from '../utils/fs.js';
import { acquire, listLocks, release } from '../agents/locks.js';
import { createProject, registerFirstAdmin } from '../auth/store.js';

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

async function expectCode(fn: () => Promise<unknown>, code: string, label: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof LoopError && e.code === code) {
      passed += 1;
      console.log(`PASS: ${label}`);
      return;
    }
    throw new Error(`FAIL: ${label} — wrong error ${e instanceof LoopError ? e.code : String(e)}`);
  }
  throw new Error(`FAIL: ${label} — no error thrown`);
}

/** The HTTP status a refusal carries — the console renders 409, not the text. */
async function expectStatus(fn: () => Promise<unknown>, status: number, label: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof LoopError && e.status === status) {
      passed += 1;
      console.log(`PASS: ${label}`);
      return;
    }
    throw new Error(`FAIL: ${label} — wrong status ${e instanceof LoopError ? e.status : String(e)}`);
  }
  throw new Error(`FAIL: ${label} — no error thrown`);
}

/** The refusal's own words: a message that names no holder names no remedy. */
async function refusalMessage(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    return e instanceof LoopError ? e.message : String(e);
  }
  throw new Error('FAIL: expected a refusal, got success');
}

/**
 * A loop per DIRECTORY, by construction. These probes used to share one
 * `cwd`, which was harmless until the cwd lock made it a genuine conflict
 * (six loops claiming `/tmp/probe-loop`); a factory is what stops the next
 * added loop from silently colliding with an earlier one.
 */
const mkBase = (name: string) => ({ name, cwd: `/tmp/probe-loop/${name.replace(/\W+/g, '-')}`, prompt: 'do the thing' });
/**
 * Write a lock file straight to disk, bypassing `acquire()`. Needed to leave an
 * EXPIRED lock behind: `acquire()` overwrites one the moment it sees it stale,
 * so there would be nothing on disk to read.
 *
 * `expiredAgoMs` is subtracted from now so the file is unambiguously in the past
 * — a 1 ms lease is already in the past, but "already" measured across a second
 * boundary is a race the probe does not need.
 */
async function writeLockFile(path: string, owner: string, expiredAgoMs: number, reason: string): Promise<void> {
  const now = Date.now();
  const lock = {
    path,
    owner,
    acquiredAt: now - expiredAgoMs - 60_000,
    leaseUntil: now - expiredAgoMs,
    mode: 'exclusive' as const,
    reason,
  };
  await ensureDir('~/.lokma/agentlocks/locks');
  await writeFile(join(homedir(), '.lokma/agentlocks/locks', `${sha1HexSync(path)}.json`), JSON.stringify(lock, null, 2), 'utf-8');
}

const BASE = mkBase('probe loop');

async function main(): Promise<void> {
  // ─── create: mint, draft, disk evidence ────────────────────────────────
  const loop = await createLoop(BASE);
  assert(/^l_[a-f0-9]{8}$/.test(loop.id), 'create mints an l_ id');
  assert(loop.status === 'draft', 'a new loop starts draft');
  assert(loop.startedAt === null, 'a draft loop has never started');
  assert(loop.spent.iters === 0 && loop.spent.usd === 0, 'counters start at zero');
  assert(loop.origin === 'user', 'origin defaults to user');

  const stateFile = `${HOME}/.lokma/loops/${loop.id}/state.json`;
  assert(existsSync(stateFile), 'state.json exists on disk');
  const raw = JSON.parse(await readFile(stateFile, 'utf-8')) as { id: string; budget: { maxIters: number } };
  assert(raw.id === loop.id, 'state.json carries the same id');
  assert(raw.budget.maxIters === 400, 'default budget is 400 iterations');
  assert(existsSync(`${HOME}/.lokma/loops/${loop.id}/prompt.md`), 'prompt.md mirror exists');
  const promptMirror = await readFile(`${HOME}/.lokma/loops/${loop.id}/prompt.md`, 'utf-8');
  assert(promptMirror.trim() === 'do the thing', 'prompt.md is readable without parsing JSON');

  // ─── validation ────────────────────────────────────────────────────────
  await expectCode(() => createLoop({ ...mkBase('blank-name'), name: '  ' }), 'bad_name', 'blank name refused');
  await expectCode(() => createLoop({ ...mkBase('noprompt'), prompt: '' }), 'bad_prompt', 'blank prompt refused');
  await expectCode(() => createLoop({ ...mkBase('escape'), projectId: '../escape' }), 'bad_project_id', 'traversal projectId refused');
  await expectCode(() => createLoop({ ...mkBase('cron'), origin: 'cron' }), 'bad_origin', 'unknown origin refused');
  await expectCode(() => getLoop('l_zzzzzzzz'), 'bad_loop_id', 'non-server id shape refused');

  // ─── measured counters: only recordIteration moves them ────────────────
  const afterOne = await recordIteration(loop.id, { seconds: 60, tokens: 1200, usd: 0.5, score: '10' });
  assert(afterOne.spent.iters === 1, 'one measurement = one iteration');
  assert(afterOne.spent.hours > 0 && afterOne.spent.hours < 1, 'hours come from measured seconds');
  assert(afterOne.status === 'running', 'first measurement moves draft → running');
  assert(afterOne.startedAt !== null, 'startedAt is stamped by the first run');
  assert(afterOne.score.last === '10' && afterOne.score.best === '10', 'score measured, best tracked');

  const afterLower = await recordIteration(loop.id, { seconds: 1, tokens: 10, usd: 0.01, score: '4' });
  assert(afterLower.score.best === '10', 'a lower score does not lower best');
  assert(afterLower.score.last === '4', 'last follows the newest measurement');

  // Empty-turn guard: work-free iteration must not burn the budget.
  const afterEmpty = await recordIteration(loop.id, { seconds: 5, tokens: 50, usd: 0.02 }, { countIteration: false });
  assert(afterEmpty.spent.iters === 2, 'an empty iteration does NOT advance the iteration counter');
  assert(afterEmpty.spent.usd > afterLower.spent.usd, 'an empty iteration still records its measured cost');

  // ─── budget self-stop ──────────────────────────────────────────────────
  assert(budgetBreach({ spent: { iters: 399, hours: 1, usd: 1 }, budget: { maxIters: 400, maxHours: 24, maxUsd: 50 } }) === null, 'inside budget = no breach');
  assert(budgetBreach({ spent: { iters: 400, hours: 1, usd: 1 }, budget: { maxIters: 400, maxHours: 24, maxUsd: 50 } }) === null, 'landing exactly on maxIters is still allowed');
  assert(budgetBreach({ spent: { iters: 401, hours: 1, usd: 1 }, budget: { maxIters: 400, maxHours: 24, maxUsd: 50 } }) === 'max_iters', 'one iteration past maxIters breaches');
  assert(budgetBreach({ spent: { iters: 1, hours: 24, usd: 1 }, budget: { maxIters: 400, maxHours: 24, maxUsd: 50 } }) === 'max_hours', 'maxHours breach detected');
  assert(budgetBreach({ spent: { iters: 1, hours: 1, usd: 50 }, budget: { maxIters: 400, maxHours: 24, maxUsd: 50 } }) === 'budget', 'maxUsd breach detected');

  const capped = await createLoop({ ...mkBase('capped'), budget: { maxIters: 2 } });
  await recordIteration(capped.id, { seconds: 1, tokens: 1, usd: 0 });
  const cappedAfter2 = await recordIteration(capped.id, { seconds: 1, tokens: 1, usd: 0 });
  assert(cappedAfter2.status === 'running' && cappedAfter2.spent.iters === 2, 'the allowed 2 iterations both ran');
  const cappedAfter3 = await recordIteration(capped.id, { seconds: 1, tokens: 1, usd: 0 });
  assert(cappedAfter3.status === 'done', 'the 3rd iteration stops the loop by itself');
  assert(cappedAfter3.stopReason === 'max_iters', 'stopReason is max_iters');
  assert(cappedAfter3.finishedAt !== null, 'a terminal loop gets finishedAt');
  await expectCode(
    () => recordIteration(capped.id, { seconds: 1, tokens: 1, usd: 0 }),
    'loop_terminal',
    'a done loop refuses further iterations',
  );

  // Zero usd/hours cap means "no ceiling" for that dimension.
  const free = await createLoop({ ...mkBase('free'), budget: { maxIters: 1, maxUsd: 0, maxHours: 0 } });
  const freeFirst = await recordIteration(free.id, { seconds: 3600, tokens: 999, usd: 12.5 });
  assert(freeFirst.status === 'running' && freeFirst.stopReason === null, 'a 0 usd/hours cap means unlimited spend and time');
  const freeSecond = await recordIteration(free.id, { seconds: 1, tokens: 1, usd: 0.1 });
  assert(freeSecond.stopReason === 'max_iters', 'iterations still cap when money/time are unlimited');
  assert(resolveBudget({ maxIters: 0 }).maxIters === 400, 'maxIters 0 falls back instead of disabling');
  assert(resolveBudget({ maxUsd: -3 }).maxUsd === 50, 'a negative cap is ignored');

  // ─── target score stops the loop ───────────────────────────────────────
  const targeted = await createLoop({ ...mkBase('targeted'), target: 'PASS' });
  await recordIteration(targeted.id, { seconds: 1, tokens: 1, usd: 0, score: '9/10' });
  const hit = await recordIteration(targeted.id, { seconds: 1, tokens: 1, usd: 0, score: 'PASS' });
  assert(hit.status === 'done' && hit.stopReason === 'target_score', 'reaching the target score stops the loop');
  assert(targetReached({ score: { target: 'PASS', last: 'PASS', best: null } }), 'target equality is the rule');
  assert(!targetReached({ score: { target: 'PASS', last: 'nope', best: null } }), 'a different score is not the target');
  assert(!targetReached({ score: { target: null, last: 'PASS', best: null } }), 'no target means never reached');

  assert(betterScore(null, '5') === '5', 'betterScore keeps the existing best when no candidate');
  assert(betterScore('7', '5') === '7', 'numeric better score wins');
  assert(betterScore('5', '7') === '7', 'numeric worse score does not win');
  assert(betterScore('b', 'a') === 'b', 'opaque scores compare lexicographically');

  // ─── transitions ───────────────────────────────────────────────────────
  await expectCode(() => setLoopStatus(capped.id, 'running'), 'loop_terminal', 'a done loop cannot be resumed');
  await expectCode(() => stopLoop(capped.id), 'loop_terminal', 'a done loop cannot be paused');
  const paused = await stopLoop(loop.id);
  assert(paused.status === 'paused' && paused.stopReason === 'stopped', 'user stop pauses with a recorded reason');
  const resumed = await setLoopStatus(loop.id, 'running');
  assert(resumed.status === 'running' && resumed.stopReason === null, 'resume clears the stop reason');
  await expectCode(() => setLoopStatus(capped.id, 'paused'), 'loop_terminal', 'terminal wins over any transition');

  // ─── project scoping + listing ─────────────────────────────────────────
  // REQ-203 kapsam 3: a loop that names a project must store THAT project's
  // cwd, so a scoped loop needs a REAL project record — the old fixture used a
  // bare `'demo-project'` id that now (correctly) describes an illegal state.
  const scopeOwner = (await registerFirstAdmin({
    email: 'loop-store@lokma.test',
    password: 'probe-password-1',
    name: 'Loop Store Probe',
  })).user;
  const demoDir = mkBase('demo-project').cwd;
  const demoProject = await createProject(scopeOwner, { name: 'Demo Project', cwd: demoDir });
  const projLoop = await createLoop({ ...mkBase('scoped'), cwd: demoDir, projectId: demoProject.id });
  assert(projLoop.cwd === demoDir, 'a scoped loop stores the project cwd');
  const freeLoop = await createLoop(mkBase('unscoped'));
  const all = await listLoops();
  assert(all.length === 6, `list returns every loop (${all.length})`);
  assert(all[0].createdAt >= all[all.length - 1].createdAt, 'list is newest first');
  const scoped = await listProjectLoops(demoProject.id);
  assert(scoped.length === 1 && scoped[0].id === projLoop.id, 'project view is scoped');
  const unscoped = await listProjectLoops(null);
  assert(unscoped.some((l) => l.id === freeLoop.id) && !unscoped.some((l) => l.id === projLoop.id), 'null project view holds the project-less loops');
  await expectCode(() => listProjectLoops('../x'), 'bad_project_id', 'traversal projectId refused on read');

  // ─── corrupt row skipped, never fatal ──────────────────────────────────
await ensureDir(join(LOOPS_DIR, 'l_00000000'));
  await writeFile(`${HOME}/.lokma/loops/l_00000000/state.json`, '{ not json', 'utf-8');
  const afterCorrupt = await listLoops();
  assert(afterCorrupt.length === 6, 'a corrupt state row is skipped, the list still reads');
  await rm(`${HOME}/.lokma/loops/l_00000000`, { recursive: true, force: true });

  // ─── ledger: append-only + trim, never delete ──────────────────────────
  for (let i = 1; i <= 3; i += 1) {
    await appendLedger(
      loop.id,
      formatLedgerEntry({ iteration: i, at: `2026-10-03T0${i}:00:00.000Z`, summary: `run ${i} did work`, measured: 'gate 39/39', next: 'next slice' }),
    );
  }
  const detail = await getLoopDetail(loop.id, 50);
  assert(detail.ledger.includes('run 3 did work'), 'ledger tail contains the newest entry');
  assert(detail.ledgerPath === ledgerPath(loop.id), 'detail reports the real ledger path');
  assert(detail.loop.id === loop.id, 'detail carries the record');

  // ─── detail payload: raw state.json + honest scope (REQ-202 kapsam 3) ──
  // The console SHOWS these files; it must never re-serialize or invent them.
  assert(detail.statePath === join(loopDir(loop.id), 'state.json'), 'detail reports the real state path');
  const stateOnDisk = await readFile(join(loopDir(loop.id), 'state.json'), 'utf-8');
  assert(detail.stateJson === stateOnDisk, 'detail carries state.json BYTE-FOR-BYTE from disk');
  assert(JSON.parse(detail.stateJson).id === loop.id, 'the raw state text really is the record');
  // No scope.md on this loop yet: `null` (absent) must differ from `[]` (empty
  // list) or the console renders "0 items left" as if a list had been written.
  assert(detail.hasScope === false, 'a loop without scope.md reports hasScope=false');
  assert(detail.remaining === null, 'no scope.md yields remaining=null, NOT an empty list');

  // Checkbox parsing, measured on a real file the probe writes.
  const scopeText = [
    '# Working notes',
    '',
    '- [x] slice 1 done',
    '- [ ] slice 2 pending',
    '  - [ ] indented sub-item',
    '* [ ] star bullet',
    '- [X] uppercase checked',
    '- [] missing space is prose',
    'not a bullet at all',
    '- [ ]   ',
  ].join('\n');
  await writeFile(join(loopDir(loop.id), 'scope.md'), scopeText, 'utf-8');
  const withScope = await getLoopDetail(loop.id, 5);
  assert(withScope.hasScope === true, 'scope.md is detected once written');
  assert(
    JSON.stringify(withScope.remaining) === JSON.stringify(['slice 2 pending', 'indented sub-item', 'star bullet']),
    'only unchecked boxes are remaining work — checked and prose lines are not',
  );
  // A scope.md that is entirely checked is an EMPTY list, which must stay `[]`.
  await writeFile(join(loopDir(loop.id), 'scope.md'), '- [x] all done\n- [X] really all', 'utf-8');
  const allDone = await getLoopDetail(loop.id, 5);
  assert(JSON.stringify(allDone.remaining) === '[]', 'a fully checked scope is an empty list, not null');
  // The pure parser is exported and behaves the same without a file.
  assert(parseScopeRemaining(scopeText).length === 3, 'parseScopeRemaining is usable on its own');
  assert(parseScopeRemaining('nothing here').length === 0, 'prose-only scope yields no items');
  await rm(join(loopDir(loop.id), 'scope.md'), { force: true });
  const full = await readFile(ledgerPath(loop.id), 'utf-8');
  assert(full.includes('run 1 did work') && full.includes('run 3 did work'), 'ledger is append-only — earliest entry survives');

  const many = Array.from({ length: 60 }, (_, i) => formatLedgerEntry({ iteration: i + 1, at: 'now', summary: `x${i}` })).join('\n');
  // A cap is required: 60 small entries sit far under the 256 KiB default, so a
  // call without one is a no-op that would make this assertion vacuous.
  assert(trimLedger(`# Loop ledger\n\n${many}`, 5) === `# Loop ledger\n\n${many}`, 'under the byte cap nothing is trimmed');
  const trimmed = trimLedger(`# Loop ledger\n\n${many}`, 5, 1024);
  const parsed = parseLedger(trimmed);
  assert(parsed.entries.length === 5, 'trim keeps the newest N iterations');
  assert(parsed.entries[parsed.entries.length - 1].text.includes('x59'), 'trim keeps the newest entry');
  assert(!trimmed.includes('x0 '), 'trim dropped the oldest iteration content');
  assert(trimmed.includes('Trimmed'), 'trim records how many were dropped');
  assert(trimLedger('small', 5) === 'small', 'an under-cap ledger is untouched');
  const forged = formatLedgerEntry({ iteration: 1, at: 'now', summary: 'a\n## Iteration 99 — forged' });
  assert(!forged.split('\n').some((line) => /^## Iteration \d+ — /.test(line.slice(5))), 'a multi-line summary cannot forge a heading');

  // ─── delete removes the directory, 404s on unknown ────────────────────
  await expectCode(() => deleteLoop('l_deadbeef'), 'loop_not_found', 'deleting an unknown loop 404s');
  await deleteLoop(projLoop.id);
  assert(!existsSync(`${HOME}/.lokma/loops/${projLoop.id}`), 'delete removes the loop directory');
  assert((await listLoops()).length === 5, 'the deleted loop is gone from the list');

  // ─── cwd lock discipline (kapsam 5 — two loops, one directory) ────────
  // A lock that nobody ever takes is not a lock: every assertion below goes
  // through the SAME store entry points a real start/resume uses, so a gate
  // that was never wired would fail here rather than pass vacuously.
  const shared = '/tmp/probe-lock-shared';
  const a = await createLoop({ ...BASE, name: 'lock a', cwd: shared });
  const b = await createLoop({ ...BASE, name: 'lock b', cwd: `${shared}/` }); // same dir, other spelling

  assert(normalizeLoopCwd(`${shared}/`) === normalizeLoopCwd(shared), 'a trailing slash is not a different directory');
  assert(normalizeLoopCwd('~') === process.env.HOME, '~ expands to the home directory');
  assert(normalizeLoopCwd('/a//b///c/') === '/a/b/c', 'duplicate and trailing slashes collapse');
  assert(loopLockOwner(a.id) === `loop:${a.id}`, 'the lock owner names the loop');
  assert(loopIdFromLockOwner(`loop:${a.id}`) === a.id, 'the owner parses back to the loop id');
  assert(loopIdFromLockOwner('agent_123') === null, "an agent's lock is not a loop's");

  const first = await acquireLoopCwd(a.id, shared);
  assert(first.ok, 'the first claim takes the directory');
  const reClaim = await acquireLoopCwd(a.id, shared);
  assert(reClaim.ok && reClaim.held === 'already', 'a loop re-claiming its own directory is not a conflict');
  const denied = await acquireLoopCwd(b.id, shared);
  assert(!denied.ok && denied.holderLoopId === a.id, 'a second loop on the same directory is refused');
  const badSpell = await acquireLoopCwd(b.id, `${shared}//`);
  assert(!badSpell.ok, 'the refusal survives a differently spelled path');

  // A running loop refuses to start, and says WHO holds it — 409 + a machine
  // code, because "locked" with no owner leaves the user with nothing to do.
  await expectStatus(() => setLoopStatus(b.id, 'running'), 409, 'starting on a locked cwd is 409');
  await expectCode(() => setLoopStatus(b.id, 'running'), 'cwd_locked', 'the refusal carries a machine code');
  const msg = await refusalMessage(() => setLoopStatus(b.id, 'running'));
  assert(msg.includes(a.id), 'the refusal names the holding loop');
  assert(msg.includes(shared), 'the refusal names the directory');
  assert((await getLoop(b.id)).status === 'draft', 'a refused start leaves the loop draft');

  // The other entry point into `running` — the draft promotion inside
  // recordIteration. Wiring only setLoopStatus would leave this path unguarded.
  await expectCode(() => recordIteration(b.id, { seconds: 1, tokens: 1, usd: 0 }), 'cwd_locked', 'the first iteration also refuses a locked cwd');
  assert((await getLoop(b.id)).spent.iters === 0, 'the refused iteration counted nothing');

  // An AGENT holding a directory blocks a loop the same way. Its own directory:
  // `shared` is held by loop `a`, so acquiring the agent lock THERE would fail
  // silently and the next three asserts would read "no lock anywhere" — green
  // for the wrong reason. The acquire's own `ok` is asserted for that reason.
  const agentDir = '/tmp/probe-lock-agent';
  const agentClaim = await acquire(agentDir, 'agent_999', 60_000, 'probe');
  assert(agentClaim.ok, 'the agent took its own directory');
  const c = await createLoop({ ...BASE, name: 'lock c', cwd: agentDir });
  const agentBlocked = await cwdLockConflict(c.id, agentDir);
  assert(agentBlocked !== null && agentBlocked.holder === 'agent_999', "an agent's lock blocks a loop");
  assert(agentBlocked !== null && agentBlocked.holderLoopId === null, "an agent holder reports no loop id");
  await expectCode(() => setLoopStatus(c.id, 'running'), 'cwd_locked', "a loop cannot start on an agent's directory");
  await release(agentDir, 'agent_999');

  // Lease semantics: an EXPIRED lock never conflicts (a crashed loop must not
  // wedge its directory forever), and a live one is refreshed by heartbeat.
  // The expired lock is written to disk DIRECTLY: `acquire()` overwrites an
  // expired lock, so asking the primitive to make one leaves nothing to read
  // and the assertion below would be green for the wrong reason.
  const staleDir = '/tmp/probe-lock-stale';
  await writeLockFile(staleDir, 'agent_stale', 60_000, 'expired');
  const d = await createLoop({ ...BASE, name: 'lock d', cwd: staleDir });
  const liveReader = (await listLocks()).find((x) => x.path === staleDir);
  assert(liveReader !== undefined && liveReader.leaseUntil <= Date.now(), 'the expired lock really is on disk and expired');
  assert((await cwdLockConflict(d.id, staleDir, Date.now())) === null, 'an expired lock does not conflict');
  // The negative control: same directory, same reader, a LIVE lease — if this
  // were null too, the line above proved nothing.
  const liveDir = '/tmp/probe-lock-live';
  const liveClaim = await acquire(liveDir, 'agent_live', 60_000, 'live');
  assert(liveClaim.ok, 'the live lease was really taken');
  assert((await cwdLockConflict(d.id, liveDir, Date.now())) !== null, 'a live lock DOES conflict (control)');
  // An expired lock is also TAKEN — the primitive's own recovery path, which is
  // what makes a crashed loop's directory reusable without a manual unlock.
  const tookExpired = await acquire(staleDir, 'agent_fresh', 60_000, 'fresh');
  assert(tookExpired.ok, 'an expired lease can be re-claimed');
  await release(staleDir, 'agent_fresh');

  assert(await heartbeatLoopCwd(a.id, shared), 'the holding loop can heartbeat its own lease');
  const listed = await listLoopLocks();
  assert(listed.some((l) => l.loopId === a.id), 'listLoopLocks reports the loop by id');
  assert(listed.every((l) => l.owner.startsWith('loop:')), 'listLoopLocks holds no agent locks');

  // Pause / terminal / delete all hand the directory back. Without the release
  // a finished loop would sit on its cwd for the whole 15 minute lease.
  await releaseLoopCwd(a.id, shared);
  assert((await cwdLockConflict(c.id, shared)) === null, 'a released directory is free again');
  assert(!(await releaseLoopCwd(a.id, shared)), 'releasing twice is a no-op, not an error');

  await setLoopStatus(a.id, 'running');
  assert((await cwdLockConflict(c.id, shared)) !== null, 'a running loop holds its directory');
  await setLoopStatus(a.id, 'paused');
  assert((await cwdLockConflict(c.id, shared)) === null, 'pausing releases the directory');

  // The budget self-stop must release too — it persists `done` without going
  // through setLoopStatus, so a gate written only in the transition helper
  // would leave a finished loop holding its cwd.
  // `maxIters` is an ALLOWANCE, so the stop lands on the iteration AFTER the cap.
  const tiny = await createLoop({ ...BASE, name: 'lock tiny', cwd: shared, budget: { maxIters: 1 } });
  await setLoopStatus(tiny.id, 'running');
  const stillGoing = await recordIteration(tiny.id, { seconds: 1, tokens: 1, usd: 0 });
  assert(stillGoing.status === 'running', 'the 1-iteration allowance still runs its first iteration');
  assert((await cwdLockConflict(c.id, shared)) !== null, 'the running tiny loop holds the directory');
  const done = await recordIteration(tiny.id, { seconds: 1, tokens: 1, usd: 0 });
  assert(done.status === 'done' && done.stopReason === 'max_iters', 'the tiny loop stopped on its cap');
  assert((await cwdLockConflict(c.id, shared)) === null, 'a terminal stop releases the directory');

  // Editing the cwd of a running loop re-points its lock instead of stranding it.
  const moveA = '/tmp/probe-lock-move-a';
  const moveB = '/tmp/probe-lock-move-b';
  const mover = await createLoop({ ...BASE, name: 'lock mover', cwd: moveA });
  await setLoopStatus(mover.id, 'running');
  const moved = await updateLoop(mover.id, { cwd: moveB });
  assert(moved.cwd === moveB, 'the loop moved directory');
  assert((await cwdLockConflict(c.id, moveA)) === null, 'the OLD directory was released');
  assert((await cwdLockConflict(c.id, moveB)) !== null, 'the NEW directory is held');

  // A loop may not move ONTO a directory somebody else holds. The directory is
  // really held (its own acquire is asserted) — pointing at a free directory
  // would make the refusal below pass for the wrong reason.
  const busyDir = '/tmp/probe-lock-busy';
  const busyClaim = await acquire(busyDir, 'agent_busy', 60_000, 'busy');
  assert(busyClaim.ok, 'the busy directory was really taken');
  await expectCode(() => updateLoop(mover.id, { cwd: busyDir }), 'cwd_locked', 'moving onto a held directory is refused');
  assert((await getLoop(mover.id)).cwd === moveB, 'the refused move changed nothing');
  assert((await cwdLockConflict(c.id, moveB)) !== null, 'the refused move did not drop the held lock');
  await release(busyDir, 'agent_busy');

  // Deleting a running loop releases its directory.
  await deleteLoop(mover.id);
  assert((await cwdLockConflict(c.id, moveB)) === null, 'delete releases the directory');

  // Zero leftovers: loops AND the lock files the probe wrote. A lock file
  // outlives the process that wrote it, so "the test cleaned up" needs proof —
  // including the directly-written expired one, which no `release()` can remove.
  // `loop` is here too: the transitions section left it RESUMED, and a running
  // loop legitimately still holds its directory.
  await stopLoop(loop.id);
  for (const id of [a.id, b.id, c.id, d.id, tiny.id, loop.id]) await deleteLoop(id);
  await release(liveDir, 'agent_live');
  await rm(join(homedir(), '.lokma/agentlocks/locks', `${sha1HexSync(staleDir)}.json`), { force: true });
  assert((await listLoopLocks()).length === 0, 'the probe left no loop lock behind');
  assert((await listLocks()).length === 0, 'the probe left no lock file of any owner behind');

  console.log(`\n${passed} passed`);
}

await main();
