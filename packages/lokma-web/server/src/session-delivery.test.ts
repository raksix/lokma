/**
 * Probe for the REQ-147 agent-to-session delivery (`deliverToSession`).
 * Run: HOME=$(mktemp -d) bun src/session-delivery.test.ts from
 * `packages/lokma-web/server` (build @lokma/core + @lokma/shared first).
 * Plain asserts against a real temp-HOME session store; the guard refuses
 * anything outside /tmp/ (bun snapshots HOME at boot).
 * Not imported by library code.
 */
import { homedir } from 'node:os';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { SessionStore, locateSession } from '@lokma/core';
import { __resetRunStates, getRunState } from './session-runs.js';
import { deliverToSession } from './session-delivery.js';

const home = homedir();
if (!home.startsWith('/tmp/')) {
  throw new Error('refusing to run outside a temp HOME (got ' + home + ')');
}

let passed = 0;
function check(cond: boolean, label: string): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

const targetCwd = '/tmp/req147-target';
const initCwd = '/tmp/req147-init';
const target = new SessionStore(targetCwd);
await target.append('sess_target', { role: 'user', content: 'seed', timestamp: new Date().toISOString() });
await target.writeMeta('sess_target', {});

const pumped: { sessionId: string; cwd: string }[] = [];
const pump = (sessionId: string, cwd: string): void => {
  pumped.push({ sessionId, cwd });
};
const gateOff = async (): Promise<boolean> => false;

// 1) idle target — message lands in the transcript, queued on the run queue,
//    pump fires with the located cwd; the result says it can run now.
__resetRunStates();
const r1 = await deliverToSession({ targetSessionId: 'sess_target', message: '  selam naber  ', fallbackCwd: initCwd, pump, gateActive: gateOff });
check(r1.ok === true && r1.queued === false, 'idle target: delivery ok + can run now');
check(pumped.length === 1 && pumped[0].sessionId === 'sess_target' && pumped[0].cwd === targetCwd, 'idle target: pump gets the located session cwd');
const rows1 = await target.read('sess_target');
check(rows1[rows1.length - 1]?.content === 'selam naber', 'idle target: trimmed message appended as a user row');
check(getRunState('sess_target').queue.length === 1 && getRunState('sess_target').queue[0]?.prompt === 'selam naber', 'idle target: one prompt queued');

// 2) a second delivery while the first is still queued — reported as queued
//    (never dropped: FIFO depth grows).
const r2 = await deliverToSession({ targetSessionId: 'sess_target', message: 'ikinci', fallbackCwd: initCwd, pump, gateActive: gateOff });
check(r2.ok === true && r2.queued === true, 'busy target: second delivery reports queued');
check(getRunState('sess_target').queue.length === 2, 'busy target: FIFO depth grows (no overwrite)');

// 3) a RUNNING target (no extra queue depth yet) still reports queued — the
//    run state flag alone decides.
__resetRunStates();
getRunState('sess_target').running = true;
const r3 = await deliverToSession({ targetSessionId: 'sess_target', message: 'calisirken', fallbackCwd: initCwd, pump, gateActive: gateOff });
check(r3.ok === true && r3.queued === true, 'running target: delivery reports queued');
__resetRunStates();

// 4) unknown target — honest failure, no side effects.
const pumpedBefore = pumped.length;
const r4 = await deliverToSession({ targetSessionId: 'sess_missing', message: 'hey', fallbackCwd: initCwd, pump, gateActive: gateOff });
check(r4.ok === false && r4.code === 'session_not_found', 'unknown target: session_not_found');
check(pumped.length === pumpedBefore && getRunState('sess_missing').queue.length === 0, 'unknown target: no pump, nothing queued');

// 5) empty / whitespace message — refused before any effect.
const r5 = await deliverToSession({ targetSessionId: 'sess_target', message: '   ', fallbackCwd: initCwd, pump, gateActive: gateOff });
check(r5.ok === false && r5.code === 'empty_message', 'empty message: refused');

// 6) login gate ON + anonymous actor — forbidden, transcript untouched
//    (ownership rule mirrors the WS handshake).
const rowsBefore = (await target.read('sess_target')).length;
const queueBefore = getRunState('sess_target').queue.length;
const r6 = await deliverToSession({ targetSessionId: 'sess_target', message: 'sneak', fallbackCwd: initCwd, pump, gateActive: async () => true });
check(r6.ok === false && r6.code === 'forbidden', 'gate on + anonymous: forbidden');
// 7) gate ON + an id that resolves to no user (temp HOME has no auth store).
const r7 = await deliverToSession({ targetSessionId: 'sess_target', message: 'sneak', actorUserId: 'usr_ghost', fallbackCwd: initCwd, pump, gateActive: async () => true });
check(r7.ok === false && r7.code === 'forbidden', 'gate on + unknown actor: forbidden');
check((await target.read('sess_target')).length === rowsBefore && getRunState('sess_target').queue.length === queueBefore, 'forbidden: transcript + queue untouched');
__resetRunStates();

// 8) meta-less target (legacy transcript) — falls back to the initiator cwd
//    instead of failing.
const legacyCwd = '/tmp/req147-legacy';
const fallbackCwd = '/tmp/req147-fallback';
const legacy = new SessionStore(legacyCwd);
await legacy.append('sess_meta_less', { role: 'user', content: 'legacy', timestamp: new Date().toISOString() });
const located = await locateSession('sess_meta_less');
assert.ok(located, 'fixture: the meta-less session was written');
await rm(join(located.dir, 'sess_meta_less.meta.json'), { force: true });
const r8 = await deliverToSession({ targetSessionId: 'sess_meta_less', message: 'fallback testi', fallbackCwd, pump, gateActive: gateOff });
check(r8.ok === true, 'meta-less target: delivery still ok');
const fallbackRows = await new SessionStore(fallbackCwd).read('sess_meta_less');
check(fallbackRows.some((row) => row.content === 'fallback testi'), 'meta-less target: row lands under the fallback cwd');
check(pumped[pumped.length - 1]?.cwd === fallbackCwd, 'meta-less target: pump receives the fallback cwd');
__resetRunStates();

console.log('--- ' + passed + ' checks passed ---');
