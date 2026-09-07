
import * as React from 'react';
import { Header } from '@/components/header';
import { Sidebar } from '@/components/sidebar';
import { InspectorPanel } from '@/components/providers';
import type { InspectorTab } from '@/components/providers';
import { SessionsSidebar } from '@/components/sessions';
import { FileBrowser, FOCUS_FILES_EVENT } from '@/components/files';
import { Chat } from '@/components/chat';
import { TilingWorkspace } from '@/components/panes';
import { LayoutGrid, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePaneStore } from '@/stores/pane';
import { HealthBadge } from '@/components/status/health-badge';
import { useWs } from '@/hooks/use-ws';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores';
import {
  FooterBar,
  ActivityBar,
  InspectorRail,
  OfflineBanner,
  PaneErrorBoundary,
  SearchModal,
  ShortcutsDialog,
  SHOW_SHORTCUTS_EVENT,
  ToastHost,
  activityInspectorTab,
  anyDrawerOpen,
  closeAllSidebars,
  emitToast,
  initialSidebarVisibility,
  inspectorRailSide,
  isEditableTarget,
  mobileQuery,
  nextSidebarVisibility,
  readExplorerSide,
  sidebarPanelTitle,
  swappedExplorerSide,
  useIsMobile,
  writeExplorerSide,
  type ActivityKey,
  type ExplorerSide,
  type SidebarSide,
  type SidebarVisibility,
} from '@/components/shell';
import { useFocusTrap } from '@/components/shell/use-focus-trap';

/**
 * AppShell — harness frame: Header + sidebars + chat + footer.
 * Owns the single WS socket (status/cost feed the Header and the offline
 * banner), the session list (sessionStore cache), and the global shortcuts
 * (SHORTCUTS registry: Ctrl/Cmd+K search, Ctrl+M model switch, `[`/`]`
 * sidebars, `?` help, Esc closes).
 *
 * Responsive (Phase 3 mobile): below the `md` breakpoint both sidebars
 * become exclusive slide-over drawers over a full-width chat — mobile
 * boots with both closed, opening one closes the other, and picking a
 * session dismisses the Explorer drawer.
 *
 * REQ-007: Explorer and Inspector swap physical sides via the header swap
 * button (`explorerSide`, persisted to localStorage) — toggle titles,
 * drawer labels and `[`/`]` shortcut copy all follow the swap.
 */
