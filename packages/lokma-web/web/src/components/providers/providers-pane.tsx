import * as React from 'react';
import {
  ArrowDown,
  ArrowUp,
  FlaskConical,
  GripVertical,
  Link2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CreateProviderBody, PatchProviderBody, ProviderInfo } from '@/lib/api';
import { useProviderStore } from '@/stores';
import { emitToast } from '@/components/shell';
import { ProviderDialog } from './provider-dialog';
import { countModelsByProvider } from './validation';

/**
 * ProvidersPane — real provider management (ported from the concept
 * SettingsPane Providers tab). Every row comes from `GET /api/providers`
 * (built-ins + custom entries, priority-sorted); keys are write-only
 * (keySet badge only, values never reach the client). Test pings the live
 * `/v1/models` endpoint via `POST /api/providers/:id/test` — the concept's
 * toast-only Test button and mock `sk-ant-***-visible-mock` key preview
 * are intentionally NOT ported.
 */

type DialogState = { mode: 'create' } | { mode: 'edit'; provider: ProviderInfo } | null;

function ProviderRow({
  provider,
  modelCount,
  isFirst,
  isLast,
  onMove,
}: {
  provider: ProviderInfo;
  modelCount: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  const testResults = useProviderStore((s) => s.testResults);
  const testingId = useProviderStore((s) => s.testingId);
  const testProvider = useProviderStore((s) => s.testProvider);
  const patchProvider = useProviderStore((s) => s.patchProvider);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const deleteProvider = useProviderStore((s) => s.deleteProvider);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const result = testResults[provider.id];
  const testing = testingId === provider.id;
  const status: 'ok' | 'error' | 'idle' = result ? (result.ok ? 'ok' : 'error') : 'idle';

  async function handleTest(): Promise<void> {
    const res = await testProvider(provider.id);
    emitToast(res.ok ? `${provider.id} test ok — ${res.modelCount ?? 0} models` : `${provider.id} test failed — ${res.error ?? 'unknown'}`);
  }

  async function handleToggleEnabled(): Promise<void> {
    try {
      await patchProvider(provider.id, { enabled: !provider.enabled });
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await deleteProvider(provider.id);
      emitToast(`Deleted ${provider.id}`);
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Delete failed');
      setConfirmDelete(false);
    }
  }

  async function handleEditSubmit(body: CreateProviderBody | PatchProviderBody): Promise<void> {
    setBusy(true);
    try {
      await patchProvider(provider.id, body as PatchProviderBody);
      setDialogOpen(false);
      emitToast(`Saved ${provider.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-2.5 transition hover:border-terracotta/20 hover:shadow-sm dark:bg-[#1E1E21]">
      <div className="flex items-center gap-2">
        <GripVertical className="h-3 w-3 shrink-0 text-zinc-300" />
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            status === 'ok' ? 'bg-emerald-500' : status === 'error' ? 'bg-red-500' : 'bg-zinc-300',
          )}
          title={status === 'idle' ? 'never tested' : status}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            {provider.name}
            <span className="text-[11px] font-normal text-zinc-400">
              · {modelCount} model{modelCount === 1 ? '' : 's'}
            </span>
            {provider.keySet ? (
              <span className="rounded border border-emerald-200 bg-emerald-50 px-1 py-0 text-[10px] text-emerald-700">
                key set
              </span>
            ) : (
              <span className="rounded border border-line bg-zinc-100 px-1 py-0 text-[10px] text-zinc-500">no key</span>
            )}
            {provider.custom && (
              <span className="rounded border border-line bg-muted px-1 py-0 text-[10px] text-zinc-500">custom</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-zinc-400">
            <Link2 className="h-3 w-3 shrink-0" />
            <span className="truncate font-mono">{provider.baseUrl}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onMove(-1)}
            disabled={isFirst}
            className="grid h-6 w-6 place-items-center rounded hover:bg-muted disabled:opacity-30"
            aria-label={`Move ${provider.id} up`}
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={isLast}
            className="grid h-6 w-6 place-items-center rounded hover:bg-muted disabled:opacity-30"
            aria-label={`Move ${provider.id} down`}
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-500">
          <input
            type="checkbox"
            checked={provider.enabled}
            onChange={handleToggleEnabled}
            className="accent-[#C96442]"
          />
          Enabled
        </label>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-6 gap-1 text-[11px]"
          onClick={handleTest}
          disabled={testing}
        >
          <FlaskConical className="h-3 w-3" />
          {testing ? 'Testing…' : 'Test'}
        </Button>
        <Button variant="ghost" size="sm" className="h-6 gap-1 text-[11px]" onClick={() => setDialogOpen(true)}>
          <Pencil className="h-3 w-3" />
          Edit
        </Button>
        {provider.custom ? (
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-6 gap-1 text-[11px]', confirmDelete && 'text-red-600')}
            onClick={handleDelete}
          >
            <Trash2 className="h-3 w-3" />
            {confirmDelete ? 'Confirm?' : 'Delete'}
          </Button>
        ) : (
          <span className="px-1 text-[10px] text-zinc-300" title="Built-in providers cannot be deleted (disable instead)">
            built-in
          </span>
        )}
      </div>
      {result && (
        <div className={cn('mt-1.5 truncate font-mono text-[11px]', result.ok ? 'text-emerald-700' : 'text-red-600')}>
          {result.ok
            ? `ok — ${result.modelCount ?? 0} models · ${result.latencyMs ?? 0}ms`
            : `failed — ${result.error ?? 'unknown error'}`}
        </div>
      )}
      {dialogOpen && (
        <div className="mt-2">
          <ProviderDialog
            mode="edit"
            initial={provider}
            keySet={provider.keySet}
            busy={busy}
            onClose={() => setDialogOpen(false)}
            onSubmit={handleEditSubmit}
          />
        </div>
      )}
    </div>
  );
}

export function ProvidersPane() {
  const providers = useProviderStore((s) => s.providers);
  const models = useProviderStore((s) => s.models);
  const loading = useProviderStore((s) => s.loading);
  const lastError = useProviderStore((s) => s.lastError);
  const refresh = useProviderStore((s) => s.refresh);
  const createProvider = useProviderStore((s) => s.createProvider);
  const reorderProviders = useProviderStore((s) => s.reorderProviders);
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(body: CreateProviderBody | PatchProviderBody): Promise<void> {
    setBusy(true);
    try {
      const created = body as CreateProviderBody;
      await createProvider(created);
      setDialog(null);
      emitToast(`Added ${created.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleMove(id: string, dir: -1 | 1): Promise<void> {
    const ids = providers.map((p) => p.id);
    const idx = ids.indexOf(id);
    const other = idx + dir;
    if (idx < 0 || other < 0 || other >= ids.length) return;
    [ids[idx], ids[other]] = [ids[other], ids[idx]];
    try {
      await reorderProviders(ids);
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Reorder failed');
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">
          Providers · {providers.length} · order = fallback priority
        </span>
        <Button size="sm" className="ml-auto h-6 gap-1 text-xs" onClick={() => setDialog({ mode: 'create' })}>
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>

      {dialog?.mode === 'create' && (
        <ProviderDialog
          mode="create"
          initial={null}
          keySet={false}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={handleCreate}
        />
      )}

      {loading && providers.length === 0 && <div className="p-3 text-center text-xs text-zinc-400">Loading providers…</div>}

      {lastError && providers.length === 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
          {lastError}{' '}
          <button className="underline" onClick={() => void refresh(true)}>
            Retry
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {providers.map((p, i) => (
          <ProviderRow
            key={p.id}
            provider={p}
            modelCount={countModelsByProvider(models, p.id)}
            isFirst={i === 0}
            isLast={i === providers.length - 1}
            onMove={(dir) => void handleMove(p.id, dir)}
          />
        ))}
      </div>

      <div className="rounded-md border border-dashed border-line bg-muted/50 p-2 text-[11px] text-zinc-500">
        Keys encrypted AES-GCM at rest — never returned in GET (only keySet). Test pings the live /v1/models endpoint.
      </div>
    </div>
  );
}
