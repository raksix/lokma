import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CreateProviderBody, PatchProviderBody, ProviderInfo } from '@/lib/api';
import { validateProviderForm, type ProviderFormErrors } from './validation';

/**
 * ProviderDialog — add/edit form for providers (ported from the concept
 * SettingsPane "Add Provider" button, which only toasted "dialog yakında").
 * Every field has a visible label; placeholders show format examples only.
 * The key input is write-only: on edit, blank means "keep the stored key"
 * (the server never returns key values, so there is nothing to display).
 */
export function ProviderDialog({
  mode,
  initial,
  keySet,
  busy,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initial: ProviderInfo | null;
  keySet: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: CreateProviderBody | PatchProviderBody) => Promise<void>;
}) {
  const [id, setId] = React.useState(initial?.id ?? '');
  const [name, setName] = React.useState(initial?.name ?? '');
  const [baseUrl, setBaseUrl] = React.useState(initial?.baseUrl ?? '');
  const [apiKey, setApiKey] = React.useState('');
  const [enabled, setEnabled] = React.useState(initial?.enabled ?? true);
  const [showKey, setShowKey] = React.useState(false);
  const [errors, setErrors] = React.useState<ProviderFormErrors>({});
  const [serverError, setServerError] = React.useState<string | null>(null);

  const isEdit = mode === 'edit';

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const fieldErrors = validateProviderForm({ id, name, baseUrl }, isEdit);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;
    setServerError(null);
    const trimmedKey = apiKey.trim();
    try {
      if (isEdit) {
        const body: PatchProviderBody = {
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          enabled,
          ...(trimmedKey ? { apiKey: trimmedKey } : {}),
        };
        await onSubmit(body);
      } else {
        const body: CreateProviderBody = {
          id: id.trim(),
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          enabled,
          ...(trimmedKey ? { apiKey: trimmedKey } : {}),
        };
        await onSubmit(body);
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3 dark:bg-[#1E1E21]">
      <div className="text-xs font-semibold">{isEdit ? `Edit ${initial?.id}` : 'Add provider'}</div>
      <form onSubmit={handleSubmit} className="mt-2 space-y-2">
        {!isEdit && (
          <div>
            <label htmlFor="provider-id" className="mb-1 block text-[11px] font-medium text-zinc-500">
              Provider ID (slug, cannot change later)
            </label>
            <Input
              id="provider-id"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="e.g. my-bridge"
              className="h-7 text-xs"
              autoFocus
            />
            {errors.id && <div className="mt-1 text-[11px] text-red-600">{errors.id}</div>}
          </div>
        )}
        <div>
          <label htmlFor="provider-name" className="mb-1 block text-[11px] font-medium text-zinc-500">
            Display name
          </label>
          <Input
            id="provider-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Bridge"
            className="h-7 text-xs"
          />
          {errors.name && <div className="mt-1 text-[11px] text-red-600">{errors.name}</div>}
        </div>
        <div>
          <label htmlFor="provider-base" className="mb-1 block text-[11px] font-medium text-zinc-500">
            Base URL (OpenAI-compatible)
          </label>
          <Input
            id="provider-base"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="e.g. https://api.example.com/v1"
            className="h-7 font-mono text-xs"
          />
          {errors.baseUrl && <div className="mt-1 text-[11px] text-red-600">{errors.baseUrl}</div>}
        </div>
        <div>
          <label htmlFor="provider-key" className="mb-1 block text-[11px] font-medium text-zinc-500">
            API key {isEdit && keySet ? '(stored — leave blank to keep)' : '(optional for local endpoints)'}
          </label>
          <div className="relative flex items-center">
            <Input
              id="provider-key"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isEdit && keySet ? '••••••••••••••••' : 'e.g. sk-...'}
              className="h-7 pr-8 font-mono text-xs"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-1 grid h-5 w-5 place-items-center rounded hover:bg-muted"
              aria-label={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-[#C96442]"
          />
          Enabled
        </label>
        {serverError && <div className="text-[11px] text-red-600">{serverError}</div>}
        <div className="flex gap-1">
          <Button type="submit" size="sm" className="h-7 flex-1 text-xs" disabled={busy}>
            {busy ? 'Saving…' : isEdit ? 'Save' : 'Add provider'}
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
