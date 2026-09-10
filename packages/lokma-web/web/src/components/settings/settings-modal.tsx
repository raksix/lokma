import * as React from 'react';
import {
  Boxes,
  Brain,
  CircleUserRound,
  Clock3,
  Info,
  Keyboard,
  Layers,
  Package,
  Palette,
  Plug2,
  Settings,
  Shield,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type AuthUser } from '@/lib/api';
import { canDo } from '@/components/auth/auth';
import { cn } from '@/lib/utils';
import {
  emitToast,
  resolveShortcuts,
  useFocusTrap,
  type ExplorerSide,
} from '@/components/shell';
import {
  LazyAccountPane,
  LazyAdminPane,
  LazyCronApprovalsPane,
  LazyMemoryPane,
  LazyModelsPane,
  LazyPluginsPane,
  LazyProvidersPane,
  PaneFallback,
} from '@/components/panes/lazy-panes';
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  isSettingsSection,
  normalizeConfig,
  type NormalizedConfig,
  type SettingsSectionId,
} from './settings';
import { ConfigPane } from './config-pane';
import { AppearancePane } from './appearance-pane';
import { PermissionsPane } from './permissions-pane';
import { McpPane } from './mcp-pane';

/**
 * SettingsModal — REQ-022. The detailed settings system (REQ-009) as an
 * OpenCode-style large centered modal instead of a sidebar pane/tab:
 * dimmed backdrop, left category nav + right content, X button, Escape
 * and backdrop-click close, focus trapped inside while open (shared
 * `useFocusTrap`).
 *
 * Content reuses the live panes (same components as the Inspector tabs —
 * no duplicated forms): Config/Appearance/Permissions/MCP share ONE
 * `GET /api/config` load, the rest are the existing lazy panes.
 */

const SECTION_ICONS: Record<SettingsSectionId, typeof Settings> = {
  'general': Settings,
  'account': CircleUserRound,
  'admin': ShieldCheck,
  'appearance': Palette,
  'providers': Plug2,
  'models': Layers,
  'permissions': Shield,
  'mcp': Boxes,
  'memory': Brain,
  'cron': Clock3,
  'shortcuts': Keyboard,
  'plugins': Package,
  'about': Info,
};

