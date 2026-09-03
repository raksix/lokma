import * as React from 'react';
import { Moon, PanelLeft, PanelRight, Search, Sun } from 'lucide-react';
import type { CostTotal, WsStatus } from '@/lib/ws';
import { useProviderStore } from '@/stores';
import { applyTheme, emitToast, getTheme, type ShellTheme } from '@/components/shell';

/**
 * Header — harness top bar ported from the concept shell (same cream/
 * terracotta tokens, serif wordmark, lucide icons only).
 * Real wiring: model dropdown reads the shared providerStore cache
 * (`GET /api/models`), the cost badge renders live WS `cost` frames, the
 * theme toggle persists `lokma-theme`, search opens the real SearchModal.
 */

const MODEL_KEY = 'lokma-model';

function readModel(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(MODEL_KEY);
  } catch {
    return null;
  }
}

/** Compact `12.3k · $0.04` label from accumulated WS cost frames. */
export function formatCostBadge(cost: CostTotal): string {
  const tokens = cost.inputTokens + cost.outputTokens;
  const compact = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : `${tokens}`;
  return `${compact} · $${cost.costUsd.toFixed(cost.costUsd < 0.01 && cost.costUsd > 0 ? 4 : 2)}`;
}

export function Header({
  sessionId,
  serverUp,
  cost,
  wsStatus,
  onSearch,
  onToggleLeft,
  onToggleRight,
}: {
  sessionId: string;
  serverUp: boolean | null;
  cost: CostTotal;
  wsStatus: WsStatus;
  onSearch: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
}) {
  const [theme, setTheme] = React.useState<ShellTheme>('light');
  const [model, setModel] = React.useState<string | null>(null);
  const models = useProviderStore((s) => s.models);
  const refreshProviders = useProviderStore((s) => s.refresh);

  // Sync persisted theme/model once; refresh the shared model cache.
  React.useEffect(() => {
    const stored = getTheme();
    applyTheme(stored);
    setTheme(stored);
    setModel(readModel());
    void refreshProviders();
  }, [refreshProviders]);

  const flipTheme = (): void => {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  const pickModel = (id: string): void => {
    setModel(id);
    try {
      localStorage.setItem(MODEL_KEY, id);
    } catch {
      // Selection still applies for this tab without persistence.
    }
    // Server-side per-session model (PATCH /api/sessions/:id) lands in W1;
    // until then the choice applies to the next prompt sent from this tab.
    emitToast(`Model ${id} selected`);
  };

  const effectiveModel = model ?? models[0]?.id ?? '';
  const live = wsStatus === 'open';

  return (
    <header className="z-40 h-11 shrink-0 border-b border-[#E8E4DE] bg-[#FAF9F5]/90 backdrop-blur-xl">
      <div className="flex h-full w-full items-center gap-1.5 px-2 sm:px-3">
        <button
          onClick={onToggleLeft}
          title="Toggle left panel ([)"
          className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-[#F2F0EB]"
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </button>
        <div className="ml-1 flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-[#262624] text-xs font-semibold text-white">
            L
          </span>
          <span className="hidden font-serif text-[17px] sm:block">lokma</span>
          <span className="hidden rounded border border-[#E8E4DE] bg-white px-1 py-0.5 text-[9px] uppercase tracking-widest text-zinc-500 md:inline-flex">
            harness
          </span>
        </div>
        <div className="ml-2 hidden items-center gap-1 text-xs text-zinc-500 md:flex">
          <span className="mx-1 h-4 w-px bg-[#E8E4DE]" />
          <span className="font-mono" title={sessionId}>
            {sessionId.slice(0, 18)}
          </span>
          <span
            className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
              serverUp === null
                ? 'border-[#E8E4DE] text-zinc-500'
                : serverUp
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {serverUp === null ? 'Checking' : serverUp ? 'Active' : 'Down'}
          </span>
        </div>
        <div className="flex flex-1 justify-center">
          <span className="hidden items-center gap-1.5 text-xs text-zinc-500 lg:flex" title={`WS ${wsStatus}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {live ? formatCostBadge(cost) : wsStatus}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <select
            id="lokma-model-select"
            value={effectiveModel}
            onChange={(e) => pickModel(e.target.value)}
            title="Model (Ctrl+M)"
            className="hidden h-7 max-w-[180px] rounded-md border border-[#E8E4DE] bg-white px-1.5 text-xs text-zinc-700 outline-none focus:ring-1 focus:ring-[#C96442] md:block"
          >
            {models.length === 0 ? (
              <option value="">No models</option>
            ) : (
              models.map((m) => (
                <option key={`${m.provider}::${m.id}`} value={m.id}>
                  {m.label || m.id}
                </option>
              ))
            )}
          </select>
          <button
            onClick={flipTheme}
            title="Toggle theme"
            className="grid h-7 w-7 place-items-center rounded-md border border-[#E8E4DE] bg-white text-zinc-600 hover:bg-[#F2F0EB]"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onSearch}
            title="Search (Ctrl+K)"
            className="grid h-7 w-7 place-items-center rounded-md border border-[#E8E4DE] bg-white text-zinc-600 hover:bg-[#F2F0EB]"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onToggleRight}
            title="Toggle right panel (])"
            className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-[#F2F0EB]"
          >
            <PanelRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
