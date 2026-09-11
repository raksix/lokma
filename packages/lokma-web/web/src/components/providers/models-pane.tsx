import * as React from 'react';
import { ChevronDown, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useProviderStore } from '@/stores';
import { emitToast } from '@/components/shell';
import type { ModelInfo } from '@/lib/api';
import { buildBulkMap, countEnabled, filterModels, groupByProvider } from './models';
import { DefaultModelPicker } from './default-model-picker';

/**
 * ModelsPane — real model enable/disable (ported from the concept
 * SettingsPane Models tab). Every row comes from `GET /api/models`
 * (merged `provider::id` catalog, 5m server cache); toggles persist via
 * `PATCH /api/models` (single or bulk) to `~/.lokma/config.json`.
 * Refresh fans out live to every enabled provider's `/v1/models` via
 * `POST /api/models/refresh` (REQ-032) — failures badge their provider
 * row without blocking the others.
 * The concept's mock-only columns (Ctx, badge) are NOT ported — the
 * server catalog carries no context sizes, and fake data is forbidden.
 * The concept's toast-only "Fallback chain" button is NOT ported either
 * (dead buttons stay out until the server owns a fallback-chain API).
 * This store is the single source the Composer dropdown reads.
 *
 * REQ-131 — two fixes and one parity item:
 * - Bulk actions target what the user SEES: with a search filter active the
 *   Allow/Disable buttons scope to the matches, otherwise to the whole
 *   catalog, and the label always carries the count.
 * - Rows are grouped by provider under sticky headers (same grouping the
 *   Composer dropdown already had), each with its own All/None shortcut.
 */
