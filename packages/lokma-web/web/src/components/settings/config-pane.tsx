import * as React from 'react';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { emitToast } from '@/components/shell';
import type { NormalizedConfig } from './settings';

/**
 * ConfigPane — the effective (merged) harness config, read live from
 * `GET /api/config`. The server owns the layer merge (global
 * `~/.lokma/config.json` < project `.lokma/settings.json` < `LOKMA_*`
 * env); this pane renders the merged result plus key-set status. The
 * concept's hardcoded layer examples are intentionally NOT ported —
 * every row below is a real server value.
 */
export function ConfigPane({ config, onReload }: { config: NormalizedConfig; onReload: () => Promise<void> }) {
  const [model, setModel] = React.useState(config.defaultModel);
  const [saving, setSaving] = React.useState(false);

  async function handleSaveModel(): Promise<void> {
    const next = model.trim();
    if (!next) {
      emitToast('Default model must not be empty');
      return;
    }
    setSaving(true);
    try {
      await api.patchConfig({ defaultModel: next });
      emitToast('Default model saved');
      await onReload();
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const credEntries = Object.entries(config.credentials);
  const keysSet = credEntries.filter(([, c]) => c.keySet).length;

  return (
    <div className="space-y-2 p-2 text-xs">
      <div className="rounded-lg border border-line bg-white p-2.5 dark:bg-[#1E1E21]">
        <div className="font-semibold">Effective config (merged: global &lt; project &lt; env)</div>
        <div className="mt-2 grid grid-cols-1 gap-1.5 font-mono text-[11px]">
          <div className="flex gap-2 rounded border border-line/50 bg-muted/50 p-1.5">
            <span className="shrink-0 font-semibold">defaultModel</span>
            <span className="truncate text-zinc-500">{config.defaultModel || '—'}</span>
          </div>
          <div className="flex gap-2 rounded border border-line/50 bg-muted/50 p-1.5">
            <span className="shrink-0 font-semibold">defaultProvider</span>
            <span className="truncate text-zinc-500">{config.defaultProvider || '—'}</span>
          </div>
          <div className="flex gap-2 rounded border border-line/50 bg-muted/50 p-1.5">
            <span className="shrink-0 font-semibold">theme</span>
            <span className="truncate text-zinc-500">{config.theme ?? '—'}</span>
          </div>
          <div className="flex gap-2 rounded border border-line/50 bg-muted/50 p-1.5">
            <span className="shrink-0 font-semibold">agents</span>
            <span className="truncate text-zinc-500">
              max {config.maxAgents ?? '—'} · concurrent {config.maxConcurrent ?? '—'} · queue {config.maxQueue ?? '—'}
            </span>
          </div>
          <div className="flex gap-2 rounded border border-line/50 bg-muted/50 p-1.5">
            <span className="shrink-0 font-semibold">coordinator</span>
            <span className="truncate text-zinc-500">{config.coordinatorMode || '—'}</span>
          </div>
          <div className="flex gap-2 rounded border border-line/50 bg-muted/50 p-1.5">
            <span className="shrink-0 font-semibold">vault</span>
            <span className="truncate text-zinc-500">{config.vaultHost ?? 'not configured'}</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-white p-2.5 dark:bg-[#1E1E21]">
        <label htmlFor="settings-default-model" className="font-semibold">
          Default model
        </label>
        <div className="mt-1.5 flex gap-1">
          <Input
            id="settings-default-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="provider::model-id"
            className="h-7 font-mono text-xs"
          />
          <Button size="sm" className="h-7 shrink-0 text-xs" disabled={saving} onClick={handleSaveModel}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">Persists to global config via PATCH /api/config.</div>
      </div>

      <div className="rounded-lg border border-[#F2D5C2] bg-[#FDF0E6] p-2.5 dark:bg-[#2A1E15]">
        <div className="flex items-center gap-1 font-semibold">
          <Shield className="h-3 w-3" /> credentials.json — AES-256-GCM, 0600, masked
        </div>
        <div className="mt-1 font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
          {credEntries.length === 0
            ? 'No provider credentials on record.'
            : `${keysSet}/${credEntries.length} providers have a key (GET returns keySet only, never values).`}
        </div>
        {credEntries.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {credEntries.map(([id, c]) => (
              <span
                key={id}
                className={
                  c.keySet
                    ? 'rounded border border-emerald-200 bg-emerald-50 px-1 py-0 font-mono text-[10px] text-emerald-700'
                    : 'rounded border border-line bg-zinc-100 px-1 py-0 font-mono text-[10px] text-zinc-500'
                }
              >
                {id}: {c.keySet ? 'key set' : 'no key'}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
