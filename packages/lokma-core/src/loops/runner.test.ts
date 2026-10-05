/**
 * Live probe for the loop EXECUTOR decision layer (REQ-201 slice 1).
 * Run:
 *   HOME=$(mktemp -d) bun src/loops/runner.test.ts
 * from `packages/lokma-core`. No test framework — plain asserts, same as
 * `store.test.ts`.
 *
 * Real temp HOME on disk: bun snapshots HOME at boot, so the guard refuses
 * anything outside `/tmp/` (running with the real HOME would write into the
 * live `~/.lokma/loops/`).
 *
 * Covers, one rule per assertion group, each with a NEGATIVE control so a
 * predicate that can never fail is visible as such:
 *  - trigger resolution: manual default, interval, cron (validated with cron's
 *    OWN validator), event; and the honest refusals (interval without a number)
 *  - `earliestNextTurn`: interval measured from the START, not the end; the
 *    cooldown floor between turns; a slow turn not earning an instant retry
 *  - cron trigger only fires inside a matching minute (identity matcher bound
 *    through `initLoopCalendar`, plus a stub that fires to prove the branch)
 *  - `event` never self-fires; `manual` obeys cooldown
 *  - `shouldStart`: the zero-cost switch, terminal refusal, no double-start of a
 *    running loop, forced start, target-reached refusal, and a CONTROL that a
 *    healthy loop really does start
 *  - `countIterationFor`: only `ok` advances the iteration counter
 *  - `stopReasonAfterTurn`: idle guard fires at the threshold, a lower count
 *    does not, maxIters is reported INSTEAD of idle, target wins
 *  - `recordRunTiming` on disk: empty counter advances, `ok` resets it to zero
 */
import {
  countIterationFor,
  createLoop,
  DEFAULT_COOLDOWN_SECONDS,
  DEFAULT_MAX_EMPTY_ITERS,
  earliestNextTurn,
  getLoop,
  initLoopCalendar,
  recordRunTiming,
  resolveTrigger,
  shouldStart,
  stopReasonAfterTurn,
} from './index.js';
import type { Loop } from '@lokma/shared';
import { matchesMinute } from '../cron/runner.js';
import { rm } from 'node:fs/promises';

const realHome = process.env.HOME ?? '';
if (!realHome.startsWith('/tmp/')) {
  console.error('REFUSING to run: HOME=' + realHome + ' is not a temp dir (would touch the live ~/.lokma)');
  process.exit(1);
}

let passed = 0;
const failures: string[] = [];

// Bind the REAL cron matcher before the first trigger assertion. The default
// binding is a no-op stub, so any cron-shaped assertion placed above this line
// would report `no_cron_match` no matter what the product does — a probe that
// measures nothing while reading as a measurement. (Measured: the cooldown
// block below failed clean for exactly this reason.)
initLoopCalendar(matchesMinute);

function check(cond: boolean, label: string): void {
  if (cond) {
    passed += 1;
    console.log('PASS: ' + label);
  } else {
    failures.push(label);
    console.log('FAIL: ' + label);
  }
}
function eq(actual: unknown, expected: unknown, label: string): void {
  check(actual === expected, label + ' (got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected) + ')');
}

// ─── trigger resolution ─────────────────────────────────────────────────────
eq(resolveTrigger(undefined).kind, 'manual', 'no trigger input defaults to manual');
eq(resolveTrigger({ kind: 'manual' }).kind, 'manual', 'explicit manual');
eq(JSON.stringify(resolveTrigger({ kind: 'interval', intervalMinutes: 10 })), JSON.stringify({ kind: 'interval', intervalMinutes: 10 }), 'interval round-trips');
// Discriminated union: narrow on `kind` before reading a member field.
const cronResolved = resolveTrigger({ kind: 'cron', schedule: '  0 3 * * *  ' });
eq(cronResolved.kind === 'cron' ? cronResolved.schedule : 'not-cron', '0 3 * * *', 'cron schedule is trimmed');
const eventResolved = resolveTrigger({ kind: 'event', event: 'commit' });
eq(eventResolved.kind === 'event' ? eventResolved.event : 'not-event', 'commit', 'event kind survives');
eq(eventResolved.kind === 'event' ? (eventResolved.path ?? null) : 'not-event', null, 'event defaults to no path filter');

