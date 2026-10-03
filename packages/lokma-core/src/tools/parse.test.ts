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

// ─── REQ-134: the `<ask>` shapes models actually emit ────────────────────────
{
  // Choices on an attribute, no body — the exact shape seen in the screenshot.
  const asks = parseAskBlocks(
    '<ask question="Nereden devam edelim?" choices="sayfayı iyileştir|metinleri düzelt|özellik ekle|öneri listesi ver">',
  );
  assert(asks.length === 1, 'bodyless attribute ask is parsed');
  assert(asks[0]?.question === 'Nereden devam edelim?', 'attribute ask keeps the question');
  assert(asks[0]?.choices?.length === 4, `attribute ask splits pipe choices, got ${JSON.stringify(asks[0]?.choices)}`);
}
{
  // Closed but bodyless — the attribute must still carry the options.
  const asks = parseAskBlocks('<ask question="Q?" choices="x|y"></ask>');
  assert(asks.length === 1 && asks[0]?.choices?.length === 2, 'closed bodyless ask keeps attribute choices');
}
{
  // JSON array body tolerance.
  const asks = parseAskBlocks('<ask question="Q?">["a","b"]</ask>');
  assert(JSON.stringify(asks[0]?.choices) === '["a","b"]', 'JSON array body is accepted');
}
{
  // Unclosed body still yields question + choices.
  const asks = parseAskBlocks('Hazırım <ask question="Devam?">evet|hayır');
  assert(asks.length === 1 && asks[0]?.choices?.length === 2, 'unclosed ask body still offers choices');
}
{
  // The dangling sweep must not double-count a proper closed block.
  const asks = parseAskBlocks('<ask question="Q?">a|b</ask>');
  assert(asks.length === 1, `closed ask counted once, got ${asks.length}`);
}
{
  // Display/storage strip handles the unclosed shape too.
  const stripped = stripModelBlocks('Merhaba <ask question="Q?" choices="a|b">');
  assert(stripped === 'Merhaba', `strip removes an unclosed ask, got ${JSON.stringify(stripped)}`);
}

{
  // REQ-134 stream shape: a one-line `<ask …>` with no closing tag must be
  // swallowed live (not shown) and surface as a question.
  const f = createBlockFilter();
  let shown = '';
  shown += f.push('Şu an ortada bir talimat yok.\n');
  shown += f.push('<ask question="Nereden devam edelim?" choices="a|b|c">\n');
  shown += f.push('devam eden metin');
  const end = f.finish();
  const visible = shown + end.tail;
  assert(!visible.includes('<ask'), `dangling ask never shows, got ${JSON.stringify(visible)}`);
  assert(end.asks.length === 1, `dangling ask surfaced as a question, got ${end.asks.length}`);
  assert(end.asks[0]?.choices?.length === 3, `dangling ask kept its choices, got ${JSON.stringify(end.asks[0]?.choices)}`);
  assert(visible.includes('devam eden metin'), 'text after the ask line stays visible');
}
{
  // End-of-stream with no trailing newline must not leak either.
  const f = createBlockFilter();
  const shown = f.push('tamam <ask question="Q?" choices="x|y">');
  const end = f.finish();
  assert(!(shown + end.tail).includes('<ask'), `trailing dangling ask never shows, got ${JSON.stringify(shown + end.tail)}`);
  assert(end.asks.length === 1 && end.asks[0]?.choices?.length === 2, 'trailing dangling ask surfaced');
}

