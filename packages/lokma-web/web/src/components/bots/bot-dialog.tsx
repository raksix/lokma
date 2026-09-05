import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useFocusTrap } from '@/components/shell/use-focus-trap';
import { emptyCreateForm, validateCreateForm, type CreateBotForm } from './bots';
import type { BotVisibility } from '@/lib/api';

/**
 * BotDialog — create-bot form with visible labels (form UX rule: no
 * placeholder-only inputs). Pre-validates with the same rules as the
 * server (`lokma-core/src/bots/store.ts`), then POSTs through the caller.
 * Mounted only while open (the caller gates on `showCreate`), so no
 * `open` prop — same pattern as the edit-inline detail in BotsPane.
 */
export function BotDialog({
  initial,
  busy,
  error: serverError,
  onCancel,
  onSubmit,
}: {
  initial: CreateBotForm;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (form: CreateBotForm) => void;
}) {
  const [form, setForm] = React.useState<CreateBotForm>(initial);
  const [localError, setLocalError] = React.useState<string | null>(null);
  // Always mounted while the caller shows it — the trap stays engaged for
  // the whole lifetime (open is constant-true, Escape cancels).
  const panelRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(true, panelRef, { onEscape: onCancel });

  const set =
    (key: keyof CreateBotForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
    };

  const submit = () => {
    const problem = validateCreateForm(form);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    onSubmit(form);
  };

  const error = localError ?? serverError;
  const inputClass =
    'w-full rounded-md border border-line bg-white px-2 py-1 text-xs text-zinc-800 dark:bg-[#1E1E21] dark:text-zinc-100';

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Create bot"
    >
      <div
        ref={panelRef}
        className="w-full max-w-md rounded-lg border border-line bg-white p-4 shadow-xl dark:bg-[#161618]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold">Create bot</div>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          A new `bot.json` package under `~/.lokma/bots/` — forkable, runnable as an agent.
        </p>
        <div className="mt-3 space-y-2.5">
          <div>
            <label htmlFor="bot-name" className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
              Name
            </label>
            <input
              id="bot-name"
              className={inputClass}
              placeholder="Vault Scout"
              value={form.name}
              onChange={set('name')}
              maxLength={60}
            />
          </div>
          <div>
            <label
              htmlFor="bot-description"
              className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
            >
              Description
            </label>
            <textarea
              id="bot-description"
              className={inputClass}
              placeholder="What this bot does, in one or two sentences"
              value={form.description}
              onChange={set('description')}
              rows={2}
              maxLength={500}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="bot-model" className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                Model
              </label>
              <input
                id="bot-model"
                className={inputClass}
                placeholder="anthropic/claude-4-sonnet"
                value={form.model}
                onChange={set('model')}
              />
            </div>
            <div>
              <label
                htmlFor="bot-visibility"
                className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
              >
                Visibility
              </label>
              <select
                id="bot-visibility"
                className={inputClass}
                value={form.visibility}
                onChange={(e) => setForm((prev) => ({ ...prev, visibility: e.target.value as BotVisibility }))}
              >
                <option value="private">private</option>
                <option value="shared">shared</option>
                <option value="public">public</option>
              </select>
            </div>
          </div>
          <div>
            <label
              htmlFor="bot-prompt"
              className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
            >
              System prompt <span className="font-normal text-zinc-400">(optional — becomes the agent SOUL on run)</span>
            </label>
            <textarea
              id="bot-prompt"
              className={inputClass}
              placeholder="You are a careful reviewer…"
              value={form.systemPrompt}
              onChange={set('systemPrompt')}
              rows={4}
              maxLength={20000}
            />
          </div>
          {error ? <div className="rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">{error}</div> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={submit} disabled={busy}>
              {busy ? 'Creating…' : 'Create bot'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
