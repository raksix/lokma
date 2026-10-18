/**
 * Office worker detail probe (REQ-204 slice 4) — run with:
 *   `bun src/components/office/office-detail.test.ts` from `packages/lokma-web/web`.
 *
 * Plain asserts, no framework, no DOM (same shape as `office-view.test.ts`).
 *
 * Subject: every honesty rule the detail panel stands on. Each rule gets a
 * DISCRIMINATING pair — cases that differ ONLY in the rule under test — so a
 * rule nothing actually depends on shows up as an unasserted no-op.
 */
import {
  buildOfficeWorkerDetail,
  latestRunOutput,
  latestUserTask,
  mergeDetailTools,
  OFFICE_RESULT_MAX,
  readTranscriptRows,
  transcriptToolRows,
} from './office-detail';
import { OFFICE_TASK_MAX, OFFICE_TOOL_HISTORY_CAP, type OfficeToolRow } from './office-view';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
  passed++;
}

// ── fixtures ───────────────────────────────────────────────────────────────

const T1 = '2026-10-18T10:00:00.000Z';

function user(content: string, timestamp = T1): Record<string, unknown> {
  return { role: 'user', content, timestamp };
}

function assistant(content: string, timestamp = T1): Record<string, unknown> {
  return { role: 'assistant', content, timestamp };
}

function tool(
  callId: string,
  toolName: string,
  body: Record<string, unknown>,
  timestamp = T1,
): Record<string, unknown> {
  return { role: 'tool', content: JSON.stringify({ callId, ...body }), toolName, toolCallId: callId, timestamp };
}

function liveRow(over: Partial<OfficeToolRow> & { callId: string }): OfficeToolRow {
  return { at: T1, tool: 'read_file', detail: 'x', ok: null, running: true, ...over };
}

// ── A. readTranscriptRows: only readable rows become panel input ───────────

assert(readTranscriptRows([user('hi'), assistant('yo')]).length === 2, 'well-formed rows are kept');
assert(readTranscriptRows([{ role: 'user' } as never]).length === 0, 'a row without content is dropped');
assert(readTranscriptRows([{ content: 'no role' } as never]).length === 0, 'a row without a role is dropped');
assert(readTranscriptRows([null, 42, 'x'] as never[]).length === 0, 'non-object rows are dropped');
assert(readTranscriptRows([user('hi')])[0].timestamp === T1, 'the timestamp rides through');
assert(
  readTranscriptRows([{ role: 'tool', content: '{}' } as never])[0].toolName === undefined,
  'a missing toolName stays unset (never an empty string)',
);
assert(
  readTranscriptRows([tool('c1', 'read_file', { ok: true })])[0].toolCallId === 'c1',
  'toolCallId rides through for the merge',
);

// ── B. transcriptToolRows: persisted rows, newest first ────────────────────

const fileOrder = [
  user('do it'),
  tool('c1', 'read_file', { callId: 'c1', ok: true, result: 'A', input: { path: 'a.ts' } }),
  assistant('done'),
  tool('c2', 'run_command', { callId: 'c2', ok: false, code: 'boom', input: { command: 'npm test' } }),
];
const parsed = transcriptToolRows(readTranscriptRows(fileOrder));
assert(parsed.length === 2, 'only role=tool rows become tool entries');
assert(parsed[0].callId === 'c2', 'the newest row is first (file order reversed)');
assert(parsed[1].callId === 'c1', 'the older row follows');
assert(parsed[0].entry.isError === true, 'ok:false is an error entry');
assert(parsed[1].entry.isError === false, 'ok:true is not an error');
assert(
  (parsed[1].entry.input as { path?: string }).path === 'a.ts',
  'the persisted input rides through (the one-line detail is not the source)',
);
assert(parsed[0].at === T1, 'the transcript timestamp rides through');
const broken = readTranscriptRows([{ role: 'tool', content: 'not json', toolName: 'x', toolCallId: 'c9', timestamp: T1 }]);
assert(transcriptToolRows(broken).length === 0, 'an unparsable tool row is skipped, never guessed');

// ── C. latestUserTask: the run's driving prompt ────────────────────────────

