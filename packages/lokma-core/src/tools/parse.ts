/**
 * Model-emitted tool/ask blocks — the wire format the agent loop parses.
 *
 * Models without native function-calling still drive tools through these
 * text blocks (ReAct-style, works with every provider adapter):
 *
 *   <tool name="read_file">{"path": "src/index.ts"}</tool>
 *   <tool name="list_files" />
 *   <ask question="Deploy now?">yes|no|later</ask>
 *   <ask question="Which region?" />
 *
 * Rules: `name` is required; the paired body must be a single JSON value
 * (usually an object — validated later by the tool's Zod schema, never
 * here); self-closing means empty input `{}`. `<ask>` without a body is a
 * free-text question, with a `a|b|c` body offers choices. Unknown tags
 * pass through untouched — only `tool`/`ask` are structural.
 * The server relays streamed text through `createBlockFilter()` so block
 * markup never reaches the chat surface; parsed calls come back as WS
 * `tool_start`/`tool_result`/`permission_request`/`ask_user_question`
 * frames via the executor instead.
 * See Docs/30 section agent tools + Docs/22 section permissions.
 */

export type ParsedToolCall = {
  tool: string;
  /** Parsed JSON body, `{}` for self-closing, `undefined` when unparseable. */
  input: unknown;
  /** Set when the body is not valid JSON — the loop reports it honestly. */
  parseError?: string;
  /**
   * Gateway call id for native function calls (REQ-118 FAZ B.2) — carried
   * so the next turn can answer with `function_call_output`. Text-parsed
   * calls leave it unset and the loop mints an id instead.
   */
  nativeCallId?: string;
  /**
   * REQ-128: the raw JSON argument string the gateway streamed. Replayed
   * byte-identical in the next turn's `assistant.tool_calls[]` — some
   * upstreams reject a re-serialized argument object.
   */
  nativeArgs?: string;
};

/** Where one tool block sat in the visible stream (REQ-122: persist order). */
export type StreamMark = {
  /** Visible chars emitted before the block (offset into the turn text). */
  at: number;
};

export type ParsedAsk = {
  question: string;
  choices?: string[];
};

/**
 * Max buffered tail kept while waiting for a block to close (fail-open).
 * REQ-071: 8KB silently dropped every real file write (a landing page is
 * 30KB+) — the block streamed through as chat text and nothing was ever
 * executed. 256KB covers generated files; anything bigger still fail-opens
 * instead of hanging the stream.
 */
export const BLOCK_FILTER_BUFFER_CAP = 262_144;

const COMPLETE_BLOCK =
  /<(tool|ask)\b([^>]*?)(\/>|>([\s\S]*?)<\/(?:\1|tool_result)\s*>)/g;

/** Legacy `<tool_call>{"name","arguments"}</tool_call>` shape (also model-slop). */
const TOOL_CALL_BLOCK = /<tool_call\s*>([\s\S]*?)<\/tool_call\s*>/g;

/**
 * DeepSeek DSML tool calls (v4.1-flash emits these, often inside
 * `reasoning_content`, never as `<tool>`). Delimiter pipes are FULLWIDTH
 * VERTICAL BAR, built via fromCharCode so no u-escapes are needed. Tolerant:
 * invoke-level matching, inner DSML tags (`parameter`, …) stripped before
 * JSON parse. REQ-119.
 */
const FW_BAR = String.fromCharCode(0xff5c);
const DSML_D = `${FW_BAR}${FW_BAR}DSML${FW_BAR}${FW_BAR}`;
const DSML_INVOKE_BLOCK = new RegExp(
  `<${DSML_D} invoke\\b([^>]*?)>([\\s\\S]*?)<\\/${DSML_D} invoke\\s*>`,
  'g',
);
const DSML_TAG = new RegExp(`<\\/?${DSML_D}[^>]*>`, 'g');

/** DSML calls-wrapper open/close (pure markup, never content). REQ-119. */
const DSML_CALLS_TAG = new RegExp(`<\\/?${DSML_D} calls\\s*>`, 'g');

