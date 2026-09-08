import * as React from 'react';
import { FileBrowser } from '@/components/files';
import { InfoPanel } from '@/components/sidebar';
import type { UseWs } from '@/hooks/use-ws';
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
  LazyTodosPane,
  LazyUsagePane,
  LazyVaultPane,
  PaneFallback,
} from '@/components/panes/lazy-panes';

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
 *
 * REQ-008 — `requestedTab` lets the activity rail open a tab from outside:
 * when the prop changes to a non-null tab the panel switches to it (also
 * fires on mount, so a rail click that first reveals the sidebar still
 * lands on the right tab).
 *
 * REQ-020 — navigation lives in the InspectorRail (REQ-010); this panel
 * renders only the selected content, no tab list.
 */
export type InspectorTab =
  // REQ-043 — Files is its own Inspector page (rail icon, VS Code
  // Explorer position): only the FileBrowser, no sessions/server card.
  | 'files'
  | 'info'
  | 'providers'
  | 'models'
  | 'usage'
  | 'settings'
  | 'terminal'
  | 'git'
  | 'browser'
  | 'agents'
  | 'orchestration'
  | 'vault'
  | 'skills'
  | 'archify'
  | 'design'
  | 'testing'
  | 'bots'
  | 'auth'
  | 'setup'
  | 'plugins'
  | 'observability'
  | 'cron'
  | 'extras'
  | 'memory'
  | 'todos';

export function InspectorPanel({
  onOpenSession,
  sessionId,
  ws,
  requestedTab,
}: {
  onOpenSession?: (id: string) => void;
  sessionId?: string;
  ws?: UseWs;
  requestedTab?: InspectorTab | null;
}) {
  const [tab, setTab] = React.useState<InspectorTab>('info');

  React.useEffect(() => {
    if (requestedTab) setTab(requestedTab);
  }, [requestedTab]);

  return (
    <div className="space-y-3">
      <React.Suspense fallback={<PaneFallback pane={tab} />}>
      {tab === 'info' ? (
        <InfoPanel />
      ) : tab === 'files' ? (
        // REQ-043 — the Files page shows ONLY files (same session scope
        // the docked browser used to have, now behind its own tab).
        sessionId ? (
          <FileBrowser key={sessionId} sessionId={sessionId} />
        ) : (
          <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
            Open a session to browse files.
          </div>
        )
      ) : tab === 'memory' ? (
        <LazyMemoryPane />
      ) : tab === 'todos' ? (
        <LazyTodosPane sessionId={sessionId} onOpenSession={onOpenSession} />
      ) : tab === 'extras' ? (
        <LazyExtrasPane onOpenTab={(t) => setTab(t)} />
      ) : tab === 'cron' ? (
        <LazyCronApprovalsPane />
      ) : tab === 'observability' ? (
        <LazyObservabilityPane />
      ) : tab === 'plugins' ? (
        <LazyPluginsPane />
      ) : tab === 'setup' ? (
        <LazySetupPane />
      ) : tab === 'auth' ? (
        <LazyAuthPane />
      ) : tab === 'bots' ? (
        <LazyBotsPane onOpenSession={onOpenSession} />
      ) : tab === 'testing' ? (
        <LazyTestingPane />
      ) : tab === 'design' ? (
        <LazyDesignPane />
      ) : tab === 'archify' ? (
        <LazyArchifyPane />
      ) : tab === 'skills' ? (
        <LazySkillsPane />
      ) : tab === 'vault' ? (
        <LazyVaultPane />
      ) : tab === 'orchestration' ? (
        <LazyOrchestrationPane />
      ) : tab === 'agents' ? (
        <LazyAgentsPane />
      ) : tab === 'providers' ? (
        <LazyProvidersPane />
      ) : tab === 'models' ? (
        <LazyModelsPane />
      ) : tab === 'usage' ? (
        <LazyUsagePane onOpenSession={onOpenSession} />
      ) : tab === 'settings' ? (
        <LazySettingsPane />
      ) : tab === 'git' ? (
        <LazyGitPane key={sessionId ?? 'no-session'} sessionId={sessionId} />
      ) : tab === 'browser' ? (
        sessionId ? (
          // REQ-037 — the sidebar/mobile Inspector is a scrolling column with
          // no bounded height, so BrowserPane's flex-1 collapses and the page
          // renders cut off. This shell gives it a viewport-relative height.
          <div className="flex h-[60vh] min-h-[320px] flex-col overflow-hidden">
            <LazyBrowserPane key={sessionId} sessionId={sessionId} />
          </div>
        ) : (
          <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
            Open a session to use the browser.
          </div>
        )
      ) : sessionId && ws ? (
        <LazyTerminalPane key={sessionId} sessionId={sessionId} ws={ws} />
      ) : (
        <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
          Open a session to use the terminal.
        </div>
      )}
      </React.Suspense>
    </div>
  );
}
