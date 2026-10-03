/**
 * Agent-loop history probe (REQ-071).
 * Run: `bun src/agent-loop.test.ts` from `packages/lokma-web/server`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Not imported by server code, so `tsc -p` output ignores it.
 */
import { buildLoopHistory, decideTurnEnd, fileAttachmentBlocks, maxToolConcurrency, retryDelayMs, splitPromptRow, toolRowParts, truncateHistoryText } from './agent-loop';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

const msg = (role: 'user' | 'assistant' | 'tool', content: string, extra?: { toolName?: string; toolCallId?: string }) => ({
  role,
  content,
  timestamp: '2026-09-08T00:00:00.000Z',
  ...extra,
});

// 1. Short text rides untouched.
assert(truncateHistoryText('hi', 8000) === 'hi', 'short text untouched');

// 2. Long text truncates with a visible marker.
const cut = truncateHistoryText('z'.repeat(9000), 8000);
assert(cut.length < 9000 && cut.includes('[truncated 1000 chars]'), 'long text cut + marked');

// 3. One giant message cannot evict the conversation.
const giant = 'G'.repeat(60_000);
const history = buildLoopHistory([
  msg('user', 'remember the word BANANA'),
  msg('assistant', 'Got it, BANANA noted.'),
  msg('assistant', giant),
  msg('user', 'what was the word?'),
]);
const joined = history.map((m) => m.content).join('\n');
assert(joined.includes('BANANA'), 'early conversation survives a 60KB giant');
assert(history[history.length - 1].content === 'what was the word?', 'newest prompt rides whole');
assert(joined.length < 60_000, 'giant truncated in history');

// 4. Huge tool_result JSON shrinks to 2K.
const toolHistory = buildLoopHistory([
  msg('user', 'list files'),
  msg('tool', 'R'.repeat(30_000), { toolName: 'list_files', toolCallId: 't1' }),
  msg('user', 'now write it'),
]);
const toolRow = toolHistory.find((m) => m.content.includes('<tool_result'));
assert(toolRow !== undefined && toolRow.content.length < 5_000, 'tool row truncated');
assert(toolHistory[toolHistory.length - 1].content === 'now write it', 'newest prompt whole after tool row');

// 5. REQ-128: an assistant row + id-bearing tool rows re-pair natively.
const paired = buildLoopHistory([
  msg('user', 'read a.ts'),
  msg('assistant', 'Reading it now.'),
  msg('tool', JSON.stringify({ callId: 't_1', ok: true, result: { content: 'FILE BODY' }, input: { path: 'a.ts' } }), {
    toolName: 'read_file',
    toolCallId: 't_1',
  }),
  msg('user', 'thanks'),
]);
const pairedAssistant = paired[1];
assert(
  pairedAssistant?.role === 'assistant' &&
    pairedAssistant.toolCalls?.length === 1 &&
    pairedAssistant.toolCalls[0]?.id === 't_1' &&
    pairedAssistant.toolCalls[0]?.arguments === '{"path":"a.ts"}',
  'history re-pairs the assistant turn with its native tool_calls',
);
assert(
  paired[2]?.role === 'tool' && paired[2]?.toolCallId === 't_1' && paired[2]?.content === '{"content":"FILE BODY"}',
  'history replays the RESULT body (not the whole transcript record) as a tool row',
);

// 5b. An unpaired tool row (no assistant ahead of it) stays text — a
// tool_call_id must never be left dangling upstream.
const unpaired = buildLoopHistory([msg('tool', '{"ok":true,"result":"x"}', { toolName: 'glob', toolCallId: 't9' })]);
assert(
  unpaired.length === 1 && unpaired[0]?.role === 'user' && unpaired[0]?.content.includes('<tool_result') && !unpaired[0]?.toolCalls,
  'a tool row without an assistant turn degrades to text',
);

// 5c. A failed tool row replays as an ERROR body.
const failed = buildLoopHistory([
  msg('assistant', 'Trying.'),
  msg('tool', JSON.stringify({ callId: 't_2', ok: false, code: 'file_not_found', message: 'No such file' }), {
    toolName: 'read_file',
    toolCallId: 't_2',
  }),
]);
assert(
  failed[1]?.role === 'tool' && failed[1]?.content === 'ERROR file_not_found: No such file',
  'a failed tool row replays its error body',
);

// 5d. toolRowParts: legacy plain rows survive untouched.
assert(
  toolRowParts('not json at all').body === 'not json at all' && toolRowParts('not json at all').argumentsJson === '{}',
  'a legacy plain tool row still replays',
);

console.log(`\nagent-loop probe: ${passed} passed`);

