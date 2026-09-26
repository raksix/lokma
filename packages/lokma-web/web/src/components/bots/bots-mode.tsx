import * as React from 'react';
import { Bot as BotIcon, Plus, Search } from 'lucide-react';
import { api, type BotWithSession } from '@/lib/api';
import { Chat } from '@/components/chat';
import { useWs } from '@/hooks/use-ws';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/stores';
import { relativeTime } from '@/components/sessions/grouping';
import { emitToast } from '@/components/shell';
import { BotDialog } from './bot-dialog';
import { emptyCreateForm, initials, type CreateBotForm } from './bots';
import { filterPickerBots } from './bot-chat';
import { readSelectedBot, writeSelectedBot } from './mode';

/**
 * BotsMode — REQ-161. The Bots section is a SEPARATE surface from the chat /
 * workspace mode: header + bot list on the left, the selected bot's chat on
 * the right. No rails, no sidebars, no tiling — and the normal mode's layout
 * stays untouched while this renders (its stores keep everything).
 *
 * One bot = one continuous chat: selecting a bot opens its newest bot-bound
 * session, and a bot that has never been chatted with gets its real session
 * minted on first open (`POST /api/sessions { botId, model }` — the same
 * server flow the old gallery's Chat button used, messages really send).
 */

/** Chat surface for one bot — owns its own socket (keyed by session). */
function BotChat({
  sessionId,
  botName,
  onOpenSession,
}: {
  sessionId: string;
  botName: string;
  onOpenSession?: (id: string) => void;
}) {
  const ws = useWs(sessionId);
  return (
    <Chat
      sessionId={sessionId}
      ws={ws}
      onOpenSession={onOpenSession}
      composerPlaceholder={`Message ${botName}`}
    />
  );
}

