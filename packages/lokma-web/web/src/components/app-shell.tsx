
import * as React from 'react';
import { Header } from '@/components/header';
import { Sidebar } from '@/components/sidebar';
import { InspectorPanel } from '@/components/providers';
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
  OfflineBanner,
  PaneErrorBoundary,
  SearchModal,
  ToastHost,
  anyDrawerOpen,
  closeAllSidebars,
  emitToast,
  initialSidebarVisibility,
  mobileQuery,
  nextSidebarVisibility,
  useIsMobile,
  type SidebarSide,
  type SidebarVisibility,
} from '@/components/shell';

/**
 * AppShell — harness frame: Header + sidebars + chat + footer.
 * Owns the single WS socket (status/cost feed the Header and the offline
 * banner), the session list (sessionStore cache), and the global shortcuts:
 * Ctrl/Cmd+K search, Ctrl+M model switch, `[`/`]` sidebars, Esc closes.
 *
 * Responsive (Phase 3 mobile): below the `md` breakpoint both sidebars
 * become exclusive slide-over drawers over a full-width chat — mobile
 * boots with both closed, opening one closes the other, and picking a
 * session dismisses the Explorer drawer.
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
  const [serverUp, setServerUp] = React.useState<boolean | null>(null);

  const ws = useWs(activeId);
  const refreshSessions = useSessionStore((s) => s.refreshSessions);
  const selectSession = useSessionStore((s) => s.selectSession);

  // Keep prop + override in sync when the parent session changes.
  React.useEffect(() => {
    setActiveId(sessionId);
  }, [sessionId]);

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
      if (isMobile) setSidebars((current) => ({ ...current, left: false }));
      void refreshSessions();
    },
    [activeId, isMobile, refreshSessions, selectSession],
  );

  // Global shortcuts — search, model switch, sidebar toggles, dismiss.
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
        setSidebars((current) => nextSidebarVisibility(current, 'left', isMobile));
        window.dispatchEvent(new Event(FOCUS_FILES_EVENT));
        return;
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        // Dismiss open drawers first so one keypress always reveals the chat.
        setSidebars((current) => closeAllSidebars(current));
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (e.key === '[') toggleSidebar('left');
      if (e.key === ']') toggleSidebar('right');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile, toggleSidebar]);

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
    <InspectorPanel onOpenSession={switchSession} sessionId={activeId} ws={ws} />
  );

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header
        sessionId={activeId}
        serverUp={serverUp}
        cost={ws.cost}
        wsStatus={ws.status}
        onSearch={() => setSearchOpen(true)}
        onToggleLeft={() => toggleSidebar('left')}
        onToggleRight={() => toggleSidebar('right')}
      />
      <OfflineBanner status={ws.status} onRetry={ws.reconnect} />
      <div className="flex flex-1 overflow-hidden">
        {sidebars.left ? (
          isMobile ? (
            <MobileDrawer side="left" label="Explorer panel" onClose={closeDrawers}>
              <PaneErrorBoundary paneName="Explorer">
                <Sidebar side="left" title="Explorer" className="h-full w-full">
                  {explorerContent}
                </Sidebar>
              </PaneErrorBoundary>
            </MobileDrawer>
          ) : (
            <PaneErrorBoundary paneName="Explorer">
              <Sidebar side="left" title="Explorer">
                {explorerContent}
              </Sidebar>
            </PaneErrorBoundary>
          )
        ) : null}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden p-2 sm:p-3">
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
            <MobileDrawer side="right" label="Inspector panel" onClose={closeDrawers}>
              <PaneErrorBoundary paneName="Inspector">
                <Sidebar side="right" title="Inspector" className="h-full w-full">
                  {inspectorContent}
                </Sidebar>
              </PaneErrorBoundary>
            </MobileDrawer>
          ) : (
            <PaneErrorBoundary paneName="Inspector">
              <Sidebar side="right" title="Inspector">
                {inspectorContent}
              </Sidebar>
            </PaneErrorBoundary>
          )
        ) : null}
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

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={label}>
      <button
        type="button"
        aria-label={`Close ${label}`}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />
      <div
        className={`absolute inset-y-0 h-full w-[85vw] max-w-[320px] bg-card shadow-2xl ${
          side === 'left' ? 'left-0' : 'right-0'
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          title={`Close ${label}`}
          aria-label={`Close ${label}`}
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