export function AppShell({ sessionId }: { sessionId: string }) {
  const [activeId, setActiveId] = React.useState(sessionId);
  const tiling = usePaneStore((s) => s.tiling);
  const isMobile = useIsMobile();
  const [sidebars, setSidebars] = React.useState<SidebarVisibility>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return initialSidebarVisibility(false);
    }
    return initialSidebarVisibility(window.matchMedia(mobileQuery()).matches);
  });
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [serverUp, setServerUp] = React.useState<boolean | null>(null);
  // REQ-007 — which physical side hosts the Explorer (persisted, survives reload).
  const [explorerSide, setExplorerSide] = React.useState<ExplorerSide>(() => readExplorerSide());
  // REQ-010 — the Inspector always lives opposite the Explorer; the thin
  // icon rail docks on its outer edge and follows the REQ-007 swap.
  const inspectorSide: SidebarSide = inspectorRailSide(explorerSide);
  // REQ-008 — activity rail selection + the Inspector tab it requested
  // (null = sessions, which live in the Explorer panel).
  const [activity, setActivity] = React.useState<ActivityKey>('sessions');
  const [inspectorTab, setInspectorTab] = React.useState<InspectorTab | null>(null);

  const swapSides = React.useCallback(() => {
    setExplorerSide((current) => {
      const next = swappedExplorerSide(current);
      writeExplorerSide(next);
      return next;
    });
  }, []);

  // REQ-008 — rail click reveals the panel that owns the key, then asks
  // the Inspector to switch tabs (prop-driven so a first click that mounts
  // the sidebar still lands on the right tab).
  const handleActivitySelect = React.useCallback(
    (key: ActivityKey) => {
      setActivity(key);
      const tab = activityInspectorTab(key);
      setInspectorTab(tab);
      if (tab === null) {
        setSidebars((current) =>
          isMobile
            ? { left: explorerSide === 'left', right: explorerSide === 'right' }
            : { ...current, [explorerSide]: true },
        );
        return;
      }
      setSidebars((current) =>
        isMobile
          ? { left: inspectorSide === 'left', right: inspectorSide === 'right' }
          : { ...current, [inspectorSide]: true },
      );
    },
    [explorerSide, inspectorSide, isMobile],
  );

  // REQ-010 — rail click asks the Inspector for the tab (prop-driven, same
  // as REQ-008) and reveals the wide Inspector panel next to the rail.
  const handleInspectorRailSelect = React.useCallback(
    (tab: InspectorTab) => {
      setInspectorTab(tab);
      setSidebars((current) =>
        isMobile
          ? { left: inspectorSide === 'left', right: inspectorSide === 'right' }
          : { ...current, [inspectorSide]: true },
      );
    },
    [inspectorSide, isMobile],
  );

  const ws = useWs(activeId);
  const refreshSessions = useSessionStore((s) => s.refreshSessions);
  const selectSession = useSessionStore((s) => s.selectSession);

  // Keep prop + override in sync when the parent session changes.
  React.useEffect(() => {
    setActiveId(sessionId);
  }, [sessionId]);

  // Shrinking a two-panel desktop layout below the mobile breakpoint would
  // stack BOTH drawers over the chat (area C screenshot review). Collapse to
  // a full-width chat instead, matching the fresh mobile boot state.
  React.useEffect(() => {
    if (isMobile) {
      setSidebars((current) =>
        current.left || current.right ? { left: false, right: false } : current,
      );
    }
  }, [isMobile]);

  // Session list + server liveness (30s poll feeds FooterBar + Header pill).
  React.useEffect(() => {
    void refreshSessions();
    selectSession(activeId);
    let cancelled = false;
    const checkHealth = (): void => {
      api
        .health()
        .then(() => {
          if (!cancelled) setServerUp(true);
        })
        .catch(() => {
          if (!cancelled) setServerUp(false);
        });
    };
    checkHealth();
    const timer = setInterval(checkHealth, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeId, refreshSessions, selectSession]);

  const toggleSidebar = React.useCallback(
    (side: SidebarSide) => {
      setSidebars((current) => nextSidebarVisibility(current, side, isMobile));
    },
    [isMobile],
  );

  const closeDrawers = React.useCallback(() => {
    setSidebars((current) => closeAllSidebars(current));
  }, []);

  const switchSession = React.useCallback(
    (id: string) => {
      if (!id || id === activeId) return;
      setActiveId(id);
      selectSession(id);
      // On mobile the Explorer is a drawer — dismiss it so the chat is visible.
      if (isMobile) setSidebars((current) => ({ ...current, [explorerSide]: false }));
      void refreshSessions();
    },
    [activeId, explorerSide, isMobile, refreshSessions, selectSession],
  );

  // Global shortcuts — every combo is listed in the SHORTCUTS registry so
  // the help dialog (`?`) can never drift from what the keys actually do.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearchOpen((v) => !v);
        return;
      }
      if (mod && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        document.getElementById('lokma-model-select')?.focus();
        return;
      }
      if (mod && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setSidebars((current) => nextSidebarVisibility(current, explorerSide, isMobile));
        window.dispatchEvent(new Event(FOCUS_FILES_EVENT));
        return;
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setShortcutsOpen(false);
        // Dismiss open drawers first so one keypress always reveals the chat.
        setSidebars((current) => closeAllSidebars(current));
        return;
      }
      if (isEditableTarget(e.target)) {
        return;
      }
      if (e.key === '[') toggleSidebar('left');
      if (e.key === ']') toggleSidebar('right');
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [explorerSide, isMobile, toggleSidebar]);

  // Footer hint + panes open the dialog through this event (no prop drilling).
  React.useEffect(() => {
    const open = () => setShortcutsOpen(true);
    window.addEventListener(SHOW_SHORTCUTS_EVENT, open);
    return () => window.removeEventListener(SHOW_SHORTCUTS_EVENT, open);
  }, []);

  const explorerContent = (
    <div className="space-y-4">
      <SessionsSidebar activeId={activeId} onSelect={switchSession} />
      <FileBrowser key={activeId} sessionId={activeId} />
      <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">Server</div>
        <div className="mt-1 flex items-center gap-2">
          <HealthBadge />
          <span>Fastify :3456</span>
        </div>
      </div>
    </div>
  );

  const inspectorContent = (
    <InspectorPanel onOpenSession={switchSession} sessionId={activeId} ws={ws} requestedTab={inspectorTab} />
  );

  // REQ-007 — panel content follows the swap; titles/labels never hardcode sides.
  const leftPanel = sidebarPanelTitle('left', explorerSide);
  const rightPanel = sidebarPanelTitle('right', explorerSide);
  const leftContent = explorerSide === 'left' ? explorerContent : inspectorContent;
  const rightContent = explorerSide === 'left' ? inspectorContent : explorerContent;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <a
        href="#lokma-chat"
        className="sr-only focus:not-sr-only focus:absolute focus:top-1 focus:left-1 focus:z-[70] focus:rounded-md focus:bg-[#262624] focus:px-3 focus:py-1.5 focus:text-xs focus:text-white"
      >
        Skip to chat
      </a>
      <Header
        sessionId={activeId}
        serverUp={serverUp}
        cost={ws.cost}
        wsStatus={ws.status}
        onSearch={() => setSearchOpen(true)}
        onToggleLeft={() => toggleSidebar('left')}
        onToggleRight={() => toggleSidebar('right')}
        explorerSide={explorerSide}
        onSwapSides={swapSides}
      />
      <OfflineBanner status={ws.status} onRetry={ws.reconnect} />
      <div className="flex flex-1 overflow-hidden">
        {/* REQ-010 — thin Inspector icon rail on the Inspector's outer edge. */}
        {inspectorSide === 'left' ? (
          <InspectorRail active={inspectorTab ?? 'info'} onSelect={handleInspectorRailSelect} side="left" />
        ) : null}
        {sidebars.left ? (
          isMobile ? (
            <MobileDrawer side="left" label={`${leftPanel} panel`} onClose={closeDrawers}>
              <PaneErrorBoundary paneName={leftPanel}>
                <Sidebar side="left" title={leftPanel} className="h-full w-full">
                  {leftContent}
                </Sidebar>
              </PaneErrorBoundary>
            </MobileDrawer>
          ) : (
            <PaneErrorBoundary paneName={leftPanel}>
              <Sidebar side="left" title={leftPanel}>
                {leftContent}
              </Sidebar>
            </PaneErrorBoundary>
          )
        ) : null}

        <main id="lokma-chat" tabIndex={-1} className="flex min-w-0 flex-1 flex-col overflow-hidden p-2 outline-none sm:p-3">
          <TilingToggle />
          <PaneErrorBoundary paneName="Chat">
            {tiling ? (
              <TilingWorkspace sessionId={activeId} ws={ws} onOpenSession={switchSession} />
            ) : (
              <Chat key={activeId} sessionId={activeId} ws={ws} onOpenSession={switchSession} />
            )}
          </PaneErrorBoundary>
          <div className="mt-2 hidden text-center text-[11px] text-muted-foreground sm:block">
            Sessions persist to <code className="rounded bg-muted px-1">~/.lokma/projects/&lt;hash&gt;/sessions/*.jsonl</code> (CLI + Web share)
          </div>
        </main>

        {sidebars.right ? (
          isMobile ? (
            <MobileDrawer side="right" label={`${rightPanel} panel`} onClose={closeDrawers}>
              <PaneErrorBoundary paneName={rightPanel}>
                <Sidebar side="right" title={rightPanel} className="h-full w-full">
                  {rightContent}
                </Sidebar>
              </PaneErrorBoundary>
            </MobileDrawer>
          ) : (
            <PaneErrorBoundary paneName={rightPanel}>
              <Sidebar side="right" title={rightPanel}>
                {rightContent}
              </Sidebar>
            </PaneErrorBoundary>
          )
        ) : null}
        {/* REQ-010 — rail docks between the Inspector panel and the REQ-008
            activity bar (kept separate: activity keys own Explorer sessions,
            the rail owns the 23 Inspector tabs). */}
        {inspectorSide === 'right' ? (
          <InspectorRail active={inspectorTab ?? 'info'} onSelect={handleInspectorRailSelect} side="right" />
        ) : null}
        {/* REQ-008 — VS Code-style activity rail, pinned at the far right. */}
        <ActivityBar active={activity} onSelect={handleActivitySelect} />
      </div>
      <FooterBar serverUp={serverUp} />
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectSession={(id) => {
          switchSession(id);
          emitToast(`Switched to ${id.slice(0, 24)}`);
        }}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} explorerSide={explorerSide} />
      <ToastHost />
    </div>
  );
}