// ─── REQ-183: dangling bodyless <tool> salvage + dual-channel drop ───
{
  // The measured leak shape: the model wrote a bodyless opener and the
  // stream ended — the call it meant to make, recovered with empty input.
  const f = createBlockFilter();
  const shown = f.push('I will look at the workspace. <tool name="list_files">');
  const end = f.finish();
  assert(end.toolCalls.length === 1 && end.toolCalls[0]?.tool === 'list_files', 'trailing bodyless opener salvaged');
  assert(JSON.stringify(end.toolCalls[0]?.input) === '{}', 'salvaged call runs with empty input');
  assert(!(shown + end.tail).includes('<tool'), 'dangling markup never leaks');
  assert((shown + end.tail).includes('I will look at the workspace.'), 'leading text stays visible');
}
{
  // Chunk-split torture: the opener arrives across pushes with a newline.
  const f = createBlockFilter();
  let shown = '';
  shown += f.push('Checking now');
  shown += f.push('\n<tool name="list');
  shown += f.push('_files">\n');
  const end = f.finish();
  assert(end.toolCalls.length === 1 && end.toolCalls[0]?.tool === 'list_files', 'split dangling opener salvaged');
  assert(!(shown + end.tail).includes('<tool'), 'split dangling markup never leaks');
}
{
  // A half-written body is not a call — stays text (fail-open, no phantom).
  const f = createBlockFilter();
  const shown = f.push('Writing <tool name="write_file">{"path": "a.ts"');
  const end = f.finish();
  assert(end.toolCalls.length === 0, 'half-written body yields no call');
  assert((shown + end.tail).includes('<tool'), 'half-written markup stays text');
}
{
  // Dual channel: native calls already carried the turn — the leftover
  // markup is dropped, never executed as a phantom second call.
  const f = createBlockFilter();
  const shown = f.push('I will list the files. ');
  f.push('<tool name="memory_read">');
  const end = f.finish({ haveNativeCalls: true });
  assert(end.toolCalls.length === 0, 'native-carried turn yields no phantom call');
  assert(!(shown + end.tail).includes('<tool'), 'leftover markup dropped with native calls');
  assert((shown + end.tail).trim() === 'I will list the files.', 'text before the leftover survives');
}
{
  // Bare <tool fragment (stream cut mid-opener) is dropped in the native case too.
  const f = createBlockFilter();
  const shown = f.push('working <tool');
  const end = f.finish({ haveNativeCalls: true });
  assert(!(shown + end.tail).includes('<tool'), 'bare fragment dropped with native calls');
}
{
  // The salvaged call carries a stream mark so persist order stays intact.
  const f = createBlockFilter();
  let shown = '';
  shown += f.push('Intro <tool name="read_file">{"path": "a.ts"}</tool> mid');
  shown += f.push(' ... <tool name="list_files">');
  const end = f.finish();
  const visible = shown + end.tail;
  assert(end.toolCalls.length === 2, 'complete plus salvaged calls both parsed');
  assert(end.marks.length === 2 && end.marks[1]?.at === visible.length, 'salvage mark sits at end of visible text');
}

