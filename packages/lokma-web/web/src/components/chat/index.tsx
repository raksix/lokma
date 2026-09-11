import * as React from 'react';
import { Bot as BotIcon, GitFork, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Composer, type ComposerSend } from './composer';
import { SingleChatView, type PendingMessage, type TranscriptMessage } from './single-chat-view';
import { useWs, type UseWs } from '@/hooks/use-ws';
import { api, type Bot } from '@/lib/api';
import { botClearPatch, botSwitchPatch, filterPickerBots, sessionBotName } from '@/components/bots/bot-chat';
import { normalizeConfig } from '@/components/settings/settings';
import { resolveDefaultModel } from '@/components/providers/models';
import { useKnownSession, useProviderStore, useSessionStore } from '@/stores';
import { markSessionSeen } from '@/stores/session';
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
/**
 * sessionStorage key prefix for a first prompt handed to a fresh session
 * (starter cards, `/new <prompt>`, REQ-057 agent `open_session`). Exported
 * so the shell can stage an agent prompt the same way — Chat consumes and
 * removes it on socket open, then auto-sends.
 */
export const INITIAL_PREFIX = 'lokma:initial:';

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
  // Bot binding (REQ-027): Grok-style "switch bot in chat" — the session
  // chats AS the bound bot (own SOUL/knowledge/model, server-injected).
  const [botId, setBotId] = React.useState<string | null>(null);
  const [bots, setBots] = React.useState<Bot[]>([]);
  const [botOpen, setBotOpen] = React.useState(false);
  const [botQuery, setBotQuery] = React.useState('');
  const [pending, setPending] = React.useState<PendingMessage[]>([]);
  const [streamVisible, setStreamVisible] = React.useState(true);
  const [paletteSignal, setPaletteSignal] = React.useState(0);
  const [dropSignal, setDropSignal] = React.useState<{ path: string; key: number } | null>(null);
  const keySeq = React.useRef(0);
  const doneSeen = React.useRef(false);

  const transcripts = useSessionStore((s) => s.transcripts);
  const known = useKnownSession(sessionId);
  const loadTranscript = useSessionStore((s) => s.loadTranscript);
  const invalidateSession = useSessionStore((s) => s.invalidateSession);
  const storeModels = useProviderStore((s) => s.models);
  const providerLoading = useProviderStore((s) => s.loading);
  const refreshProviders = useProviderStore((s) => s.refresh);
  /** REQ-104: one smart-chain resolution per session (guard, not state — never re-fires). */
  const chainResolved = React.useRef<string | null>(null);

  const { status, stream, thinking, cost, done, lastError, retry, toolCalls, toolMarks, permissions, questions, sendText, interrupt, answerPermission, answerQuestion, clearLiveTrace } = ws;
  const socketOpen = status === 'open';
  // REQ-070: a backend run outlives refresh — the badge stays on while the
  // server reports running/queued even with no live stream on this socket.
  const [runActive, setRunActive] = React.useState(false);
  const streaming = (socketOpen && !done && stream.length > 0) || runActive;
  const [answerBusy, setAnswerBusy] = React.useState<string | null>(null);

  // Loading line under the composer while the AI works (REQ-112): what is
  // happening right now — retry, approval wait, running tool, thinking,
  // writing, or generic working. Null when idle.
  const runStatus = React.useMemo((): string | null => {
    if (!streaming) return null;
    if (retry) {
      const waitS = Math.round(retry.waitMs / 1000);
      return `Tekrar deneniyor (${retry.attempt}/${retry.maxAttempts}, ${waitS}sn)…`;
    }
    if (permissions.length > 0 || questions.length > 0) return 'Onay bekliyor…';
    const entries = Object.values(toolCalls);
    const running = [...entries].reverse().find((t) => t.result === undefined);
    if (running) return `Çalışıyor: ${running.tool}…`;
    if (thinking.trim().length > 0) return 'Düşünüyor…';
    if (stream.trim().length > 0) return 'Yazıyor…';
    return 'Çalışıyor…';
  }, [streaming, retry, permissions.length, questions.length, toolCalls, thinking, stream]);

  // REQ-070: on mount (fresh boot after F5) ask the backend whether a run is
  // still in flight; while it is, poll status + transcript so the refresh
  // catches up live instead of showing a dead "complete".
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = () => {
      api
        .getSessionRun(sessionId)
        .then((res) => {
          if (cancelled) return;
          const active = res.running || res.queued > 0;
          setRunActive((prev) => {
            // Idle edge after a live run: one final reload catches the tail
            // the last poll may have missed.
            if (prev && !active) void loadTranscript(sessionId, true);
            return active;
          });
          if (active) {
            void loadTranscript(sessionId, true);
            timer = setTimeout(poll, 4000);
          }
        })
        .catch(() => {
          if (!cancelled) setRunActive(false);
        });
    };
    void loadTranscript(sessionId).then(() => {
      if (!cancelled) poll();
    });
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [sessionId, loadTranscript]);

  // Transcript + session model (server meta wins, tab storage is fallback).
  // While the server list is not in yet the effect re-runs when it flips —
  // waiting avoids doomed GETs for locally generated ids the server never
  // saw (fresh boots used to 404 twice per view).
  React.useEffect(() => {
    doneSeen.current = false;
    setPending([]);
    setStreamVisible(true);
    setBotOpen(false);
    setBotQuery('');
    void refreshProviders();
    api
      .listBots()
      .then((res) => setBots(res.bots))
      .catch(() => setBots([]));
    if (known === 'loading') {
      setModel(readStoredModel());
      setBotId(null);
      return;
    }
    void loadTranscript(sessionId);
    if (!known) {
      setModel(readStoredModel());
      setBotId(null);
      return;
    }
    api
      .getSession(sessionId)
      .then((detail) => {
        // REQ-117: a known session with no saved model resolves through the
        // global default chain (empty -> chain effect) — never the global
        // last-picked localStorage, which leaked one session's pick into
        // every fresh session.
        setModel(detail.model || '');
        setBotId(detail.botId ?? known.botId ?? null);
      })
      .catch(() => {
        setModel(readStoredModel());
        setBotId(known.botId ?? null);
      });
  }, [sessionId, loadTranscript, refreshProviders, known]);

  const transcript: TranscriptMessage[] = React.useMemo(() => {
    const raw = transcripts[sessionId] ?? [];
    return raw.filter(isTranscriptMessage);
  }, [transcripts, sessionId]);

  // REQ-104: no session model and no stored model → smart default chain
  // (configured → most-used 30d → first enabled → built-in fallback).
  // Runs once per session after the catalog settles; an explicit user pick
  // (model !== '') always wins and is never overwritten.
  React.useEffect(() => {
    if (model !== '' || known === 'loading' || providerLoading) return;
    if (chainResolved.current === sessionId) return;
    chainResolved.current = sessionId;
    void (async () => {
      try {
        const [cfgRes, usageRes] = await Promise.all([
          api.getConfig().catch(() => null),
          api.getUsageSummary('30d').catch(() => null),
        ]);
        const resolved = resolveDefaultModel({
          configured: cfgRes ? normalizeConfig(cfgRes).defaultModel : '',
          usageTop: usageRes?.summary?.topModel ?? null,
          models: useProviderStore.getState().models,
        });
        // An explicit pick mid-flight stamps `:picked` — never overwrite it.
        if (chainResolved.current !== sessionId) return;
        if (!resolved.model) return;
        setModel(resolved.model);
        try {
          localStorage.setItem(MODEL_KEY, resolved.model);
        } catch {
          // Selection still applies for this tab without persistence.
        }
        if (known) {
          api.patchSession(sessionId, { model: resolved.model }).catch((e: Error) => {
            emitToast(`Model not saved server-side: ${e.message}`);
          });
        }
      } catch {
        // Keep empty — the server WS default applies to the run.
      }
    })();
  }, [model, known, sessionId, providerLoading]);

  const reloadTranscript = React.useCallback(async () => {
    invalidateSession(sessionId);
    // Forced: the finished stream created the session server-side even when
    // the list cache predates it — never take the unknown-id empty shortcut.
    await loadTranscript(sessionId, true);
  }, [invalidateSession, loadTranscript, sessionId]);

  // A finished stream means the server transcript grew — refetch, drop
  // optimistic rows, and hide the consumed live stream (no duplicates).
  React.useEffect(() => {
    if (!done || doneSeen.current) return;
    doneSeen.current = true;
    setPending([]);
    setRunActive(false);
    // REQ-121: watching it finish counts as read (sidebar dot clears).
    markSessionSeen(sessionId);
    // REQ-132: hide the live stream and drop the whole live trace (stream +
    // thinking + tool rows). The refetched transcript already carries that
    // answer — keeping both painted every reply twice, thinking block
    // included. Every finish path persists its output first (a clean reply, or
    // the partial text an aborted run wrote), so nothing is lost. `finally`
    // matters too: a failed refetch used to skip the hide and leave the
    // duplicate on screen.
    void reloadTranscript().finally(() => {
      setStreamVisible(false);
      clearLiveTrace();
    });
  }, [done, reloadTranscript, clearLiveTrace]);

  // REQ-038: upstream failures used to die silently (stuck "sending…").
  // The run now ends on `error` frames — surface the reason as a toast.
  const lastToastedError = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!lastError || lastToastedError.current === lastError) return;
    lastToastedError.current = lastError;
    emitToast(`Send failed: ${lastError}`);
  }, [lastError]);

  // REQ-077: auto-retry is visible — one toast per attempt with the backoff
  // wait, so "hata alınca bekliyor" never looks like a hang.
  const lastToastedRetry = React.useRef<number>(0);
  React.useEffect(() => {
    if (!retry || lastToastedRetry.current >= retry.attempt) return;
    lastToastedRetry.current = retry.attempt;
    const waitS = Math.round(retry.waitMs / 1000);
    emitToast(`Tekrar deneniyor (${retry.attempt}/${retry.maxAttempts}, ${waitS}sn sonra)`);
  }, [retry]);

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
      chainResolved.current = `${sessionId}:picked`;
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

  // Grok-style bot switching (REQ-027): binding also adopts the bot's
  // model so the session chats AS the bot; clearing returns to plain chat.
  const pickBot = React.useCallback(
    (bot: Bot) => {
      const patch = botSwitchPatch(bot);
      setBotId(patch.botId);
      chainResolved.current = `${sessionId}:picked`;
      setModel(patch.model);
      setBotOpen(false);
      try {
        localStorage.setItem(MODEL_KEY, patch.model);
      } catch {
        // Selection still applies for this tab without persistence.
      }
      api.patchSession(sessionId, patch).catch((e: Error) => {
        emitToast(`Bot not saved server-side: ${e.message}`);
      });
      emitToast(`Chatting as ${bot.name}`);
    },
    [sessionId],
  );

  const clearBot = React.useCallback(() => {
    setBotId(null);
    setBotOpen(false);
    api.patchSession(sessionId, botClearPatch()).catch((e: Error) => {
      emitToast(`Bot not cleared server-side: ${e.message}`);
    });
    emitToast('Plain chat — no bot');
  }, [sessionId]);

  const botName = sessionBotName(botId, bots);
  const pickerBots = filterPickerBots(bots, botQuery);

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
        {/* Bot picker (REQ-027): Grok-style switch-bot-in-chat. */}
        <span className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            title={botName ? `Chatting as ${botName} — click to switch` : 'Plain chat — click to chat as a bot'}
            aria-label={botName ? `Active bot ${botName}, switch bot` : 'Pick a bot for this chat'}
            aria-expanded={botOpen}
            onClick={() => setBotOpen((o) => !o)}
          >
            <BotIcon className="h-3 w-3 text-terracotta" />
            <span className="max-w-28 truncate">{botName ?? 'No bot'}</span>
          </Button>
          {botOpen && (
            <span className="absolute left-0 top-7 z-50 block w-64 overflow-hidden rounded-lg border border-line bg-white shadow-lg dark:bg-[#1E1E21]">
              <span className="block p-1.5">
                <input
                  aria-label="Search bots"
                  placeholder="Search bots"
                  value={botQuery}
                  onChange={(e) => setBotQuery(e.target.value)}
                  className="h-7 w-full rounded-md border border-line bg-white px-2 text-xs focus:border-terracotta/30 focus:outline-none dark:bg-[#0F0F11]"
                />
              </span>
              <span className="block max-h-56 overflow-auto pb-1">
                <button
                  onClick={clearBot}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-muted"
                >
                  <X className="h-3 w-3 text-zinc-400" />
                  Plain chat (no bot)
                  {!botName && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-terracotta" />}
                </button>
                {pickerBots.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => pickBot(b)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-muted"
                    title={`${b.description} · ${b.model}`}
                  >
                    <BotIcon className="h-3 w-3 shrink-0 text-terracotta" />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{b.name}</span>
                    <span className="shrink-0 truncate text-zinc-400">{b.model}</span>
                    {botId === b.id && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta" />}
                  </button>
                ))}
                {pickerBots.length === 0 && (
                  <span className="block px-3 py-4 text-center text-[11px] text-zinc-500">
                    No bots — create one in the Bots pane
                  </span>
                )}
              </span>
            </span>
          )}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" title="New session" aria-label="New session" onClick={() => runSlash('new', '')}>
            <Plus className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" title="Fork session" aria-label="Fork session" onClick={forkHere}>
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
          thinking={thinking}
          runError={done && lastError ? lastError : null}
          costLabel={costLabel}
          toolCalls={toolCalls}
          toolMarks={toolMarks}
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
        <span role="status" aria-live="polite" className="sr-only">
          {streaming ? 'Lokma is streaming a response.' : 'Response complete.'}
        </span>
        <Composer
          model={model}
          streaming={streaming}
          status={runStatus}
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
