import * as React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Lazy Inspector panes (Phase 3 perf wave 2b) — every heavy pane ships as
 * its own on-demand chunk instead of bloating the initial bundle. Both the
 * right-sidebar `InspectorPanel` and the tiling `InspectorHost` render
 * through these, so there is exactly one lazy binding per pane (DRY).
 *
 * Each entry imports the pane's own file (never a barrel) so a chunk only
 * pulls the pane plus the small helpers it really uses. All panes use
 * named exports, hence the `{ default: m.XPane }` adapter `React.lazy`
 * requires. Render the active pane inside `<Suspense
 * fallback={<PaneFallback />}>` — the tab bars stay mounted, only the
 * pane area suspends.
 */
export const LazyProvidersPane = React.lazy(() =>
  import('@/components/providers/providers-pane').then((m) => ({ default: m.ProvidersPane })),
);
export const LazyModelsPane = React.lazy(() =>
  import('@/components/providers/models-pane').then((m) => ({ default: m.ModelsPane })),
);
export const LazySettingsPane = React.lazy(() =>
  import('@/components/settings/settings-pane').then((m) => ({ default: m.SettingsPane })),
);
export const LazyTerminalPane = React.lazy(() =>
  import('@/components/terminal/terminal-pane').then((m) => ({ default: m.TerminalPane })),
);
export const LazyGitPane = React.lazy(() =>
  import('@/components/git/git-pane').then((m) => ({ default: m.GitPane })),
);
export const LazyBrowserPane = React.lazy(() =>
  import('@/components/browser/browser-pane').then((m) => ({ default: m.BrowserPane })),
);
export const LazyAgentsPane = React.lazy(() =>
  import('@/components/agents/agents-pane').then((m) => ({ default: m.AgentsPane })),
);
export const LazyOrchestrationPane = React.lazy(() =>
  import('@/components/orchestration/orchestration-pane').then((m) => ({ default: m.OrchestrationPane })),
);
export const LazyVaultPane = React.lazy(() =>
  import('@/components/vault/vault-pane').then((m) => ({ default: m.VaultPane })),
);
export const LazySkillsPane = React.lazy(() =>
  import('@/components/skills/skills-pane').then((m) => ({ default: m.SkillsPane })),
);
export const LazyArchifyPane = React.lazy(() =>
  import('@/components/archify/archify-pane').then((m) => ({ default: m.ArchifyPane })),
);
export const LazyDesignPane = React.lazy(() =>
  import('@/components/design/design-pane').then((m) => ({ default: m.DesignPane })),
);
export const LazyTestingPane = React.lazy(() =>
  import('@/components/testing/testing-pane').then((m) => ({ default: m.TestingPane })),
);
export const LazyBotsPane = React.lazy(() =>
  import('@/components/bots/bots-pane').then((m) => ({ default: m.BotsPane })),
);
export const LazyAuthPane = React.lazy(() =>
  import('@/components/auth/auth-pane').then((m) => ({ default: m.AuthPane })),
);
export const LazySetupPane = React.lazy(() =>
  import('@/components/setup/setup-pane').then((m) => ({ default: m.SetupPane })),
);
export const LazyPluginsPane = React.lazy(() =>
  import('@/components/plugins/plugins-pane').then((m) => ({ default: m.PluginsPane })),
);
export const LazyObservabilityPane = React.lazy(() =>
  import('@/components/observability/observability-pane').then((m) => ({
    default: m.ObservabilityPane,
  })),
);
export const LazyCronApprovalsPane = React.lazy(() =>
  import('@/components/cron/cron-pane').then((m) => ({ default: m.CronApprovalsPane })),
);
export const LazyExtrasPane = React.lazy(() =>
  import('@/components/extras/extras-pane').then((m) => ({ default: m.ExtrasPane })),
);
export const LazyMemoryPane = React.lazy(() =>
  import('@/components/memory/memory-pane').then((m) => ({ default: m.MemoryPane })),
);
export const LazyUsagePane = React.lazy(() =>
  import('@/components/usage/usage-pane').then((m) => ({ default: m.UsagePane })),
);

/**
 * PaneFallback — honest loading state while a pane chunk downloads.
 * Named for screen readers (`role=status`); the global reduced-motion
 * kill-switch in `index.css` stills the spinner when requested.
 */
export function PaneFallback({ pane }: { pane?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={pane ? `Loading ${pane} pane` : 'Loading pane'}
      className="flex items-center gap-2 rounded border border-dashed p-4 text-xs text-muted-foreground"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      Loading{pane ? ` ${pane}` : ''}…
    </div>
  );
}
