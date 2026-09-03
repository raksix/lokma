/**
 * ObservabilityPane pure-helper probe — run with:
 *   `bun src/components/observability/observability.test.ts` from `packages/lokma-web/web`.
 * Exits non-zero on the first failure (16/16 style like prior waves).
 */
import {
  agentBadge,
  asReplayRow,
  asSessionSnapshot,
  eventTone,
  filterTraceEvents,
  formatAge,
  formatBytes,
  formatElapsed,
  replayExcerpt,
  safeSummary,
  timelineRange,
} from './observability';
import type { TraceEventView } from '@/lib/api';

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`ok: ${name}`);
}

const ev = (over: Partial<TraceEventView> = {}): TraceEventView => ({
  ts: '2026-09-03T20:00:00.000Z',
  kind: 'agent_created',
  label: 'Agent created by human',
  ...over,
});

// ─── filter ────────────────────────────────────────────────────────────
check('all keeps everything', filterTraceEvents([ev(), ev({ kind: 'lock_acquired' })], 'all').length === 2);
check('agent keeps created', filterTraceEvents([ev(), ev({ kind: 'lock_acquired' })], 'agent').length === 1);
check('agent keeps spawned', filterTraceEvents([ev({ kind: 'spawned' })], 'agent').length === 1);
check('agent keeps state', filterTraceEvents([ev({ kind: 'agent_state' })], 'agent').length === 1);
check('agent drops locks', filterTraceEvents([ev({ kind: 'lock_acquired' })], 'agent').length === 0);
check('tool keeps locks', filterTraceEvents([ev({ kind: 'lock_acquired' })], 'tool').length === 1);
check('tool keeps soul writes', filterTraceEvents([ev({ kind: 'soul_write' })], 'tool').length === 1);
check('tool keeps memory writes', filterTraceEvents([ev({ kind: 'memory_write' })], 'tool').length === 1);
check('tool drops created', filterTraceEvents([ev()], 'tool').length === 0);

// ─── tones ─────────────────────────────────────────────────────────────
check('created tone is violet', eventTone('agent_created').includes('6C5CE7'));
check('spawned tone is violet', eventTone('spawned').includes('6C5CE7'));
check('state tone is violet', eventTone('agent_state').includes('6C5CE7'));
check('soul tone is terracotta', eventTone('soul_write').includes('terracotta'));
check('memory tone is terracotta', eventTone('memory_write').includes('terracotta'));
check('lock tone is zinc', eventTone('lock_acquired').includes('zinc'));

// ─── elapsed + range ───────────────────────────────────────────────────
check('elapsed zero', formatElapsed('2026-09-03T20:00:00.000Z', '2026-09-03T20:00:00.000Z') === '0.0s');
check('elapsed 2.1s', formatElapsed('2026-09-03T20:00:02.100Z', '2026-09-03T20:00:00.000Z') === '2.1s');
check('elapsed invalid is dash', formatElapsed('nope', '2026-09-03T20:00:00.000Z') === '—');
check(
  'range formats',
  timelineRange([ev(), ev({ ts: '2026-09-03T20:00:03.900Z', kind: 'lock_acquired' })]) === '0.0s → 3.9s · 2 events',
);
check('range singular', timelineRange([ev()]) === '0.0s → 0.0s · 1 event');
check('range empty is honest', timelineRange([]) === 'no events yet');

// ─── badge / bytes / age ───────────────────────────────────────────────
check('badge deterministic', agentBadge('builder-1') === agentBadge('builder-1'));
check('badge has bg class', agentBadge('x').includes('bg-'));
check('bytes small', formatBytes(42) === '42B');
check('bytes kilo', formatBytes(1254) === '1.2k');
check('bytes mega', formatBytes(3.4 * 1024 * 1024) === '3.4M');
check('bytes invalid is dash', formatBytes(NaN) === '—');
check('age just now', formatAge(new Date(1_000_000).toISOString(), 1_030_000) === 'just now');
check('age minutes', formatAge(new Date(0).toISOString(), 5 * 60_000) === '5m ago');
check('age hours', formatAge(new Date(0).toISOString(), 3 * 3_600_000) === '3h ago');
check('age days', formatAge(new Date(0).toISOString(), 2 * 86_400_000) === '2d ago');

// ─── replay ────────────────────────────────────────────────────────────
check('excerpt short stays', replayExcerpt('hello') === 'hello');
check('excerpt caps long', replayExcerpt('a'.repeat(200)).endsWith('…'));
check('excerpt collapses whitespace', replayExcerpt('a\n  b') === 'a b');
check('row narrows user', asReplayRow({ role: 'user', content: 'hi', timestamp: 't' })?.role === 'user');
check('row rejects bad role', asReplayRow({ role: 'system', content: 'x' }) === null);
check('row rejects non-object', asReplayRow('nope') === null);
check('row keeps toolName', asReplayRow({ role: 'tool', content: 'c', timestamp: '', toolName: 'Read' })?.toolName === 'Read');
const snap = asSessionSnapshot({ id: 's1', cwd: '/tmp', model: 'm', title: 'T', messages: [{ role: 'user', content: 'hi', timestamp: 't' }], count: 1 });
check('snapshot narrows', snap !== null && snap.messages.length === 1 && snap.title === 'T');
check('snapshot rejects agent shape', asSessionSnapshot({ agent: { id: 'a' }, events: [] }) === null);
check('snapshot rejects junk', asSessionSnapshot(null) === null);

// ─── safe summary ──────────────────────────────────────────────────────
check('safe green', safeSummary(2, '/tmp/wt').label.startsWith('HUD green'));
check('safe amber locks only', safeSummary(1, null).label.startsWith('HUD amber'));
check('safe amber worktree only', safeSummary(0, '/tmp/wt').label.startsWith('HUD amber'));
check('safe grey bare', safeSummary(0, null).label.startsWith('HUD grey'));

console.log(`\nPASS: ${passed} checks`);
