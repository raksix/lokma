import * as React from 'react';
import { ChevronUp, Copy, GitFork, History, Pencil, User, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HeroSection } from './hero-section';
import {
  MESSAGE_WINDOW_INITIAL,
  expandMessageWindow,
  shouldResetMessageWindow,
  visibleMessageWindow,
} from './message-window';
import {
  AssistantBody,
  PermissionCard,
  QuestionCard,
  RunErrorCard,
  ThinkingTrace,
  ToolCallRow,
  transcriptToolEntry,
  WorkingIndicator,
} from './lokma-message';
import type { PermissionRequest, QuestionRequest, ToolCallEntry } from '@/lib/ws';
import { prefersReducedMotion } from '@/components/shell/use-prefers-reduced-motion';

/** Instant jumps when the OS asks for reduced motion, smooth otherwise. */
function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

/**
 * SingleChatView — transcript ported from the concept chat shell.
 * Every row renders real session data (REST transcript + live WS stream);
 * edit saves through the server rewind endpoint, fork copies the session
 * on disk, and the hero cards each create a real session.
 */

export type TranscriptMessage = { role: string; content: string; timestamp?: string; toolName?: string; toolCallId?: string };
export type PendingMessage = { key: number; text: string };
/** REQ-111: one stream cut per `tool_start` (arrival order, see `@/lib/ws`). */
export type ToolMark = { callId: string; at: number };
/** One live row in flow order — a text slice or a single tool call. */
export type LiveBlock =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; callId: string; entry: ToolCallEntry };

/**
 * REQ-111: slice the live stream at each tool mark so tool rows render
 * interleaved in arrival order (text → tool → text → tool), never as one
 * block pinned under the message. Pure + unit-tested.
 * Marks are clamped into range (out-of-order frames can't corrupt slices);
 * empty slices are dropped; toolCalls entries with no mark (shouldn't happen
 * — e.g. a rehydrated map) trail at the end so no call ever disappears.
 */
export function interleaveLiveBlocks(
  stream: string,
  toolMarks: ToolMark[],
  toolCalls: Record<string, ToolCallEntry>,
): LiveBlock[] {
  const blocks: LiveBlock[] = [];
  let cursor = 0;
  const seen = new Set<string>();
  for (const mark of toolMarks) {
    const cut = Math.min(Math.max(mark.at, cursor), stream.length);
    const slice = stream.slice(cursor, cut);
    if (slice) blocks.push({ kind: 'text', text: slice });
    cursor = cut;
    const entry = toolCalls[mark.callId];
    if (entry && !seen.has(mark.callId)) {
      seen.add(mark.callId);
      blocks.push({ kind: 'tool', callId: mark.callId, entry });
    }
  }
  const tail = stream.slice(cursor);
  if (tail) blocks.push({ kind: 'text', text: tail });
  for (const [callId, entry] of Object.entries(toolCalls)) {
    if (!seen.has(callId)) blocks.push({ kind: 'tool', callId, entry });
  }
  return blocks;
}

/** REQ-140: one entry in the dot rail — a prompt the user actually sent. */
export type PromptAnchor = { index: number; label: string };

