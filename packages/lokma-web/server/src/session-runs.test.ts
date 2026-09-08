/**
 * Session run-queue probe (REQ-070).
 * Run: `bun src/session-runs.test.ts` from `packages/lokma-web/server`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Not imported by server code, so `tsc -p` output ignores it.
 */
import { __resetRunStates, broadcast, enqueuePrompt, getRunState, pruneRunState, runStatus, SOCKET_OPEN } from './session-runs';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

// 1. Unknown session reports idle/empty.
__resetRunStates();
const idle = runStatus('sess_none');
assert(idle.running === false && idle.queued === 0, 'unknown session is idle');

// 2. FIFO order survives multiple enqueues.
__resetRunStates();
enqueuePrompt('s1', { prompt: 'first', enqueuedAt: 't1' });
enqueuePrompt('s1', { prompt: 'second', enqueuedAt: 't2' });
const st = getRunState('s1');
assert(st.queue.length === 2 && st.queue[0].prompt === 'first' && st.queue[1].prompt === 'second', 'prompts queue FIFO');
assert(runStatus('s1').queued === 2, 'status counts queued');

// 3. Sessions are isolated from each other.
enqueuePrompt('s2', { prompt: 'other', enqueuedAt: 't3' });
assert(runStatus('s2').queued === 1 && runStatus('s1').queued === 2, 'per-session isolation');

// 4. Broadcast reaches OPEN sockets only, never throws on dead ones.
__resetRunStates();
const live: string[] = [];
const dead: string[] = [];
const rs = getRunState('s9');
rs.sockets.add({ readyState: SOCKET_OPEN, send: (d) => live.push(d) });
rs.sockets.add({
  readyState: 3,
  send: (d) => {
    dead.push(d);
  },
});
rs.sockets.add({
  readyState: SOCKET_OPEN,
  send: () => {
    throw new Error('gone');
  },
});
const n = broadcast(rs, 'frame');
assert(n === 1 && live.length === 1 && live[0] === 'frame' && dead.length === 0, 'broadcast hits live sockets only');

// 5. Idle empty state prunes; running/queued/attached state survives.
__resetRunStates();
getRunState('sx');
assert(pruneRunState('sx') === true, 'idle state prunes');
const busy = getRunState('sy');
busy.running = true;
assert(pruneRunState('sy') === false, 'running state survives');
busy.running = false;
enqueuePrompt('sy', { prompt: 'q', enqueuedAt: 't' });
assert(pruneRunState('sy') === false, 'queued state survives');

console.log(`\nsession-runs probe: ${passed} passed`);
