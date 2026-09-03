import * as React from 'react';
import { GitFork, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Composer, type ComposerSend } from './composer';
import { SingleChatView, type PendingMessage, type TranscriptMessage } from './single-chat-view';
import { useWs, type UseWs } from '@/hooks/use-ws';
import { api } from '@/lib/api';
import { useProviderStore, useSessionStore } from '@/stores';
import { emitToast } from '@/components/shell';
import { FILE_DRAG_MIME, INSERT_MENTION_EVENT } from '@/components/files';
import { formatCostBadge } from '@/components/header';

/**
 * Chat — one session: REST transcript + live WS stream + real Composer.
 * The socket is owned by AppShell (single socket per chat); this component
 * owns the transcript cache lifecycle, optimistic pending rows, slash
 * commands (/new /fork /model /rewind /help) and per-session model state.
 */

const MODEL_KEY = 'lokma-model';
const INITIAL_PREFIX = 'lokma:initial:';

function readStoredModel(): string {
  try {
    return localStorage.getItem(MODEL_KEY) ?? '';
  } catch {
    return '';
  }
}

function isTranscriptMessage(m: unknown): m is TranscriptMessage {
  if (typeof m !== 'object' || m === null) return false;
  const r = (m as Record<string, unknown>).role;
  const c = (m as Record<string, unknown>).content;
  return (r === 'user' || r === 'assistant' || r === 'tool' || r === 'system') && typeof c === 'string';
}

