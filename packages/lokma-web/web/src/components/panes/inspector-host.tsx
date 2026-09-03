import * as React from 'react';
import { Button } from '@/components/ui/button';
import { InfoPanel } from '@/components/sidebar';
import type { UseWs } from '@/hooks/use-ws';
import { useSessionStore } from '@/stores/session';
import { emitToast } from '@/components/shell';
import { ModelsPane } from '@/components/providers/models-pane';
import { ProvidersPane } from '@/components/providers/providers-pane';
import { SettingsPane } from '@/components/settings';
import { TerminalPane } from '@/components/terminal';
import { GitPane } from '@/components/git';
import { BrowserPane } from '@/components/browser';
import { AgentsPane } from '@/components/agents';
import { OrchestrationPane } from '@/components/orchestration';
import { VaultPane } from '@/components/vault';
import { SkillsPane } from '@/components/skills';
import { ArchifyPane } from '@/components/archify';
import { DesignPane } from '@/components/design';
import { TestingPane } from '@/components/testing';
import { BotsPane } from '@/components/bots';
import { AuthPane } from '@/components/auth';
import { SetupPane } from '@/components/setup';
import { PluginsPane } from '@/components/plugins';
import { ObservabilityPane } from '@/components/observability';
import { CronApprovalsPane } from '@/components/cron';
import { ExtrasPane } from '@/components/extras';
import type { ExtrasTabId } from '@/components/extras/extras';
import { UsagePane } from '@/components/usage/usage-pane';
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
  if (tab === 'providers') return <ProvidersPane />;
  if (tab === 'models') return <ModelsPane />;
  if (tab === 'usage') return <UsagePane onOpenSession={onOpenSession} />;
  if (tab === 'settings') return <SettingsPane />;
  if (tab === 'agents') return <AgentsPane />;
  if (tab === 'orchestration') return <OrchestrationPane />;
  if (tab === 'vault') return <VaultPane />;
  if (tab === 'skills') return <SkillsPane />;
  if (tab === 'archify') return <ArchifyPane />;
  if (tab === 'design') return <DesignPane />;
  if (tab === 'testing') return <TestingPane />;
  if (tab === 'bots') return <BotsPane onOpenSession={onOpenSession} />;
  if (tab === 'auth') return <AuthPane />;
  if (tab === 'setup') return <SetupPane />;
  if (tab === 'plugins') return <PluginsPane />;
  if (tab === 'observability') return <ObservabilityPane />;
  if (tab === 'cron') return <CronApprovalsPane />;
  if (tab === 'extras') {
    return <ExtrasPane onOpenTab={(t: ExtrasTabId) => onOpenInspectorTab(t)} />;
  }
  if (tab === 'terminal' || tab === 'git' || tab === 'browser') {
    if (!sessionId || (tab === 'terminal' && !ws)) return <NeedsSessionPane pane={tab} onOpenSession={onOpenSession} />;
    if (tab === 'terminal') return <TerminalPane key={sessionId} sessionId={sessionId} ws={ws as UseWs} />;
    if (tab === 'git') return <GitPane key={sessionId} sessionId={sessionId} />;
    return <BrowserPane key={sessionId} sessionId={sessionId} />;
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
