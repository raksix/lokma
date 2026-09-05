import * as React from 'react';
import { Button } from '@/components/ui/button';
import { InfoPanel } from '@/components/sidebar';
import type { UseWs } from '@/hooks/use-ws';
import { useSessionStore } from '@/stores/session';
import { emitToast } from '@/components/shell';
import type { ExtrasTabId } from '@/components/extras/extras';
import {
  LazyAgentsPane,
  LazyArchifyPane,
  LazyAuthPane,
  LazyBotsPane,
  LazyBrowserPane,
  LazyCronApprovalsPane,
  LazyDesignPane,
  LazyExtrasPane,
  LazyGitPane,
  LazyMemoryPane,
  LazyModelsPane,
  LazyObservabilityPane,
  LazyOrchestrationPane,
  LazyPluginsPane,
  LazyProvidersPane,
  LazySettingsPane,
  LazySetupPane,
  LazySkillsPane,
  LazyTerminalPane,
  LazyTestingPane,
  LazyUsagePane,
  LazyVaultPane,
  PaneFallback,
} from '@/components/panes/lazy-panes';
import type { InspectorTabId } from './panes';

// InspectorHost: renders one REAL Inspector pane inside a tiling tab.
// Same components and props as the right InspectorPanel, so a tiling tab
// and the sidebar tab are the same live surface. Session-scoped tool panes
// (terminal/git/browser) bind to the workspace session; without one they
// show a real "create session" action instead of a dead pane.
export function InspectorHost({
  tab,
  sessionId,
  ws,
  onOpenSession,
  onOpenInspectorTab,
}: {
  tab: InspectorTabId;
  sessionId: string | null;
  ws?: UseWs;
  onOpenSession?: (id: string) => void;
  onOpenInspectorTab: (id: InspectorTabId) => void;
}) {
  if (tab === 'info') return <InfoPanel />;
  return (
    <React.Suspense fallback={<PaneFallback pane={tab} />}>
      <LazyTab tab={tab} sessionId={sessionId} ws={ws} onOpenSession={onOpenSession} onOpenInspectorTab={onOpenInspectorTab} />
    </React.Suspense>
  );
}

// LazyTab — the tab switch itself stays synchronous (pure conditional), so
// only the chunk download suspends inside the boundary above.
function LazyTab({
  tab,
  sessionId,
  ws,
  onOpenSession,
  onOpenInspectorTab,
}: {
  tab: InspectorTabId;
  sessionId: string | null;
  ws?: UseWs;
  onOpenSession?: (id: string) => void;
  onOpenInspectorTab: (id: InspectorTabId) => void;
}) {
  if (tab === 'providers') return <LazyProvidersPane />;
  if (tab === 'models') return <LazyModelsPane />;
  if (tab === 'usage') return <LazyUsagePane onOpenSession={onOpenSession} />;
  if (tab === 'settings') return <LazySettingsPane />;
  if (tab === 'agents') return <LazyAgentsPane />;
  if (tab === 'orchestration') return <LazyOrchestrationPane />;
  if (tab === 'vault') return <LazyVaultPane />;
  if (tab === 'skills') return <LazySkillsPane />;
  if (tab === 'archify') return <LazyArchifyPane />;
  if (tab === 'design') return <LazyDesignPane />;
  if (tab === 'testing') return <LazyTestingPane />;
  if (tab === 'bots') return <LazyBotsPane onOpenSession={onOpenSession} />;
  if (tab === 'auth') return <LazyAuthPane />;
  if (tab === 'setup') return <LazySetupPane />;
  if (tab === 'plugins') return <LazyPluginsPane />;
  if (tab === 'observability') return <LazyObservabilityPane />;
  if (tab === 'cron') return <LazyCronApprovalsPane />;
  if (tab === 'memory') return <LazyMemoryPane onOpenSession={onOpenSession} />;
  if (tab === 'extras') {
    return <LazyExtrasPane onOpenTab={(t: ExtrasTabId) => onOpenInspectorTab(t)} />;
  }
  if (tab === 'terminal' || tab === 'git' || tab === 'browser') {
    if (!sessionId || (tab === 'terminal' && !ws)) return <NeedsSessionPane pane={tab} onOpenSession={onOpenSession} />;
    if (tab === 'terminal') return <LazyTerminalPane key={sessionId} sessionId={sessionId} ws={ws as UseWs} />;
    if (tab === 'git') return <LazyGitPane key={sessionId} sessionId={sessionId} />;
    return <LazyBrowserPane key={sessionId} sessionId={sessionId} />;
  }
  return null;
}

function NeedsSessionPane({ pane, onOpenSession }: { pane: string; onOpenSession?: (id: string) => void }) {
  const createSession = useSessionStore((s) => s.createSession);
  const [busy, setBusy] = React.useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const id = await createSession();
      if (id) {
        emitToast(`Session ${id.slice(0, 12)} created`);
        onOpenSession?.(id);
      } else {
        emitToast('Could not create a session');
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-xs text-muted-foreground">
        {pane === 'terminal' ? 'Terminal' : pane === 'git' ? 'Git' : 'Browser'} needs a session for its working directory.
      </p>
      <Button variant="default" size="sm" className="h-7 text-xs" disabled={busy} onClick={create}>
        {busy ? 'Creating…' : 'New session'}
      </Button>
    </div>
  );
}
