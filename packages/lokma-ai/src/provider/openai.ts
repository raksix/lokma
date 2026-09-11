import { ProviderError } from './errors.js';
import { isLocalBaseUrl, readErrorSnippet, readSse } from './sse.js';
import type { AdapterStreamOpts, ProviderAdapter, ProviderMessage, ProviderToolSchema, StreamChunk } from './types.js';

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

/**
 * True for Muse Spark on OpenCode Zen/Go (REQ-039): the model 500s on
 * `/chat/completions` and requires the Responses API instead (upstream
 * issue anomalyco/opencode#44627, cross-ref #44659).
 */
export function usesResponsesApi(baseUrl: string, model: string): boolean {
  return baseUrl.includes('opencode.ai/zen') && shortModelId(model).includes('muse-spark');
}

/**
 * One Responses `input` entry — plain turns ride as role/content, tool
 * results return natively (REQ-118 FAZ B.2).
 */
export type ResponsesInputItem =
  | { role: string; content: string }
  | { type: 'function_call_output'; call_id: string; output: string };

const TOOL_RESULT_OPEN = '<tool_result';
const TOOL_RESULT_CLOSE = '</tool_result';

/** Read one id="..." / call_id="..." attr with plain string search (never throws, no regex). */
function resultAttr(attrs: string, name: string): string | null {
  const key = name + '="';
  const at = attrs.indexOf(key);
  if (at < 0) return null;
  const start = at + key.length;
  const end = attrs.indexOf('"', start);
  if (end < 0) return null;
  return attrs.slice(start, end);
}

/**
 * Adapt harness messages to Responses `input` (REQ-118 FAZ B.2).
 * Assistant/system ride through; `tool` history rows read as user text
 * (unchanged); `<tool_result ... id>body</tool_result>` blocks inside user
 * messages return as native `function_call_output` items so the next turn
 * links each result to its call. A block without an id, or without a
 * closer, stays user text (fail-open — nothing is ever dropped).
 */
export function toResponsesInput(messages: ProviderMessage[]): ResponsesInputItem[] {
  const out: ResponsesInputItem[] = [];
  for (const m of messages) {
    if (m.role !== 'user' || m.content.indexOf(TOOL_RESULT_OPEN) < 0) {
      if (m.role === 'tool') out.push({ role: 'user', content: m.content });
      else out.push({ role: m.role, content: m.content });
      continue;
    }
    let rest = m.content;
    let text = '';
    for (;;) {
      const open = rest.indexOf(TOOL_RESULT_OPEN);
      if (open < 0) break;
      const openEnd = rest.indexOf('>', open);
      if (openEnd < 0) break;
      const close = rest.indexOf(TOOL_RESULT_CLOSE, openEnd);
      if (close < 0) break;
      const closeEnd = rest.indexOf('>', close);
      if (closeEnd < 0) break;
      text += rest.slice(0, open);
      const attrs = rest.slice(open + TOOL_RESULT_OPEN.length, openEnd);
      const body = rest.slice(openEnd + 1, close);
      rest = rest.slice(closeEnd + 1);
      if (text.trim()) {
        out.push({ role: 'user', content: text });
        text = '';
      }
      const callId = resultAttr(attrs, 'call_id') ?? resultAttr(attrs, 'id');
      if (callId !== null && callId.trim()) {
        out.push({ type: 'function_call_output', call_id: callId.trim(), output: body });
      } else {
        out.push({ role: 'user', content: TOOL_RESULT_OPEN + attrs + '>' + body + '</tool_result>' });
      }
    }
    text += rest;
    if (text.trim() || out.length === 0) out.push({ role: 'user', content: text });
  }
  return out;
}

