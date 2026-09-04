import * as React from 'react';
import {
  AlertTriangle,
  Beaker,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileSearch,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Video,
  Workflow,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, api, type TestDetailRes, type TestSummary } from '@/lib/api';
import {
  DEFAULT_TARGETS_HINT,
  TEST_STAGES,
  classifyCounts,
  emptyRunForm,
  filterRuns,
  formatRunAgo,
  parseTargets,
  runTone,
  validateRunForm,
  type RunForm,
  type TestRunFilter,
} from './testing';

const STAGE_ICONS = [FileSearch, Workflow, Beaker, Video, AlertTriangle, CheckCircle2] as const;

const inputClass =
  'h-7 rounded-md border border-line bg-white px-2 text-xs focus:outline-none focus:border-terracotta/30 dark:bg-[#1E1E21]';

const DOT_CLASS: Record<'good' | 'warn' | 'bad', string> = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
};

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('lokma-toast', { detail: message }));
}

function saveBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function errMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
}

/**
 * TestingPane — TestSprite-inspired self-hosted runs (W5-19, Docs/33).
 * Concept layout 1:1 (6-stage strip + Runs with all/fail/flaky filters +
 * run cards + footer), but every pixel is live: rows come from
 * `GET /api/tests/list`, New run posts a real plan
 * (`POST /api/tests/run` — one real `GET` check per target through the
 * live handlers + a Shannon secret scan), expanding a card loads the
 * stored plan + classified report (`GET /api/tests/:id`), and the
 * Report-stage button downloads the real `junit.xml`, and each expanded
 * report carries a real Delete (`DELETE /api/tests/:id`, two-click arm).
 * NOT ported: the concept's mock RUNS rows, its toast-only New-run button,
 * and the fake `.webm`/`trace.zip` thumbnails — there is no Playwright
 * dep here, so the card shows the real per-test rows instead and the
 * footer says video/trace is a follow-up. `flaky` stays 0 until rerun
 * history lands (the server never invents it, neither does this pane).
 */
