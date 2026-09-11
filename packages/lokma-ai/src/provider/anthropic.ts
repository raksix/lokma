import { ProviderError } from './errors.js';
import { readErrorSnippet, readSse } from './sse.js';
import { shortModelId } from './openai.js';
import type { AdapterStreamOpts, ProviderAdapter, ProviderMessage, ProviderToolSchema, StreamChunk } from './types.js';

/**
 * Anthropic adapter — real HTTP streaming against the Messages API, no SDK.
 * POST `{base}/v1/messages` with `x-api-key` + `anthropic-version`,
 * SSE `content_block_delta` events carry `delta.text`.
 *
 * REQ-128: native tools too — this is the wire protocol Claude Code itself
 * speaks. Assistant turns replay their `tool_use` blocks, results come back
 * as `tool_result` blocks inside a *user* message, and streaming
 * `input_json_delta` fragments accumulate into one call. Without this the
 * Anthropic path was blind to every schema the registry holds.
 */

export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 8192;

/** Anthropic content blocks we produce (text / tool_use / tool_result / thinking). */
type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

type AnthropicMessage = { role: 'user' | 'assistant'; content: string | Block[] };

/**
 * Harness messages → Anthropic `messages` (REQ-128).
 *
 * The Messages API is strict about tool pairing: an assistant turn must
 * carry its `tool_use` blocks and every one of them needs a `tool_result`
 * in the NEXT user message. The old mapping flattened all of it to plain
 * strings, so a native turn could not survive a round-trip. Consecutive
 * `tool` rows merge into one user message (the API rejects a split pair),
 * and an assistant turn with calls but no text drops the empty text block.
 */
export function toAnthropicMessages(messages: ProviderMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  let pendingResults: Block[] = [];

  const flushResults = (): void => {
    if (pendingResults.length === 0) return;
    out.push({ role: 'user', content: pendingResults });
    pendingResults = [];
  };

  for (const m of messages) {
    if (m.role === 'tool') {
      const id = typeof m.toolCallId === 'string' ? m.toolCallId.trim() : '';
      if (id) {
        pendingResults.push({ type: 'tool_result', tool_use_id: id, content: m.content });
        continue;
      }
      pendingResults.push({ type: 'text', text: m.content });
      continue;
    }
    flushResults();
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      const blocks: Block[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const call of m.toolCalls) {
        let input: unknown = {};
        try {
          input = call.arguments?.trim() ? JSON.parse(call.arguments) : {};
        } catch {
          input = {};
        }
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input });
      }
      out.push({ role: 'assistant', content: blocks });
      continue;
    }
    out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
  }
  flushResults();
  return out;
}

/** Map harness tool schemas to Anthropic `tools[]` (`input_schema`, snake_case). */
export function toAnthropicTools(tools: ProviderToolSchema[] | undefined): {
  name: string;
  description: string;
  input_schema: unknown;
}[] {
  if (!tools || tools.length === 0) return [];
  return tools
    .filter((t) => typeof t?.name === 'string' && t.name.length > 0)
    .map((t) => ({
      name: t.name,
      description: typeof t.description === 'string' ? t.description : '',
      input_schema:
        t.parameters && typeof t.parameters === 'object' ? t.parameters : { type: 'object', properties: {} },
    }));
}

/** Streaming accumulator for one `tool_use` content block (REQ-128). */
type ToolUseBlock = { id: string; name: string; json: string };

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
    const turns: ProviderMessage[] = [];
    for (const m of opts.messages) {
      if (m.role === 'system') system.push(m.content);
      else turns.push(m);
    }
    const tools = toAnthropicTools(opts.tools);
    let res: Response;
    try {
      res = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          ...(opts.extraHeaders ?? {}),
        },
        signal: opts.signal,
        body: JSON.stringify({
          model: shortModelId(opts.model),
          max_tokens: MAX_TOKENS,
          stream: true,
          ...(system.length ? { system: system.join('\n') } : {}),
          messages: toAnthropicMessages(turns),
          ...(tools.length > 0 ? { tools, tool_choice: { type: 'auto' } } : {}),
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
    /** index → in-flight tool_use block; flushed when its block stops. */
    const open = new Map<number, ToolUseBlock>();
    try {
      for await (const { event, data } of readSse(res)) {
        let evt: unknown;
        try {
          evt = JSON.parse(data);
        } catch {
          continue;
        }
        const record = evt as {
          type?: string;
          index?: number;
          content_block?: { type?: string; id?: unknown; name?: unknown };
          delta?: { type?: string; text?: unknown; thinking?: unknown; partial_json?: unknown };
          message?: { stop_reason?: unknown };
          error?: { message?: string };
        };
        if (event === 'error' || record?.type === 'error' || record?.error) {
          throw new ProviderError('http_error', `Anthropic error: ${record?.error?.message ?? data.slice(0, 200)}`);
        }
        const index = typeof record?.index === 'number' ? record.index : -1;
        if (record?.type === 'content_block_start' && record.content_block?.type === 'tool_use') {
          open.set(index, {
            id: typeof record.content_block.id === 'string' ? record.content_block.id : `tool_${index}`,
            name: typeof record.content_block.name === 'string' ? record.content_block.name : '',
            json: '',
          });
          continue;
        }
        if (record?.type === 'content_block_delta') {
          const delta = record.delta;
          if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
            const block = open.get(index);
            if (block) {
              block.json += delta.partial_json;
              yield { type: 'tool_input_delta', tool: block.name, callId: block.id, delta: delta.partial_json };
            }
            continue;
          }
          if (typeof delta?.text === 'string' && delta.text) {
            yield { type: 'text_delta', delta: delta.text };
            continue;
          }
          const thinking = (delta as { thinking?: unknown } | undefined)?.thinking;
          if (typeof thinking === 'string' && thinking) yield { type: 'thinking_delta', delta: thinking };
          continue;
        }
        if (record?.type === 'content_block_stop') {
          const block = open.get(index);
          if (block) {
            open.delete(index);
            const parsed = block.json.trim() ? safeJson(block.json) : { input: {} };
            yield {
              type: 'native_tool_call',
              tool: block.name,
              input: parsed.input,
              callId: block.id,
              argumentsJson: block.json.trim() ? block.json : '{}',
              ...(parsed.parseError === undefined ? {} : { parseError: parsed.parseError }),
            };
          }
          continue;
        }
        if (event === 'message_stop' || record?.type === 'message_stop') return;
      }
      // Stream ended without message_stop: flush anything still open rather
      // than dropping a call the model actually made.
      for (const [index, block] of open) {
        const parsed = block.json.trim() ? safeJson(block.json) : { input: {} };
        yield {
          type: 'native_tool_call',
          tool: block.name,
          input: parsed.input,
          callId: block.id || `tool_${index}`,
          argumentsJson: block.json.trim() ? block.json : '{}',
          ...(parsed.parseError === undefined ? {} : { parseError: parsed.parseError }),
        };
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

/** Parse streamed tool arguments, never throwing (the loop reports honestly). */
function safeJson(text: string): { input: unknown; parseError?: string } {
  try {
    return { input: JSON.parse(text) as unknown };
  } catch (e) {
    return { input: undefined, parseError: e instanceof Error ? e.message : String(e) };
  }
}
