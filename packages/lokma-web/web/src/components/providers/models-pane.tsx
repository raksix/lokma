import * as React from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useProviderStore } from '@/stores';
import { emitToast } from '@/components/shell';
import { buildBulkMap, countEnabled, filterModels } from './models';

/**
 * ModelsPane — real model enable/disable (ported from the concept
 * SettingsPane Models tab). Every row comes from `GET /api/models`
 * (merged `provider::id` catalog, 5m server cache); toggles persist via
 * `PATCH /api/models` (single or bulk) to `~/.lokma/config.json`.
 * The concept's mock-only columns (Ctx, badge) are NOT ported — the
 * server catalog carries no context sizes, and fake data is forbidden.
 * The concept's toast-only "Fallback chain" button is NOT ported either
 * (dead buttons stay out until the server owns a fallback-chain API).
 * This store is the single source the Composer dropdown reads.
 */
export function ModelsPane() {
  const models = useProviderStore((s) => s.models);
  const loading = useProviderStore((s) => s.loading);
  const refresh = useProviderStore((s) => s.refresh);
  const setModelEnabled = useProviderStore((s) => s.setModelEnabled);
  const setModelsBulk = useProviderStore((s) => s.setModelsBulk);
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = React.useMemo(() => filterModels(models, query), [models, query]);
  const enabledCount = countEnabled(filtered);

  async function handleToggle(id: string, next: boolean): Promise<void> {
    try {
      await setModelEnabled(id, next);
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Model update failed');
    }
  }

  async function handleBulk(enabled: boolean): Promise<void> {
    if (models.length === 0) return;
    setBusy(true);
    try {
      await setModelsBulk(buildBulkMap(models, enabled));
      emitToast(enabled ? `Enabled ${models.length} models` : `Disabled ${models.length} models`);
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Model update failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh(): Promise<void> {
    await refresh(true);
  }

  return (
    <div className="space-y-2 p-2">
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
        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => void handleBulk(true)}>
          Allow All
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => void handleBulk(false)}>
          Disable All
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setQuery('')}>
          Clear
        </Button>
        <span className="text-[11px] text-zinc-400">
          {enabledCount}/{filtered.length} enabled
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-[28px_1fr_90px_60px] gap-1 border-b border-line bg-[#FDFCFB] px-2 py-1.5 text-[11px] font-semibold text-zinc-500 dark:bg-[#1E1E21]">
          <span className="sr-only">Toggle</span>
          <span>Model</span>
          <span>Provider</span>
          <span className="justify-self-center">On</span>
        </div>
        <div className="max-h-[320px] divide-y divide-line/50 overflow-auto">
          {filtered.map((m) => (
            <label
              key={`${m.provider}::${m.id}`}
              className="grid cursor-pointer grid-cols-[28px_1fr_90px_60px] items-center gap-1 px-2 py-1.5 text-xs hover:bg-muted/30"
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
                  'w-fit rounded-full border px-1.5 py-0.5 text-[10px]',
                  m.provider === 'anthropic'
                    ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300'
                    : m.provider === 'openai'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'border-line bg-zinc-100 text-zinc-600',
                )}
              >
                {m.provider}
              </span>
              <span
                className={cn(
                  'h-2 w-2 justify-self-center rounded-full',
                  m.enabled ? 'bg-emerald-500' : 'bg-zinc-300',
                )}
              />
            </label>
          ))}
          {filtered.length === 0 && (
            <div className="p-4 text-center text-xs text-zinc-400">
              {loading ? 'Loading models…' : 'No matches'}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        <Button size="sm" className="h-7 flex-1 gap-1 text-xs" disabled={loading} onClick={() => void handleRefresh()}>
          <RefreshCw className="h-3 w-3" />
          Refresh
        </Button>
      </div>
      <div className="text-[11px] text-zinc-500">
        Frontend key = `provider::id` — same id on two providers stays distinct. Only enabled models appear in
        Composer + Ctrl+M.
      </div>
    </div>
  );
}
