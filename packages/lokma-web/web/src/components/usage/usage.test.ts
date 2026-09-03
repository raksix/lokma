/**
 * usage.test.ts — probe for the pure Usage-pane helpers.
 * Run: `bun src/components/usage/usage.test.ts` (no DOM, no server).
 */
import {
  axisLabels,
  buildStackedPaths,
  chartKeys,
  collapseSeries,
  formatLastActive,
  formatTokens,
  formatUsd,
  shortModel,
} from './usage';
import type { UsageDayPoint, UsageModelRow } from '@/lib/api';

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

// formatTokens
check('small counts stay raw', formatTokens(942) === '942');
check('thousands compact to k', formatTokens(187400) === '187.4k');
check('millions compact to M', formatTokens(2_100_000) === '2.1M');
check('zero is zero', formatTokens(0) === '0');

// formatUsd
check('dollars use 2 decimals', formatUsd(3.82) === '$3.82');
check('dust uses 4 decimals', formatUsd(0.0012) === '$0.0012');
check('zero cost', formatUsd(0) === '$0.00');

// shortModel
check('strips provider + claude infix', shortModel('anthropic/claude-sonnet-4-5') === 'sonnet-4-5');
check('keeps gpt shape', shortModel('openai/gpt-4o-mini') === 'gpt-4o-mini');
check('drops dated suffix', shortModel('anthropic/claude-opus-4-5-20250929') === 'opus-4-5');

// chartKeys
const rows: UsageModelRow[] = [
  { model: 'a/1', family: '1', runs: 5, tokens: 500, costUsd: 1, share: 0.5 },
  { model: 'b/2', family: '2', runs: 3, tokens: 300, costUsd: 0.5, share: 0.3 },
  { model: 'c/3', family: '3', runs: 2, tokens: 150, costUsd: 0.2, share: 0.15 },
  { model: 'd/4', family: '4', runs: 1, tokens: 50, costUsd: 0.1, share: 0.05 },
];
const picked = chartKeys(rows, 3);
check('top-3 keys in order', JSON.stringify(picked.keys) === JSON.stringify(['a/1', 'b/2', 'c/3']));
check('overflow sets other flag', picked.other === true);
const all = chartKeys(rows.slice(0, 2), 3);
check('no overflow clears other flag', all.other === false && all.keys.length === 2);

// collapseSeries
const series: UsageDayPoint[] = [
  { day: '2026-09-01', total: 700, byModel: { 'a/1': 500, 'd/4': 200 } },
  { day: '2026-09-02', total: 300, byModel: { 'b/2': 300 } },
];
const collapsed = collapseSeries(series, ['a/1', 'b/2'], true);
check('keeps keyed layers', collapsed[0]?.layers['a/1'] === 500);
check('folds the tail into other', collapsed[0]?.layers.other === 200);
check('missing keys zero-fill', collapsed[1]?.layers['a/1'] === 0);
check('totals survive collapse', collapsed[1]?.total === 300);

// buildStackedPaths
const paths = buildStackedPaths(collapsed, ['a/1', 'b/2', 'other'], 340, 96);
check('one path per key', paths.length === 3);
check('paths are closed shapes', paths.every((p) => p.startsWith('M') && p.endsWith('Z')));
check('empty series gives baselines', buildStackedPaths([], ['a/1'], 340, 96)[0]?.includes('96') === true);
check('all-zero totals give baselines', buildStackedPaths([{ total: 0, layers: {} }], ['a/1'], 340, 96)[0]?.includes('96') === true);

// axisLabels
const week = ['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03'];
check('week shows every day', axisLabels(week).every((l) => l.length > 0));
const month = Array.from({ length: 30 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);
check('month thins labels', axisLabels(month).filter((l) => l.length > 0).length < 30);

// formatLastActive
const now = Date.parse('2026-09-03T14:00:00.000Z');
check('same day shows time', formatLastActive('2026-09-03T10:02:00.000Z', now).startsWith('Today'));
check('yesterday', formatLastActive('2026-09-02T10:02:00.000Z', now) === 'Yesterday');
check('days ago', formatLastActive('2026-08-30T10:02:00.000Z', now) === '4d ago');

console.log(`usage.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
