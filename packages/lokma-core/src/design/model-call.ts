/**
 * REQ-190 — the ONE model transport for the design module.
 *
 * `generateDesignHtml` (generation) and the tweak patcher both talk to a
 * model through the same provider resolution, streaming loop, timeout and
 * error mapping. Extracted so the tweak path cannot drift from the
 * generation path: a timeout means the same thing in both, an upstream key
 * failure maps to the same `design_no_api_key`, and neither can grow a
 * second, subtly different transport.
 *
 * The dependency runs ONE WAY — `generate.ts` imports from here, never the
 * reverse — so the transport owns the timeout and the error mapping without
 * a cycle. It only moves text: no prompt rules, no HTML extraction.
 */

import { ProviderError, providerOfId, stream as aiStream, type ProviderMessage } from '@lokma/ai';
import { resolveProviderUpstream } from '../providers/providers.js';
import { DesignError } from './types.js';

/**
 * One generation call is bounded — a hung upstream must not wedge the pane.
 * Tweaks reuse it unless they ask for longer (they patch a bigger document).
 */
export const DESIGN_GENERATION_TIMEOUT_MS = 240_000;

/**
 * Map an upstream failure onto the honest route-level error (never a template).
 * REQ-177 §3: a provider failure fails loudly and never degrades into the
 * deterministic builder behind the user's back.
 */
export function designErrorFromUpstream(e: unknown, model: string): DesignError {
  if (e instanceof DesignError) return e;
  if (e instanceof ProviderError) {
    if (e.code === 'missing_api_key') {
      return new DesignError(
        'design_no_api_key',
        `${e.message} Design generation was NOT replaced by a template — fix the credential and retry.`,
        400,
      );
    }
    return new DesignError('design_upstream_error', `Model "${model}" call failed (${e.code}): ${e.message}`, 502);
  }
  if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
    return new DesignError(
      'design_timeout',
      `Model "${model}" did not answer within ${Math.round(DESIGN_GENERATION_TIMEOUT_MS / 1000)}s — retry or pick another model.`,
      504,
    );
  }
  return new DesignError(
    'design_upstream_error',
    `Model "${model}" call failed: ${e instanceof Error ? e.message : String(e)}`,
    502,
  );
}

/**
 * One streamed completion as plain text. Thinking/reasoning deltas are
 * intentionally dropped: both callers need markup, never narration, and a
 * reasoning trace leaking into an artifact would be worse than none.
 */
export async function callDesignModel(
  model: string,
  messages: ProviderMessage[],
  timeoutMs?: number,
): Promise<string> {
  const timeout = timeoutMs ?? DESIGN_GENERATION_TIMEOUT_MS;
  const providerId = providerOfId(model, 'anthropic');
  let upstream: { provider: 'anthropic' | 'openai'; baseUrl: string; apiKey: string | null };
  try {
    upstream = await resolveProviderUpstream(providerId);
  } catch (e) {
    throw new DesignError(
      'design_provider_unavailable',
      e instanceof Error ? e.message : `Provider "${providerId}" is not available.`,
      400,
    );
  }

  let text = '';
  // The abort surfaces in adapter-specific shapes (DOMException TimeoutError,
  // a wrapped ProviderError, ...) — track it on the signal itself so a
  // timeout maps to the honest design_timeout regardless of the wrapper.
  const deadline = AbortSignal.timeout(timeout);
  let timedOut = false;
  deadline.addEventListener(
    'abort',
    () => {
      timedOut = true;
    },
    { once: true },
  );

  try {
    for await (const chunk of aiStream({
      provider: upstream.provider,
      model,
      messages,
      apiKey: upstream.apiKey,
      baseUrl: upstream.baseUrl,
      signal: deadline,
      // Go-style upstreams want a client session id (harmless elsewhere).
      extraHeaders: { 'x-opencode-session': `lokma-design-${Date.now().toString(36)}` },
    })) {
      if (chunk.type === 'text_delta' && chunk.delta) text += chunk.delta;
    }
  } catch (e) {
    if (timedOut) {
      throw new DesignError(
        'design_timeout',
        `Model "${model}" did not answer within ${Math.round(timeout / 1000)}s — retry or pick another model.`,
        504,
      );
    }
    throw designErrorFromUpstream(e, model);
  }
  return text;
}
