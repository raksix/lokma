import * as React from 'react';
import { ChevronUp, Copy, GitFork, History, Pencil, User } from 'lucide-react';
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
  ThoughtTrace,
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

export type TranscriptMessage = { role: string; content: string; timestamp?: string };
export type PendingMessage = { key: number; text: string };

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

function DotNav({
  scrollRef,
  start,
  count,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Real transcript index of the first rendered row (windowing offset). */
  start: number;
  /** Rendered rows (not the full transcript — dots only target live DOM). */
  count: number;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky top-1/2 flex h-fit -translate-y-1/2 flex-col items-center gap-2 self-start rounded-full border border-line bg-white px-1 py-2 shadow-sm dark:bg-[#1E1E21]">
      {Array.from({ length: Math.min(count, 12) }).map((_, i) => (
        <button
          key={start + i}
          onClick={() => document.getElementById(`chat-msg-${start + i}`)?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' })}
          className={cn(
            'h-2 w-2 rounded-full transition hover:scale-[1.4]',
            i === 0 ? 'bg-terracotta shadow' : 'bg-zinc-300 hover:bg-terracotta dark:bg-zinc-600',
          )}
          title={`Message ${start + i + 1}`}
          aria-label={`Go to message ${start + i + 1}`}
        />
      ))}
      <span className="my-1 h-4 w-px bg-line" />
      <button
        onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() })}
        className="h-1.5 w-1.5 rounded-full bg-zinc-200 hover:bg-zinc-400 dark:bg-zinc-700"
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
  costLabel,
  toolCalls,
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
  costLabel: string | null;
  toolCalls: Record<string, ToolCallEntry>;
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
            {transcript.slice(window.start).map((m, k) => {
              const i = window.start + k;
              return m.role === 'user' ? (
                <UserRow key={`${i}-${m.timestamp ?? ''}`} index={i} message={m} onEditSave={onEditSave} onRewindTo={onRewindTo} onCopy={onCopy} />
              ) : (
                <AssistantRow key={`${i}-${m.timestamp ?? ''}`} index={i} message={m} onCopy={onCopy} onFork={onFork} onRewindTo={onRewindTo} />
              );
            })}
            {pending.map((p) => (
              <div key={p.key} className="flex gap-3 opacity-70">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-muted">
                  <User className="h-4 w-4 text-zinc-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold">You <span className="font-normal text-zinc-400">· sending…</span></div>
                  <div className="mt-1.5 rounded-2xl rounded-tl-sm border border-dashed border-line bg-white p-3.5 text-[13.5px] whitespace-pre-wrap dark:bg-[#1E1E21]">
                    {p.text}
                  </div>
                </div>
              </div>
            ))}
            {stream && (
              <div className="flex gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-[#262624] font-serif text-xs text-white">
                  L
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold">Lokma</div>
                  <ThoughtTrace toolCalls={toolCalls} />
                  <div className="mt-1.5 text-[13.5px] leading-[1.6] whitespace-pre-wrap">
                    {stream}
                    {streaming && <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-foreground align-middle" />}
                  </div>
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
            {questions.map((q) => (
              <QuestionCard key={q.requestId} req={q} onAnswer={onAnswerQuestion} />
            ))}
            {costLabel && <div className="text-[11px] text-zinc-400">{costLabel}</div>}
          </>
        )}
      </div>
      <DotNav scrollRef={scrollRef} start={window.start} count={window.visible} />
    </div>
  );
}
