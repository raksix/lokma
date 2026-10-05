import type { Loop, LoopRunOutcome, LoopStopReason, LoopTrigger } from '@lokma/shared';
import { budgetBreach, targetReached } from './store.js';

/**
 * Loop executor — the DECISION half (REQ-201 §1–3, §7).
 *
 * Everything in this module is pure and takes its clock as an argument. The
 * module that actually enqueues prompts and pumps runs lives in the server
 * package (`loops/executor.ts`) because it needs `session-runs.ts`; keeping the
 * policy here means the rules that decide "may this turn fire, does it count,
 * does the loop stop" are unit-testable without a store, a queue or a model.
 *
 * The rules are deliberately strict, because every one of them exists to stop
 * an unbounded background loop from spending money:
 *
 * - **Zero-cost is literal.** `budget.maxUsd === 0` means "no ceiling on this
 *   dimension" in the store's `resolveBudget`… but for a loop it is the
 *   documented OFF SWITCH (`stopReason: 'budget'`). `shouldStart` checks it
 *   before anything else, so a loop parked at zero never reaches the provider.
 * - **One turn at a time.** A loop that is already `running` refuses a second
 *   start regardless of how due it is; the empty-turn and cooldown guards below
 *   then decide whether the FINISHED turn earned another one.
 * - **Cooldown is measured from the start, not the end.** A nine-minute turn
 *   with `intervalMinutes: 5` does not immediately earn another one — otherwise
 *   a slow loop is a fast loop.
 * - **A turn that did nothing is not progress.** `countIterationFor` returns
 *   false for an `empty` outcome, so `spent.iters` cannot advance on a turn
 *   that produced no tool call and no line of work; the loop then stops itself
 *   as `idle` instead of burning `maxIters` proving it has nothing to do.
 */

export const DEFAULT_LOOP_COOLDOWN_SECONDS = 60;
export const DEFAULT_LOOP_MAX_EMPTY_ITERS = 3;

export type LoopRunTiming = {
  /** When the previous turn started (null before the first turn). */
  lastRunStartedAt: string | null;
  /** When the previous turn finished (null before the first turn). */
  lastRunFinishedAt: string | null;
};

export type DueReason =
  | 'manual'
  | 'interval'
  | 'cron'
  | 'never_ran'
  | 'not_yet'
  | 'cooldown'
  | 'no_cron_match'
  | 'event_wait';

export type NextTurn = { at: Date | null; reason: DueReason };

/**
 * Parse a stored ISO timestamp, tolerating a null/garbage value by returning
 * null. A loop whose `lastRunStartedAt` cannot be read is treated as
 * never-run rather than crashed-on-boot, because a bad timestamp must not wedge
 * a loop the user is trying to resume.
 */
function parseStamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * When may this loop next fire? The earliest instant allowed by its trigger,
 * the cooldown, and the "one turn in flight" rule combined. `null` means the
 * loop is not eligible yet (see `DueDecision.reason` for which rule said no).
 *
 * `lastTurnEndedAt` is when the PREVIOUS turn finished — passing it is what
 * makes the cooldown a floor between turns rather than a schedule that a slow
 * turn can overrun.
 */
export function earliestNextTurn(
  loop: Pick<Loop, 'trigger' | 'cooldownSeconds' | 'lastRunStartedAt'>,
  opts: { now: Date; lastTurnEndedAt?: string | null },
): NextTurn {
  const nowMs = opts.now.getTime();
  const trigger: LoopTrigger = loop.trigger;
  const startedMs = parseStamp(loop.lastRunStartedAt);
  let earliestMs = nowMs;
  let reason: DueReason = 'interval';

  if (trigger.kind === 'manual') {
    // Manual loops still honour a cooldown so a user hammering Run cannot
    // stack turns, but nothing else ever fires them.
    if (startedMs === null) return { at: opts.now, reason: 'manual' };
    const readyMs = startedMs + loop.cooldownSeconds * 1000;
    if (nowMs < readyMs) return { at: null, reason: 'cooldown' };
    return { at: opts.now, reason: 'manual' };
  }

  if (trigger.kind === 'interval') {
    if (startedMs === null) return { at: opts.now, reason: 'never_ran' };
    earliestMs = startedMs + trigger.intervalMinutes * 60_000;
    reason = 'interval';
  } else if (trigger.kind === 'cron') {
    // Reuses the cron module's matcher — one calendar, two concepts. A cron
    // loop is due on any matching MINUTE, so the check is "are we inside a
    // matching minute", not "did we cross an edge since the last poll".
    if (!matchesLoopMinute(trigger.schedule, opts.now)) return { at: null, reason: 'no_cron_match' };
    if (startedMs === null) return { at: opts.now, reason: 'never_ran' };
    earliestMs = startedMs + loop.cooldownSeconds * 1000;
    reason = 'cron';
  } else {
    // `event` loops are woken by the caller pushing a signal (a file watcher /
    // commit hook), NOT by the clock. The pure layer therefore reports "waiting
    // for an event" as NOT due, so a poll can never fire one twice; the caller's
    // event path calls `shouldStart(..., { force: true })` after the signal.
    return { at: null, reason: 'event_wait' };
  }

  // Cooldown floor between the END of the previous turn and the next START.
  const endedMs = parseStamp(opts.lastTurnEndedAt);
  if (endedMs !== null) {
    const cooldownReadyMs = endedMs + loop.cooldownSeconds * 1000;
    if (cooldownReadyMs > earliestMs) earliestMs = cooldownReadyMs;
  }
  if (nowMs < earliestMs) return { at: null, reason: 'not_yet' };
  return { at: new Date(earliestMs), reason };
}

