/**
 * Probe for the REQ-149 append feed (`onSessionAppend`).
 * Run: `HOME=$(mktemp -d) bun src/session/append-feed.test.ts` from
 * `packages/lokma-core`. No test framework — plain asserts.
 * Real temp HOME on disk (bun snapshots HOME at boot, so a runtime override
 * would pollute the real `~/.lokma`; the guard refuses anything outside
 * `/tmp/`). Excluded from the package build like the other `*.test.ts` probes.
 */
import { homedir } from 'node:os';
import { strict as assert } from 'node:assert';
import { onSessionAppend, SessionStore } from './store.js';

const home = homedir();
if (!home.startsWith('/tmp/')) {
  throw new Error(`refusing to run outside a temp HOME (got ${home})`);
}

const store = new SessionStore('/tmp/req149-proj');
const id = 'sess_req149';

// 1. A subscribed listener sees the appended row (id + message verbatim).
const seen: Array<{ sessionId: string; role: string; content: string }> = [];
const off = onSessionAppend((ev) => {
  seen.push({ sessionId: ev.sessionId, role: ev.message.role, content: ev.message.content });
});
await store.append(id, { role: 'user', content: 'first', timestamp: new Date().toISOString() });
await store.append(id, { role: 'assistant', content: 'second', timestamp: new Date().toISOString() });
assert.equal(seen.length, 2, 'both appends reach the listener');
assert.equal(seen[0]?.sessionId, id, 'listener sees the session id');
assert.equal(seen[0]?.role, 'user');
assert.equal(seen[0]?.content, 'first');
assert.equal(seen[1]?.content, 'second');

// 2. The row is already persisted when the listener runs (push follows disk).
const persisted: string[] = [];
const off2 = onSessionAppend((ev) => {
  persisted.push(ev.message.content);
});
await store.append(id, { role: 'assistant', content: 'third', timestamp: new Date().toISOString() });
off2();
const onDisk = await store.read(id);
assert.equal(onDisk.at(-1)?.content, 'third', 'listener fired after the row hit disk');
assert.deepEqual(persisted, ['third']);

// 3. Unsubscribed listeners receive nothing new.
// Three rows have streamed to the first listener so far (first/second/third).
const beforeOff = seen.length;
assert.equal(beforeOff, 3, 'listener 1 saw every row while subscribed');
off();
await store.append(id, { role: 'user', content: 'after-off', timestamp: new Date().toISOString() });
assert.equal(seen.length, beforeOff, 'unsubscribe stops delivery');

// 4. A throwing listener never breaks the append (and never blocks peers).
const ok: string[] = [];
const offThrow = onSessionAppend(() => {
  throw new Error('boom');
});
const offOk = onSessionAppend((ev) => {
  ok.push(ev.message.content);
});
await store.append(id, { role: 'assistant', content: 'survives', timestamp: new Date().toISOString() });
offThrow();
offOk();
assert.equal(ok.length, 1, 'a throwing listener does not starve the next listener');
const after = await store.read(id);
assert.equal(after.at(-1)?.content, 'survives', 'the append still landed on disk');

console.log('REQ-149 append feed: 4/4 checks passed');
