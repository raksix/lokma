/**
 * WS-client probe for the F2 foundation (`./ws` + shared protocol).
 * Run: `bun src/lib/ws.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain asserts so `tsc -b` stays dependency-free.
 * Not imported by app code, so the Vite bundle ignores it.
 */
import { ClientMessageSchema } from 'lokma-shared/protocol/ws';
import {
  abortMessage,
  applyServerFrame,
  decodeServerFrame,
  directWsUrl,
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
  abortMessage('s'),
  permissionAnswer('r1', 'allow'),
  permissionAnswer('r2', 'always'),
  questionAnswer('r3', 'yes'),
]) {
  const parsed = ClientMessageSchema.safeParse(JSON.parse(raw));
  assert(parsed.success, `builder output validates: ${raw.slice(0, 48)}`);
}

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

// 9. No stored token → URL passes through untouched.
assert(withAuthToken('ws://127.0.0.1:3457/ws/abc') === 'ws://127.0.0.1:3457/ws/abc', 'no token leaves the URL alone');

delete (globalThis as unknown as Record<string, unknown>).window;
console.log('ws.test.ts: all WS-client checks passed');
