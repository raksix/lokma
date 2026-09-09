import * as React from 'react';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { emitToast } from '@/components/shell';
import type { NormalizedConfig } from './settings';
import { buildAgentsPatch, buildRetryPatch, buildSessionsPatch, isValidAgentDefaultModel, isValidSessionDefaultCwd, parseRetryDelays, validateAgentsBudgets, validateAgentsCaps, validateRetryForm } from './settings';

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
  const [caps, setCaps] = React.useState({
    maxAgents: config.maxAgents === null ? '' : String(config.maxAgents),
    maxConcurrent: config.maxConcurrent === null ? '' : String(config.maxConcurrent),
    maxQueue: config.maxQueue === null ? '' : String(config.maxQueue),
  });
  const [capsErrors, setCapsErrors] = React.useState<Record<string, string>>({});
  const [savingCaps, setSavingCaps] = React.useState(false);
  const [agentModel, setAgentModel] = React.useState(config.agentDefaultModel);
  const [agentModelError, setAgentModelError] = React.useState('');
  const [budgets, setBudgets] = React.useState({
    tokens: config.agentBudgets.tokens === null ? '' : String(config.agentBudgets.tokens),
    usd: config.agentBudgets.usd === null ? '' : String(config.agentBudgets.usd),
  });
  const [budgetsErrors, setBudgetsErrors] = React.useState<Record<string, string>>({});
  const [sessionCwd, setSessionCwd] = React.useState(config.sessionDefaultCwd);
  const [sessionCwdError, setSessionCwdError] = React.useState('');
  const [savingSessionCwd, setSavingSessionCwd] = React.useState(false);
  const [retryAttempts, setRetryAttempts] = React.useState(config.retryMaxAttempts === null ? '' : String(config.retryMaxAttempts));
  const [retryDelays, setRetryDelays] = React.useState(config.retryDelaysSec.join(', '));
  const [retryErrors, setRetryErrors] = React.useState<Record<string, string>>({});
  const [savingRetry, setSavingRetry] = React.useState(false);

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

  async function handleSaveCaps(): Promise<void> {
    const errors = validateAgentsCaps(caps);
    setCapsErrors(errors);
    const modelError = isValidAgentDefaultModel(agentModel) ? '' : 'Non-empty model id (e.g. provider::model-id).';
    setAgentModelError(modelError);
    const budgetErrors = validateAgentsBudgets(budgets);
    setBudgetsErrors(budgetErrors);
    if (Object.keys(errors).length > 0 || modelError || Object.keys(budgetErrors).length > 0) return;
    setSavingCaps(true);
    try {
      // Full agents object — saveGlobal shallow-merges, so every key rides
      // along and no sibling is reset to the schema default.
      await api.patchConfig(
        buildAgentsPatch(Number(caps.maxAgents), Number(caps.maxConcurrent), Number(caps.maxQueue), agentModel.trim(), Number(budgets.tokens), Number(budgets.usd)),
      );
      emitToast('Agent caps saved');
      await onReload();
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingCaps(false);
    }
  }

  async function handleSaveSessionCwd(): Promise<void> {
    const err = isValidSessionDefaultCwd(sessionCwd) ? '' : 'Absolute path (/…, ~…, X:\\…) or empty for the server default.';
    setSessionCwdError(err);
    if (err) return;
    setSavingSessionCwd(true);
    try {
      // Own top-level key — never wipes agents/permissions/mcp siblings.
      await api.patchConfig(buildSessionsPatch(sessionCwd.trim()));
      emitToast('Session default saved');
      await onReload();
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingSessionCwd(false);
    }
  }

  async function handleSaveRetry(): Promise<void> {
    const errors = validateRetryForm({ maxAttempts: retryAttempts, delaysSec: retryDelays });
    setRetryErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSavingRetry(true);
    try {
      // Own top-level key — never wipes agents/permissions/mcp siblings.
      await api.patchConfig(buildRetryPatch(Number(retryAttempts), parseRetryDelays(retryDelays)));
      emitToast('Retry settings saved');
      await onReload();
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingRetry(false);
    }
  }

  const capsFields: Array<{ key: 'maxAgents' | 'maxConcurrent' | 'maxQueue'; label: string; hint: string }> = [
    { key: 'maxAgents', label: 'Max agents', hint: 'Registry slots (1–100)' },
    { key: 'maxConcurrent', label: 'Max concurrent', hint: 'Running at once (1–20)' },
    { key: 'maxQueue', label: 'Max queue', hint: 'Waiting slots (1+)' },
  ];

  const budgetFields: Array<{ key: 'tokens' | 'usd'; label: string; hint: string }> = [
    { key: 'tokens', label: 'Budget tokens', hint: 'Whole tokens, 1+' },
    { key: 'usd', label: 'Budget USD', hint: 'USD cap, 0+' },
  ];

  return (
    <div className="space-y-2 p-2 text-xs">
      <div className="rounded-lg border border-line bg-white p-2.5 dark:bg-[#1E1E21]">
        <div className="font-semibold">Effective config (merged: global &lt; project &lt; env)</div>
        <div className="mt-2 grid grid-cols-1 gap-1.5 font-mono text-[11px]">
          <div className="flex gap-2 rounded border border-line/50 bg-muted/50 p-1.5">
            <span className="shrink-0 font-semibold">defaultModel</span>
            <span className="truncate text-zinc-500" title={config.defaultModel ?? undefined}>{config.defaultModel || '—'}</span>
          </div>
          <div className="flex gap-2 rounded border border-line/50 bg-muted/50 p-1.5">
            <span className="shrink-0 font-semibold">defaultProvider</span>
            <span className="truncate text-zinc-500" title={config.defaultProvider ?? undefined}>{config.defaultProvider || '—'}</span>
          </div>
          <div className="flex gap-2 rounded border border-line/50 bg-muted/50 p-1.5">
            <span className="shrink-0 font-semibold">theme</span>
            <span className="truncate text-zinc-500" title={config.theme ?? undefined}>{config.theme ?? '—'}</span>
          </div>
          <div className="flex gap-2 rounded border border-line/50 bg-muted/50 p-1.5">
            <span className="shrink-0 font-semibold">agents</span>
            <span className="truncate text-zinc-500" title={`max ${config.maxAgents ?? '—'} · concurrent ${config.maxConcurrent ?? '—'} · queue ${config.maxQueue ?? '—'} · model ${config.agentDefaultModel || '—'} · budget ${config.agentBudgets.tokens ?? '—'} tokens / $${config.agentBudgets.usd ?? '—'}`}>
              max {config.maxAgents ?? '—'} · concurrent {config.maxConcurrent ?? '—'} · queue {config.maxQueue ?? '—'} · model {config.agentDefaultModel || '—'} · budget {config.agentBudgets.tokens ?? '—'} tokens / ${config.agentBudgets.usd ?? '—'}
            </span>
          </div>
          <div className="flex gap-2 rounded border border-line/50 bg-muted/50 p-1.5">
            <span className="shrink-0 font-semibold">coordinator</span>
            <span className="truncate text-zinc-500" title={config.coordinatorMode ?? undefined}>{config.coordinatorMode || '—'}</span>
          </div>
          <div className="flex gap-2 rounded border border-line/50 bg-muted/50 p-1.5">
            <span className="shrink-0 font-semibold">sessions</span>
            <span className="truncate text-zinc-500" title={config.sessionDefaultCwd || undefined}>
              defaultCwd {config.sessionDefaultCwd || '(server default)'}
            </span>
          </div>
          <div className="flex gap-2 rounded border border-line/50 bg-muted/50 p-1.5">
            <span className="shrink-0 font-semibold">retry</span>
            <span className="truncate text-zinc-500" title={`${config.retryMaxAttempts ?? '—'} attempts · ${config.retryDelaysSec.join(', ') || 'no wait'}s`}>
              {config.retryMaxAttempts ?? '—'} attempts · {config.retryDelaysSec.join(', ') || 'no wait'}s
            </span>
          </div>
          <div className="flex gap-2 rounded border border-line/50 bg-muted/50 p-1.5">
            <span className="shrink-0 font-semibold">vault</span>
            <span className="truncate text-zinc-500" title={config.vaultHost ?? undefined}>{config.vaultHost ?? 'not configured'}</span>
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
            className="h-7 font-mono text-xs min-w-0"
          />
          <Button size="sm" className="h-7 shrink-0 text-xs" disabled={saving} onClick={handleSaveModel}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">Persists to global config via PATCH /api/config.</div>
      </div>

      <div className="rounded-lg border border-line bg-white p-2.5 dark:bg-[#1E1E21]">
        <div className="font-semibold">Agent caps</div>
        <div>
          <label htmlFor="settings-agent-model" className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
            Agent default model
          </label>
          <Input
            id="settings-agent-model"
            value={agentModel}
            onChange={(e) => setAgentModel(e.target.value)}
            placeholder="provider::model-id"
            className="mt-0.5 h-7 font-mono text-xs min-w-0"
          />
          {agentModelError ? (
            <div className="mt-0.5 text-[10px] text-red-600">{agentModelError}</div>
          ) : (
            <div className="mt-0.5 text-[10px] text-zinc-500">Model spawned agents use unless overridden.</div>
          )}
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {capsFields.map((f) => (
            <div key={f.key} className="min-w-0">
              <label htmlFor={`settings-caps-${f.key}`} className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                {f.label}
              </label>
              <Input
                id={`settings-caps-${f.key}`}
                inputMode="numeric"
                value={caps[f.key]}
                onChange={(e) => setCaps((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.hint}
                className="mt-0.5 h-7 font-mono text-xs min-w-0"
              />
              {capsErrors[f.key] ? (
                <div className="mt-0.5 text-[10px] text-red-600">{capsErrors[f.key]}</div>
              ) : (
                <div className="mt-0.5 text-[10px] text-zinc-500">{f.hint}</div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {budgetFields.map((f) => (
            <div key={f.key} className="min-w-0">
              <label htmlFor={`settings-budgets-${f.key}`} className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                {f.label}
              </label>
              <Input
                id={`settings-budgets-${f.key}`}
                inputMode="decimal"
                value={budgets[f.key]}
                onChange={(e) => setBudgets((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.hint}
                className="mt-0.5 h-7 font-mono text-xs min-w-0"
              />
              {budgetsErrors[f.key] ? (
                <div className="mt-0.5 text-[10px] text-red-600">{budgetsErrors[f.key]}</div>
              ) : (
                <div className="mt-0.5 text-[10px] text-zinc-500">{f.hint}</div>
              )}
            </div>
          ))}
        </div>
        <Button size="sm" className="mt-1.5 h-7 text-xs" disabled={savingCaps} onClick={handleSaveCaps}>
          {savingCaps ? 'Saving…' : 'Save caps'}
        </Button>
        <div className="mt-1 text-[11px] text-zinc-500">Persists the full agents object via PATCH /api/config.</div>
      </div>

      <div className="rounded-lg border border-line bg-white p-2.5 dark:bg-[#1E1E21]">
        <label htmlFor="settings-session-cwd" className="font-semibold">
          Session defaults
        </label>
        <div className="mt-1.5 flex gap-1">
          <Input
            id="settings-session-cwd"
            value={sessionCwd}
            onChange={(e) => setSessionCwd(e.target.value)}
            placeholder="/mnt/apopic/my-project (empty = server default)"
            className="h-7 font-mono text-xs min-w-0"
          />
          <Button size="sm" className="h-7 shrink-0 text-xs" disabled={savingSessionCwd} onClick={handleSaveSessionCwd}>
            {savingSessionCwd ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {sessionCwdError ? (
          <div className="mt-0.5 text-[10px] text-red-600">{sessionCwdError}</div>
        ) : (
          <div className="mt-1 text-[11px] text-zinc-500">New sessions land here unless a cwd is given. Persists via PATCH /api/config.</div>
        )}
      </div>

      <div className="rounded-lg border border-line bg-white p-2.5 dark:bg-[#1E1E21]">
        <div className="font-semibold">Auto-retry on error</div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <div className="min-w-0">
            <label htmlFor="settings-retry-attempts" className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
              Max retries
            </label>
            <Input
              id="settings-retry-attempts"
              inputMode="numeric"
              value={retryAttempts}
              onChange={(e) => setRetryAttempts(e.target.value)}
              placeholder="10 (0 = no retry)"
              className="mt-0.5 h-7 font-mono text-xs min-w-0"
            />
            {retryErrors.maxAttempts ? (
              <div className="mt-0.5 text-[10px] text-red-600">{retryErrors.maxAttempts}</div>
            ) : (
              <div className="mt-0.5 text-[10px] text-zinc-500">Retries after the first try (0–50).</div>
            )}
          </div>
          <div className="min-w-0">
            <label htmlFor="settings-retry-delays" className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
              Backoff (seconds)
            </label>
            <Input
              id="settings-retry-delays"
              value={retryDelays}
              onChange={(e) => setRetryDelays(e.target.value)}
              placeholder="3, 10, 15, 20, 30, 40, 50"
              className="mt-0.5 h-7 font-mono text-xs min-w-0"
            />
            {retryErrors.delaysSec ? (
              <div className="mt-0.5 text-[10px] text-red-600">{retryErrors.delaysSec}</div>
            ) : (
              <div className="mt-0.5 text-[10px] text-zinc-500">Wait before each retry; last value repeats.</div>
            )}
          </div>
        </div>
        <Button size="sm" className="mt-1.5 h-7 text-xs" disabled={savingRetry} onClick={handleSaveRetry}>
          {savingRetry ? 'Saving…' : 'Save retry'}
        </Button>
        <div className="mt-1 text-[11px] text-zinc-500">Dead upstreams retry automatically; stopping a run never retries. Persists via PATCH /api/config.</div>
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
