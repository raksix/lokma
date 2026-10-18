/**
 * REQ-205 slice 2 — client-side FREE runner (keyless OmniRoute stream).
 *
 * The browser talks to OmniRoute DIRECTLY: `POST {base}/chat/completions`
 * with `stream: true`, no API key anywhere on the wire (REQ-205 §4.4). This
 * module owns the transport half: URL building (single configuration point
 * via slice 1's `apiUrl`/`FREE_BASE_URL`), a chunk-boundary-safe SSE drain,
 * a pure payload parser, and `runFreeChat` — the abortable streaming call.
 *
 * Measured wire shape (18 Oct 2026, keyless live probe, `free-opencode`):
 *   data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":null}],...}
 *   data: {"choices":[{"delta":{"reasoning_content":"We"},"finish_reason":null}],...}
 *   data: {"choices":[{"delta":{"content":"lok"},"finish_reason":null}],...}
 *   data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{...}}
 *   : x-omniroute-cache-hit=false            <- SSE comments: ignored
 *   data: [DONE]
 *
 * Honesty rules (REQ-205 §5) this module enforces:
 *   - failures are reported verbatim (HTTP status + upstream detail, e.g.
 *     `HTTP 502: bad_gateway`); there is NO fallback model and no fabricated
 *     answer;
 *   - a run that produced no answer TEXT is a failure, never a completion
 *     (reasoning-only output keeps its reasoning but does not count);
 *   - partial text/reasoning survives aborts and mid-stream errors so the
 *     caller can persist what actually arrived.
 *
 * Adapter seam: callbacks deliver bare delta strings — the same units the WS
 * reducer consumes as `text_delta` / `thinking_delta` (slice wiring maps them;
 * the server-side runner is untouched, this is a second path).
 *
 * Covered by `free-runner.test.ts` (`bun src/lib/free-runner.test.ts`).
 */
import { FREE_BASE_URL, apiUrl } from './free-models';
import { CLIENT_FREE_ROW_CHAR_CAP, type ClientFreeRecordRow } from '@lokma/shared/protocol/ws';

/** Generous default budget — a small `max_tokens` leaves `content` empty on
 * reasoning models (REQ-205 §2 pitfall 1: the whole budget goes to
 * `reasoning_content`). Callers may override. */
export const FREE_DEFAULT_MAX_TOKENS = 4000;

/** `{base}/chat/completions` — the second (and only other) client-free URL. */
export function chatCompletionsUrl(base: string): string {
  return apiUrl(base, '/chat/completions');
}

/** One chat message in OpenAI shape (what the free endpoint accepts). */
export type FreeChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/** Token accounting reported by the upstream (final event). */
export type FreeUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Upstream note: `estimated: true` when the provider did not bill exact. */
  estimated: boolean;
};

/** One parsed stream event — text units plus transport metadata. */
export type FreeStreamEvent =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'meta'; model: string | null; finishReason: string | null; usage: FreeUsage | null }
  | { kind: 'error'; message: string };

/** Result of draining a byte-decoded chunk through the line buffer. */
export type SseDrain = { payloads: string[]; rest: string };

/**
 * Drain complete SSE lines out of a rolling buffer. Comment lines (`: ...`)
 * and non-data fields (`event:`, `id:`, blank separators) carry no JSON and
 * are skipped; an incomplete tail is returned as `rest` so a payload split
 * across network chunks is reassembled by the next call.
 */
export function drainSseData(buffer: string, chunk: string): SseDrain {
  const payloads: string[] = [];
  let rest = buffer + chunk;
  for (;;) {
    const idx = rest.indexOf('\n');
    if (idx === -1) break;
    let line = rest.slice(0, idx);
    rest = rest.slice(idx + 1);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line.length === 0 || line.startsWith(':')) continue;
    if (!line.startsWith('data:')) continue;
    let value = line.slice(5);
    // SSE spec: at most ONE leading space after the field colon.
    if (value.startsWith(' ')) value = value.slice(1);
    payloads.push(value);
  }
  return { payloads, rest };
}

function toUsage(raw: unknown): FreeUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    inputTokens: num(u.prompt_tokens),
    outputTokens: num(u.completion_tokens),
    totalTokens: num(u.total_tokens),
    estimated: u.estimated === true,
  };
}

/**
 * Pure payload parser: one `data:` value in, zero or more events out.
 * `[DONE]` yields nothing (the read loop owns termination); malformed JSON
 * and `error` payloads are surfaceable failures, never silent skips.
 */
