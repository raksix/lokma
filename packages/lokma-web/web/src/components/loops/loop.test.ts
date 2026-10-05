/**
 * Loop console pure-helper probe (REQ-202) — run with:
 *   `bun src/components/loops/loop.test.ts` from `packages/lokma-web/web`.
 *
 * Plain asserts, no framework (tsc -b stays dependency-free); exits non-zero on
 * the first failure. The subject is the HONESTY rules: every one of these
 * assertions fails if a helper invents progress, a queue position or a "0"
 * that reads like a measurement.
 */
import {
  activityLabel,
  bestScoreLabel,
  budgetBars,
  hoursLabel,
  iterLabel,
  LOOP_EMPTY_COPY,
  nextHintLabel,
  outcomeLabel,
  remainingLabel,
  statusLabel,
  statusTone,
  stopReasonLabel,
  targetScoreLabel,
  turnInFlight,
  triggerLabel,
  usdLabel,
} from './loop';
import type { LoopView } from '@/lib/api';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  passed++;
  console.log(`PASS: ${label}`);
}

/** Minimal loop with the fields the helpers read; overrides are partial. */
function loop(over: Partial<LoopView> = {}): LoopView {
  return {
    id: 'l_00000001',
    name: 'probe loop',
    projectId: null,
    cwd: '/tmp/probe',
    prompt: 'do the thing',
    origin: 'user',
    status: 'running',
    stopReason: null,
    budget: { maxIters: 400, maxHours: 1440, maxUsd: 100 },
    spent: { iters: 24, hours: 19.6, usd: 0, tokens: 1234 },
    score: { best: null, last: null, target: null },
    nextHint: null,
    trigger: { kind: 'manual' },
    cooldownSeconds: 0,
    maxEmptyIters: 3,
    lastRunOutcome: null,
    emptyIters: 0,
    lastRunStartedAt: null,
    stopRequested: false,
    inFlightSince: null,
    model: 'probe/model',
    reasoningEffort: 'medium',
    createdAt: '2026-10-05T00:00:00.000Z',
    updatedAt: '2026-10-05T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    ...over,
  };
}

// ── status ────────────────────────────────────────────────────────────────
assert(statusTone('running') === 'live', 'running is the only live tone');
assert(statusTone('paused') === 'warn', 'paused warns');
assert(statusTone('error') === 'bad', 'error is bad');
assert(statusTone('done') === 'info', 'done is informational');
assert(statusTone('draft') === 'muted', 'draft is muted');
assert(statusLabel('draft') === 'draft', 'draft label is draft');

// ── stop reason: null for an alive loop AND for a terminal loop with no reason
assert(stopReasonLabel(null) === null, 'alive loop renders no stop-reason badge');
assert(
  stopReasonLabel(null) === null && stopReasonLabel('error') === 'error',
  'a terminal reason IS rendered',
);
assert(stopReasonLabel('max_iters') === 'hit iteration cap', 'max_iters is spelled out');
assert(stopReasonLabel('idle') === 'no progress (idle guard)', 'idle names the guard');

// ── outcome: null when never measured (never "0 turns")
assert(outcomeLabel(null) === null, 'unmeasured outcome renders nothing');
assert(outcomeLabel('empty') === 'last turn empty', 'empty outcome is explicit');

// ── budget bars: an uncapped budget must NOT paint a full bar ───────────────
const bars = budgetBars(loop());
assert(bars.iters === 24 / 400, 'iters bar is spent/cap');
assert(bars.hours > 0.013 && bars.hours < 0.014, 'hours bar is spent/cap');
assert(bars.usd === 0, 'a $0 spend is a zero bar');
assert(bars.capped === false, 'a fresh loop is not capped');
const uncapped = budgetBars(loop({ budget: { maxIters: 0, maxHours: 0, maxUsd: 0 } }));
assert(uncapped.iters === 0 && uncapped.hours === 0 && uncapped.usd === 0, 'uncapped = 0, not full');
assert(uncapped.capped === false, 'uncapped is not capped');
const capped = budgetBars(
  loop({ budget: { maxIters: 10, maxHours: 1440, maxUsd: 100 }, spent: { iters: 10, hours: 1, usd: 0, tokens: 0 } }),
);
assert(capped.capped === true && capped.iters === 1, 'hitting the iteration cap marks capped');

