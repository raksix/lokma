import type { ReasoningEffort } from '@lokma/shared/protocol/ws';

/**
 * REQ-133 — thinking-budget plumbing shared by every adapter.
 *
 * The composer sends one of `off | low | medium | high`; each adapter
 * translates that into its own wire field (`reasoning_effort` on
 * Chat-Completions, `reasoning.effort` on Responses,
 * `thinking.budget_tokens` on Anthropic). This module owns the shared
 * parts: the level → budget map and the per-`base|model` memory of pairs
 * that refused the field, so a rejecting gateway costs one 400 for the
 * whole process lifetime instead of one per turn.
 */

/** Anthropic `thinking.budget_tokens` per level (must stay < max_tokens). */
export const ANTHROPIC_THINKING_BUDGETS = { low: 1024, medium: 4096, high: 6144 } as const;

/** Anthropic rejects an enabled thinking budget below this floor. */
export const ANTHROPIC_MIN_THINKING_BUDGET = 1024;

/** A level that actually asks for reasoning (`off`/undefined → null). */
export type ActiveReasoning = Exclude<ReasoningEffort, 'off'>;

/** Normalize the composer pick: `off`/undefined means "send no field". */
export function activeEffort(effort: ReasoningEffort | undefined): ActiveReasoning | null {
  return effort && effort !== 'off' ? effort : null;
}

/** Anthropic budget for a level, clamped to its documented floor. */
export function anthropicThinkingBudget(effort: ActiveReasoning): number {
  return Math.max(ANTHROPIC_MIN_THINKING_BUDGET, ANTHROPIC_THINKING_BUDGETS[effort]);
}

/**
 * Process-lifetime memory of upstreams that rejected a reasoning field.
 * Safe by design: a model that cannot take the field never will, and a
 * restart re-probes.
 */
const reasoningRejected = new Set<string>();

/** Key an upstream+model pair for the rejection memory. */
export function reasoningKey(base: string, model: string): string {
  return `${base}|${model}`;
}

/** True when this pair must not receive a reasoning field. */
export function reasoningBlocked(key: string): boolean {
  return reasoningRejected.has(key);
}

/** Remember that this pair refuses the reasoning field. */
export function markReasoningRejected(key: string): void {
  reasoningRejected.add(key);
}

/** Test seam — forget every remembered rejection. */
export function resetReasoningMemory(): void {
  reasoningRejected.clear();
}

/**
 * Does this upstream error look like "I do not know this reasoning
 * field"? Kept narrow: the wording must mention reasoning/thinking/effort
 * AND read as a capability rejection, so a genuine bad request (bad key,
 * bad model) is never swallowed as a probe.
 */
export function looksLikeReasoningUnsupported(status: number, snippet: string): boolean {
  if (status !== 400 && status !== 404 && status !== 422 && status !== 500) return false;
  const s = snippet.toLowerCase();
  if (s.indexOf('reason') < 0 && s.indexOf('thinking') < 0 && s.indexOf('effort') < 0) return false;
  return (
    s.indexOf('not support') >= 0 ||
    s.indexOf('unsupported') >= 0 ||
    s.indexOf('unknown') >= 0 ||
    s.indexOf('invalid') >= 0 ||
    s.indexOf('unrecognized') >= 0 ||
    s.indexOf('not allowed') >= 0 ||
    s.indexOf('unexpected') >= 0
  );
}
