/**
 * Unit probe for the REQ-205 client-free runner (`./free-runner`).
 * Run: `bun src/lib/free-runner.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain asserts so `tsc -b` stays dependency-free.
 * Not imported by app code, so the Vite bundle ignores it.
 *
 * The fixture mirrors the MEASURED wire shape (18 Oct 2026 keyless probe):
 * role delta, reasoning_content deltas, content deltas, an SSE comment line,
 * a final event with `finish_reason` + `usage`, then `data: [DONE]`.
 */
import { FREE_DEFAULT_MAX_TOKENS, chatCompletionsUrl, drainSseData, parseStreamPayload, runFreeChat } from './free-runner';
import { FREE_BASE_URL } from './free-models';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

const RESOLVED_MODEL = 'deepseek/deepseek-v4.1-flash';
const USAGE = { prompt_tokens: 294, completion_tokens: 48, total_tokens: 342, estimated: true };

/** One OpenAI-shaped stream event exactly as the upstream emits it. */
function ev(delta: Record<string, unknown>, finishReason: string | null = null, usage?: unknown): string {
  const body: Record<string, unknown> = {
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: 1792350756,
    model: RESOLVED_MODEL,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
  if (usage !== undefined) body.usage = usage;
  return 'data: ' + JSON.stringify(body) + '\n\n';
}

/** The full happy-path stream: reasoning, answer text, comment, terminator. */
function happyStream(): string {
  return (
    ev({ role: 'assistant' }) +
    ev({ reasoning_content: 'lokma üzerinde' }) +
    ev({ reasoning_content: ' düşün.' }) +
    ev({ content: 'lok' }) +
    ev({ content: 'ma ' }) +
    ev({ content: 'wire' }) +
    ': x-omniroute-cache-hit=false\n' +
    ': x-omniroute-latency-ms=1276\n\n' +
    ev({}, 'stop', USAGE) +
    'data: [DONE]\n\n'
  );
}

function findBytes(hay: Uint8Array, needle: Uint8Array): number {
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

/** Split the stream into chunks that cut a multi-byte char AND a JSON line. */
function adversarialChunks(text: string): Uint8Array[] {
  const bytes = new TextEncoder().encode(text);
  let cutMulti = -1;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0xc3) {
      cutMulti = i;
      break;
    }
  }
  const marker = findBytes(bytes, new TextEncoder().encode('"content":"lok"'));
  const cutLine = marker + 7;
  assert(cutMulti > 0, 'splitter: multi-byte char found in the fixture (byte 0xC3)');
  assert(marker > cutMulti, 'splitter: the line cut lands after the multi-byte cut');
  return [bytes.slice(0, cutMulti + 1), bytes.slice(cutMulti + 1, cutLine), bytes.slice(cutLine)];
}

type FetchCall = { url: string; init: RequestInit };

function fakeRes(opts: { status?: number; body?: ReadableStream<Uint8Array> | null; text?: string }): Response {
  const status = opts.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    body: opts.body ?? null,
    text: async () => opts.text ?? '',
  } as unknown as Response;
}