export function parseStreamPayload(payload: string): FreeStreamEvent[] {
  const trimmed = payload.trim();
  if (trimmed.length === 0 || trimmed === '[DONE]') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [{ kind: 'error', message: 'unreadable stream chunk from the upstream' }];
  }
  if (!parsed || typeof parsed !== 'object') {
    return [{ kind: 'error', message: 'unreadable stream chunk from the upstream' }];
  }

  const rec = parsed as Record<string, unknown>;
  if (rec.error !== undefined && rec.error !== null) {
    const e = rec.error;
    let message = 'upstream error';
    if (typeof e === 'string') message = e;
    else if (typeof e === 'object') {
      const m = (e as Record<string, unknown>).message;
      if (typeof m === 'string' && m.length > 0) message = m;
    }
    return [{ kind: 'error', message }];
  }

  const events: FreeStreamEvent[] = [];
  const choices = Array.isArray(rec.choices) ? rec.choices : [];
  const first = choices[0];
  if (first && typeof first === 'object') {
    const choice = first as Record<string, unknown>;
    const delta = choice.delta && typeof choice.delta === 'object' ? (choice.delta as Record<string, unknown>) : null;
    if (delta) {
      // Deliberately separate channels: reasoning renders as thinking, content as answer.
      if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
        events.push({ kind: 'reasoning', text: delta.reasoning_content });
      }
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        events.push({ kind: 'text', text: delta.content });
      }
    }
  }

  const model = typeof rec.model === 'string' && rec.model.length > 0 ? rec.model : null;
  const finishReason =
    first && typeof first === 'object' && typeof (first as Record<string, unknown>).finish_reason === 'string'
      ? ((first as Record<string, unknown>).finish_reason as string)
      : null;
  const usage = toUsage(rec.usage);
  if (model !== null || finishReason !== null || usage !== null) {
    events.push({ kind: 'meta', model, finishReason, usage });
  }
  return events;
}

/** Caller tuneables + the abort handle (one in-flight run per caller). */
export type FreeChatOpts = {
  model: string;
  messages: FreeChatMessage[];
  base?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
  onText?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
};

/**
 * Streamed result. The failure branch keeps partial `text`/`reasoning` so an
 * aborted or half-delivered answer is still persistable (never discarded).
 */
export type FreeChatResult =
  | {
      ok: true;
      text: string;
      reasoning: string;
      finishReason: string | null;
      usage: FreeUsage | null;
      model: string;
    }
  | {
      ok: false;
      error: string;
      status: number | null;
      aborted: boolean;
      text: string;
      reasoning: string;
    };

function isAbortError(e: unknown): boolean {
  return Boolean(e) && typeof e === 'object' && (e as { name?: unknown }).name === 'AbortError';
}

/** Best-effort upstream detail for a non-OK response (raw, truncated). */
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = await res.text();
    return body.replace(/\s+/g, ' ').trim().slice(0, 300);
  } catch {
    return '';
  }
}

/**
 * Run one keyless chat completion, streamed. Resolves — never throws — so
 * callers branch on the result instead of wrapping every call in try/catch.
 * No `Authorization` header is ever set: the free pool is keyless by design
 * (REQ-205 §4.4) and this module must not grow key material.
 */
export async function runFreeChat(opts: FreeChatOpts): Promise<FreeChatResult> {
  const base = opts.base ?? FREE_BASE_URL;
  const fetchFn = opts.fetchFn ?? fetch;
  let text = '';
  let reasoning = '';
  let model = opts.model;
  let finishReason: string | null = null;
  let usage: FreeUsage | null = null;

  try {
    const res = await fetchFn(chatCompletionsUrl(base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: true,
        max_tokens: opts.maxTokens ?? FREE_DEFAULT_MAX_TOKENS,
      }),
      signal: opts.signal,
    });

    if (!res.ok) {
      const detail = await errorDetail(res);
      return {
        ok: false,
        error: 'HTTP ' + res.status + (detail ? ': ' + detail : ''),
        status: res.status,
        aborted: false,
        text,
        reasoning,
      };
    }
    if (!res.body) {
      return { ok: false, error: 'streaming unsupported (no response body)', status: res.status, aborted: false, text, reasoning };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let terminalError: string | null = null;

    read: for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const drained = drainSseData(buffer, decoder.decode(value, { stream: true }));
      buffer = drained.rest;
      for (const payload of drained.payloads) {
        if (payload.trim() === '[DONE]') break read;
        for (const ev of parseStreamPayload(payload)) {
          if (ev.kind === 'text') {
            text += ev.text;
            opts.onText?.(ev.text);
          } else if (ev.kind === 'reasoning') {
            reasoning += ev.text;
            opts.onReasoning?.(ev.text);
          } else if (ev.kind === 'meta') {
            if (ev.model !== null) model = ev.model;
            if (ev.finishReason !== null) finishReason = ev.finishReason;
            if (ev.usage !== null) usage = ev.usage;
          } else {
            terminalError = ev.message;
            break read;
          }
        }
      }
    }

    if (terminalError !== null) {
      // Tear the body down — an errored stream must not keep the fetch alive.
      try {
        await reader.cancel();
      } catch {
        // Cancel is best-effort; the result already carries the failure.
      }
      return { ok: false, error: terminalError, status: null, aborted: false, text, reasoning };
    }

    // A run with no answer TEXT is a failure even when reasoning arrived
    // (REQ-205 §5 honesty; a reasoning-only turn renders as an empty bubble).
    if (text.length === 0) {
      const why =
        finishReason === 'length'
          ? 'the model hit the token budget before answering (finish_reason: length)'
          : 'the upstream produced no answer text';
      return { ok: false, error: why, status: null, aborted: false, text, reasoning };
    }

    return { ok: true, text, reasoning, finishReason, usage, model };
  } catch (e) {
    if (isAbortError(e)) {
      return { ok: false, error: 'aborted', status: null, aborted: true, text, reasoning };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'network error',
      status: null,
      aborted: false,
      text,
      reasoning,
    };
  }
}

