/**
 * sessions.test.ts — probe for the pure Sessions-sidebar helpers.
 * Run: `bun src/components/sessions/sessions.test.ts` (no DOM, no server).
 */
import {
  dayGroup,
  displayTitle,
  filterSessions,
  groupSessions,
  projectOf,
  relativeTime,
} from './grouping';
import type { SessionSummary } from '@/lib/api';

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

// Fixed clock: 2026-09-03 12:00 local.
const NOW = new Date(2026, 8, 3, 12, 0, 0).getTime();
const iso = (ms: number): string => new Date(ms).toISOString();

function sess(partial: Partial<SessionSummary> & { id: string }): SessionSummary {
  return { ...partial };
}

const list: SessionSummary[] = [
  sess({ id: 'sess_today', title: 'Refactor auth middleware', model: 'anthropic/claude-sonnet-4-5', messageCount: 12, updatedAt: iso(NOW - 5 * 60_000), cwd: '/mnt/apopic/lokma' }),
  sess({ id: 'sess_yesterday', title: 'API spec webhooks', messageCount: 4, updatedAt: iso(NOW - 26 * 3_600_000), cwd: '/mnt/apopic/bounty' }),
  sess({ id: 'sess_old', title: 'Onboarding copy', messageCount: 2, updatedAt: iso(NOW - 5 * 86_400_000), cwd: '/mnt/apopic/lokma' }),
  sess({ id: 'sess_bare' }),
];

// dayGroup
check('today buckets Today', dayGroup(iso(NOW - 60_000), NOW) === 'Today');
check('yesterday buckets Yesterday', dayGroup(iso(NOW - 26 * 3_600_000), NOW) === 'Yesterday');
check('old buckets Earlier', dayGroup(iso(NOW - 5 * 86_400_000), NOW) === 'Earlier');
check('missing/NaN buckets Earlier', dayGroup(undefined, NOW) === 'Earlier' && dayGroup('nope', NOW) === 'Earlier');

// relativeTime
check('minutes', relativeTime(iso(NOW - 2 * 60_000), NOW) === '2m ago');
check('hours same day', relativeTime(iso(NOW - 3 * 3_600_000), NOW) === '3h ago');
check('yesterday label', relativeTime(iso(NOW - 26 * 3_600_000), NOW) === 'Yesterday');
check('days', relativeTime(iso(NOW - 4 * 86_400_000), NOW) === '4d ago');
check('missing is empty', relativeTime(undefined, NOW) === '');

// displayTitle / projectOf
check('title wins', displayTitle(list[0]) === 'Refactor auth middleware');
check('id fallback', displayTitle(list[3]) === 'sess_bare');
check('project basename', projectOf(list[0]) === 'lokma' && projectOf(list[1]) === 'bounty');
check('project default', projectOf(list[3]) === 'default');

// filterSessions
check('title match', filterSessions(list, 'webhook').map((s) => s.id).join() === 'sess_yesterday');
check('model match', filterSessions(list, 'sonnet').map((s) => s.id).join() === 'sess_today');
check('id match case-insensitive', filterSessions(list, 'SESS_OLD').length === 1);
check('empty query returns all', filterSessions(list, '  ').length === 4);
check('no match empty', filterSessions(list, 'zzz').length === 0);

// groupSessions
const timeGroups = groupSessions(list, 'time', NOW);
check(
  'time groups skip empties in order',
  timeGroups.map((g) => g.key).join(',') === 'Today,Yesterday,Earlier',
);
check('today holds newest', timeGroups[0].items[0].id === 'sess_today');
const projGroups = groupSessions(list, 'project', NOW);
check(
  'project groups by cwd basename, biggest first',
  projGroups.map((g) => `${g.key}:${g.items.length}`).join(',') === 'lokma:2,bounty:1,default:1',
);

console.log(`sessions probe: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
