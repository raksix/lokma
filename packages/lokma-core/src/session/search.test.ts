/**
 * Live probe for session-transcript search (`./search` — Docs/28 session_search).
 * Run: `HOME=$(mktemp -d) bun src/session/search.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Real temp HOME on disk (startup env — bun snapshots HOME at boot; the
 * guard below refuses anything outside `/tmp/`). Real SessionStore files,
 * real FTS5 index sidecar (`<sessions>/.fts5/sessions.db`).
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { SessionStore } from './store.js';
import type { SessionMessage } from './types.js';
import {
  SESSION_SEARCH_LIMITS,
  searchSessionsDetailed,
  searchSessionsSubstring,
  sessionFtsAvailable,
  syncSessionIndex,
} from './search.js';

const HOME = process.env.HOME ?? '';
if (!HOME.startsWith('/tmp/')) {
  throw new Error(`REFUSE: HOME=${HOME || '(empty)'} — rerun with HOME=$(mktemp -d) bun ...`);
}

const CWD = '/tmp/probe-work-search';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

function msg(role: SessionMessage['role'], content: string, toolName?: string): SessionMessage {
  return { role, content, timestamp: '2026-09-04T00:00:00.000Z', ...(toolName ? { toolName } : {}) };
}

async function expectSearchError(fn: () => Promise<unknown>, code: string, status: number, label: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const err = e as { code?: string; statusCode?: number };
    assert(err.code === code, `${label} code is ${code}`);
    assert(err.statusCode === status, `${label} status is ${status}`);
    return;
  }
  throw new Error(`FAIL: ${label} did not throw`);
}

async function main(): Promise<void> {
  const store = new SessionStore(CWD);
  const fts = await sessionFtsAvailable();
  assert(typeof fts === 'boolean', 'sessionFtsAvailable returns a boolean');

  // --- seed two sessions with known content ---
  const alpha = 'sess_search_alpha';
  const beta = 'sess_search_beta';
  await store.append(alpha, msg('user', 'How do I deploy the harness to production?'));
  await store.append(alpha, msg('assistant', 'Run the deploy script, then verify health.'));
  await store.append(alpha, msg('tool', 'health check output: all green', 'shell'));
  await store.append(beta, msg('user', 'What is the capital of France?'));
  await store.append(beta, msg('assistant', 'Paris is the capital of France.'));
  await store.writeMeta(alpha, { title: 'Deploy walkthrough' });

  // --- validation ---
  await expectSearchError(() => searchSessionsDetailed(CWD, ''), 'bad_query', 400, 'empty query');
  await expectSearchError(() => searchSessionsDetailed(CWD, '   '), 'bad_query', 400, 'blank query');
  await expectSearchError(() => searchSessionsDetailed(CWD, 42), 'bad_query', 400, 'non-string query');
  await expectSearchError(() => searchSessionsDetailed(CWD, 'deploy', { limit: 0 }), 'bad_limit', 400, 'zero limit');
  await expectSearchError(
    () => searchSessionsDetailed(CWD, 'deploy', { limit: SESSION_SEARCH_LIMITS.maxLimit + 1 }),
    'bad_limit',
    400,
    'over-max limit',
  );
  await expectSearchError(() => searchSessionsDetailed(CWD, 'deploy', { limit: 'many' }), 'bad_limit', 400, 'nan limit');

  // --- live search (whichever engine this runtime has) ---
  const deploy = await searchSessionsDetailed(CWD, 'deploy');
  assert(deploy.engine === (fts ? 'fts5' : 'substring'), `engine reported honestly (${deploy.engine})`);
  assert(deploy.count === deploy.hits.length, 'count matches hits');
  assert(deploy.hits.some((h) => h.sessionId === alpha), 'deploy finds the alpha session');
  assert(deploy.hits.every((h) => h.sessionId !== beta), 'deploy excludes the beta session');
  const first = deploy.hits[0];
  assert(first.title === 'Deploy walkthrough', 'hit carries the renamed title');
  assert(typeof first.index === 'number' && first.index >= 0, 'hit carries a message index');
  assert(first.excerpt.length > 0 && first.excerpt.length <= 160, 'excerpt non-empty within cap');
  assert(typeof first.timestamp === 'string' && first.timestamp.length > 0, 'hit carries a timestamp');
  assert(!first.excerpt.includes('') && !first.excerpt.includes(''), 'no snippet markers leak');

  // AND semantics: both terms must match the same message.
  const and = await searchSessionsDetailed(CWD, 'deploy harness');
  assert(and.hits.some((h) => h.sessionId === alpha), 'AND query still finds alpha');

  // Title match surfaces (renamed title is indexed).
  const titled = await searchSessionsDetailed(CWD, 'walkthrough');
  assert(titled.hits.some((h) => h.sessionId === alpha), 'renamed title is searchable');

  // Tool rows are searchable and keep their toolName.
  const tool = await searchSessionsDetailed(CWD, 'green');
  const toolHit = tool.hits.find((h) => h.sessionId === alpha && h.role === 'tool');
  assert(toolHit?.toolName === 'shell', 'tool hit keeps its toolName');

  // No-match query is an honest empty list, not an error.
  const none = await searchSessionsDetailed(CWD, 'zzz-no-such-term-zzz');
  assert(none.count === 0 && none.hits.length === 0, 'no-match returns empty');

  // --- substring degrade path directly (deterministic on every runtime) ---
  const sub = await searchSessionsSubstring(CWD, 'capital France', 10);
  assert(sub.some((h) => h.sessionId === beta), 'substring finds the beta session');
  assert(sub.every((h) => h.sessionId !== alpha), 'substring excludes alpha');
  const subNone = await searchSessionsSubstring(CWD, 'zzz-no-such-term-zzz', 10);
  assert(subNone.length === 0, 'substring no-match returns empty');
  const subLimited = await searchSessionsSubstring(CWD, 'the', 1);
  assert(subLimited.length <= 1, 'substring honors limit');

  // --- index sync is incremental (second sync touches nothing) ---
  const firstSync = await syncSessionIndex(CWD);
  assert(firstSync.added + firstSync.updated + firstSync.removed >= 0, 'sync returns counts');
  const secondSync = await syncSessionIndex(CWD);
  assert(secondSync.added === 0 && secondSync.updated === 0 && secondSync.removed === 0, 'second sync is a no-op');

  // --- real HOME untouched ---
  console.log(`PASS: all ${passed} checks green (engine: ${deploy.engine})`);
}

await main();
