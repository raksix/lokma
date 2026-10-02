import * as React from 'react';
import { ChevronUp, Copy, GitFork, History, Pencil, User, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AttachmentView, type ChatAttachment } from './attachment';
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

export type TranscriptMessage = {
  role: string;
  content: string;
  timestamp?: string;
  toolName?: string;
  toolCallId?: string;
  /** REQ-155: agent-sent files (images render inline, others get cards). */
  attachments?: ChatAttachment[];
  /** REQ-186: images the USER attached to this prompt (raw base64 bytes). */
  images?: TranscriptImage[];
};

/** One user-attached image row (REQ-186) — mirrors the protocol `PromptImage`. */
export type TranscriptImage = { name: string; mime: string; dataBase64: string };
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

/**
 * REQ-170: what the transcript has NOT absorbed yet — the rows of the CURRENT
 * run (everything after the last user prompt). Anything above that belongs to
 * earlier runs and must never consume the buffers of the turn being watched.
 */
function currentRunRows(transcript: TranscriptMessage[]): TranscriptMessage[] {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const row = transcript[i];
    if (row && row.role === 'user') return transcript.slice(i + 1);
  }
  return transcript.slice();
}

/** Whitespace a persisted row lost to trimming, still present in the live buffer. */
function isSpace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';
}

/**
 * Consume one persisted segment from `live` starting at `from`; returns the
 * new position, or null when the buffers disagree (a retried turn, a
 * truncated thinking row) — callers then fail open.
 */
function consumeSegment(live: string, from: number, segment: string): number | null {
  let i = from;
  for (let j = 0; j < segment.length; j += 1) {
    // Persisted rows are trimmed at their edges while the live buffer still
    // carries that whitespace — skip it instead of failing the match.
    while (i < live.length && live[i] !== segment[j] && isSpace(live[i])) i += 1;
    if (i >= live.length || live[i] !== segment[j]) return null;
    i += 1;
  }
  return i;
}

/** Leading chars of `live` the persisted segments account for (0 when none). */
function absorbedPrefix(live: string, segments: string[]): number {
  let i = 0;
  for (const segment of segments) {
    const at = consumeSegment(live, i, segment);
    if (at === null) return i;
    i = at;
  }
  return i;
}

/**
 * REQ-170: the transcript is canonical — the live layer paints only what has
 * NOT landed in it yet. A completed tool call is written as a `tool` row
 * (same `toolCallId`) while the run is still going, and every finished turn
 * persists its thinking/text, so the live buffers (which keep accumulating
 * for the whole run) painted all of it a second time — the user saw every
 * tool call twice: once with its result in the timeline, once as a bare row
 * under the `Lokma` block.
 *
 * Returns the interleaved blocks for the un-persisted remainder plus the live
 * thinking cut to the same remainder. Tool calls match by id; text/thinking
 * consume their persisted prefix. Buffers that disagree (retried turn,
 * truncated row) fail open per buffer — the live buffer is shown untouched
 * rather than swallowing text that never landed.
 */