let intervalNoNumber = 'NOT-THROWN';
try {
  resolveTrigger({ kind: 'interval' });
} catch (e) {
  intervalNoNumber = (e as { code?: string }).code ?? 'no-code';
}
eq(intervalNoNumber, 'bad_trigger', 'interval without a number is refused (not silently manual)');

let badCron = 'NOT-THROWN';
try {
  resolveTrigger({ kind: 'cron', schedule: 'not a cron' });
} catch (e) {
  badCron = (e as { code?: string }).code ?? 'no-code';
}
eq(badCron, 'bad_trigger', 'a malformed cron expression is refused');

let badInterval = 'NOT-THROWN';
try {
  resolveTrigger({ kind: 'interval', intervalMinutes: 0 });
} catch (e) {
  badInterval = (e as { code?: string }).code ?? 'no-code';
}
eq(badInterval, 'bad_trigger', 'intervalMinutes 0 is refused');

// ─── a loop fixture on disk (needed for recordRunTiming) ────────────────────
const cwd = realHome + '/loopproj';
await rm(cwd, { recursive: true, force: true });
const created = await createLoop({ name: 'probe', cwd, prompt: 'do the thing' });
eq(created.status, 'draft', 'a fresh loop is draft');
eq(created.cooldownSeconds, DEFAULT_COOLDOWN_SECONDS, 'cooldown defaults to 60s');
eq(created.maxEmptyIters, DEFAULT_MAX_EMPTY_ITERS, 'empty guard defaults to 3');
eq(created.trigger.kind, 'manual', 'a created loop starts manual');
eq(created.emptyIters, 0, 'no empty turns yet');
eq(created.lastRunStartedAt, null, 'no turn has started');

// ─── earliestNextTurn ───────────────────────────────────────────────────────
const NOW = new Date('2026-01-01T12:00:00.000Z');
const neverRan = earliestNextTurn(created, { now: NOW });
check(neverRan.at !== null, 'a loop that never ran is due immediately');
eq(neverRan.reason, 'manual', 'manual loop reason before first run');

const intervalLoop: Pick<Loop, 'trigger' | 'cooldownSeconds' | 'lastRunStartedAt'> = {
  trigger: { kind: 'interval', intervalMinutes: 10 },
  cooldownSeconds: 60,
  lastRunStartedAt: '2026-01-01T11:50:00.000Z',
};
// 10 minutes after an 11:50 start = 12:00 → exactly due now.
const onTime = earliestNextTurn(intervalLoop, { now: NOW });
check(onTime.at !== null, 'interval due exactly 10 minutes after the last START');
eq(onTime.reason, 'interval', 'due by interval');

const tooSoon = earliestNextTurn(intervalLoop, { now: new Date('2026-01-01T11:59:00.000Z') });
eq(tooSoon.at, null, 'interval is not due one minute early');
eq(tooSoon.reason, 'not_yet', 'early interval says not_yet');

// The cooldown floor: the turn STARTED at 11:50 and ENDED at 12:05 (it ran
// long). With a 60s cooldown the next start is 12:06, not 12:00 — otherwise a
// slow loop is a fast loop.
const longTurn = earliestNextTurn(intervalLoop, { now: NOW, lastTurnEndedAt: '2026-01-01T12:05:00.000Z' });
eq(longTurn.at, null, 'a turn that overran its interval is not immediately due');
eq(longTurn.reason, 'not_yet', 'cooldown floor holds the next turn back');

