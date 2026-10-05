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
 * append + trim (never delete), corrupt state row skipped not fatal.
 */
import {
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
  appendLedger,
  formatLedgerEntry,
  ledgerPath,
  LOOPS_DIR,
} from './index.js';
import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDir } from '../utils/fs.js';

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

const BASE = { name: 'probe loop', cwd: '/tmp/probe-loop', prompt: 'do the thing' };

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
  await expectCode(() => createLoop({ ...BASE, name: '  ' }), 'bad_name', 'blank name refused');
  await expectCode(() => createLoop({ ...BASE, prompt: '' }), 'bad_prompt', 'blank prompt refused');
  await expectCode(() => createLoop({ ...BASE, projectId: '../escape' }), 'bad_project_id', 'traversal projectId refused');
  await expectCode(() => createLoop({ ...BASE, origin: 'cron' }), 'bad_origin', 'unknown origin refused');
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

  const capped = await createLoop({ ...BASE, name: 'capped', budget: { maxIters: 2 } });
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
  const free = await createLoop({ ...BASE, name: 'free', budget: { maxIters: 1, maxUsd: 0, maxHours: 0 } });
  const freeFirst = await recordIteration(free.id, { seconds: 3600, tokens: 999, usd: 12.5 });
  assert(freeFirst.status === 'running' && freeFirst.stopReason === null, 'a 0 usd/hours cap means unlimited spend and time');
  const freeSecond = await recordIteration(free.id, { seconds: 1, tokens: 1, usd: 0.1 });
  assert(freeSecond.stopReason === 'max_iters', 'iterations still cap when money/time are unlimited');
  assert(resolveBudget({ maxIters: 0 }).maxIters === 400, 'maxIters 0 falls back instead of disabling');
  assert(resolveBudget({ maxUsd: -3 }).maxUsd === 50, 'a negative cap is ignored');

  // ─── target score stops the loop ───────────────────────────────────────
  const targeted = await createLoop({ ...BASE, name: 'targeted', target: 'PASS' });
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
  const projLoop = await createLoop({ ...BASE, name: 'scoped', projectId: 'demo-project' });
  const freeLoop = await createLoop({ ...BASE, name: 'unscoped' });
  const all = await listLoops();
  assert(all.length === 6, `list returns every loop (${all.length})`);
  assert(all[0].createdAt >= all[all.length - 1].createdAt, 'list is newest first');
  const scoped = await listProjectLoops('demo-project');
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

  console.log(`\n${passed} passed`);
}

await main();