export function SettingsModal({
  open,
  onClose,
  explorerSide = 'right',
  initialSection = DEFAULT_SETTINGS_SECTION,
}: {
  open: boolean;
  onClose: () => void;
  explorerSide?: ExplorerSide;
  /** REQ-072: which section to land on (account icon opens Account directly). */
  initialSection?: SettingsSectionId;
}) {
  const [section, setSection] = React.useState<SettingsSectionId>(DEFAULT_SETTINGS_SECTION);
  const [config, setConfig] = React.useState<NormalizedConfig | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);
  // REQ-101 — Admin tab visibility + content guard (quiet 401 → no tab).
  const [me, setMe] = React.useState<AuthUser | null>(null);
  const [meLoaded, setMeLoaded] = React.useState(false);
  const canSeeAdmin = canDo(me, 'manageUsers');
  const panelRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef, { onEscape: onClose });

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

  // Fresh server config on every open; land on the requested section.
  React.useEffect(() => {
    if (!open) return;
    setSection(isSettingsSection(initialSection) ? initialSection : DEFAULT_SETTINGS_SECTION);
    setMe(null);
    setMeLoaded(false);
    void load();
    api
      .authMeQuiet()
      .then((res) => setMe(res.user))
      .catch(() => setMe(null))
      .finally(() => setMeLoaded(true));
  }, [open, load, initialSection]);

  // REQ-101 route guard — a deep-linked/remembered admin section bounces
  // to Account once identity resolves without admin rights.
  React.useEffect(() => {
    if (open && meLoaded && section === 'admin' && !canSeeAdmin) {
      setSection('account');
    }
  }, [open, meLoaded, section, canSeeAdmin]);

  // Body scroll lock while the large modal is up (same as MobileDrawer).
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open ]);

  if (!open) return null;

  const needsConfig =
    section === 'general' || section === 'appearance' || section === 'permissions' || section === 'mcp';

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="flex h-[640px] max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-line bg-white shadow-2xl dark:bg-[#1E1E21]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5">
          <Settings className="h-4 w-4 text-terracotta" />
          <span className="text-sm font-semibold">Settings</span>
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            aria-label="Close settings"
            className="ml-auto grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            aria-label="Settings sections"
            className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-line p-2 sm:w-52 sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto sm:border-r sm:border-b-0"
          >
            {SETTINGS_SECTIONS.filter((s) => s.id !== 'admin' || canSeeAdmin).map((s) => {
              const Icon = SECTION_ICONS[s.id];
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (isSettingsSection(s.id)) setSection(s.id);
                  }}
                  aria-label={s.label}
                  aria-pressed={active}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] whitespace-nowrap transition sm:w-full',
                    active
                      ? 'bg-terracotta/10 font-medium text-terracotta'
                      : 'text-zinc-600 hover:bg-muted dark:text-zinc-300',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {s.label}
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <React.Suspense fallback={<PaneFallback pane={section} />}>
              {section === 'shortcuts' ? (
                <ShortcutsSection explorerSide={explorerSide} />
              ) : section === 'about' ? (
                <AboutSection />
              ) : section === 'account' ? (
                <LazyAccountPane />
              ) : section === 'admin' ? (
                canSeeAdmin ? (
                  <LazyAdminPane />
                ) : (
                  <div className="p-4 text-center text-xs text-zinc-400">
                    Admin access required — your own profile lives in Account.
                  </div>
                )
              ) : section === 'providers' ? (
                <LazyProvidersPane />
              ) : section === 'models' ? (
                <LazyModelsPane />
              ) : section === 'memory' ? (
                <LazyMemoryPane />
              ) : section === 'cron' ? (
                <LazyCronApprovalsPane />
              ) : section === 'plugins' ? (
                <LazyPluginsPane />
              ) : needsConfig ? (
                error !== null && config === null ? (
                  <div className="p-4 text-center text-xs text-zinc-400">
                    <div>Could not load config — {error}</div>
                    <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => load()}>
                      Retry
                    </Button>
                  </div>
                ) : config === null ? (
                  <div className="p-4 text-center text-xs text-zinc-400">Loading config…</div>
                ) : section === 'appearance' ? (
                  <AppearancePane key={reloadToken} config={config} onReload={load} />
                ) : section === 'permissions' ? (
                  <PermissionsPane key={reloadToken} config={config} onReload={load} />
                ) : section === 'mcp' ? (
                  <McpPane key={reloadToken} config={config} onReload={load} />
                ) : (
                  <ConfigPane key={reloadToken} config={config} onReload={load} />
                )
              ) : null}
            </React.Suspense>
          </div>
        </div>

        <div className="shrink-0 border-t border-line px-4 py-2 text-[11px] text-zinc-400">
          Esc closes · changes save instantly to the server
        </div>
      </div>
    </div>
  );
}

/** Shortcuts section — renders the single SHORTCUTS registry (never hand-duplicated). */
function ShortcutsSection({ explorerSide }: { explorerSide: ExplorerSide }) {
  const shortcuts = resolveShortcuts(explorerSide);
  return (
    <ul className="space-y-1">
      {shortcuts.map((s) => (
        <li key={s.id} className="flex items-center gap-3 rounded-md px-1 py-1 text-[13px]">
          <span className="flex min-w-[92px] shrink-0 items-center gap-1">
            {s.keys.map((k) => (
              <kbd
                key={k}
                className="rounded border border-line bg-muted px-1.5 py-0.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-300"
              >
                {k}
              </kbd>
            ))}
          </span>
          <span className="text-zinc-600 dark:text-zinc-300">{s.description}</span>
        </li>
      ))}
    </ul>
  );
}

/** About section — static harness facts + live server version (best-effort). */
function AboutSection() {
  const [version, setVersion] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    api
      .getMetrics()
      .then((m) => {
        if (!cancelled) setVersion(m.version);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-[#262624] text-sm font-semibold text-white">
          L
        </span>
        <div>
          <div className="font-serif text-base font-semibold">lokma</div>
          <div className="text-xs text-zinc-500">Innovative agentic coding harness</div>
        </div>
      </div>
      <dl className="space-y-1.5">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-zinc-500">Server</dt>
          <dd className="font-mono text-xs">Fastify :3456 · {version ?? 'version unknown'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-zinc-500">Web</dt>
          <dd className="font-mono text-xs">Vite SPA :3457</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-zinc-500">Docs</dt>
          <dd className="font-mono text-xs">Docs/ single source (00-LOKMA-KONTEKST)</dd>
        </div>
      </dl>
    </div>
  );
}
