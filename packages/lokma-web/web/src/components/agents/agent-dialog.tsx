import * as React from 'react';
import { Button } from '@/components/ui/button';
import { PERSONA_OPTIONS, emptyAgentForm, validateAgentForm, type AgentForm } from './agents';

/**
 * AgentDialog — create-agent form with visible labels (form UX rule: no
 * placeholder-only inputs). Pre-validates with the same rules as the server,
 * then POSTs through the caller. Edit (name/model/budgets) lives inline in
 * the detail view — this dialog only creates.
 */
export function AgentDialog({
  open,
  busy,
  serverError,
  onClose,
  onCreate,
}: {
  open: boolean;
  busy: boolean;
  serverError: string | null;
  onClose: () => void;
  onCreate: (body: {
    name: string;
    persona: string;
    model: string;
    cwd?: string;
    budgets?: { tokens?: number; usd?: number };
  }) => void;
}) {
  const [form, setForm] = React.useState<AgentForm>(() => emptyAgentForm());
  const [localError, setLocalError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(emptyAgentForm());
      setLocalError(null);
    }
  }, [open ]);

  if (!open) return null;

  const set = (key: keyof AgentForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const submit = () => {
    const problem = validateAgentForm(form);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    const budgets: { tokens?: number; usd?: number } = {};
    if (form.tokens.trim()) budgets.tokens = Number(form.tokens);
    if (form.usd.trim()) budgets.usd = Number(form.usd);
    onCreate({
      name: form.name.trim(),
      persona: form.persona,
      model: form.model.trim(),
      ...(form.cwd.trim() ? { cwd: form.cwd.trim() } : {}),
      ...(Object.keys(budgets).length > 0 ? { budgets } : {}),
    });
  };

  const error = localError ?? serverError;
  const inputClass =
    'w-full rounded-md border border-line bg-white px-2 py-1 text-xs text-zinc-800 dark:bg-[#1E1E21] dark:text-zinc-100';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-line bg-white p-4 shadow-xl dark:bg-[#161618]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold">Create agent</div>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          A new registry entry under `~/.lokma/agents/` with its own SOUL.md + MEMORY.md.
        </p>
        <div className="mt-3 space-y-2.5">
          <div>
            <label htmlFor="agent-name" className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
              Name
            </label>
            <input
              id="agent-name"
              className={inputClass}
              placeholder="Reviewer"
              value={form.name}
              onChange={set('name')}
              maxLength={40}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="agent-persona"
                className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
              >
                Persona
              </label>
              <select id="agent-persona" className={inputClass} value={form.persona} onChange={set('persona')}>
                {PERSONA_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="agent-model" className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                Model
              </label>
              <input
                id="agent-model"
                className={inputClass}
                placeholder="anthropic/claude-4-sonnet"
                value={form.model}
                onChange={set('model')}
              />
            </div>
          </div>
          <div>
            <label htmlFor="agent-cwd" className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
              Working directory <span className="font-normal text-zinc-400">(optional, must exist)</span>
            </label>
            <input
              id="agent-cwd"
              className={inputClass}
              placeholder="/mnt/apopic/lokma"
              value={form.cwd}
              onChange={set('cwd')}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="agent-tokens"
                className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
              >
                Token budget <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                id="agent-tokens"
                className={inputClass}
                placeholder="500000"
                inputMode="numeric"
                value={form.tokens}
                onChange={set('tokens')}
              />
            </div>
            <div>
              <label htmlFor="agent-usd" className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                USD budget <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                id="agent-usd"
                className={inputClass}
                placeholder="10"
                inputMode="decimal"
                value={form.usd}
                onChange={set('usd')}
              />
            </div>
          </div>
          {error ? <div className="rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">{error}</div> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={submit} disabled={busy}>
              {busy ? 'Creating…' : 'Create agent'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
