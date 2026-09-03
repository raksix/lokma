import * as React from 'react';
import { Activity, Cpu, Eye, GitBranch, Layers, RefreshCw, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError, api, type AgentTraceRes, type ShareSummaryView, type TraceEventView } from '@/lib/api';
import { normalizeAgent, stateTone } from '@/components/agents';
import {
  agentBadge,
  asReplayRow,
  asSessionSnapshot,
  eventTone,
  filterTraceEvents,
  formatAge,
  formatBytes,
  formatElapsed,
  replayExcerpt,
  safeSummary,
  timelineRange,
  type TraceFilter,
} from './observability';

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('lokma-toast', { detail: message }));
}

function errMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
}

const selectClass =
  'h-7 rounded-md border border-line bg-white dark:bg-[#1E1E21] px-2 text-xs w-full';

/** One timeline row — shared by the live trace and frozen agent snapshots. */
function TraceRow({ ev, baseTs, agentId }: { ev: TraceEventView; baseTs: string; agentId: string }) {
  return (
    <div className="relative flex gap-2">
      <span className={`absolute -left-[9px] top-1 w-2 h-2 rounded-full ${eventTone(ev.kind)}`} />
      <span className="text-white/40 w-10 shrink-0">{formatElapsed(ev.ts, baseTs)}</span>
      <span className={`px-1 py-0 rounded text-[10px] border shrink-0 ${agentBadge(agentId)}`}>{agentId}</span>
      <span className="px-1 py-0 rounded bg-white/5 border border-white/10 text-white/80">{ev.kind}</span>
      <span className="text-white/60 truncate flex-1 hidden sm:inline" title={ev.detail ?? ev.label}>
        {ev.label}
        {ev.detail ? ` — ${ev.detail}` : ''}
      </span>
      <span className="ml-auto text-white/30 hidden md:inline">
        {ev.ts ? new Date(ev.ts).toLocaleTimeString() : '—'}
      </span>
    </div>
  );
}

/**
 * ObservabilityPane — agent trace timeline + replay + shares (W6-24).
 * Concept layout 1:1 (header filters + dark timeline + 3 cards + share row),
 * but every pixel is live: `GET /api/agents/:id/trace` (events derived from
 * registry + doc mtimes + locks + lineage — a fresh agent honestly shows a
 * 1-event timeline), TokenLedger from the real 7d usage summary, the safe
 * card from real locks, Replay re-rendering the session JSONL via
 * `GET /api/sessions/:id`, Share freezing trace/transcript snapshots via
 * `POST/GET/DELETE /api/share/*`.
 * NOT ported: the concept's hardcoded TRACES rows and invented `$0.04`
 * costs, the `builder-1` persona colors (badges hash the real agent id),
 * the BUS-feed copy (there is no bus in core — the card says what carries
 * lifecycle instead), and the toast-only Replay/Share buttons.
 */
