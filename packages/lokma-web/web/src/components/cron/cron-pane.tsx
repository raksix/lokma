import * as React from 'react';
import { Check, Clock3, Play, Plus, RefreshCw, Search, ShieldAlert, Timer, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, type AgentInfo, type ApprovalDecisionView, type CronJobView, type CronRunRecordView } from '@/lib/api';
import { emitToast } from '@/components/shell';
import { formatRunAgo } from '@/components/testing';
import {
  buildPermissionsPatch,
  isValidRule,
  normalizeConfig,
  PERMISSION_MODES,
  type PermissionMode,
} from '@/components/settings';
import {
  addRule,
  agentLabel,
  countEnabled,
  decisionLabel,
  decisionTone,
  filterDecisions,
  filterJobs,
  formatLastRun,
  formatNextRun,
  jobTone,
  removeRule,
  runLabel,
  runTone,
  validateCreateForm,
  validateScheduleInput,
  validateTaskInput,
} from './cron';

/**
 * CronApprovalsPane — per-agent cron jobs + human-in-the-loop approvals
 * (W6-25, Docs/30 §5 cron per agent + §6 approvals). Concept layout 1:1
 * (header + Timer cron section + ShieldAlert approvals section), but every
 * control hits a live endpoint: `GET /api/cron` list, `POST/PATCH/DELETE
 * /api/agents/:id/cron` create/toggle/delete, `POST .../run` fire-now
 * (streams the agent model into a real cron session + stamps `lastRunAt`),
 * `GET /api/cron/runs` run history, `GET/PATCH /api/config`
 * permissions (the SAME rule store the chat permission card writes — one
 * store, two views), `GET /api/approvals` real WS decision history.
 * Concept mock CRONS/APPROVALS rows, the invented risk badges, the
 * auto-classifier copy, and the toast-only `+ Cron` / `Approve all` /
 * quick-approve input are NOT ported — no dead buttons, no fake data.
 * Firing is live: the server ticker fires due jobs every ~30s (rows show
 * the computed next fire + the stamped last run); the pending queue stays
 * empty until the agent tool loop emits permission frames (answers are
 * logged to history the moment they arrive over WS).
 */
