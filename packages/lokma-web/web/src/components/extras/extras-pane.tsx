import * as React from 'react';
import { ArrowRight, Check, Crown, RefreshCw, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { emitToast } from '@/components/shell';
import {
  EXTRAS,
  buildFeaturesPatch,
  countDone,
  filterExtras,
  isShipped,
  progressPct,
  readFeatures,
  type ExtrasFilter,
  type ExtrasTabId,
} from './extras';

/**
 * ExtrasPane — the 23 ranked agent-system extras (W6-26, Docs/30 §extras)
 * as a REAL feature-flag board. Concept layout 1:1 (header + progress +
 * All/Done/Todo + rows + Phase-3 footer), but every control is live:
 * shipped rows Open their real Inspector tab (or name their real surface
 * when it is not a tab — chat, sessions sidebar), todo rows toggle a real
 * `features.*` flag persisted via `PATCH /api/config` (same file the CLI
 * reads) or show their real milestone when not toggleable yet.
 * Concept hardcoded `done` booleans + the toast-only Open/Plan button are
 * NOT ported — no dead buttons, no fake data.
 * Honest scope: toggles persist flags the runner wave reads (`lastRunAt`
 * style — stored now, lit up later); the pane copy says so.
 */
export function ExtrasPane({ onOpenTab }: { onOpenTab?: (tab: ExtrasTabId) => void }) {
  const [features, setFeatures] = React.useState<Record<string, boolean>>({});
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<ExtrasFilter>('all');
  const [busyFlag, setBusyFlag] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.getConfig();
      setFeatures(readFeatures(res));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function toggleFlag(flag: string, value: boolean): Promise<void> {
    setBusyFlag(flag);
    try {
      // Full-object patch — saveGlobal shallow-merges, a partial map
      // would wipe the SetupPane flags (same trap as permissions/MCP).
      await api.patchConfig(buildFeaturesPatch(features, flag, value));
      const res = await api.getConfig();
      setFeatures(readFeatures(res));
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Toggle failed');
    } finally {
      setBusyFlag(null);
    }
  }

  const done = countDone(EXTRAS);
  const pct = progressPct(EXTRAS);
  const rows = filterExtras(EXTRAS, filter);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0 overflow-x-auto">
        <Star className="w-3 h-3 text-amber-500" />
        <span className="text-xs font-semibold">Extras — 23 ranked</span>
        <span className="ml-1 hidden sm:inline-flex items-center gap-1 text-[11px] text-zinc-400">
          <span className="w-16 h-1.5 rounded-full bg-line overflow-hidden">
            <span className="h-full block bg-terracotta" style={{ width: `${pct}%` }} />
          </span>
          {done}/23 · {pct}%
        </span>
        <span className="ml-auto flex shrink-0 gap-1">
          {(['all', 'done', 'todo'] as const).map((f) => (
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
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => void load()} title="Reload flags from server" aria-label="Reload flags from server">
            <RefreshCw className="w-3 h-3" />
          </Button>
        </span>
      </div>

      <div className="flex-1 overflow-auto p-1.5 space-y-1">
        {loading ? (
          <div className="p-3 text-xs text-zinc-500">Loading feature flags…</div>
        ) : loadError ? (
          <div className="p-3 text-xs text-red-600">
            {loadError}{' '}
            <Button variant="outline" size="sm" className="h-5 px-2 text-[11px] ml-1" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-3 text-xs text-zinc-500">No extras match this filter.</div>
        ) : (
          rows.map((e) => {
            const shipped = isShipped(e);
            const flagOn = e.flag ? features[e.flag] === true : false;
            const busy = e.flag === busyFlag;
            return (
              <div
                key={e.n}
                className={`flex gap-2 p-2 rounded-lg border ${shipped ? 'bg-white dark:bg-[#1E1E21] border-line' : 'bg-muted/30 border-dashed border-line/60 opacity-90'}`}
              >
                <span
                  className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${shipped ? 'bg-emerald-500 text-white' : 'bg-zinc-300 text-white'}`}
                >
                  {shipped ? <Check className="w-3.5 h-3.5" /> : e.n}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium flex items-center gap-1">
                    {e.title}
                    {shipped ? (
                      <span className="px-1 py-0 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px]">done</span>
                    ) : (
                      <span className="px-1 py-0 rounded bg-zinc-100 border border-line text-zinc-500 text-[10px]">todo</span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-500 leading-4">
                    {e.why} · <span className="font-mono text-zinc-400">{e.how}</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 leading-4 mt-0.5">
                    {shipped ? (
                      <span>Lives in: {e.where}</span>
                    ) : (
                      <span>
                        {e.flag ? (
                          <>
                            Flag <span className="font-mono">{e.flag}</span>
                            {e.milestone ? ` · ${e.milestone}` : ''}
                          </>
                        ) : (
                          e.milestone
                        )}
                      </span>
                    )}
                  </div>
                </div>
                {shipped ? (
                  e.tab && onOpenTab ? (
                    <Button variant="ghost" size="sm" className="h-5 text-[11px] shrink-0" onClick={() => onOpenTab(e.tab!)}>
                      Open <ArrowRight className="w-3 h-3" />
                    </Button>
                  ) : null
                ) : e.flag ? (
                  <Button
                    variant={flagOn ? 'default' : 'outline'}
                    size="sm"
                    className="h-5 px-2 text-[11px] shrink-0"
                    disabled={busy}
                    onClick={() => void toggleFlag(e.flag!, !flagOn)}
                    title={flagOn ? 'Disable this flag (persists to ~/.lokma/config.json)' : 'Enable this flag (persists to ~/.lokma/config.json)'}
                  >
                    {busy ? 'Saving' : flagOn ? 'Enabled' : 'Enable'}
                  </Button>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="p-2 border-t border-line bg-muted/20 text-[11px] text-zinc-500 flex gap-1 flex-wrap">
        <span className="flex items-center gap-1">
          <Crown className="w-3 h-3" /> Phase 3 stretch — pick by value for coding harness
        </span>
        <span className="ml-auto hidden sm:inline">Highest value: #1 templates · #3 eval · #4 fork · #5 cron · #6 approvals · #7 observability</span>
        <span className="w-full text-zinc-400">Toggles persist to ~/.lokma/config.json → features (same file the CLI reads); the runner wave lights them up.</span>
      </div>
    </div>
  );
}
