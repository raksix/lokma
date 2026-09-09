import * as React from 'react';
import { BookOpenText, Brain, Check, Copy, FolderOpen, HelpCircle, ListTodo, Loader2, Pencil, Search, Send, ShieldAlert, SquareTerminal, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PermissionRequest, QuestionRequest, ToolCallEntry } from '@/lib/ws';

/**
 * LokmaMessage — assistant-side message blocks ported from the concept
 * `chat/LokmaMessage.tsx`. Every block renders real harness data:
 * - ThoughtTrace: the live `tool_start` / `tool_result` frame map (hidden when
 *   the run produced no tool calls — never a fake trace).
 * - MessageBody: real transcript text with ``` fences as copyable CodeBlocks.
 * - PermissionCard: a real `permission_request` frame; the answer travels over
 *   WS and `always` additionally persists a rule via PATCH /api/config.
 * - QuestionCard: a real `ask_user_question` frame; the picked answer travels
 *   over WS and unblocks the run.
 * Visual tokens (cream/terracotta/ink) match the concept 1:1.
 */

// ─── Fence parser (pure, unit-tested) ────────────────────────────────────────

export type BodySegment =
  | { kind: 'text'; body: string }
  | { kind: 'code'; lang: string; body: string };

/** Split ``` fenced blocks out of assistant text (unclosed fence = code). */
export function splitCodeFences(content: string): BodySegment[] {
  const segments: BodySegment[] = [];
  const lines = content.split('\n');
  let text: string[] = [];
  let code: string[] | null = null;
  let lang = '';
  const flushText = () => {
    const body = text.join('\n');
    if (body.trim()) segments.push({ kind: 'text', body: body.replace(/^\n+|\n+$/g, '') });
    text = [];
  };
  for (const line of lines) {
    const fence = line.match(/^```(\S*)\s*$/);
    if (fence && code === null) {
      flushText();
      code = [];
      lang = (fence[1] || '').trim();
    } else if (fence && code !== null) {
      segments.push({ kind: 'code', lang, body: code.join('\n').replace(/^\n+|\n+$/g, '') });
      code = null;
      lang = '';
    } else if (code !== null) {
      code.push(line);
    } else {
      text.push(line);
    }
  }
  if (code !== null) {
    segments.push({ kind: 'code', lang, body: code.join('\n').replace(/^\n+|\n+$/g, '') });
  } else {
    flushText();
  }
  return segments;
}

/** One-line summary of a tool input for the trace row (truncated JSON). */
export function summarizeInput(input: unknown, max = 120): string {
  if (input === null || input === undefined) return '';
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

// ─── Human tool sentences (REQ-073) ──────────────────────────────────────────
// Tool rows read like Claude Code / OpenCode ("Wrote smallproof.html ·
// 2.7KB"), never raw JSON (`list_files{"path":"."}`). Pure + unit-tested.

function inputObj(input: unknown): Record<string, unknown> {
  if (typeof input === 'string') {
    try {
      const parsed: unknown = JSON.parse(input);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // Not JSON — no fields to describe.
    }
    return {};
  }
  if (input && typeof input === 'object') return input as Record<string, unknown>;
  return {};
}

function strField(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

/** Compact byte label for write rows (2697 → "2.7KB"). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

/** "Wrote smallproof.html · 2.7KB" — one human sentence per tool call. */
export function describeToolCall(tool: string, input: unknown): string {
  const p = inputObj(input);
  switch (tool) {
    case 'read_file':
      return strField(p, 'path') ? `Read ${strField(p, 'path')}` : 'Read file';
    case 'write_file': {
      const size = typeof p.content === 'string' ? formatBytes(p.content.length) : '';
      const what = strField(p, 'path') || 'file';
      return size ? `Wrote ${what} · ${size}` : `Wrote ${what}`;
    }
    case 'list_files':
      return `Listed ${strField(p, 'path') || '.'}`;
    case 'search_files':
      return strField(p, 'query') ? `Searched “${strField(p, 'query')}”` : 'Searched files';
    case 'run_command': {
      const args = Array.isArray(p.args) ? p.args.filter((a): a is string => typeof a === 'string').join(' ') : '';
      const cmd = [strField(p, 'command'), args].filter(Boolean).join(' ');
      return cmd ? `Ran ${cmd}` : 'Ran command';
    }
    case 'claim_todo':
      return `Claimed ${strField(p, 'todoId') || 'todo'}`;
    case 'complete_todo':
      return `Completed ${strField(p, 'todoId') || 'todo'}`;
    case 'list_todos':
      return 'Listed todos';
    case 'ask_user':
      return strField(p, 'question') ? `Asked “${strField(p, 'question').slice(0, 80)}”` : 'Asked a question';
    default: {
      const s = summarizeInput(input, 60);
      return s ? `${tool} · ${s}` : tool;
    }
  }
}

function resultObj(result: unknown): Record<string, unknown> | null {
  if (typeof result === 'string') {
    try {
      const parsed: unknown = JSON.parse(result);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
    return null;
  }
  if (result && typeof result === 'object') return result as Record<string, unknown>;
  return null;
}

/**
 * One-line outcome under the sentence. Errors show the message (never a
 * JSON dump); success shows something countable when the result has it
 * (entries listed, bytes written), otherwise nothing — the sentence is
 * enough and the row stays quiet.
 */
export function summarizeResult(tool: string, result: unknown): string {
  if (result === undefined || result === null) return '';
  const o = resultObj(result);
  if (!o) {
    const s = String(result).trim();
    return s.length > 160 ? `${s.slice(0, 159)}…` : s;
  }
  if (o.ok === false) {
    const msg = typeof o.message === 'string' && o.message ? o.message : typeof o.code === 'string' ? o.code : 'failed';
    const flat = msg.replace(/\s+/g, ' ').trim();
    return flat.length > 160 ? `${flat.slice(0, 159)}…` : flat;
  }
  const inner = o.result && typeof o.result === 'object' ? (o.result as Record<string, unknown>) : null;
  if (tool === 'list_files' && inner && Array.isArray(inner.entries)) {
    return `${inner.entries.length} entr${inner.entries.length === 1 ? 'y' : 'ies'}`;
  }
  if (tool === 'read_file' && inner && typeof inner.content === 'string') {
    return `${formatBytes(inner.content.length)} read`;
  }
  if (tool === 'write_file' && inner && typeof inner.path === 'string') {
    return inner.path;
  }
  if (tool === 'run_command' && inner) {
    const out = typeof inner.stdout === 'string' ? inner.stdout.trim() : typeof inner.output === 'string' ? inner.output.trim() : '';
    if (out) return out.length > 160 ? `${out.slice(0, 159)}…` : out;
    if (typeof inner.exitCode === 'number') return `exit ${inner.exitCode}`;
  }
  return '';
}

const TOOL_ICONS: Record<string, typeof Wrench> = {
  read_file: BookOpenText,
  write_file: Pencil,
  list_files: FolderOpen,
  search_files: Search,
  run_command: SquareTerminal,
  claim_todo: ListTodo,
  complete_todo: ListTodo,
  list_todos: ListTodo,
  ask_user: HelpCircle,
};

// ─── Markdown (pure parsers, unit-tested) ────────────────────────────────────
// REQ-069: assistant text renders markdown. No external dep, no
// dangerouslySetInnerHTML — the renderer below emits React elements from
// these token lists, so model output can never inject markup/scripts.

export type MdBlock =
  | { kind: 'p'; body: string }
  | { kind: 'h'; level: 1 | 2 | 3 | 4; body: string }
  | { kind: 'quote'; body: string }
  | { kind: 'hr' }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

/** Split a text segment into block tokens (headers, quotes, lists, rules, paragraphs). */
export function parseMarkdownBlocks(text: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = text.split('\n');
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushPara = () => {
    const body = para.join('\n').trim();
    if (body) blocks.push({ kind: 'p', body });
    para = [];
  };
  const flushList = () => {
    if (list && list.items.length > 0) blocks.push(list.ordered ? { kind: 'ol', items: list.items } : { kind: 'ul', items: list.items });
    list = null;
  };
  for (const line of lines) {
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara();
      flushList();
      blocks.push({ kind: 'h', level: h[1].length as 1 | 2 | 3 | 4, body: (h[2] ?? '').trim() });
      continue;
    }
    if (/^\s*---\s*$/.test(line)) {
      flushPara();
      flushList();
      blocks.push({ kind: 'hr' });
      continue;
    }
    const q = line.match(/^\s*>\s?(.*)$/);
    if (q) {
      flushPara();
      flushList();
      blocks.push({ kind: 'quote', body: (q[1] ?? '').trim() });
      continue;
    }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push((ul[1] ?? '').trim());
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push((ol[1] ?? '').trim());
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}

/** Links the renderer will open — everything else renders as plain text. */
export function sanitizeMdUrl(url: string): string | null {
  const u = url.trim();
  if (/^(https?:\/\/|mailto:|#|\/)/i.test(u) && !/[\s<>"]/.test(u)) return u;
  return null;
}

export function CodeBlock({
  lang,
  code,
  onCopy,
}: {
  lang: string;
  code: string;
  onCopy: (text: string) => void;
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-line bg-[#0F0F11] dark:bg-[#161618]">
      <div className="flex h-7 items-center gap-2 border-b border-white/10 bg-[#1E1E21] px-3 text-xs">
        <span className="font-mono text-white">{lang || 'code'}</span>
        <span className="ml-auto" />
        <button
          onClick={() => onCopy(code)}
          className="grid h-5 w-5 place-items-center rounded text-white/60 hover:bg-white/10 hover:text-white"
          title="Copy code"
          aria-label="Copy code block"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-5 text-white/90">{code}</pre>
    </div>
  );
}

// ─── Inline + block renderer (React elements, never raw HTML) ───────────────

/** Inline spans: **bold**, *italic*, `code`, ~~strike~~, [label](url). Pure text in, React nodes out. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // link | bold | italic | code | strike — leftmost match wins each step
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_|`([^`\n]+)`|~~([^~\n]+)~~/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  const pushText = (t: string) => {
    if (t) out.push(<React.Fragment key={`${keyPrefix}t${k++}`}>{t}</React.Fragment>);
  };
  while ((m = re.exec(text)) !== null) {
    pushText(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined && m[2] !== undefined) {
      const href = sanitizeMdUrl(m[2]);
      out.push(
        href ? (
          <a key={`${keyPrefix}l${k++}`} href={href} target="_blank" rel="noopener noreferrer" className="text-terracotta underline underline-offset-2">
            {m[1]}
          </a>
        ) : (
          <React.Fragment key={`${keyPrefix}l${k++}`}>{m[0]}</React.Fragment>
        ),
      );
    } else if (m[3] !== undefined) {
      out.push(
        <strong key={`${keyPrefix}b${k++}`} className="font-semibold">
          {m[3]}
        </strong>,
      );
    } else if (m[4] !== undefined || m[5] !== undefined) {
      out.push(
        <em key={`${keyPrefix}i${k++}`}>{m[4] ?? m[5]}</em>,
      );
    } else if (m[6] !== undefined) {
      out.push(
        <code key={`${keyPrefix}c${k++}`} className="rounded border border-line bg-muted px-1 py-px font-mono text-[12px] dark:bg-[#1E1E21]">
          {m[6]}
        </code>,
      );
    } else if (m[7] !== undefined) {
      out.push(
        <del key={`${keyPrefix}s${k++}`} className="text-zinc-500">
          {m[7]}
        </del>,
      );
    }
  }
  pushText(text.slice(last));
  return out;
}

/** One markdown block token → element (headers/lists/quotes/rules/paragraphs). */
export function renderMdBlock(block: MdBlock, keyPrefix: string): React.ReactNode {
  switch (block.kind) {
    case 'h': {
      const cls =
        block.level === 1
          ? 'text-base font-semibold'
          : block.level === 2
            ? 'text-[15px] font-semibold'
            : 'text-[14px] font-semibold';
      const Tag = (block.level <= 2 ? `h${block.level + 1}` : 'h4') as 'h2' | 'h3' | 'h4';
      return (
        <Tag key={keyPrefix} className={`${cls} mt-2 first:mt-0`}>
          {renderInline(block.body, `${keyPrefix}h`)}
        </Tag>
      );
    }
    case 'quote':
      return (
        <blockquote key={keyPrefix} className="mt-1.5 border-l-2 border-terracotta/60 pl-2.5 text-zinc-600 italic dark:text-zinc-400">
          {renderInline(block.body, `${keyPrefix}q`)}
        </blockquote>
      );
    case 'hr':
      return <hr key={keyPrefix} className="my-2 border-line" />;
    case 'ul':
      return (
        <ul key={keyPrefix} className="mt-1.5 list-disc space-y-0.5 pl-5">
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item, `${keyPrefix}u${i}`)}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={keyPrefix} className="mt-1.5 list-decimal space-y-0.5 pl-5">
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item, `${keyPrefix}o${i}`)}</li>
          ))}
        </ol>
      );
    case 'p':
    default:
      return (
        <div key={keyPrefix} className="mt-1.5 whitespace-pre-wrap first:mt-0">
          {renderInline(block.body, `${keyPrefix}p`)}
        </div>
      );
  }
}

