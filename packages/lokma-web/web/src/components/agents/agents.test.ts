/**
 * agents.test.ts — probe for the pure AgentHub helpers.
 * Run: `bun src/components/agents/agents.test.ts` (no DOM, no server).
 */
import {
  AGENT_STATES,
  PERSONA_OPTIONS,
  bulkTargets,
  emptyAgentForm,
  formatBudget,
  formatRelativeTime,
  initials,
  isAiCreated,
  normalizeAgent,
  queuePosition,
  stateBadge,
  stateTone,
  validateAgentForm,
} from './agents';
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
  state: 'running',
  cwd: '/mnt/apopic/lokma',
  budgets: { tokens: 500_000, usd: 10 },
  createdBy: 'human',
  createdAt: '2026-09-03T00:00:00.000Z',
  ...over,
});

// normalizeAgent
check('full record keeps fields', normalizeAgent(info()).name === 'Builder');
check('missing name falls back to id', normalizeAgent(info({ name: undefined })).name === 'builder-1');
check('missing state falls back to idle', normalizeAgent(info({ state: undefined })).state === 'idle');
check('missing budgets fall back to defaults', normalizeAgent(info({ budgets: undefined })).budgetTokens === 500_000);
check('missing cwd is null', normalizeAgent(info({ cwd: undefined })).cwd === null);
check('missing createdBy is human', normalizeAgent(info({ createdBy: undefined })).createdBy === 'human');

// stateTone
check('running pulses emerald', stateTone('running').includes('emerald'));
check('queued is blue', stateTone('queued').includes('blue'));
check('paused is amber', stateTone('paused').includes('amber'));
check('failed is red', stateTone('failed').includes('red'));
check('unknown state is zinc', stateTone('bogus').includes('zinc'));

// stateBadge (pairs with stateTone dot; REQ-025)
check('badge running is emerald', stateBadge('running').includes('emerald'));
check('badge queued is blue', stateBadge('queued').includes('blue'));
check('badge paused is amber', stateBadge('paused').includes('amber'));
check('badge failed is red', stateBadge('failed').includes('red'));
check('badge completed is teal', stateBadge('completed').includes('teal'));
check('badge unknown falls back to zinc', stateBadge('bogus').includes('zinc'));

// isAiCreated / initials
check('ai prefix detected', isAiCreated('ai:builder-1') === true);
check('human is not ai', isAiCreated('human') === false);
check('fork: is not ai', isAiCreated('fork:builder-1') === false);
check('initials uppercased', initials('builder') === 'BU');
check('initials trim', initials('  x') === 'X');

// queuePosition
const queued = [
  { ...info({ id: 'a', state: 'queued', createdAt: '2026-09-03T00:01:00.000Z' }) },
  { ...info({ id: 'b', state: 'queued', createdAt: '2026-09-03T00:02:00.000Z' }) },
  { ...info({ id: 'c', state: 'running' }) },
].map(normalizeAgent);
check('first queued is #1', queuePosition(queued, 'a') === 1);
check('second queued is #2', queuePosition(queued, 'b') === 2);
check('running agent has no position', queuePosition(queued, 'c') === null);
check('unknown id has no position', queuePosition(queued, 'zzz') === null);
check('empty list has no position', queuePosition([], 'a') === null);

// validateAgentForm
const valid = { ...emptyAgentForm(), name: 'Reviewer' };
check('valid form passes', validateAgentForm(valid) === null);
check('empty name rejected', validateAgentForm({ ...valid, name: '   ' }) !== null);
check('long name rejected', validateAgentForm({ ...valid, name: 'x'.repeat(41) }) !== null);
check('bad persona rejected', validateAgentForm({ ...valid, persona: 'wizard' }) !== null);
check('empty model rejected', validateAgentForm({ ...valid, model: '' }) !== null);
check('bad tokens rejected', validateAgentForm({ ...valid, tokens: '-5' }) !== null);
check('fractional tokens rejected', validateAgentForm({ ...valid, tokens: '1.5' }) !== null);
check('bad usd rejected', validateAgentForm({ ...valid, usd: 'abc' }) !== null);
check('optional budgets pass empty', validateAgentForm(valid) === null);
check('numeric budgets pass', validateAgentForm({ ...valid, tokens: '50000', usd: '2' }) === null);

// formatBudget / constants
check('budget line', formatBudget(500_000, 10) === '500k tokens · $10');
check('million budget line', formatBudget(2_000_000, 25) === '2M tokens · $25');
check('seven personas', PERSONA_OPTIONS.length === 7);
check('seven states', AGENT_STATES.length === 7);
check('empty form model is server default', emptyAgentForm().model === 'anthropic/claude-4-sonnet');

// formatRelativeTime (REQ-052 registry timestamps)
const NOW = Date.parse('2026-09-08T12:00:00.000Z');
check('null time is null', formatRelativeTime(null, NOW) === null);
check('garbage time is null', formatRelativeTime('not-a-date', NOW) === null);
check('seconds ago is just now', formatRelativeTime('2026-09-08T11:59:40.000Z', NOW) === 'just now');
check('minutes ago', formatRelativeTime('2026-09-08T11:45:00.000Z', NOW) === '15m ago');
check('hours ago', formatRelativeTime('2026-09-08T09:00:00.000Z', NOW) === '3h ago');
check('days ago', formatRelativeTime('2026-09-05T12:00:00.000Z', NOW) === '3d ago');
check('old dates fall back to yyyy-mm-dd', formatRelativeTime('2026-06-01T00:00:00.000Z', NOW) === '2026-06-01');
check('future stamps clamp to just now', formatRelativeTime('2026-09-09T00:00:00.000Z', NOW) === 'just now');

// bulkTargets (REQ-052 bulk bar mirrors the per-agent guards)
const mixed = [
  { ...info({ id: 'run', state: 'running' }) },
  { ...info({ id: 'idle', state: 'idle' }) },
  { ...info({ id: 'q', state: 'queued' }) },
  { ...info({ id: 'p', state: 'paused' }) },
  { ...info({ id: 'done', state: 'completed' }) },
  { ...info({ id: 'dead', state: 'failed' }) },
].map(normalizeAgent);
check('bulk pause hits idle+queued+running', bulkTargets(mixed, 'pause').map((a) => a.id).join(',') === 'run,idle,q');
check('bulk resume hits paused only', bulkTargets(mixed, 'resume').map((a) => a.id).join(',') === 'p');
check('bulk kill skips terminal states', bulkTargets(mixed, 'kill').map((a) => a.id).join(',') === 'run,idle,q,p');
check('bulk on empty list is empty', bulkTargets([], 'kill').length === 0);

console.log(`agents probe: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
