import * as React from 'react';
import {
  Ban,
  ChevronDown,
  Cpu,
  Crown,
  Layers,
  Lock,
  RefreshCw,
  Shuffle,
  Square,
  Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type AgentLocksRes } from '@/lib/api';
import { useAgentStore } from '@/stores/agent';
import {
  PERSONA_OPTIONS,
  TERMINAL_STATES,
  formatBudget,
  normalizeAgent,
  queuePosition,
  stateTone,
  type HubAgent,
} from '@/components/agents';
import {
  ORCH_FILTERS,
  buildFanoutBodies,
  countLive,
  elapsedSince,
  emptyFanoutForm,
  filterTree,
  groupByState,
  killableIds,
  lineageGroups,
  lineageOf,
  validateFanoutForm,
  type FanoutForm,
  type OrchFilter,
} from './orchestration';

/**
 * OrchestrationPane — live agent tree over the real registry (W4-14).
 * Concept layout 1:1 (header + caps strip + state-grouped tree + lineage),
 * but every row is a real `GET /api/agents` entry kept live by WS
 * `agent_state` frames (create/pause/resume/kill/fork/clone/delete), every
 * Fan-out member is a real `POST /api/agents`, and Cancel-all really kills.
 * NOT ported: the concept's hardcoded AGENTS rows, the BUS message feed
 * (no bus exists in core yet), the heartbeat pill (no heartbeat loop
 * exists), and the toast-only Logs/Resume/Bus buttons — no dead buttons.
 * Run execution, pipeline phases and the bus land with the runner wave;
 * the footer says so instead of simulating them.
 */

const inputClass =
  'w-full rounded-md border border-line bg-white px-2 py-1 text-xs text-zinc-800 dark:bg-[#1E1E21] dark:text-zinc-100';

function LineageChip({ createdBy }: { createdBy: string }) {
  const { kind, parent } = lineageOf(createdBy);
  if (kind === 'human' || !parent) return null;
  const label = kind === 'fanout' ? `fan-out ${parent}` : `${kind} of ${parent}`;
  return (
    <span
      title={`createdBy: ${createdBy}`}
      className="px-1 py-0 rounded bg-[#6C5CE7]/10 border border-[#6C5CE7]/30 text-[#6C5CE7] text-[10px] truncate max-w-[140px]"
    >
      {label}
    </span>
  );
}

function OrchDetail({
  agent,
  canKill,
  killing,
  onKill,
}: {
  agent: HubAgent;
  canKill: boolean;
  killing: boolean;
  onKill: () => void;
}) {
  const [locks, setLocks] = React.useState<AgentLocksRes | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    api
      .getAgentLocks(agent.id)
      .then((r) => {
        if (!cancelled) setLocks(r);
      })
      .catch(() => {
        if (!cancelled) setLocks(null);
      });
    return () => {
      cancelled = true;
    };
  }, [agent.id]);

  const lockLine = locks
    ? `locks: ${Array.isArray(locks.locks) ? locks.locks.length : 0}${locks.expired ? ` (+${locks.expired} expired)` : ''} · worktrees: ${Array.isArray(locks.worktrees) ? locks.worktrees.length : 0}`
    : 'locks: loading…';

  return (
    <div className="mt-1.5 rounded-md border border-line bg-[#FAF9F5] dark:bg-[#0F0F11] p-2 text-[11px] text-zinc-600 dark:text-zinc-300">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span>
          persona <span className="font-medium text-zinc-800 dark:text-zinc-100">{agent.persona}</span>
        </span>
        <span className="truncate">
          model <span className="font-medium text-zinc-800 dark:text-zinc-100">{agent.model}</span>
        </span>
        <span>{formatBudget(agent.budgetTokens, agent.budgetUsd)}</span>
      </div>
      <div className="mt-0.5 truncate">cwd: {agent.cwd ?? 'repo root (server default)'}</div>
      <div className="mt-0.5">
        createdBy: {agent.createdBy}
        {agent.createdAt ? ` · created: ${new Date(agent.createdAt).toLocaleString()}` : ''}
      </div>
      <div className="mt-0.5 flex items-center gap-1">
        <Lock className="w-3 h-3" /> {lockLine}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-1.5 h-6 text-[11px] gap-1"
        disabled={!canKill || killing}
        title={canKill ? 'Kill this agent' : 'Terminal agents cannot be killed'}
        onClick={onKill}
      >
        <Square className="w-3 h-3" /> {killing ? 'Killing…' : 'Cancel agent'}
      </Button>
    </div>
  );
}

