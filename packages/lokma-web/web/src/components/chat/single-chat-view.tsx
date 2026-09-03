import * as React from 'react';
import { Copy, GitFork, History, Pencil, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { STARTER_PROMPTS, timeGreeting } from './composer-utils';

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
        <div className="mt-1.5 text-[13.5px] leading-[1.6] whitespace-pre-wrap">{message.content}</div>
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

function DotNav({ scrollRef, count }: { scrollRef: React.RefObject<HTMLDivElement | null>; count: number }) {
  if (count === 0) return null;
  return (
    <div className="sticky top-1/2 flex h-fit -translate-y-1/2 flex-col items-center gap-2 self-start rounded-full border border-line bg-white px-1 py-2 shadow-sm dark:bg-[#1E1E21]">
      {Array.from({ length: Math.min(count, 12) }).map((_, i) => (
        <button
          key={i}
          onClick={() => document.getElementById(`chat-msg-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          className={cn(
            'h-2 w-2 rounded-full transition hover:scale-[1.4]',
            i === 0 ? 'bg-terracotta shadow' : 'bg-zinc-300 hover:bg-terracotta dark:bg-zinc-600',
          )}
          title={`Message ${i + 1}`}
        />
      ))}
      <span className="my-1 h-4 w-px bg-line" />
      <button
        onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        className="h-1.5 w-1.5 rounded-full bg-zinc-200 hover:bg-zinc-400 dark:bg-zinc-700"
        title="Back to top"
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
  onEditSave,
  onRewindTo,
  onCopy,
  onFork,
  onStart,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  transcript: TranscriptMessage[];
  pending: PendingMessage[];
  stream: string;
  streaming: boolean;
  costLabel: string | null;
  onEditSave: (index: number, text: string) => void;
  onRewindTo: (index: number) => void;
  onCopy: (text: string) => void;
  onFork: () => void;
  onStart: (prompt: string) => void;
}) {
  const empty = transcript.length === 0 && pending.length === 0 && !stream;

  return (
    <div className="relative flex gap-3">
      <div className="min-w-0 flex-1 space-y-5 pr-2">
        {empty ? (
          <>
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2 py-1 text-[10.5px] font-medium dark:bg-[#1E1E21]">
                <span className="h-1.5 w-1.5 rounded-full bg-terracotta" /> Lokma Harness
              </span>
            </div>
            <h1 className="font-serif text-[30px] leading-[1.08] tracking-tight">
              {timeGreeting()}.<br />
              <span className="font-normal text-zinc-500 italic">What are we building today?</span>
            </h1>
            <p className="mt-2 text-[13px] text-zinc-500">
              Start with a brief. Each card below creates a real session backed by the harness server.
            </p>
            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {STARTER_PROMPTS.map((c) => (
                <Card
                  key={c.title}
                  className="cursor-pointer p-3 transition-shadow hover:shadow-md"
                  onClick={() => onStart(c.prompt)}
                >
                  <div className="text-xs font-semibold">{c.title}</div>
                  <div className="text-xs text-zinc-500">{c.desc}</div>
                </Card>
              ))}
            </div>
          </>
        ) : (
          <>
            {transcript.map((m, i) =>
              m.role === 'user' ? (
                <UserRow key={`${i}-${m.timestamp ?? ''}`} index={i} message={m} onEditSave={onEditSave} onRewindTo={onRewindTo} onCopy={onCopy} />
              ) : (
                <AssistantRow key={`${i}-${m.timestamp ?? ''}`} index={i} message={m} onCopy={onCopy} onFork={onFork} onRewindTo={onRewindTo} />
              ),
            )}
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
                  <div className="mt-1.5 text-[13.5px] leading-[1.6] whitespace-pre-wrap">
                    {stream}
                    {streaming && <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-foreground align-middle" />}
                  </div>
                </div>
              </div>
            )}
            {costLabel && <div className="text-[11px] text-zinc-400">{costLabel}</div>}
          </>
        )}
      </div>
      <DotNav scrollRef={scrollRef} count={transcript.length} />
    </div>
  );
}
