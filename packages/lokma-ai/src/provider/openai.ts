import { ProviderError } from './errors.js';
import { isLocalBaseUrl, readErrorSnippet, readSse } from './sse.js';
import type { AdapterStreamOpts, ProviderAdapter, StreamChunk } from './types.js';

/**
 * OpenAI-compatible adapter — real HTTP streaming, no SDK dependency.
 * Serves OpenAI, DeepSeek, OpenRouter, Ollama and any custom provider with
 * an OpenAI-compatible base URL (POST `{base}/chat/completions`,
 * `stream: true`, SSE `choices[0].delta.content`). The server picks this
 * adapter for every such provider id; only the base URL differs.
 */

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/** Client identity for upstreams that require it (OpenCode Go docs:
 * "identify itself with its own user agent, rather than a generic
 * SDK or HTTP-library name"). */
export const LOKMA_USER_AGENT = 'lokma-harness/1.0 (+https://lokma.fermag.com.tr)';
/** Case-insensitive header lookup for optional caller-supplied headers. */
function hasHeader(headers: Record<string, string> | undefined, name: string): boolean {
  if (!headers) return false;
  const want = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === want);
}

/** Strip the `provider/` prefix the harness model ids carry. */
export function shortModelId(model: string): string {
  const slash = model.indexOf('/');
  return slash >= 0 ? model.slice(slash + 1) : model;
}

export class OpenAIAdapter implements ProviderAdapter {
  id = 'openai' as const;

  async *stream(opts: AdapterStreamOpts): AsyncGenerator<StreamChunk> {
    const base = (opts.baseUrl ?? OPENAI_DEFAULT_BASE_URL).replace(/\/$/, '');
    if (!opts.apiKey && !isLocalBaseUrl(base)) {
      throw new ProviderError(
        'missing_api_key',
        `No API key configured for this provider — add one in Settings → Providers (base ${base}).`,
      );
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
    // REQ-038: OpenCode Go routes efficiently only with an x-opencode-session
    // header (missing → HTTP 400). Explicit value wins; otherwise mint a
    // per-request id so Go never sees a headerless call.
    if (base.includes('opencode.ai/zen/go')) {
      // REQ-039: Go docs require a real client identity (not a generic
      // SDK/HTTP-library UA) plus a stable session id per conversation.
      headers['User-Agent'] = LOKMA_USER_AGENT;
      if (!hasHeader(opts.extraHeaders, 'x-opencode-session')) {
        headers['x-opencode-session'] = `lokma-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffff).toString(16)}`;
      }
    }
    for (const [k, v] of Object.entries(opts.extraHeaders ?? {})) headers[k] = v;
    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers,
        signal: opts.signal,
        body: JSON.stringify({
          model: shortModelId(opts.model),
          messages: opts.messages.map((m) => ({ role: m.role === 'tool' ? 'user' : m.role, content: m.content })),
          stream: true,
        }),
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      throw new ProviderError('network_error', `Upstream request failed (${base}): ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) {
      const snippet = await readErrorSnippet(res);
      throw new ProviderError(
        'http_error',
        `Upstream HTTP ${res.status} from ${base}${snippet ? ` — ${snippet}` : ''}`,
        res.status,
      );
    }
    try {
      for await (const { data } of readSse(res)) {
        let evt: unknown;
        try {
          evt = JSON.parse(data);
        } catch {
          continue;
        }
        const record = evt as { error?: { message?: string }; choices?: { delta?: { content?: unknown } }[] };
        if (record && typeof record === 'object' && record.error) {
          throw new ProviderError('http_error', `Upstream error: ${record.error.message ?? 'unknown'}`);
        }
        const content = record?.choices?.[0]?.delta?.content;
        if (typeof content === 'string' && content) yield { type: 'text_delta', delta: content };
      }
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (e instanceof Error && e.name === 'AbortError') throw e;
      throw new ProviderError('bad_response', `Upstream stream broke off (${base}): ${e instanceof Error ? e.message : String(e)}`);
    }
    yield { type: 'done', reason: 'complete' };
  }

  async listModels(): Promise<{ id: string; label: string }[]> {
    return [
      { id: 'openai/gpt-5', label: 'GPT-5' },
      { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
      { id: 'openrouter/auto', label: 'OpenRouter Auto' },
    ];
  }
}