/** Flatten a prompt to a single line and cap it for dot tooltips. */
export function promptLabel(content: string, max = 48): string {
  const flat = (content ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return 'Empty prompt';
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/**
 * REQ-140: the rail anchors on the user's own prompts only, in transcript
 * order. `index` is the transcript index, which is also the `chat-msg-<index>`
 * scroll target. Pure + unit-tested.
 */
export function promptAnchors(messages: TranscriptMessage[]): PromptAnchor[] {
  const anchors: PromptAnchor[] = [];
  messages.forEach((m, i) => {
    if (m.role !== 'user') return;
    anchors.push({ index: i, label: promptLabel(m.content) });
  });
  return anchors;
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function UserRow({
  index,
  message,
  onEditSave,
  onRewindTo,
  onCopy,
}: {
  index: number;
  message: TranscriptMessage;
  onEditSave: (index: number, text: string) => void;
  onRewindTo: (index: number) => void;
  onCopy: (text: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(message.content);
  React.useEffect(() => setDraft(message.content), [message.content]);

  return (
    <div id={`chat-msg-${index}`} className="group flex scroll-mt-16 gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-muted shadow-sm">
        <User className="h-4 w-4 text-zinc-500" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold">You</span>
          <span className="text-[11px] text-zinc-400">{formatTime(message.timestamp)}</span>
        </div>
        {editing ? (
          <div className="mt-1.5 rounded-2xl border border-terracotta/30 bg-white p-2 shadow-sm dark:bg-[#1E1E21]">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-line bg-white p-2 text-[13px] focus:border-terracotta/30 focus:outline-none dark:bg-[#0F0F11]"
            />
            <div className="mt-2 flex justify-end gap-1.5">
              <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-6 bg-[#C96442] text-[11px] text-white hover:bg-[#B85736]"
                disabled={!draft.trim()}
                onClick={() => {
                  setEditing(false);
                  onEditSave(index, draft);
                }}
              >
                Save &amp; rewind
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-1.5 rounded-2xl rounded-tl-sm border border-line bg-white p-3.5 shadow-sm transition group-hover:border-line-strong group-hover:shadow-md dark:bg-[#1E1E21]">
              <div className="text-[13.5px] leading-[1.6] whitespace-pre-wrap">{message.content}</div>
            </div>
            <div className="mt-1 flex flex-wrap gap-1 opacity-0 transition group-hover:opacity-100">
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setEditing(true)}>
                <Pencil className="mr-1 h-3 w-3" /> Edit
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => onRewindTo(index)}>
                <History className="mr-1 h-3 w-3" /> Rewind
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => onCopy(message.content)}>
                <Copy className="mr-1 h-3 w-3" /> Copy
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AssistantRow({
  index,
  message,
  onCopy,
  onFork,
  onRewindTo,
}: {
  index: number;
  message: TranscriptMessage;
  onCopy: (text: string) => void;
  onFork: () => void;
  onRewindTo: (index: number) => void;
}) {
  return (
    <div id={`chat-msg-${index}`} className="group flex scroll-mt-16 gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-[#262624] font-serif text-xs text-white shadow-sm">
        L
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-xs font-semibold">Lokma</span>
          <span className="text-[11px] text-zinc-400">{formatTime(message.timestamp)}</span>
        </div>
        <AssistantBody content={message.content} onCopy={onCopy} />
        <div className="mt-1 flex flex-wrap gap-1 opacity-0 transition group-hover:opacity-100">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => onCopy(message.content)}>
            <Copy className="mr-1 h-3 w-3" /> Copy
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={onFork}>
            <GitFork className="mr-1 h-3 w-3" /> Fork
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => onRewindTo(index)}>
            <History className="mr-1 h-3 w-3" /> Rewind
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * REQ-140: the rail lists the user's own prompts — one dot per prompt, in
 * order — and a click jumps to that prompt. The old rail put a dot on every
 * rendered row and pointed at `chat-msg-<row>`; tool/thinking rows carry no
 * id, so most dots were dead. The active dot follows the prompt currently at
 * the top of the viewport, and the rail scrolls when a session has many
 * prompts.
 */
function DotNav({
  scrollRef,
  anchors,
  activeIndex,
  onJump,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Every prompt the user sent, in transcript order. */
  anchors: PromptAnchor[];
  /** Index into `anchors` currently under the viewport top. */
  activeIndex: number;
  /** Scroll to a prompt (widens the render window when it is unmounted). */
  onJump: (index: number) => void;
}) {
  if (anchors.length === 0) return null;
  return (
    <div className="sticky top-1/2 flex h-fit max-h-[70vh] -translate-y-1/2 flex-col items-center gap-2 self-start overflow-y-auto rounded-full border border-line bg-white px-1 py-2 shadow-sm dark:bg-[#1E1E21]">
      {anchors.map((anchor, i) => (
        <button
          key={anchor.index}
          onClick={() => onJump(anchor.index)}
          data-target={`chat-msg-${anchor.index}`}
          className={cn(
            'h-2 w-2 shrink-0 rounded-full transition hover:scale-[1.4]',
            i === activeIndex ? 'bg-terracotta shadow' : 'bg-zinc-300 hover:bg-terracotta dark:bg-zinc-600',
          )}
          title={`Your prompt ${i + 1}: ${anchor.label}`}
          aria-label={`Go to your prompt ${i + 1} of ${anchors.length}: ${anchor.label}`}
        />
      ))}
      <span className="my-1 h-4 w-px shrink-0 bg-line" />
      <button
        onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() })}
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-200 hover:bg-zinc-400 dark:bg-zinc-700"
        title="Back to top"
        aria-label="Back to top"
      />
    </div>
  );
}

export function SingleChatView({
  scrollRef,
  transcript,
  pending,
  stream,
  streaming,
  thinking,
  runError,
  runErrorCode,
  costLabel,
  toolCalls,
  toolMarks,
  permissions,
  questions,
  answerBusy,
  onEditSave,
  onRewindTo,
  onCopy,
  onFork,
  onStart,
  onAnswerPermission,
  onAnswerQuestion,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  transcript: TranscriptMessage[];
  pending: PendingMessage[];
  stream: string;
  streaming: boolean;
  thinking: string;
  runError: string | null;
  /** REQ-136: error code — `turn_limit` renders as a pause, not a failure. */
  runErrorCode: string | null;
  costLabel: string | null;
  toolCalls: Record<string, ToolCallEntry>;
  /** REQ-111: arrival-order stream cuts — tool rows interleave with text. */
  toolMarks: ToolMark[];
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
  answerBusy: string | null;
  onEditSave: (index: number, text: string) => void;
  onRewindTo: (index: number) => void;
  onCopy: (text: string) => void;
  onFork: () => void;
  onStart: (prompt: string) => void;
  onAnswerPermission: (requestId: string, decision: 'allow' | 'deny' | 'always') => void;
  onAnswerQuestion: (requestId: string, answer: string) => void;
}) {
  const empty = transcript.length === 0 && pending.length === 0 && !stream;

  // Perf wave 2b windowing: long transcripts render only their tail. The
  // window collapses back to the initial tail when the transcript shrinks
  // (session switch, rewind, edit+resend); growth keeps the user's window
  // so the live tail keeps following. Indices are never remapped.
  const [shownCount, setShownCount] = React.useState(MESSAGE_WINDOW_INITIAL);
  const prevTotalRef = React.useRef(transcript.length);
  React.useEffect(() => {
    const prev = prevTotalRef.current;
    prevTotalRef.current = transcript.length;
    if (shouldResetMessageWindow(prev, transcript.length)) {
      setShownCount(MESSAGE_WINDOW_INITIAL);
    }
  }, [transcript.length]);
  const window = visibleMessageWindow(transcript.length, shownCount);

  // REQ-140: the dot rail lists the user's own prompts — from the WHOLE
  // transcript, not just the rendered tail, so a long session still offers
  // every prompt. Only user/assistant rows carry a `chat-msg-<index>` id, so
  // the old every-row rail left dead dots as well.
  const windowMessages = React.useMemo(() => transcript.slice(window.start), [transcript, window.start]);
  const anchors = React.useMemo(() => promptAnchors(transcript), [transcript]);
  const [activePrompt, setActivePrompt] = React.useState(0);

  // Jump to a prompt. Rows above the window are not mounted, so widen the
  // window first and scroll on the next frame, once the row exists.
  const jumpToPrompt = React.useCallback(
    (index: number) => {
      const scroll = () => {
        document.getElementById(`chat-msg-${index}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
      };
      if (document.getElementById(`chat-msg-${index}`)) {
        scroll();
        return;
      }
      setShownCount((prev) => Math.max(prev, transcript.length - index + 4));
      requestAnimationFrame(() => requestAnimationFrame(scroll));
    },
    [transcript.length],
  );

  // The active dot follows the last prompt at or above the viewport top; when
  // every visible prompt is still below the fold it lights the first mounted
  // one, so the rail never shows "nothing" as the current position.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || anchors.length === 0) return;
    const sync = () => {
      const top = el.getBoundingClientRect().top + 24;
      let next = -1;
      let firstMounted = -1;
      for (let i = 0; i < anchors.length; i += 1) {
        const node = document.getElementById(`chat-msg-${anchors[i].index}`);
        if (!node) continue;
        if (firstMounted === -1) firstMounted = i;
        if (node.getBoundingClientRect().top <= top) next = i;
      }
      if (next === -1) next = firstMounted;
      if (next === -1) return;
      setActivePrompt((prev) => (prev === next ? prev : next));
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    return () => el.removeEventListener('scroll', sync);
  }, [scrollRef, anchors, window.start, window.visible]);

  // REQ-103: run is live but nothing arrived yet (no thinking, no tool
  // calls, no stream text, no cards awaiting input) — show an animated
  // working indicator instead of a frozen screen. First chunk replaces it.
  const awaitingFirstOutput =
    streaming &&
    !thinking &&
    !stream &&
    Object.keys(toolCalls).length === 0 &&
    permissions.length === 0 &&
    questions.length === 0 &&
    !runError;

  // REQ-111: live tool rows interleave with the stream in arrival order
  // (text → tool → text → tool) — never one block pinned under the message.
  const liveBlocks = React.useMemo(() => interleaveLiveBlocks(stream, toolMarks, toolCalls), [stream, toolMarks, toolCalls]);

  return (
    <div className="relative flex gap-3">
      <div className="min-w-0 flex-1 space-y-5 pr-2">
        {empty ? (
          <HeroSection onStart={onStart} />
        ) : (
          <>
            {window.hidden > 0 && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-[11px]"
                  title={`Reveal ${window.hidden} earlier messages`}
                  aria-label={`Show earlier messages, ${window.hidden} hidden`}
                  onClick={() => setShownCount((s) => expandMessageWindow(s, transcript.length))}
                >
                  <ChevronUp className="h-3 w-3" />
                  Show earlier messages ({window.hidden} hidden)
                </Button>
              </div>
            )}
            {windowMessages.map((m, k) => {
              const i = window.start + k;
              if (m.role === 'tool') {
                // REQ-074: tool rows render as tool rows in the timeline
                // (never raw JSON) — the live trace detail survives refresh.
                const entry = transcriptToolEntry(m);
                if (!entry) return null;
                return (
                  <div key={`${i}-${m.timestamp ?? ''}`} className="flex gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-muted shadow-sm">
                      <Wrench className="h-4 w-4 text-zinc-500" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <ToolCallRow entry={entry} />
                    </div>
                  </div>
                );
              }
              return m.role === 'user' ? (
                <UserRow key={`${i}-${m.timestamp ?? ''}`} index={i} message={m} onEditSave={onEditSave} onRewindTo={onRewindTo} onCopy={onCopy} />
              ) : m.role === 'thinking' ? (
                // REQ-122: persisted thinking stays where it happened (never
                // re-sent upstream, never rendered as answer text).
                <div key={`${i}-${m.timestamp ?? ''}`} className="flex gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-muted font-serif text-xs">
                    ?
                  </span>
                  <div className="min-w-0 flex-1">
                    <ThinkingTrace thinking={m.content} streaming={false} />
                  </div>
                </div>
              ) : (
                <AssistantRow key={`${i}-${m.timestamp ?? ''}`} index={i} message={m} onCopy={onCopy} onFork={onFork} onRewindTo={onRewindTo} />
              );
            })}
            {pending.map((p) => (
              // REQ-102: the optimistic row renders exactly like a sent
              // message (no "sending…" label, no dashed bubble) so the send
              // feels instant; real failures still land in RunErrorCard.
              <div key={p.key} className="flex gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-muted shadow-sm">
                  <User className="h-4 w-4 text-zinc-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold">You</div>
                  <div className="mt-1.5 rounded-2xl rounded-tl-sm border border-line bg-white p-3.5 shadow-sm dark:bg-[#1E1E21]">
                    <div className="text-[13.5px] leading-[1.6] whitespace-pre-wrap">{p.text}</div>
                  </div>
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-muted font-serif text-xs">
                  ?
                </span>
                <div className="min-w-0 flex-1">
                  <ThinkingTrace thinking={thinking} streaming={streaming} />
                </div>
              </div>
            )}
            {liveBlocks.length > 0 && (
              <div className="flex gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-[#262624] font-serif text-xs text-white">
                  L
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold">Lokma</div>
                  <div className="space-y-1.5">
                    {liveBlocks.map((b, bi) =>
                      b.kind === 'text' ? (
                        <div key={`t${bi}`} className="mt-1.5 first:mt-0">
                          {/* REQ-123: live markdown — the stream renders through
                              the same renderer as finished messages (open fences
                              already segment as code), caret rides along. */}
                          <AssistantBody content={b.text} onCopy={onCopy} />
                          {streaming && bi === liveBlocks.length - 1 && (
                            <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-foreground align-middle" />
                          )}
                        </div>
                      ) : (
                        <div key={b.callId} className="mt-1.5 first:mt-0">
                          <ToolCallRow entry={b.entry} />
                        </div>
                      ),
                    )}
                    {streaming && liveBlocks[liveBlocks.length - 1].kind === 'tool' && (
                      <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-foreground align-middle" aria-hidden="true" />
                    )}
                  </div>
                </div>
              </div>
            )}
            {awaitingFirstOutput && (
              <div className="flex gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-[#262624] font-serif text-xs text-white">
                  L
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold">Lokma</div>
                  <WorkingIndicator />
                </div>
              </div>
            )}
            {permissions.map((p) => (
              <PermissionCard
                key={p.requestId}
                req={p}
                busy={answerBusy === p.requestId}
                onAnswer={onAnswerPermission}
              />
            ))}
            {runError && (
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <RunErrorCard message={runError} code={runErrorCode} />
                </div>
              </div>
            )}
            {questions.map((q) => (
              <QuestionCard key={q.requestId} req={q} onAnswer={onAnswerQuestion} />
            ))}
            {costLabel && <div className="text-[11px] text-zinc-400">{costLabel}</div>}
          </>
        )}
      </div>
      <DotNav scrollRef={scrollRef} anchors={anchors} activeIndex={activePrompt} onJump={jumpToPrompt} />
    </div>
  );
}