export function CronApprovalsPane() {
  const [jobs, setJobs] = React.useState<CronJobView[]>([]);
  const [runs, setRuns] = React.useState<CronRunRecordView[]>([]);
  const [agents, setAgents] = React.useState<AgentInfo[]>([]);
  const [decisions, setDecisions] = React.useState<ApprovalDecisionView[]>([]);
  const [allow, setAllow] = React.useState<string[]>([]);
  const [deny, setDeny] = React.useState<string[]>([]);
  const [mode, setMode] = React.useState<PermissionMode>('auto');
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [agentFilter, setAgentFilter] = React.useState('all');
  const [jobQuery, setJobQuery] = React.useState('');
  const [decisionQuery, setDecisionQuery] = React.useState('');
  const [formAgent, setFormAgent] = React.useState('');
  const [formSchedule, setFormSchedule] = React.useState('');
  const [formTask, setFormTask] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [busyJob, setBusyJob] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [newAllow, setNewAllow] = React.useState('');
  const [newDeny, setNewDeny] = React.useState('');
  const [savingRules, setSavingRules] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [cronRes, agentsRes, approvalsRes, configRes, runsRes] = await Promise.all([
        api.listCronJobs(),
        api.listAgents(),
        api.listApprovals(),
        api.getConfig(),
        api.listCronRuns(),
      ]);
      setJobs(cronRes.jobs);
      setAgents(agentsRes.agents);
      setDecisions(approvalsRes.decisions);
      setRuns(runsRes.runs);
      const perms = normalizeConfig(configRes).permissions;
      setAllow(perms.allow);
      setDeny(perms.deny);
      setMode(perms.defaultMode);
      setFormAgent((prev) => prev || agentsRes.agents[0]?.id || '');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function reloadJobs(): Promise<void> {
    const [cronRes, approvalsRes, runsRes] = await Promise.all([
      api.listCronJobs(),
      api.listApprovals(),
      api.listCronRuns(),
    ]);
    setJobs(cronRes.jobs);
    setDecisions(approvalsRes.decisions);
    setRuns(runsRes.runs);
  }

  async function createJob(): Promise<void> {
    const formError = validateCreateForm({ agentId: formAgent, schedule: formSchedule, task: formTask });
    if (formError) {
      emitToast(formError);
      return;
    }
    setCreating(true);
    try {
      await api.createCronJob(formAgent, { schedule: formSchedule.trim(), task: formTask.trim() });
      setFormSchedule('');
      setFormTask('');
      await reloadJobs();
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  async function toggleJob(job: CronJobView): Promise<void> {
    setBusyJob(job.id);
    try {
      await api.patchCronJob(job.agentId, job.id, { enabled: !job.enabled });
      await reloadJobs();
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Toggle failed');
    } finally {
      setBusyJob(null);
    }
  }

  async function deleteJob(job: CronJobView): Promise<void> {
    if (confirmDelete !== job.id) {
      setConfirmDelete(job.id);
      return;
    }
    setConfirmDelete(null);
    setBusyJob(job.id);
    try {
      await api.deleteCronJob(job.agentId, job.id);
      await reloadJobs();
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyJob(null);
    }
  }

  async function runJob(job: CronJobView): Promise<void> {
    setBusyJob(job.id);
    try {
      const res = await api.runCronJob(job.agentId, job.id);
      if (!res.ok) {
        emitToast(`Run recorded as failed: ${res.run.error ?? 'model call failed'} — see Recent runs`);
      }
      await reloadJobs();
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setBusyJob(null);
    }
  }

  async function persistRules(nextAllow: string[], nextDeny: string[], nextMode: PermissionMode): Promise<void> {
    setSavingRules(true);
    try {
      await api.patchConfig(buildPermissionsPatch(nextAllow, nextDeny, nextMode));
      setAllow(nextAllow);
      setDeny(nextDeny);
      setMode(nextMode);
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingRules(false);
    }
  }

  function addRuleTo(list: 'allow' | 'deny', value: string, clear: () => void): void {
    const rule = value.trim();
    if (!isValidRule(rule)) {
      emitToast('Rule must be a non-empty pattern (max 200 chars)');
      return;
    }
    const base = list === 'allow' ? allow : deny;
    if (base.includes(rule)) {
      emitToast('Rule already exists');
      return;
    }
    clear();
    void persistRules(
      list === 'allow' ? addRule(allow, rule) : allow,
      list === 'deny' ? addRule(deny, rule) : deny,
      mode,
    );
  }

  const { enabled, total } = countEnabled(jobs);
  const visibleJobs = filterJobs(jobs, jobQuery, agentFilter);
  const visibleDecisions = filterDecisions(decisions, decisionQuery);
  const scheduleError = formSchedule ? validateScheduleInput(formSchedule) : null;
  const taskError = formTask ? validateTaskInput(formTask) : null;
  const inputClass =
    'h-7 w-full rounded-md border border-line bg-white px-2 text-xs dark:bg-[#1E1E21]';

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Clock3 className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Cron & Approvals</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">#5 per-agent cron · #6 human-in-the-loop</span>
        <Button variant="ghost" size="sm" className="ml-auto h-5 w-5 p-0" onClick={() => void load()} title="Reload cron jobs and approvals">
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-3">
        {loading ? (
          <div className="text-xs text-zinc-500 p-2">Loading cron jobs and approvals…</div>
        ) : loadError ? (
          <div className="text-xs text-red-600 p-2">
            {loadError}{' '}
            <Button variant="outline" size="sm" className="h-6 text-xs ml-1" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-center gap-2 text-xs font-medium">
                <Timer className="w-3 h-3" /> Per-agent cron
                <span className="text-[11px] font-normal text-zinc-400">· {enabled}/{total} enabled</span>
              </div>

              <div className="mt-1.5 flex gap-1">
                <div className="flex-1">
                  <label htmlFor="cron-agent-filter" className="sr-only">Filter by agent</label>
                  <select
                    id="cron-agent-filter"
                    value={agentFilter}
                    onChange={(e) => setAgentFilter(e.target.value)}
                    className={`${inputClass} h-7`}
                  >
                    <option value="all">All agents ({total})</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{agentLabel(a)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-[2] relative">
                  <label htmlFor="cron-search" className="sr-only">Search cron jobs</label>
                  <Search className="w-3 h-3 absolute left-2 top-2 text-zinc-400" />
                  <Input
                    id="cron-search"
                    placeholder="Search schedule, task, id…"
                    value={jobQuery}
                    onChange={(e) => setJobQuery(e.target.value)}
                    className="pl-7 h-7 text-xs"
                  />
                </div>
              </div>

              <div className="mt-1.5 space-y-1.5">
                {visibleJobs.length === 0 ? (
                  <div className="text-[11px] text-zinc-500 p-2 rounded-md border border-dashed border-line">
                    {total === 0
                      ? 'No cron jobs yet — create one below (stored per agent, fired on schedule by the runner daemon).'
                      : 'No jobs match this filter.'}
                  </div>
                ) : (
                  visibleJobs.map((job) => (
                    <div key={job.id} className="flex gap-2 p-2 rounded-lg border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/20 transition">
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${jobTone(job.enabled)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono font-medium flex items-center gap-1.5 flex-wrap">
                          {job.schedule}{' '}
                          <span className="px-1 py-0 rounded bg-muted border border-line text-[11px] font-sans">{job.agentId}</span>
                          <span className="text-[11px] font-normal text-zinc-400 hidden sm:inline">{formatNextRun(job)}</span>
                        </div>
                        <div className="text-xs text-zinc-500 truncate">{job.task} · id: {job.id} · {formatLastRun(job)}</div>
                      </div>
                      <span className="flex gap-1 shrink-0 items-start">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-6 p-0"
                          title="Run now (fire this job immediately)"
                          disabled={busyJob === job.id}
                          onClick={() => void runJob(job)}
                        >
                          <Play className="w-3 h-3" />
                        </Button>
                        <Button
                          variant={job.enabled ? 'default' : 'outline'}
                          size="sm"
                          className="h-6 text-xs"
                          disabled={busyJob === job.id}
                          onClick={() => void toggleJob(job)}
                        >
                          {job.enabled ? 'On' : 'Off'}
                        </Button>
                        <Button
                          variant={confirmDelete === job.id ? 'default' : 'ghost'}
                          size="sm"
                          className="h-6 w-6 p-0"
                          title={confirmDelete === job.id ? 'Click again to confirm delete' : 'Delete cron job'}
                          disabled={busyJob === job.id}
                          onClick={() => void deleteJob(job)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-1.5 p-2 rounded-lg border border-line bg-white dark:bg-[#1E1E21] space-y-1.5">
                <div className="text-[11px] font-medium flex items-center gap-1">
                  <Plus className="w-3 h-3" /> New cron job
                </div>
                <div>
                  <label htmlFor="cron-new-agent" className="mb-0.5 block text-[10px] uppercase tracking-wide text-zinc-500">Agent</label>
                  <select
                    id="cron-new-agent"
                    value={formAgent}
                    onChange={(e) => setFormAgent(e.target.value)}
                    className={`${inputClass}`}
                    disabled={agents.length === 0}
                  >
                    {agents.length === 0 ? (
                      <option value="">No agents — create one in the Agents tab</option>
                    ) : (
                      agents.map((a) => (
                        <option key={a.id} value={a.id}>{agentLabel(a)}</option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label htmlFor="cron-new-schedule" className="mb-0.5 block text-[10px] uppercase tracking-wide text-zinc-500">Schedule (5-field cron)</label>
                  <Input
                    id="cron-new-schedule"
                    placeholder="0 3 * * *"
                    value={formSchedule}
                    onChange={(e) => setFormSchedule(e.target.value)}
                    className="h-7 text-xs font-mono"
                  />
                  {scheduleError ? <div className="text-[11px] text-red-600 mt-0.5">{scheduleError}</div> : null}
                </div>
                <div>
                  <label htmlFor="cron-new-task" className="mb-0.5 block text-[10px] uppercase tracking-wide text-zinc-500">Task (agent prompt)</label>
                  <Input
                    id="cron-new-task"
                    placeholder="vault sync + graph rebuild"
                    value={formTask}
                    onChange={(e) => setFormTask(e.target.value)}
                    className="h-7 text-xs"
                  />
                  {taskError ? <div className="text-[11px] text-red-600 mt-0.5">{taskError}</div> : null}
                </div>
                <Button size="sm" className="h-7 text-xs" disabled={creating || agents.length === 0} onClick={() => void createJob()}>
                  {creating ? 'Creating…' : '+ Create cron job'}
                </Button>
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 px-1">cron per agent → stored in `~/.lokma/cron/jobs.json`, scoped to agentId. The runner daemon fires due jobs every ~30s (Play fires one now); every fire stamps `lastRunAt` + lands a run record below.</div>

              <div className="mt-1.5">
                <div className="text-[11px] font-medium px-1">Recent runs</div>
                {runs.length === 0 ? (
                  <div className="mt-1 p-2 rounded-md border border-dashed border-line text-[11px] text-zinc-500">
                    No runs yet — due jobs fire on schedule, or press Play on a row to fire it now.
                  </div>
                ) : (
                  <div className="mt-1 space-y-1">
                    {runs.slice(0, 5).map((run) => (
                      <div key={run.runId} className="flex gap-2 items-start p-1.5 rounded-md border border-line bg-white dark:bg-[#1E1E21]">
                        <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${runTone(run.status)}`} />
                        <div className="flex-1 min-w-0 text-[11px] text-zinc-500 truncate" title={run.sessionId}>
                          {runLabel(run)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-medium">
                <ShieldAlert className="w-3 h-3 text-amber-600" /> Approvals — human-in-the-loop
                <span className="ml-auto text-[11px] font-normal text-zinc-400">0 pending</span>
              </div>

              <div className="mt-1.5 p-2 rounded-md bg-muted/50 border border-dashed border-line text-[11px] text-zinc-500">
                No pending approvals — the agent tool loop lands with the runner. Every WS `permission_request` answer is logged below the moment it arrives.
              </div>

              <div className="mt-1.5 p-2 rounded-lg border border-line bg-white dark:bg-[#1E1E21] space-y-1.5">
                <div className="text-[11px] font-medium">Rules — same store as the chat permission card</div>
                <div className="flex gap-1 flex-wrap">
                  {allow.map((rule) => (
                    <span key={`allow:${rule}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-[#0F241A] border border-emerald-200 text-[11px]">
                      <Check className="w-3 h-3 text-emerald-600" />{rule}
                      <button
                        type="button"
                        aria-label={`Remove allow rule ${rule}`}
                        className="text-zinc-400 hover:text-red-600"
                        disabled={savingRules}
                        onClick={() => void persistRules(removeRule(allow, rule), deny, mode)}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {deny.map((rule) => (
                    <span key={`deny:${rule}`} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-[11px]">
                      <X className="w-3 h-3 text-red-600" />{rule}
                      <button
                        type="button"
                        aria-label={`Remove deny rule ${rule}`}
                        className="text-zinc-400 hover:text-red-600"
                        disabled={savingRules}
                        onClick={() => void persistRules(allow, removeRule(deny, rule), mode)}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {allow.length === 0 && deny.length === 0 ? (
                    <span className="text-[11px] text-zinc-500">No rules — chat `Always allow` lands here.</span>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <div className="flex-1">
                    <label htmlFor="cron-rule-allow" className="sr-only">Add allow rule</label>
                    <Input
                      id="cron-rule-allow"
                      placeholder="Allow: Bash: npm test"
                      value={newAllow}
                      onChange={(e) => setNewAllow(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addRuleTo('allow', newAllow, () => setNewAllow(''));
                      }}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <label htmlFor="cron-rule-deny" className="sr-only">Add deny rule</label>
                    <Input
                      id="cron-rule-deny"
                      placeholder="Deny: Bash: rm -rf /tmp"
                      value={newDeny}
                      onChange={(e) => setNewDeny(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addRuleTo('deny', newDeny, () => setNewDeny(''));
                      }}
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="cron-default-mode" className="text-[11px] text-zinc-500">Default mode (Always leg)</label>
                  <select
                    id="cron-default-mode"
                    value={mode}
                    disabled={savingRules}
                    onChange={(e) => void persistRules(allow, deny, e.target.value as PermissionMode)}
                    className="h-7 text-xs rounded-md border border-line bg-white dark:bg-[#1E1E21] px-1"
                  >
                    {PERMISSION_MODES.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-1.5 flex gap-1">
                <div className="flex-1 relative">
                  <label htmlFor="cron-decision-search" className="sr-only">Search decision history</label>
                  <Search className="w-3 h-3 absolute left-2 top-2 text-zinc-400" />
                  <Input
                    id="cron-decision-search"
                    placeholder="Search history…"
                    value={decisionQuery}
                    onChange={(e) => setDecisionQuery(e.target.value)}
                    className="pl-7 h-7 text-xs"
                  />
                </div>
              </div>
              <div className="mt-1.5 space-y-1.5">
                {visibleDecisions.length === 0 ? (
                  <div className="text-[11px] text-zinc-500 p-2 rounded-md border border-dashed border-line">
                    {decisions.length === 0
                      ? 'No decisions yet — answer a permission card or question in chat and it lands here.'
                      : 'No decisions match this search.'}
                  </div>
                ) : (
                  visibleDecisions.map((d) => (
                    <div key={d.id} className="flex gap-2 p-2 rounded-lg border border-line bg-white dark:bg-[#1E1E21]">
                      <span className={`px-1.5 py-0.5 rounded-full border text-[10px] h-fit shrink-0 ${decisionTone(d.decision)}`}>
                        {d.kind === 'question' ? 'answered' : (d.decision ?? 'decided')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">
                          {d.sessionId} → {decisionLabel(d.kind, d.decision, d.answer)}
                        </div>
                        <div className="text-[11px] text-zinc-500">{formatRunAgo(d.at)} · {d.kind} · {d.requestId}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-1 p-2 rounded-md bg-muted/50 border border-dashed border-line text-[11px] text-zinc-500">
                Per-agent approvals — WS `permission_request` → card → Allow/Deny/Always. Rules above write the shared permission store.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