export function AssistantBody({
  content,
  onCopy,
}: {
  content: string;
  onCopy: (text: string) => void;
}) {
  const segments = React.useMemo(() => splitCodeFences(content), [content]);
  return (
    <div className="mt-1.5 text-[13.5px] leading-[1.6]">
      {segments.map((s, i) =>
        s.kind === 'code' ? (
          <CodeBlock key={i} lang={s.lang} code={s.body} onCopy={onCopy} />
        ) : (
          <React.Fragment key={i}>
            {parseMarkdownBlocks(s.body).map((b, j) => renderMdBlock(b, `s${i}b${j}`))}
          </React.Fragment>
        ),
      )}
    </div>
  );
}

// ─── Thought trace (real tool_start / tool_result frames) ────────────────────

/** One tool row — shared by the live trace and transcript tool rows (REQ-074). */
export function ToolCallRow({ entry }: { entry: ToolCallEntry }) {
  const e = entry;
  const running = e.result === undefined;
  const ToolIcon = TOOL_ICONS[e.tool] ?? Wrench;
  const outcome = summarizeResult(e.tool, e.result);
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs leading-[1.6] ${
        e.isError
          ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
          : 'border-line bg-muted/30 dark:bg-[#1E1E21]/50'
      }`}
    >
      {running ? (
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-terracotta" />
      ) : e.isError ? (
        <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-red-100 text-[10px] text-red-600">
          !
        </span>
      ) : (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
      )}
      <div className="min-w-0 flex-1">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-zinc-700 dark:text-zinc-200">
          <ToolIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          <span className="truncate font-medium">{describeToolCall(e.tool, e.input)}</span>
          {running && <span className="shrink-0 text-[11px] text-zinc-400">Running…</span>}
        </span>
        {!running && outcome && (
          <div className={`mt-0.5 truncate text-[11px] ${e.isError ? 'text-red-600 dark:text-red-400' : 'text-zinc-400'}`}>
            {outcome}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Transcript `role: 'tool'` row → trace entry (REQ-074, Hermes parity: the
 * row survives refresh with live-trace detail). New rows carry `input`
 * (server persists it); old rows fall back to the outcome-only sentence.
 * Returns null when the row is not a tool record.
 */
export function transcriptToolEntry(m: { role: string; content: string; toolName?: string; toolCallId?: string }): ToolCallEntry | null {
  if (m.role !== 'tool') return null;
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(m.content);
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!body) return null;
  const tool = m.toolName ?? (typeof body.tool === 'string' ? body.tool : 'unknown');
  const ok = body.ok !== false;
  return {
    tool,
    input: (body as Record<string, unknown>).input,
    result: body,
    isError: !ok,
  };
}

export function ThoughtTrace({ toolCalls }: { toolCalls: Record<string, ToolCallEntry> }) {
  const entries = Object.entries(toolCalls);
  if (entries.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {entries.map(([callId, e]) => (
        <div key={callId}>
          <ToolCallRow entry={e} />
        </div>
      ))}
    </div>
  );
}

// ─── Run error card (REQ-054, OpenCode `Error` row): a failed run leaves a
// visible trace in the live area until the next prompt — not just a toast.
export function RunErrorCard({ message }: { message: string }) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-2.5 py-2 text-xs leading-[1.6] text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-red-500 text-[10px] text-white">
        !
      </span>
      <div className="min-w-0 flex-1">
        <span className="font-medium">Send failed</span>
        <div className="mt-0.5 break-words font-mono text-[11px] opacity-90">{message}</div>
      </div>
    </div>
  );
}

// ─── Thinking trace (live `thinking_delta` frames, REQ-050) ───────────────────
// Claude-Code style reasoning block: open + pulsing while the model thinks,
// collapsed to a quiet line once the answer streams. Never persisted —
// `thinking` resets on every new prompt (see use-ws sendText).
export function ThinkingTrace({ thinking, streaming }: { thinking: string; streaming: boolean }) {
  if (!thinking) return null;
  return (
    <details
      open={streaming}
      className="mt-2 overflow-hidden rounded-lg border border-dashed border-line bg-white/60 dark:bg-[#1E1E21]/40"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-muted/50">
        <Brain className={`h-3.5 w-3.5 text-terracotta ${streaming ? 'animate-pulse' : ''}`} />
        Thinking{streaming ? '…' : ''}
        <span className="ml-auto text-[11px] font-normal text-zinc-400">
          {thinking.length > 120 ? `${thinking.slice(0, 120)}…` : thinking}
        </span>
      </summary>
      <div className="max-h-48 overflow-auto border-t border-line px-3 py-2 text-xs leading-[1.6] text-zinc-500 whitespace-pre-wrap">
        {thinking}
      </div>
    </details>
  );
}

// ─── Permission card (real permission_request frame) ─────────────────────────

export function PermissionCard({
  req,
  busy,
  onAnswer,
}: {
  req: PermissionRequest;
  busy: boolean;
  onAnswer: (requestId: string, decision: 'allow' | 'deny' | 'always') => void;
}) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 dark:border-[#3A2E1A] dark:bg-[#241E0F]">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-amber-500 text-white">
        <ShieldAlert className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold">Permission — {req.tool}</div>
        <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{req.description}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          <button
            disabled={busy}
            onClick={() => onAnswer(req.requestId, 'allow')}
            className="h-6 rounded-full bg-[#262624] px-2.5 text-xs text-white disabled:opacity-50"
          >
            Allow
          </button>
          <button
            disabled={busy}
            onClick={() => onAnswer(req.requestId, 'deny')}
            className="h-6 rounded-full border border-line bg-white px-2.5 text-xs disabled:opacity-50"
          >
            Deny
          </button>
          <button
            disabled={busy}
            onClick={() => onAnswer(req.requestId, 'always')}
            className={cn(
              'h-6 rounded-full border border-line bg-white px-2.5 text-xs disabled:opacity-50',
              busy && 'animate-pulse',
            )}
          >
            {busy ? 'Saving rule…' : `Always allow ${req.tool}`}
          </button>
          <span className="ml-auto hidden text-[11px] text-zinc-400 sm:inline">
            auto · ask · deny · Settings → Permissions
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── AskUserQuestion card (real ask_user_question frame) ─────────────────────

export function QuestionCard({
  req,
  onAnswer,
}: {
  req: QuestionRequest;
  onAnswer: (requestId: string, answer: string) => void;
}) {
  const [draft, setDraft] = React.useState('');
  const choices = req.choices ?? [];
  return (
    <div className="mt-3 rounded-lg border border-line bg-white p-2.5 dark:bg-[#1E1E21]">
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <HelpCircle className="h-3.5 w-3.5 text-terracotta" />
        {req.question}
      </div>
      {choices.length > 0 ? (
        <div className="mt-2 grid grid-cols-1 gap-1">
          {choices.map((o) => (
            <button
              key={o}
              onClick={() => onAnswer(req.requestId, o)}
              className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-left text-xs hover:border-terracotta/30 hover:bg-[#FDF0E6] dark:hover:bg-[#2A1E15]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-terracotta" /> {o}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-2 flex gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) onAnswer(req.requestId, draft.trim());
            }}
            placeholder="Type your answer…"
            className="h-7 flex-1 rounded-md border border-line bg-white px-2 text-xs focus:border-terracotta/30 focus:outline-none dark:bg-[#0F0F11]"
          />
          <Button
            size="sm"
            className="h-7 bg-[#C96442] text-xs text-white hover:bg-[#B85736]"
            disabled={!draft.trim()}
            onClick={() => draft.trim() && onAnswer(req.requestId, draft.trim())}
          >
            <Send className="mr-1 h-3 w-3" /> Send
          </Button>
        </div>
      )}
      <div className="mt-1 text-[11px] text-zinc-400">The run waits for your answer.</div>
    </div>
  );
}