export function TestingPane() {
  const [runs, setRuns] = React.useState<TestSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeStage, setActiveStage] = React.useState(4);
  const [filter, setFilter] = React.useState<TestRunFilter>('all');
  const [query, setQuery] = React.useState('');
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState<RunForm>(emptyRunForm);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<TestDetailRes | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listTestRuns();
      setRuns(res.items);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function startRun(): Promise<void> {
    const invalid = validateRunForm(form);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setFormError(null);
    setRunning(true);
    try {
      const targets = parseTargets(form.targets);
      const res = await api.runTestPlan({
        plan: form.plan.trim(),
        ...(targets.length > 0 ? { targets } : {}),
        includeShannon: form.includeShannon,
      });
      setForm(emptyRunForm);
      setShowForm(false);
      await load();
      setExpandedId(res.id);
      setDetailLoading(true);
      try {
        setDetail(await api.getTestRun(res.id));
      } catch (e) {
        toast(`Run saved, detail failed: ${errMessage(e)}`);
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
      toast(`Run finished: ${res.report.pass} pass, ${res.report.fail} fail`);
    } catch (e) {
      setFormError(errMessage(e));
    } finally {
      setRunning(false);
    }
  }

  async function toggleExpand(id: string): Promise<void> {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setConfirmDelete(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setConfirmDelete(null);
    setDetailLoading(true);
    try {
      setDetail(await api.getTestRun(id));
    } catch (e) {
      toast(`Detail failed: ${errMessage(e)}`);
    } finally {
      setDetailLoading(false);
    }
  }

  async function downloadJunit(id: string): Promise<void> {
    try {
      const { filename, blob } = await api.downloadTestJunit(id);
      saveBlob(filename, blob);
    } catch (e) {
      toast(`junit download failed: ${errMessage(e)}`);
    }
  }

  async function runDelete(id: string): Promise<void> {
    if (deleting) return;
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setConfirmDelete(null);
    setDeleting(true);
    try {
      await api.deleteTestRun(id);
      toast(`Deleted ${id}`);
      if (expandedId === id) {
        setExpandedId(null);
        setDetail(null);
      }
      await load();
    } catch (e) {
      toast(`Delete failed: ${errMessage(e)}`);
    } finally {
      setDeleting(false);
    }
  }

  const visible = filterRuns(runs, filter, query);
  const failedCount = runs.filter((r) => r.fail > 0).length;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Beaker className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Testing Lab</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">
          TestSprite-inspired · 6-stage · live handlers · Shannon
        </span>
        <Button size="sm" className="ml-auto h-5 text-[11px] gap-1" onClick={() => setShowForm((v) => !v)}>
          <Play className="w-3 h-3" /> New run
        </Button>
      </div>

      <div className="shrink-0 p-2 border-b border-line/50 bg-muted/20">
        <div className="flex items-center gap-1 overflow-x-auto">
          {TEST_STAGES.map((s) => {
            const Icon = STAGE_ICONS[s.n - 1];
            const selected = activeStage === s.n;
            return (
              <button
                key={s.n}
                onClick={() => setActiveStage(s.n)}
                className={`flex-1 min-w-[92px] flex flex-col items-center gap-1 p-2 rounded-lg border transition ${
                  selected
                    ? 'bg-[#262624] text-white border-[#262624] dark:bg-white dark:text-black'
                    : 'bg-white dark:bg-[#1E1E21] border-line hover:border-terracotta/30'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold">
                  {s.n}. {s.title}
                </span>
                <span className={`text-[10px] leading-tight text-center ${selected ? 'text-white/60' : 'text-zinc-500'}`}>
                  {s.desc}
                </span>
              </button>
            );
          })}
        </div>
        {activeStage === 4 && (
          <div className="mt-2 text-[11px] text-zinc-500 flex items-center gap-1">
            <Video className="w-3 h-3" /> checks run in-process against the live handlers (no browser sandbox yet — video/trace are a follow-up)
          </div>
        )}
        {activeStage === 6 && (
          <div className="mt-2 text-[11px] text-zinc-500">
            heal: fix the handler or the target → re-run the plan → the new report lands on top
          </div>
        )}
      </div>

      {showForm && (
        <div className="shrink-0 p-2 border-b border-line/50 space-y-2 bg-[#FDFCFB] dark:bg-[#1E1E21]">
          <div>
            <label htmlFor="test-plan" className="text-[11px] font-medium text-zinc-500">
              Plan headline
            </label>
            <Input
              id="test-plan"
              className={inputClass}
              placeholder="auth preHandler 60/min"
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="test-targets" className="text-[11px] font-medium text-zinc-500">
              Targets (one path per line — blank = {DEFAULT_TARGETS_HINT})
            </label>
            <textarea
              id="test-targets"
              rows={3}
              className={`${inputClass} w-full h-auto py-1.5 font-mono`}
              placeholder={'/health\n/api/models'}
              value={form.targets}
              onChange={(e) => setForm({ ...form, targets: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="test-shannon" className="text-[11px] font-medium text-zinc-500 flex items-center gap-1.5">
              <input
                id="test-shannon"
                type="checkbox"
                checked={form.includeShannon}
                onChange={(e) => setForm({ ...form, includeShannon: e.target.checked })}
              />
              Shannon secret scan
            </label>
            <Button size="sm" className="ml-auto h-6 text-[11px] gap-1" disabled={running} onClick={() => void startRun()}>
              <Play className="w-3 h-3" /> {running ? 'Running…' : 'Run'}
            </Button>
          </div>
          {formError && <div className="text-[11px] text-red-600">{formError}</div>}
        </div>
      )}

      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-line/50 shrink-0">
        <span className="text-xs font-medium">Runs</span>
        <span className="text-[11px] text-zinc-400">~/.lokma/test-runs/&lt;id&gt;/ (plan.json + report.json + junit.xml)</span>
        <span className="ml-auto flex items-center gap-1">
          <span className="relative">
            <Search className="w-3 h-3 absolute left-1.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              aria-label="Search runs"
              className={`${inputClass} h-5 w-28 pl-6 text-[11px]`}
              placeholder="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </span>
          {(['all', 'fail', 'flaky'] as const).map((f) => (
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
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" aria-label="Refresh runs" onClick={() => void load()}>
            <RefreshCw className="w-3 h-3" />
          </Button>
        </span>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-2">
        {loading ? (
          <div className="text-[11px] text-zinc-500 p-2">Loading runs…</div>
        ) : error ? (
          <div className="p-2 rounded-md border border-red-200 bg-red-50 text-xs text-red-700">
            {error}{' '}
            <Button variant="outline" size="sm" className="h-5 ml-1 text-[11px]" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="p-3 rounded-md border border-dashed border-line text-xs text-zinc-500">
            {runs.length === 0
              ? 'No runs yet — press New run to execute the first plan.'
              : 'No runs match this filter.'}
          </div>
        ) : (
          visible.map((r) => {
            const tone = runTone(r);
            const open = expandedId === r.id;
            return (
              <div
                key={r.id}
                className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/20 hover:shadow-sm transition overflow-hidden"
              >
                <button className="w-full flex items-center gap-2 px-2.5 py-2 text-left" onClick={() => void toggleExpand(r.id)}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_CLASS[tone]}`} />
                  <span className="text-xs font-semibold truncate">{r.plan}</span>
                  <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full bg-muted border border-line font-mono shrink-0">
                    {r.id}
                  </span>
                  <span className="ml-auto text-[11px] text-zinc-400 flex items-center gap-1 shrink-0">
                    <Clock3 className="w-3 h-3" /> {formatRunAgo(r.createdAt)} · {r.dur}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition ${open ? 'rotate-180' : ''}`} />
                </button>
                <div className="px-2.5 pb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {r.pass} pass
                  </span>
                  {r.fail > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> {r.fail} fail
                    </span>
                  )}
                  {r.flaky > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                      {r.flaky} flaky
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded-full bg-muted border border-line">{r.tests} tests</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${
                      r.shannon === 'clean'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-amber-50 border-amber-200 text-amber-700'
                    }`}
                  >
                    <ShieldAlert className="w-3 h-3" /> Shannon: {r.shannon}
                  </span>
                </div>
                {open && (
                  <div className="mx-2 mb-2 rounded-md bg-[#0F0F11] border border-white/10 p-2 space-y-1.5">
                    {detailLoading ? (
                      <div className="text-[11px] text-white/60">Loading report…</div>
                    ) : detail && detail.report.id === r.id ? (
                      <>
                        {detail.plan && (
                          <div className="text-[11px] font-mono text-white/60">
                            targets: {detail.plan.targets.join(', ')}
                          </div>
                        )}
                        {detail.report.tests.map((t) => (
                          <div key={t.name} className="flex items-start gap-2 text-[11px] font-mono text-white/80">
                            <span className={t.status === 'pass' ? 'text-emerald-400' : 'text-red-400'}>
                              {t.status === 'pass' ? '✓' : '✗'}
                            </span>
                            <span className="flex-1">
                              {t.name}{' '}
                              <span className="text-white/40">
                                [{t.kind}] {t.ms}ms — {t.detail}
                              </span>
                              {t.classification && (
                                <span className="ml-1 px-1 rounded bg-white/10 text-white/70">{t.classification}</span>
                              )}
                            </span>
                          </div>
                        ))}
                        {detail.report.shannonFindings.length > 0 && (
                          <div className="text-[11px] font-mono text-amber-300">
                            {detail.report.shannonFindings.map((f) => `${f.pattern} @ ${f.location}`).join(' · ')}
                          </div>
                        )}
                        <div className="text-[11px] font-mono text-white/40">
                          classify: contract {classifyCounts(detail.report).contract} · env{' '}
                          {classifyCounts(detail.report).env} · fragility {classifyCounts(detail.report).fragility}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[11px] shrink-0 bg-white/5 border-white/10 text-white hover:bg-white/10 gap-1"
                            onClick={() => void downloadJunit(r.id)}
                          >
                            <Download className="w-3 h-3" /> junit.xml
                          </Button>
                          <Button
                            variant={confirmDelete === r.id ? 'destructive' : 'outline'}
                            size="sm"
                            className="h-6 text-[11px] shrink-0 gap-1 bg-white/5 border-white/10 text-white hover:bg-white/10"
                            aria-label={confirmDelete === r.id ? 'Confirm run delete' : 'Delete run'}
                            title={confirmDelete === r.id ? 'Click again to confirm delete' : 'Delete this run'}
                            disabled={deleting}
                            onClick={() => void runDelete(r.id)}
                          >
                            <Trash2 className="w-3 h-3" />{' '}
                            {confirmDelete === r.id ? 'Confirm?' : deleting ? 'Deleting…' : 'Delete'}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="text-[11px] text-white/60">Report unavailable.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div className="p-2 rounded-md bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] text-xs">
          Every target path gets one real <code className="px-1 py-0.5 rounded bg-white dark:bg-[#1E1E21] border border-line">GET</code>{' '}
          check against the live handlers + a Shannon scan — no invented results.
          {failedCount > 0 ? (
            <> {failedCount} run{failedCount === 1 ? '' : 's'} on this machine {failedCount === 1 ? 'has' : 'have'} failures — expand to classify.</>
          ) : (
            <> Video/trace capture needs a headless browser and is a follow-up.</>
          )}
        </div>
      </div>
    </div>
  );
}