// ─── REQ-205 slice 3: the record half (what the server persists) ────────────

/**
 * Thinking rows are capped exactly like the server loop's (`agent-loop.ts`
 * THINK_CAP) so a free run and a server run persist thinking the same way.
 */
export const FREE_THINKING_ROW_CAP = 12_000;

function truncationMarker(total: number): string {
  return '\n…[truncated: ' + total + ' chars total]';
}

/** Clamp to the WIRE cap, marker included — an over-cap frame is rejected whole. */
function clampRowContent(content: string): string {
  if (content.length <= CLIENT_FREE_ROW_CHAR_CAP) return content;
  const marker = truncationMarker(content.length);
  return content.slice(0, Math.max(0, CLIENT_FREE_ROW_CHAR_CAP - marker.length)) + marker;
}

function clampThinking(reasoning: string): string {
  if (reasoning.length <= FREE_THINKING_ROW_CAP) return reasoning;
  return reasoning.slice(0, FREE_THINKING_ROW_CAP) + '\n…[thinking truncated: ' + reasoning.length + ' chars total]';
}

/**
 * REQ-205 slice 3 — turn a settled free run into the rows the server
 * persists through `transcript_record`. `origin` is NOT set here: the
 * server stamps it (the client never declares its own provenance).
 *
 * Honesty rules (mirrors `runFreeChat`'s result contract):
 *  - the user's prompt is always recorded — their message must survive a
 *    reload even when the model call failed;
 *  - a thinking row only when reasoning actually arrived (capped, marked);
 *  - an assistant row only when answer TEXT actually arrived — a failed or
 *    aborted run with no text leaves no fabricated turn behind.
 */
export function freeRunRecordRows(input: {
  prompt: string;
  /** ISO stamp of the user's send (the same one its optimistic row carries). */
  promptAt: string;
  /** ISO stamp of the run settling (success, abort or failure). */
  answerAt: string;
  result: { text: string; reasoning: string };
}): ClientFreeRecordRow[] {
  const rows: ClientFreeRecordRow[] = [
    { role: 'user', content: clampRowContent(input.prompt), timestamp: input.promptAt },
  ];
  const reasoning = input.result.reasoning.trim();
  if (reasoning) {
    rows.push({ role: 'thinking', content: clampThinking(reasoning), timestamp: input.answerAt });
  }
  if (input.result.text.trim()) {
    rows.push({ role: 'assistant', content: clampRowContent(input.result.text), timestamp: input.answerAt });
  }
  return rows;
}

// ─── REQ-205 slice 4: chat context for the client-free turn ─────────────────

/** Newest N prior rows ride along so the free path is a conversation, not a
 * one-shot ping (a chat that forgets the previous message reads as broken). */
export const FREE_HISTORY_LIMIT = 8;

/** Per-row cap for the replayed context — a giant pasted row must not crowd
 * out the actual prompt (the transcript holds whatever was persisted). */
export const FREE_HISTORY_ROW_CAP = 4000;

/**
 * Slice the recent conversation into OpenAI `messages` for a free run:
 * user/assistant rows only (tool/thinking rows belong to server runs the
 * free endpoint never saw), oldest → newest, capped count and capped per
 * row with a visible marker — mirroring the wire-truncation doctrine so
 * the model knows the rest exists.
 */
export function freeHistoryMessages(
  rows: Array<{ role?: unknown; content?: unknown }>,
  limit: number = FREE_HISTORY_LIMIT,
  perRowCap: number = FREE_HISTORY_ROW_CAP,
): FreeChatMessage[] {
  const out: FreeChatMessage[] = [];
  for (const raw of rows) {
    const role = raw?.role;
    if (role !== 'user' && role !== 'assistant') continue;
    const content = typeof raw?.content === 'string' ? raw.content : '';
    if (!content.trim()) continue;
    out.push({
      role,
      content:
        content.length > perRowCap
          ? content.slice(0, perRowCap) + '\n…[truncated: ' + content.length + ' chars total]'
          : content,
    });
  }
  return out.slice(-Math.max(0, limit));
}
