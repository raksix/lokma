/**
 * Live probe for the public share page renderer (`./share-page`).
 * Run: `HOME=$(mktemp -d) bun src/observability/share-page.test.ts`
 * from `packages/lokma-core`. No test framework — plain asserts.
 * Builds real ShareRecord objects in memory (no disk); asserts escaping,
 * structure, caps, and meta tags on the produced HTML.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import type { AgentTrace } from './trace.js';
import type { SessionSnapshot, ShareRecord } from './share.js';
import { SHARE_PAGE_MAX_ROWS, escapeHtml, renderShareHtml } from './share-page.js';

const HOME = process.env.HOME ?? '';
if (!HOME.startsWith('/tmp/')) {
  throw new Error(`REFUSE: HOME=${HOME || '(empty)'} — rerun with HOME=$(mktemp -d) bun ...`);
}

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`ok - ${name}`);
}

const evilTitle = `CEO <script>alert("xss")</script> & "friends"`;
const evilLabel = `created <img src=x onerror=alert(1)> by tester`;

const agentRecord: ShareRecord = {
  token: 'sh_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  kind: 'agent',
  refId: 'agent-1',
  title: evilTitle,
  createdAt: '2026-09-05T00:00:00.000Z',
  snapshot: {
    agent: { id: 'agent-1', name: evilTitle } as unknown as AgentTrace['agent'],
    events: [
      { ts: '2026-09-05T00:00:01.000Z', kind: 'agent_created', label: evilLabel },
      { ts: '2026-09-05T00:00:02.000Z', kind: 'agent_paused', label: 'Paused', detail: 'need <review> & "ok"' },
    ],
    locks: [{ path: '/tmp/x/a.ts', acquiredAt: 't', leaseUntil: 't', live: true }],
    docs: {
      soul: { exists: true, bytes: 1, mtime: null },
      memory: { exists: false, bytes: 0, mtime: null },
    },
    worktree: null,
    generatedAt: '2026-09-05T00:00:03.000Z',
  } as unknown as AgentTrace,
};

const sessionRecord: ShareRecord = {
  token: 'sh_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  kind: 'session',
  refId: 'sess-1',
  title: 'Debug session',
  createdAt: '2026-09-05T00:00:00.000Z',
  snapshot: {
    id: 'sess-1',
    cwd: '/tmp/x',
    model: 'mimo-v2.5',
    title: 'Debug session',
    messages: [
      { role: 'user', content: 'fix <this> & "that"', timestamp: '2026-09-05T00:00:01.000Z' },
      { role: 'assistant', content: 'on it', timestamp: '2026-09-05T00:00:02.000Z' },
      { role: 'tool', content: 'tool output', timestamp: '2026-09-05T00:00:03.000Z', toolName: 'run_command' },
    ],
    count: 3,
  } as SessionSnapshot,
};

// escapeHtml unit checks
check('escapes angle brackets', escapeHtml('<b>') === '&lt;b&gt;');
check('escapes ampersand first (no double-escape)', escapeHtml('a&<b') === 'a&amp;&lt;b');
check('escapes quotes', escapeHtml('"x"\'y\'') === '&quot;x&quot;&#39;y&#39;');

// Agent page
const agentHtml = renderShareHtml(agentRecord);
check('agent page is standalone html (no external refs)', agentHtml.includes('<!doctype html>') && !agentHtml.includes('src="http') && !agentHtml.includes('<script'));
check('agent title escaped in h1', agentHtml.includes('&lt;script&gt;') && !agentHtml.includes('<script>alert'));
check('agent label escaped', agentHtml.includes('&lt;img src=x'));
check('agent detail escaped', agentHtml.includes('need &lt;review&gt; &amp; &quot;ok&quot;'));
check('agent event kinds rendered', agentHtml.includes('agent_created') && agentHtml.includes('agent_paused'));
check('agent lock path rendered', agentHtml.includes('/tmp/x/a.ts'));
check('agent sub line counts 2 events', agentHtml.includes('2 events'));
check('agent og meta present', agentHtml.includes('og:title') && agentHtml.includes('og:description'));
check('agent cream token inlined', agentHtml.includes('#FAF9F5') && agentHtml.includes('#C96442'));

// Session page
const sessionHtml = renderShareHtml(sessionRecord);
check('session user content escaped', sessionHtml.includes('fix &lt;this&gt; &amp; &quot;that&quot;'));
check('session role badges rendered', sessionHtml.includes('>user<') && sessionHtml.includes('>run_command<'));
check('session sub line counts 3 rows', sessionHtml.includes('3 rows'));
check('session model rendered', sessionHtml.includes('mimo-v2.5'));
check('session timestamps rendered', sessionHtml.includes('2026-09-05T00:00:01.000Z'));

// Null record → branded 404 body, still standalone
const missing = renderShareHtml(null);
check('null record renders share_not_found body', missing.includes('share_not_found') && missing.includes('may have been deleted'));
check('null record title is Share not found', missing.includes('<title>Share not found — Lokma share</title>'));

// Row cap: 502 events → 500 rows + more-note
const bigEvents = Array.from({ length: SHARE_PAGE_MAX_ROWS + 2 }, (_, i) => ({
  ts: `2026-09-05T00:00:${String(i).padStart(2, '0')}.000Z`,
  kind: 'agent_state' as const,
  label: `event ${i}`,
}));
const bigRecord: ShareRecord = {
  ...agentRecord,
  snapshot: { ...(agentRecord.snapshot as AgentTrace), events: bigEvents },
};
const bigHtml = renderShareHtml(bigRecord);
check('row cap applied with more-note', bigHtml.includes('event 499') && !bigHtml.includes('event 500') && bigHtml.includes('2 more events'));

console.log(`\nPASS share-page: ${passed} checks`);
