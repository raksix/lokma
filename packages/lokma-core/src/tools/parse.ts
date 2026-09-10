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

/** Parse one complete `<ask ...>` match (never throws). */
function toAsk(attrs: string, body: string | undefined, selfClosing: boolean): ParsedAsk {
  const question = (attr(attrs, 'question') ?? '').trim();
  if (selfClosing || body === undefined || !body.trim()) return { question };
  const choices = body
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return choices.length ? { question, choices } : { question };
}

/**
 * Parse every complete tool block in finished text.
 * Streaming callers prefer `createBlockFilter()` (same shapes, incremental).
 */
export function parseToolBlocks(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  for (const m of text.matchAll(COMPLETE_BLOCK)) {
    if (m[1] === 'tool') calls.push(toToolCall(m[2] ?? '', m[4], m[3] === '/>'));
  }
  return calls;
}

/** Parse every complete ask block in finished text. */
export function parseAskBlocks(text: string): ParsedAsk[] {
  const asks: ParsedAsk[] = [];
  for (const m of text.matchAll(COMPLETE_BLOCK)) {
    if (m[1] === 'ask') asks.push(toAsk(m[2] ?? '', m[4], m[3] === '/>'));
  }
  return asks;
}

/** Remove all complete tool/ask blocks (for stored transcripts + display). */
export function stripModelBlocks(text: string): string {
  return text.replace(COMPLETE_BLOCK, '').replace(/[ \t]+\n/g, '\n').trim();
}

/**
 * Incremental filter for live streams — chunk boundaries can split a block,
 * so complete blocks are held back until they close. `push()` returns only
 * the clean text safe to forward; `finish()` drains the tail plus the calls.
 * Fail-open: unclosed markup older than the buffer cap flows through as text.
 */
export function createBlockFilter(): {
  push(delta: string): string;
  finish(): { tail: string; toolCalls: ParsedToolCall[]; asks: ParsedAsk[] };
} {
  let buffer = '';
  const toolCalls: ParsedToolCall[] = [];
  const asks: ParsedAsk[] = [];

  function drain(force: boolean): string {
    let out = '';
    for (;;) {
      COMPLETE_BLOCK.lastIndex = 0;
      const m = COMPLETE_BLOCK.exec(buffer);
      if (!m || m.index === undefined) break;
      out += buffer.slice(0, m.index);
      if (m[1] === 'tool') toolCalls.push(toToolCall(m[2] ?? '', m[4], m[3] === '/>'));
      else asks.push(toAsk(m[2] ?? '', m[4], m[3] === '/>'));
      buffer = buffer.slice(m.index + m[0].length);
    }
    if (force) {
      out += buffer;
      buffer = '';
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
    } else if (buffer.length > BLOCK_FILTER_BUFFER_CAP) {
      // Fail-open: a never-closing `<tool` must not swallow the chat.
      out += buffer;
      buffer = '';
    } else {
      out += buffer.slice(0, open);
      buffer = buffer.slice(open);
    }
    return out;
  }

  return {
    push(delta: string): string {
      buffer += delta;
      return drain(false);
    },
    finish(): { tail: string; toolCalls: ParsedToolCall[]; asks: ParsedAsk[] } {
      const tail = drain(true);
      return { tail, toolCalls, asks };
    },
  };
}

/** System-prompt section advertising the tools (names + one-line usage). */
export function buildToolSystemPrompt(tools: { name: string; description: string }[]): string {
  const lines = tools.map((t) => `- ${t.name}: ${t.description}`);
  return [
    'You have workspace tools. To use one, emit a block on its own line:',
    '<tool name="read_file">{"path": "src/index.ts"}</tool>',
    'Use a self-closing tag for empty input: <tool name="list_files" />',
    'One block per call, valid JSON body only. Text outside blocks is your reply.',
    'Emit ONLY <tool name="...">...</tool> — never <tool_call>, never bare name{...}, never any other tag shape.',
    'Each result comes back as <tool_result tool="..." id="...">...</tool_result>. After EVERY result you MUST continue: emit the next <tool> block or write the answer. Stopping silently after a result is a failure.',
    'To ask the user something blocking, emit <ask question="...">a|b|c</ask> (omit choices for free text).',
    'RULES: never narrate intent ("I will look", "hazırlıyorum", "bakıyorum") — emit the tool block immediately, then report the result.',
    'Never call the same tool twice in a row with the same input. Chain: list/search → read → write/run, one turn at a time.',
    'To create or change a file: read_file first (it returns the sha), then write_file with {"path": ..., "content": ..., "expectedSha": "<sha>"}; new files omit expectedSha.',
    'To run a command: {"command": "bun", "args": ["run", "build"]}. Shell syntax (|, &&, $) is refused — one binary plus args only.',
    'Available tools:',
    ...lines,
  ].join('\n');
}
