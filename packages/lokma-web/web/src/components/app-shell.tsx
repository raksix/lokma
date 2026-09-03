
import * as React from 'react';
import { Header } from '@/components/header';
import { Sidebar, SessionsPanel, InfoPanel } from '@/components/sidebar';
import { Chat } from '@/components/chat';
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
  emitToast,
} from '@/components/shell';

/**
 * AppShell — harness frame: Header + sidebars + chat + footer.
 * Owns the single WS socket (status/cost feed the Header and the offline
 * banner), the session list (sessionStore cache), and the global shortcuts:
 * Ctrl/Cmd+K search, Ctrl+M model switch, `[`/`]` sidebars, Esc closes.
 */
export function AppShell({ sessionId }: { sessionId: string }) {
  const [activeId, setActiveId] = React.useState(sessionId);
  const [leftVisible, setLeftVisible] = React.useState(true);
  const [rightVisible, setRightVisible] = React.useState(true);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [serverUp, setServerUp] = React.useState<boolean | null>(null);

  const ws = useWs(activeId);
  const sessions = useSessionStore((s) => s.sessions);
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

  const switchSession = React.useCallback(
    (id: string) => {
      if (!id || id === activeId) return;
      setActiveId(id);
      selectSession(id);
      void refreshSessions();
    },
    [activeId, refreshSessions, selectSession],
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
      if (e.key === 'Escape') {
        setSearchOpen(false);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (e.key === '[') setLeftVisible((v) => !v);
      if (e.key === ']') setRightVisible((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sessionIds = sessions.map((s) => s.id);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header
        sessionId={activeId}
        serverUp={serverUp}
        cost={ws.cost}
        wsStatus={ws.status}
        onSearch={() => setSearchOpen(true)}
        onToggleLeft={() => setLeftVisible((v) => !v)}
        onToggleRight={() => setRightVisible((v) => !v)}
      />
      <OfflineBanner status={ws.status} onRetry={ws.reconnect} />
      <div className="flex flex-1 overflow-hidden">
        {leftVisible ? (
          <PaneErrorBoundary paneName="Explorer">
            <Sidebar side="left" title="Explorer">
              <div className="space-y-4">
                <SessionsPanel sessions={sessionIds} onSelect={switchSession} />
                <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">Server</div>
                  <div className="mt-1 flex items-center gap-2">
                    <HealthBadge />
                    <span>Fastify :3456</span>
                  </div>
                </div>
              </div>
            </Sidebar>
          </PaneErrorBoundary>
        ) : null}

        <main className="flex flex-1 flex-col overflow-hidden p-3">
          <PaneErrorBoundary paneName="Chat">
            <Chat key={activeId} sessionId={activeId} ws={ws} />
          </PaneErrorBoundary>
          <div className="mt-2 text-center text-[11px] text-muted-foreground">
            Sessions persist to <code className="rounded bg-muted px-1">~/.lokma/projects/&lt;hash&gt;/sessions/*.jsonl</code> (CLI + Web share)
          </div>
        </main>

        {rightVisible ? (
          <PaneErrorBoundary paneName="Inspector">
            <Sidebar side="right" title="Inspector">
              <InfoPanel />
            </Sidebar>
          </PaneErrorBoundary>
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
