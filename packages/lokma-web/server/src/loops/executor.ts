import {
  appendLedger,
  countIterationFor,
  formatLedgerEntry,
  getLoop,
  initLoopCalendar,
  markTurnDispatched,
  recordIteration,
  recordRunTiming,
  SessionStore,
  setLoopStatus,
  shouldStart,
  stopReasonAfterTurn,
  LoopError,
  matchesMinute,
} from '@lokma/core';
import type { Loop, LoopRunOutcome, LoopStopReason, ReasoningEffort } from '@lokma/shared';
import { REASONING_EFFORTS } from '@lokma/shared';
import {
  awaitTurnReport,
  enqueuePrompt,
  type TurnReport,
} from '../session-runs.js';
import { emitLoopChange } from './events.js';

/**
 * Loop executor — the ACTION half (REQ-201).
 *
 * `lokma-core/src/loops/runner.ts` owns the pure policy (may this turn fire,
 * does it count, does the loop stop). This module owns everything that needs a
 * live session: it writes the loop's prompt into a real transcript, rides the
 * EXISTING session-scoped run queue (`session-runs.ts`) instead of inventing a
 * second one, and books the measured result back into the loop record + ledger.
 *
 * Why the existing queue: a loop turn is an ordinary agent turn. Two queues
 * would mean two histories for the same session, and the transcript would stop
 * being the source of truth (a rule this codebase has been bitten by repeatedly
 * — the duplicate-prompt bug, the multi-socket fan-out, the persistence trap).
 * The loop is a SCHEDULER of prompts, never an alternative run path.
 *
 * Every failure is BOOKKEEPED, never thrown at the ticker: an executor that
 * crashes between two turns leaves `running` loops spinning forever with a
 * frozen budget. So each failure writes an honest outcome, and the one case
 * that must stop the loop (a real error) records `stopReason: 'error'`.
 */

/** Fire-and-forget run pump bound by the server (`pumpSessionRun` in routes/ws). */
export type PumpFn = (sessionId: string, cwd: string) => void;

