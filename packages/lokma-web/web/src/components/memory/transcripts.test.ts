/**
 * Transcript helpers probe — run with:
 *   `bun src/components/memory/transcripts.test.ts` from `packages/lokma-web/web`.
 * Exits non-zero on the first failure (prior-wave style).
 */
import {
  compactionTone,
  formatAgo,
  formatChars,
  formatCompactionStatus,
  formatLastRun,
  formatRunResult,
  hitRoleLabel,
  searchEngineLabel,
  searchErrorHint,
  sessionOptionLabel,
  validateTranscriptSearch,
} from './transcripts';

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  passed++;
}

/* 1 — search form validation. */
check('empty rejected', validateTranscriptSearch({ query: '' }) !== null);
check('blank rejected', validateTranscriptSearch({ query: '   ' }) !== null);
check('text accepted', validateTranscriptSearch({ query: 'deploy' }) === null);

/* 2 — role labels. */
check('user label', hitRoleLabel({ role: 'user' }) === 'You');
check('assistant label', hitRoleLabel({ role: 'assistant' }) === 'Assistant');
check('tool label', hitRoleLabel({ role: 'tool' }) === 'Tool');
check('tool+name label', hitRoleLabel({ role: 'tool', toolName: 'shell' }) === 'Tool · shell');

/* 3 — engine + error hints. */
check('fts5 label', searchEngineLabel('fts5') === 'FTS5 full-text');
check('fallback label', searchEngineLabel('substring') === 'substring fallback');
check('bad_query hint', searchErrorHint('bad_query').length > 0);
check('bad_limit hint', searchErrorHint('bad_limit').length > 0);
check('unknown hint empty', searchErrorHint('nope') === '');

/* 4 — chars formatting. */
check('chars format', formatChars(1234) === '1,234 chars');
check('zero chars', formatChars(0) === '0 chars');
check('nan chars', formatChars(Number.NaN) === '0 chars');

/* 5 — compaction tone. */
check('calm', compactionTone({ hygieneNeeded: false, summaryNeeded: false }) === 'default');
check('warning', compactionTone({ hygieneNeeded: true, summaryNeeded: false }) === 'warning');
check('destructive', compactionTone({ hygieneNeeded: true, summaryNeeded: true }) === 'destructive');

/* 6 — status + last-run + result lines. */
check(
  'status line',
  formatCompactionStatus({ messages: 12, chars: 1234, hygieneNeeded: true, summaryNeeded: false }) ===
    '12 msgs · 1,234 chars · hygiene due',
);
check('never line', formatLastRun(null) === 'Never compacted');
check(
  'last-run line',
  formatLastRun({
    compactedAt: new Date(Date.now() - 3600_000).toISOString(),
    mode: 'full',
    compacted: true,
    beforeMessages: 122,
    afterMessages: 22,
    beforeChars: 200000,
    afterChars: 30000,
    archived: 101,
    archiveMessages: 101,
  }).includes('122 → 22 msgs'),
);
check(
  'run result',
  formatRunResult({ mode: 'full', compacted: true, beforeMessages: 122, afterMessages: 22, archived: 101, anchors: [{ role: 'tool', excerpt: 'x', timestamp: 't' }] }) ===
    'full: 122 → 22 msgs · 101 archived · 1 anchors',
);
check(
  'no-op result',
  formatRunResult({ mode: 'hygiene', compacted: false, beforeMessages: 5, afterMessages: 5, archived: 0, anchors: [] }).includes('nothing to compact'),
);

/* 7 — ago + option labels. */
check('just now', formatAgo(new Date().toISOString()) === 'just now');
check('minutes', formatAgo(new Date(Date.now() - 5 * 60000).toISOString()) === '5m ago');
check('hours', formatAgo(new Date(Date.now() - 3 * 3600_000).toISOString()) === '3h ago');
check('days', formatAgo(new Date(Date.now() - 2 * 86400_000).toISOString()) === '2d ago');
check('bad date', formatAgo('not-a-date') === 'just now');
check(
  'option label',
  sessionOptionLabel({ id: 'sess_1', title: 'Deploy walkthrough', messageCount: 12 }) === 'Deploy walkthrough · 12 msgs',
);
check(
  'option id fallback',
  sessionOptionLabel({ id: 'sess_1', title: '', messageCount: 3 }) === 'sess_1 · 3 msgs',
);

console.log(`PASS: all ${passed} transcript helper checks green`);
