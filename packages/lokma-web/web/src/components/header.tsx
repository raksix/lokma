import * as React from 'react';
import { ArrowLeftRight, Moon, PanelLeft, PanelRight, Search, Settings, Sun } from 'lucide-react';
import type { CostTotal, WsStatus } from '@/lib/ws';
import { api } from '@/lib/api';
import { applyTheme, applyThemeVars, getTheme, subscribeTheme, type ShellTheme } from '@/components/shell';
import { sidebarPanelTitle, type ExplorerSide } from '@/components/shell/responsive';

/**
 * Header — harness top bar ported from the concept shell (same cream/
 * terracotta tokens, serif wordmark, lucide icons only).
 * REQ-012: no model picker here — model selection lives in the Composer
 * popup and the Models tab. Compact single-row bar: brand, session pill,
 * WS/cost readout, search, settings, theme and sidebar toggles.
 */

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
  onOpenSettings,
  onToggleLeft,
  onToggleRight,
  explorerSide = 'right',
  onSwapSides,
  hideSideToggles = false,
}: {
  sessionId: string;
  serverUp: boolean | null;
  cost: CostTotal;
  wsStatus: WsStatus;
  onSearch: () => void;
  onOpenSettings: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  explorerSide?: ExplorerSide;
  onSwapSides?: () => void;
  /**
   * REQ-024 — mobile single-view hides the drawer chrome (swap + panel
   * toggles): there are no sidebars to toggle, only bottom-tab surfaces.
   * Search / settings / theme stay — they open modals, not sidebars.
   */
  hideSideToggles?: boolean;
}) {
  const [theme, setTheme] = React.useState<ShellTheme>('light');

  // Sync persisted theme once. The stored mode applies instantly; then
  // the persisted NAMED theme's full var set loads best-effort (Phase 3
  // themes polish) so a reload keeps the exact palette, not just the
  // light/dark family. The header toggle also subscribes to
  // effective-mode changes, so the async named theme load (or an
  // Appearance-pane pick) can never leave its icon and aria-label stale.
  React.useEffect(() => {
    const stored = getTheme();
    applyTheme(stored);
    setTheme(stored);
    const unsubscribe = subscribeTheme((mode) => setTheme(mode));
    void api
      .getConfig()
      .then((res) => {
        const id = (res as { config?: { theme?: unknown } }).config?.theme;
        if (typeof id !== 'string' || id.length === 0) return undefined;
        return api.getTheme(id);
      })
      .then((res) => {
        if (res) applyThemeVars(res.theme.cssVars, res.theme.mode === 'dark' ? 'dark' : 'light');
      })
      .catch(() => undefined);
    return () => {
      unsubscribe();
    };
  }, []);

  const flipTheme = (): void => {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  const live = wsStatus === 'open';
  // REQ-007 — toggle copy follows the sidebar swap, never hardcoded sides.
  const leftPanel = sidebarPanelTitle('left', explorerSide);
  const rightPanel = sidebarPanelTitle('right', explorerSide);

  return (
    <header className="z-40 h-9 shrink-0 border-b border-[#E8E4DE] bg-[#FAF9F5]/90 backdrop-blur-xl">
      <div className="flex h-full w-full items-center gap-1 px-2">
        {onSwapSides && !hideSideToggles ? (
          <button
            onClick={onSwapSides}
            title={`Swap sidebars (Explorer ${explorerSide === 'left' ? 'left' : 'right'})`}
            aria-label="Swap left and right sidebars"
            className="grid h-6 w-6 place-items-center rounded-md text-zinc-500 hover:bg-[#F2F0EB]"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {hideSideToggles ? null : (
          <button
            onClick={onToggleLeft}
            title={`Toggle ${leftPanel} ([)`}
            aria-label={`Toggle ${leftPanel}`}
            className="grid h-6 w-6 place-items-center rounded-md text-zinc-500 hover:bg-[#F2F0EB]"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="ml-1 flex items-center gap-1.5">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-[#262624] text-[10px] font-semibold text-white">
            L
          </span>
          <span className="hidden font-serif text-[15px] sm:block">lokma</span>
        </div>
        <div className="ml-2 hidden items-center gap-1 text-xs text-zinc-500 md:flex">
          <span className="mx-1 h-4 w-px bg-[#E8E4DE]" />
          <span className="font-mono" title={sessionId}>
            {sessionId.slice(0, 12)}
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
          <button
            onClick={flipTheme}
            title="Toggle theme"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="grid h-6 w-6 place-items-center rounded-md border border-[#E8E4DE] bg-white text-zinc-600 hover:bg-[#F2F0EB]"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onSearch}
            title="Search (Ctrl+K)"
            aria-label="Search (Control K)"
            className="grid h-6 w-6 place-items-center rounded-md border border-[#E8E4DE] bg-white text-zinc-600 hover:bg-[#F2F0EB]"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onOpenSettings}
            title="Settings"
            aria-label="Open settings"
            className="grid h-6 w-6 place-items-center rounded-md border border-[#E8E4DE] bg-white text-zinc-600 hover:bg-[#F2F0EB]"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          {hideSideToggles ? null : (
            <button
              onClick={onToggleRight}
              title={`Toggle ${rightPanel} (])`}
              aria-label={`Toggle ${rightPanel}`}
              className="grid h-6 w-6 place-items-center rounded-md text-zinc-500 hover:bg-[#F2F0EB]"
            >
              <PanelRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