export function ObservabilityPane() {
  const [agents, setAgents] = React.useState<{ id: string; name: string; state: string }[]>([]);
  const [agentsError, setAgentsError] = React.useState<string | null>(null);
  const [agentId, setAgentId] = React.useState('');
  const [trace, setTrace] = React.useState<AgentTraceRes | null>(null);
  const [traceError, setTraceError] = React.useState<string | null>(null);
  const [traceLoading, setTraceLoading] = React.useState(false);
  const [refreshedAt, setRefreshedAt] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<TraceFilter>('all');
  const [lockCount, setLockCount] = React.useState(0);
  const [worktree, setWorktree] = React.useState<string | null>(null);
  const [usage, setUsage] = React.useState<{ runs: number; tokens: number; costUsd: number; topModel: string | null } | null>(null);
  const [sessions, setSessions] = React.useState<{ id: string; title?: string }[]>([]);
  const [replayId, setReplayId] = React.useState('');
  const [replayRows, setReplayRows] = React.useState<{ role: string; content: string; timestamp: string; toolName?: string }[] | null>(null);
  const [replayTitle, setReplayTitle] = React.useState('');
  const [replayError, setReplayError] = React.useState<string | null>(null);
  const [replaying, setReplaying] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Record<number, boolean>>({});
  const [shares, setShares] = React.useState<ShareSummaryView[] | null>(null);
  const [sharesError, setSharesError] = React.useState<string | null>(null);
  const [shareBusy, setShareBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [opened, setOpened] = React.useState<{ token: string; kind: string; title: string; events?: TraceEventView[]; agentId?: string; baseTs?: string; replay?: { role: string; content: string; timestamp: string; toolName?: string }[] } | null>(null);

  // Bootstrap: agents + usage + sessions + shares (all independent).
  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await api.listAgents();
        if (!live) return;
        const rows = res.agents.map((a) => {
          const n = normalizeAgent(a);
          return { id: n.id, name: n.name, state: n.state };
        });
        setAgents(rows);
        setAgentId((prev) => prev || rows[0]?.id || '');
      } catch (e) {
        if (live) setAgentsError(errMessage(e));
      }
    })();
    (async () => {
      try {
        const res = await api.getUsageSummary('7d');
        if (live) {
          setUsage({ runs: res.summary.runs, tokens: res.summary.tokens, costUsd: res.summary.costUsd, topModel: res.summary.topModel });
        }
      } catch {
        if (live) setUsage(null);
      }
    })();
    (async () => {
      try {
        const res = await api.listSessions();
        if (!live) return;
        setSessions(res.sessions.map((s) => ({ id: s.id, title: s.title ?? s.id })));
        setReplayId((prev) => prev || res.sessions[0]?.id || '');
      } catch {
        if (live) setSessions([]);
      }
    })();
    (async () => {
      try {
        const res = await api.listShares();
        if (live) setShares(res.shares);
      } catch (e) {
        if (live) setSharesError(errMessage(e));
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const loadTrace = React.useCallback(async (id: string) => {
    if (!id) return;
    setTraceLoading(true);
    setTraceError(null);
    try {
      const [res, locks] = await Promise.all([
        api.getAgentTrace(id),
        api.getAgentLocks(id).catch(() => null),
      ]);
      setTrace(res);
      setLockCount(locks?.locks?.length ?? res.locks.filter((l) => l.live).length);
      setWorktree(res.worktree);
      setRefreshedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setTrace(null);
      setTraceError(errMessage(e));
    } finally {
      setTraceLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadTrace(agentId);
  }, [agentId, loadTrace]);

  const reloadShares = React.useCallback(async () => {
    try {
      const res = await api.listShares();
      setShares(res.shares);
      setSharesError(null);
    } catch (e) {
      setSharesError(errMessage(e));
    }
  }, []);

  const replay = async () => {
    if (!replayId) return;
    setReplaying(true);
    setReplayError(null);
    try {
      const res = await api.getSession(replayId);
      const rows = res.messages.map(asReplayRow).filter((r): r is NonNullable<typeof r> => r !== null);
      setReplayRows(rows);
      setReplayTitle(sessions.find((s) => s.id === replayId)?.title ?? replayId);
      setExpanded({});
    } catch (e) {
      setReplayRows(null);
      setReplayError(errMessage(e));
    } finally {
      setReplaying(false);
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${url}`);
      toast('Share link copied');
    } catch {
      toast(`Share link: ${url}`);
    }
  };

  const shareTrace = async () => {
    if (!trace) return;
    setShareBusy(true);
    try {
      const res = await api.shareAgent(trace.agent.id as string);
      toast(`Trace frozen — ${res.url}`);
      await copyUrl(res.url);
      await reloadShares();
    } catch (e) {
      toast(`Share failed — ${errMessage(e)}`);
    } finally {
      setShareBusy(false);
    }
  };

  const shareSession = async () => {
    if (!replayId) return;
    setShareBusy(true);
    try {
      const res = await api.shareSession(replayId);
      toast(`Transcript frozen — ${res.url}`);
      await copyUrl(res.url);
      await reloadShares();
    } catch (e) {
      toast(`Share failed — ${errMessage(e)}`);
    } finally {
      setShareBusy(false);
    }
  };

  const openShare = async (token: string) => {
    try {
      const res = await api.getShare(token);
      const snap = asSessionSnapshot(res.share.snapshot);
      if (snap) {
        setOpened({
          token,
          kind: 'session',
          title: res.share.title,
          replay: snap.messages.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp, ...(m.toolName ? { toolName: m.toolName } : {}) })),
        });
      } else {
        const agentSnap = res.share.snapshot as { events?: TraceEventView[]; agent?: { id?: string } };
        setOpened({
          token,
          kind: 'agent',
          title: res.share.title,
          events: Array.isArray(agentSnap.events) ? agentSnap.events : [],
          agentId: typeof agentSnap.agent?.id === 'string' ? agentSnap.agent.id : res.share.refId,
          baseTs: Array.isArray(agentSnap.events) && agentSnap.events.length > 0 ? agentSnap.events[0].ts : new Date().toISOString(),
        });
      }
    } catch (e) {
      toast(`Open failed — ${errMessage(e)}`);
    }
  };

  const removeShare = async (token: string) => {
    if (confirmDelete !== token) {
      setConfirmDelete(token);
      return;
    }
    setConfirmDelete(null);
    try {
      await api.deleteShare(token);
      if (opened?.token === token) setOpened(null);
      await reloadShares();
      toast('Share deleted');
    } catch (e) {
      toast(`Delete failed — ${errMessage(e)}`);
    }
  };

  const events = trace ? filterTraceEvents(trace.events, filter) : [];
  const baseTs = trace && trace.events.length > 0 ? trace.events[0].ts : new Date().toISOString();
  const safe = safeSummary(lockCount, worktree);
  const current = agents.find((a) => a.id === agentId);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Activity className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Observability</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">trace timeline · per-agent · replay</span>
        <span className="ml-auto flex gap-1">
          {(['all', 'agent', 'tool'] as const).map((f) => (
            <Button key={f} variant={filter === f ? 'default' : 'ghost'} size="sm" className="h-5 px-2 text-[11px] capitalize" onClick={() => setFilter(f)}>{f}</Button>
          ))}
          <Button variant="ghost" size="sm" className="h-5 text-[11px] gap-1" onClick={() => void loadTrace(agentId)} disabled={!agentId || traceLoading}>
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
        </span>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <label htmlFor="obs-agent" className="text-[11px] font-medium text-zinc-500 shrink-0">Agent</label>
          <select id="obs-agent" className={selectClass} value={agentId} onChange={(e) => setAgentId(e.target.value)} disabled={agents.length === 0}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name} · {a.id}</option>
            ))}
          </select>
          {current && <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${stateTone(current.state)}`}>{current.state}</span>}
        </div>
        {agentsError && <div className="text-[11px] text-red-500">Agent list failed — {agentsError}</div>}

        <div className="rounded-lg border border-line bg-[#0F0F11] p-2.5 font-mono text-xs">
          <div className="flex items-center gap-2 text-white/60">
            <span>timeline — {trace ? timelineRange(trace.events) : 'loading…'}</span>
            <span className="ml-auto text-[11px] text-white/40">{refreshedAt ? `refreshed ${refreshedAt}` : traceLoading ? 'loading…' : ''}</span>
          </div>
          {traceError ? (
            <div className="mt-2 text-red-400">Trace failed — {traceError}</div>
          ) : (
            <div className="mt-2 relative pl-4 border-l border-white/10 space-y-2">
              {events.length === 0 ? (
                <div className="text-white/40">{traceLoading ? 'Loading trace…' : filter === 'all' ? 'No events yet — activity (edits, locks, state changes) appears here.' : `No ${filter} events — switch the filter back to all.`}</div>
              ) : (
                events.map((ev, i) => <TraceRow key={`${ev.ts}-${i}`} ev={ev} baseTs={baseTs} agentId={agentId} />)
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
            <div className="text-xs font-medium flex items-center gap-1"><Cpu className="w-3 h-3" /> TokenLedger</div>
            <div className="mt-1 text-[11px] text-zinc-500">
              {usage
                ? `7d · ${usage.runs} runs · ${(usage.tokens / 1000).toFixed(1)}k tokens · $${usage.costUsd.toFixed(3)}${usage.topModel ? ` · top ${usage.topModel}` : ''}`
                : 'Ledger unavailable — the Usage pane has the full breakdown.'}
            </div>
            <div className="mt-1 text-[10px] text-zinc-400">Project scope — per-agent attribution lands with the runner.</div>
          </div>
          <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
            <div className="text-xs font-medium flex items-center gap-1"><GitBranch className="w-3 h-3" /> Bus + Coordinator</div>
            <div className="mt-1 text-[11px] text-zinc-500">No message bus in core yet — lifecycle travels over WS <code>agent_state</code> frames (see Orchestration).</div>
          </div>
          <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
            <div className="text-xs font-medium flex items-center gap-1"><Layers className="w-3 h-3" /> 3-layer safe</div>
            <div className={`mt-1 text-[11px] ${safe.tone}`}>{trace ? safe.label : 'Pick an agent to evaluate isolation.'}</div>
            {trace && (
              <div className="mt-1 text-[10px] text-zinc-400">
                SOUL {trace.docs.soul.exists ? formatBytes(trace.docs.soul.bytes) : '—'} · MEMORY {trace.docs.memory.exists ? formatBytes(trace.docs.memory.bytes) : '—'}
                {trace.worktree ? ` · worktree` : ''}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
          <div className="text-xs font-medium flex items-center gap-1"><Zap className="w-3 h-3" /> Replay</div>
          <div className="mt-1.5 flex items-center gap-2">
            <label htmlFor="obs-replay" className="text-[11px] font-medium text-zinc-500 shrink-0">Session</label>
            <select id="obs-replay" className={selectClass} value={replayId} onChange={(e) => setReplayId(e.target.value)} disabled={sessions.length === 0}>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.title ?? s.id}</option>
              ))}
            </select>
            <Button variant="default" size="sm" className="h-7 text-[11px] gap-1 shrink-0" onClick={() => void replay()} disabled={!replayId || replaying}>
              <Zap className="w-3 h-3" /> {replaying ? 'Loading…' : 'Replay'}
            </Button>
          </div>
          {replayError && <div className="mt-1 text-[11px] text-red-500">Replay failed — {replayError}</div>}
          {replayRows && (
            <div className="mt-1.5 rounded border border-line bg-[#0F0F11] p-2 font-mono text-[11px] space-y-1.5 max-h-64 overflow-auto">
              <div className="text-white/40">{replayTitle} · {replayRows.length} rows · frozen read-only render of the session JSONL</div>
              {replayRows.slice(0, 200).map((r, i) => (
                <div key={i} className="flex gap-2">
                  <span className={`px-1 py-0 rounded border shrink-0 ${r.role === 'user' ? 'bg-terracotta text-white border-terracotta' : r.role === 'tool' ? 'bg-zinc-700 text-white border-zinc-600' : 'bg-white/5 text-white/80 border-white/10'}`}>{r.toolName ?? r.role}</span>
                  <button
                    type="button"
                    className="text-white/60 truncate flex-1 text-left hidden sm:inline hover:text-white/90"
                    title={expanded[i] ? 'Collapse' : 'Expand full text'}
                    onClick={() => setExpanded((prev) => ({ ...prev, [i]: !prev[i] }))}
                  >
                    {expanded[i] ? r.content : replayExcerpt(r.content)}
                  </button>
                  <span className="ml-auto text-white/30 hidden md:inline shrink-0">{r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '—'}</span>
                </div>
              ))}
              {replayRows.length > 200 && <div className="text-white/40">… {replayRows.length - 200} more rows (open the session for the full transcript)</div>}
            </div>
          )}
        </div>

        <div className="p-2 rounded-md bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] text-xs">
          <div className="flex items-center gap-2">
            <Eye className="w-3 h-3 text-terracotta" />
            <span>Trace share — frozen snapshots, later edits never rewrite shared history</span>
            <span className="ml-auto flex gap-1">
              <Button variant="ghost" size="sm" className="h-5 text-[11px]" onClick={() => void shareTrace()} disabled={!trace || shareBusy}>Share trace</Button>
              <Button variant="ghost" size="sm" className="h-5 text-[11px]" onClick={() => void shareSession()} disabled={!replayId || shareBusy}>Share session</Button>
            </span>
          </div>
          {sharesError ? (
            <div className="mt-1 text-red-500">Shares failed — {sharesError}</div>
          ) : shares && shares.length > 0 ? (
            <div className="mt-1.5 space-y-1">
              {shares.map((s) => (
                <div key={s.token} className="flex items-center gap-2 rounded bg-white dark:bg-[#1E1E21] border border-line px-2 py-1">
                  <span className="text-[10px] px-1 rounded bg-white/5 border border-line text-zinc-500">{s.kind}</span>
                  <span className="text-[11px] font-medium truncate">{s.title}</span>
                  <span className="text-[10px] text-zinc-400 shrink-0">{s.size} {s.kind === 'agent' ? 'events' : 'rows'} · {formatAge(s.createdAt)}</span>
                  <code className="hidden md:inline px-1 py-0 rounded bg-white dark:bg-[#161618] border border-line text-[10px] text-zinc-500 truncate">/share/{s.kind}/{s.token}</code>
                  <span className="ml-auto flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-5 text-[11px]" onClick={() => void openShare(s.token)}>Open</Button>
                    <Button variant="ghost" size="sm" className="h-5 text-[11px]" onClick={() => void copyUrl(`/share/${s.kind}/${s.token}`)}>Copy</Button>
                    <Button variant="ghost" size="sm" className="h-5 text-[11px]" onClick={() => void removeShare(s.token)}>
                      <Trash2 className="w-3 h-3" /> {confirmDelete === s.token ? 'Sure?' : ''}
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-zinc-500">No shares yet — freeze a trace or a transcript above.</div>
          )}
          {opened && (
            <div className="mt-1.5 rounded border border-line bg-[#0F0F11] p-2 font-mono text-[11px] space-y-1.5 max-h-64 overflow-auto">
              <div className="text-white/40 flex items-center gap-2">
                <span>frozen {opened.kind} share — {opened.title}</span>
                <Button variant="ghost" size="sm" className="ml-auto h-5 text-[11px] text-white/60" onClick={() => setOpened(null)}>Close</Button>
              </div>
              {opened.kind === 'session' && opened.replay
                ? opened.replay.slice(0, 200).map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <span className={`px-1 py-0 rounded border shrink-0 ${r.role === 'user' ? 'bg-terracotta text-white border-terracotta' : r.role === 'tool' ? 'bg-zinc-700 text-white border-zinc-600' : 'bg-white/5 text-white/80 border-white/10'}`}>{r.toolName ?? r.role}</span>
                    <span className="text-white/60 truncate flex-1 hidden sm:inline" title={r.content}>{replayExcerpt(r.content)}</span>
                  </div>
                ))
                : (opened.events ?? []).map((ev, i) => (
                  <TraceRow key={`${ev.ts}-${i}`} ev={ev} baseTs={opened.baseTs ?? ev.ts} agentId={opened.agentId ?? ''} />
                ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
