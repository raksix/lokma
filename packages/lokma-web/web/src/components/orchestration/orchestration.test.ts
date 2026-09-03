/**
 * orchestration.test.ts — probe for the pure OrchestrationPane helpers.
 * Run: `bun src/components/orchestration/orchestration.test.ts` (no DOM, no server).
 */
import {
  FANOUT_MAX_COUNT,
  buildFanoutBodies,
  countLive,
  elapsedSince,
  emptyFanoutForm,
  filterTree,
  groupByState,
  killableIds,
  lineageGroups,
  lineageOf,
  validateFanoutForm,
} from './orchestration';
import { normalizeAgent } from '@/components/agents';
import type { AgentInfo } from '@/lib/api';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${name}`);
  }
}

const info = (over: Partial<AgentInfo> = {}): AgentInfo => ({
  id: 'builder-1',
  name: 'Builder',
  persona: 'builder',
  model: 'anthropic/claude-4-sonnet',
  state: 'idle',
  cwd: '/mnt/apopic/lokma',
  budgets: { tokens: 500_000, usd: 10 },
  createdBy: 'human',
  createdAt: '2026-09-03T00:00:00.000Z',
  ...over,
});

const row = (over: Partial<AgentInfo> = {}) => normalizeAgent(info(over));

// groupByState — live first, terminal last, unknown trails
const mixed = [
  row({ id: 'k1', state: 'killed' }),
  row({ id: 'r1', state: 'running' }),
  row({ id: 'i1', state: 'idle' }),
  row({ id: 'q1', state: 'queued' }),
  row({ id: 'p1', state: 'paused' }),
  row({ id: 'c1', state: 'completed' }),
];
const groups = groupByState(mixed);
check('groups ordered live-first', groups.map((g) => g.state).join(',') === 'running,queued,idle,paused,completed,killed');
check('empty states omitted', groups.length === 6);
check('unknown state trails', groupByState([row({ id: 'x', state: 'bogus' })])[0].state === 'bogus');

// filterTree
check('all keeps everything', filterTree(mixed, 'all').length === 6);
check('running filters to running', filterTree(mixed, 'running').map((a) => a.id).join(',') === 'r1');
check('queued filters to queued', filterTree(mixed, 'queued').map((a) => a.id).join(',') === 'q1');

// countLive
const counts = countLive(mixed);
check('running counted', counts.running === 1);
check('queued counted', counts.queued === 1);
check('total counted', counts.total === 6);

// elapsedSince
const now = Date.parse('2026-09-03T01:02:03.000Z');
check('seconds format', elapsedSince('2026-09-03T01:01:51.000Z', now) === '12s');
check('minutes format', elapsedSince('2026-09-03T00:59:03.000Z', now) === '3m 00s');
check('hours format', elapsedSince('2026-09-02T23:02:03.000Z', now) === '2h 00m');
check('days format', elapsedSince('2026-08-31T01:02:03.000Z', now) === '3d 0h');
check('missing is em dash', elapsedSince(null, now) === '—');
check('invalid is em dash', elapsedSince('not-a-date', now) === '—');
check('future is em dash', elapsedSince('2026-09-04T00:00:00.000Z', now) === '—');

// lineageOf
check('human default', lineageOf('human').kind === 'human');
check('fork parent', lineageOf('fork:builder-1').parent === 'builder-1');
check('clone parent', lineageOf('clone:builder-1').parent === 'builder-1');
check('fanout stem', lineageOf('fanout:review-team').parent === 'review-team');
check('ai parent', lineageOf('ai:builder-1').parent === 'builder-1');
check('bare prefix is human', lineageOf('fork:').kind === 'human');

// lineageGroups
const lineageRows = [
  row({ id: 'a', createdBy: 'human' }),
  row({ id: 'b', createdBy: 'fanout:team' }),
  row({ id: 'c', createdBy: 'fanout:team' }),
  row({ id: 'd', createdBy: 'fork:a' }),
];
const lineage = lineageGroups(lineageRows);
check('human excluded', lineage.every((g) => !g.label.includes('human')));
check('biggest first', lineage[0].label === 'fan-out team' && lineage[0].count === 2);
check('fork listed', lineage.some((g) => g.label === 'fork of a'));

// killableIds
check(
  'non-terminal killable',
  killableIds(mixed, ['completed', 'failed', 'killed']).sort().join(',') === 'i1,p1,q1,r1',
);

// validateFanoutForm
const valid = { ...emptyFanoutForm(), stem: 'Review team' };
check('valid form passes', validateFanoutForm(valid, 20) === null);
check('empty stem rejected', validateFanoutForm({ ...valid, stem: '  ' }, 20) !== null);
check('long stem rejected', validateFanoutForm({ ...valid, stem: 'x'.repeat(41) }, 20) !== null);
check('bad persona rejected', validateFanoutForm({ ...valid, persona: 'wizard' }, 20) !== null);
check('empty model rejected', validateFanoutForm({ ...valid, model: '' }, 20) !== null);
check('zero count rejected', validateFanoutForm({ ...valid, count: '0' }, 20) !== null);
check('over-20 rejected', validateFanoutForm({ ...valid, count: String(FANOUT_MAX_COUNT + 1) }, 20) !== null);
check('non-integer rejected', validateFanoutForm({ ...valid, count: '2.5' }, 20) !== null);
check('over capacity rejected', validateFanoutForm({ ...valid, count: '3' }, 2) !== null);
check('exact capacity passes', validateFanoutForm({ ...valid, count: '2' }, 2) === null);

// buildFanoutBodies
const bodies = buildFanoutBodies({ ...valid, count: '3' });
check('three bodies built', bodies.length === 3);
check('names numbered', bodies[0].name === 'Review team 1' && bodies[2].name === 'Review team 3');
check('lineage tagged', bodies.every((b) => b.createdBy === 'fanout:Review team'));
check('persona+model shared', bodies.every((b) => b.persona === 'builder' && b.model === 'anthropic/claude-4-sonnet'));
check('no cwd means no cwd key', !('cwd' in bodies[0]));
const withCwd = buildFanoutBodies({ ...valid, count: '1', cwd: '/tmp' });
check('cwd passed through', withCwd[0].cwd === '/tmp');
const longStem = buildFanoutBodies({ ...valid, stem: 'x'.repeat(40), count: '1' });
check('names trimmed to 40', longStem[0].name.length <= 40);

console.log(`orchestration: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