assert(
  latestUserTask(readTranscriptRows([user('first task'), assistant('x'), user('second task')])) === 'second task',
  'the LATEST user prompt is the task',
);
assert(
  latestUserTask(readTranscriptRows([user('line one\nline two')])) === 'line one',
  'the task is the first non-empty line',
);
assert(latestUserTask(readTranscriptRows([user('   \n  ')]) ) === null, 'a blank prompt yields no task');
assert(latestUserTask(readTranscriptRows([assistant('only me')])) === null, 'no user row means no task');
const longTask = latestUserTask(readTranscriptRows([user('x'.repeat(400))])) ?? '';
assert(longTask.length === OFFICE_TASK_MAX, 'the task is capped at OFFICE_TASK_MAX');
assert(longTask.endsWith('...'), 'a capped task says so with an ellipsis');

// ── D. latestRunOutput: this run's answer, not the last one ────────────────

assert(
  latestRunOutput(readTranscriptRows([user('q1'), assistant('a1'), user('q2')])) === null,
  'the previous turn answer is NOT this run output (null until the run answers)',
);
assert(
  latestRunOutput(readTranscriptRows([user('q1'), assistant('a1'), user('q2'), assistant('a2')])) === 'a2',
  'the answer below the latest prompt is the output',
);
assert(
  latestRunOutput(readTranscriptRows([user('q1'), assistant('a1'), user('q2'), assistant('a2'), assistant('a3')])) === 'a3',
  'the LATEST answer below the prompt wins',
);
assert(
  latestRunOutput(readTranscriptRows([user('q1'), assistant('a1'), user('q2'), assistant('a2'), assistant('   ')])) === 'a2',
  'a blank assistant row is skipped (the scan is newest-first)',
);
assert(
  latestRunOutput(readTranscriptRows([user('q'), assistant('   ')])) === null,
  'a blank answer below the prompt is still no output',
);
assert(latestRunOutput(readTranscriptRows([assistant('marker only')])) === null, 'no prompt means no output (session marker is not a result)');
const longOut = latestRunOutput(readTranscriptRows([user('q'), assistant('y'.repeat(2000))])) ?? '';
assert(longOut.length === OFFICE_RESULT_MAX, 'the output is capped at OFFICE_RESULT_MAX');
assert(longOut.endsWith('...'), 'a capped output says so');

// ── E. mergeDetailTools: persisted rows + the in-flight call ───────────────

const persisted = transcriptToolRows(
  readTranscriptRows([tool('c1', 'read_file', { callId: 'c1', ok: true, input: { path: 'a' } })]),
);
const withRunning = mergeDetailTools(persisted, [liveRow({ callId: 'c2' })]);
assert(withRunning.length === 2, 'the in-flight call is merged in');
assert(withRunning[0].callId === 'c2', 'the in-flight call sits in FRONT (newest)');
assert(withRunning[0].entry.tool === 'read_file' && withRunning[0].entry.result === undefined, 'the running entry has no result yet');
assert(
  mergeDetailTools(persisted, [liveRow({ callId: 'c1' })]).length === 1,
  'a live call that already has a persisted row is NOT duplicated',
);
assert(
  mergeDetailTools(persisted, [liveRow({ callId: 'c3', running: false })]).length === 1,
  'a finished-but-unpersisted live row is not merged (the next read persists it)',
);
const many = Array.from({ length: OFFICE_TOOL_HISTORY_CAP + 5 }, (_, i) =>
  transcriptToolRows(readTranscriptRows([tool('c' + i, 'read_file', { callId: 'c' + i, ok: true })])),
).map((rows) => rows[0]);
const capped = mergeDetailTools(many, [liveRow({ callId: 'crun' })]);
assert(capped.length === OFFICE_TOOL_HISTORY_CAP, 'the merged list keeps the last-N cap');
assert(capped[0].callId === 'crun', 'the cap keeps the in-flight call at the front');

// ── F. buildOfficeWorkerDetail: the panel model, end to end ────────────────

const detail = buildOfficeWorkerDetail(
  'sess_1',
  [user('fix the login bug'), tool('c1', 'read_file', { callId: 'c1', ok: true, result: 'ok', input: { path: 'a.ts' } }), assistant('fixed it')],
  [],
);
assert(detail.sessionId === 'sess_1', 'the session id rides through');
assert(detail.task === 'fix the login bug', 'the task is the transcript latest prompt');
assert(detail.tools.length === 1 && detail.tools[0].callId === 'c1', 'the tool list comes from the transcript');
assert(detail.output === 'fixed it', 'the output is the assistant row below the prompt');
const emptyDetail = buildOfficeWorkerDetail('sess_2', [], []);
assert(
  emptyDetail.task === null && emptyDetail.output === null && emptyDetail.tools.length === 0,
  'an empty transcript yields an empty model (no invented lines)',
);

console.log('---');
console.log(passed + ' assertions passed');