/** Is the loop inside a minute its cron expression matches? Injected matcher. */
let matchesLoopMinute: (schedule: string, at: Date) => boolean = () => false;

/**
 * Bind the calendar. `lokma-core`'s cron module owns the 5-field matcher; this
 * indirection exists so this module stays import-cycle-free while still using
 * the REAL matcher in production (the store's `initLoopCalendar()` is called
 * once at server boot). Tests bind the identity or a stub.
 */
export function initLoopCalendar(matcher: (schedule: string, at: Date) => boolean): void {
  matchesLoopMinute = matcher;
}

/** True when the loop is allowed to start a turn RIGHT NOW. */
export function shouldStart(
  loop: Pick<Loop, 'status' | 'budget' | 'trigger' | 'cooldownSeconds' | 'lastRunStartedAt' | 'score' | 'spent'>,
  opts: { now: Date; force?: boolean; lastTurnEndedAt?: string | null },
): { start: boolean; reason: string } {
  // 1. The documented zero-cost switch: a loop parked at maxUsd 0 never starts.
  if (loop.budget.maxUsd === 0) return { start: false, reason: 'zero_cost' };
  // 2. Terminal states are terminal; only a fresh run may begin.
  if (loop.status === 'done' || loop.status === 'error') return { start: false, reason: 'terminal' };
  // 3. An explicit user Run button may fire a paused loop once (it resumes it),
  //    but a loop that is already running is mid-turn: never stack a second.
  if (loop.status === 'running' && !opts.force) return { start: false, reason: 'already_running' };
  // 4. Continuous budget already exhausted (maxIters/maxHours are checked in
  //    budgetBreach against the PREVIOUS spend; this catches a forced start on
  //    a loop that was parked exactly at a ceiling).
  const breach = budgetBreach(loop);
  if (breach && (breach === 'max_hours' || breach === 'budget')) return { start: false, reason: breach };
  // 5. Target already reached — no point spending another turn.
  if (targetReached(loop)) return { start: false, reason: 'target_reached' };
  // 6. Trigger / cooldown due-ness.
  const due = earliestNextTurn(loop, { now: opts.now, lastTurnEndedAt: opts.lastTurnEndedAt });
  if (opts.force) return { start: true, reason: 'forced' };
  if (due.at === null) return { start: false, reason: due.reason };
  return { start: true, reason: String(due.reason) };
}

/**
 * Does this finished turn advance `spent.iters`? An `empty` turn does NOT — it
 * still records wall time and cost, but advancing the iteration counter would
 * let a loop that does nothing eventually reach `maxIters` and read as if it
 * had done `maxIters` units of work.
 */
export function countIterationFor(outcome: LoopRunOutcome): boolean {
  return outcome === 'ok';
}

/**
 * After recording a turn, has the loop run out of road? Returns the stop reason
 * or null to keep going. `idle` is checked here (not in the store) because it
 * depends on the CONSECUTIVE empty count, which the executor owns.
 *
 * Order is a correctness rule, not a preference: budget and target are checked
 * BEFORE the idle guard. An empty turn never advances `spent.iters`
 * (`countIterationFor`), so a loop that is sitting on its iteration cap reached
 * it on an EARLIER, non-empty turn — reporting `idle` there would blame the
 * idle guard for a stop the user actually configured with `maxIters`.
 */
export function stopReasonAfterTurn(
  loop: Pick<Loop, 'budget' | 'spent' | 'score' | 'emptyIters' | 'maxEmptyIters'>,
  outcome: LoopRunOutcome,
): LoopStopReason | null {
  const breach = budgetBreach(loop);
  if (breach) return breach;
  if (targetReached(loop)) return 'target_score';
  if (outcome === 'empty' && loop.emptyIters >= loop.maxEmptyIters) return 'idle';
  return null;
}