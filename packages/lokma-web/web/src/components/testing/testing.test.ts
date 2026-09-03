import {
  TEST_STAGES,
  classifyCounts,
  emptyRunForm,
  filterRuns,
  formatRunAgo,
  parseTargets,
  runTone,
  validateRunForm,
} from './testing';
import type { TestSummary } from '@/lib/api';

/**
 * TestingPane probe — pure helpers only (no React, no network).
 * Run: `bun src/components/testing/testing.test.ts` from the web package.
 * Never mock data here — assertions pin the real helper contracts.
 */

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

const rows: TestSummary[] = [
  { id: 'run-aaa', plan: 'auth preHandler', tests: 4, pass: 4, fail: 0, flaky: 0, dur: '18s', shannon: 'clean', createdAt: '2026-09-03T11:58:00.000Z' },
  { id: 'run-bbb', plan: 'vault search', tests: 4, pass: 3, fail: 1, flaky: 0, dur: '9s', shannon: '1 secret', createdAt: '2026-09-03T11:00:00.000Z' },
  { id: 'run-ccc', plan: 'pane drag', tests: 5, pass: 5, fail: 0, flaky: 0, dur: '12s', shannon: 'clean', createdAt: '2026-09-03T09:00:00.000Z' },
];

// parseTargets — textarea shaping.
{
  check('newline split', parseTargets('/health\n/api/models').length === 2);
  check('comma split', parseTargets('/health, /api/models').length === 2);
  check('empties dropped', parseTargets('\n/api/a,\n').length === 1);
  check('trims entries', parseTargets('  /health  ').length === 1 && parseTargets('  /health  ')[0] === '/health');
  check('empty is empty', parseTargets('   ').length === 0);
}

// validateRunForm — mirrors the server run rules.
{
  check('valid form passes', validateRunForm({ ...emptyRunForm, plan: 'smoke' }) === null);
  check('blank targets fall back to defaults', validateRunForm({ ...emptyRunForm, plan: 'smoke', targets: '' }) === null);
  check('empty plan rejected', validateRunForm({ ...emptyRunForm, plan: '   ' }) !== null);
  check('long plan rejected', validateRunForm({ ...emptyRunForm, plan: 'x'.repeat(121) }) !== null);
  check('absolute url rejected', validateRunForm({ ...emptyRunForm, plan: 'x', targets: 'https://a/b' }) !== null);
  check('whitespace rejected', validateRunForm({ ...emptyRunForm, plan: 'x', targets: '/a b' }) !== null);
  check('traversal rejected', validateRunForm({ ...emptyRunForm, plan: 'x', targets: '/../etc' }) !== null);
  check('21 targets rejected', validateRunForm({ ...emptyRunForm, plan: 'x', targets: Array.from({ length: 21 }, (_, i) => `/t${i}`).join('\n') }) !== null);
}

// filterRuns — concept all/fail/flaky parity + search.
{
  check('all returns 3', filterRuns(rows, 'all', '').length === 3);
  check('fail narrows to 1', filterRuns(rows, 'fail', '').length === 1);
  check('flaky is empty (honest zeros)', filterRuns(rows, 'flaky', '').length === 0);
  check('search matches plan', filterRuns(rows, 'all', 'vault').length === 1);
  check('search matches id', filterRuns(rows, 'all', 'run-bbb').length === 1);
  check('search is case-insensitive', filterRuns(rows, 'all', 'AUTH').length === 1);
  check('filter+query combine', filterRuns(rows, 'fail', 'vault').length === 1);
  check('no match is empty', filterRuns(rows, 'all', 'zzz').length === 0);
}

// runTone — card dot.
{
  check('clean is good', runTone(rows[0]) === 'good');
  check('failed is bad', runTone(rows[1]) === 'bad');
}

// classifyCounts — real report grouping.
{
  const counts = classifyCounts({
    id: 'run-x', plan: 'x', createdAt: '2026-09-03T00:00:00.000Z', durationMs: 5,
    tests: [
      { name: 'GET /a', kind: 'http', status: 'fail', ms: 1, detail: 'HTTP 404 (expected 2xx)', classification: 'contract' },
      { name: 'GET /b', kind: 'http', status: 'fail', ms: 1, detail: 'transport error (unreachable handler)', classification: 'env' },
      { name: 'GET /c', kind: 'http', status: 'pass', ms: 1, detail: 'HTTP 200' },
    ],
    pass: 1, fail: 2, flaky: 0, shannon: 'clean', shannonFindings: [],
  });
  check('contract counted', counts.contract === 1);
  check('env counted', counts.env === 1);
  check('fragility zero', counts.fragility === 0);
  check('empty report zeros', classifyCounts({ id: 'e', plan: 'e', createdAt: '', durationMs: 0, tests: [], pass: 0, fail: 0, flaky: 0, shannon: 'clean', shannonFindings: [] }).contract === 0);
}

// formatRunAgo — concept `when` parity.
{
  const now = Date.parse('2026-09-03T12:00:00.000Z');
  check('just now', formatRunAgo('2026-09-03T11:59:40.000Z', now) === 'just now');
  check('minutes ago', formatRunAgo('2026-09-03T11:30:00.000Z', now) === '30m ago');
  check('hours ago', formatRunAgo('2026-09-03T10:00:00.000Z', now) === '2h ago');
  check('days ago', formatRunAgo('2026-09-02T10:00:00.000Z', now) === '1d ago');
  check('garbage falls back', formatRunAgo('not-a-date', now) === 'not-a-date');
}

// Stage strip contract — 6 stages, TestSprite order.
{
  check('6 stages', TEST_STAGES.length === 6);
  check('plan first', TEST_STAGES[0].title === 'Plan');
  check('heal last', TEST_STAGES[5].title === 'Heal');
}

console.log(`testing helpers: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