/** Map harness tool schemas to Responses native `tools[]` (REQ-118 FAZ A). */
export function toResponsesTools(tools: ProviderToolSchema[] | undefined): {
  type: 'function';
  name: string;
  description: string;
  parameters: unknown;
}[] {
  if (!tools || tools.length === 0) return [];
  return tools
    .filter((t) => typeof t?.name === 'string' && t.name.length > 0)
    .map((t) => ({
      type: 'function' as const,
      name: t.name,
      description: typeof t.description === 'string' ? t.description : '',
      parameters:
        t.parameters && typeof t.parameters === 'object'
          ? t.parameters
          : { type: 'object', properties: {} },
    }));
}

/**
 * Honest HTTP mapping for the Responses path (REQ-118 FAZ B.2).
 * 403 on spark means the Meta region lock or a closed training-data
 * permission (never a harness bug); 429 carries the server retry hint;
 * 400 mentioning insufficient balance means the pool is out of credits.
 * Anything else stays a generic http_error.
 */
export function responsesHttpError(status: number, snippet: string, base: string, retryAfter: string | null): ProviderError {
  const tail = snippet ? ' — ' + snippet : '';
  if (status === 403) {
    return new ProviderError(
      'region_blocked',
      'Upstream HTTP 403 from ' + base + tail + ' (spark region lock or training-data permission — check RegionError/DataPolicyError, not a harness bug).',
      status,
    );
  }
  if (status === 429) {
    const wait = retryAfter !== null && retryAfter.trim() ? ' Retry after ' + retryAfter.trim() + 's.' : '';
    return new ProviderError('rate_limited', 'Upstream HTTP 429 from ' + base + tail + '.' + wait + ' Back off and retry.', status);
  }
  if (status === 400 && snippet.toLowerCase().indexOf('insufficient') >= 0) {
    return new ProviderError(
      'insufficient_credits',
      'Upstream HTTP 400 from ' + base + tail + ' (pool out of credits — top up, then retry; not a harness bug).',
      status,
    );
  }
  return new ProviderError('http_error', 'Upstream HTTP ' + status + ' from ' + base + tail, status);
}

/**
 * Parse gateway-echoed function-call arguments into loop-ready input
 * (REQ-118 FAZ B). Empty args become `{}`; unparseable args keep
 * `input: undefined` plus a `parseError` so the loop reports the block
 * honestly instead of executing garbage.
 */