/** Mint a turn tag: `lt_` + 8 hex. Correlation only, never parsed. */
function mintTurnTag(): string {
  return `lt_${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Session id for a loop's turns. STABLE per loop and reused across turns:
 * continuity IS the point (turn 2 sees turn 1), and a fresh id per turn would
 * give every iteration an empty memory while still looking like it ran.
 *
 * The `sess_` prefix + charset satisfies the store's `SESSION_ID_PATTERN`, so
 * `locateSession()` can find it by filename scan like any other session.
 */
export function loopSessionId(loopId: string): string {
  return `sess_loop_${loopId.replace(/[^A-Za-z0-9_-]/g, '')}`;
}

export type RunLoopTurnOptions = {
  /** Bound pump — the server owns `app`, the executor never spawns a run. */
  pump: PumpFn;
  /** Turn ceiling; an honest `error` report resolves when exceeded. */
  timeoutMs: number;
  /** Clock seam (probes inject a fixed one). */
  now?: () => Date;
  /** Skip the trigger/cooldown decision — the user pressed Run. */
  force?: boolean;
};

export type RunLoopTurnResult = {
  /** False when the loop was not allowed to start; `reason` says which rule. */
  started: boolean;
  reason: string;
  loop: Loop;
  /** Present only when a turn actually ran. */
  report?: TurnReport;
  /** Loop stop reason applied after the turn, if any. */
  stopReason?: string;
};

/**
 * Run at most ONE iteration of a loop: enqueue its prompt, wait for the
 * measured result, book it, and decide whether the loop keeps going.
 *
 * One turn per call is deliberate. The ticker (REQ-202/203 wires it) polls at
 * a sane cadence; a self-scheduling `while` inside the executor would make a
 * loop's real cadence a function of model latency, which is how background
 * loops quietly become a token firehose.
 */
export async function runLoopTurn(
  loopId: string,
  opts: RunLoopTurnOptions,
): Promise<RunLoopTurnResult> {
  const now = opts.now ?? (() => new Date());
  let loop = await getLoop(loopId);

  // The calendar is bound here as well as at boot: this module is the first
  // thing a probe drives, and a silently-unbound matcher would answer
  // `no_cron_match` for EVERY cron loop while looking like correct behaviour.
  initLoopCalendar(matchesMinute);

  const gate = shouldStart(loop, { now: now(), force: opts.force });
  if (!gate.start) return { started: false, reason: gate.reason, loop };

  if (loop.status !== 'running') {
    // Draft → running also CLAIMS the cwd lock (two loops in one directory is
    // refused by the store, not by the executor).
    loop = await setLoopStatus(loopId, 'running');
  }

  const store = new SessionStore(loop.cwd);
  const sessionId = loopSessionId(loopId);
  const startedAt = now().toISOString();

  // REQ-201: a real prompt lands in the transcript, not just the queue. The
  // WS prompt path appends the user row before enqueueing precisely so the
  // transcript is the source of truth — the loop obeys the same contract.
  await store.writeMeta(sessionId, {
    model: loop.model,
    title: `loop · ${loop.name}`,
  });
  await store.append(sessionId, {
    role: 'user',
    content: loop.prompt,
    timestamp: startedAt,
  });

  // Bind the waiter BEFORE enqueueing: a fast stub pump can complete the turn
  // synchronously, and a waiter registered afterwards would find nobody to
  // report to and time out against a turn that already finished.
  const tag = mintTurnTag();
  const reported = awaitTurnReport(tag, opts.timeoutMs);
  // Stamp the dispatch BEFORE enqueueing, so the record on disk already says a
  // turn is in flight. `POST /:id/pause` reads this flag to decide between
  // "finish the turn then pause" and "pause right now", and boot recovery reads
  // it to settle a turn that died with the process. Enqueueing first would open
  // a window where the work is queued but the record still claims nothing is
  // running — exactly the window a user clicks Stop in.
  await markTurnDispatched(loopId, startedAt);
  enqueuePrompt(sessionId, {
    prompt: loop.prompt,
    model: loop.model,
    // The record stores `reasoningEffort` as a plain string (schema tolerance
    // for a ladder that grows), but the queue's field is the closed union the
    // adapter reads. Resolve it against the real ladder: passing the raw string
    // through is exactly the "open a closed union" trap — an unknown level
    // would travel as a lie instead of falling back to `off`.
    reasoningEffort: resolveEffort(loop.reasoningEffort),
    enqueuedAt: startedAt,
    tag,
  });
  opts.pump(sessionId, loop.cwd);
  const report = await reported;

  const outcome = loopOutcomeFor(report);
  // `recordRunTiming` FIRST: it persists the empty counter and the start
  // stamp that `interval` measures from, and both must survive even when the
  // turn does not count as an iteration.
  await recordRunTiming(loopId, { outcome, startedAt });
  const measured = await recordIteration(
    loopId,
    {
      seconds: report.seconds,
      tokens: report.inputTokens + report.outputTokens,
      // An aborted turn is not billed (same rule as the chat usage frame), so
      // it must not be charged to the loop's usd budget either.
      //
      // Decided from the OUTCOME, not from `report.billed`: the pump already
      // gates billing on the terminal frame, so trusting the flag meant an
      // aborted turn that somehow carried a cost was charged. Keying it on the
      // outcome makes the rule hold no matter what the report says — and that is
      // what the proven-to-fail mutation proved was untested when both sides
      // agreed (`costUsd: 0` masked it, 72/72 stayed green).
      usd: outcome === 'aborted' || outcome === 'error' ? 0 : report.costUsd,
    },
    { countIteration: countIterationFor(outcome) },
  );

  await appendLedger(
    loopId,
    formatLedgerEntry({
      iteration: measured.spent.iters,
      at: new Date(now().getTime()).toISOString(),
      summary: summarizeTurn(report),
      measured: `${report.seconds.toFixed(1)}s · ${report.inputTokens + report.outputTokens} tok`,
      next: measured.nextHint ?? undefined,
    }),
  );

  // REQ-201: a FAILED turn stops the loop as `error`, decided from the
  // OUTCOME — not from whether the report happened to carry a message. Keying
  // it on `report.error` meant an error with no message string (a provider
  // 500 with an empty body, a pump that died without a frame) left the loop
  // `running` and retried a dead endpoint forever, burning its budget on a
  // hot retry loop. `error` is a real status: the loop needs human attention,
  // and `done` would falsely claim it finished its work.
  //
  // An `aborted` turn is deliberately NOT terminal: the user interrupting a
  // turn is not a broken loop, and stopping is an explicit action they can
  // take when they mean it.
  const stopReason: LoopStopReason | null =
    stopReasonAfterTurn(measured, outcome) ?? (outcome === 'error' ? 'error' : null);
  let final = measured;
  if (stopReason) {
    final = await setLoopStatus(loopId, stopReason === 'error' ? 'error' : 'done', { stopReason });
  } else if (await applyDeferredStop(loopId)) {
    // REQ-201 kapsam 6: the user pressed Stop WHILE this turn ran. The turn was
    // deliberately not cut, so it finished and booked its real usage above — now
    // the loop honours the request. Pausing AFTER the booking is the whole point:
    // the ledger carries the turn's true measurement instead of a half-written
    // turn plus a "stopped" badge.
    final = await getLoop(loopId);
  }
  // REQ-202 kapsam 5: the turn is BOOKED and the status settled — only now is
  // a console row allowed to change. Announcing earlier would render the row
  // with `inFlightSince` cleared while `spent.iters` still reads the old
  // value, which is exactly the "one iteration behind" flicker the frame is
  // meant to remove.
  emitLoopChange([loopId]);

  return { started: true, reason: gate.reason, loop: final, report, stopReason: stopReason ?? undefined };
}

/**
 * Apply a stop the user requested while a turn was in flight. Returns true when
 * this call is the one that paused the loop.
 *
 * Read AFTER the turn is booked on purpose, and re-read from the record rather
 * than trusted from a variable captured before the turn: the pause route writes
 * the flag concurrently, so a snapshot taken at turn start would miss a Stop the
 * user pressed two seconds ago. A terminal loop (the turn's own budget/target
 * stop already landed) is left alone — its stopReason is the more truthful one.
 */
async function applyDeferredStop(loopId: string): Promise<boolean> {
  const current = await getLoop(loopId);
  if (!current.stopRequested || current.status !== 'running') return false;
  await setLoopStatus(loopId, 'paused', { stopReason: 'stopped' });
  return true;
}

/**
 * Map a turn report onto the loop's outcome vocabulary.
 *
 * The load-bearing case is `empty`: a completed turn that ran no tool is not
 * progress, and the idle guard counts it. Counting prose as work is how a loop
 * talks to itself forever and reads as healthy while doing nothing.
 */
export function loopOutcomeFor(report: TurnReport): LoopRunOutcome {
  if (report.outcome === 'aborted') return 'aborted';
  if (report.outcome === 'error') return 'error';
  return report.didWork ? 'ok' : 'empty';
}

/** One honest line for the ledger — never a stack, never a raw provider dump. */
function summarizeTurn(report: TurnReport): string {
  if (report.outcome === 'error') return `turn failed (${report.error ?? 'unknown'})`;
  if (report.outcome === 'aborted') return 'turn aborted';
  if (!report.didWork) return 'turn completed with no tool work (counts as empty)';
  return 'turn completed with tool work';
}

/** Re-exported so the server routes can report an unknown loop consistently. */
export { LoopError };

/**
 * Abort a loop's in-flight turn NOW (REQ-201 kapsam 6).
 *
 * The cut is done by the caller (the route), because only it owns the session's
 * `AbortController` — the very one the chat Stop button uses, so the agent loop
 * honours the signal and the turn's report settles as `aborted` with the work it
 * really did. This module therefore only reports whether there WAS a turn to cut,
 * so the route can say `cutTurn: false` instead of implying a cut that never
 * happened (a stop that pretends to have interrupted work is worse than no stop).
 */
export function loopTurnInFlight(loop: Pick<Loop, 'inFlightSince'>): boolean {
  return loop.inFlightSince !== null;
}

/**
 * Resolve a stored effort level against the REAL ladder, falling back to `off`.
 *
 * `Loop.reasoningEffort` is a free string by schema design (the ladder grows
 * over releases), while the queue field is the closed union the provider
 * adapter reads. An unrecognised level must degrade to `off`, not be forwarded
 * as-is: an invented level reaches the wire as a request the upstream rejects,
 * which surfaces as a turn error the loop then books as `error` and stops.
 */
export function resolveEffort(value: string | undefined): ReasoningEffort {
  const levels: readonly string[] = REASONING_EFFORTS;
  return levels.includes(value ?? '') ? (value as ReasoningEffort) : 'off';
}