const afterCooldown = earliestNextTurn(intervalLoop, { now: new Date('2026-01-01T12:06:00.000Z'), lastTurnEndedAt: '2026-01-01T12:05:00.000Z' });
check(afterCooldown.at !== null, 'the next turn starts once the cooldown has passed');

// The cooldown must be proven as the LOAD-BEARING cause, not merely present:
// with a `cron` trigger matching this very minute and cooldown 0, the turn is
// due NOW. With cooldown 60 and the previous turn having ended 30s ago, the
// SAME minute is blocked by the cooldown alone. Without this pair, deleting the
// cooldown computation entirely leaves every other assertion green (measured:
// mutation `cooldownReadyMs = endedMs` exits 0), which makes the guard untested.
const zeroCooldown = earliestNextTurn(
  { trigger: { kind: 'cron', schedule: '* * * * *' }, cooldownSeconds: 0, lastRunStartedAt: '2026-01-01T11:00:00.000Z' },
  { now: new Date(2026, 0, 1, 12, 30, 0, 0), lastTurnEndedAt: '2026-01-01T12:00:00.000Z' },
);
check(zeroCooldown.at !== null, 'CONTROL: cron minute + cooldown 0 is due even though the turn ended long ago');
const coolingZero = earliestNextTurn(
  { trigger: { kind: 'cron', schedule: '* * * * *' }, cooldownSeconds: 60, lastRunStartedAt: '2026-01-01T11:00:00.000Z' },
  { now: new Date(2026, 0, 1, 12, 30, 0, 0), lastTurnEndedAt: '2026-01-01T12:29:30.000Z' },
);
eq(coolingZero.at, null, 'the cooldown alone blocks a turn inside its matching minute');
eq(coolingZero.reason, 'not_yet', 'the cooldown block says not_yet');
const cooledDone = earliestNextTurn(
  { trigger: { kind: 'cron', schedule: '* * * * *' }, cooldownSeconds: 60, lastRunStartedAt: '2026-01-01T11:00:00.000Z' },
  { now: new Date(2026, 0, 1, 12, 30, 30, 0), lastTurnEndedAt: '2026-01-01T12:29:30.000Z' },
);
check(cooledDone.at !== null, 'exactly 60s after the turn ended the cooldown releases it');

// A garbage timestamp must read as never-run, not wedge the loop.
const brokenStamp = earliestNextTurn({ ...intervalLoop, lastRunStartedAt: 'not-a-date' }, { now: NOW });
check(brokenStamp.at !== null, 'an unreadable lastRunStartedAt reads as never-ran instead of wedging');

// ─── cron trigger uses the REAL calendar ────────────────────────────────────
initLoopCalendar(matchesMinute);
const cronLoop: Pick<Loop, 'trigger' | 'cooldownSeconds' | 'lastRunStartedAt'> = {
  trigger: { kind: 'cron', schedule: '0 3 * * *' },
  cooldownSeconds: 60,
  lastRunStartedAt: '2026-01-01T03:00:00.000Z',
};
const notThreeAm = earliestNextTurn(cronLoop, { now: new Date('2026-01-01T12:00:00.000Z') });
eq(notThreeAm.at, null, 'a cron loop is not due outside its matching minute');
eq(notThreeAm.reason, 'no_cron_match', 'outside-minute says no_cron_match');

const threeAm = new Date(2026, 0, 2, 3, 0, 0, 0); // local 03:00, so matchesMinute sees 03:00
const atThreeAm = earliestNextTurn(cronLoop, { now: threeAm });
check(atThreeAm.at !== null, 'a cron loop IS due inside its matching minute');

