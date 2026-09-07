import * as React from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { summarizeDoctor, type DoctorSummary } from './settings';

/**
 * DoctorStrip — the `lokma doctor` summary line for the Settings surface
 * (REQ-009, Docs/32 §7). One lazy `GET /api/doctor` on mount: `N/M
 * passing` plus the failing probe names inline. Full measured output
 * lives in Inspector → Setup → 3 Doctor — this strip only links there,
 * it never duplicates the probe table. Silent while loading (the pane
 * must not flash), error collapses to one retryable line.
 */
export function DoctorStrip() {
  const [summary, setSummary] = React.useState<DoctorSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDoctor();
      setSummary(summarizeDoctor(res.checks ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Doctor unreachable');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (summary === null && error === null) return null;

  const allPass = summary !== null && summary.total > 0 && summary.passed === summary.total;

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-line/60 bg-muted/20 px-3 py-1 text-[11px] text-zinc-500">
      <Activity className="h-3 w-3 shrink-0 text-zinc-400" />
      {error !== null ? (
        <span className="truncate">
          Doctor unreachable — {error}
        </span>
      ) : summary !== null ? (
        <span className="truncate" title={summary.failing.length > 0 ? `failing: ${summary.failing.join(', ')}` : 'all probes passing'}>
          <span className="font-semibold text-zinc-600 dark:text-zinc-300">
            Doctor {summary.passed}/{summary.total}
          </span>
          {allPass ? (
            <span className="text-emerald-600 dark:text-emerald-400"> · all checks passing</span>
          ) : summary.failing.length > 0 ? (
            <span className="text-amber-600 dark:text-amber-400"> · failing: {summary.failing.join(', ')}</span>
          ) : (
            <span> · no probes reported</span>
          )}
          <span className="ml-1 hidden @min-[420px]:inline">· full output in Setup → 3 Doctor</span>
        </span>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-5 shrink-0 px-1.5 text-[11px]"
        onClick={() => load()}
        disabled={loading}
        title="Re-run doctor probes"
      >
        <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Probing…' : 'Re-check'}
      </Button>
    </div>
  );
}
