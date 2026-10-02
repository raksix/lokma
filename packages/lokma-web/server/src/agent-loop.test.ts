/**
 * Agent-loop history probe (REQ-071).
 * Run: `bun src/agent-loop.test.ts` from `packages/lokma-web/server`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Not imported by server code, so `tsc -p` output ignores it.
 */
import { buildLoopHistory, decideTurnEnd, maxToolConcurrency, retryDelayMs, toolRowParts, truncateHistoryText } from './agent-loop';

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
