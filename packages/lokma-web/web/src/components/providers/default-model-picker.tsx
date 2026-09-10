import * as React from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useProviderStore } from '@/stores';
import { emitToast } from '@/components/shell';
import { normalizeConfig } from '@/components/settings/settings';
import { enabledModels, resolveDefaultModel, type DefaultModelSource } from './models';

/** Human words for the chain step that produced the effective model. */
const SOURCE_LABEL: Record<DefaultModelSource, string> = {
  'configured': 'Your pick',
  'most-used': 'Most used (30d)',
  'first-enabled': 'First available',
  'fallback': 'Built-in fallback',
};

/**
 * DefaultModelPicker — the single editor for `defaultModel` (REQ-104),
 * shared by the Models tab and the Config tab so the two never diverge.
 * A dropdown over enabled catalog models plus an `Auto (smart chain)`
 * empty value; persisting goes through `PATCH /api/config`. The hint line
 * always shows the resolved effective model and which chain step won:
 * configured → most-used (30d usage) → first enabled → built-in fallback.
 */
export function DefaultModelPicker({ onSaved }: { onSaved?: () => Promise<void> | void }) {
  const storeModels = useProviderStore((s) => s.models);
  const storeLoading = useProviderStore((s) => s.loading);
  const refreshProviders = useProviderStore((s) => s.refresh);
  const [configured, setConfigured] = React.useState<string | null>(null);
  const [usageTop, setUsageTop] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const [cfgRes, usageRes] = await Promise.all([
        api.getConfig(),
        api.getUsageSummary('30d').catch(() => null),
      ]);
      const next = normalizeConfig(cfgRes).defaultModel;
      setConfigured(next);
      setSelected(next);
      setUsageTop(usageRes?.summary?.topModel ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Default model load failed');
    }
  }, []);

  React.useEffect(() => {
    void refreshProviders();
    void load();
  }, [refreshProviders, load]);

  const enabled = React.useMemo(() => enabledModels(storeModels), [storeModels]);
  const configuredKnown = configured !== null && configured !== '' && !enabled.some((m) => m.id === configured);
  const resolved = React.useMemo(
    () =>
      resolveDefaultModel({
        configured: selected,
        usageTop,
        models: storeModels,
      }),
    [selected, usageTop, storeModels],
  );

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      await api.patchConfig({ defaultModel: selected });
      setConfigured(selected);
      emitToast(selected ? 'Default model saved' : 'Default model set to Auto');
      await onSaved?.();
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const dirty = configured !== null && selected !== configured;

  return (
    <div>
      <label htmlFor="default-model-picker" className="font-semibold">
        Default model
      </label>
      {loadError !== null ? (
        <div className="mt-1.5 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
          {loadError}{' '}
          <button
            onClick={() => {
              void load();
            }}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : configured === null ? (
        <div className="mt-1.5 text-[11px] text-zinc-500">Loading models…</div>
      ) : (
        <div className="mt-1.5 flex gap-1">
          <select
            id="default-model-picker"
            value={selected}
            disabled={storeLoading && enabled.length === 0}
            onChange={(e) => setSelected(e.target.value)}
            className="h-7 min-w-0 flex-1 rounded-md border border-line bg-white px-1.5 font-mono text-xs focus:outline-none dark:bg-[#0F0F11]"
          >
            <option value="">Auto (smart chain)</option>
            {enabled.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label || m.id}
              </option>
            ))}
            {configuredKnown && <option value={configured ?? ''}>{configured} (unavailable)</option>}
          </select>
          <Button size="sm" className="h-7 shrink-0 text-xs" disabled={saving || !dirty} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
      {configured !== null && (
        <div className="mt-1 text-[11px] text-zinc-500">
          Effective: <span className="font-mono">{resolved.model}</span> · {SOURCE_LABEL[resolved.source]}
        </div>
      )}
    </div>
  );
}