// The matcher is INJECTED, not hardcoded: prove the branch really reads it by
// binding a stub that matches everything. (A stub that also matched nothing
// would leave both cases green — the control above is what gives this meaning.)
initLoopCalendar(() => true);
const stubDue = earliestNextTurn(cronLoop, { now: new Date('2026-01-01T12:34:00.000Z') });
check(stubDue.at !== null, 'the cron branch reads the injected matcher (stub matches)');
initLoopCalendar(matchesMinute);
const restored = earliestNextTurn(cronLoop, { now: new Date('2026-01-01T12:34:00.000Z') });
eq(restored.at, null, 'restoring the real matcher restores real behaviour');

// ─── event never self-fires ────────────────────────────────────────────────
const eventLoop: Pick<Loop, 'trigger' | 'cooldownSeconds' | 'lastRunStartedAt'> = {
  trigger: { kind: 'event', event: 'file_changed', path: null },
  cooldownSeconds: 60,
  lastRunStartedAt: null,
};
const eventNever = earliestNextTurn(eventLoop, { now: NOW });
eq(eventNever.at, null, 'an event loop is never due from the clock alone');
eq(eventNever.reason, 'event_wait', 'event loop says event_wait');

// ─── manual honours the cooldown ───────────────────────────────────────────
const manualCooling: Pick<Loop, 'trigger' | 'cooldownSeconds' | 'lastRunStartedAt'> = {
  trigger: { kind: 'manual' },
  cooldownSeconds: 60,
  lastRunStartedAt: '2026-01-01T11:59:30.000Z',
};
eq(earliestNextTurn(manualCooling, { now: NOW }).at, null, 'a manual turn still respects the cooldown');
check(earliestNextTurn(manualCooling, { now: new Date('2026-01-01T12:01:00.000Z') }).at !== null, 'manual is due once the cooldown passed');

// ─── shouldStart ───────────────────────────────────────────────────────────
const base = created;
const healthy: typeof base = { ...base, status: 'paused', budget: { maxIters: 10, maxHours: 1, maxUsd: 5 } };
const okStart = shouldStart(healthy, { now: NOW, force: true });
eq(okStart.start, true, 'CONTROL: a healthy paused loop can be started');
eq(okStart.reason, 'forced', 'forced start reports forced');

const zeroCost = shouldStart({ ...healthy, budget: { ...healthy.budget, maxUsd: 0 } }, { now: NOW, force: true });
eq(zeroCost.start, false, 'maxUsd 0 is the documented off switch, even when forced');
eq(zeroCost.reason, 'zero_cost', 'zero-cost refusal names itself');

eq(shouldStart({ ...healthy, status: 'done' }, { now: NOW, force: true }).reason, 'terminal', 'a done loop refuses to start');
eq(shouldStart({ ...healthy, status: 'error' }, { now: NOW, force: true }).reason, 'terminal', 'an error loop refuses to start');
eq(shouldStart({ ...healthy, status: 'running' }, { now: NOW }).reason, 'already_running', 'a running loop never stacks a second turn');
eq(shouldStart({ ...healthy, status: 'running' }, { now: NOW, force: true }).start, true, 'an explicit force may fire a running loop (the executor refuses mid-turn separately)');

const atCeiling = shouldStart({ ...healthy, spent: { iters: 1, hours: 2, usd: 0, tokens: 0 } }, { now: NOW, force: true });
eq(atCeiling.start, false, 'a loop already past maxHours refuses to start');
eq(atCeiling.reason, 'max_hours', 'hour ceiling names itself');

const atTarget = shouldStart({ ...healthy, score: { best: '7', last: '7', target: '7' } }, { now: NOW, force: true });
eq(atTarget.start, false, 'a loop that hit its target refuses to start');
eq(atTarget.reason, 'target_reached', 'target refusal names itself');

// A draft interval loop is due without force — the ordinary unattended path.
const draftInterval = shouldStart(
  { ...healthy, status: 'draft', trigger: { kind: 'interval', intervalMinutes: 5 }, lastRunStartedAt: null },
  { now: NOW },
);
eq(draftInterval.start, true, 'a never-run interval loop starts without force');
eq(draftInterval.reason, 'never_ran', 'never-run reason');