/* REQ-077 — retryDelayMs: 1-based backoff, last repeats, empty = 0. */
const D = [3_000, 10_000, 15_000, 20_000, 30_000, 40_000, 50_000];
assert(retryDelayMs(D, 1) === 3_000, 'attempt 1 waits 3s');
assert(retryDelayMs(D, 2) === 10_000, 'attempt 2 waits 10s');
assert(retryDelayMs(D, 7) === 50_000, 'attempt 7 waits 50s');
assert(retryDelayMs(D, 8) === 50_000, 'past the end the last repeats');
assert(retryDelayMs(D, 100) === 50_000, 'far past the end still repeats');
assert(retryDelayMs([], 1) === 0, 'empty list = no wait');
assert(retryDelayMs(D, 0) === 0, 'attempt 0 = no wait');

console.log(`agent-loop-retry probe: ${passed} passed`);

/* REQ-116 FAZ A — decideTurnEnd: Claude-Code-style stop_reason discipline. */
assert(decideTurnEnd({ toolCalls: 2, asks: 0, cleanText: 'working' }) === 'tool_use', 'calls present -> tool_use');
assert(decideTurnEnd({ toolCalls: 1, asks: 1, cleanText: '' }) === 'tool_use', 'calls beat asks -> tool_use');
assert(decideTurnEnd({ toolCalls: 0, asks: 2, cleanText: '' }) === 'ask', 'asks without calls -> ask');
assert(decideTurnEnd({ toolCalls: 0, asks: 0, cleanText: '' }) === 'empty', 'no text/calls/asks -> empty');
assert(decideTurnEnd({ toolCalls: 0, asks: 0, cleanText: '   \n  ' }) === 'empty', 'whitespace-only -> empty');
assert(decideTurnEnd({ toolCalls: 0, asks: 0, cleanText: 'done, here it is' }) === 'end_turn', 'answer text -> end_turn');
assert(decideTurnEnd({ toolCalls: 0, asks: 1, cleanText: 'one question' }) === 'ask', 'text plus asks -> ask');

// Parallel-batch width (REQ-128, Claude-Code parity on its env knob).
assert(maxToolConcurrency(undefined) === 10, 'no override -> 10');
assert(maxToolConcurrency('') === 10 && maxToolConcurrency('abc') === 10, 'junk override falls back to 10');
assert(maxToolConcurrency('0') === 10 && maxToolConcurrency('-4') === 10, 'non-positive override falls back to 10');
assert(maxToolConcurrency('4') === 4, 'a sane override is honoured');
assert(maxToolConcurrency('999') === 32, 'a huge override is clamped to 32');

console.log(`agent-loop-turnend probe: ${passed} passed`);

/* REQ-186 — user-attached images replay to the provider as real bytes. */
const imgRow = (chars: number, name: string) => ({ name, mime: 'image/png', dataBase64: 'A'.repeat(chars) });

// 6a. The newest user row keeps its images — this is the hop that makes the
// model actually SEE the attached screenshot (adapters emit content parts
// from here; dropping it is exactly the "gorseli gormuyor" bug).
const imageHistory = buildLoopHistory([
  { role: 'user', content: 'earlier', timestamp: 't1' },
  { role: 'assistant', content: 'ok', timestamp: 't2' },
  { role: 'user', content: 'look at this', timestamp: 't3', images: [imgRow(120, 'shot.png')] },
]);
const imgUser = [...imageHistory].reverse().find((m) => m.role === 'user');
assert(imgUser?.images?.length === 1, 'newest user row replays its image');
assert(imgUser?.images?.[0]?.dataBase64.length === 120, 'image bytes survive the mapping');

// 6b. Images budget out oldest-first: a fresh prompt keeps its bytes even
// when the previous turn already spent most of the cap.
const budgetHistory = buildLoopHistory([
  { role: 'user', content: 'old giant', timestamp: 't1', images: [imgRow(3_000_000, 'old.png')] },
  { role: 'assistant', content: 'seen', timestamp: 't2' },
  { role: 'user', content: 'new', timestamp: 't3', images: [imgRow(2_000_000, 'new.png')] },
]);
const oldImageRow = budgetHistory.find((m) => m.role === 'user' && m.content === 'old giant');
const newImageRow = budgetHistory.find((m) => m.role === 'user' && m.content === 'new');
assert(newImageRow?.images?.[0]?.dataBase64.length === 2_000_000, 'newest keeps its image under the cap');
assert(oldImageRow?.images === undefined, 'older images drop when the budget is spent');

// 6c. An image-only prompt has no text but must not be dropped.
const imageOnly = buildLoopHistory([
  { role: 'user', content: '', timestamp: 't1', images: [imgRow(60, 'only.png')] },
]);
assert(imageOnly.length === 1 && imageOnly[0]?.images?.[0]?.mime === 'image/png', 'image-only prompt rides');