export function OrchestrationPane() {
  const { agents, caps, loading, lastError, refresh, move, create, clearLocks } = useAgentStore();
  const [filter, setFilter] = React.useState<OrchFilter>('all');
  const [now, setNow] = React.useState(() => Date.now());
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [fanoutOpen, setFanoutOpen] = React.useState(false);
  const [form, setForm] = React.useState<FanoutForm>(() => emptyFanoutForm());
  const [fanoutBusy, setFanoutBusy] = React.useState(false);
  const [fanoutProgress, setFanoutProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [fanoutReport, setFanoutReport] = React.useState<string | null>(null);
  const [confirmCancelAll, setConfirmCancelAll] = React.useState(false);
  const [cancelBusy, setCancelBusy] = React.useState(false);
  const [cancelReport, setCancelReport] = React.useState<string | null>(null);
  const [killingId, setKillingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // Elapsed labels tick without refetching the registry.
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const rows = React.useMemo(() => agents.map(normalizeAgent), [agents]);
  const counts = countLive(rows);
  const remaining = Math.max(0, caps.maxAgents - rows.length);
  const visible = filterTree(rows, filter);
  const treeGroups = groupByState(visible);
  const killTargets = killableIds(rows, TERMINAL_STATES);
  const batches = lineageGroups(rows);

  const set = (key: keyof FanoutForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleFanout = async () => {
    const problem = validateFanoutForm(form, remaining);
    if (problem) {
      setFanoutReport(problem);
      return;
    }
    const bodies = buildFanoutBodies(form);
    setFanoutBusy(true);
    setFanoutReport(null);
    setFanoutProgress({ done: 0, total: bodies.length });
    let ok = 0;
    const failures: string[] = [];
    for (const body of bodies) {
      try {
        await create(body);
        ok += 1;
      } catch (e) {
        failures.push(`${body.name}: ${e instanceof Error ? e.message : 'create failed'}`);
      }
      setFanoutProgress({ done: ok + failures.length, total: bodies.length });
    }
    setFanoutBusy(false);
    setFanoutProgress(null);
    setFanoutReport(
      failures.length === 0
        ? `${ok} agents created (fan-out ${form.stem.trim()}).`
        : `${ok} created, ${failures.length} failed — ${failures.join('; ')}`,
    );
  };

  const handleCancelAll = async () => {
    if (killTargets.length === 0) return;
    setCancelBusy(true);
    setCancelReport(null);
    let ok = 0;
    let failed = 0;
    for (const id of killTargets) {
      try {
        await move(id, 'kill');
        clearLocks(id);
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setCancelBusy(false);
    setConfirmCancelAll(false);
    setCancelReport(failed === 0 ? `${ok} agents cancelled.` : `${ok} cancelled, ${failed} failed.`);
  };

  const handleKillOne = async (id: string) => {
    setKillingId(id);
    try {
      await move(id, 'kill');
      clearLocks(id);
    } catch {
      // lastError in the store surfaces the failure; the row keeps its state.
    } finally {
      setKillingId(null);
    }
  };

  const formProblem = validateFanoutForm(form, remaining);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Cpu className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Orchestration</span>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-terracotta text-white text-[10px]">
          {counts.running} running · {counts.total} total
        </span>
        <span className="hidden lg:inline ml-1 text-[11px] text-zinc-400">live tree · fan-out · cancel</span>
        <span className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[11px] hidden sm:inline-flex gap-1"
            title="Create N agents from one template (real POST /api/agents each)"
            onClick={() => setFanoutOpen((v) => !v)}
          >
            <Shuffle className="w-3 h-3" /> Fan-out
          </Button>
          {confirmCancelAll ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-5 text-[11px] gap-1"
              disabled={cancelBusy || killTargets.length === 0}
              title={`Kill ${killTargets.length} non-terminal agents`}
              onClick={() => void handleCancelAll()}
            >
              <Ban className="w-3 h-3" /> {cancelBusy ? 'Cancelling…' : `Confirm (${killTargets.length})`}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[11px] gap-1"
              disabled={killTargets.length === 0}
              title={killTargets.length === 0 ? 'No live agents to cancel' : `Kill ${killTargets.length} non-terminal agents`}
              onClick={() => setConfirmCancelAll(true)}
            >
              <Ban className="w-3 h-3" /> Cancel all
            </Button>
          )}
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
        </span>
      </div>

      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-line/50 bg-muted/20 text-[11px] shrink-0 overflow-x-auto">
        <span className="px-1.5 py-0.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line flex items-center gap-1 shrink-0">
          <Crown className="w-3 h-3 text-amber-600" /> caps {caps.maxAgents}/{caps.maxConcurrent}/{caps.maxQueue}
        </span>
        <span className="px-1.5 py-0.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line shrink-0">
          {counts.queued} queued · {rows.length}/{caps.maxAgents} slots
        </span>
        {batches.length > 0 ? (
          <span className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#FDF0E6] border border-[#F2D5C2] dark:bg-[#2A1E15] shrink-0">
            <Layers className="w-3 h-3" /> {batches.length} lineage batch{batches.length === 1 ? '' : 'es'}
          </span>
        ) : null}
        <span className="ml-auto flex gap-1 shrink-0">
          {ORCH_FILTERS.map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'ghost'}
              size="sm"
              className="h-5 px-2 text-[11px] capitalize"
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
        </span>
      </div>

      {lastError ? (
        <div className="mx-2 mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">{lastError}</div>
      ) : null}
      {cancelReport ? (
        <div className="mx-2 mt-2 rounded-md border border-line bg-muted/50 p-2 text-[11px] text-zinc-600 dark:text-zinc-300">
          {cancelReport}
        </div>
      ) : null}

      <div className="flex-1 overflow-auto p-2 space-y-2">
        {fanoutOpen ? (
          <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
            <div className="text-xs font-medium flex items-center gap-1">
              <Shuffle className="w-3 h-3 text-terracotta" /> Fan-out — create N agents
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              One real registry entry per member (same validation as the Hub). {remaining} slot{remaining === 1 ? '' : 's'} left.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor="fanout-stem" className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  Name stem
                </label>
                <input
                  id="fanout-stem"
                  className={inputClass}
                  placeholder="Review team"
                  value={form.stem}
                  maxLength={40}
                  onChange={set('stem')}
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor="fanout-persona" className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  Persona
                </label>
                <select id="fanout-persona" className={inputClass} value={form.persona} onChange={set('persona')}>
                  {PERSONA_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor="fanout-model" className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  Model
                </label>
                <input
                  id="fanout-model"
                  className={inputClass}
                  placeholder="anthropic/claude-4-sonnet"
                  value={form.model}
                  onChange={set('model')}
                />
              </div>
              <div>
                <label htmlFor="fanout-count" className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  Count (1-20)
                </label>
                <input
                  id="fanout-count"
                  className={inputClass}
                  inputMode="numeric"
                  value={form.count}
                  onChange={set('count')}
                />
              </div>
              <div className="col-span-2">
                <label htmlFor="fanout-cwd" className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  Working directory <span className="font-normal text-zinc-400">(optional, must exist)</span>
                </label>
                <input
                  id="fanout-cwd"
                  className={inputClass}
                  placeholder="/mnt/apopic/lokma"
                  value={form.cwd}
                  onChange={set('cwd')}
                />
              </div>
            </div>
            {fanoutProgress ? (
              <div className="mt-2">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-terracotta transition-all"
                    style={{ width: `${Math.round((fanoutProgress.done / Math.max(1, fanoutProgress.total)) * 100)}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  Creating {fanoutProgress.done}/{fanoutProgress.total}…
                </div>
              </div>
            ) : null}
            {fanoutReport ? <div className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-300">{fanoutReport}</div> : null}
            <Button
              size="sm"
              className="mt-2 h-7 text-xs w-full gap-1"
              disabled={fanoutBusy || formProblem !== null}
              title={formProblem ?? 'Create the batch'}
              onClick={() => void handleFanout()}
            >
              <Shuffle className="w-3 h-3" /> {fanoutBusy ? 'Creating…' : 'Create batch'}
            </Button>
            {formProblem && !fanoutBusy ? <div className="mt-1 text-[11px] text-amber-700">{formProblem}</div> : null}
          </div>
        ) : null}

        {loading && rows.length === 0 ? (
          <div className="p-2 text-[11px] text-zinc-500">Loading agents…</div>
        ) : treeGroups.length === 0 ? (
          <div className="p-2 rounded-md bg-muted/50 border border-dashed border-line text-[11px] text-zinc-500">
            {rows.length === 0
              ? 'No agents yet — run a fan-out above or create one in the Agents tab. CLI-created agents appear after Refresh (cross-process live push is a later wave).'
              : `No ${filter} agents right now.`}
          </div>
        ) : (
          treeGroups.map((group) => (
            <div key={group.state} className="space-y-1.5">
              <div className="px-1 text-[11px] font-medium text-zinc-500 capitalize">
                {group.state} · {group.items.length}
              </div>
              {group.items.map((agent) => {
                const expanded = expandedId === agent.id;
                const position = queuePosition(rows, agent.id);
                const canKill = !TERMINAL_STATES.includes(agent.state);
                return (
                  <div
                    key={agent.id}
                    className="p-2.5 rounded-lg border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/20 transition"
                  >
                    <div className="flex gap-2">
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${stateTone(agent.state)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium flex items-center gap-1.5 truncate">
                          {agent.name}
                          <span className="font-normal text-zinc-400">· {agent.id}</span>
                          <span
                            className={`ml-1 px-1 py-0 rounded-full border text-[10px] ${
                              agent.state === 'running'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : agent.state === 'queued'
                                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                                  : 'bg-zinc-100 border-line text-zinc-600'
                            }`}
                          >
                            {agent.state}
                          </span>
                          {position !== null ? (
                            <span className="px-1 py-0 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10px]">
                              queue #{position}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-zinc-500 flex flex-wrap items-center gap-1 mt-1">
                          <span className="px-1 py-0 rounded bg-muted border border-line">{agent.persona}</span>
                          <span className="px-1 py-0 rounded bg-muted border border-line truncate max-w-[180px]">
                            {agent.model}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Timer className="w-3 h-3" /> {elapsedSince(agent.createdAt, now)}
                          </span>
                          <LineageChip createdBy={agent.createdBy} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0 items-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[10px] gap-1"
                          title={expanded ? 'Collapse detail' : 'Expand live detail (locks, budgets, cancel)'}
                          onClick={() => setExpandedId(expanded ? null : agent.id)}
                        >
                          <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                          {expanded ? 'Less' : 'Detail'}
                        </Button>
                      </div>
                    </div>
                    {expanded ? (
                      <OrchDetail
                        agent={agent}
                        canKill={canKill}
                        killing={killingId === agent.id}
                        onKill={() => void handleKillOne(agent.id)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))
        )}

        {batches.length > 0 ? (
          <div className="rounded-lg border border-line overflow-hidden">
            <div className="h-7 flex items-center px-3 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line text-xs font-medium">
              <Layers className="w-3 h-3" /> Lineage — where agents came from
              <span className="ml-auto text-[11px] font-normal text-zinc-400">{batches.length} batches</span>
            </div>
            <div className="divide-y divide-line/50">
              {batches.map((b) => (
                <div key={b.key} className="flex gap-2 px-3 py-1.5 text-xs hover:bg-muted/20">
                  <span className="px-1 py-0 rounded bg-[#FDF0E6] border border-[#F2D5C2] text-[10px] shrink-0">
                    {b.label}
                  </span>
                  <span className="ml-auto text-[11px] text-zinc-500 shrink-0">{b.count} agents</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="p-2 rounded-md bg-muted/50 border border-dashed border-line text-[11px] text-zinc-500">
          Live registry states only — run execution, pipeline phases and the agent bus arrive with the runner wave. Nothing
          here is simulated.
        </div>
      </div>
    </div>
  );
}
