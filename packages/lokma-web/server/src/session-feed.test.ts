/**
 * Probe for the REQ-149 session feed (server half).
 * Run: `HOME=$(mktemp -d) bun src/session-feed.test.ts` from
 * `packages/lokma-web/server`. No test framework — plain asserts.
 * Real temp HOME on disk (bun snapshots HOME at boot, so a runtime override
 * would pollute the real `~/.lokma`; the guard refuses anything outside
 * `/tmp/`). Not imported by server code, so `tsc -p` output ignores it.
 */
import { homedir } from 'node:os';
import { strict as assert } from 'node:assert';
import { SessionStore, type User } from '@lokma/core';
import { ServerMessageSchema } from '@lokma/shared';
import {
  __resetSessionFeed,
  listRowsFor,
  subscribeSessionList,
  subscribeSessionTranscript,
  toSessionRow,
  toTranscriptRow,
  unsubscribeSocket,
} from './session-feed.js';

const home = homedir();
if (!home.startsWith('/tmp/')) {
  throw new Error(`refusing to run outside a temp HOME (got ${home})`);
}

/** Minimal fake socket that records whatever the feed pushes at it. */
function fakeSocket(readyState = 1) {
  const frames: string[] = [];
  return {
    readyState,
    send: (data: string) => {
      frames.push(data);
    },
    frames,
  };
}

/** Parse every recorded frame with the real wire schema (never assumptions). */
function parsed(raw: string[]): Array<Record<string, unknown>> {
  return raw.map((line) => ServerMessageSchema.parse(JSON.parse(line)) as Record<string, unknown>);
}

const store = new SessionStore('/tmp/req149-feed-proj');
const main = 'sess_feed_main';
const other = 'sess_feed_other';

// 1. A watching socket receives every appended row as `transcript_append`.
__resetSessionFeed();
const watcher = fakeSocket();
subscribeSessionTranscript(main, watcher);
await store.append(main, { role: 'user', content: 'hello feed', timestamp: new Date().toISOString() });
await store.append(main, { role: 'tool', content: '{"ok":true}', timestamp: new Date().toISOString(), toolCallId: 'call_1', toolName: 'read_file' });
const pushed = parsed(watcher.frames);
assert.equal(pushed.length, 2, `two rows were pushed (got ${pushed.length})`);
assert.equal(pushed[0]?.type, 'transcript_append');
assert.equal(pushed[0]?.sessionId, main);
const firstMessage = pushed[0]?.message as Record<string, unknown>;
assert.equal(firstMessage.content, 'hello feed');
assert.equal(firstMessage.role, 'user');
assert.equal(typeof firstMessage.timestamp, 'string');
const toolMessage = pushed[1]?.message as Record<string, unknown>;
assert.equal(toolMessage.toolCallId, 'call_1', 'tool rows carry toolCallId');
assert.equal(toolMessage.toolName, 'read_file', 'tool rows carry toolName');

// 2. Appends to ANOTHER session never reach this socket (no cross-talk).
const beforeOther = watcher.frames.length;
await store.append(other, { role: 'user', content: 'not mine', timestamp: new Date().toISOString() });
assert.equal(watcher.frames.length, beforeOther, 'another session appends nothing here');

// 3. A detached socket stops receiving (close path).
unsubscribeSocket(watcher);
await store.append(main, { role: 'assistant', content: 'after detach', timestamp: new Date().toISOString() });
assert.equal(watcher.frames.length, beforeOther, 'unsubscribe stops the push');

// 4. A dead socket never throws and receives nothing (send guard).
__resetSessionFeed();
const dead = fakeSocket(3);
subscribeSessionTranscript(main, dead);
await store.append(main, { role: 'assistant', content: 'for the dead', timestamp: new Date().toISOString() });
assert.equal(dead.frames.length, 0, 'closed sockets are skipped, not crashed');

// 5. The snapshot request returns sidebar rows with run flags (REQ-121).
const rows = await listRowsFor(null);
const mainRow = rows.find((r) => r.id === main);
assert.ok(mainRow, 'snapshot lists the session');
assert.equal(mainRow?.running, false, 'idle session reports running=false');
assert.equal(mainRow?.queued, 0, 'idle session reports queued=0');
assert.equal(typeof mainRow?.messageCount, 'number');
const row = toSessionRow({
  id: 'sess_shape',
  cwd: '/tmp/x',
  title: 't',
  renamed: false,
  model: null,
  botId: null,
  messageCount: 1,
  createdAt: 'c',
  updatedAt: 'u',
  ownerId: null,
});
assert.equal(row.running, false, 'toSessionRow stamps run flags');

// 6. List watchers get debounced `sessions` pushes (no REST poll needed).
__resetSessionFeed();
const listWatcher = fakeSocket();
subscribeSessionList(listWatcher, null);
await store.append(main, { role: 'assistant', content: 'list bump', timestamp: new Date().toISOString() });
await new Promise((resolve) => setTimeout(resolve, 1200));
const listFrames = parsed(listWatcher.frames).filter((f) => f.type === 'sessions');
assert.equal(listFrames.length, 1, `one debounced list push (got ${listFrames.length})`);
const pushedRows = listFrames[0]?.sessions as Array<Record<string, unknown>>;
assert.ok(Array.isArray(pushedRows) && pushedRows.some((r) => r.id === main), 'pushed list contains the session');
// A burst of appends stays one push (debounce) — three rows, still one frame.
const beforeBurst = parsed(listWatcher.frames).filter((f) => f.type === 'sessions').length;
await store.append(main, { role: 'user', content: 'burst 1', timestamp: new Date().toISOString() });
await store.append(main, { role: 'user', content: 'burst 2', timestamp: new Date().toISOString() });
await store.append(main, { role: 'user', content: 'burst 3', timestamp: new Date().toISOString() });
await new Promise((resolve) => setTimeout(resolve, 1200));
const afterBurst = parsed(listWatcher.frames).filter((f) => f.type === 'sessions').length;
assert.equal(afterBurst, beforeBurst + 1, 'an append burst collapses into one push');

// 7. Ownership filtering matches the REST list (REQ-094).
const alice = { id: 'u_alice', role: 'calisan' } as unknown as User;
const bob = { id: 'u_bob', role: 'calisan' } as unknown as User;
const aliceSession = 'sess_feed_alice';
await store.append(aliceSession, { role: 'user', content: 'hers', timestamp: new Date().toISOString() });
await store.writeMeta(aliceSession, { ownerId: 'u_alice' });
const aliceRows = await listRowsFor(alice);
assert.ok(aliceRows.some((r) => r.id === aliceSession), 'owner sees her own session');
assert.ok(!aliceRows.some((r) => r.id === main), 'unattributed/foreign sessions stay hidden');
const bobRows = await listRowsFor(bob);
assert.ok(!bobRows.some((r) => r.id === aliceSession), 'a stranger never sees it');
const anonymousRows = await listRowsFor(null);
assert.ok(anonymousRows.some((r) => r.id === aliceSession), 'gate-off legacy mode sees everything');

// 8. Wire mapping keeps optional fields off when absent (schema-clean rows).
const plain = toTranscriptRow({ role: 'assistant', content: 'x', timestamp: 'now' });
assert.deepEqual(Object.keys(plain).sort(), ['content', 'role', 'timestamp'], 'no empty optional keys');

unsubscribeSocket(listWatcher);
console.log('REQ-149 session feed: 8 groups, all checks passed');