function makeStreamFetch(
  chunks: Uint8Array[],
  opts: { status?: number; keepOpen?: boolean; onCancel?: () => void } = {},
): { fetchFn: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      if (!opts.keepOpen) c.close();
    },
    cancel() {
      if (opts.onCancel) opts.onCancel();
    },
  });
  const fetchFn = (async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    return fakeRes({ status: opts.status ?? 200, body: stream });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

// ── 1. URL building (single configuration point) ─────────────────────────────

assert(
  chatCompletionsUrl(FREE_BASE_URL) === 'https://omniroute.fermag.com.tr/v1/chat/completions',
  'url: chatCompletionsUrl(FREE_BASE_URL) hits the keyless endpoint',
);
assert(
  chatCompletionsUrl('https://probe.test/v1/') === 'https://probe.test/v1/chat/completions',
  'url: trailing slashes are stripped',
);
assert(chatCompletionsUrl('  https://probe.test/v1  ') === 'https://probe.test/v1/chat/completions', 'url: whitespace trimmed');

// ── 2. SSE drain — chunk boundaries, comments, CRLF ──────────────────────────

{
  const a = drainSseData('', 'data: {"a":1}\n');
  assert(a.payloads.length === 1 && a.payloads[0] === '{"a":1}', 'drain: complete line yields its payload');
  assert(a.rest === '', 'drain: nothing left over');

  const b = drainSseData('', 'data: {"a":');
  assert(b.payloads.length === 0 && b.rest === 'data: {"a":', 'drain: partial line stays in the buffer');
  const c = drainSseData(b.rest, '1}\n');
  assert(c.payloads.length === 1 && c.payloads[0] === '{"a":1}', 'drain: split line reassembled across chunks');

  const d = drainSseData('', ': x-omniroute-cache-hit=false\n\nevent: message\n: another comment\n');
  assert(d.payloads.length === 0, 'drain: comments and non-data fields produce no payloads');

  const e = drainSseData('', 'data: {"a":1}\r\n');
  assert(e.payloads.length === 1 && e.payloads[0] === '{"a":1}', 'drain: CRLF line endings handled');

  const f = drainSseData('', 'data:  {"a":1}\n');
  assert(f.payloads.length === 1 && f.payloads[0] === ' {"a":1}', 'drain: exactly one leading space is stripped (spec)');

  const g = drainSseData('', 'data: {"a":1}\ndata: {"b":2}\ndata: {"c"');
  assert(g.payloads.length === 2 && g.rest === 'data: {"c"', 'drain: several payloads per chunk, tail kept');
}

// ── 3. Pure payload parser — every measured shape ────────────────────────────

{
  const roleOnly = parseStreamPayload('{"id":"x","model":"m","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}');
  assert(roleOnly.length === 1, 'parse: role-only delta yields exactly the meta event');
  const r0 = roleOnly[0];
  assert(r0.kind === 'meta', 'parse: role-only event is meta');
  assert(r0.kind === 'meta' && r0.model === 'm', 'parse: meta carries the model');
  assert(r0.kind === 'meta' && r0.finishReason === null && r0.usage === null, 'parse: absent finish/usage stay null');
}
{
  const think = parseStreamPayload('{"choices":[{"index":0,"delta":{"reasoning_content":"We"},"finish_reason":null}]}');
  const t0 = think[0];
  assert(think.length === 1 && t0.kind === 'reasoning' && t0.text === 'We', 'parse: reasoning_content maps to a reasoning event');
}
{
  const text = parseStreamPayload('{"choices":[{"index":0,"delta":{"content":"lok"},"finish_reason":null}]}');
  const x0 = text[0];
  assert(text.length === 1 && x0.kind === 'text' && x0.text === 'lok', 'parse: content maps to a text event');
}
{
  const fin = parseStreamPayload('{"model":"m","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":294,"completion_tokens":48,"total_tokens":342,"estimated":true}}');
  const f0 = fin[0];
  assert(fin.length === 1 && f0.kind === 'meta', 'parse: final event is meta');
  assert(f0.kind === 'meta' && f0.finishReason === 'stop', 'parse: finish_reason mapped');
  assert(
    f0.kind === 'meta' && f0.usage !== null && f0.usage.inputTokens === 294 && f0.usage.outputTokens === 48 && f0.usage.totalTokens === 342 && f0.usage.estimated === true,
    'parse: usage mapped to camelCase with the estimated flag',
  );
}
{
  const done = parseStreamPayload('[DONE]');
  assert(done.length === 0, 'parse: [DONE] yields no events (loop owns termination)');
}
{
  const err = parseStreamPayload('{"error":{"message":"upstream exploded"}}');
  const e0 = err[0];
  assert(err.length === 1 && e0.kind === 'error' && e0.message === 'upstream exploded', 'parse: error payload surfaces its message');
}
{
  const errStr = parseStreamPayload('{"error":"boom"}');
  const es = errStr[0];
  assert(errStr.length === 1 && es.kind === 'error' && es.message === 'boom', 'parse: string error payload surfaces');
}
{
  const bad = parseStreamPayload('{not json');
  const b0 = bad[0];
  assert(bad.length === 1 && b0.kind === 'error', 'parse: malformed JSON is an error, never a silent skip');
}

// ── 4. runFreeChat — happy path, whole-buffer and adversarially split ────────

{
  const { fetchFn, calls } = makeStreamFetch([new TextEncoder().encode(happyStream())]);
  const seen: string[] = [];
  const res = await runFreeChat({
    base: 'https://probe.test/v1/',
    model: 'free-opencode',
    messages: [{ role: 'user', content: 'hi' }],
    fetchFn,
    onText: (d) => seen.push(d),
  });
  assert(res.ok, 'run: happy path resolves ok');
  assert(res.ok && res.text === 'lokma wire', 'run: text deltas concatenate to the measured answer');
  assert(res.ok && res.reasoning === 'lokma üzerinde düşün.', 'run: reasoning deltas concatenate');
  assert(res.ok && res.finishReason === 'stop', 'run: finish_reason captured');
  assert(res.ok && res.model === RESOLVED_MODEL, 'run: resolved upstream model reported (not the alias sent)');
  assert(res.ok && res.usage !== null && res.usage.totalTokens === 342, 'run: usage captured from the final event');
  assert(seen.join('|') === 'lok|ma |wire', 'run: onText fired once per delta in order');
  assert(calls.length === 1, 'run: exactly one request');

  const call = calls[0];
  assert(call.url === 'https://probe.test/v1/chat/completions', 'run: POSTs to chat/completions on the configured base');
  assert(call.init.method === 'POST', 'run: method is POST');
  const headers = (call.init.headers ?? {}) as Record<string, string>;
  const names = Object.keys(headers).map((h) => h.toLowerCase());
  assert(names.indexOf('authorization') === -1, 'keyless: NO Authorization header on the wire');
  assert(names.indexOf('x-api-key') === -1, 'keyless: no x-api-key either');
  const body = JSON.parse(String(call.init.body)) as Record<string, unknown>;
  assert(body.model === 'free-opencode', 'run: body carries the requested model');
  assert(body.stream === true, 'run: stream:true is always sent');
  assert(body.max_tokens === FREE_DEFAULT_MAX_TOKENS && FREE_DEFAULT_MAX_TOKENS >= 4000, 'run: default budget is generous (REQ pitfall 1)');
  assert(JSON.stringify(body.messages) === '[{"role":"user","content":"hi"}]', 'run: messages forwarded verbatim');
  assert(String(call.init.body).indexOf('sk-') === -1, 'keyless: no key material in the request body');
}

{
  // Same stream, split mid-line and mid-multi-byte char: reassembly must hold.
  const chunks = adversarialChunks(happyStream());
  const { fetchFn } = makeStreamFetch(chunks);
  const res = await runFreeChat({ base: 'https://probe.test/v1/', model: 'free-opencode', messages: [{ role: 'user', content: 'hi' }], fetchFn });
  assert(chunks.length === 3, 'split: fixture delivered as three chunks');
  assert(res.ok && res.text === 'lokma wire', 'split: text identical across chunk boundaries');
  assert(res.ok && res.reasoning === 'lokma üzerinde düşün.', 'split: multi-byte reasoning survives a mid-char cut');
  assert(res.ok && res.usage !== null && res.usage.totalTokens === 342, 'split: final meta still parsed');
}

// ── 5. NEGATIVE CONTROLS — honest failures, partial preservation ─────────────

{
  // 5a. HTTP 502 (the measured non-free-model answer) — verbatim, no fallback.
  const fetchFn = (async () => fakeRes({ status: 502, text: '{"error":"bad_gateway"}' })) as unknown as typeof fetch;
  const res = await runFreeChat({ base: 'https://probe.test/v1/', model: 'opencode-zen/claude-opus-5', messages: [{ role: 'user', content: 'x' }], fetchFn });
  assert(!res.ok, '502: resolves as a failure');
  assert(!res.ok && res.status === 502, '502: status carried');
  assert(!res.ok && res.error.indexOf('HTTP 502') === 0 && res.error.indexOf('bad_gateway') > 0, '502: error shows status AND the upstream detail');
  assert(!res.ok && res.aborted === false, '502: not marked as an abort');
}
{
  const fetchFn = (async () => fakeRes({ status: 429, text: '' })) as unknown as typeof fetch;
  const res = await runFreeChat({ base: 'https://probe.test/v1/', model: 'm', messages: [{ role: 'user', content: 'x' }], fetchFn });
  assert(!res.ok && res.status === 429 && res.error === 'HTTP 429', '429: rate limit surfaces as HTTP 429');
}
{
  const fetchFn = (async () => fakeRes({ status: 200, body: null })) as unknown as typeof fetch;
  const res = await runFreeChat({ base: 'https://probe.test/v1/', model: 'm', messages: [{ role: 'user', content: 'x' }], fetchFn });
  assert(!res.ok && res.error.indexOf('no response body') > 0, 'no-body: honest "streaming unsupported" error');
}
{
  // 5b. Empty first turn (role + stop only) is a FAILURE, not a completion.
  const { fetchFn } = makeStreamFetch([new TextEncoder().encode(ev({ role: 'assistant' }) + ev({}, 'stop', USAGE) + 'data: [DONE]\n\n')]);
  const res = await runFreeChat({ base: 'https://probe.test/v1/', model: 'm', messages: [{ role: 'user', content: 'x' }], fetchFn });
  assert(!res.ok, 'empty: zero-output run is a failure');
  assert(!res.ok && res.error === 'the upstream produced no answer text', 'empty: honest reason shown');
}
{
  // 5c. Reasoning-only output: reasoning preserved, but no answer text = failure.
  const { fetchFn } = makeStreamFetch([new TextEncoder().encode(ev({ role: 'assistant' }) + ev({ reasoning_content: 'düşünüyorum' }) + ev({}, 'stop', USAGE) + 'data: [DONE]\n\n')]);
  const res = await runFreeChat({ base: 'https://probe.test/v1/', model: 'm', messages: [{ role: 'user', content: 'x' }], fetchFn });
  assert(!res.ok, 'reasoning-only: still a failure (a reasoning block is not an answer)');
  assert(!res.ok && res.reasoning === 'düşünüyorum', 'reasoning-only: the thinking text is preserved on the failure branch');
}
{
  // 5d. finish_reason:length with no text names the real cause (REQ pitfall 1).
  const { fetchFn } = makeStreamFetch([new TextEncoder().encode(ev({ role: 'assistant' }) + ev({ reasoning_content: 'x' }) + ev({}, 'length', USAGE) + 'data: [DONE]\n\n')]);
  const res = await runFreeChat({ base: 'https://probe.test/v1/', model: 'm', messages: [{ role: 'user', content: 'x' }], fetchFn });
  assert(!res.ok && res.error.indexOf('token budget') > 0, 'truncated: finish_reason length names the budget, not a generic error');
}
{
  // 5e. Mid-stream error payload: partial text kept, body torn down.
  // The fixture stays OPEN (like a live upstream still sending) so the
  // runner's reader.cancel() is observably reaching the source — a closed
  // fixture would make cancel() a spec no-op and the check meaningless.
  let cancelled = false;
  const { fetchFn } = makeStreamFetch(
    [new TextEncoder().encode(ev({ role: 'assistant' }) + ev({ content: 'lok' }) + 'data: {"error":{"message":"upstream exploded"}}\n\n')],
    { keepOpen: true, onCancel: () => { cancelled = true; } },
  );
  const res = await runFreeChat({ base: 'https://probe.test/v1/', model: 'm', messages: [{ role: 'user', content: 'x' }], fetchFn });
  assert(!res.ok && res.error === 'upstream exploded', 'mid-error: upstream message surfaces verbatim');
  assert(!res.ok && res.text === 'lok', 'mid-error: partial text preserved');
  assert(cancelled, 'mid-error: the response body is cancelled (no orphan fetch)');
}
{
  // 5f. Abort mid-stream: no throw, partial text preserved, aborted flag set.
  const ctrl = new AbortController();
  let streamCont: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      streamCont = c;
      c.enqueue(new TextEncoder().encode(ev({ role: 'assistant' }) + ev({ content: 'lok' })));
    },
  });
  const fetchFn = (async (_url: string, init: RequestInit): Promise<Response> => {
    const sig = init.signal;
    if (sig) {
      sig.addEventListener('abort', () => {
        if (streamCont) streamCont.error(new DOMException('The operation was aborted.', 'AbortError'));
      });
    }
    return fakeRes({ body: stream });
  }) as unknown as typeof fetch;
  const res = await runFreeChat({
    base: 'https://probe.test/v1/',
    model: 'm',
    messages: [{ role: 'user', content: 'x' }],
    fetchFn,
    signal: ctrl.signal,
    onText: () => ctrl.abort(),
  });
  assert(!res.ok && res.aborted === true, 'abort: resolves with aborted:true (never throws)');
  assert(!res.ok && res.text === 'lok', 'abort: partial text preserved for persistence');
}
{
  // 5g. Pre-aborted signal: fetch rejects immediately, still a resolved result.
  const ctrl = new AbortController();
  ctrl.abort();
  const fetchFn = (async (_url: string, init: RequestInit): Promise<Response> => {
    const sig = init.signal;
    if (sig && sig.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    return fakeRes({ body: null });
  }) as unknown as typeof fetch;
  const res = await runFreeChat({ base: 'https://probe.test/v1/', model: 'm', messages: [{ role: 'user', content: 'x' }], fetchFn, signal: ctrl.signal });
  assert(!res.ok && res.aborted === true, 'pre-abort: aborted before any byte is still an aborted result');
}
{
  // 5h. Network rejection (server unreachable) surfaces its message.
  const fetchFn = (async () => {
    throw new TypeError('fetch failed');
  }) as unknown as typeof fetch;
  const res = await runFreeChat({ base: 'https://probe.test/v1/', model: 'm', messages: [{ role: 'user', content: 'x' }], fetchFn });
  assert(!res.ok && res.error === 'fetch failed', 'network: rejection message surfaces (no invented text)');
}

console.log('\n' + passed + ' assertions passed');
