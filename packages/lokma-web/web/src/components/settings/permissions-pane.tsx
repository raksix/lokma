import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { emitToast } from '@/components/shell';
import {
  buildHooksPatch,
  buildPermissionsPatch,
  isValidRule,
  PERMISSION_MODES,
  type HookRow,
  type NormalizedConfig,
  type PermissionMode,
} from './settings';

/**
 * PermissionsPane — allow / deny / ask rules plus the default mode and
 * the hooks list. Reads and writes the SAME `permissions` object the
 * chat permission card uses (`Always allow` in chat lands in the allow
 * list here) via PATCH /api/config. The concept's hardcoded
 * Bash/WebFetch examples are NOT ported — every row is server data.
 */
export function PermissionsPane({ config, onReload }: { config: NormalizedConfig; onReload: () => Promise<void> }) {
  const [allow, setAllow] = React.useState<string[]>(config.permissions.allow);
  const [deny, setDeny] = React.useState<string[]>(config.permissions.deny);
  const [mode, setMode] = React.useState<PermissionMode>(config.permissions.defaultMode);
  const [newAllow, setNewAllow] = React.useState('');
  const [newDeny, setNewDeny] = React.useState('');
  const [hooks, setHooks] = React.useState<HookRow[]>(config.hooks);
  const [hookEvent, setHookEvent] = React.useState('PostToolUse');
  const [hookMatcher, setHookMatcher] = React.useState('');
  const [hookCmd, setHookCmd] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function persist(nextAllow: string[], nextDeny: string[], nextMode: PermissionMode, nextHooks: HookRow[]): Promise<void> {
    setSaving(true);
    try {
      await api.patchConfig({ ...buildPermissionsPatch(nextAllow, nextDeny, nextMode), hooks: buildHooksPatch(nextHooks) });
      await onReload();
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Save failed');
      throw e;
    } finally {
      setSaving(false);
    }
  }

  function addRule(list: 'allow' | 'deny', value: string, clear: () => void): void {
    const rule = value.trim();
    if (!isValidRule(rule)) {
      emitToast('Rule must be a non-empty pattern (max 200 chars)');
      return;
    }
    const base = list === 'allow' ? allow : deny;
    if (base.includes(rule)) {
      emitToast('Rule already exists');
      return;
    }
    const nextAllow = list === 'allow' ? [...allow, rule] : allow;
    const nextDeny = list === 'deny' ? [...deny, rule] : deny;
    if (list === 'allow') setAllow(nextAllow);
    else setDeny(nextDeny);
    clear();
    persist(nextAllow, nextDeny, mode, hooks)
      .then(() => emitToast(`Rule added to ${list}`))
      .catch(() => {
        if (list === 'allow') setAllow(allow);
        else setDeny(deny);
      });
  }

  function removeRule(list: 'allow' | 'deny', rule: string): void {
    const nextAllow = list === 'allow' ? allow.filter((r) => r !== rule) : allow;
    const nextDeny = list === 'deny' ? deny.filter((r) => r !== rule) : deny;
    if (list === 'allow') setAllow(nextAllow);
    else setDeny(nextDeny);
    persist(nextAllow, nextDeny, mode, hooks)
      .then(() => emitToast('Rule removed'))
      .catch(() => {
        if (list === 'allow') setAllow(allow);
        else setDeny(deny);
      });
  }

  function changeMode(next: PermissionMode): void {
    const prev = mode;
    setMode(next);
    persist(allow, deny, next, hooks)
      .then(() => emitToast(`Default mode: ${next}`))
      .catch(() => setMode(prev));
  }

  function addHook(): void {
    if (!hookEvent.trim() || !hookMatcher.trim() || !hookCmd.trim()) {
      emitToast('Hook needs an event, a matcher, and a command');
      return;
    }
    const next = [...hooks, { event: hookEvent.trim(), matcher: hookMatcher.trim(), command: hookCmd.trim() }];
    setHooks(next);
    setHookMatcher('');
    setHookCmd('');
    persist(allow, deny, mode, next)
      .then(() => emitToast('Hook added'))
      .catch(() => setHooks(hooks));
  }

  function removeHook(idx: number): void {
    const next = hooks.filter((_, i) => i !== idx);
    const prev = hooks;
    setHooks(next);
    persist(allow, deny, mode, next)
      .then(() => emitToast('Hook removed'))
      .catch(() => setHooks(prev));
  }

  return (
    <div className="space-y-2 p-2 text-xs">
      <div className="rounded-lg border border-line bg-white p-2.5 dark:bg-[#1E1E21]">
        <label htmlFor="settings-default-mode" className="font-semibold">
          Default mode
        </label>
        <select
          id="settings-default-mode"
          value={mode}
          disabled={saving}
          onChange={(e) => changeMode(e.target.value as PermissionMode)}
          className="mt-1.5 h-7 w-full rounded-md border border-line bg-white px-2 text-xs dark:bg-[#161618]"
        >
          {PERMISSION_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <RuleList
        title="Allow"
        kind="allow"
        rules={allow}
        draft={newAllow}
        onDraft={setNewAllow}
        onAdd={() => addRule('allow', newAllow, () => setNewAllow(''))}
        onRemove={(r) => removeRule('allow', r)}
        disabled={saving}
      />
      <RuleList
        title="Deny"
        kind="deny"
        rules={deny}
        draft={newDeny}
        onDraft={setNewDeny}
        onAdd={() => addRule('deny', newDeny, () => setNewDeny(''))}
        onRemove={(r) => removeRule('deny', r)}
        disabled={saving}
      />

      <div className="rounded-lg border border-line bg-white p-2.5 dark:bg-[#1E1E21]">
        <div className="font-semibold">Hooks — {hooks.length}</div>
        {hooks.length === 0 ? (
          <div className="mt-1 text-[11px] text-zinc-500">No hooks configured.</div>
        ) : (
          <div className="mt-1.5 divide-y divide-line/50 rounded-md border border-line/60">
            {hooks.map((h, i) => (
              <div key={`${h.event}-${h.matcher}-${i}`} className="flex items-center gap-2 px-2 py-1.5 font-mono text-[11px]">
                <span className="rounded border border-line bg-muted px-1.5 py-0.5">{h.event}</span>
                <span className="text-zinc-500">{h.matcher}</span>
                <span className="ml-auto hidden truncate sm:inline">{h.command}</span>
                <button
                  onClick={() => removeHook(i)}
                  disabled={saving}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-muted disabled:opacity-30"
                  aria-label={`Remove hook ${h.event} ${h.matcher}`}
                >
                  <Trash2 className="h-3 w-3 text-zinc-400" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-1.5 grid grid-cols-[110px_1fr] gap-1">
          <Input value={hookEvent} onChange={(e) => setHookEvent(e.target.value)} placeholder="PostToolUse" aria-label="Hook event" className="h-7 font-mono text-[11px]" />
          <Input value={hookMatcher} onChange={(e) => setHookMatcher(e.target.value)} placeholder="Edit|Write" aria-label="Hook matcher" className="h-7 font-mono text-[11px]" />
        </div>
        <div className="mt-1 flex gap-1">
          <Input value={hookCmd} onChange={(e) => setHookCmd(e.target.value)} placeholder="bun run lint --fix" aria-label="Hook command" className="h-7 font-mono text-[11px]" />
          <Button size="sm" className="h-7 shrink-0 gap-1 text-xs" disabled={saving} onClick={addHook}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-dashed border-line bg-muted/50 p-2 text-[11px] text-zinc-500">
        Same rule store the chat permission card writes — “Always allow” in chat appears in the allow list above.
      </div>
    </div>
  );
}

function RuleList({
  title,
  kind,
  rules,
  draft,
  onDraft,
  onAdd,
  onRemove,
  disabled,
}: {
  title: string;
  kind: 'allow' | 'deny';
  rules: string[];
  draft: string;
  onDraft: (v: string) => void;
  onAdd: () => void;
  onRemove: (rule: string) => void;
  disabled: boolean;
}) {
  const badge =
    kind === 'allow'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : 'bg-red-50 border-red-200 text-red-700';
  return (
    <div className="rounded-lg border border-line bg-white p-2.5 dark:bg-[#1E1E21]">
      <div className="flex items-center gap-1.5 font-semibold">
        {title}
        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${badge}`}>{rules.length}</span>
      </div>
      {rules.length === 0 ? (
        <div className="mt-1 text-[11px] text-zinc-500">No {title.toLowerCase()} rules.</div>
      ) : (
        <div className="mt-1.5 space-y-1">
          {rules.map((r) => (
            <div key={r} className="flex items-center gap-2 rounded border border-line/60 bg-muted/30 px-2 py-1">
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{r}</span>
              <button
                onClick={() => onRemove(r)}
                disabled={disabled}
                className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-muted disabled:opacity-30"
                aria-label={`Remove ${kind} rule ${r}`}
              >
                <Trash2 className="h-3 w-3 text-zinc-400" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex gap-1">
        <Input
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAdd();
          }}
          placeholder={kind === 'allow' ? 'Bash: npm *' : 'Bash: rm -rf *'}
          aria-label={`New ${kind} rule`}
          className="h-7 font-mono text-[11px]"
        />
        <Button size="sm" className="h-7 shrink-0 gap-1 text-xs" disabled={disabled} onClick={onAdd}>
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
    </div>
  );
}
