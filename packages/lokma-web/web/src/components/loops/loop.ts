/**
 * Pure helpers for the loop console (REQ-202).
 *
 * No fetching here — the pane and the Settings → Loops section own all I/O
 * through `@/lib/api`. Everything in this module is a pure function over a
 * `LoopView` so the honesty rules (kapsam 2/6) are unit-provable without a DOM.
 *
 * The central rule: the console NEVER invents progress. A row with no data
 * renders an honest "—" or an explicit "no measurement", never a zero that
 * reads as a measurement, and never a fabricated queue position.
 */
import type { LoopRunOutcome, LoopStatus, LoopStopReason, LoopView } from '@/lib/api';

/** Status → badge tone token. `running` is the only live/pulsing one. */
export function statusTone(status: LoopStatus): 'live' | 'info' | 'warn' | 'bad' | 'muted' {
  if (status === 'running') return 'live';
  if (status === 'paused') return 'warn';
  if (status === 'error') return 'bad';
  if (status === 'done') return 'info';
  return 'muted';
}

/** Human label for a status (English UI copy; chat/report stays Turkish). */
export function statusLabel(status: LoopStatus): string {
  if (status === 'running') return 'running';
  if (status === 'paused') return 'paused';
  if (status === 'done') return 'done';
  if (status === 'error') return 'error';
  return 'draft';
}

/**
 * Why a finished loop stopped (kapsam 6: a `done` loop closes with its reason).
 *
 * Returns `null` while the loop is alive AND when a terminal loop carries no
 * reason: the badge is then omitted rather than replaced with a guess.
 */
export function stopReasonLabel(reason: LoopStopReason | null): string | null {
  if (!reason) return null;
  if (reason === 'max_iters') return 'hit iteration cap';
  if (reason === 'max_hours') return 'hit hour cap';
  if (reason === 'budget') return 'hit budget';
  if (reason === 'target_score') return 'target score reached';
  if (reason === 'idle') return 'no progress (idle guard)';
  if (reason === 'stopped') return 'stopped by user';
  return 'error';
}

/** How the LAST measured turn went — the idle guard's evidence, shown as-is. */
export function outcomeLabel(outcome: LoopRunOutcome | null): string | null {
  if (!outcome) return null;
  if (outcome === 'ok') return 'last turn ok';
  if (outcome === 'empty') return 'last turn empty';
  if (outcome === 'aborted') return 'last turn aborted';
  return 'last turn errored';
}

export type BudgetBar = {
  /** 0..1; 0 when the cap is 0 (nothing to consume — not a full bar). */
  iters: number;
  hours: number;
  usd: number;
  /** True when ANY of the three is capped out (the bar turns red). */
  capped: boolean;
};

function ratio(spent: number, cap: number): number {
  if (!(cap > 0)) return 0;
  if (!Number.isFinite(spent) || spent < 0) return 0;
  return Math.min(1, spent / cap);
}

/**
 * Budget bars (kapsam 2: `hours 19.6/1440 · $0.00/100`).
 *
 * A zero cap yields 0, NOT 1 — an uncapped budget must not paint a full bar.
 */
export function budgetBars(loop: Pick<LoopView, 'budget' | 'spent'>): BudgetBar {
  const iters = ratio(loop.spent.iters, loop.budget.maxIters);
  const hours = ratio(loop.spent.hours, loop.budget.maxHours);
  const usd = ratio(loop.spent.usd, loop.budget.maxUsd);
  return { iters, hours, usd, capped: iters >= 1 || hours >= 1 || usd >= 1 };
}

/** `iter 24/400` — always both numbers; a cap of 0 renders `unlimited`. */
export function iterLabel(loop: Pick<LoopView, 'budget' | 'spent'>): string {
  if (!(loop.budget.maxIters > 0)) return 'iter ' + loop.spent.iters;
  return `iter ${loop.spent.iters}/${loop.budget.maxIters}`;
}

/** `19.6/1440 h` — one decimal under 100, whole numbers above. */
export function hoursLabel(loop: Pick<LoopView, 'budget' | 'spent'>): string {
  const { spent, budget } = loop;
  const h = (v: number) => (v < 100 ? v.toFixed(1) : String(Math.round(v)));
  if (!(budget.maxHours > 0)) return `${h(spent.hours)}h`;
  return `${h(spent.hours)}/${Math.round(budget.maxHours)}h`;
}