// ── labels ────────────────────────────────────────────────────────────────
assert(iterLabel(loop()) === 'iter 24/400', 'iter label carries both numbers');
assert(iterLabel(loop({ budget: { maxIters: 0, maxHours: 1, maxUsd: 1 } })) === 'iter 24', 'iter label drops a 0 cap');
assert(hoursLabel(loop()) === '19.6/1440h', 'hours label keeps one decimal under 100');
assert(hoursLabel(loop({ spent: { iters: 0, hours: 1234.5, usd: 0, tokens: 0 }, budget: { maxIters: 1, maxHours: 2000, maxUsd: 1 } })) === '1235/2000h', 'hours label rounds above 100');
assert(usdLabel(loop()) === '$0.00/$100', '$0 reads as two decimals, not a bare 0');
assert(usdLabel(loop({ budget: { maxIters: 1, maxHours: 1, maxUsd: 2.5 } })) === '$0.00/$2.50', 'a sub-10 usd cap keeps 2 decimals');

// ── next hint: NEVER a fallback string ────────────────────────────────────
assert(nextHintLabel(loop()) === null, 'no nextHint renders NO row (no invented position)');
assert(nextHintLabel(loop({ nextHint: '   ' })) === null, 'a blank nextHint is still no row');
assert(nextHintLabel(loop({ nextHint: ' run gate 42 ' })) === 'run gate 42', 'nextHint is shown verbatim, trimmed');

// ── remaining: null vs [] must stay distinguishable ────────────────────────
assert(remainingLabel(null) === null, 'no scope.md renders no remaining block at all');
assert(
  remainingLabel([]) !== null && /every item is checked/.test(remainingLabel([]) ?? ''),
  'an all-checked scope says so (differs from null)',
);
assert(remainingLabel(['a']) === '1 item left', 'one remaining item is singular');
assert(remainingLabel(['a', 'b', 'c']) === '3 items left', 'N remaining items pluralized');

// ── in-flight: armed != running a turn right now ──────────────────────────
assert(turnInFlight(loop({ inFlightSince: '2026-10-05T00:00:00.000Z' })) === true, 'inFlightSince means a turn is in flight');
assert(turnInFlight(loop({ inFlightSince: null, lastRunStartedAt: '2026-10-05T00:00:00.000Z' })) === false, 'armed-only is NOT in flight');
assert(
  turnInFlight(loop({ inFlightSince: '2026-10-05T00:00:00.000Z', stopRequested: true })) === false,
  'a pending stop stops the live dot',
);

// ── activity line: the honest phrasing per state ──────────────────────────
assert(activityLabel(loop({ inFlightSince: 'x' })) === 'turn in flight', 'in-flight row says so');
assert(
  activityLabel(loop({ inFlightSince: 'x', stopRequested: true })) === 'finishing this turn…',
  'a deferred stop says "finishing", never "stopped"',
);
assert(activityLabel(loop({ status: 'paused' })) === 'paused — no turn in flight', 'a paused loop claims no work');
assert(activityLabel(loop({ status: 'done' })) === 'finished', 'a done loop says finished');
assert(activityLabel(loop({ status: 'draft' })) === 'draft — never started', 'a draft admits it never ran');
assert(activityLabel(loop()) === 'armed — waiting for its trigger', 'an armed loop is not "running"');

// ── scores: opaque strings, never invented numbers ────────────────────────
assert(bestScoreLabel(loop()) === null, 'no best score renders nothing (never 0)');
assert(bestScoreLabel(loop({ score: { best: '42/44', last: '42/44', target: null } })) === '42/44', 'best score is verbatim');
assert(targetScoreLabel(loop()) === null, 'no target renders nothing');

// ── trigger: verbatim, cooldown appended only when real ────────────────────
assert(triggerLabel(loop()) === 'manual only', 'manual trigger');
assert(triggerLabel(loop({ trigger: { kind: 'interval', intervalMinutes: 10 } })) === 'every 10m', 'interval trigger');
assert(triggerLabel(loop({ trigger: { kind: 'cron', schedule: '0 3 * * *' } })) === 'cron 0 3 * * *', 'cron trigger is the raw schedule');
assert(
  triggerLabel(loop({ trigger: { kind: 'interval', intervalMinutes: 10 }, cooldownSeconds: 60 })) ===
    'every 10m · cooldown 60s',
  'a real cooldown is stated',
);

// ── empty copy: one sentence, mentions asking the agent ───────────────────
assert(/No loops yet/.test(LOOP_EMPTY_COPY), 'empty state has a sentence');
assert(/ask/i.test(LOOP_EMPTY_COPY), 'empty state says a loop can be asked for');
// Kapsam 7 asks for ONE sentence, not a paragraph — assert the spec, not a guess.
assert(LOOP_EMPTY_COPY.split('.').filter((s) => s.trim()).length === 1, 'empty copy is exactly one sentence');

console.log(`\n${passed} assertions passed`);