// 6d. Within budget, recent turns all keep theirs.
const bothSmall = buildLoopHistory([
  { role: 'user', content: 'first', timestamp: 't1', images: [imgRow(60, 'a.png')] },
  { role: 'user', content: 'second', timestamp: 't2', images: [imgRow(60, 'b.png')] },
]);
assert(bothSmall.filter((m) => m.images?.length).length === 2, 'both recent turns keep their images');

console.log(`agent-loop-images probe: ${passed} passed`);

/* REQ-187 — user-attached files replay as labeled blocks. */
const fileRow = (name: string, chars: number) => ({ name, mime: 'text/plain', size: chars, content: 'x'.repeat(chars) });

// 7a. The block is the exact shape the model reads (label + content).
const block = fileAttachmentBlocks([{ name: 'notes.md', mime: 'text/markdown', size: 12, content: 'HELLO-TOKEN' }]);
assert(
  block === '<file name="notes.md" mime="text/markdown" size="12">\nHELLO-TOKEN\n</file>',
  'block is the labeled file shape',
);

// 7b. A user row carrying files replays its content inside the block.
const fileHistory = buildLoopHistory([
  { role: 'user', content: 'read this', timestamp: 't1', files: [fileRow('a.txt', 40)] },
]);
assert(
  fileHistory.length === 1 &&
    fileHistory[0]?.content.startsWith('read this') &&
    fileHistory[0]?.content.includes('<file name="a.txt"') &&
    fileHistory[0]?.content.includes('x'.repeat(40)),
  'file content replays as a labeled block',
);

// 7c. Budget: newest keeps its file; older blocks drop once the cap is spent.
const fileBudget = buildLoopHistory([
  { role: 'user', content: 'old', timestamp: 't1', files: [fileRow('old.txt', 250_000)] },
  { role: 'assistant', content: 'ok', timestamp: 't2' },
  { role: 'user', content: 'new', timestamp: 't3', files: [fileRow('new.txt', 50_000)] },
]);
const newFileRow = fileBudget.find((m) => m.content.startsWith('new'));
const oldFileRow = fileBudget.find((m) => m.content.startsWith('old'));
assert(newFileRow !== undefined && newFileRow.content.includes('<file name="new.txt"'), 'newest keeps its file under the cap');
assert(oldFileRow !== undefined && !oldFileRow.content.includes('old.txt'), 'older file blocks drop when spent');

// 7d. A file-only prompt has no text but must not be dropped.
const fileOnly = buildLoopHistory([
  { role: 'user', content: '', timestamp: 't1', files: [fileRow('only.txt', 10)] },
]);
assert(fileOnly.length === 1 && fileOnly[0]?.content.includes('<file name="only.txt"'), 'file-only prompt rides');

// 7e. Attachment text is budgeted separately: a huge file must not evict the
// conversation the way an uncounted 300KB block would (text cap alone).
const giantFile = buildLoopHistory([
  { role: 'user', content: 'remember BANANA-FILE', timestamp: 't1' },
  { role: 'assistant', content: 'noted', timestamp: 't2' },
  { role: 'user', content: 'here', timestamp: 't3', files: [fileRow('big.txt', 300_000)] },
]);
assert(
  giantFile.map((m) => m.content).join('\n').includes('BANANA-FILE'),
  'conversation survives a 300KB attachment (separate budget)',
);

console.log(`agent-loop-files probe: ${passed} passed`);

/* dedupe — the answered prompt row leaves the replayed history. */
// 8a. The trailing row that IS the prompt splits off (with its images, so
// they can ride the prompt message; measured duplicate on the wire before).
const dedupeImg = { name: 'shot.png', mime: 'image/png', dataBase64: 'QUJD' };
const split = splitPromptRow(
  [
    msg('user', 'earlier'),
    msg('assistant', 'ok'),
    { role: 'user', content: 'NOW', timestamp: 't3', images: [dedupeImg] },
  ],
  'NOW',
);
assert(split.prior.length === 2, 'prior rows keep everything before the prompt');
assert(split.promptRow?.content === 'NOW', 'the prompt row is handed back');
assert(split.promptRow?.images?.length === 1, 'its images ride the prompt message (REQ-186)');

// 8b. A tail that is NOT the prompt stays in history (e.g. a queued second
// prompt appended while this one runs).
const noSplit = splitPromptRow([msg('user', 'x'), msg('assistant', 'done')], 'x');
assert(noSplit.promptRow === null && noSplit.prior.length === 2, 'a non-matching tail stays in history');

// 8c. An empty transcript (CLI-style callers) is a no-op.
const emptySplit = splitPromptRow([], 'hello');
assert(emptySplit.promptRow === null && emptySplit.prior.length === 0, 'empty transcript is a no-op');

console.log(`agent-loop-dedupe probe: ${passed} passed`);
