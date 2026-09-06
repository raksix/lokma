/**
 * Regression probe: deleting an agent cascades to its cron jobs
 * (`deleteAgent` → `deleteCronJobsForAgent`).
 * Run: `HOME=$(mktemp -d) bun src/cron/cascade.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Real temp HOME on disk (startup env — bun snapshots HOME at boot; the
 * guard below refuses anything outside `/tmp/`). Real `/root/.lokma`
 * untouched.
 * Regression cover (area A run 7): `DELETE /api/agents/:id` removed only the
 * agent dir — its cron jobs survived in `~/.lokma/cron/jobs.json`, so the
 * 30s ticker spammed level-40 `Agent '<id>' not found` forever, and
 * `deleteCronJob` could never remove them (it asserts the agent exists
 * first). Now the delete cascades: jobs vanish with the agent.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgent, deleteAgent, deleteCronJobsForAgent } from '../agents/registry.js';
import { createCronJob, deleteCronJob, listCronJobs } from './cron.js';

const HOME = process.env.HOME ?? '';
if (!HOME.startsWith('/tmp/')) {
  throw new Error(`REFUSE: HOME=${HOME || '(empty)'} — rerun with HOME=$(mktemp -d) bun ...`);
}

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

async function main(): Promise<void> {
  const cwd = mkdtempSync(join(tmpdir(), 'lokma-cascade-probe-'));
  const agent = await createAgent({ name: 'cascade-probe', cwd });
  assert(typeof agent.id === 'string' && agent.id.length > 0, 'agent created');

  const j1 = await createCronJob(agent.id, { schedule: '*/5 * * * *', task: 'probe-one' });
  const j2 = await createCronJob(agent.id, { schedule: '0 * * * *', task: 'probe-two' });
  assert(j1.id !== j2.id, 'two jobs created');
  assert((await listCronJobs()).length === 2, 'list shows 2 jobs');

  await deleteAgent(agent.id);
  const after = await listCronJobs();
  assert(after.length === 0, 'deleteAgent cascaded — 0 jobs remain');

  let threw = '';
  try {
    await deleteCronJob(agent.id, j1.id);
  } catch (e) {
    threw = (e as { code?: string }).code ?? '';
  }
  assert(threw === 'agent_not_found' || threw === 'cron_not_found', `orphan delete 404s honestly (got ${threw})`);

  const pruned = await deleteCronJobsForAgent('no-such-agent-zzz');
  assert(pruned === 0, 'prune on unknown agent removes 0 and does not throw');

  console.log(`ALL ${passed} CHECKS PASSED`);
}

await main();
