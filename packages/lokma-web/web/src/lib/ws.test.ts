/**
 * WS-client probe for the F2 foundation (`./ws` + shared protocol).
 * Run: `bun src/lib/ws.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain asserts so `tsc -b` stays dependency-free.
 * Not imported by app code, so the Vite bundle ignores it.
 */
import { ClientMessageSchema } from '@lokma/shared/protocol/ws';
import {
  abortMessage,
  applyServerFrame,
  decodeServerFrame,
  directWsUrl,
  dropLiveTrace,
  initialWsUiState,
  permissionAnswer,
  promptMessage,
  questionAnswer,
  reconnectDelay,
  withAuthToken,
  wsUrl,
} from './ws';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

// Minimal browser stub: origin drives the proxy-relative URL.
(globalThis as unknown as Record<string, unknown>).window = {
  location: { protocol: 'http:', host: '127.0.0.1:3457', hostname: '127.0.0.1' },
};

// 1. Proxy-relative URL rides the vite `/ws` proxy (no hardcoded :3456).
assert(wsUrl('abc') === 'ws://127.0.0.1:3457/ws/abc', 'wsUrl uses the serving origin (proxy path)');
// 2. Direct URL keeps the server port as an explicit fallback.
assert(directWsUrl('abc') === 'ws://127.0.0.1:3456/ws/abc', 'directWsUrl targets :3456 fallback');
// 3. Session ids are encoded.
assert(wsUrl('a/b') === 'ws://127.0.0.1:3457/ws/a%2Fb', 'wsUrl encodes the session id');
// 4. https origin upgrades to wss.
(globalThis as unknown as { window: { location: Record<string, string> } }).window.location.protocol =
  'https:';
assert(wsUrl('abc').startsWith('wss://'), 'https origin upgrades to wss');
(globalThis as unknown as { window: { location: Record<string, string> } }).window.location.protocol =
  'http:';

// 5. Backoff is capped exponential (deterministic).
assert(reconnectDelay(0) === 500, 'backoff attempt 0 = 500ms');
assert(reconnectDelay(1) === 1000, 'backoff attempt 1 = 1000ms');
assert(reconnectDelay(3) === 4000, 'backoff attempt 3 = 4000ms');
assert(reconnectDelay(10) === 10_000, 'backoff caps at 10000ms');
assert(reconnectDelay(99) === 10_000, 'backoff stays capped');

// 6. Valid frames decode; garbage and unknown types are dropped.
const delta = decodeServerFrame(JSON.stringify({ type: 'text_delta', delta: 'hi', sessionId: 's' }));
assert(delta?.type === 'text_delta', 'text_delta decodes');
assert(decodeServerFrame('not json{{{') === null, 'garbage returns null');
assert(decodeServerFrame(JSON.stringify({ type: 'nope' })) === null, 'unknown frame returns null');
assert(decodeServerFrame(JSON.stringify({ type: 'text_delta' })) === null, 'shape violation returns null');

// 7. Builders emit schema-valid client messages (no drift from the protocol).
for (const raw of [
  promptMessage('hello', 's'),
  promptMessage('think', 's', { reasoningEffort: 'high' }),
  promptMessage('plain', 's', { reasoningEffort: 'off' }),
  abortMessage('s'),
  permissionAnswer('r1', 'allow'),
  permissionAnswer('r2', 'always'),
  questionAnswer('r3', 'yes'),
]) {
  const parsed = ClientMessageSchema.safeParse(JSON.parse(raw));
  assert(parsed.success, `builder output validates: ${raw.slice(0, 48)}`);
}

// 7b. REQ-133: the composer pick reaches the wire only when it asks for
// reasoning, and an unknown level is rejected rather than silently sent.
const withThinking = JSON.parse(promptMessage('hi', 's', { reasoningEffort: 'medium' })) as { reasoningEffort?: string };
assert(withThinking.reasoningEffort === 'medium', 'promptMessage carries the thinking level');
const withoutThinking = JSON.parse(promptMessage('hi', 's')) as { reasoningEffort?: string };
assert(withoutThinking.reasoningEffort === undefined, 'an unset level stays off the wire');
assert(
  !ClientMessageSchema.safeParse({ type: 'prompt', prompt: 'x', reasoningEffort: 'max' }).success,
  'an unknown thinking level is rejected by the schema',
);

