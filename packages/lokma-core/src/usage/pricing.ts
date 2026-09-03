/**
 * Model pricing — public list prices ($ per 1M tokens, snapshot Sep 2026).
 * Providers report no token counts in Phase 0 (mock adapters stream text
 * only), so usage accounting estimates tokens as `ceil(chars / 4)` and
 * prices them with this table. Unknown models are `priced: false`
 * (costUsd 0) — the UI labels them "unpriced" instead of inventing a rate.
 * See Docs/22 §usage.
 */

export type ModelPrice = {
  /** $ per 1M input tokens. */
  inputPer1M: number;
  /** $ per 1M output tokens. */
  outputPer1M: number;
  /** Human family label shown in the Usage pane (e.g. "sonnet"). */
  family: string;
};

/** $/1M in/out for model ids we know (full `provider/id` form). */
const EXACT_PRICES: Record<string, ModelPrice> = {
  'anthropic/claude-opus-4-5': { inputPer1M: 15, outputPer1M: 75, family: 'opus' },
  'anthropic/claude-opus-4': { inputPer1M: 15, outputPer1M: 75, family: 'opus' },
  'anthropic/claude-sonnet-4-5': { inputPer1M: 3, outputPer1M: 15, family: 'sonnet' },
  'anthropic/claude-sonnet-4': { inputPer1M: 3, outputPer1M: 15, family: 'sonnet' },
  'anthropic/claude-haiku-4-5': { inputPer1M: 1, outputPer1M: 5, family: 'haiku' },
  'anthropic/claude-haiku-4': { inputPer1M: 1, outputPer1M: 5, family: 'haiku' },
  'openai/gpt-4o': { inputPer1M: 2.5, outputPer1M: 10, family: 'gpt-4o' },
  'openai/gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6, family: 'gpt-4o-mini' },
  'deepseek/deepseek-chat': { inputPer1M: 0.27, outputPer1M: 1.1, family: 'deepseek' },
  'deepseek/deepseek-reasoner': { inputPer1M: 0.55, outputPer1M: 2.19, family: 'deepseek' },
  'google/gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10, family: 'gemini-pro' },
  'google/gemini-2.5-flash': { inputPer1M: 0.3, outputPer1M: 2.5, family: 'gemini-flash' },
};

/**
 * Family fallback — same-family dated variants (e.g.
 * `anthropic/claude-sonnet-4-5-20250929`) share the family list price.
 * Only applies to providers whose families we know; anything else is
 * unpriced (never guess a rate for an unknown provider).
 */
function familyPrice(provider: string, slug: string): ModelPrice | null {
  if (provider === 'anthropic') {
    if (slug.includes('opus')) return { inputPer1M: 15, outputPer1M: 75, family: 'opus' };
    if (slug.includes('sonnet')) return { inputPer1M: 3, outputPer1M: 15, family: 'sonnet' };
    if (slug.includes('haiku')) return { inputPer1M: 1, outputPer1M: 5, family: 'haiku' };
  }
  if (provider === 'openai') {
    if (slug.includes('gpt-4o-mini')) return { inputPer1M: 0.15, outputPer1M: 0.6, family: 'gpt-4o-mini' };
    if (slug.includes('gpt-4o')) return { inputPer1M: 2.5, outputPer1M: 10, family: 'gpt-4o' };
  }
  if (provider === 'deepseek') {
    if (slug.includes('reasoner')) return { inputPer1M: 0.55, outputPer1M: 2.19, family: 'deepseek' };
    if (slug.includes('chat') || slug.includes('v3') || slug.includes('v4'))
      return { inputPer1M: 0.27, outputPer1M: 1.1, family: 'deepseek' };
  }
  if (provider === 'google') {
    if (slug.includes('2.5-pro') || slug.includes('pro')) return { inputPer1M: 1.25, outputPer1M: 10, family: 'gemini-pro' };
    if (slug.includes('flash')) return { inputPer1M: 0.3, outputPer1M: 2.5, family: 'gemini-flash' };
  }
  return null;
}

/** List price for a `provider/id` model, or null when unpriced. */
export function priceForModel(modelId: string): ModelPrice | null {
  const id = modelId.trim().toLowerCase();
  const exact = EXACT_PRICES[id];
  if (exact) return exact;
  // Local Ollama inference has no API cost — priced at zero, honestly labeled.
  if (id === 'ollama' || id.startsWith('ollama/')) {
    return { inputPer1M: 0, outputPer1M: 0, family: 'ollama-local' };
  }
  const slash = id.indexOf('/');
  if (slash <= 0) return null;
  return familyPrice(id.slice(0, slash), id.slice(slash + 1));
}

/** Rough token estimate from character count (no tokenizer server-side yet). */
export function estimateTokens(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.max(1, Math.ceil(chars / 4));
}

/** Price an estimated run — `{ costUsd: 0, priced: false }` when unknown. */
export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): { costUsd: number; priced: boolean } {
  const price = priceForModel(modelId);
  if (!price) return { costUsd: 0, priced: false };
  const costUsd = (inputTokens * price.inputPer1M + outputTokens * price.outputPer1M) / 1_000_000;
  return { costUsd, priced: true };
}
