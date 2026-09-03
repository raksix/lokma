import * as React from 'react';
import {
  Brain,
  Copy,
  Cpu,
  Crown,
  GitFork,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Square,
  Trash2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAgentStore } from '@/stores/agent';
import { AgentDialog } from './agent-dialog';
import {
  TERMINAL_STATES,
  formatBudget,
  initials,
  isAiCreated,
  normalizeAgent,
  queuePosition,
  stateTone,
  type HubAgent,
} from './agents';

/**
 * AgentsPane — real AgentHub registry over `GET/POST/PATCH/DELETE
 * /api/agents*` + lifecycle moves + SOUL.md/MEMORY.md editors (W4-13).
 * Concept layout 1:1 (header + caps banner + registry list + detail with
 * SOUL/MEMORY cards + budgets). The concept's hardcoded AGENTS rows, mock
 * token/cost figures and toast-only buttons are NOT ported — every control
 * hits a live endpoint, and live-run stats stay hidden until the
 * orchestration wave owns real numbers.
 */

function useAgentDocs(agentId: string | null) {
  const [soul, setSoul] = React.useState<string | null>(null);
  const [memory, setMemory] = React.useState<string | null>(null);
  const [docsError, setDocsError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState<'soul' | 'memory' | null>(null);

  React.useEffect(() => {
    setSoul(null);
    setMemory(null);
    setDocsError(null);
    if (!agentId) return;
    let cancelled = false;
    (async () => {
      try {
        const [s, m] = await Promise.all([api.getAgentDoc(agentId, 'soul'), api.getAgentDoc(agentId, 'memory')]);
        if (!cancelled) {
          setSoul(s.content);
          setMemory(m.content);
        }
      } catch (e) {
        if (!cancelled) setDocsError(e instanceof Error ? e.message : 'docs load failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const save = React.useCallback(
    async (doc: 'soul' | 'memory', content: string) => {
      if (!agentId) return;
      setSaving(doc);
      setDocsError(null);
      try {
        await api.saveAgentDoc(agentId, doc, content);
      } catch (e) {
        setDocsError(e instanceof Error ? e.message : 'doc save failed');
      } finally {
        setSaving(null);
      }
    },
    [agentId],
  );

  return { soul, setSoul, memory, setMemory, docsError, saving, save };
}

function useAgentLocks(agentId: string | null) {
  const [summary, setSummary] = React.useState<{ locks: number; expired: number; worktrees: number } | null>(null);
  React.useEffect(() => {
    setSummary(null);
    if (!agentId) return;
    let cancelled = false;
    api
      .getAgentLocks(agentId)
      .then((r) => {
        if (!cancelled) {
          const locks = Array.isArray(r.locks) ? r.locks.length : 0;
          const worktrees = Array.isArray(r.worktrees) ? r.worktrees.length : 0;
          setSummary({ locks, expired: typeof r.expired === 'number' ? r.expired : 0, worktrees });
        }
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);
  return summary;
}

function AgentRow({
  agent,
  selected,
  position,
  onSelect,
}: {
  agent: HubAgent;
  selected: boolean;
  position: number | null;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-2.5 rounded-lg border flex gap-2.5 transition ${
        selected
          ? 'bg-[#FDF0E6] border-[#F2D5C2] dark:bg-[#2A1E15] dark:border-[#3A2A1A]'
          : 'bg-white dark:bg-[#1E1E21] border-line hover:border-terracotta/20'
      }`}
    >
      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${stateTone(agent.state)}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold flex items-center gap-1.5">
          {agent.name} <span className="text-[11px] font-normal text-zinc-400">· {agent.id}</span>
          {isAiCreated(agent.createdBy) && <span className="px-1 py-0 rounded bg-[#6C5CE7] text-white text-[10px]">ai</span>}
          {position !== null && (
            <span className="px-1 py-0 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10px]">
              queue #{position}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          <span className="px-1 py-0 rounded bg-muted border border-line text-[10px]">{agent.persona}</span>
          <span className="px-1 py-0 rounded bg-white dark:bg-[#1E1E21] border border-line text-[10px]">
            {agent.model}
          </span>
          <span className="px-1 py-0 rounded-full border border-line bg-zinc-100 text-zinc-600 text-[10px]">
            {agent.state}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
          <span>{formatBudget(agent.budgetTokens, agent.budgetUsd)}</span>
          {agent.cwd ? <span className="truncate hidden sm:inline">{agent.cwd}</span> : null}
        </div>
      </div>
    </button>
  );
}

export function AgentsPane() {
  const { agents, caps, selectedAgentId, loading, lastError, refresh, selectAgent, create, update, move, copy, remove } =
    useAgentStore();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogBusy, setDialogBusy] = React.useState(false);
  const [dialogError, setDialogError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [editName, setEditName] = React.useState('');
  const [editModel, setEditModel] = React.useState('');
  const [editTokens, setEditTokens] = React.useState('');
  const [editUsd, setEditUsd] = React.useState('');
  const [editSaving, setEditSaving] = React.useState(false);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const rows = React.useMemo(() => agents.map(normalizeAgent), [agents]);
  const selected: HubAgent | null = React.useMemo(
    () => rows.find((a) => a.id === selectedAgentId) ?? null,
    [rows, selectedAgentId],
  );
  const running = rows.filter((a) => a.state === 'running').length;
  const registryFull = rows.length >= caps.maxAgents;

  const docs = useAgentDocs(selected?.id ?? null);
  const lockSummary = useAgentLocks(selected?.id ?? null);

  // Seed the edit form whenever the selection changes.
  React.useEffect(() => {
    setConfirmDelete(false);
    setEditName(selected?.name ?? '');
    setEditModel(selected?.model ?? '');
    setEditTokens(selected ? String(selected.budgetTokens) : '');
    setEditUsd(selected ? String(selected.budgetUsd) : '');
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate: React.ComponentProps<typeof AgentDialog>['onCreate'] = async (body) => {
    setDialogBusy(true);
    setDialogError(null);
    try {
      await create(body);
      setDialogOpen(false);
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : 'create failed');
    } finally {
      setDialogBusy(false);
    }
  };

  const handleSaveEdits = async () => {
    if (!selected) return;
    setEditSaving(true);
    try {
      const patch: { name?: string; model?: string; budgets?: { tokens?: number; usd?: number } } = {};
      if (editName.trim() && editName.trim() !== selected.name) patch.name = editName.trim();
      if (editModel.trim() && editModel.trim() !== selected.model) patch.model = editModel.trim();
      const budgets: { tokens?: number; usd?: number } = {};
      if (editTokens.trim() && Number(editTokens) !== selected.budgetTokens) budgets.tokens = Number(editTokens);
      if (editUsd.trim() && Number(editUsd) !== selected.budgetUsd) budgets.usd = Number(editUsd);
      if (Object.keys(budgets).length > 0) patch.budgets = budgets;
      if (Object.keys(patch).length === 0) return;
      await update(selected.id, patch);
    } catch {
      // lastError in the store surfaces the failure; the form keeps its values.
    } finally {
      setEditSaving(false);
    }
  };

  const canPause = selected && ['idle', 'queued', 'running'].includes(selected.state);
  const canResume = selected && selected.state === 'paused';
  const canKill = selected && !TERMINAL_STATES.includes(selected.state);
  const inputClass =
    'rounded-md border border-line bg-white px-2 py-1 text-xs text-zinc-800 dark:bg-[#1E1E21] dark:text-zinc-100';

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Users className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Agent Hub</span>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-terracotta text-white text-[10px]">
          {running} running · {rows.length} total
        </span>
        <span className="hidden sm:inline ml-1 text-[11px] text-zinc-400">SOUL · MEMORY · model · caps · queue</span>
        <Button size="sm" className="ml-auto h-5 text-[11px] gap-1" onClick={() => setDialogOpen(true)}>
          <Plus className="w-3 h-3" /> Create
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          title="Refresh registry"
          aria-label="Refresh registry"
          onClick={() => void refresh()}
        >
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      <div className="px-2 py-1.5 flex flex-wrap gap-1 border-b border-line/50 bg-muted/20 text-[11px] shrink-0">
        <span className="px-1.5 py-0.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line flex items-center gap-1">
          <Crown className="w-3 h-3 text-amber-600" />
          caps: maxAgents {caps.maxAgents} · maxConcurrent {caps.maxConcurrent} · maxQueue {caps.maxQueue}
        </span>
        {registryFull ? (
          <span className="px-1.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700">
            registry full — delete an agent before creating
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line">
            {rows.length}/{caps.maxAgents} slots used
          </span>
        )}
        <span className="px-1.5 py-0.5 rounded-full bg-[#FDF0E6] border border-[#F2D5C2] dark:bg-[#2A1E15]">
          maxSpawnDepth 3 · AUDIT.md
        </span>
      </div>

      {lastError ? (
        <div className="mx-2 mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">{lastError}</div>
      ) : null}

      <div className="flex flex-1 min-h-0">
        <div className="w-[46%] min-w-[200px] border-r border-line flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-1.5 space-y-1.5">
            {loading && rows.length === 0 ? (
              <div className="p-2 text-[11px] text-zinc-500">Loading agents…</div>
            ) : rows.length === 0 ? (
              <div className="p-2 rounded-md bg-muted/50 border border-dashed border-line text-[11px] text-zinc-500">
                No agents yet — create the first one with + Create. `lokma agent create` in the CLI lands here too.
              </div>
            ) : (
              rows.map((a) => (
                <AgentRow
                  key={a.id}
                  agent={a}
                  selected={a.id === selected?.id}
                  position={queuePosition(rows, a.id)}
                  onSelect={() => selectAgent(a.id)}
                />
              ))
            )}
            <div className="p-2 rounded-md bg-muted/50 border border-dashed border-line text-[11px] text-zinc-500">
              Orchestration shows the live tree, Hub shows the registry + budgets.
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-[#FAF9F5]/50 dark:bg-[#0F0F11]/50 overflow-auto">
          {!selected ? (
            <div className="p-4 text-[11px] text-zinc-500">Select an agent to inspect it.</div>
          ) : (
            <>
              <div className="p-3 border-b border-line/50 bg-white dark:bg-[#1E1E21]">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-[#262624] dark:bg-white text-white dark:text-black grid place-items-center text-xs font-bold">
                    {initials(selected.name)}
                  </span>
                  <div>
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      {selected.name} <span className="text-[11px] font-normal text-zinc-400">· {selected.id} · {selected.persona}</span>
                      <span className={`w-2 h-2 rounded-full ${stateTone(selected.state)}`} />
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {selected.cwd ? `cwd: ${selected.cwd} · ` : ''}createdBy: {selected.createdBy} · model{' '}
                      {selected.model} · {formatBudget(selected.budgetTokens, selected.budgetUsd)}
                      {queuePosition(rows, selected.id) !== null
                        ? ` · queue #${queuePosition(rows, selected.id)}`
                        : ''}
                      {lockSummary
                        ? ` · locks: ${lockSummary.locks}${lockSummary.expired ? ` (+${lockSummary.expired} expired)` : ''} · worktrees: ${lockSummary.worktrees}`
                        : ''}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    disabled={!canPause}
                    title={canPause ? 'Pause this agent' : 'Only idle/queued/running agents pause'}
                    onClick={() => void move(selected.id, 'pause').catch(() => undefined)}
                  >
                    <Pause className="w-3 h-3" /> Pause
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    disabled={!canResume}
                    title={canResume ? 'Resume this agent to idle' : 'Only paused agents resume'}
                    onClick={() => void move(selected.id, 'resume').catch(() => undefined)}
                  >
                    <Play className="w-3 h-3" /> Resume
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    disabled={!canKill}
                    title={canKill ? 'Kill this agent' : 'Terminal agents cannot be killed'}
                    onClick={() => void move(selected.id, 'kill').catch(() => undefined)}
                  >
                    <Square className="w-3 h-3" /> Kill
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    title="Fork into a new agent id (same SOUL/MEMORY)"
                    onClick={() => void copy(selected.id, 'fork').catch(() => undefined)}
                  >
                    <GitFork className="w-3 h-3" /> Fork
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    title="Clone into a new agent id (full copy)"
                    onClick={() => void copy(selected.id, 'clone').catch(() => undefined)}
                  >
                    <Copy className="w-3 h-3" /> Clone
                  </Button>
                  {confirmDelete ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-6 text-xs gap-1"
                      title="Click again to confirm deletion"
                      onClick={() => {
                        void remove(selected.id)
                          .then(() => setConfirmDelete(false))
                          .catch(() => undefined);
                      }}
                    >
                      <Trash2 className="w-3 h-3" /> Confirm delete
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs gap-1"
                      title="Delete this agent"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </Button>
                  )}
                </div>
              </div>

              <div className="p-2 space-y-2">
                <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                  <div className="text-xs font-medium">Name · model · budgets</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="hub-edit-name"
                        className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
                      >
                        Name
                      </label>
                      <input
                        id="hub-edit-name"
                        className={`${inputClass} w-full`}
                        value={editName}
                        maxLength={40}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="hub-edit-model"
                        className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
                      >
                        Model
                      </label>
                      <input
                        id="hub-edit-model"
                        className={`${inputClass} w-full`}
                        value={editModel}
                        onChange={(e) => setEditModel(e.target.value)}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="hub-edit-tokens"
                        className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
                      >
                        Token budget
                      </label>
                      <input
                        id="hub-edit-tokens"
                        className={`${inputClass} w-full`}
                        inputMode="numeric"
                        value={editTokens}
                        onChange={(e) => setEditTokens(e.target.value)}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="hub-edit-usd"
                        className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
                      >
                        USD budget
                      </label>
                      <input
                        id="hub-edit-usd"
                        className={`${inputClass} w-full`}
                        inputMode="decimal"
                        value={editUsd}
                        onChange={(e) => setEditUsd(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-6 text-xs w-full"
                    disabled={editSaving}
                    onClick={() => void handleSaveEdits()}
                  >
                    {editSaving ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                  <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                    <div className="text-xs font-medium flex items-center gap-1">
                      <Brain className="w-3 h-3 text-terracotta" /> SOUL.md
                    </div>
                    <label
                      htmlFor="hub-soul"
                      className="mt-1 mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
                    >
                      Agent personality (real file)
                    </label>
                    <textarea
                      id="hub-soul"
                      className={`${inputClass} w-full h-32 font-mono text-[11px] leading-5`}
                      value={docs.soul ?? ''}
                      placeholder={docs.soul === null ? 'Loading SOUL.md…' : undefined}
                      onChange={(e) => docs.setSoul(e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-5 text-[11px] w-full"
                      disabled={docs.saving !== null || docs.soul === null}
                      onClick={() => void docs.save('soul', docs.soul ?? '')}
                    >
                      {docs.saving === 'soul' ? 'Saving…' : 'Save SOUL.md'}
                    </Button>
                  </div>
                  <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                    <div className="text-xs font-medium flex items-center gap-1">
                      <Cpu className="w-3 h-3" /> MEMORY.md · budgets
                    </div>
                    <label
                      htmlFor="hub-memory"
                      className="mt-1 mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
                    >
                      Per-agent memory (real file)
                    </label>
                    <textarea
                      id="hub-memory"
                      className={`${inputClass} w-full h-24 font-mono text-[11px] leading-5`}
                      value={docs.memory ?? ''}
                      placeholder={docs.memory === null ? 'Loading MEMORY.md…' : undefined}
                      onChange={(e) => docs.setMemory(e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-5 text-[11px] w-full"
                      disabled={docs.saving !== null || docs.memory === null}
                      onClick={() => void docs.save('memory', docs.memory ?? '')}
                    >
                      {docs.saving === 'memory' ? 'Saving…' : 'Save MEMORY.md'}
                    </Button>
                    <div className="mt-2 h-1.5 rounded-full bg-line overflow-hidden" title="Budget is a configured cap — live spend accrues with orchestration runs">
                      <div className="h-full bg-terracotta" style={{ width: '0%' }} />
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-1 flex justify-between">
                      <span>{formatBudget(selected.budgetTokens, selected.budgetUsd)} cap</span>
                      <span className="flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" /> hard stop at 100%
                      </span>
                    </div>
                  </div>
                </div>
                {docs.docsError ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
                    {docs.docsError}
                  </div>
                ) : null}

                <div className="rounded-md bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] p-2 text-[11px] text-zinc-600 dark:text-zinc-300">
                  Self-spawn: <code className="px-1 py-0 rounded bg-white dark:bg-[#1E1E21] border border-line">create_agent</code>{' '}
                  tool gated by agent-spawner skill — createdBy ai:parentId + AUDIT.md + maxSpawnDepth 3. Live spend +
                  run tree arrive with the Orchestration pane — the Hub never invents usage figures.
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <AgentDialog
        open={dialogOpen}
        busy={dialogBusy}
        serverError={dialogError}
        onClose={() => setDialogOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
