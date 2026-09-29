import type { CostTotal } from '@/lib/ws';
import { formatCostBadge } from '@/components/header';

/**
 * REQ-174 — the run meta line under the transcript.
 *
 * Before this helper the line was an inline expression in `chat/index.tsx`
 * (`4.8k · $0.00 · model`), so the level a run actually applied had no
 * visible trace and a pick change read as "nothing happened". The line now
 * ends with `thinking: <level>` whenever the server stamped one on the cost
 * frame; engine-driven runs (no level) simply omit it instead of guessing.
 *
 * Returns null while the session has no billed run yet (tokens 0), the same
 * gate the inline expression used.
 */
export function runMetaLabel(cost: CostTotal): string | null {
  if (cost.inputTokens + cost.outputTokens <= 0) return null;
  let label = formatCostBadge(cost);
  if (cost.model) label += ' · ' + cost.model;
  if (cost.reasoningEffort) label += ' · thinking: ' + cost.reasoningEffort;
  return label;
}
