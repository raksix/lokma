import * as React from 'react';
import { BarChart3, Cpu, Folder, GitBranch, Globe, Info, Layers, Plug2, Settings, Terminal, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InfoPanel } from '@/components/sidebar';
import type { UseWs } from '@/hooks/use-ws';
import { ModelsPane } from './models-pane';
import { ProvidersPane } from './providers-pane';
import { SettingsPane } from '@/components/settings';
import { TerminalPane } from '@/components/terminal';
import { GitPane } from '@/components/git';
import { BrowserPane } from '@/components/browser';
import { AgentsPane } from '@/components/agents';
import { OrchestrationPane } from '@/components/orchestration';
import { VaultPane } from '@/components/vault';
import { UsagePane } from '@/components/usage/usage-pane';

/**
 * InspectorPanel — right-sidebar tabs. Info stays the default; Providers is
 * the real W2-5 pane (live CRUD + connection test), Models the real W2-6
 * pane (enable/disable over `PATCH /api/models`), Usage the real W2-7
 * pane (token/cost accounting over `GET /api/usage/*` + CSV/JSONL export),
 * Settings the real W2-8 pane (Config/Appearance/Permissions/MCP over
 * `GET/PATCH /api/config`), Terminal the real W3-10 pane (live shells over
 * `POST /api/terminal` + WS `terminal/*` frames), Git the real W3-11 pane
 * (branch/status/log/commit/push over `GET/POST /api/git/*` + live locks),
 * Browser the real W3-12 pane (per-agent live tabs + server-owned history
 * over `GET/POST /api/browser/*`, pages in a sandboxed iframe), Agents the
 * real W4-13 pane (registry CRUD + pause/resume/kill/fork/clone +
 * SOUL.md/MEMORY.md editors over `GET/POST/PATCH/DELETE /api/agents/*`),
 * Orchestration the real W4-14 pane (live state-grouped tree + fan-out
 * creation + cancel-all over the same registry, kept live by WS
 * `agent_state` frames), Vault the real W4-15 pane (live file graph +
 * note reader with `[[wikilink]]` navigation + ingest over
 * `GET /api/vault/graph|tree`, `GET /api/vault/note`,
 * `POST /api/vault/ingest`).
 * Later waves add tabs here; the W7 pane system may relocate
 * the whole panel without touching the panes themselves.
 */
export function InspectorPanel({
  onOpenSession,
  sessionId,
  ws,
}: {
  onOpenSession?: (id: string) => void;
  sessionId?: string;
  ws?: UseWs;
}) {
  const [tab, setTab] = React.useState<'info' | 'providers' | 'models' | 'usage' | 'settings' | 'terminal' | 'git' | 'browser' | 'agents' | 'orchestration' | 'vault'>(
    'info',
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        <Button
          variant={tab === 'info' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('info')}
        >
          <Info className="h-3 w-3" />
          Info
        </Button>
        <Button
          variant={tab === 'providers' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('providers')}
        >
          <Plug2 className="h-3 w-3" />
          Providers
        </Button>
        <Button
          variant={tab === 'models' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('models')}
        >
          <Layers className="h-3 w-3" />
          Models
        </Button>
        <Button
          variant={tab === 'usage' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('usage')}
        >
          <BarChart3 className="h-3 w-3" />
          Usage
        </Button>
        <Button
          variant={tab === 'settings' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('settings')}
        >
          <Settings className="h-3 w-3" />
          Settings
        </Button>
        <Button
          variant={tab === 'terminal' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('terminal')}
        >
          <Terminal className="h-3 w-3" />
          Terminal
        </Button>
        <Button
          variant={tab === 'git' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('git')}
        >
          <GitBranch className="h-3 w-3" />
          Git
        </Button>
        <Button
          variant={tab === 'browser' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('browser')}
        >
          <Globe className="h-3 w-3" />
          Browser
        </Button>
        <Button
          variant={tab === 'agents' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('agents')}
        >
          <Users className="h-3 w-3" />
          Agents
        </Button>
        <Button
          variant={tab === 'orchestration' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('orchestration')}
        >
          <Cpu className="h-3 w-3" />
          Orchestration
        </Button>
        <Button
          variant={tab === 'vault' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('vault')}
        >
          <Folder className="h-3 w-3" />
          Vault
        </Button>
      </div>
      {tab === 'info' ? (
        <InfoPanel />
      ) : tab === 'vault' ? (
        <VaultPane />
      ) : tab === 'orchestration' ? (
        <OrchestrationPane />
      ) : tab === 'agents' ? (
        <AgentsPane />
      ) : tab === 'providers' ? (
        <ProvidersPane />
      ) : tab === 'models' ? (
        <ModelsPane />
      ) : tab === 'usage' ? (
        <UsagePane onOpenSession={onOpenSession} />
      ) : tab === 'settings' ? (
        <SettingsPane />
      ) : tab === 'git' ? (
        <GitPane key={sessionId ?? 'no-session'} sessionId={sessionId} />
      ) : tab === 'browser' ? (
        sessionId ? (
          <BrowserPane key={sessionId} sessionId={sessionId} />
        ) : (
          <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
            Open a session to use the browser.
          </div>
        )
      ) : sessionId && ws ? (
        <TerminalPane key={sessionId} sessionId={sessionId} ws={ws} />
      ) : (
        <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
          Open a session to use the terminal.
        </div>
      )}
    </div>
  );
}
