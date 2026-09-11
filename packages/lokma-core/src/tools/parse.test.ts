/**
 * Live probe for `./parse` (model-emitted `<tool>`/`<ask>` blocks).
 * Run: `bun src/tools/parse.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Pure string logic (no HOME, no network, no processes).
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import {
  buildToolSystemPrompt,
  createBlockFilter,
  parseAskBlocks,
  parseToolBlocks,
  stripModelBlocks,
} from './parse';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

// ─── Paired + self-closing parsing ───────────────────────────────────────────
{
  const calls = parseToolBlocks('Here <tool name="read_file">{"path": "a.ts"}</tool> done');
  assert(calls.length === 1, 'one paired block parsed');
  assert(calls[0]?.tool === 'read_file', 'tool name parsed');
  assert((calls[0]?.input as { path: string }).path === 'a.ts', 'JSON body parsed');
  assert(calls[0]?.parseError === undefined, 'no parse error on valid JSON');
}
{
  const calls = parseToolBlocks('<tool name="list_files" />');
  assert(calls.length === 1 && calls[0]?.tool === 'list_files', 'self-closing parsed');
  assert(JSON.stringify(calls[0]?.input) === '{}', 'self-closing means empty input');
}
{
  const calls = parseToolBlocks('<tool name="x">{oops</tool>');
  assert(calls.length === 1, 'malformed body still yields a call');
  assert(calls[0]?.input === undefined, 'malformed body input undefined');
  assert(typeof calls[0]?.parseError === 'string', 'malformed body carries parseError');
}
{
  const calls = parseToolBlocks('<tool>{"path":"a"}</tool>');
  assert(calls.length === 1 && calls[0]?.tool === '', 'missing name yields empty tool');
  assert(typeof calls[0]?.parseError === 'string', 'missing name carries parseError');
}
{
  const calls = parseToolBlocks('no blocks here <b>bold</b>');
  assert(calls.length === 0, 'unrelated markup ignored');
}
{
  const calls = parseToolBlocks('<tool name="a">{}</tool> mid <tool name="b">{"x":1}</tool>');
  assert(calls.length === 2 && calls[1]?.tool === 'b', 'two blocks both parsed');
}

// ─── Ask parsing ─────────────────────────────────────────────────────────────
{
  const asks = parseAskBlocks('<ask question="Go?">yes|no</ask>');
  assert(asks.length === 1, 'one ask parsed');
  assert(asks[0]?.question === 'Go?', 'ask question parsed');
  assert(JSON.stringify(asks[0]?.choices) === '["yes","no"]', 'ask choices split');
}
{
  const asks = parseAskBlocks('<ask question="Which?" />');
  assert(asks.length === 1 && asks[0]?.choices === undefined, 'free-text ask has no choices');
}
{
  const mixed = parseToolBlocks('<ask question="q?">a</ask>');
  assert(mixed.length === 0, 'ask blocks are not tool calls');
  assert(parseAskBlocks('<tool name="a">{}</tool>').length === 0, 'tool blocks are not asks');
}

// ─── Stripping ───────────────────────────────────────────────────────────────
{
  const clean = stripModelBlocks('Answer <tool name="a">{}</tool> tail');
  assert(clean === 'Answer  tail' || clean === 'Answer tail', `blocks stripped, got: ${clean}`);
  assert(!clean.includes('<tool'), 'no block markup remains');
}

// ─── Incremental filter (chunk-split blocks) ─────────────────────────────────
{
  const f = createBlockFilter();
  let out = '';
  out += f.push('Hello <tool name="rea');
  assert(out === 'Hello ', `pre-block text forwarded, got: ${JSON.stringify(out)}`);
  out += f.push('d_file">{"path":');
  assert(out === 'Hello ', 'partial block held back');
  out += f.push(' "a.ts"}</tool> bye');
  const end = f.finish();
  assert(out + end.tail === 'Hello  bye', `block suppressed from display, got: ${JSON.stringify(out + end.tail)}`);
  assert(end.toolCalls.length === 1, 'split block parsed after close');
  assert((end.toolCalls[0]?.input as { path: string }).path === 'a.ts', 'split JSON body intact');
}
{
  // Plain prose with `<` flows through (fail-open, small delay only).
  const f = createBlockFilter();
  const a = f.push('a < b and ');
  const end = f.finish();
  assert(a + end.tail === 'a < b and ', 'prose angle bracket passes through');
  assert(end.toolCalls.length === 0, 'prose yields no calls');
}
{
  // 1-char torture slices incl. a split closing tag (`</to` + `ol>`).
  const text = 'A <tool name="list_files">{"path": "."}</tool> B <ask question="Q?">x|y</ask> C';
  const f = createBlockFilter();
  let out = '';
  for (const ch of text) out += f.push(ch);
  const end = f.finish();
  assert(out + end.tail === 'A  B  C', `1-char slices stay clean, got: ${JSON.stringify(out + end.tail)}`);
  assert(end.toolCalls.length === 1 && end.toolCalls[0]?.tool === 'list_files', '1-char tool call parsed');
  assert(end.asks.length === 1 && end.asks[0]?.question === 'Q?', '1-char ask parsed');
}
{
  // Never-closing `<tool` must not swallow the chat.
  const f = createBlockFilter();
  const a = f.push('<tool name="x" ' + 'y'.repeat(9000));
  const end = f.finish();
  assert((a + end.tail).length > 8000, 'unclosed block fails open');
}
{
  // Ask block via the filter.
  const f = createBlockFilter();
  const shown = f.push('Wait <ask question="Go?">yes|no</ask> ok');
  const end = f.finish();
  assert(end.asks.length === 1 && end.asks[0]?.question === 'Go?', 'ask parsed incrementally');
  assert(shown + end.tail === 'Wait  ok', `ask suppressed from display, got: ${JSON.stringify(shown + end.tail)}`);
}

// ─── System prompt ───────────────────────────────────────────────────────────
{
  const sys = buildToolSystemPrompt([
    { name: 'read_file', description: 'Read a file' },
    { name: 'run_command', description: 'Run a binary' },
  ]);
  assert(sys.includes('read_file: Read a file'), 'tool listed with description');
  assert(sys.includes('<tool name="read_file">'), 'syntax example present');
  assert(sys.includes('<ask question='), 'ask syntax documented');
  assert(sys.includes('ONLY <tool name='), 'single tag shape enforced');
}

// ─── REQ-071: big tool blocks survive the filter ─────────────────────────────
{
  // A 20KB write_file body must parse (the old 8KB cap swallowed it as text).
  const big = 'x'.repeat(20_000);
  const f = createBlockFilter();
  const shown = f.push(`Intro <tool name="write_file">{"path": "a.html", "content": "${big}"}</tool>`);
  const end = f.finish();
  assert(end.toolCalls.length === 1 && end.toolCalls[0]?.tool === 'write_file', '20KB tool block parsed');
  assert(shown.includes('Intro'), 'leading text streams while block buffers');
  assert(!(end.tail.includes('<tool')), 'block markup never leaks to chat');
}

// ─── REQ-115: sloppy-model salvage (mimo writes XML args + </tool_result>) ───
{
  const calls = parseToolBlocks('<tool name="list_files">\n<dir>Docs/refactor</dir>\n</tool_result>');
  assert(calls.length === 1, 'tool_result-closed block parsed');
  assert(calls[0]?.tool === 'list_files', 'tool name kept');
  assert((calls[0]?.input as { path: string }).path === 'Docs/refactor', 'XML <dir> salvaged + aliased to path');
  assert(calls[0]?.parseError === undefined, 'salvaged call has no parseError');
}
{
  const f = createBlockFilter();
  f.push('Checking <tool name="list_files"><dir>Docs</dir>');
  const end = f.finish();
  assert(end.toolCalls.length === 0, 'unclosed block without closer stays text (no phantom call)');
}
{
  const calls = parseToolBlocks('<tool name="x">{oops</tool_result>');
  assert(calls.length === 1 && calls[0]?.input === undefined, 'unsalvageable tool_result body still malformed');
}

// ─── REQ-119: DeepSeek DSML invokes (fullwidth U+FF5C pipes) ───
{
  const FW = String.fromCharCode(0xff5c);
  const D = `${FW}${FW}DSML${FW}${FW}`;
  const dsml = `<${D} calls>\n<${D} invoke name="list_files">\n{"path": "Docs"}<${D} parameter>\n</${D} invoke>\n</${D} calls>`;
  const calls = parseToolBlocks(dsml);
  assert(calls.length === 1, 'DSML invoke parsed');
  assert(calls[0]?.tool === 'list_files', 'DSML tool name kept');
  assert((calls[0]?.input as { path: string }).path === 'Docs', 'DSML JSON args kept');
  assert(calls[0]?.parseError === undefined, 'DSML call has no parseError');
}
{
  const FW = String.fromCharCode(0xff5c);
  const D = `${FW}${FW}DSML${FW}${FW}`;
  const f = createBlockFilter();
  const shown = f.push(`Thinking out loud <${D} invoke name="read_file">{"path": "a.ts"}</${D} invoke> done`);
  const end = f.finish();
  assert(end.toolCalls.length === 1 && end.toolCalls[0]?.tool === 'read_file', 'DSML parsed incrementally');
  assert(shown.includes('Thinking') && shown.includes('done'), 'text around DSML streams');
  assert(!shown.includes('DSML'), 'DSML markup never shown');
}
{
  // calls-wrapper open/close must not leak as chat text (live DeepSeek shape).
  const FW = String.fromCharCode(0xff5c);
  const D = `${FW}${FW}DSML${FW}${FW}`;
  const f = createBlockFilter();
  const shown = f.push(`<${D} calls>\n`);
  const shown2 = f.push(`<${D} invoke name="list_files">\n{"path": "Docs"}<${D} parameter>\n</${D} invoke>\n</${D} calls>`);
  const end = f.finish();
  assert(end.toolCalls.length === 1, 'wrapped DSML invoke parsed');
  assert(!((shown + shown2 + end.tail).includes('DSML')), 'wrapper markup never leaks');
}

// ─── REQ-122: stream marks record visible offsets for persist order ───
{
  const f = createBlockFilter();
  const shown = f.push('Intro <tool name="read_file">{"path": "a.ts"}</tool> mid <tool name="list_files" /> tail');
  const end = f.finish();
  assert(end.toolCalls.length === 2, 'two calls parsed');
  assert(end.marks.length === 2, 'two stream marks recorded');
  assert(end.marks[0]?.at === 'Intro '.length, 'first mark at visible offset');
  assert(end.marks[1]?.at === ('Intro '.length + ' mid '.length), 'second mark after mid text');
  assert(shown + end.tail === 'Intro  mid  tail', 'visible text excludes blocks');
}

// ─── REQ-115b: <tool_call> shape + fake-result stripping (roleplay guard) ───
{
  const calls = parseToolBlocks('<tool_call>\n{"name": "read_file", "arguments": {"path": "a.ts"}}\n</tool_call>');
  assert(calls.length === 1, 'tool_call shape parsed');
  assert(calls[0]?.tool === 'read_file', 'tool_call name kept');
  assert((calls[0]?.input as { path: string }).path === 'a.ts', 'tool_call arguments kept');
}
{
  const f = createBlockFilter();
  const shown = f.push('Hi <tool_call>{"name": "list_files", "args": {"path": "."}}</tool_call> mid ');
  const end = f.finish();
  assert(end.toolCalls.length === 1 && end.toolCalls[0]?.tool === 'list_files', 'tool_call parsed incrementally');
  assert(shown.includes('Hi') && shown.includes('mid'), 'text around tool_call streams');
  assert(!shown.includes('tool_call'), 'tool_call markup never shown');
}
{
  const f = createBlockFilter();
  const shown = f.push('A <tool_result tool="x" id="1">fake output</tool_result> B');
  const end = f.finish();
  assert(end.toolCalls.length === 0, 'fake result yields no call');
  assert(!((shown + end.tail).includes('fake output')), 'fake result text never shown');
  assert((shown + end.tail).includes('A') && (shown + end.tail).includes('B'), 'surrounding text survives');
}

// ─── REQ-122: stream-order marks (persist order) ───
{
  const f = createBlockFilter();
  const s1 = f.push('Hello ');
  f.push('<tool name="list_files">{}</tool>');
  const s3 = f.push(' mid ');
  const s4 = f.push('<tool name="read_file">{"path": "a.ts"}</tool> end');
  const end = f.finish();
  assert(end.toolCalls.length === 2, 'two streamed calls parsed');
  assert(end.marks.length === 2, 'one mark per tool block');
  assert(end.marks[0]?.at === 6, 'first mark at visible offset of first block');
  assert(end.marks[1]?.at === 11, 'second mark at visible offset of second block');
  assert((end.marks[0]?.at ?? 0) <= (end.marks[1]?.at ?? -1), 'marks non-decreasing');
  assert((s1 + s3 + s4 + end.tail).includes('Hello') && (s1 + s3 + s4 + end.tail).includes('end'), 'text around marked blocks streams');
}

console.log(`\nparse probe: ${passed} passed`);
