import * as React from 'react';
import { Bot as BotIcon, CheckCircle2, Copy, GitFork, Play, RefreshCw, Search, Share2, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, api, type AgentInfo, type Bot, type BotVisibility } from '@/lib/api';
import {
  BOT_TABS,
  agentCountFor,
  deleteBlockReason,
  emptyCreateForm,
  filterBots,
  formatBudgets,
  initials,
  sourceLabel,
  tabCounts,
  validateForkForm,
  validateTaskForm,
  type BotTab,
  type CreateBotForm,
} from './bots';
import { BotDialog } from './bot-dialog';

const inputClass =
  'h-7 rounded-md border border-line bg-white px-2 text-xs focus:outline-none focus:border-terracotta/30 dark:bg-[#1E1E21]';

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('lokma-toast', { detail: message }));
}

function errMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
}

const LIFECYCLE = ['Create', 'Playground', 'Publish', 'Fork', 'Run → Agent'] as const;

/**
 * BotsPane — Bot Gallery (W5-20, Docs/35 + Docs/37 lokma-ceo).
 * Concept layout 1:1 (Featured/Mine/Shared tabs + search + cards +
 * detail with Run/Fork/Publish/bot.json + lifecycle strip + bot.json
 * preview + playground note), but every pixel is live: rows come from
 * `GET /api/bots` (bundled lokma-ceo + `~/.lokma/bots/`), Run spawns a
 * REAL agent + session (`POST /api/bots/:id/run`), Fork clones the real
 * `bot.json` (`POST /:id/fork`), Publish flips real visibility
 * (`POST /:id/publish`), Delete removes the real dir
 * (`DELETE /api/bots/:id`, two-click arm, bundled stays read-only),
 * and bot.json copies the loaded record.
 * NOT ported: the concept's mock BOTS rows with invented run counts
 * (the pane counts live agents instead, labeled as such), its
 * toast-only Create/Hub buttons (Create opens a real dialog, Hub is a
 * follow-up note — no dead buttons), and the persona chip (bot.json
 * has no persona field; `createdFrom` shows the SOUL/fork origin).
 * Honest scope: a run's agent starts idle — run execution lands with
 * the agent runner, a later wave; the pane says so next to the button.
 */
