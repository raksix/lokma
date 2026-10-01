/**
 * LokmaMessage probe for W1-2.
 * Run: `bun src/components/chat/lokma-message.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain asserts so `tsc -b` stays dependency-free.
 * Not imported by app code, so the Vite bundle ignores it.
 */
import { applyServerFrame, dropRequest, initialWsUiState, permissionAnswer, questionAnswer } from '@/lib/ws';
import { describeToolCall, formatBytes, parseMarkdownBlocks, parseTableAlign, reasoningPreview, renderInline, sanitizeMdUrl, splitCodeFences, splitTableRow, stripThinkingMarkup, summarizeInput, summarizeResult, transcriptToolEntry } from './lokma-message';
import { Fragment, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

// 1. Fence parsing splits real code out of assistant text.
const segs = splitCodeFences('Intro line\n```ts\nconst a = 1;\n```\nOutro');
assert(segs.length === 3, 'text/code/text split');
assert(segs[0].kind === 'text' && (segs[0] as { body: string }).body === 'Intro line', 'leading text exact');
assert(segs[1].kind === 'code', 'middle segment is code');
assert((segs[1] as { lang: string }).lang === 'ts', 'code lang parsed');
assert((segs[1] as { body: string }).body === 'const a = 1;', 'code body exact');
assert(splitCodeFences('plain only').length === 1, 'plain text is one segment');
assert(splitCodeFences('```py\nopen(\n').length === 1, 'unclosed fence is code');

// 2. Input summaries stay one line and bounded.
assert(summarizeInput({ cmd: 'npm test', cwd: '/x' }).includes('npm test'), 'object input summarized');
assert(summarizeInput('a\nb').includes(' ') || summarizeInput('a\nb') === 'a b', 'multiline flattened');
assert(summarizeInput('z'.repeat(500)).length <= 120, 'long input truncated');

// 3. Thought trace folds from real tool_start / tool_result frames.
let ui = initialWsUiState();
ui = applyServerFrame(ui, { type: 'tool_start', tool: 'bash', input: { cmd: 'ls' }, callId: 'c1', sessionId: 's' });
assert(ui.toolCalls['c1']?.tool === 'bash', 'tool_start registers call');
assert(ui.toolCalls['c1']?.result === undefined, 'running call has no result yet');
ui = applyServerFrame(ui, { type: 'tool_result', callId: 'c1', result: 'ok', isError: false, sessionId: 's' });
assert(ui.toolCalls['c1']?.result === 'ok', 'tool_result attaches output');

// 4. Permission + question queues fill from real server frames.
ui = applyServerFrame(ui, {
  type: 'permission_request',
  requestId: 'p1',
  tool: 'bash',
  description: 'run npm test',
  sessionId: 's',
});
assert(ui.permissions.length === 1 && ui.permissions[0].tool === 'bash', 'permission_request queued');
ui = applyServerFrame(ui, {
  type: 'ask_user_question',
  requestId: 'q1',
  question: 'Which model?',
  choices: ['a', 'b'],
  sessionId: 's',
});
assert(ui.questions.length === 1 && (ui.questions[0].choices ?? []).length === 2, 'question queued with choices');

// 5. Answer builders produce schema-valid client frames (server decodes them).
const perm = JSON.parse(permissionAnswer('p1', 'always')) as Record<string, unknown>;
assert(perm.type === 'permission_response' && perm.decision === 'always', 'permission answer frame valid');
const ques = JSON.parse(questionAnswer('q1', 'a')) as Record<string, unknown>;
assert(ques.type === 'ask_response' && ques.answer === 'a', 'question answer frame valid');

// 6. Answering drops the card from its queue (hook mirrors this via dropRequest).
assert(dropRequest(ui.permissions, 'p1').length === 0, 'answered permission leaves queue');
assert(dropRequest(ui.questions, 'q1').length === 0, 'answered question leaves queue');

// 7. REQ-069: markdown block parser (headers/lists/quotes/rules/paragraphs).
const md = parseMarkdownBlocks('## Title\n\n- a\n- b\n\n1. x\n2. y\n\n> note\n\n---\n\nplain');
assert(md.length === 6, `six blocks parsed, got ${md.length}`);
assert(md[0].kind === 'h' && (md[0] as { level: number }).level === 2, 'h2 level parsed');
assert(md[1].kind === 'ul' && (md[1] as { items: string[] }).items.length === 2, 'ul items grouped');
assert(md[2].kind === 'ol' && (md[2] as { items: string[] }).items.length === 2, 'ol items grouped');
assert(md[3].kind === 'quote', 'quote parsed');
assert(md[4].kind === 'hr', 'rule parsed');
assert(md[5].kind === 'p', 'trailing paragraph parsed');
assert(parseMarkdownBlocks('just text').length === 1, 'plain text is one paragraph');
assert(parseMarkdownBlocks('**bold** and more')[0].kind === 'p', 'inline markup stays in paragraph');
assert(sanitizeMdUrl('https://example.com/a') === 'https://example.com/a', 'https link allowed');
assert(sanitizeMdUrl('/docs/x') === '/docs/x', 'relative link allowed');
assert(sanitizeMdUrl('javascript:alert(1)') === null, 'javascript: url rejected');
assert(sanitizeMdUrl('data:text/html,<b>x</b>') === null, 'data: url rejected');

// 8. REQ-073: human tool sentences (never raw JSON in the row).
assert(describeToolCall('read_file', { path: 'src/a.ts' }) === 'Read src/a.ts', 'read sentence');
assert(describeToolCall('write_file', { path: 'b.html', content: 'x'.repeat(2697) }) === 'Wrote b.html · 2.6KB', 'write sentence with size');
assert(describeToolCall('list_files', { path: '.' }) === 'Listed .', 'list sentence');
assert(describeToolCall('list_files', '{"path":"."}') === 'Listed .', 'stringified input parsed');
assert(describeToolCall('search_files', { query: 'auth' }) === 'Searched “auth”', 'search sentence');
assert(describeToolCall('run_command', { command: 'bun', args: ['run', 'build'] }) === 'Ran bun run build', 'run sentence');
assert(describeToolCall('open_project', { name: 'fermag', cwd: '/root/fermag' }) === 'Open project "fermag" at /root/fermag', 'open project sentence');
assert(describeToolCall('open_project', '{"name":"fermag","cwd":"/root/fermag"}') === 'Open project "fermag" at /root/fermag', 'open project stringified input');
assert(describeToolCall('mystery_tool', { a: 1 }) === 'mystery_tool · {"a":1}', 'unknown tool falls back');
assert(formatBytes(2697) === '2.6KB' && formatBytes(512) === '512B', 'byte labels');
assert(summarizeResult('list_files', { ok: true, result: { entries: [1, 2, 3] } }) === '3 entries', 'list count shown');
assert(summarizeResult('write_file', { ok: true, result: { path: 'b.html' } }) === 'b.html', 'write path shown');
assert(summarizeResult('read_file', { ok: false, code: 'denied', message: 'Denied by permissions: read_file' }).startsWith('Denied by'), 'error message shown, no dump');
assert(summarizeResult('read_file', { ok: true, result: {} }) === '', 'quiet success stays quiet');
assert(summarizeResult('x', undefined) === '', 'missing result is empty');

// 9. REQ-074: transcript tool rows become trace entries (Hermes parity).
const tEntry = transcriptToolEntry({
  role: 'tool',
  content: JSON.stringify({ callId: 't1', ok: true, result: { path: 'Docs', entries: [1, 2] }, input: { path: 'Docs' } }),
  toolName: 'list_files',
  toolCallId: 't1',
});
assert(tEntry !== null && tEntry.tool === 'list_files', 'tool row parses with name');
assert(tEntry !== null && describeToolCall(tEntry.tool, tEntry.input) === 'Listed Docs', 'transcript input renders human sentence');
assert(tEntry !== null && summarizeResult(tEntry.tool, tEntry.result) === '2 entries', 'transcript outcome summarized');
const tOld = transcriptToolEntry({ role: 'tool', content: JSON.stringify({ callId: 't2', ok: true, result: {} }), toolName: 'run_command' });
assert(tOld !== null && describeToolCall(tOld.tool, tOld.input) === 'Ran command', 'old rows without input fall back');
assert(transcriptToolEntry({ role: 'assistant', content: 'hi' }) === null, 'non-tool rows ignored');
assert(transcriptToolEntry({ role: 'tool', content: 'not-json' }) === null, 'broken rows ignored');

console.log('lokma-message.test.ts: all W1-2 checks passed');

// ─── REQ-124: thinking reads human — markup stripped, prose kept ───
{
  const bar = String.fromCharCode(0xff5c);
  const d = `${bar}${bar}DSML${bar}${bar}`;
  const raw = [
    'Let me check the docs first.',
    `<tool name="read_file">{"path": "Docs/x.md"}</tool>`,
    'Got it.',
    `<tool_call>{"name":"list_files"}</tool_call>`,
    'Done thinking.',
    `<${d} invoke name="read_file">{"path":"y"}</${d} invoke>`,
    'After dsml.',
    `<tool_result>{"ok":true}</tool_result>`,
    'Unclosed tail <tool name="write_file">{"path":',
  ].join('\n');
  const clean = stripThinkingMarkup(raw);
  assert(clean.includes('Let me check the docs first.'), 'prose kept');
  assert(clean.includes('Done thinking.'), 'prose between calls kept');
  assert(!clean.includes('<tool'), 'tool blocks gone');
  assert(!clean.includes('tool_call'), 'tool_call gone');
  assert(!clean.includes('tool_result'), 'tool_result gone');
  assert(!clean.includes('DSML'), 'dsml gone');
  assert(!clean.includes('write_file'), 'unclosed tag cut, lead prose kept');
  assert(stripThinkingMarkup('plain reasoning, no tags') === 'plain reasoning, no tags', 'plain untouched');
  assert(stripThinkingMarkup(`before <tool name="x">{"a":1}</tool>`) === 'before', 'call cut, prose kept');
  assert(stripThinkingMarkup('a\n\n\n\nb') === 'a\n\nb', 'blank runs collapsed');
}
console.log('lokma-message.test.ts: REQ-124 thinking-strip checks passed');

// REQ-139 — compact reasoning preview (Hermes `_emit_reasoning_preview` parity).
{
  const multi = reasoningPreview('one\ntwo\n\nthree\n\nfour\n\nfive\n\nsix\n\nseven');
  assert(multi.lines.length === 5, 'preview keeps at most five lines');
  assert(multi.more === 1, 'the cut remainder is reported');
  assert(multi.lines[0] === 'one two', 'a paragraph collapses to one wrapped line');
  assert(multi.lines[1] === 'three', 'paragraphs keep their order');

  const short = reasoningPreview('just one thought');
  assert(short.more === 0 && short.lines.length === 1, 'a short trace is shown whole');

  const capped = reasoningPreview('a\n\nb\n\nc', 2);
  assert(capped.lines.length === 2 && capped.more === 1, 'the cap is a parameter');

  assert(reasoningPreview('   \n\n  \n\n').lines.length === 0, 'blank-only reasoning yields no lines');
}
console.log('lokma-message.test.ts: REQ-139 reasoning-preview checks passed');

// REQ-176 — GFM tables: header + delimiter decide, body rows pad/drop to the
// header width, `\|` stays inside a cell, and half-streamed tables stay prose.
{
  const t = parseMarkdownBlocks('| Katman | Ne çıktı |\n|--------|----------|\n| UI | tablo |\n| API | json |');
  assert(t.length === 1 && t[0].kind === 'table', `table parses as one block, got ${t.length} blocks`);
  const tb = t[0] as { header: string[]; aligns: string[]; rows: string[][] };
  assert(tb.header.join(',') === 'Katman,Ne çıktı', `header cells parsed, got ${tb.header.join(',')}`);
  assert(tb.aligns.join(',') === 'left,left', 'default alignment is left');
  assert(tb.rows.length === 2 && tb.rows[1].join(',') === 'API,json', 'body rows parsed');

  const al = parseMarkdownBlocks('| a | b | c |\n|---|:---:|---:|\n| 1 | 2 | 3 |')[0] as { aligns: string[] };
  assert(al.aligns.join(',') === 'left,center,right', `alignment variants parsed, got ${al.aligns.join(',')}`);

  const pad = parseMarkdownBlocks('| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |')[0] as { rows: string[][] };
  assert(pad.rows.length === 2 && pad.rows[0].join('|') === '1|', 'missing cells pad empty');
  assert(pad.rows[1].join('|') === '1|2', 'extra cells are dropped');

  const inline = parseMarkdownBlocks('| **b** | `c` |\n|---|---|\n| x | [l](/u) |')[0] as { header: string[] };
  assert(inline.header[0] === '**b**' && inline.header[1] === '`c`', 'cell markup reaches the inline renderer');

  const BS = String.fromCharCode(92);
  const esc = parseMarkdownBlocks('| a ' + BS + '| b | c |\n|---|---|\n| 1 | 2 |')[0] as { header: string[] };
  assert(esc.header.join(',') === 'a | b,c', `escaped pipe stays inside the cell, got ${esc.header.join(',')}`);

  const two = parseMarkdownBlocks('| a |\n|---|\n| 1 |\n\n| b |\n|---|\n| 2 |');
  assert(two.length === 2 && two[0].kind === 'table' && two[1].kind === 'table', 'consecutive tables stay separate');

  const after = parseMarkdownBlocks('| a |\n|---|\n| 1 |\nplain tail');
  assert(after.length === 2 && after[0].kind === 'table' && after[1].kind === 'p', 'table ends at a pipeless line');

  const solo = parseMarkdownBlocks('| a | b |');
  assert(solo.length === 1 && solo[0].kind === 'p', 'a lone pipe line stays prose (no crash)');

  const stream = parseMarkdownBlocks('| a | b |\n|---|');
  assert(stream.length === 1 && stream[0].kind === 'p', 'half-streamed delimiter stays prose until complete');

  const grow = parseMarkdownBlocks('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |')[0] as { kind: string; rows: string[][] };
  assert(grow.kind === 'table' && grow.rows.length === 2, 'body rows keep appending while streaming');

  const single = parseMarkdownBlocks('| Name |\n|---|\n| Lokma |')[0] as { kind: string; header: string[] };
  assert(single.kind === 'table' && single.header[0] === 'Name', 'single-column table works');

  const mismatch = parseMarkdownBlocks('| a | b |\n|---|')[0];
  assert(mismatch.kind === 'p', 'delimiter cell-count mismatch is not a table');

  const badAlign = parseMarkdownBlocks('| a |\n|:|')[0];
  assert(badAlign.kind === 'p', 'colon-only delimiter rejected');

  assert(splitTableRow('| x | y |').cells.join(',') === 'x,y', 'splitTableRow strips outer pipes');
  assert(splitTableRow('x | y').cells.join(',') === 'x,y', 'splitTableRow handles pipeless edges');
  assert(parseTableAlign('|---|---|') !== null && parseTableAlign('nope') === null, 'parseTableAlign validates');
}
console.log('lokma-message.test.ts: REQ-176 table checks passed');

// REQ-184 — intraword `_x_` must survive the inline pass. CommonMark flanking:
// an opening `_` may not follow a word char, a closing `_` may not precede one.
// `__init__` (double underscore) is not strong emphasis in this renderer and
// stays literal — documented behavior, tested here.
{
  const inline = (text: string): string =>
    renderToStaticMarkup(createElement(Fragment, null, ...renderInline(text, 'x')));
  assert(inline('foo_bar_baz') === 'foo_bar_baz', 'intraword pair stays literal');
  assert(inline('Session sess_a_b created') === 'Session sess_a_b created', 'session-id form renders exact');
  assert(inline('_lorem_') === '<em>lorem</em>', 'bare pair is still italic');
  assert(inline('a _b_ c') === 'a <em>b</em> c', 'mid-sentence pair is still italic');
  assert(inline('__init__') === '__init__', 'double underscore stays literal (documented)');
  assert(inline('**bold**') === '<strong class="font-semibold">bold</strong>', 'bold unchanged');
  assert(inline('*star*') === '<em>star</em>', 'star italic unchanged');
  assert(
    inline('`a_b_c`') ===
      '<code class="rounded border border-line bg-muted px-1 py-px font-mono text-[12px] dark:bg-[#1E1E21]">a_b_c</code>',
    'code span content untouched',
  );
  const link = inline('[l](/u)');
  assert(link.indexOf('href="/u"') !== -1 && link.slice(-6) === '>l</a>', 'link unchanged');
  assert(inline('~~s~~') === '<del class="text-zinc-500">s</del>', 'strike unchanged');
}
console.log('lokma-message.test.ts: REQ-184 intraword-underscore checks passed');