export function nativeCallInput(args: string): { input: unknown; parseError?: string } {
  const text = args.trim() ? args : '{}';
  try {
    return { input: JSON.parse(text) as unknown };
  } catch (e) {
    return { input: undefined, parseError: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Render one native function call as the machine-made text block the
 * existing filter/execute chain already parses (REQ-118 FAZ A fallback).
 * The JSON is always machine-generated, so slop risk is nil; empty args
 * become `{}` so the block never parses as malformed.
 */
export function nativeCallToToolBlock(name: string, args: string): string {
  const safeName = name.replace(/"/g, '');
  const argsText = args.trim() ? args : '{}';
  return '<tool name="' + safeName + '">' + argsText + '</tool>';
}

/** Pull finished `output_text` out of a `response.completed` payload. */
export function responsesOutputText(output: unknown): string {
  if (!Array.isArray(output)) return '';
  let text = '';
  for (const item of output) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as { type?: unknown; content?: unknown };
    if (rec.type !== 'message' || !Array.isArray(rec.content)) continue;
    for (const part of rec.content) {
      if (typeof part !== 'object' || part === null) continue;
      const p = part as { type?: unknown; text?: unknown };
      if (p.type === 'output_text' && typeof p.text === 'string') text += p.text;
    }
  }
  return text;
}

/** Pull finished reasoning summaries out of a `response.completed` payload. */
export function responsesThinkingText(output: unknown): string {
  if (!Array.isArray(output)) return '';
  let text = '';
  for (const item of output) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as { type?: unknown; summary?: unknown };
    if (rec.type !== 'reasoning' || !Array.isArray(rec.summary)) continue;
    for (const part of rec.summary) {
      if (typeof part !== 'object' || part === null) continue;
      const p = part as { type?: unknown; text?: unknown };
      if (p.type === 'summary_text' && typeof p.text === 'string') text += p.text;
    }
  }
  return text;
}

/**
 * Portion of a completed-output `tail` the live deltas have not covered yet.
 * Upstream replays the FULL text on `response.completed`, so the common case
 * is `tail === seen` (→ '') or `tail` extending it (→ suffix). Anything else
 * (reordered snapshot) passes through to avoid dropping real content.
 */
export function unseenSuffix(seen: string, tail: string): string {
  if (!tail) return '';
  if (!seen) return tail;
  if (tail.startsWith(seen)) return tail.slice(seen.length);
  if (seen.includes(tail)) return '';
  return tail;
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
    const viaResponses = usesResponsesApi(base, opts.model);
    const url = viaResponses ? `${base}/responses` : `${base}/chat/completions`;
    const responsesTools = viaResponses ? toResponsesTools(opts.tools) : [];
    const body = viaResponses
      ? {
          model: shortModelId(opts.model),
          input: toResponsesInput(opts.messages),
          stream: true,
          ...(responsesTools.length > 0 ? { tools: responsesTools, tool_choice: 'auto' } : {}),
        }
      : {
          model: shortModelId(opts.model),
          messages: opts.messages.map((m) => ({ role: m.role === 'tool' ? 'user' : m.role, content: m.content })),
          stream: true,
        };
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        signal: opts.signal,
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      throw new ProviderError('network_error', `Upstream request failed (${base}): ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) {
      const snippet = await readErrorSnippet(res);
      // REQ-118 FAZ B.2: honest Responses-path mapping (region/rate/credits).
      if (viaResponses) throw responsesHttpError(res.status, snippet, base, res.headers.get('retry-after'));
      throw new ProviderError(
        'http_error',
        `Upstream HTTP ${res.status} from ${base}${snippet ? ` — ${snippet}` : ''}`,
        res.status,
      );
    }
    try {
      let streamedSeen = '';
      let thinkingSeen = '';
      // REQ-118 FAZ A: native function calls of the Responses stream, keyed
      // by item id (fall back to output index). Completed items overwrite
      // partial delta accumulations; the full `output[]` wins last.
      const nativeCalls = new Map<string, { name: string; args: string; callId: string }>();
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
        if (viaResponses) {
          // Responses API: `response.output_text.delta` carries live text,
          // `response.reasoning_summary_text.delta` carries live thinking,
          // `response.completed` carries the finished output array.
          // REQ-061: the completed payload repeats the FULL text (not just
          // the remainder), so blindly appending it doubles every answer.
          // Emit only the unseen suffix of each tail.
          const r = evt as {
            type?: unknown;
            delta?: unknown;
            item?: { id?: unknown; type?: unknown; name?: unknown; call_id?: unknown; arguments?: unknown };
            item_id?: unknown;
            output_index?: unknown;
            response?: { output?: unknown };
          };
          if (r?.type === 'response.output_item.added' && typeof r?.item === 'object' && r.item !== null) {
            const item = r.item;
            if (item.type === 'function_call') {
              const key =
                typeof item.id === 'string' && item.id
                  ? 'id:' + item.id
                  : 'idx:' + String(r.output_index ?? '?');
              nativeCalls.set(key, {
                name: typeof item.name === 'string' ? item.name : '',
                args: typeof item.arguments === 'string' ? item.arguments : '',
                callId:
                  typeof item.call_id === 'string' && item.call_id
                    ? item.call_id
                    : typeof item.id === 'string'
                      ? item.id
                      : key,
              });
            }
            continue;
          }
          if (r?.type === 'response.function_call_arguments.delta' && typeof r?.delta === 'string') {
            const key =
              typeof r.item_id === 'string' && r.item_id
                ? 'id:' + r.item_id
                : 'idx:' + String(r.output_index ?? '?');
            const prev = nativeCalls.get(key) ?? { name: '', args: '', callId: key };
            prev.args += r.delta;
            nativeCalls.set(key, prev);
            continue;
          }
          if (r?.type === 'response.output_item.done' && typeof r?.item === 'object' && r.item !== null) {
            const item = r.item;
            if (item.type === 'function_call') {
              const key =
                typeof item.id === 'string' && item.id
                  ? 'id:' + item.id
                  : 'idx:' + String(r.output_index ?? '?');
              nativeCalls.set(key, {
                name: typeof item.name === 'string' ? item.name : (nativeCalls.get(key)?.name ?? ''),
                args: typeof item.arguments === 'string' ? item.arguments : (nativeCalls.get(key)?.args ?? ''),
                callId:
                  typeof item.call_id === 'string' && item.call_id
                    ? item.call_id
                    : (nativeCalls.get(key)?.callId ?? key),
              });
            }
            continue;
          }
          if (r?.type === 'response.reasoning_summary_text.delta') {
            if (typeof r?.delta === 'string' && r.delta) {
              thinkingSeen += r.delta;
              yield { type: 'thinking_delta', delta: r.delta };
            }
            continue;
          }
          if (typeof r?.delta === 'string' && r.delta) {
            streamedSeen += r.delta;
            yield { type: 'text_delta', delta: r.delta };
          }
          const tail = responsesOutputText(r?.response?.output);
          if (tail) {
            const fresh = unseenSuffix(streamedSeen, tail);
            if (fresh) {
              streamedSeen += fresh;
              yield { type: 'text_delta', delta: fresh };
            }
          }
          const thinkTail = responsesThinkingText(r?.response?.output);
          if (thinkTail) {
            const freshThink = unseenSuffix(thinkingSeen, thinkTail);
            if (freshThink) {
              thinkingSeen += freshThink;
              yield { type: 'thinking_delta', delta: freshThink };
            }
          }
          const completedOutput = r?.response?.output;
          if (Array.isArray(completedOutput)) {
            for (const outItem of completedOutput) {
              if (typeof outItem !== 'object' || outItem === null) continue;
              const rec = outItem as { type?: unknown; id?: unknown; name?: unknown; call_id?: unknown; arguments?: unknown };
              if (rec.type !== 'function_call') continue;
              const key =
                typeof rec.id === 'string' && rec.id ? 'id:' + rec.id : 'call:' + String(rec.call_id ?? '?');
              nativeCalls.set(key, {
                name: typeof rec.name === 'string' ? rec.name : (nativeCalls.get(key)?.name ?? ''),
                args: typeof rec.arguments === 'string' ? rec.arguments : (nativeCalls.get(key)?.args ?? ''),
                callId: typeof rec.call_id === 'string' && rec.call_id ? rec.call_id : key,
              });
            }
          }
          continue;
        }
        const content = record?.choices?.[0]?.delta?.content;
        if (typeof content === 'string' && content) yield { type: 'text_delta', delta: content };
        // DeepSeek-style reasoning stream rides the same delta object.
        // (Tool markup echoed here is stripped at render, see ThinkingTrace.)
        const reasoning = (record?.choices?.[0]?.delta as { reasoning_content?: unknown } | undefined)?.reasoning_content;
        if (typeof reasoning === 'string' && reasoning) yield { type: 'thinking_delta', delta: reasoning };
      }
      // REQ-118 FAZ B: flush native calls as machine-typed chunks — the
      // loop executes them directly, no synthetic text passes the filter
      // (so slop salvage never sees them and nothing executes twice).
      for (const call of nativeCalls.values()) {
        if (!call.name) continue;
        const parsed = nativeCallInput(call.args);
        if (parsed.parseError === undefined) {
          yield { type: 'native_tool_call', tool: call.name, input: parsed.input, callId: call.callId };
        } else {
          yield {
            type: 'native_tool_call',
            tool: call.name,
            input: parsed.input,
            callId: call.callId,
            parseError: parsed.parseError,
          };
        }
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
