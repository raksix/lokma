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
}

console.log(`\nparse probe: ${passed} passed`);