// ─── REQ-196: space-bunny-alpha's junk-wrapped XML args never execute ───
// Observed live: the model emitted
// `<tool name="write_file">]<]minimax[>[<path>x.html]<]minimax[>[</path>…`
// so the salvage matched only the payload's own leaf tags, returned `{}`,
// and write_file ran with NO input — nothing written, markup dumped in chat.
{
  const HTML = '<!DOCTYPE html>\n<html lang="tr">\n<head><meta charset="utf-8"><title>T</title></head>\n<body><h1>Merhaba</h1></body>\n</html>';
  const broken =
    '<tool name="write_file">]<]minimax[>[<path>duman-tarifi.html]<]minimax[>[</path>]<]minimax[>[<content>' +
    HTML +
    ']<]minimax[>[</content>]<]minimax[>[</tool>';
  const calls = parseToolBlocks(broken);
  assert(calls.length === 1, 'junk-wrapped block still parses as ONE call');
  assert(calls[0]?.tool === 'write_file', 'tool name survives the junk wrapper');
  assert(calls[0]?.parseError === undefined, 'the salvaged call has no parseError');
  const input = (calls[0]?.input ?? {}) as { path?: string; content?: string };
  assert(input.path === 'duman-tarifi.html', `path is a clean filename (got ${JSON.stringify(input.path)})`);
  assert(typeof input.content === 'string' && input.content.startsWith('<!DOCTYPE'), 'content keeps its real first bytes');
  assert(/<h1>Merhaba<\/h1>/.test(input.content ?? ''), 'the html payload survives intact');
  assert(!/minimax|]\[<]/.test(input.path ?? ''), 'no wrapper residue is left in path');
  assert(input.content === HTML, 'content is byte-identical to the html the model sent');
  // Payloads whose own bytes look like the residue must survive it.
  const keep: [string, string][] = [
    ['read_file', 'a[1].txt'],
    ['write_file', '[1,2,3]'],
    ['write_file', '{"a":1}'],
    ['write_file', 'a{color:red}'],
  ];
  for (const [tool, payload] of keep) {
    const r = parseToolBlocks(
      `<tool name="${tool}">]<]minimax[>[<path>p.txt</path>]<]minimax[>[<content>${payload}</content>]<]minimax[>[</tool>`,
    );
    assert(
      ((r[0]?.input ?? {}) as { content?: string }).content === payload,
      `a payload of ${payload} survives the residue strip`,
    );
  }
  // The html must NOT be edge-trimmed: a clean file starts with `<` and ends with `>`.
  const cleanPayload = '<tool name="write_file"><path>a.html</path><content>' + HTML + '</content></tool>';
  const clean = parseToolBlocks(cleanPayload);
  const cleanInput = (clean[0]?.input ?? {}) as { path?: string; content?: string };
  assert(cleanInput.content === HTML, 'a payload with no junk is never edge-trimmed');
  assert(cleanInput.path === 'a.html', 'a clean path is untouched');
  // And a path that legitimately ends in a bracket-ish char survives.
  const odd = parseToolBlocks('<tool name="read_file">]<]minimax[>[<path>a[1].txt]<]minimax[>[</path>]<]minimax[>[</tool>');
  assert(((odd[0]?.input ?? {}) as { path?: string }).path === 'a[1].txt', 'a real bracketed filename is not eaten');
}

// ─── REQ-196b: the real failing shape — junk args AND a junk closer ───
// Captured from the live transcript: the model opened `<tool name="write_file">`
// and closed it with `</tool_call>` (a zero-width char inside the tag).
// COMPLETE_BLOCK required `</tool>` or `</tool_result>`, so a 20 KB write
// markup matched NOTHING, streamed through as chat text, and no file landed.
{
  const HTML_BIG = `<!DOCTYPE html>\n<html lang="tr">\n<head><meta charset="utf-8"><title>T</title></head>\n<body>${'<div class="r">satır</div>\n'.repeat(40)}</body>\n</html>\n`;
  const ZW = String.fromCharCode(0x200b);
  const J = `]${ZW}minimax[>[`;
  const real =
    '<tool name="write_file">\n<path>live-junk-test.html' + J + '</path>' + J + '<content>' +
    HTML_BIG +
    J + '</content>' + J + J + `</${ZW}tool_call>`;
  const calls = parseToolBlocks(real);
  assert(calls.length === 1, 'the zero-width tool_call closer still closes the block');
  assert(calls[0]?.tool === 'write_file', 'tool name survives the junk closer');
  assert(calls[0]?.parseError === undefined, 'no parseError on the real shape');
  const input = (calls[0]?.input ?? {}) as { path?: string; content?: string };
  assert(input.path === 'live-junk-test.html', `path is clean (got ${JSON.stringify(input.path)})`);
  assert(input.content === HTML_BIG, `the whole ${HTML_BIG.length}-byte payload survives (got ${input.content?.length ?? 0})`);
  // The stream filter must consume the block too, not just the regex parser.
  const f = createBlockFilter();
  const shown = f.push(real);
  const end = f.finish();
  assert(end.toolCalls.length === 1, 'the stream filter salvages the real shape as a call');
  assert((shown + end.tail).trim() === '', 'the markup never reaches the chat');
  // A plain `</tool>` closer and a `</tool_result>` closer keep working.
  for (const closer of ['</tool>', '</tool_result>']) {
    const ok = parseToolBlocks(`<tool name="list_files"><dir>Docs</dir>${closer}`);
    assert(ok.length === 1 && ((ok[0]?.input ?? {}) as { path?: string }).path === 'Docs', `${closer} still parses`);
  }
}

console.log(`\nparse probe: ${passed} passed`);
