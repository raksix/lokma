import * as React from 'react';
import { Brain, Check, Copy, HelpCircle, Loader2, Send, ShieldAlert, Wrench } from 'lucide-react';
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

// ─── Code block ──────────────────────────────────────────────────────────────

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

// ─── Assistant body (real text + real code blocks) ───────────────────────────

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
          <div key={i} className="whitespace-pre-wrap">
            {s.body}
          </div>
        ),
      )}
    </div>
  );
}

// ─── Thought trace (real tool_start / tool_result frames) ────────────────────

export function ThoughtTrace({ toolCalls }: { toolCalls: Record<string, ToolCallEntry> }) {
  const entries = Object.entries(toolCalls);
  if (entries.length === 0) return null;
  const finished = entries.filter(([, e]) => e.result !== undefined).length;
  const errors = entries.filter(([, e]) => e.isError).length;
  const headline = entries
    .slice(-2)
    .map(([, e]) => e.tool)
    .join(' · ');
  return (
    <details
      open={finished < entries.length}
      className="mt-2 overflow-hidden rounded-lg border border-line bg-muted/30 dark:bg-[#1E1E21]/50"
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-1.5 text-xs font-medium hover:bg-muted/50">
        <Brain className="h-3.5 w-3.5 text-terracotta" />
        Thought
        <span className="ml-auto text-[11px] font-normal text-zinc-400">
          {headline}
          {errors > 0 && <span className="ml-2 text-red-500">{errors} failed</span>}
          {finished === entries.length && (
            <span className="ml-2 text-emerald-600">
              {entries.length} tool{entries.length === 1 ? '' : 's'}
            </span>
          )}
        </span>
      </summary>
      <div className="space-y-1.5 border-t border-line px-3 py-2 text-xs leading-[1.6]">
        {entries.map(([callId, e]) => (
          <div key={callId} className="flex items-start gap-2">
            {e.result === undefined ? (
              <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-terracotta" />
            ) : e.isError ? (
              <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-red-100 text-[10px] text-red-600">
                !
              </span>
            ) : (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            )}
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-500">
                <Wrench className="h-3 w-3" />
                {e.tool}
              </span>
              {summarizeInput(e.input) && (
                <code className="ml-1.5 rounded border border-line bg-white px-1 py-0.5 text-[11px] dark:bg-[#0F0F11]">
                  {summarizeInput(e.input)}
                </code>
              )}
              {typeof e.result === 'string' && e.result.trim() && (
                <div className="mt-0.5 truncate text-[11px] text-zinc-400">{e.result.slice(0, 160)}</div>
              )}
            </div>
          </div>
        ))}
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
