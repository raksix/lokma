import { ProviderError } from './errors.js';
import { readErrorSnippet, readSse } from './sse.js';
import { shortModelId } from './openai.js';
import type { AdapterStreamOpts, ProviderAdapter, StreamChunk } from './types.js';

/**
 * Anthropic adapter — real HTTP streaming against the Messages API, no SDK.
 * POST `{base}/v1/messages` with `x-api-key` + `anthropic-version`,
 * SSE `content_block_delta` events carry `delta.text`. A key is always
 * required (Anthropic has no keyless local tier, unlike Ollama).
 */

export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 4096;

export class AnthropicAdapter implements ProviderAdapter {
  id = 'anthropic' as const;

  async *stream(opts: AdapterStreamOpts): AsyncGenerator<StreamChunk> {
    if (!opts.apiKey) {
      throw new ProviderError(
        'missing_api_key',
        'No API key configured for Anthropic — add one in Settings → Providers (or set ANTHROPIC_API_KEY).',
      );
    }
    const base = (opts.baseUrl ?? ANTHROPIC_DEFAULT_BASE_URL).replace(/\/$/, '');
    const system: string[] = [];
    const messages: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const m of opts.messages) {
      if (m.role === 'system') system.push(m.content);
      else messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
    }
    let res: Response;
    try {
      res = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        signal: opts.signal,
        body: JSON.stringify({
          model: shortModelId(opts.model),
          max_tokens: MAX_TOKENS,
          ...(system.length ? { system: system.join('\n') } : {}),
          messages,
        }),
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      throw new ProviderError('network_error', `Anthropic request failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) {
      const snippet = await readErrorSnippet(res);
      throw new ProviderError(
        'http_error',
        `Anthropic HTTP ${res.status}${snippet ? ` — ${snippet}` : ''}`,
        res.status,
      );
    }
    try {
      for await (const { event, data } of readSse(res)) {
        let evt: unknown;
        try {
          evt = JSON.parse(data);
        } catch {
          continue;
        }
        const record = evt as { type?: string; delta?: { type?: string; text?: unknown }; error?: { message?: string } };
        if (event === 'error' || record?.type === 'error' || record?.error) {
          throw new ProviderError('http_error', `Anthropic error: ${record?.error?.message ?? data.slice(0, 200)}`);
        }
        if (event === 'content_block_delta') {
          const text = record?.delta?.text;
          if (typeof text === 'string' && text) yield { type: 'text_delta', delta: text };
        }
        if (event === 'message_stop') return;
      }
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (e instanceof Error && e.name === 'AbortError') throw e;
      throw new ProviderError('bad_response', `Anthropic stream broke off: ${e instanceof Error ? e.message : String(e)}`);
    }
    yield { type: 'done', reason: 'complete' };
  }

  async listModels(): Promise<{ id: string; label: string }[]> {
    return [
      { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { id: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4.5' },
      { id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    ];
  }
}
