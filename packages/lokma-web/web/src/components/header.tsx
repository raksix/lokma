import * as React from 'react';
import { ArrowLeftRight, Moon, PanelLeft, PanelRight, Search, Settings, Sun } from 'lucide-react';
import type { CostTotal, WsStatus } from '@/lib/ws';
import { api } from '@/lib/api';
import { applyTheme, applyThemeVars, getTheme, subscribeTheme, type ShellTheme } from '@/components/shell';
import { sidebarPanelTitle, type ExplorerSide } from '@/components/shell/responsive';
import type { AppMode } from '@/components/bots/mode';

/**
 * Header — harness top bar ported from the concept shell (same cream/
 * terracotta tokens, serif wordmark, lucide icons only).
 * REQ-012: no model picker here — model selection lives in the Composer
 * popup and the Models tab. Compact single-row bar: brand, WS/cost readout,
 * search, settings, theme and sidebar toggles.
 * REQ-175: the session-id readout and the Checking/Active/Down pill are
 * gone — the footer bar owns gateway state, the session list owns ids.
 */

/** Compact `12.3k · $0.04` label from accumulated WS cost frames. */
export function formatCostBadge(cost: CostTotal): string {
  const tokens = cost.inputTokens + cost.outputTokens;
  const compact = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : `${tokens}`;
  return `${compact} · $${cost.costUsd.toFixed(cost.costUsd < 0.01 && cost.costUsd > 0 ? 4 : 2)}`;
}

export function Header({
  cost,
  wsStatus,
  onSearch,
  onOpenSettings,
  onToggleLeft,
  onToggleRight,
  explorerSide = 'right',
  onSwapSides,
  hideSideToggles = false,
  mode,
  onModeChange,
}: {
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
  /**
   * REQ-161 — top-level surface: `lokma` = chat/workspace, `Bots` = the
   * separate Bots section. Undefined keeps the switch hidden (standalone
   * embeds that own no mode).
   */
  mode?: AppMode;
  onModeChange?: (mode: AppMode) => void;
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
        {/* REQ-161 — surface switch: `lokma` is the normal chat/workspace
            mode, `Bots` opens the separate Bots section. REQ-168 adds
            `Design` — the Design Studio's own full page. REQ-173 — every
            chip state (idle/hover/selected) takes its text+fill pair from
            `.mode-chip` (index.css), so the label can never inherit theme
            ink onto the wrong fill; the selected chip carries the ink fill
            in light and the light fill in dark. Clicking `lokma` always
            returns to the (untouched) normal mode. */}
        <div className="ml-1 flex items-center gap-1" role="tablist" aria-label="Surface">
          <button
            type="button"
            role="tab"
            data-mode-switch="chat"
            aria-selected={(mode ?? 'chat') === 'chat'}
            title="lokma — chat & workspace"
            onClick={() => onModeChange?.('chat')}
            className="mode-chip flex items-center gap-1.5 rounded-md px-1.5 py-0.5"
          >
            <span className="mode-chip-badge grid h-5 w-5 place-items-center rounded-md text-[10px] font-semibold">
              L
            </span>
            <span className="hidden font-serif text-[15px] sm:block">lokma</span>
          </button>
          {onModeChange ? (
            <button
              type="button"
              role="tab"
              data-mode-switch="bots"
              aria-selected={mode === 'bots'}
              title="Bots — separate bot section"
              onClick={() => onModeChange('bots')}
              className="mode-chip rounded-md px-1.5 py-0.5 text-[13px] font-medium"
            >
              Bots
            </button>
          ) : null}
          {onModeChange ? (
            <button
              type="button"
              role="tab"
              data-mode-switch="design"
              aria-selected={mode === 'design'}
              title="Design — standalone Design Studio page"
              onClick={() => onModeChange('design')}
              className="mode-chip rounded-md px-1.5 py-0.5 text-[13px] font-medium"
            >
              Design
            </button>
          ) : null}
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