export function BotsPane({ onOpenSession }: { onOpenSession?: (id: string) => void }) {
  const [bots, setBots] = React.useState<Bot[]>([]);
  const [agents, setAgents] = React.useState<AgentInfo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<BotTab>('featured');
  const [query, setQuery] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  // Detail-side action state (all live endpoints).
  const [task, setTask] = React.useState('');
  const [taskError, setTaskError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const [runResult, setRunResult] = React.useState<{ agentId: string; sessionId: string } | null>(null);
  const [forkAs, setForkAs] = React.useState('');
  const [forkError, setForkError] = React.useState<string | null>(null);
  const [forking, setForking] = React.useState(false);
  const [publishVisibility, setPublishVisibility] = React.useState<BotVisibility>('shared');
  const [publishing, setPublishing] = React.useState(false);
  // Two-click delete arm (cron-pane pattern) + in-flight flag.
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async (keepSelection?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listBots();
      setBots(res.bots);
      setSelectedId((prev) => {
        const want = keepSelection ?? prev;
        if (want && res.bots.some((b) => b.id === want)) return want;
        return res.bots.find((b) => b.id === 'lokma-ceo')?.id ?? res.bots[0]?.id ?? null;
      });
      try {
        const agentsRes = await api.listAgents();
        setAgents(agentsRes.agents);
      } catch {
        // Agent counts are a nicety — the Gallery works without them.
        setAgents([]);
      }
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load ]);

  const counts = tabCounts(bots);
  const visible = filterBots(bots, tab, query);
  const selected = bots.find((b) => b.id === selectedId) ?? null;

  React.useEffect(() => {
    setRunResult(null);
    setTaskError(null);
    setForkError(null);
    setForkAs('');
    setConfirmDelete(null);
  }, [selectedId]);

  async function createBot(form: CreateBotForm): Promise<void> {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.createBot({
        name: form.name.trim(),
        description: form.description.trim(),
        model: form.model.trim(),
        ...(form.systemPrompt.trim() ? { systemPrompt: form.systemPrompt } : {}),
        visibility: form.visibility,
      });
      setShowCreate(false);
      toast(`Bot created: ${res.bot.id}`);
      await load(res.bot.id);
      setTab('mine');
    } catch (e) {
      setCreateError(errMessage(e));
    } finally {
      setCreating(false);
    }
  }

  async function runSelected(): Promise<void> {
    if (!selected) return;
    const invalid = validateTaskForm(task);
    if (invalid) {
      setTaskError(invalid);
      return;
    }
    setTaskError(null);
    setRunning(true);
    try {
      const res = await api.runBot(selected.id, { task: task.trim() });
      setRunResult({ agentId: res.agentId, sessionId: res.sessionId });
      setTask('');
      toast(`Agent started: ${res.agentId}`);
      await load(selected.id);
    } catch (e) {
      setTaskError(errMessage(e));
    } finally {
      setRunning(false);
    }
  }

  async function forkSelected(): Promise<void> {
    if (!selected) return;
    const invalid = validateForkForm(forkAs);
    if (invalid) {
      setForkError(invalid);
      return;
    }
    setForkError(null);
    setForking(true);
    try {
      const res = await api.forkBot(selected.id, forkAs.trim() ? { as: forkAs.trim() } : {});
      setForkAs('');
      toast(`Forked as ${res.bot.id}`);
      await load(res.bot.id);
      setTab('mine');
    } catch (e) {
      setForkError(errMessage(e));
    } finally {
      setForking(false);
    }
  }

  async function publishSelected(): Promise<void> {
    if (!selected) return;
    setPublishing(true);
    try {
      const res = await api.publishBot(selected.id, { visibility: publishVisibility });
      toast(`Visibility: ${res.visibility}`);
      await load(selected.id);
    } catch (e) {
      toast(`Publish failed: ${errMessage(e)}`);
    } finally {
      setPublishing(false);
    }
  }

  async function deleteSelected(): Promise<void> {
    if (!selected || deleting) return;
    if (confirmDelete !== selected.id) {
      setConfirmDelete(selected.id);
      return;
    }
    setConfirmDelete(null);
    setDeleting(true);
    try {
      await api.deleteBot(selected.id);
      toast(`Bot deleted: ${selected.id}`);
      // The id is gone, so load() falls back to lokma-ceo/first.
      await load();
    } catch (e) {
      toast(`Delete failed: ${errMessage(e)}`);
    } finally {
      setDeleting(false);
    }
  }

  function copyBotJson(): void {
    if (!selected) return;
    const doc = {
      id: selected.id,
      name: selected.name,
      model: selected.model,
      fallback: selected.fallback,
      memoryScope: selected.memoryScope,
      budgets: selected.budgets,
      visibility: selected.visibility,
      version: selected.version,
      createdFrom: selected.createdFrom,
      tags: selected.tags,
    };
    try {
      void navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
      toast('bot.json copied');
    } catch {
      toast('Copy failed — clipboard unavailable');
    }
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <BotIcon className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Bots</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">
          bot.json · persona→bot→agent · Gallery
        </span>
        <Button size="sm" className="ml-auto h-5 text-[11px] gap-1" onClick={() => { setCreateError(null); setShowCreate(true); }}>
          <Sparkles className="w-3 h-3" /> Create Bot
        </Button>
      </div>

      <div className="flex items-center gap-1 p-1.5 border-b border-line/60 bg-muted/20 shrink-0">
        {BOT_TABS.map((t) => (
          <Button
            key={t}
            variant={tab === t ? 'default' : 'ghost'}
            size="sm"
            className="h-6 text-[11px] capitalize"
            onClick={() => setTab(t)}
          >
            {t} · {counts[t]}
          </Button>
        ))}
        <div className="relative ml-auto w-[160px] hidden sm:block">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
          <Input
            aria-label="Search bots"
            placeholder="Search bots..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-7 h-6 text-xs"
          />
        </div>
      </div>

      {showCreate && (
        <BotDialog
          initial={emptyCreateForm}
          busy={creating}
          error={createError}
          onCancel={() => setShowCreate(false)}
          onSubmit={(form) => void createBot(form)}
        />
      )}

      <div className="flex flex-1 min-h-0">
        <div className="w-[44%] min-w-[180px] border-r border-line flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-1.5 space-y-1.5">
            {loading ? (
              <div className="p-6 text-center text-xs text-zinc-400">Loading bots…</div>
            ) : error ? (
              <div className="p-2 rounded-md border border-red-200 bg-red-50 text-xs text-red-700">
                {error}{' '}
                <Button variant="outline" size="sm" className="h-5 ml-1 text-[11px]" onClick={() => void load()}>
                  Retry
                </Button>
              </div>
            ) : (
              <>
                {visible.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedId(b.id)}
                    className={`w-full text-left p-2.5 rounded-lg border flex gap-2.5 transition ${
                      selectedId === b.id
                        ? 'bg-[#FDF0E6] border-[#F2D5C2] dark:bg-[#2A1E15] dark:border-[#3A2A1A]'
                        : 'bg-white dark:bg-[#1E1E21] border-line hover:border-terracotta/20'
                    }`}
                  >
                    <span className="w-8 h-8 rounded-lg bg-[#262624] dark:bg-white text-white dark:text-black grid place-items-center text-xs font-bold shrink-0">
                      {initials(b.name)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold flex items-center gap-1">
                        {b.name}
                        {b.featured && (
                          <span className="px-1 py-0 rounded-full bg-terracotta text-white text-[10px]">
                            Featured
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 line-clamp-2 leading-4">{b.description}</div>
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-400">
                        <span className="px-1 py-0 rounded bg-muted border border-line">{b.model}</span>
                        <span className="px-1 py-0 rounded bg-muted border border-line">v{b.version}</span>
                        <span className="ml-auto">
                          {agentCountFor(b.id, agents)} agents · {sourceLabel(b.source)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
                {visible.length === 0 && (
                  <div className="p-6 text-center text-xs text-zinc-400">
                    {bots.length === 0 ? 'No bots yet — press Create Bot for the first one.' : `No bots in ${tab}`}
                  </div>
                )}
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-5 text-[11px] gap-1"
              aria-label="Refresh bots"
              onClick={() => void load()}
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-[#FAF9F5]/50 dark:bg-[#0F0F11]/50 overflow-auto">
          {!selected ? (
            <div className="p-6 text-center text-xs text-zinc-400">
              {loading ? 'Loading…' : 'Select a bot to see its detail.'}
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-line/50 bg-white dark:bg-[#1E1E21]">
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-xl bg-[#262624] dark:bg-white text-white dark:text-black grid place-items-center text-sm font-bold shrink-0">
                    {initials(selected.name)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      {selected.name} <span className="text-[11px] font-normal text-zinc-400">· {selected.id}</span>
                    </div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">{selected.description}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span className="px-1.5 py-0.5 rounded-full bg-muted border border-line text-[11px]">
                        model: {selected.model}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-full bg-muted border border-line text-[11px]">
                        {formatBudgets(selected.budgets)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-full bg-white border border-line text-[11px]">
                        {agentCountFor(selected.id, agents)} live agents · {sourceLabel(selected.source)} ·{' '}
                        {selected.visibility}
                      </span>
                    </div>
                    {selected.createdFrom && (
                      <div className="mt-1 text-[11px] text-zinc-400">forked from {selected.createdFrom}</div>
                    )}
                  </div>
                  <Button
                    variant={confirmDelete === selected.id ? 'destructive' : 'ghost'}
                    size="sm"
                    className="h-6 text-[11px] gap-1 shrink-0"
                    aria-label={confirmDelete === selected.id ? 'Confirm bot delete' : 'Delete bot'}
                    title={
                      deleteBlockReason(selected) ??
                      (confirmDelete === selected.id ? 'Click again to confirm delete' : 'Delete this bot')
                    }
                    disabled={deleting || deleteBlockReason(selected) !== null}
                    onClick={() => void deleteSelected()}
                  >
                    <Trash2 className="w-3 h-3" />
                    {confirmDelete === selected.id ? 'Confirm?' : deleting ? 'Deleting…' : 'Delete'}
                  </Button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-4">
                  <Button size="sm" className="h-7 text-xs gap-1" disabled={running} onClick={() => void runSelected()}>
                    <Play className="w-3 h-3" /> {running ? 'Starting…' : 'Run'}
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={forking} onClick={() => void forkSelected()}>
                    <GitFork className="w-3 h-3" /> {forking ? 'Forking…' : 'Fork'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={publishing || selected.source === 'bundled'}
                    onClick={() => void publishSelected()}
                  >
                    <Share2 className="w-3 h-3" /> {publishing ? 'Saving…' : 'Publish'}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={copyBotJson}>
                    <Copy className="w-3 h-3" /> bot.json
                  </Button>
                </div>

                <div className="mt-2 space-y-2">
                  <div>
                    <label htmlFor="bot-task" className="text-[11px] font-medium text-zinc-500">
                      Playground task — Run spawns a real agent + session for this task
                    </label>
                    <div className="mt-1 flex gap-1">
                      <Input
                        id="bot-task"
                        className={inputClass}
                        placeholder="Review the Phase 1 slices for this week"
                        value={task}
                        onChange={(e) => setTask(e.target.value)}
                      />
                      <Button size="sm" className="h-7 text-xs shrink-0" disabled={running} onClick={() => void runSelected()} title="Run bot with task" aria-label="Run bot with task">
                        <Play className="w-3 h-3" />
                      </Button>
                    </div>
                    {taskError && <div className="mt-1 text-[11px] text-red-600">{taskError}</div>}
                    {runResult && (
                      <div className="mt-1 p-2 rounded-md border border-emerald-200 bg-emerald-50 text-[11px] text-emerald-800 flex items-center gap-1 flex-wrap">
                        <CheckCircle2 className="w-3 h-3" />
                        Agent <span className="font-mono">{runResult.agentId}</span> started (idle until the
                        runner lands) · session <span className="font-mono">{runResult.sessionId}</span>
                        {onOpenSession && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-5 ml-auto text-[11px] bg-white"
                            onClick={() => onOpenSession(runResult.sessionId)}
                          >
                            Open session
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <div className="flex-1">
                      <label htmlFor="bot-fork-as" className="text-[11px] font-medium text-zinc-500">
                        Fork as (blank = {selected.id}-fork)
                      </label>
                      <Input
                        id="bot-fork-as"
                        className={`${inputClass} mt-1`}
                        placeholder={`${selected.id}-fork`}
                        value={forkAs}
                        onChange={(e) => setForkAs(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="bot-publish-vis" className="text-[11px] font-medium text-zinc-500">
                        Visibility
                      </label>
                      <select
                        id="bot-publish-vis"
                        className={`${inputClass} mt-1`}
                        value={publishVisibility}
                        onChange={(e) => setPublishVisibility(e.target.value as BotVisibility)}
                      >
                        <option value="shared">shared</option>
                        <option value="public">public</option>
                        <option value="private">private</option>
                      </select>
                    </div>
                  </div>
                  {forkError && <div className="text-[11px] text-red-600">{forkError}</div>}
                  {selected.source === 'bundled' && (
                    <div className="text-[11px] text-zinc-500">
                      Bundled templates are read-only — fork to customize, Publish stays disabled.
                    </div>
                  )}
                </div>
              </div>

              <div className="p-2 space-y-2">
                <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                  <div className="text-xs font-medium">Lifecycle — create → playground → publish → fork → run</div>
                  <div className="mt-2 flex items-center gap-1 overflow-x-auto">
                    {LIFECYCLE.map((step, i) => (
                      <span key={step} className="flex items-center gap-1 shrink-0">
                        <span
                          className={`px-2 py-1 rounded-full border text-[11px] ${
                            i === 4 ? 'bg-terracotta text-white border-terracotta' : 'bg-muted border-line'
                          }`}
                        >
                          {i + 1}. {step}
                        </span>
                        {i < 4 && <span className="text-zinc-300">→</span>}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500">
                    Run spawns a real agent (persona SOUL = system prompt + model + budgets) — same registry the
                    Agents tab manages. Hub/marketplace sharing is a follow-up (Docs/35 §6).
                  </div>
                </div>

                <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                  <div className="text-xs font-medium">bot.json — stored record</div>
                  <pre className="mt-2 p-2 rounded bg-[#0F0F11] text-white/90 border border-white/10 text-[11px] leading-5 overflow-auto">
                    {JSON.stringify(
                      {
                        id: selected.id,
                        name: selected.name,
                        model: selected.model,
                        fallback: selected.fallback,
                        memoryScope: selected.memoryScope,
                        budgets: selected.budgets,
                        visibility: selected.visibility,
                        version: selected.version,
                        createdFrom: selected.createdFrom,
                        tags: selected.tags,
                      },
                      null,
                      2,
                    )}
                  </pre>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    persona → bot → agent mapping · tools {selected.tools.length} · skills {selected.skills.length} ·
                    knowledge {selected.knowledgeFiles.length} files
                  </div>
                </div>

                <div className="rounded-md bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] p-2 text-[11px] text-zinc-600 dark:text-zinc-300">
                  Playground: run the bot with a task above — a real session opens for chat, tagged bot:{selected.id}.
                  Try before you publish.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