export function Chat({
  sessionId,
  ws,
  onOpenSession,
}: {
  sessionId: string;
  ws: UseWs;
  onOpenSession?: (id: string) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [model, setModel] = React.useState<string>('');
  const [pending, setPending] = React.useState<PendingMessage[]>([]);
  const [streamVisible, setStreamVisible] = React.useState(true);
  const [paletteSignal, setPaletteSignal] = React.useState(0);
  const [dropSignal, setDropSignal] = React.useState<{ path: string; key: number } | null>(null);
  const keySeq = React.useRef(0);
  const doneSeen = React.useRef(false);

  const transcripts = useSessionStore((s) => s.transcripts);
  const loadTranscript = useSessionStore((s) => s.loadTranscript);
  const invalidateSession = useSessionStore((s) => s.invalidateSession);
  const storeModels = useProviderStore((s) => s.models);
  const refreshProviders = useProviderStore((s) => s.refresh);

  const { status, stream, cost, done, toolCalls, permissions, questions, sendText, interrupt, answerPermission, answerQuestion } = ws;
  const socketOpen = status === 'open';
  const streaming = socketOpen && !done && stream.length > 0;
  const [answerBusy, setAnswerBusy] = React.useState<string | null>(null);

  // Transcript + session model (server meta wins, tab storage is fallback).
  React.useEffect(() => {
    doneSeen.current = false;
    setPending([]);
    setStreamVisible(true);
    void loadTranscript(sessionId);
    api
      .getSession(sessionId)
      .then((detail) => setModel(detail.model || readStoredModel()))
      .catch(() => setModel(readStoredModel()));
    void refreshProviders();
  }, [sessionId, loadTranscript, refreshProviders]);

  const transcript: TranscriptMessage[] = React.useMemo(() => {
    const raw = transcripts[sessionId] ?? [];
    return raw.filter(isTranscriptMessage);
  }, [transcripts, sessionId]);

  const reloadTranscript = React.useCallback(async () => {
    invalidateSession(sessionId);
    await loadTranscript(sessionId);
  }, [invalidateSession, loadTranscript, sessionId]);

  // A finished stream means the server transcript grew — refetch, drop
  // optimistic rows, and hide the consumed live stream (no duplicates).
  React.useEffect(() => {
    if (!done || doneSeen.current) return;
    doneSeen.current = true;
    setPending([]);
    void reloadTranscript().then(() => setStreamVisible(false));
  }, [done, reloadTranscript]);

  // Starter cards / `/new <prompt>` hand a first prompt to the fresh session.
  React.useEffect(() => {
    if (status !== 'open') return;
    let initial: string | null = null;
    try {
      initial = sessionStorage.getItem(`${INITIAL_PREFIX}${sessionId}`);
      if (initial) sessionStorage.removeItem(`${INITIAL_PREFIX}${sessionId}`);
    } catch {
      initial = null;
    }
    if (initial) sendText(initial, model ? { model } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sessionId]);

  // Keep the tail visible while tokens stream in.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && stream) el.scrollTop = el.scrollHeight;
  }, [stream, transcript.length]);

  const pickModel = React.useCallback(
    (id: string) => {
      setModel(id);
      try {
        localStorage.setItem(MODEL_KEY, id);
      } catch {
        // Selection still applies for this tab without persistence.
      }
      api.patchSession(sessionId, { model: id }).catch((e: Error) => {
        emitToast(`Model not saved server-side: ${e.message}`);
      });
    },
    [sessionId],
  );

  const send = React.useCallback(
    (s: ComposerSend) => {
      keySeq.current += 1;
      setPending((prev) => [...prev, { key: keySeq.current, text: s.text }]);
      setStreamVisible(true);
      doneSeen.current = false;
      sendText(s.text, {
        model: s.model || undefined,
        contextPaths: s.contextPaths.length ? s.contextPaths : undefined,
      });
    },
    [sendText],
  );

  const openSession = React.useCallback(
    (id: string, initialPrompt?: string) => {
      if (initialPrompt) {
        try {
          sessionStorage.setItem(`${INITIAL_PREFIX}${id}`, initialPrompt);
        } catch {
          // Fresh session still opens; the prompt is dropped only for this tab.
        }
      }
      if (onOpenSession) {
        onOpenSession(id);
      } else {
        emitToast(`Session ${id} ready`);
      }
    },
    [onOpenSession],
  );

  const runSlash = React.useCallback(
    (id: string, args: string) => {
      switch (id) {
        case 'new': {
          api
            .createSession(model ? { model } : {})
            .then((res) => openSession(res.id, args || undefined))
            .catch((e: Error) => emitToast(`New session failed: ${e.message}`));
          break;
        }
        case 'fork': {
          api
            .forkSession(sessionId)
            .then((res) => {
              emitToast(`Forked ${res.copied ?? 0} messages`);
              openSession(res.id);
            })
            .catch((e: Error) => emitToast(`Fork failed: ${e.message}`));
          break;
        }
        case 'model': {
          if (!args) {
            emitToast(`Current model: ${model || '(server default)'}`);
            break;
          }
          const hit =
            storeModels.find((m) => m.id === args) ??
            storeModels.find((m) => m.id.endsWith(`/${args}`)) ??
            storeModels.find((m) => m.label.toLowerCase() === args.toLowerCase());
          if (!hit) {
            emitToast(`Unknown model ${args} — pick from the Composer list`);
            break;
          }
          pickModel(hit.id);
          emitToast(`Model: ${hit.label}`);
          break;
        }
        case 'rewind': {
          const keep = Number.parseInt(args, 10);
          if (!Number.isFinite(keep) || keep < 0) {
            emitToast('Usage: /rewind <message count>');
            break;
          }
          api
            .rewindSession(sessionId, keep)
            .then((res) => {
              emitToast(`Rewound to ${res.kept} messages`);
              void reloadTranscript();
            })
            .catch((e: Error) => emitToast(`Rewind failed: ${e.message}`));
          break;
        }
        case 'help': {
          setPaletteSignal((n) => n + 1);
          break;
        }
        default: {
          emitToast(`Unknown command /${id} — try /help`);
        }
      }
    },
    [model, openSession, pickModel, reloadTranscript, sessionId, storeModels],
  );

  // Permission answers travel over WS; `always` additionally persists the tool
  // as an allow-rule via PATCH /api/config (same store the Settings pane edits).
  // The answer is always sent — a failed persist only toasts, never blocks.
  const handleAnswerPermission = React.useCallback(
    (requestId: string, decision: 'allow' | 'deny' | 'always') => {
      if (decision !== 'always') {
        answerPermission(requestId, decision);
        return;
      }
      const pending = permissions.find((p) => p.requestId === requestId);
      setAnswerBusy(requestId);
      const persist = pending
        ? api
            .getConfig()
            .then((res) => {
              const perms = (res.config as { permissions?: { allow?: string[]; deny?: string[]; defaultMode?: string } })
                .permissions ?? { allow: [] as string[], deny: [] as string[], defaultMode: 'auto' as const };
              const allow = perms.allow ?? [];
              const rule = pending.tool;
              const next = allow.includes(rule) ? allow : [...allow, rule];
              return api.patchConfig({
                permissions: { allow: next, deny: perms.deny ?? [], defaultMode: perms.defaultMode ?? 'auto' },
              });
            })
            .then(() => emitToast(`Always allowing ${pending.tool}`))
            .catch((e: Error) => emitToast(`Rule not saved: ${e.message}`))
        : Promise.resolve();
      void persist.finally(() => {
        setAnswerBusy(null);
        answerPermission(requestId, decision);
      });
    },
    [answerPermission, permissions],
  );

  const handleAnswerQuestion = React.useCallback(
    (requestId: string, answer: string) => {
      answerQuestion(requestId, answer);
    },
    [answerQuestion],
  );

  const copyText = React.useCallback((text: string) => {
    try {
      void navigator.clipboard.writeText(text).then(
        () => emitToast('Copied'),
        () => emitToast('Copy failed'),
      );
    } catch {
      emitToast('Copy failed');
    }
  }, []);

  const editSave = React.useCallback(
    (index: number, text: string) => {
      // Save & rewind: truncate everything from the edited message on, then
      // resend — the server transcript is the checkpoint, not the UI scroll.
      api
        .rewindSession(sessionId, index)
        .then(() => reloadTranscript())
        .then(() => {
          setStreamVisible(true);
          doneSeen.current = false;
          sendText(text, model ? { model } : {});
        })
        .catch((e: Error) => emitToast(`Edit failed: ${e.message}`));
    },
    [sessionId, reloadTranscript, sendText, model],
  );

  const rewindTo = React.useCallback(
    (index: number) => {
      api
        .rewindSession(sessionId, index)
        .then((res) => {
          emitToast(`Rewound to ${res.kept} messages`);
          void reloadTranscript();
        })
        .catch((e: Error) => emitToast(`Rewind failed: ${e.message}`));
    },
    [sessionId, reloadTranscript],
  );

  const forkHere = React.useCallback(() => {
    api
      .forkSession(sessionId)
      .then((res) => {
        emitToast(`Forked ${res.copied ?? 0} messages`);
        openSession(res.id);
      })
      .catch((e: Error) => emitToast(`Fork failed: ${e.message}`));
  }, [sessionId, openSession]);

  const startStarter = React.useCallback(
    (prompt: string) => {
      if (transcript.length === 0 && pending.length === 0 && !stream) {
        send({ text: prompt, model, contextPaths: [] });
        return;
      }
      api
        .createSession(model ? { model } : {})
        .then((res) => openSession(res.id, prompt))
        .catch((e: Error) => emitToast(`New session failed: ${e.message}`));
    },
    [transcript.length, pending.length, stream, send, model, openSession],
  );

  // Explorer drops + context-menu "Insert @mention" land here as a signal
  // the Composer splices into its draft (existing mention → contextPaths).
  const insertMention = React.useCallback((path: string) => {
    const clean = path.trim().replace(/^@/, '');
    if (!clean) return;
    keySeq.current += 1;
    setDropSignal({ path: clean, key: keySeq.current });
  }, []);

  React.useEffect(() => {
    const onMention = (e: Event): void => {
      insertMention((e as CustomEvent<string>).detail ?? '');
    };
    window.addEventListener(INSERT_MENTION_EVENT, onMention);
    return () => window.removeEventListener(INSERT_MENTION_EVENT, onMention);
  }, [insertMention]);

  const onChatDrop = React.useCallback(
    (e: React.DragEvent) => {
      const direct = e.dataTransfer.getData(FILE_DRAG_MIME);
      const plain = e.dataTransfer.getData('text/plain');
      const path = (direct || (plain.startsWith('@') ? plain : '')).trim().replace(/^@/, '');
      if (!path) return;
      e.preventDefault();
      insertMention(path);
      emitToast(`Attached @${path}`);
    },
    [insertMention],
  );

  const costLabel =
    cost.inputTokens + cost.outputTokens > 0
      ? `${formatCostBadge(cost)}${cost.model ? ` · ${cost.model}` : ''}`
      : null;

  return (
    <Card
      className="flex flex-1 flex-col overflow-hidden"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(FILE_DRAG_MIME) || e.dataTransfer.types.includes('text/plain')) {
          e.preventDefault();
        }
      }}
      onDrop={onChatDrop}
    >
      <div className="flex h-9 items-center gap-2 border-b px-3 text-xs text-muted-foreground">
        <span className="font-mono">{sessionId}</span>
        <span className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" title="New session" onClick={() => runSlash('new', '')}>
            <Plus className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" title="Fork session" onClick={forkHere}>
            <GitFork className="h-3 w-3" />
          </Button>
          <span className="capitalize">{status}</span>
        </span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto p-3">
        <SingleChatView
          scrollRef={scrollRef}
          transcript={transcript}
          pending={pending}
          stream={streamVisible ? stream : ''}
          streaming={streaming}
          costLabel={costLabel}
          toolCalls={toolCalls}
          permissions={permissions}
          questions={questions}
          answerBusy={answerBusy}
          onEditSave={editSave}
          onRewindTo={rewindTo}
          onCopy={copyText}
          onFork={forkHere}
          onStart={startStarter}
          onAnswerPermission={handleAnswerPermission}
          onAnswerQuestion={handleAnswerQuestion}
        />
      </div>
      <div className="p-3 pt-0">
        <Composer
          model={model}
          streaming={streaming}
          socketOpen={socketOpen}
          paletteSignal={paletteSignal}
          dropSignal={dropSignal}
          onSend={send}
          onStop={interrupt}
          onSlash={runSlash}
          onPickModel={pickModel}
        />
      </div>
    </Card>
  );
}

/** Standalone Chat — owns its socket (used outside AppShell). */
export function ChatWithSocket({ sessionId }: { sessionId: string }) {
  const ws = useWs(sessionId);
  return (
    <Chat
      sessionId={sessionId}
      ws={ws}
      onOpenSession={(id) => {
        try {
          localStorage.setItem('lokma:sessionId', id);
        } catch {
          // Reload still switches only when storage works.
        }
        window.location.reload();
      }}
    />
  );
}
