/**
 * Terminal idle-reaping probe (REQ-158) — shells nobody touches must be handed
 * back so the live limit can never wedge the pane ("clicking does nothing").
 * Run: `bun src/terminal/terminal.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts (same precedent as tools.test.ts).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TERMINAL_MAX_LIVE,
  TERMINAL_SPAWN_FREE_IDLE_MS,
  TERMINAL_SWEEP_IDLE_MS,
  TerminalManager,
} from './terminal';

let passed = 0;
function check(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

const dir = await mkdtemp(join(tmpdir(), 'lokma-term-'));
const manager = new TerminalManager();

try {
  check(TERMINAL_SPAWN_FREE_IDLE_MS < TERMINAL_SWEEP_IDLE_MS, 'the spawn hand-back is quicker than the sweep');

  const user = await manager.spawn({ cwd: dir, sessionId: 'sess_a' });
  const agent = await manager.spawn({ cwd: dir, sessionId: 'sess_a', agentId: 'agent_1' });
  check(manager.runningCount() === 2, 'two shells are live');

  const freed = await manager.freeIdle(0);
  check(freed.includes(user.record.id), 'an untouched user shell is handed back');
  check(!freed.includes(agent.record.id), 'an agent-managed shell is never reaped');
  check(manager.runningCount() === 1, 'only the agent shell stays live');
  check(manager.peek(agent.record.id)?.status === 'running', 'the survivor is still running');

  // A shell that just produced output must survive the same sweep.
  const busy = await manager.spawn({ cwd: dir, sessionId: 'sess_b' });
  check((await manager.freeIdle(60_000)).length === 0, 'a freshly used shell survives an idle sweep');
  check(manager.peek(busy.record.id)?.status === 'running', 'and is still running afterwards');

  await manager.kill(busy.record.id);
  await manager.kill(agent.record.id);

  // The limit itself: every slot busy with untouched user shells → the next
  // spawn first hands the idle ones back instead of throwing 429.
  const fillers: string[] = [];
  for (let i = 0; i < TERMINAL_MAX_LIVE; i += 1) {
    const s = await manager.spawn({ cwd: dir, sessionId: `sess_fill_${i}`, agentId: `agent_fill_${i}` });
    fillers.push(s.record.id);
  }
  check(manager.runningCount() === TERMINAL_MAX_LIVE, `the live limit (${TERMINAL_MAX_LIVE}) is reached with agent shells`);
  let refused = false;
  try {
    await manager.spawn({ cwd: dir, sessionId: 'sess_over' });
  } catch {
    refused = true;
  }
  check(refused, 'agent shells are never reaped, so a full limit still refuses honestly');
  for (const id of fillers) await manager.kill(id);

  console.log(`terminal-idle: ${passed} passed`);
} finally {
  await rm(dir, { recursive: true, force: true });
  process.exit(passed > 0 ? 0 : 1);
}