export function liveAfterPersisted(
  stream: string,
  toolMarks: ToolMark[],
  toolCalls: Record<string, ToolCallEntry>,
  thinking: string,
  transcript: TranscriptMessage[],
): { blocks: LiveBlock[]; thinking: string } {
  const persistedIds = new Set<string>();
  const textSegments: string[] = [];
  const thinkSegments: string[] = [];
  for (const row of currentRunRows(transcript)) {
    if (row.role === 'tool') {
      // Only rows the timeline will actually paint count — an unparseable row
      // renders nothing there, so excluding its call here would lose it.
      if (row.toolCallId && transcriptToolEntry(row)) persistedIds.add(row.toolCallId);
    } else if (row.role === 'assistant' && row.content) {
      textSegments.push(row.content);
    } else if (row.role === 'thinking' && row.content) {
      thinkSegments.push(row.content);
    }
  }
  const consumed = absorbedPrefix(stream, textSegments);
  // Marks are stream offsets — rebase them onto the trimmed buffer so text
  // still interleaves with the calls that are still live.
  const restMarks = toolMarks
    .filter((mark) => !persistedIds.has(mark.callId))
    .map((mark) => ({ callId: mark.callId, at: Math.max(0, mark.at - consumed) }));
  const restCalls: Record<string, ToolCallEntry> = {};
  for (const [callId, entry] of Object.entries(toolCalls)) {
    if (!persistedIds.has(callId)) restCalls[callId] = entry;
  }
  return {
    blocks: interleaveLiveBlocks(stream.slice(consumed), restMarks, restCalls),
    thinking: thinking.slice(absorbedPrefix(thinking, thinkSegments)),
  };
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

/**
 * REQ-186 — one user-attached image under the bubble. The bytes live on the
 * transcript row (base64), so no fetch is needed: the data URL IS the render.
 * Click opens a blob URL in a new tab (Chrome blocks top-level `data:` URLs).
 */
function UserImage({ image }: { image: TranscriptImage }) {
  const src = React.useMemo(() => `data:${image.mime};base64,${image.dataBase64}`, [image]);
  const open = React.useCallback(() => {
    try {
      const binary = atob(image.dataBase64);
      const bytes = new Uint8Array(binary.length);
      for (let k = 0; k < binary.length; k++) bytes[k] = binary.charCodeAt(k);
      const url = URL.createObjectURL(new Blob([bytes], { type: image.mime }));
      window.open(url, '_blank');
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      // Decode failure stays silent — the inline render is the primary view.
    }
  }, [image]);
  return (
    <button
      type="button"
      onClick={open}
      title={image.name}
      className="cursor-zoom-in overflow-hidden rounded-lg border border-line bg-white shadow-sm transition hover:border-line-strong dark:bg-[#0F0F11]"
    >
      <img src={src} alt={image.name} className="max-h-[240px] w-auto max-w-full" />
    </button>
  );
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
            {message.content.trim() ? (
              <div className="mt-1.5 rounded-2xl rounded-tl-sm border border-line bg-white p-3.5 shadow-sm transition group-hover:border-line-strong group-hover:shadow-md dark:bg-[#1E1E21]">
                <div className="text-[13.5px] leading-[1.6] whitespace-pre-wrap break-words">{message.content}</div>
              </div>
            ) : null}
            {message.images?.length ? (
              <div className="mt-1.5 flex flex-wrap gap-2" data-user-images="1">
                {message.images.map((image, k) => (
                  <UserImage key={`${k}-${image.name}`} image={image} />
                ))}
              </div>
            ) : null}
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
  cwd,
  onCopy,
  onFork,
  onRewindTo,
}: {
  index: number;
  message: TranscriptMessage;
  /** REQ-155: workspace root — resolves attachment paths for preview/download. */
  cwd?: string;
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
        {message.attachments?.length ? (
          <div className="mt-1 space-y-1" data-attachments="1">
            {message.attachments.map((a) => (
              <AttachmentView key={`${a.path}:${a.size}`} attachment={a} cwd={cwd ?? ''} />
            ))}
          </div>
        ) : null}
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
  cwd,
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
  /** REQ-155: session workspace — resolves attachment paths for preview/download. */
  cwd?: string;
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
  // REQ-170: and only the un-persisted remainder paints — a completed call's
  // transcript row (pushed live by REQ-149) is canonical, so re-painting it
  // in the live block showed every tool call twice while the run was going.
  const live = React.useMemo(
    () => liveAfterPersisted(stream, toolMarks, toolCalls, thinking, transcript),
    [stream, toolMarks, toolCalls, thinking, transcript],
  );
  const liveBlocks = live.blocks;
  const liveThinking = live.thinking;

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
                <AssistantRow key={`${i}-${m.timestamp ?? ''}`} index={i} message={m} cwd={cwd} onCopy={onCopy} onFork={onFork} onRewindTo={onRewindTo} />
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
                    <div className="text-[13.5px] leading-[1.6] whitespace-pre-wrap break-words">{p.text}</div>
                  </div>
                </div>
              </div>
            ))}
            {liveThinking && (
              <div className="flex gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-muted font-serif text-xs">
                  ?
                </span>
                <div className="min-w-0 flex-1">
                  <ThinkingTrace thinking={liveThinking} streaming={streaming} />
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
