/**
 * Probe for the REQ-149 WS session-data frames.
 * Run: `bun src/protocol/ws.test.ts` from `packages/lokma-shared`.
 * No test framework — plain asserts. Excluded from the package build.
 */
import { strict as assert } from 'node:assert';
import {
  ClientMessageSchema,
  ServerMessageSchema,
  decodeClientMessage,
  encodeServerMessage,
} from './ws.js';

// ── Client requests ────────────────────────────────────────────────────────
assert.ok(decodeClientMessage(JSON.stringify({ type: 'sessions_list' })), 'sessions_list parses');
const get = decodeClientMessage(JSON.stringify({ type: 'transcript_get', sessionId: 'sess_abc' }));
assert.equal(get?.type, 'transcript_get', 'transcript_get parses');
assert.equal(get && 'sessionId' in get ? get.sessionId : null, 'sess_abc');

// Empty / oversized ids are rejected (id is a filename token server-side).
assert.equal(decodeClientMessage(JSON.stringify({ type: 'transcript_get', sessionId: '' })), null);
assert.equal(
  decodeClientMessage(JSON.stringify({ type: 'transcript_get', sessionId: 'x'.repeat(129) })),
  null,
);
assert.equal(ClientMessageSchema.safeParse({ type: 'transcript_get' }).success, false);

// ── Server answers ─────────────────────────────────────────────────────────
const row = {
  id: 'sess_abc',
  cwd: '/tmp/proj',
  title: 'hello',
  renamed: false,
  model: 'deepseek/deepseek-v4.1-flash',
  botId: null,
  messageCount: 2,
  createdAt: '2026-09-15T00:00:00.000Z',
  updatedAt: '2026-09-15T00:00:01.000Z',
  ownerId: null,
};
const sessionsFrame = ServerMessageSchema.safeParse({ type: 'sessions', sessions: [row] });
assert.ok(sessionsFrame.success, 'sessions frame parses');

// REQ-149 run flags (REQ-121 parity): an enriched row keeps them, and a row
// without them still parses (they are optional on purpose).
const runRow = { ...row, running: true, queued: 2 };
const runFrame = ServerMessageSchema.safeParse({ type: 'sessions', sessions: [runRow] });
assert.ok(runFrame.success, 'sessions frame parses with run flags');
assert.equal(
  runFrame.success && runFrame.data.type === 'sessions' ? runFrame.data.sessions[0]?.running : null,
  true,
  'running survives the parse',
);
assert.equal(
  runFrame.success && runFrame.data.type === 'sessions' ? runFrame.data.sessions[0]?.queued : null,
  2,
  'queued survives the parse',
);
assert.ok(ServerMessageSchema.safeParse({ type: 'sessions', sessions: [row] }).success, 'run flags stay optional');

const transcriptFrame = ServerMessageSchema.safeParse({
  type: 'transcript',
  sessionId: 'sess_abc',
  messages: [
    { role: 'user', content: 'hi', timestamp: '2026-09-15T00:00:00.000Z' },
    { role: 'tool', content: 'ok', timestamp: '2026-09-15T00:00:01.000Z', toolName: 'read_file', toolCallId: 'c1' },
  ],
});
assert.ok(transcriptFrame.success, 'transcript frame parses');

const appendFrame = { type: 'transcript_append', sessionId: 'sess_abc', message: { role: 'assistant', content: 'done', timestamp: '2026-09-15T00:00:02.000Z' } } as const;
assert.ok(ServerMessageSchema.safeParse(appendFrame).success, 'transcript_append frame parses');

// Wrong role / missing payload are rejected, not silently accepted.
assert.equal(ServerMessageSchema.safeParse({ type: 'transcript_append', sessionId: 's', message: { role: 'system', content: 'x', timestamp: 't' } }).success, false);
assert.equal(ServerMessageSchema.safeParse({ type: 'transcript', sessionId: 's' }).success, false);

// Round-trip through the encoder the server actually uses.
const encoded = encodeServerMessage({ type: 'sessions', sessions: [row] });
assert.deepEqual(JSON.parse(encoded), { type: 'sessions', sessions: [row] });

console.log('REQ-149 ws protocol frames: 16/16 checks passed');