/** `$0.00/100` — money always keeps 2 decimals so $0 reads as "not spent". */
export function usdLabel(loop: Pick<LoopView, 'budget' | 'spent'>): string {
  const { spent, budget } = loop;
  const u = `$${spent.usd.toFixed(2)}`;
  if (!(budget.maxUsd > 0)) return u;
  return `${u}/$${budget.maxUsd.toFixed(budget.maxUsd < 10 ? 2 : 0)}`;
}

/**
 * The "Sırada" row (kapsam 2, `next_hint`).
 *
 * Returns `null` when the loop wrote no hint so the row is OMITTED. Any
 * fallback text here ("next run soon") would be an invented queue position,
 * which kapsam 3 forbids.
 */
export function nextHintLabel(loop: Pick<LoopView, 'nextHint'>): string | null {
  const hint = loop.nextHint?.trim();
  return hint ? hint : null;
}

/**
 * "Neler kaldı?" source (kapsam 3).
 *
 * Three honest answers, never two: `null` (no `scope.md` — the panel shows the
 * `nextHint` and NO list), `[]` (a scope file whose items are all checked), or
 * the unchecked items. The panel must branch on `null`, never on length.
 */
export function remainingLabel(remaining: string[] | null): string | null {
  if (remaining === null) return null;
  const n = remaining.length;
  if (n === 0) return 'nothing left in scope.md — every item is checked';
  return n === 1 ? '1 item left' : `${n} items left`;
}

/**
 * Is a turn REALLY in flight (kapsam 5/6)?
 *
 * `status: 'running'` means the loop is ARMED, not that a turn is right now —
 * the executor stamps `inFlightSince` when it dispatches and clears it when the
 * turn books its measurement. A live row dot therefore rides this, not the
 * status. `stopRequested` wins over it: the user asked to stop, so the row must
 * read "finishing this turn", never "running".
 */
export function turnInFlight(loop: Pick<LoopView, 'inFlightSince' | 'stopRequested'>): boolean {
  return loop.inFlightSince !== null && loop.stopRequested === false;
}

/** Row sub-line: what the loop is doing right now, in honest words. */
export function activityLabel(
  loop: Pick<LoopView, 'status' | 'inFlightSince' | 'stopRequested' | 'lastRunOutcome'>,
): string {
  if (loop.stopRequested && loop.inFlightSince !== null) return 'finishing this turn…';
  if (turnInFlight(loop)) return 'turn in flight';
  if (loop.status === 'paused') return 'paused — no turn in flight';
  if (loop.status === 'done') return 'finished';
  if (loop.status === 'error') return 'last turn failed';
  if (loop.status === 'draft') return 'draft — never started';
  return 'armed — waiting for its trigger';
}

/**
 * Best score to show in the row (kapsam 2, `best`).
 *
 * Opaque string, rendered verbatim. `null` when the loop never scored — the
 * harness has no idea what scale a loop measures, so it must not print `0`.
 */
export function bestScoreLabel(loop: Pick<LoopView, 'score'>): string | null {
  const best = loop.score.best?.trim();
  return best ? best : null;
}

/** Target score, or `null` — "no target set" is not "target 0". */
export function targetScoreLabel(loop: Pick<LoopView, 'score'>): string | null {
  const target = loop.score.target?.trim();
  return target ? target : null;
}

/** One-line trigger description for the detail panel (verbatim, no guesses). */
export function triggerLabel(loop: Pick<LoopView, 'trigger' | 'cooldownSeconds'>): string {
  const t = loop.trigger;
  let base: string;
  if (t.kind === 'interval') base = `every ${t.intervalMinutes}m`;
  else if (t.kind === 'cron') base = `cron ${t.schedule}`;
  else if (t.kind === 'event') base = `on ${t.event}${t.path ? ` (${t.path})` : ''}`;
  else base = 'manual only';
  return loop.cooldownSeconds > 0 ? `${base} · cooldown ${loop.cooldownSeconds}s` : base;
}

/** Empty-catalog copy (kapsam 7): ONE sentence + the fact a loop can be asked for. */
export const LOOP_EMPTY_COPY = 'No loops yet — create one here, or just ask your agent for one.';