/** Parse one DSML `<invoke name="x">…</invoke>` match into a call (never throws). */
function toDsmlCall(attrs: string, body: string): ParsedToolCall {
  const tool = (attr(attrs, 'name') ?? '').trim();
  if (!tool) return { tool: '', input: undefined, parseError: 'DSML invoke is missing name' };
  const jsonText = body.replace(DSML_TAG, '').trim();
  if (!jsonText) return { tool, input: {} };
  try {
    return { tool, input: JSON.parse(jsonText) as unknown };
  } catch {
    const salvaged = salvageXmlArgs(jsonText);
    if (salvaged) return { tool, input: salvaged };
    return { tool, input: undefined, parseError: 'DSML arguments are not valid JSON' };
  }
}

/** Strip DSML markup (used on thinking deltas so tool calls show once, as rows). */
export function stripDsmlBlocks(text: string): string {
  return text.replace(DSML_TAG, '');
}

/** Common wrong arg names sloppy models emit — normalized before validation. */
const ARG_ALIASES: Record<string, string> = {
  dir: 'path',
  file: 'path',
  filepath: 'path',
  filename: 'path',
  cmd: 'command',
};

/** Salvage `<key>value</key>` children (sloppy-model XML args) into an object. */
function salvageXmlArgs(body: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  const re = /<([A-Za-z_][\w.-]*)\s*>([^<>]*)<\/\1\s*>/g;
  let m: RegExpExecArray | null;
  for (;;) {
    m = re.exec(body);
    if (!m) break;
    const raw = (m[1] ?? '').toLowerCase();
    const key = ARG_ALIASES[raw] ?? raw;
    if (!(key in out)) out[key] = (m[2] ?? '').trim();
  }
  return Object.keys(out).length ? out : null;
}

