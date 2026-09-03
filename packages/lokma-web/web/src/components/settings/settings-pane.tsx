import * as React from 'react';
import { Boxes, Palette, Settings, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { emitToast } from '@/components/shell';
import { normalizeConfig, type NormalizedConfig } from './settings';
import { ConfigPane } from './config-pane';
import { AppearancePane } from './appearance-pane';
import { PermissionsPane } from './permissions-pane';
import { McpPane } from './mcp-pane';

const TABS = [
  { id: 'config', label: 'Config', icon: Settings },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'perms', label: 'Permissions', icon: Shield },
  { id: 'mcp', label: 'MCP', icon: Boxes },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * SettingsPane — Config / Appearance / Permissions / MCP sub-tabs over
 * ONE `GET /api/config` load (server is the source of truth; every
 * sub-pane PATCHes back and reloads). Providers / Models / Usage live
 * as top-level Inspector tabs (W2-5..W2-7) — they are not duplicated
 * here. The `reloadToken` key remounts the active pane after each
 * reload so per-pane draft state always matches the server.
 */
export function SettingsPane() {
  const [tab, setTab] = React.useState<TabId>('config');
  const [config, setConfig] = React.useState<NormalizedConfig | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  const load = React.useCallback(async () => {
    try {
      const res = await api.getConfig();
      setConfig(normalizeConfig(res));
      setError(null);
      setReloadToken((t) => t + 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load config';
      setError(msg);
      emitToast(msg);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white dark:bg-[#161618]">
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-line bg-[#FDFCFB] px-3 dark:bg-[#1E1E21]">
        <Settings className="h-3 w-3 text-zinc-500" />
        <span className="text-xs font-semibold">Settings</span>
        <span className="ml-1 hidden text-[11px] text-zinc-400 sm:inline">config · appearance · perms · mcp</span>
      </div>

      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line/60 bg-muted/20 p-1.5">
        {TABS.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? 'default' : 'ghost'}
            size="sm"
            className="h-6 gap-1.5 whitespace-nowrap text-[11px]"
            onClick={() => setTab(t.id)}
          >
            <t.icon className="h-3 w-3" /> {t.label}
          </Button>
        ))}
      </div>

      <div className="max-h-[420px] overflow-auto">
        {error !== null && config === null ? (
          <div className="p-4 text-center text-xs text-zinc-400">
            <div>Could not load config — {error}</div>
            <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => load()}>
              Retry
            </Button>
          </div>
        ) : config === null ? (
          <div className="p-4 text-center text-xs text-zinc-400">Loading config…</div>
        ) : tab === 'config' ? (
          <ConfigPane key={reloadToken} config={config} onReload={load} />
        ) : tab === 'appearance' ? (
          <AppearancePane key={reloadToken} config={config} onReload={load} />
        ) : tab === 'perms' ? (
          <PermissionsPane key={reloadToken} config={config} onReload={load} />
        ) : (
          <McpPane key={reloadToken} config={config} onReload={load} />
        )}
      </div>
    </div>
  );
}