// MobileDrawer — slide-over shell for narrow viewports: a backdrop plus a
// fluid-width panel (`85vw`, capped at 320px) docked to one edge. Only
// rendered below the `md` breakpoint (`md:hidden`); desktop keeps the
// static side-by-side sidebars. Locks body scroll while open; the global
// Escape handler and the backdrop both dismiss it.
function MobileDrawer({
  side,
  label,
  onClose,
  children,
}: {
  side: SidebarSide;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  // Mounted only while the drawer is open — trap for the whole lifetime so
  // Tab cannot reach the chat behind the overlay (shared `useFocusTrap`).
  const panelRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(true, panelRef, { onEscape: onClose });

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={label}>
      <button
        type="button"
        aria-label={`Close ${label}`}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />
      <div
        ref={panelRef}
        className={`absolute inset-y-0 h-full w-[85vw] max-w-[320px] bg-card shadow-2xl ${
          side === 'left' ? 'left-0' : 'right-0'
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          title={`Close ${label}`}
          aria-label={`Close ${label}`}
          autoFocus
          className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-[#F2F0EB]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="h-full overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

// TilingToggle — enters the W7 tiling workspace (split/windowed panes over
// live sessions and Inspector tools). Hidden once tiling (the TilingBar's
// Single button exits); layout and tabs restore from the persisted stores.
function TilingToggle() {
  const tiling = usePaneStore((s) => s.tiling);
  const setTiling = usePaneStore((s) => s.setTiling);
  if (tiling) return null;
  return (
    <div className="mb-2 flex shrink-0 justify-end">
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        title="Open the tiling workspace (split panes, floating windows, drag sessions and files)"
        onClick={() => setTiling(true)}
      >
        <LayoutGrid className="h-3 w-3" />
        Tiling workspace
      </Button>
    </div>
  );
}
