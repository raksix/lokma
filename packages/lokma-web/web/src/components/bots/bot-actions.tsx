import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useFocusTrap } from '@/components/shell/use-focus-trap';
import { validateForkForm, validateTaskForm } from './bots';
import type { Bot, BotVisibility } from '@/lib/api';

/**
 * BotActionDialog — REQ-161. The Gallery's live actions (run-agent, fork,
 * publish, delete) re-homed into the Bots mode: the selected bot's header
 * menu opens one of these small modals for the entries that need input, and
 * every submit still hits the same real endpoints the old BotsPane used
 * (`POST /api/bots/:id/run` / `:id/fork` / `:id/publish`, `DELETE /:id`) —
 * nothing is mocked, no dead buttons.
 *
 * Validation mirrors the server rules in `lokma-core/src/bots/store.ts`
 * through the shared helpers in `./bots` (same module the pane used).
 */

export type BotActionKind = 'run' | 'fork' | 'publish' | 'delete';

export type BotActionPayload = {
  task?: string;
  asId?: string;
  visibility?: BotVisibility;
};

const VISIBILITIES: { value: BotVisibility; label: string; hint: string }[] = [
  { value: 'private', label: 'Private', hint: 'Only you' },
  { value: 'shared', label: 'Shared', hint: 'Anyone with the link' },
  { value: 'public', label: 'Public', hint: 'Featured gallery' },
];

const SUBMIT_LABELS: Record<BotActionKind, string> = {
  run: 'Run agent',
  fork: 'Fork',
  publish: 'Publish',
  delete: 'Delete bot',
};

export function BotActionDialog({
  kind,
  bot,
  busy,
  error: serverError,
  onCancel,
  onSubmit,
}: {
  kind: BotActionKind;
  bot: Bot;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (payload: BotActionPayload) => void;
}) {
  const [task, setTask] = React.useState('');
  const [asId, setAsId] = React.useState('');
  const [visibility, setVisibility] = React.useState<BotVisibility>(bot.visibility);
  const [localError, setLocalError] = React.useState<string | null>(null);
  // Mounted only while the caller shows it (no `open` prop), so the trap
  // stays engaged for the whole lifetime — same pattern as BotDialog.
  const panelRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(true, panelRef, { onEscape: onCancel });

  const submit = () => {
    if (kind === 'run') {
      const invalid = validateTaskForm(task);
      if (invalid) {
        setLocalError(invalid);
        return;
      }
      setLocalError(null);
      onSubmit({ task });
      return;
    }
    if (kind === 'fork') {
      const invalid = validateForkForm(asId);
      if (invalid) {
        setLocalError(invalid);
        return;
      }
      setLocalError(null);
      onSubmit({ asId });
      return;
    }
    if (kind === 'publish') {
      onSubmit({ visibility });
      return;
    }
    onSubmit({});
  };

  const error = localError ?? serverError;
  const title =
    kind === 'run'
      ? `Run ${bot.name} as an agent`
      : kind === 'fork'
        ? `Fork ${bot.name}`
        : kind === 'publish'
          ? `Publish ${bot.name}`
          : `Delete ${bot.name}?`;
  const inputClass =
    'w-full rounded-md border border-line bg-white px-2 py-1 text-xs text-zinc-800 dark:bg-[#1E1E21] dark:text-zinc-100';

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        data-bot-action={kind}
        className="w-full max-w-sm rounded-lg border border-line bg-white p-4 shadow-xl dark:bg-[#161618]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold">{title}</div>

        {kind === 'run' ? (
          <>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Spawns a real agent — SOUL = the bot's system prompt, budgets mapped, tagged
              createdBy bot:{bot.id}.
            </p>
            <div className="mt-3">
              <label htmlFor="bot-action-task" className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                Task
              </label>
              <textarea
                id="bot-action-task"
                data-bot-task-input
                className={`${inputClass} min-h-[64px] resize-y`}
                placeholder="What should this agent work on?"
                value={task}
                maxLength={2000}
                onChange={(e) => setTask(e.target.value)}
              />
              <p className="mt-1 text-[10.5px] text-zinc-400">1-2000 characters.</p>
            </div>
          </>
        ) : null}

        {kind === 'fork' ? (
          <>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Clones bot.json plus its knowledge files; the fork is a separate, editable bot.
            </p>
            <div className="mt-3">
              <label htmlFor="bot-action-fork" className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                New bot id (optional)
              </label>
              <input
                id="bot-action-fork"
                data-bot-fork-input
                className={inputClass}
                placeholder={`${bot.id}-fork`}
                value={asId}
                maxLength={64}
                onChange={(e) => setAsId(e.target.value)}
              />
              <p className="mt-1 text-[10.5px] text-zinc-400">Empty id lands as {bot.id}-fork.</p>
            </div>
          </>
        ) : null}

        {kind === 'publish' ? (
          <>
            <p className="mt-0.5 text-[11px] text-zinc-500">Choose who can see this bot.</p>
            <div className="mt-3 space-y-1">
              {VISIBILITIES.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-line px-2 py-1.5 text-xs hover:bg-muted"
                >
                  <input
                    type="radio"
                    name="bot-action-visibility"
                    data-bot-publish={option.value}
                    checked={visibility === option.value}
                    onChange={() => setVisibility(option.value)}
                  />
                  <span className="font-medium text-ink">{option.label}</span>
                  <span className="ml-auto text-[10.5px] text-zinc-400">{option.hint}</span>
                </label>
              ))}
            </div>
          </>
        ) : null}

        {kind === 'delete' ? (
          <p className="mt-1.5 text-[11.5px] text-zinc-600 dark:text-zinc-300">
            This removes the bot's directory and its bot.json for good. Bundled templates are
            read-only and cannot be deleted — fork first if you need a copy.
          </p>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={kind === 'delete' ? 'destructive' : 'default'}
            size="sm"
            data-bot-action-submit
            className="h-7 text-xs"
            onClick={submit}
            disabled={busy}
          >
            {busy ? 'Working…' : SUBMIT_LABELS[kind]}
          </Button>
        </div>
      </div>
    </div>
  );
}
