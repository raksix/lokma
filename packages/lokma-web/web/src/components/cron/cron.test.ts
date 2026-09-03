/**
 * CronApprovalsPane pure-helper probe — run with:
 *   `bun src/components/cron/cron.test.ts` from `packages/lokma-web/web`.
 * Exits non-zero on the first failure (16/16 style like prior waves).
 */
import {
  addRule,
  agentLabel,
  countEnabled,
  decisionLabel,
  decisionTone,
  filterDecisions,
  filterJobs,
  formatNextRun,
  jobTone,
  removeRule,
  validateCreateForm,
  validateScheduleInput,
  validateTaskInput,
} from './cron';
import type { ApprovalDecisionView, CronJobView } from '@/lib/api';

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`ok: ${name}`);
}

const job = (over: Partial<CronJobView> = {}): CronJobView => ({
  id: 'c_abc12345',
  agentId: 'reviewer-1',
  schedule: '0 3 * * *',
  task: 'vault sync',
  enabled: true,
  createdAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
  lastRunAt: null,
  nextRunAt: '2026-09-04T03:00:00.000Z',
  ...over,
});

const decision = (over: Partial<ApprovalDecisionView> = {}): ApprovalDecisionView => ({
  id: 'ap_1',
  at: '2026-09-03T10:00:00.000Z',
  source: 'ws',
  sessionId: 'sess-1',
  kind: 'permission',
  requestId: 'req-1',
  decision: 'allow',
  ...over,
});

// ─── schedule validation (client mirror) ────────────────────────────────────
check('empty schedule rejected', validateScheduleInput('') !== null);
check('blank schedule rejected', validateScheduleInput('   ') !== null);
check('4 fields rejected', validateScheduleInput('0 3 * *') !== null);
check('6 fields rejected', validateScheduleInput('0 3 * * * *') !== null);
check('valid schedule passes', validateScheduleInput('0 3 * * *') === null);
check('step schedule passes', validateScheduleInput('*/15 * * * *') === null);
check('oversize schedule rejected', validateScheduleInput(`0 3 * * ${'x'.repeat(100)}`) !== null);

// ─── task validation ────────────────────────────────────────────────────────
check('empty task rejected', validateTaskInput('  ') !== null);
check('valid task passes', validateTaskInput('vault sync') === null);
check('oversize task rejected', validateTaskInput('x'.repeat(501)) !== null);

// ─── create form ────────────────────────────────────────────────────────────
check('missing agent rejected', validateCreateForm({ agentId: '', schedule: '0 3 * * *', task: 'x' }) !== null);
check(
  'bad schedule surfaces',
  (validateCreateForm({ agentId: 'a', schedule: 'nope', task: 'x' }) ?? '').includes('5 fields'),
);
check('valid form passes', validateCreateForm({ agentId: 'a', schedule: '0 3 * * *', task: 'x' }) === null);

// ─── rule array ops (same store as the chat card) ───────────────────────────
check('add appends trimmed', JSON.stringify(addRule(['a'], '  b ')) === JSON.stringify(['a', 'b']));
check('add dedupes', addRule(['a'], 'a').length === 1);
check('add blank is noop', addRule(['a'], '   ').length === 1);
check('remove drops exact', JSON.stringify(removeRule(['a', 'b'], 'a')) === JSON.stringify(['b']));
check('remove missing is noop', removeRule(['a'], 'z').length === 1);

// ─── agent labels ───────────────────────────────────────────────────────────
check('name wins over id', agentLabel({ id: 'x', name: 'Reviewer' }) === 'Reviewer');
check('blank name falls back to id', agentLabel({ id: 'x', name: '  ' }) === 'x');
check('missing name falls back to id', agentLabel({ id: 'x' }) === 'x');

// ─── job filters + counts ───────────────────────────────────────────────────
const rows = [job(), job({ id: 'c_zzz', agentId: 'builder-2', enabled: false, schedule: '30 9 * * 1', task: 'Run tests' })];
check('all-agent filter keeps both', filterJobs(rows, '', 'all').length === 2);
check('agent filter narrows', filterJobs(rows, '', 'builder-2').length === 1);
check('query matches task', filterJobs(rows, 'tests', 'all').length === 1);
check('query matches schedule', filterJobs(rows, '0 3', 'all').length === 1);
check('query matches id', filterJobs(rows, 'zzz', 'all').length === 1);
check('no match is empty', filterJobs(rows, 'nope-nope', 'all').length === 0);
check('counts enabled/total', JSON.stringify(countEnabled(rows)) === JSON.stringify({ enabled: 1, total: 2 }));
check('counts empty', JSON.stringify(countEnabled([])) === JSON.stringify({ enabled: 0, total: 0 }));
check('on tone is emerald', jobTone(true) === 'bg-emerald-500');
check('off tone is zinc', jobTone(false) === 'bg-zinc-300');

// ─── next-run cell ──────────────────────────────────────────────────────────
check('paused never claims a fire', formatNextRun(job({ enabled: false })) === 'paused');
check('live job shows next', formatNextRun(job()).startsWith('next '));
check('null next is honest', formatNextRun(job({ nextRunAt: null })).includes('daemon'));

// ─── decisions ──────────────────────────────────────────────────────────────
const hist = [decision(), decision({ id: 'ap_2', kind: 'question', decision: undefined, answer: 'yes, ship it' })];
check('empty query keeps all', filterDecisions(hist, '').length === 2);
check('query matches session', filterDecisions(hist, 'sess-1').length === 2);
check('query matches answer', filterDecisions(hist, 'ship it').length === 1);
check('query matches kind', filterDecisions(hist, 'question').length === 1);
check('allow tone is emerald', decisionTone('allow').includes('emerald'));
check('always tone is emerald', decisionTone('always').includes('emerald'));
check('deny tone is red', decisionTone('deny').includes('red'));
check('missing decision is amber', decisionTone(undefined).includes('amber'));
check('permission label is decision', decisionLabel('permission', 'deny') === 'deny');
check('question label shows answer', decisionLabel('question', undefined, 'yes, ship it').startsWith('answered: yes'));

console.log(`\n${passed} checks passed`);