function attr(source: string, name: string): string | null {
  const m = source.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`));
  return m ? (m[1] ?? null) : null;
}

/** Parse one complete `<tool ...>` match into a call (never throws). */
function toToolCall(attrs: string, body: string | undefined, selfClosing: boolean): ParsedToolCall {
  const tool = (attr(attrs, 'name') ?? '').trim();
  if (!tool) return { tool: '', input: undefined, parseError: 'missing tool name' };
  if (selfClosing || body === undefined || !body.trim()) return { tool, input: {} };
  try {
    return { tool, input: JSON.parse(body) as unknown };
  } catch {
    // Sloppy-model salvage (REQ-115): `<dir>Docs</dir>` XML args → object.
    const salvaged = salvageXmlArgs(body);
    if (salvaged) return { tool, input: salvaged };
    return { tool, input: undefined, parseError: 'body is not valid JSON (use {"k": "v"})' };
  }
}

/** Split `a|b|c`, `["a","b"]` or `a, b` into clean choice labels (never throws). */
function toChoices(raw: string): string[] {
  const text = raw.trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((c) => String(c).trim()).filter((c) => c.length > 0);
      }
    } catch {
      /* fall through to pipe splitting */
    }
  }
  return text
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/**
 * Parse one `<ask …>` match (never throws). Completeness is the caller's
 * business: REQ-134 feeds unclosed blocks here too, because models routinely
 * drop the closing tag.
 */
function toAsk(attrs: string, body: string | undefined, selfClosing: boolean): ParsedAsk {
  const question = (attr(attrs, 'question') ?? attr(attrs, 'q') ?? '').trim();
  // REQ-134: models often put the options on an attribute instead of the body
  // — `<ask question="…" choices="a|b|c">` with nothing between the tags.
  const attrChoices = toChoices(attr(attrs, 'choices') ?? attr(attrs, 'options') ?? '');
  if (attrChoices.length > 0) return { question, choices: attrChoices };
  if (selfClosing || body === undefined || !body.trim()) return { question };
  const choices = toChoices(body);
  return choices.length ? { question, choices } : { question };
}

/** Parse one `<tool_call>{"name","arguments"}</tool_call>` legacy shape (never throws). */
function toToolCallShape(body: string): ParsedToolCall {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    const salvaged = salvageXmlArgs(body);
    if (salvaged && typeof salvaged.name === 'string') {
      const { name, ...rest } = salvaged as Record<string, string> & { name: string };
      const args = rest['arguments'] ?? rest['args'] ?? rest['input'];
      if (args !== undefined) {
        try {
          return { tool: name.trim(), input: JSON.parse(args) as unknown };
        } catch {
          return { tool: name.trim(), input: undefined, parseError: 'tool_call arguments are not valid JSON' };
        }
      }
      return { tool: name.trim(), input: rest };
    }
    return { tool: '', input: undefined, parseError: 'tool_call body is not valid JSON (use {"name": ..., "arguments": {...}})' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { tool: '', input: undefined, parseError: 'tool_call body must be an object' };
  }
  const rec = data as Record<string, unknown>;
  const tool = typeof rec['name'] === 'string' ? rec['name'].trim() : '';
  if (!tool) return { tool: '', input: undefined, parseError: 'tool_call is missing "name"' };
  const rawInput = rec['arguments'] ?? rec['args'] ?? rec['input'] ?? rec['parameters'] ?? {};
  if (typeof rawInput === 'string') {
    const salvaged = salvageXmlArgs(rawInput);
    return { tool, input: salvaged ?? undefined, ...(salvaged ? {} : { parseError: 'tool_call arguments are not valid JSON' }) };
  }
  return { tool, input: rawInput };
}

/** Model-roleplayed fake results — never valid model output, never shown. */
const FAKE_RESULT_BLOCK = /<tool_result\b[^>]*>([\s\S]*?)<\/tool_result\s*>/g;
const FAKE_RESULT_OPEN = /<tool_result\b[^>]*>?[\s\S]*$/;

/**
 * Parse every complete tool block in finished text.
 * Streaming callers prefer `createBlockFilter()` (same shapes, incremental).
 */
export function parseToolBlocks(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  for (const m of text.matchAll(COMPLETE_BLOCK)) {
    if (m[1] === 'tool') calls.push(toToolCall(m[2] ?? '', m[4], m[3] === '/>'));
  }
  for (const m of text.matchAll(TOOL_CALL_BLOCK)) {
    calls.push(toToolCallShape(m[1] ?? ''));
  }
  for (const m of text.matchAll(DSML_INVOKE_BLOCK)) {
    calls.push(toDsmlCall(m[1] ?? '', m[2] ?? ''));
  }
  return calls;
}

/** Unclosed `<ask …>` opener — REQ-134 (models drop the closing tag). */
const DANGLING_ASK = /<ask\b([^>]*?)\/?>/g;

/**
 * REQ-134: an `<ask …>` that owns a whole line and never closes — the shape
 * CommandCode/DeepSeek models actually emit. Matched only once the line ENDS,
 * and only when no `</ask>` follows on that line, so a properly closed block
 * still wins the race in `drain()`.
 */
const DANGLING_ASK_LINE = /<ask\b([^>]*?)>((?![^\n]*<\/ask>)[^\n]*)\n/g;

/**
 * Parse every ask block in finished text, closed or not.
 *
 * REQ-134: a bare `<ask question="…" choices="a|b|c">` with no `</ask>` is the
 * shape CommandCode/DeepSeek models actually emit, and the streaming filter
 * fail-opens it as chat text — this sweep is what turns it back into a real
 * question card.
 */
export function parseAskBlocks(text: string): ParsedAsk[] {
  const asks: ParsedAsk[] = [];
  const consumed: Array<[number, number]> = [];
  for (const m of text.matchAll(COMPLETE_BLOCK)) {
    if (m[1] !== 'ask') continue;
    asks.push(toAsk(m[2] ?? '', m[4], m[3] === '/>'));
    const at = m.index ?? 0;
    consumed.push([at, at + m[0].length]);
  }
  for (const m of text.matchAll(DANGLING_ASK)) {
    const at = m.index ?? 0;
    if (consumed.some(([start, end]) => at >= start && at < end)) continue;
    // An unclosed body can only be trusted for the rest of its own line —
    // anything further is prose that must stay visible.
    const restLine = (text.slice(at + m[0].length).split('\n', 1)[0] ?? '').trim();
    const body = restLine.includes('|') ? restLine : undefined;
    const ask = toAsk(m[1] ?? '', body, false);
    if (ask.question) asks.push(ask);
  }
  return asks;
}

/** Remove all complete tool/ask blocks (for stored transcripts + display). */
export function stripModelBlocks(text: string): string {
  return text
    .replace(FAKE_RESULT_BLOCK, '')
    .replace(TOOL_CALL_BLOCK, '')
    .replace(DSML_INVOKE_BLOCK, '')
    .replace(DSML_TAG, '')
    .replace(COMPLETE_BLOCK, '')
    // REQ-134: an unclosed `<ask …>` never matches COMPLETE_BLOCK; everything
    // from the opener on is block markup, not chat text.
    .replace(/<ask\b[^>]*>[\s\S]*$/, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * Incremental filter for live streams — chunk boundaries can split a block,
 * so complete blocks are held back until they close. `push()` returns only
 * the clean text safe to forward; `finish()` drains the tail plus the calls.
 * Fail-open: unclosed markup older than the buffer cap flows through as text.
 */
export function createBlockFilter(): {
  push(delta: string): string;
  finish(): { tail: string; toolCalls: ParsedToolCall[]; asks: ParsedAsk[]; marks: StreamMark[] };
} {
  let buffer = '';
  const toolCalls: ParsedToolCall[] = [];
  const asks: ParsedAsk[] = [];
  // REQ-122: visible offsets of matched tool blocks (persist order).
  const marks: StreamMark[] = [];
  let emitted = 0;

  function drain(force: boolean): string {
    let out = '';
    for (;;) {
      // All shapes compete by EARLIEST match index (REQ-119 lesson: a fixed
      // priority order lets a trailing markup drop flush a preceding complete
      // invoke as visible text before the invoke parser ever sees it).
      type Cand = { index: number; len: number; kind: 'fake' | 'callsTag' | 'tool' | 'toolCall' | 'dsml' | 'askLine'; m: RegExpExecArray };
      const cands: Cand[] = [];
      const take = (rx: RegExp, kind: Cand['kind']): void => {
        rx.lastIndex = 0;
        const m = rx.exec(buffer);
        if (m && m.index !== undefined) cands.push({ index: m.index, len: m[0].length, kind, m });
      };
      take(FAKE_RESULT_BLOCK, 'fake');
      take(DSML_CALLS_TAG, 'callsTag');
      take(COMPLETE_BLOCK, 'tool'); // kind refined below via m[1]
      take(TOOL_CALL_BLOCK, 'toolCall');
      take(DSML_INVOKE_BLOCK, 'dsml');
      take(DANGLING_ASK_LINE, 'askLine');
      if (!cands.length) break;
      cands.sort((a, b) => a.index - b.index);
      const win = cands[0]!;
      out += buffer.slice(0, win.index);
      buffer = buffer.slice(win.index + win.len);
      // A tool block sat here in the stream: record the visible offset
      // (preceding text already appended above, so out.length is the spot).
      if (win.kind === 'tool' || win.kind === 'toolCall' || win.kind === 'dsml') {
        marks.push({ at: emitted + out.length });
      }
      // Fake roleplayed results + DSML calls-wrapper tags are pure markup:
      // dropped silently (a `<tool>` block closed by `</tool_result>` still
      // parses via its own match).
      if (win.kind === 'fake' || win.kind === 'callsTag') continue;
      if (win.kind === 'tool') {
        // COMPLETE_BLOCK serves tool + ask (m[1] disambiguates).
        if (win.m[1] === 'tool') toolCalls.push(toToolCall(win.m[2] ?? '', win.m[4], win.m[3] === '/>'));
        else asks.push(toAsk(win.m[2] ?? '', win.m[4], win.m[3] === '/>'));
      } else if (win.kind === 'askLine') {
        // REQ-134: `<ask …>` with no `</ask>` on its own finished line — the
        // question the model meant to ask, not chat text.
        const body = (win.m[2] ?? '').trim();
        asks.push(toAsk(win.m[1] ?? '', body.includes('|') ? body : undefined, false));
      } else if (win.kind === 'toolCall') {
        toolCalls.push(toToolCallShape(win.m[1] ?? ''));
      } else {
        toolCalls.push(toDsmlCall(win.m[1] ?? '', win.m[2] ?? ''));
      }
    }
    if (force) {
      // Unclosed fake-result tail is roleplay, not chat — drop it; an
      // unclosed real block stays visible text (fail-open, no phantom call).
      buffer = buffer.replace(FAKE_RESULT_OPEN, '');
      // REQ-134: an `<ask …>` still open at end-of-stream is a question — no
      // more text is coming that could close it, so it must not stay chat text.
      const askAt = buffer.search(/<ask\b/i);
      if (askAt >= 0 && !/<\/ask/i.test(buffer)) {
        const raw = buffer.slice(askAt);
        const head = /^<ask\b([^>]*?)\/?>/.exec(raw);
        if (head) {
          const rest = (raw.slice(head[0].length).split('\n', 1)[0] ?? '').trim();
          const ask = toAsk(head[1] ?? '', rest.includes('|') ? rest : undefined, false);
          if (ask.question) asks.push(ask);
          buffer = buffer.slice(0, askAt);
        }
      }
      out += buffer;
      buffer = '';
      emitted += out.length;
      return out;
    }
    // Hold back from the FIRST `<`: anything before it can never belong to
    // a block that opens later, but everything from it onward might still
    // become one — including a split closing tag (`</to` + `ol>`), which is
    // why holding from the LAST `<` is wrong (it would flush the opening
    // markup the moment the closing tag starts streaming in).
    const open = buffer.indexOf('<');
    if (open === -1) {
      out += buffer;
      buffer = '';
      emitted += out.length;
    } else if (buffer.length > BLOCK_FILTER_BUFFER_CAP) {
      // Fail-open: a never-closing `<tool` must not swallow the chat.
      out += buffer;
      buffer = '';
      emitted += out.length;
    } else {
      out += buffer.slice(0, open);
      buffer = buffer.slice(open);
      emitted += out.length;
    }
    return out;
  }

  return {
    push(delta: string): string {
      buffer += delta;
      return drain(false);
    },
    finish(): { tail: string; toolCalls: ParsedToolCall[]; asks: ParsedAsk[]; marks: StreamMark[] } {
      const tail = drain(true);
      return { tail, toolCalls, asks, marks };
    },
  };
}

/**
 * System-prompt section advertising the tools (names + one-line usage).
 *
 * REQ-128: the protocol is dual. A model whose runtime exposes function
 * calling must USE those schemas (no markup, no prompt tax); a model whose
 * runtime cannot (or whose upstream refused the payload) still drives the
 * same registry through text blocks. Both are described so one prompt
 * covers every upstream — and the text half is phrased as the fallback,
 * which is what stopped good models from imitating markup instead of
 * calling functions.
 */
export function buildToolSystemPrompt(tools: { name: string; description: string }[]): string {
  const lines = tools.map((t) => `- ${t.name}: ${t.description}`);
  return [
    'You are an autonomous agent working in a real workspace. Act through your tools.',
    'Call the tools you were given (function calling) — they are the ONLY way to read, search, write or run anything.',
    'Never narrate an intent instead of acting ("let me check", "bakıyorum", "hazırlıyorum") and never claim a result you did not get back: call the tool, then report what it returned.',
    'Several independent read-only calls (list/read/search) may be issued together in one turn — they run in parallel. Writes and commands run in order.',
    'After EVERY tool result you MUST keep going: call the next tool or write the answer. Going silent after a result abandons the task.',
    '',
    'If your runtime does not expose tools as functions, use this fallback — one block on its own line:',
    '<tool name="read_file">{"path": "src/index.ts"}</tool>',
    'Self-closing for empty input: <tool name="list_files" />',
    'Valid JSON body only, one block per call; text outside blocks is your reply.',
    'Emit ONLY <tool name="...">...</tool> in that case — never <tool_call>, never bare name{...}, never any other tag shape.',
    'Each result comes back as <tool_result tool="..." id="...">...</tool_result>.',
    'NEVER write <tool_result> or <tool_call> yourself and NEVER invent tool output — results arrive on their own; roleplayed results are lies.',
    '',
    'To ask the user something blocking, emit <ask question="...">a|b|c</ask> (omit choices for free text).',
    'To create or change a file: read_file first (it returns the sha), then write_file with {"path": ..., "content": ..., "expectedSha": "<sha>"}; new files omit expectedSha.',
    'To run a command: {"command": "bun", "args": ["run", "build"]}. Shell syntax (|, &&, $) is refused — one binary plus args only.',
    'Never call the same tool twice in a row with the same input. Chain: list/search → read → write/run.',
    '',
    'Available tools:',
    ...lines,
  ].join('\n');
}