// ─── countIterationFor ──────────────────────────────────────────────────────
eq(countIterationFor('ok'), true, 'an ok turn advances the iteration counter');
eq(countIterationFor('empty'), false, 'an EMPTY turn does not advance it');
eq(countIterationFor('aborted'), false, 'an aborted turn does not advance it');
eq(countIterationFor('error'), false, 'an errored turn does not advance it');

// ─── stopReasonAfterTurn ────────────────────────────────────────────────────
const idleLoop = { budget: { maxIters: 100, maxHours: 10, maxUsd: 10 }, spent: { iters: 1, hours: 0, usd: 0, tokens: 0 }, score: { best: null, last: null, target: null }, emptyIters: 3, maxEmptyIters: 3 };
eq(stopReasonAfterTurn(idleLoop, 'empty'), 'idle', 'three consecutive empty turns stop the loop as idle');
eq(stopReasonAfterTurn({ ...idleLoop, emptyIters: 2 }, 'empty'), null, 'two empty turns are not yet idle');
eq(stopReasonAfterTurn(idleLoop, 'ok'), null, 'an ok turn is never idle');
// maxIters is reported INSTEAD of idle: the user set an iteration cap, so
// saying "idle" would hide the real cause of the stop.
eq(
  stopReasonAfterTurn({ ...idleLoop, spent: { iters: 101, hours: 0, usd: 0, tokens: 0 } }, 'empty'),
  'max_iters',
  'the iteration cap outranks the idle guard',
);
eq(
  stopReasonAfterTurn({ ...idleLoop, score: { best: '9', last: '9', target: '9' } }, 'ok'),
  'target_score',
  'reaching the target stops the loop',
);

// ─── recordRunTiming on disk ───────────────────────────────────────────────
const stamped = await recordRunTiming(created.id, { outcome: 'empty', startedAt: '2026-01-01T12:00:00.000Z' });
eq(stamped.lastRunOutcome, 'empty', 'the outcome is persisted');
eq(stamped.emptyIters, 1, 'an empty turn increments the consecutive counter');
eq(stamped.lastRunStartedAt, '2026-01-01T12:00:00.000Z', 'the start stamp is persisted');
const reRead1 = await getLoop(created.id);
eq(reRead1.emptyIters, 1, 'the counter survived the write (read from disk)');
const stamped2 = await recordRunTiming(created.id, { outcome: 'empty', startedAt: '2026-01-01T12:10:00.000Z' });
eq(stamped2.emptyIters, 2, 'a second empty turn increments again');
const stampedOk = await recordRunTiming(created.id, { outcome: 'ok', startedAt: '2026-01-01T12:20:00.000Z' });
eq(stampedOk.emptyIters, 0, 'an ok turn RESETS the consecutive empty counter');
eq(stampedOk.lastRunOutcome, 'ok', 'the latest outcome replaces the previous one');

// interval now measures from the recorded start, on a REAL stored loop
const intervalLoopReal = await createLoop({
  name: 'probe-interval',
  cwd,
  prompt: 'work',
  trigger: { kind: 'interval', intervalMinutes: 10, cooldownSeconds: 60 },
});
eq(intervalLoopReal.trigger.kind, 'interval', 'the stored loop kept its interval trigger');
eq((intervalLoopReal.trigger as { intervalMinutes: number }).intervalMinutes, 10, 'the stored interval survived the round trip');
eq(intervalLoopReal.cooldownSeconds, 60, 'cooldownSeconds travelled inside the trigger input');
const awaitingFirst = shouldStart({ ...intervalLoopReal, status: 'paused' }, { now: new Date() });
eq(awaitingFirst.start, true, 'the stored interval loop is due for its first turn');

await rm(cwd, { recursive: true, force: true });

console.log('');
if (failures.length > 0) {
  console.log(failures.length + ' FAILED:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log(passed + ' passed');