// 8. Reducer folds frames into UI state.
let state = initialWsUiState();
state = applyServerFrame(state, { type: 'text_delta', delta: 'he', sessionId: 's' });
state = applyServerFrame(state, { type: 'text_delta', delta: 'llo', sessionId: 's' });
assert(state.stream === 'hello', 'text_delta appends to the stream');
state = applyServerFrame(state, {
  type: 'tool_start',
  tool: 'read',
  input: { path: 'x' },
  callId: 'c1',
  sessionId: 's',
});
assert(state.toolCalls.c1?.tool === 'read', 'tool_start registers the call');
state = applyServerFrame(state, {
  type: 'tool_result',
  callId: 'c1',
  result: 'ok',
  isError: false,
  sessionId: 's',
});
assert(state.toolCalls.c1?.result === 'ok', 'tool_result merges into the call');
state = applyServerFrame(state, {
  type: 'cost',
  sessionId: 's',
  inputTokens: 10,
  outputTokens: 5,
  costUsd: 0.001,
  model: 'm',
});
state = applyServerFrame(state, {
  type: 'cost',
  sessionId: 's',
  inputTokens: 10,
  outputTokens: 5,
  costUsd: 0.001,
  model: 'm',
});
assert(state.cost.inputTokens === 20 && Math.abs(state.cost.costUsd - 0.002) < 1e-9, 'cost accumulates');
state = applyServerFrame(state, {
  type: 'permission_request',
  requestId: 'p1',
  tool: 'bash',
  description: 'run it',
  sessionId: 's',
});
assert(state.permissions.length === 1, 'permission_request queues');
state = applyServerFrame(state, {
  type: 'ask_user_question',
  requestId: 'q1',
  question: 'which?',
  sessionId: 's',
});
assert(state.questions.length === 1, 'ask_user_question queues');
state = applyServerFrame(state, { type: 'done', sessionId: 's', reason: 'complete' });
assert(state.done && state.doneReason === 'complete', 'done flips the flag');
state = applyServerFrame(state, { type: 'error', message: 'boom', sessionId: 's' });
assert(state.lastError === 'boom', 'error records the message');
assert(state.done && state.doneReason === 'error', 'error ends the run (no stuck sending)');
// REQ-136: the code travels with the message — the card words itself from it.
state = applyServerFrame(state, { type: 'error', message: 'paused', code: 'turn_limit', sessionId: 's' });
assert(state.lastErrorCode === 'turn_limit', 'error keeps its code for the UI');
assert(
  applyServerFrame(initialWsUiState(), { type: 'error', message: 'x', sessionId: 's' }).lastErrorCode === null,
  'a codeless error stays null instead of a stale value',
);
state = applyServerFrame(initialWsUiState(), { type: 'thinking_delta', delta: 'hmm', sessionId: 's' });
assert(state.thinking === 'hmm' && !state.done, 'thinking accumulates without ending the run');

// 9. No stored token → URL passes through untouched.
assert(withAuthToken('ws://127.0.0.1:3457/ws/abc') === 'ws://127.0.0.1:3457/ws/abc', 'no token leaves the URL alone');

// 10. REQ-077: retry_notice surfaces without touching stream/done.
state = applyServerFrame(state, { type: 'retry_notice', attempt: 2, maxAttempts: 10, waitMs: 10000, message: 'boom', sessionId: 's' });
assert(state.retry !== null && state.retry.attempt === 2 && state.retry.waitMs === 10000, 'retry notice stored');
assert(!state.done, 'retry does not end the run');

// 11. REQ-111: tool_start cuts the live stream in arrival order.
let cut = initialWsUiState();
cut = applyServerFrame(cut, { type: 'text_delta', delta: 'looking', sessionId: 's' });
cut = applyServerFrame(cut, { type: 'tool_start', tool: 'read', input: {}, callId: 'c1', sessionId: 's' });
assert(cut.toolMarks.length === 1 && cut.toolMarks[0].callId === 'c1' && cut.toolMarks[0].at === 7, 'first mark cuts after prior text');
cut = applyServerFrame(cut, { type: 'text_delta', delta: ' found it', sessionId: 's' });
cut = applyServerFrame(cut, { type: 'tool_start', tool: 'write', input: {}, callId: 'c2', sessionId: 's' });
assert(cut.toolMarks.length === 2 && cut.toolMarks[1].callId === 'c2' && cut.toolMarks[1].at === 16, 'second mark cuts after later text');
cut = applyServerFrame(cut, { type: 'tool_result', callId: 'c1', result: 'ok', isError: false, sessionId: 's' });
assert(cut.toolMarks.length === 2, 'tool_result adds no mark');
cut = applyServerFrame(cut, { type: 'tool_start', tool: 'read', input: {}, callId: 'c1', sessionId: 's' });
assert(cut.toolMarks.length === 2, 'resent tool_start is idempotent');

// 12. REQ-132: a finished run must drop the live trace, otherwise the answer
//     renders twice — once from the refetched transcript row, once from the
//     still-populated live buffers (the "stream bitince iki kere geliyor" bug).
let dup = initialWsUiState();
dup = applyServerFrame(dup, { type: 'thinking_delta', delta: 'weighing options', sessionId: 's' });
dup = applyServerFrame(dup, { type: 'text_delta', delta: 'Final answer.', sessionId: 's' });
dup = applyServerFrame(dup, { type: 'tool_start', tool: 'read', input: {}, callId: 'c9', sessionId: 's' });
assert(dup.stream === 'Final answer.' && dup.thinking === 'weighing options', 'live trace is populated while streaming');
const settled = dropLiveTrace(applyServerFrame(dup, { type: 'done', sessionId: 's', reason: 'complete' }));
assert(settled.stream === '' && settled.thinking === '', 'finished run drops the live answer and thinking');
assert(settled.toolMarks.length === 0 && Object.keys(settled.toolCalls).length === 0, 'finished run drops live tool rows');
assert(settled.done === true && settled.doneReason === 'complete', 'dropping the trace keeps the run marked done');
assert(settled.retry === null, 'dropping the trace clears a stale retry notice');

delete (globalThis as unknown as Record<string, unknown>).window;
console.log('ws.test.ts: all WS-client checks passed');
