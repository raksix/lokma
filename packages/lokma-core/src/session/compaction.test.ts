/**
 * Live probe for two-tier session compaction (`./compaction` — Docs/28 §1.3).
 * Run: `HOME=$(mktemp -d) bun src/session/compaction.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Real temp HOME on disk (startup env — bun snapshots HOME at boot; the
 * guard below refuses anything outside `/tmp/`). Real SessionStore files,
 * real archive + report sidecars.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SessionStore } from './store.js';
import type { SessionMessage } from './types.js';
import {
  COMPACTION_LIMITS,
  COMPACT_ANCHOR_TOOL,
  buildExtractiveSummary,
  compactSession,
  compactionStatus,
  hygienePass,
  hygienePinned,
  isAnchorMessage,
  transcriptChars,
} from './compaction.js';

const HOME = process.env.HOME ?? '';
if (!HOME.startsWith('/tmp/')) {
  throw new Error(`REFUSE: HOME=${HOME || '(empty)'} — rerun with HOME=$(mktemp -d) bun ...`);
}

const CWD = '/tmp/probe-work-compact';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

function msg(role: SessionMessage['role'], content: string, toolName?: string): SessionMessage {
  return { role, content, timestamp: new Date().toISOString(), ...(toolName ? { toolName } : {}) };
}

async function expectSessionError(fn: () => Promise<unknown>, code: string, label: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const err = e as { code?: string; statusCode?: number };
    assert(err.code === code, `${label} code is ${code}`);
    assert(err.statusCode === 404, `${label} status is 404`);
    return;
  }
  throw new Error(`FAIL: ${label} did not throw`);
}

async function main(): Promise<void> {
  const store = new SessionStore(CWD);

  // --- pure helpers ---
  assert(transcriptChars([msg('user', 'abc'), msg('assistant', 'de')]) === 5, 'transcriptChars sums content');
  assert(isAnchorMessage(msg('tool', 'x', COMPACT_ANCHOR_TOOL)), 'anchor block recognized');
  assert(!isAnchorMessage(msg('tool', 'x', 'read')), 'plain tool row is not an anchor');
  assert(!isAnchorMessage(msg('assistant', 'x')), 'assistant row is not an anchor');

  // --- tier-1 hygiene ---
  const hygIn = [
    msg('user', 'hello'),
    msg('user', '   \n  '),
    msg('assistant', 'a\n\n\n\nb'),
    msg('assistant', 'c'),
    msg('user', 'q'),
    msg('tool', 'r1', 'read'),
    msg('tool', 'r2', 'exec'),
    msg('tool', `big-${'z'.repeat(COMPACTION_LIMITS.toolResultCap + 100)}`, 'read'),
  ];
  const { messages: hygOut, stats } = hygienePass(hygIn);
  assert(stats.dropped === 1, 'hygiene drops the blank message');
  assert(stats.merged === 1, 'hygiene merges the assistant run');
  assert(stats.truncated === 1, 'hygiene truncates the oversized tool result');
  assert(hygOut.length === hygIn.length - 2, 'hygiene output shrinks by drop+merge');
  assert(hygOut.some((m) => m.content.includes('a\n\nb')), 'hygiene collapses newline runs');
  assert(hygOut.some((m) => m.content === 'a\n\nb\nc'), 'hygiene joins merged content with newline');
  const big = hygOut.find((m) => m.content.includes('lokma-compact: truncated'));
  assert(!!big, 'truncation leaves an explicit marker');
  assert(big !== undefined && big.content.startsWith('big-') && big.content.endsWith('z'), 'truncation keeps head and tail');
  assert(
    hygOut.filter((m) => m.role === 'tool' && m.toolName === 'read').length === 2,
    'same-name tool rows merge, different names stay split',
  );

  // --- extractive summary is quotes-only ---
  const summary = buildExtractiveSummary('sess_x', [msg('user', 'first request line\nsecond'), msg('tool', 'out', 'exec')], 0);
  assert(summary.includes('first request line'), 'summary quotes the user first line');
  assert(summary.includes('exec'), 'summary lists used tools');
  assert(summary.includes('sess_x.archive.jsonl'), 'summary points at the archive');

  // --- missing session errors ---
  await expectSessionError(() => compactSession(CWD, 'nope-missing'), 'session_not_found', 'compact on missing');
  await expectSessionError(() => compactionStatus(CWD, 'nope-missing'), 'session_not_found', 'status on missing');

  // --- small transcript: honest no-op, nothing written ---
  const smallId = 'probe-small';
  await store.append(smallId, msg('user', 'tiny question'));
  await store.append(smallId, msg('assistant', 'tiny answer'));
  const noop = await compactSession(CWD, smallId);
  assert(noop.compacted === false, 'small transcript compacts to a no-op');
  assert(noop.summary === null && noop.archived === 0, 'no-op carries no summary and archives nothing');
  const smallDir = SessionStore.dirFor(CWD);
  const smallFiles = await readdir(smallDir);
  assert(!smallFiles.includes(`${smallId}.archive.jsonl`), 'no-op writes no archive file');
  assert(!smallFiles.includes(`${smallId}.compaction.json`), 'no-op writes no report file');
  const smallStatus = await compactionStatus(CWD, smallId);
  assert(smallStatus.hygieneNeeded === false && smallStatus.summaryNeeded === false, 'small status needs nothing');
  assert(smallStatus.last === null, 'status reports no previous run');

  // --- hygiene-only mode: blanks fixed, no archive ---
  const hygId = 'probe-hyg';
  await store.append(hygId, msg('user', 'real q'));
  await store.append(hygId, msg('assistant', '  \n '));
  await store.append(hygId, msg('assistant', 'real a'));
  const hygReport = await compactSession(CWD, hygId, { mode: 'hygiene' });
  assert(hygReport.compacted === true && hygReport.mode === 'hygiene', 'hygiene mode compacts blanks');
  assert(hygReport.archived === 0 && hygReport.summary === null, 'hygiene-only run archives nothing');
  const hygAfter = await store.read(hygId);
  assert(hygAfter.length === 2, 'hygiene drops the blank but never merges across roles');
  assert(hygAfter[0].content === 'real q' && hygAfter[1].content === 'real a', 'survivors keep their own content');

  // --- pinned head: same-role boundary never merges when an anchor exists ---
  const { messages: pinned } = hygienePinned(
    [msg('user', 'head'), msg('user', 'tail-follows')],
    1,
  );
  assert(pinned.length === 2, 'pinned head does not merge with the next message');
  const { messages: unpinned } = hygienePinned([msg('user', 'head'), msg('user', 'tail-follows')], 0);
  assert(unpinned.length === 1, 'without a pin the same pair still merges');

  // --- full mode on a long transcript ---
  const bigId = 'probe-big';
  const PAIRS = 60;
  const FILLER = `filler-${'x'.repeat(2400)}`;
  await store.append(bigId, msg('user', 'FIRST-USER-MARKER troubled deploy question'));
  for (let i = 0; i < PAIRS; i += 1) {
    await store.append(bigId, msg('assistant', `answer ${i} ${FILLER}`));
    await store.append(bigId, msg('user', `follow-up ${i} ${FILLER}`));
  }
  await store.append(bigId, msg('assistant', 'TAIL-MARKER final answer'));
  const before = await store.read(bigId);
  assert(before.length === 2 * PAIRS + 2, 'long fixture has the expected message count');
  const bigStatus = await compactionStatus(CWD, bigId);
  assert(bigStatus.summaryNeeded === true, 'long transcript trips the summary trigger');
  const bigReport = await compactSession(CWD, bigId);
  assert(bigReport.compacted === true && bigReport.archived > 0, 'full mode archives the middle');
  assert(bigReport.anchors.length === bigReport.archived, 'every archived message gets an anchor entry');
  assert(bigReport.summary !== null && bigReport.summary.includes('FIRST-USER-MARKER') === false, 'summary covers the middle, not the kept head');
  const after = await store.read(bigId);
  assert(after[0].role === 'tool' && after[0].toolName === COMPACT_ANCHOR_TOOL, 'rewritten transcript starts with the anchor block');
  assert(after.some((m) => m.content.includes('FIRST-USER-MARKER')), 'first user message kept verbatim');
  assert(after.some((m) => m.content.includes('TAIL-MARKER')), 'tail kept verbatim');
  assert(after.length === 1 + 1 + COMPACTION_LIMITS.keepTail, 'rewritten transcript is anchor + head + tail');
  assert(after.filter(isAnchorMessage).length === 1, 'exactly one anchor block exists');
  assert(bigReport.afterChars < bigReport.beforeChars, 'compaction shrinks total chars');
  // Archive holds the real originals.
  const archiveRaw = await readFile(join(smallDir, `${bigId}.archive.jsonl`), 'utf-8');
  const archived = archiveRaw.split('\n').filter(Boolean);
  assert(archived.length === bigReport.archived, 'archive file holds every removed original');
  assert(archived.some((l) => l.includes('follow-up 0')), 'archive contains a compacted-away turn');
  // Archives are invisible to the session list.
  assert(!(await store.list()).some((id) => id.includes('archive')), 'archive file is not listed as a session');
  // Status now reflects the last run.
  const afterStatus = await compactionStatus(CWD, bigId);
  assert(afterStatus.last !== null && afterStatus.last.archived === bigReport.archived, 'status echoes the last report');
  assert(afterStatus.summaryNeeded === false, 'compacted transcript clears the trigger');

  // --- second run is a no-op (anchors never stack) ---
  const rerun = await compactSession(CWD, bigId);
  assert(rerun.compacted === false, 'second run compacts nothing');
  const twice = await store.read(bigId);
  assert(twice.filter(isAnchorMessage).length === 1, 're-run adds no second anchor');

  // --- hygiene rewrite around an old anchor re-attaches it ---
  await store.append(bigId, msg('assistant', '   \n  '));
  const rewrite = await compactSession(CWD, bigId, { mode: 'hygiene' });
  assert(rewrite.compacted === true, 'hygiene run with a new blank rewrites');
  assert(rewrite.archived === 0, 'hygiene rewrite archives nothing new');
  const kept = await store.read(bigId);
  assert(kept.filter(isAnchorMessage).length === 1, 'hygiene rewrite keeps the single anchor');
  assert(kept[0].role === 'tool' && kept[0].toolName === COMPACT_ANCHOR_TOOL, 'anchor still leads the transcript');
  assert(kept.some((m) => m.content.includes('FIRST-USER-MARKER')), 'pinned head survives repeat runs verbatim');

  console.log(`\nOK: ${passed} checks passed`);
}

await main();