export function ModelsPane() {
  const models = useProviderStore((s) => s.models);
  const loading = useProviderStore((s) => s.loading);
  const refresh = useProviderStore((s) => s.refresh);
  const refreshModelsLive = useProviderStore((s) => s.refreshModelsLive);
  const setModelEnabled = useProviderStore((s) => s.setModelEnabled);
  const setModelsBulk = useProviderStore((s) => s.setModelsBulk);
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = React.useMemo(() => filterModels(models, query), [models, query]);
  const groups = React.useMemo(() => groupByProvider(filtered), [filtered]);
  const enabledCount = countEnabled(filtered);
  const filtering = query.trim().length > 0;
  // A filtered list means the user is looking at a subset — scope bulk to it.
  const bulkTargets = filtering ? filtered : models;

  async function handleToggle(id: string, next: boolean): Promise<void> {
    try {
      await setModelEnabled(id, next);
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Model update failed');
    }
  }

  async function handleBulk(targets: ModelInfo[], enabled: boolean, scope: string): Promise<void> {
    if (targets.length === 0) return;
    setBusy(true);
    try {
      const res = await setModelsBulk(buildBulkMap(targets, enabled));
      const verb = enabled ? 'Enabled' : 'Disabled';
      const skipped = res.skipped ?? 0;
      emitToast(
        `${verb} ${res.updated} ${scope}${skipped > 0 ? ` · ${skipped} skipped (not in catalog)` : ''}`,
      );
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Model update failed');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Live fan-out refresh (REQ-032) — every enabled provider's `/v1/models`
   * is probed at once; failures badge their provider row without blocking
   * the others, keyless providers are reported as skipped.
   */
  async function handleRefresh(): Promise<void> {
    setBusy(true);
    try {
      const res = await refreshModelsLive();
      const failed = res.providers.filter((p) => !p.ok && !p.skipped);
      const skipped = res.providers.filter((p) => p.skipped);
      const live = res.providers.length - failed.length - skipped.length;
      emitToast(
        failed.length === 0
          ? `Refreshed ${res.count} models · ${live} provider${live === 1 ? '' : 's'} live${skipped.length > 0 ? ` · ${skipped.length} skipped (no key)` : ''}`
          : `Refreshed ${res.count} models · ${failed.length} failed: ${failed.map((p) => p.id).join(', ')}`,
      );
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 p-2">
      <div className="rounded-lg border border-line bg-white p-2.5 text-xs dark:bg-[#1E1E21]">
        <DefaultModelPicker />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <div className="relative min-w-[160px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search models — id / provider..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={busy || bulkTargets.length === 0}
          title={filtering ? `Enable the ${bulkTargets.length} models matching "${query.trim()}"` : 'Enable every catalog model'}
          onClick={() => void handleBulk(bulkTargets, true, filtering ? 'shown' : 'models')}
        >
          {filtering ? `Allow ${bulkTargets.length} shown` : `Allow All (${bulkTargets.length})`}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={busy || bulkTargets.length === 0}
          title={filtering ? `Disable the ${bulkTargets.length} models matching "${query.trim()}"` : 'Disable every catalog model'}
          onClick={() => void handleBulk(bulkTargets, false, filtering ? 'shown' : 'models')}
        >
          {filtering ? `Disable ${bulkTargets.length} shown` : `Disable All (${bulkTargets.length})`}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setQuery('')}>
          Clear
        </Button>
        <span className="text-[11px] text-zinc-400">
          {enabledCount}/{filtered.length} enabled
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="max-h-[320px] overflow-auto">
          {groups.map((group) => {
            const on = countEnabled(group.models);
            const isCollapsed = collapsed[group.provider] === true;
            return (
              <div key={group.provider} className="border-b border-line/60 last:border-b-0">
                <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-line/60 bg-[#FDFCFB] px-2 py-1 dark:bg-[#1E1E21]">
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [group.provider]: !isCollapsed }))}
                    aria-expanded={!isCollapsed}
                    className="flex min-w-0 flex-1 items-center gap-1 text-left"
                  >
                    <ChevronDown
                      className={cn(
                        'h-3 w-3 shrink-0 text-zinc-400 transition-transform',
                        isCollapsed && '-rotate-90',
                      )}
                    />
                    <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                      {group.provider}
                    </span>
                    <span className="shrink-0 text-[10px] text-zinc-400">
                      {on}/{group.models.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded px-1 text-[10px] text-zinc-500 hover:text-[#C96442] disabled:opacity-40"
                    onClick={() => void handleBulk(group.models, true, `${group.provider} models`)}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded px-1 text-[10px] text-zinc-500 hover:text-[#C96442] disabled:opacity-40"
                    onClick={() => void handleBulk(group.models, false, `${group.provider} models`)}
                  >
                    None
                  </button>
                </div>
                {!isCollapsed &&
                  group.models.map((m) => (
                    <label
                      key={`${m.provider}::${m.id}`}
                      className="grid cursor-pointer grid-cols-[28px_1fr_60px] items-center gap-1 border-b border-line/40 px-2 py-1.5 text-xs last:border-b-0 hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        checked={m.enabled}
                        onChange={() => void handleToggle(m.id, !m.enabled)}
                        className="accent-[#C96442]"
                        aria-label={`Enable ${m.id}`}
                      />
                      <span className="truncate font-mono" title={m.id}>
                        {m.label || m.id}
                      </span>
                      <span
                        className={cn(
                          'h-2 w-2 justify-self-center rounded-full',
                          m.enabled ? 'bg-emerald-500' : 'bg-zinc-300',
                        )}
                      />
                    </label>
                  ))}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="p-4 text-center text-xs text-zinc-400">
              {loading ? 'Loading models…' : 'No matches'}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        <Button size="sm" className="h-7 flex-1 gap-1 text-xs" disabled={loading || busy} onClick={() => void handleRefresh()}>
          <RefreshCw className="h-3 w-3" />
          {busy ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      <div className="text-[11px] text-zinc-500">
        Grouped by provider — same header layout as the Composer dropdown. Only enabled models appear in Composer +
        Ctrl+M.
      </div>
    </div>
  );
}