/** One bot list row: avatar, name, last activity, last-message preview. */
function BotRow({
  bot,
  active,
  onSelect,
}: {
  bot: BotWithSession;
  active: boolean;
  onSelect: () => void;
}) {
  const last = bot.lastSession ?? null;
  return (
    <button
      type="button"
      data-bot-row={bot.id}
      aria-current={active ? 'true' : undefined}
      onClick={onSelect}
      className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left ${
        active ? 'bg-paper shadow-sm ring-1 ring-line' : 'hover:bg-white/60'
      }`}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#262624] text-[10px] font-semibold text-white">
        {initials(bot.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-[12.5px] font-medium text-ink">{bot.name}</span>
          {last?.running ? (
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" title="Working" />
          ) : null}
          <span className="ml-auto shrink-0 text-[10.5px] text-zinc-400">
            {last?.updatedAt ? relativeTime(last.updatedAt) : ''}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-zinc-500" data-bot-preview={bot.id}>
          {last?.preview || bot.description}
        </span>
      </span>
    </button>
  );
}

export function BotsMode({ onOpenSession }: { onOpenSession?: (id: string) => void }) {
  const [bots, setBots] = React.useState<BotWithSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | null>(() => readSelectedBot());
  const [showCreate, setShowCreate] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [opening, setOpening] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);
  const openingRef = React.useRef(false);

  const load = React.useCallback(async () => {
    try {
      const res = await api.listBots({ sessions: true });
      setBots(res.bots);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load bots');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selected = React.useMemo(
    () => bots.find((b) => b.id === selectedId) ?? null,
    [bots, selectedId],
  );
  // One bot = one chat: the row's lastSession IS the chat target, so a
  // creation below only has to update the list — nothing can drift out of
  // sync with the selection.
  const sessionId = selected?.lastSession?.id ?? null;

  /** Select a bot and open its chat, minting the bot-bound session on first use. */
  const openBot = React.useCallback(async (bot: BotWithSession) => {
    setSelectedId(bot.id);
    writeSelectedBot(bot.id);
    setChatError(null);
    if (bot.lastSession?.id) return;
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    try {
      const res = await api.createSession({ botId: bot.id, model: bot.model });
      void useSessionStore.getState().refreshSessions();
      const stamp = new Date().toISOString();
      setBots((prev) =>
        prev.map((b) =>
          b.id === bot.id
            ? {
                ...b,
                lastSession: {
                  id: res.id,
                  title: '',
                  updatedAt: stamp,
                  preview: '',
                  running: false,
                  queued: 0,
                },
              }
            : b,
        ),
      );
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Could not open this bot chat');
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  }, []);

  // Restore the remembered selection once the list arrives (mode persistence):
  // a vanished bot is dropped, a bot without a chat is opened.
  const restoredRef = React.useRef(false);
  React.useEffect(() => {
    if (restoredRef.current || loading || bots.length === 0) return;
    restoredRef.current = true;
    if (!selectedId) return;
    const remembered = bots.find((b) => b.id === selectedId);
    if (!remembered) {
      setSelectedId(null);
      writeSelectedBot(null);
      return;
    }
    if (!remembered.lastSession?.id) void openBot(remembered);
  }, [bots, loading, selectedId, openBot]);

  const visible = React.useMemo(() => filterPickerBots(bots, query), [bots, query]);

  const submitCreate = React.useCallback(
    async (form: CreateBotForm) => {
      setCreating(true);
      setCreateError(null);
      try {
        const res = await api.createBot({
          name: form.name.trim(),
          description: form.description.trim(),
          model: form.model.trim(),
          visibility: form.visibility,
          ...(form.systemPrompt.trim() ? { systemPrompt: form.systemPrompt.trim() } : {}),
        });
        setShowCreate(false);
        const created: BotWithSession = { ...res.bot, lastSession: null };
        setBots((prev) => [created, ...prev]);
        emitToast(`Bot ${created.name} created`);
        void openBot(created);
        void load();
      } catch (e) {
        setCreateError(e instanceof Error ? e.message : 'Create failed');
      } finally {
        setCreating(false);
      }
    },
    [load, openBot],
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden" data-bots-mode>
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-line bg-muted sm:w-[300px]">
        <div className="space-y-2 border-b border-line p-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink">Bots</span>
            <span className="text-[11px] text-zinc-500">{bots.length}</span>
          </div>
          <Button
            size="sm"
            data-new-bot
            className="h-7 w-full gap-1.5 text-xs"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Bot
          </Button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              aria-label="Search bots"
              data-bot-search
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-7 w-full rounded-md border border-line bg-paper pl-7 pr-2 text-xs text-ink placeholder:text-zinc-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? <div className="p-2 text-xs text-zinc-500">Loading bots…</div> : null}
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">{error}</div>
          ) : null}
          {!loading && visible.length === 0 ? (
            <div className="p-2 text-xs text-zinc-500" data-bots-list-empty>
              {bots.length === 0 ? 'No bots yet — create your first one.' : 'No bots match your search.'}
            </div>
          ) : null}
          {visible.map((bot) => (
            <BotRow key={bot.id} bot={bot} active={bot.id === selectedId} onSelect={() => void openBot(bot)} />
          ))}
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden p-2 sm:p-3">
        {selected ? (
          <>
            <div className="mb-2 flex shrink-0 items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#262624] text-[10px] font-semibold text-white">
                {initials(selected.name)}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-semibold text-ink" data-bot-title>
                    {selected.name}
                  </span>
                  <span className="shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[10px] text-zinc-500">
                    {selected.model}
                  </span>
                </div>
                <div className="truncate text-[11px] text-zinc-500">{selected.description}</div>
              </div>
            </div>
            {sessionId ? (
              <BotChat
                key={sessionId}
                sessionId={sessionId}
                botName={selected.name}
                onOpenSession={onOpenSession}
              />
            ) : (
              <div className="grid flex-1 place-items-center" data-bot-chat-pending>
                <div className="text-center text-xs text-zinc-500">
                  {chatError ? (
                    <>
                      <div className="text-red-600">{chatError}</div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 text-xs"
                        onClick={() => void openBot(selected)}
                      >
                        Try again
                      </Button>
                    </>
                  ) : (
                    'Opening chat…'
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="grid flex-1 place-items-center" data-bots-empty>
            <div className="text-center">
              <BotIcon className="mx-auto h-8 w-8 text-zinc-300" />
              <div className="mt-2 text-sm font-medium text-ink">
                {opening ? 'Opening chat…' : 'Pick a bot to chat'}
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Bots live in their own section — sessions stay in the lokma mode.
              </p>
            </div>
          </div>
        )}
      </main>
      {showCreate ? (
        <BotDialog
          initial={emptyCreateForm}
          busy={creating}
          error={createError}
          onCancel={() => setShowCreate(false)}
          onSubmit={(form) => void submitCreate(form)}
        />
      ) : null}
    </div>
  );
}
