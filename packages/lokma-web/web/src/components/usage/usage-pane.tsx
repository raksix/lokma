import * as React from 'react';
import { Activity, BarChart3, DollarSign, Download, RefreshCw, TrendingUp, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type UsageRange, type UsageSummary } from '@/lib/api';
import { emitToast } from '@/components/shell';
import {
  CHART_COLORS,
  axisLabels,
  buildStackedPaths,
  chartKeys,
  collapseSeries,
  downloadBlob,
  formatLastActive,
  formatTokens,
  formatUsd,
  shortModel,
} from './usage';

/**
 * UsagePane — real token/cost accounting (ported from the concept
 * UsagePane layout, same cream/terracotta tokens + h-7 header).
 * Every number comes from `GET /api/usage/summary|sessions` (the WS
 * handler records one ledger line per completed run); CSV/JSONL buttons
 * download real exports. The concept's hardcoded KPI/CHART/SESSIONS
 * arrays and toast-only export buttons are NOT ported — fake data and
 * dead buttons stay out. Empty ranges render an honest empty state.
 */

const RANGES: UsageRange[] = ['7d', '30d', '90d'];

export function UsagePane({ onOpenSession }: { onOpenSession?: (id: string) => void }) {
  const [range, setRange] = React.useState<UsageRange>('7d');
  const [summary, setSummary] = React.useState<UsageSummary | null>(null);
  const [sessions, setSessions] = React.useState<
    { sessionId: string; title: string; model: string; runs: number; tokens: number; costUsd: number; lastActive: string }[]
  >([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState<'csv' | 'jsonl' | null>(null);

  const load = React.useCallback(async (r: UsageRange) => {
    setLoading(true);
    setError(null);
    try {
      const [s, rows] = await Promise.all([api.getUsageSummary(r), api.getUsageSessions(r)]);
      setSummary(s.summary);
      setSessions(rows.sessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Usage load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(range);
  }, [range, load]);

  async function handleExport(format: 'csv' | 'jsonl'): Promise<void> {
    setExporting(format);
    try {
      const { filename, blob } = await api.downloadUsageExport(format, range);
      downloadBlob(filename, blob);
      emitToast(`Exported ${filename}`);
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  }

  const { keys, other } = React.useMemo(
    () => chartKeys(summary?.byModel ?? [], 3),
    [summary],
  );
  const layers = React.useMemo(
    () => collapseSeries(summary?.series ?? [], keys, other),
    [summary, keys, other],
  );
  const paths = React.useMemo(() => buildStackedPaths(layers, other ? [...keys, 'other'] : keys, 340, 96), [layers, keys, other]);
  const legendKeys = other ? [...keys, 'other'] : keys;
  const labels = React.useMemo(() => axisLabels((summary?.series ?? []).map((p) => p.day)), [summary]);
  const days = summary?.series ?? [];

  const top = summary?.byModel[0];
  const avgRate = summary && summary.tokens > 0 ? (summary.costUsd / summary.tokens) * 1000 : 0;
  const kpis = summary
    ? [
        { label: `Total tokens (${range})`, value: formatTokens(summary.tokens), icon: Zap, hint: `in ${formatTokens(summary.inputTokens)} · out ${formatTokens(summary.outputTokens)}` },
        { label: `Total cost (${range})`, value: formatUsd(summary.costUsd), icon: DollarSign, hint: avgRate > 0 ? `$${avgRate.toFixed(3)} / 1k avg` : 'no priced runs yet' },
        { label: 'Avg / session', value: formatTokens(summary.avgPerSession), icon: Activity, hint: `${summary.sessions} sessions · ${summary.runs} runs` },
        { label: 'Top model', value: top ? shortModel(top.model) : '—', icon: BarChart3, hint: top ? `${(top.share * 100).toFixed(0)}% · ${formatTokens(top.tokens)}` : 'no runs yet' },
      ]
    : [];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-white dark:bg-[#161618]">
      <div className="flex h-7 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line bg-[#FDFCFB] px-3 dark:bg-[#1E1E21]">
        <BarChart3 className="h-3 w-3 text-terracotta" />
        <span className="text-xs font-semibold">Usage</span>
        <span className="hidden sm:inline text-[11px] text-zinc-400">tokens · cost · by model</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {RANGES.map((r) => (
            <Button
              key={r}
              variant={range === r ? 'default' : 'ghost'}
              size="sm"
              className="h-5 px-2 text-[11px]"
              onClick={() => setRange(r)}
            >
              {r}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="ml-1 h-5 gap-1 text-[11px]"
            disabled={exporting !== null}
            onClick={() => void handleExport('csv')}
          >
            <Download className="h-3 w-3" /> CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 gap-1 text-[11px]"
            disabled={exporting !== null}
            onClick={() => void handleExport('jsonl')}
          >
            JSONL
          </Button>
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-4 text-center text-xs text-zinc-400">Loading usage…</div>
        ) : error ? (
          <div className="m-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <span className="flex-1">{error}</span>
            <Button variant="outline" size="sm" className="h-6 gap-1 text-[11px]" onClick={() => void load(range)}>
              <RefreshCw className="h-3 w-3" /> Retry
            </Button>
          </div>
        ) : !summary || summary.runs === 0 ? (
          <div className="m-2 rounded-md border border-dashed border-line p-6 text-center">
            <div className="text-xs font-medium">No runs in the last {range}</div>
            <div className="mt-1 text-[11px] text-zinc-400">
              Send a chat message — every completed run is recorded here with real tokens + cost.
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2 lg:grid-cols-4">
              {kpis.map((k) => (
                <div
                  key={k.label}
                  className="rounded-lg border border-line bg-[#FDFCFB] p-2.5 transition hover:border-terracotta/20 dark:bg-[#1E1E21]"
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                    <k.icon className="h-3 w-3" /> {k.label}
                    <span className="ml-auto rounded bg-terracotta px-1 py-0 text-[11px] text-white">{range}</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-1 text-[18px] font-semibold tracking-tight">
                    {k.value} <TrendingUp className="hidden h-3 w-3 text-emerald-500 sm:block" />
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-400">{k.hint}</div>
                </div>
              ))}
            </div>

            <div className="mx-2 rounded-lg border border-line bg-white p-3 dark:bg-[#1E1E21]">
              <div className="flex items-center gap-2 text-xs font-medium">
                Tokens / day <span className="text-[11px] font-normal text-zinc-400">stacked by model · {range}</span>
                <span className="ml-auto flex items-center gap-2 text-[11px]">
                  {legendKeys.map((k, i) => (
                    <span key={k} className="flex items-center gap-1">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                      {k === 'other' ? 'other' : shortModel(k)}
                    </span>
                  ))}
                </span>
              </div>
              <svg
                viewBox="0 0 340 96"
                className="mt-3 h-[96px] w-full rounded border border-line/40 bg-[#FAF9F5]/50 dark:bg-[#0F0F11]/50"
                role="img"
                aria-label={`Stacked token usage, ${formatTokens(summary.tokens)} total`}
              >
                <line x1="0" y1="32" x2="340" y2="32" stroke="#E8E4DE" strokeWidth="0.5" strokeDasharray="3 3" />
                <line x1="0" y1="64" x2="340" y2="64" stroke="#E8E4DE" strokeWidth="0.5" strokeDasharray="3 3" />
                {paths.map((d, i) => (
                  <path
                    key={legendKeys[i] ?? i}
                    d={d}
                    fill={CHART_COLORS[(legendKeys.length - 1 - i) % CHART_COLORS.length]}
                    fillOpacity="0.9"
                    stroke={CHART_COLORS[(legendKeys.length - 1 - i) % CHART_COLORS.length]}
                    strokeWidth="1"
                  />
                ))}
              </svg>
              <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
                {labels.map((l, i) => (
                  <span key={days[i]?.day ?? i}>{l}</span>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
                <span>
                  {formatTokens(summary.tokens)} total · {summary.runs} runs · {range}
                </span>
                <span>estimated tokens · list prices</span>
              </div>
            </div>

            <div className="m-2 overflow-hidden rounded-lg border border-line">
              <div className="flex h-7 items-center border-b border-line bg-[#FDFCFB] px-3 text-xs font-medium dark:bg-[#1E1E21]">
                Recent sessions{' '}
                <span className="ml-2 text-[11px] font-normal text-zinc-400">
                  {sessions.length} · click → session
                </span>
                <span className="ml-auto hidden text-[11px] font-normal text-zinc-400 sm:inline">model · cost</span>
              </div>
              <div className="divide-y divide-line/60">
                {sessions.map((s) => (
                  <button
                    key={s.sessionId}
                    onClick={() => onOpenSession?.(s.sessionId)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-muted/50"
                    title={s.sessionId}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span className="flex-1 truncate text-xs font-medium">{s.title}</span>
                    <span className="hidden rounded-full border border-line bg-muted px-1.5 py-0.5 text-[10px] sm:inline-flex">
                      {shortModel(s.model)}
                    </span>
                    <span className="hidden text-[11px] text-zinc-500 md:inline">{formatTokens(s.tokens)}</span>
                    <span className="text-[11px] font-medium">{formatUsd(s.costUsd)}</span>
                    <span className="hidden text-[11px] text-zinc-400 lg:inline">{formatLastActive(s.lastActive)}</span>
                  </button>
                ))}
                {sessions.length === 0 && (
                  <div className="p-4 text-center text-xs text-zinc-400">No session runs in this range.</div>
                )}
              </div>
            </div>

            <div className="m-2 flex items-center gap-2 rounded-md border border-[#F2D5C2] bg-[#FDF0E6] p-2 text-xs dark:border-[#3A2A1A] dark:bg-[#2A1E15]">
              <DollarSign className="h-3 w-3 text-terracotta" />
              <span>
                Tokens estimated (chars ÷ 4) · costs use public list prices at run time
                {summary.unpricedTokens > 0
                  ? ` · ${formatTokens(summary.unpricedTokens)} tokens from unpriced models excluded`
                  : ''}
                .
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
