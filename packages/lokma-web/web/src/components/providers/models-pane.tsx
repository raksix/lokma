import * as React from 'react';
import { ChevronDown, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useProviderStore } from '@/stores';
import { emitToast } from '@/components/shell';
import type { ModelInfo } from '@/lib/api';
import {
  buildBulkMap,
  countEnabled,
  filterModels,
  groupByProvider,
  MODELS_SPLIT_CLASS,
  modelPreviewRows,
  modelRowKey,
  modelsListClass,
  modelsListScrollClass,
  providerIndex,
  scopeGroupsToProvider,
  shouldFocusModelSearch,
} from './models';
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
 *
 * REQ-194 Kapsam 4 — `wide` (settings modal in full screen) swaps the
 * single column for provider index | rows | detail, drops the fixed 320px
 * well so the surrounding body owns the scroll, and adds the `/` search
 * shortcut. Every geometry and decision behind it is a pure helper in
 * `models.ts` (probe-covered); the prop defaults to false, so the
 * Inspector tab and Inspector panel callers keep the shipped layout.
 */
export function ModelsPane({ wide = false }: { wide?: boolean }) {
  const models = useProviderStore((s) => s.models);
  const loading = useProviderStore((s) => s.loading);
  const refresh = useProviderStore((s) => s.refresh);
  const refreshModelsLive = useProviderStore((s) => s.refreshModelsLive);
  const setModelEnabled = useProviderStore((s) => s.setModelEnabled);
  const setModelsBulk = useProviderStore((s) => s.setModelsBulk);
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  // REQ-194 Kapsam 4 — provider index selection + the row shown in the
  // detail panel. Both are split-layout state only; in the single column
  // they are never written and never read.
  const [provider, setProvider] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = React.useMemo(() => filterModels(models, query), [models, query]);
  const groups = React.useMemo(() => groupByProvider(filtered), [filtered]);
  // REQ-194 Kapsam 4 — in the split layout the provider index scopes the
  // list; in the single column the selection is never written, so scoping
  // is a no-op there (same helper, no second copy of the expression).
  const scopedGroups = React.useMemo(
    () => (provider === null ? groups : scopeGroupsToProvider(groups, provider)),
    [groups, provider],
  );
  const index = React.useMemo(() => providerIndex(scopedGroups), [scopedGroups]);
  const enabledCount = countEnabled(filtered);
  const filtering = query.trim().length > 0;
  // A filtered list means the user is looking at a subset — scope bulk to it.
  const bulkTargets = filtering ? filtered : models;
  const listShell = modelsListClass(wide);
  const listScroll = modelsListScrollClass(wide);
  // The detail panel shows a row of the SCOPED list; an unknown/stale
  // selection resolves to null (an honest empty panel, never a wrong row).
  const preview = React.useMemo(
    () =>
      wide
        ? (scopedGroups.flatMap((g) => g.models).find((m) => modelRowKey(m) === selectedId) ?? null)
        : null,
    [wide, scopedGroups, selectedId],
  );

  // REQ-194 Kapsam 4 — `/` focuses the search field. Editable targets keep
  // their literal slash (typing a path into the filter must still work).
  React.useEffect(() => {
    if (!wide) return;
    function onKey(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      const editable =
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable === true);
      if (!shouldFocusModelSearch(e.key, editable)) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [wide]);

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
    // REQ-194 Kapsam 4 — in full screen the pane is a flex column that
    // fills the modal body so the split grid (and the un-capped scroll well
    // inside it) get a real height; the default shell keeps `space-y-2 p-2`
    // byte-identical, so the Inspector callers are untouched.
    <div
      className={cn(wide ? 'flex h-full min-h-0 flex-col gap-2 p-2' : 'space-y-2 p-2')}
      data-models-pane={wide ? 'wide' : undefined}
    >
      <div className="shrink-0 rounded-lg border border-line bg-white p-2.5 text-xs dark:bg-[#1E1E21]">
        <DefaultModelPicker />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <div className="relative min-w-[160px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400" />
          <Input
            ref={searchRef}
            placeholder="Search models — id / provider..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 pl-7 text-xs"
            data-model-search
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
      {/* REQ-194 Kapsam 4 — in full screen the catalog gets the width its
          shape deserves: a provider index on the left, the rows in the
          middle, the selected row's detail on the right. Below `lg` the
          grid stacks and the two side columns are hidden, so a 390px
          phone keeps exactly the single column it had. In the default
          (non-wide) shell this wrapper has no class at all — one plain
          block, the shipped layout untouched. */}
      <div className={cn(wide && MODELS_SPLIT_CLASS)} data-models-split={wide ? '1' : undefined}>
        {wide && (
          <nav aria-label="Model providers" className="hidden min-h-0 flex-col gap-0.5 overflow-y-auto lg:flex">
            <button
              type="button"
              onClick={() => setProvider(null)}
              aria-pressed={provider === null}
              data-model-provider=""
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px]',
                provider === null
                  ? 'bg-terracotta/10 font-medium text-terracotta'
                  : 'text-zinc-600 hover:bg-muted dark:text-zinc-300',
              )}
            >
              <span className="min-w-0 flex-1 truncate">All providers</span>
              <span className="shrink-0 text-[10px] text-zinc-400">{filtered.length}</span>
            </button>
            {index.map((row) => (
              <button
                key={row.provider}
                type="button"
                onClick={() => setProvider(row.provider)}
                aria-pressed={provider === row.provider}
                data-model-provider={row.provider}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px]',
                  provider === row.provider
                    ? 'bg-terracotta/10 font-medium text-terracotta'
                    : 'text-zinc-600 hover:bg-muted dark:text-zinc-300',
                )}
              >
                <span className="min-w-0 flex-1 truncate font-mono">{row.provider}</span>
                <span className="shrink-0 text-[10px] text-zinc-400">
                  {row.enabled}/{row.total}
                </span>
              </button>
            ))}
          </nav>
        )}
        <div className={cn(wide && 'flex min-h-0 flex-col')} data-models-center>
      <div className={cn(wide && 'flex min-h-0 flex-1 flex-col', listShell)} data-models-list>
        <div className={listScroll} data-models-scroll>
          {scopedGroups.map((group) => {
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
                      key={modelRowKey(m)}
                      className={cn(
                        'grid cursor-pointer grid-cols-[28px_1fr_60px] items-center gap-1 border-b border-line/40 px-2 py-1.5 text-xs last:border-b-0 hover:bg-muted/30',
                        // REQ-194 Kapsam 4 — the selected row is what the
                        // detail panel describes. Full literal classes (no
                        // `bg-${}` interpolation — Tailwind v4 never compiles
                        // a dynamic name, the style would silently vanish).
                        selectedId === modelRowKey(m) && wide && 'bg-terracotta/10',
                      )}
                      data-model-row={modelRowKey(m)}
                      onClick={wide ? () => setSelectedId(modelRowKey(m)) : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={m.enabled}
                        onChange={() => void handleToggle(m.id, !m.enabled)}
                        className="accent-[#C96442]"
                        aria-label={`Enable ${m.id}`}
                      />
                      <span className="flex min-w-0 items-center gap-1.5 font-mono" title={m.id}>
                        <span className="truncate">{m.label || m.id}</span>
                        {m.unsupported === true && (
                          <span className="shrink-0 rounded border border-amber-300 bg-amber-50 px-1 py-px text-[9px] font-medium text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-500">
                            not on server
                          </span>
                        )}
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
          {scopedGroups.length === 0 && (
            <div className="p-4 text-center text-xs text-zinc-400">
              {loading ? 'Loading models…' : 'No matches'}
            </div>
          )}
        </div>
      </div>
        </div>
        {/* The detail panel — the selected row's REAL fields only. Kapsam 4
            asked for capacity/context/price; the server catalog carries none
            of them (see `modelPreviewRows`), so it states what it knows and
            never invents a number. */}
        {wide && (
          <aside className="hidden min-h-0 overflow-y-auto lg:block" data-models-detail>
            {preview ? (
              <div className="space-y-2 rounded-lg border border-line p-2.5">
                <div className="truncate text-xs font-semibold" title={preview.label || preview.id}>
                  {preview.label || preview.id}
                </div>
                <dl className="space-y-1">
                  {modelPreviewRows(preview).map((row) => (
                    <div key={row.label} className="text-[11px]">
                      <dt className="text-zinc-500">{row.label}</dt>
                      <dd className={cn('break-all text-zinc-700 dark:text-zinc-200', row.mono && 'font-mono')}>
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <div className="rounded-lg border border-line p-3 text-center text-[11px] text-zinc-400">
                Select a model to see its details
              </div>
            )}
          </aside>
        )}
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
