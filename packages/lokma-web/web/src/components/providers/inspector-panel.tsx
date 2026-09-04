import * as React from 'react';
import { Activity, BarChart3, Beaker, Bot, Brain, Clock3, Cpu, Folder, GitBranch, Globe, HardDrive, Info, Layers, Package, Paintbrush, Plug2, Puzzle, Settings, Shield, Star, Terminal, Users, Workflow } from 'lucide-react';
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
import { MemoryPane } from '@/components/memory';
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
 * `POST /api/vault/ingest`), Skills the real W4-16 pane (live registry
 * over `GET /api/skills`, skill_view preview over `GET /api/skills/:id`,
 * reference loads over `GET /api/skills/:id/file`, curator patches over
 * `POST /api/skills/:id`, telemetry over `.usage.json`), Archify the real
 * W5-17 pane (typed IR → validated HTML/SVG over `GET/POST /api/archify/*`,
 * viewer + receipt + Before/Delta/After + real file exports), Design the
 * real W5-18 pane (6 artifact types over bundled systems + a real
 * `.lokma/DESIGN.md` guard over `GET/POST/PUT /api/design/*`, sandboxed
 * viewer + Code/Critique/Export tabs + real file downloads), Testing the
 * real W5-19 pane (Plan→Run→Classify→Report over live handlers +
 * Shannon scan over `GET/POST /api/tests/*`, per-test rows + real
 * `junit.xml` download), Bots the real W5-20 pane (Bot Gallery over
 * `GET /api/bots` + create/fork/publish/run over `POST/PATCH`
 * `/api/bots/*`, playground runs spawn a real agent + session), Auth the
 * real W6-21 pane (login + RBAC matrix + projects + members over
 * `POST/GET/PATCH /api/auth/*`, `GET/POST/PATCH/DELETE /api/users/*`,
 * `GET/POST/PATCH/DELETE /api/projects/*`, invite accept + copyable
 * link, viewer-403 gates enforced server-side), Setup the real W6-22
 * pane (`lokma init` + optional-stack flags + `lokma doctor` probes over
 * `GET/POST /api/setup*` + `GET /api/doctor`), Plugins the real W6-23
 * pane (kernel registry + hot toggle + add-from-URL over
 * `GET/PATCH /api/plugins/*` + `POST/DELETE`, suspended routes answer
 * 503 with no restart), Observability the real W6-24 pane (agent trace
 * timeline from durable state + session replay from JSONL + frozen share
 * snapshots over `GET /api/agents/:id/trace` + `GET/POST/DELETE`
 * `/api/share/*`). Cron the real W6-25 pane (per-agent cron CRUD over
 * `GET/POST/PATCH/DELETE /api/agents/:id/cron` + `GET /api/cron`, approvals
 * rules over the shared `PATCH /api/config` permissions store, WS decision
 * history over `GET /api/approvals`). Extras the real W6-26 pane (23 ranked
 * agent-system extras as a live feature-flag board over `GET/PATCH
 * /api/config` `features`, shipped rows opening their real Inspector tab).
 * Memory the real memory-deep wave 2 pane (global MEMORY.md / USER.md
 * entries + live usage meter over `GET/POST/PATCH/DELETE /api/memory`).
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
  const [tab, setTab] = React.useState<'info' | 'providers' | 'models' | 'usage' | 'settings' | 'terminal' | 'git' | 'browser' | 'agents' | 'orchestration' | 'vault' | 'skills' | 'archify' | 'design' | 'testing' | 'bots' | 'auth' | 'setup' | 'plugins' | 'observability' | 'cron' | 'extras' | 'memory'>(
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
        <Button
          variant={tab === 'skills' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('skills')}
        >
          <Puzzle className="h-3 w-3" />
          Skills
        </Button>
        <Button
          variant={tab === 'archify' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('archify')}
        >
          <Workflow className="h-3 w-3" />
          Archify
        </Button>
        <Button
          variant={tab === 'design' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('design')}
        >
          <Paintbrush className="h-3 w-3" />
          Design
        </Button>
        <Button
          variant={tab === 'testing' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('testing')}
        >
          <Beaker className="h-3 w-3" />
          Testing
        </Button>
        <Button
          variant={tab === 'bots' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('bots')}
        >
          <Bot className="h-3 w-3" />
          Bots
        </Button>
        <Button
          variant={tab === 'auth' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('auth')}
        >
          <Shield className="h-3 w-3" />
          Auth
        </Button>
        <Button
          variant={tab === 'setup' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('setup')}
        >
          <HardDrive className="h-3 w-3" />
          Setup
        </Button>
        <Button
          variant={tab === 'plugins' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('plugins')}
        >
          <Package className="h-3 w-3" />
          Plugins
        </Button>
        <Button
          variant={tab === 'observability' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('observability')}
        >
          <Activity className="h-3 w-3" />
          Observability
        </Button>
        <Button
          variant={tab === 'cron' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('cron')}
        >
          <Clock3 className="h-3 w-3" />
          Cron
        </Button>
        <Button
          variant={tab === 'extras' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('extras')}
        >
          <Star className="h-3 w-3" />
          Extras
        </Button>
        <Button
          variant={tab === 'memory' ? 'default' : 'ghost'}
          size="sm"
          className="h-6 flex-1 gap-1.5 text-[11px]"
          onClick={() => setTab('memory')}
        >
          <Brain className="h-3 w-3" />
          Memory
        </Button>
      </div>
      {tab === 'info' ? (
        <InfoPanel />
      ) : tab === 'memory' ? (
        <MemoryPane />
      ) : tab === 'extras' ? (
        <ExtrasPane onOpenTab={(t) => setTab(t)} />
      ) : tab === 'cron' ? (
        <CronApprovalsPane />
      ) : tab === 'observability' ? (
        <ObservabilityPane />
      ) : tab === 'plugins' ? (
        <PluginsPane />
      ) : tab === 'setup' ? (
        <SetupPane />
      ) : tab === 'auth' ? (
        <AuthPane />
      ) : tab === 'bots' ? (
        <BotsPane onOpenSession={onOpenSession} />
      ) : tab === 'testing' ? (
        <TestingPane />
      ) : tab === 'design' ? (
        <DesignPane />
      ) : tab === 'archify' ? (
        <ArchifyPane />
      ) : tab === 'skills' ? (
        <SkillsPane />
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
