import { Activity, BarChart3, Beaker, Brain, Clock3, Cpu, Folder, FolderOpen, GitBranch, Globe, HardDrive, Info, Layers, ListTodo, Package, Plug2, Puzzle, Settings, Star, Terminal, Users, Workflow } from 'lucide-react';
import { surfacesWithHost, type Surface, type SurfaceId } from '@lokma/shared/surfaces';
import { cn } from '@/lib/utils';
import { INSPECTOR_DRAG_MIME, encodeInspectorDrag } from '@/components/panes/panes';
import type { InspectorTab } from '@/components/providers';
import type { SettingsSectionId } from '@/components/settings/settings';
import type { ExplorerSide, SidebarSide } from './responsive';

/**
 * InspectorRail — REQ-010 thin icon strip (~44px, REQ-023) docked on the Inspector's
 * outer edge. One icon-only button per Inspector tab (same lucide icons and
 * labels as before, tooltip via `title`), so the
 * 24 menus stay reachable without the wide panel open. Purely
 * presentational: the parent owns the active tab and reveals the Inspector
 * panel on select. Follows the REQ-007 swap via the `side` prop.
 *
 * REQ-181 — the item list is no longer hand-maintained: it is a PROJECTION
 * of the shared surface catalog (`@lokma/shared` surfaces.ts — the single
 * source for the rail, the activity bar and the agent tool families). Ids,
 * order and labels come from the catalog; the only rail-side registration
 * left is the lucide icon map below (React components cannot live in the
 * pure-data shared table).
 */

/**
 * REQ-163 — rail entries that open a Settings modal SECTION instead of an
 * Inspector tab (Agent Hub moved out of the panes). One map, one truth: the
 * rail renders these without a drag, the desktop rail click opens the modal
 * on the mapped section, and the mobile tools strip routes the same way.
 * REQ-164 — Orchestration joined the map (same wave). REQ-165 — Vault and
 * Memory followed (their icons stay, their pane/tab definitions are gone).
 * REQ-166 — Skills followed last (same wave: icon stays, pane definitions gone).
 * REQ-181 — the map is projected from the catalog: every inspector-hosted
 * settings-section surface except `settings` itself (that entry is the
 * modal's home and keeps its legacy tab/deep-link behavior).
 */
export type RailModalTab = 'agents' | 'orchestration' | 'vault' | 'memory' | 'skills';

export const RAIL_MODAL_SECTIONS: Record<RailModalTab, SettingsSectionId> = Object.fromEntries(
  surfacesWithHost('inspector')
    .filter(
      (surface): surface is Surface & { section: SettingsSectionId } =>
        surface.opens === 'settings-section' && surface.id !== 'settings' && surface.section !== undefined,
    )
    .map((surface) => [surface.id, surface.section] as const),
) as Record<RailModalTab, SettingsSectionId>;

/**
 * REQ-167 — rail entries that launch their OWN standalone modal (neither a
 * pane/tab nor a Settings section): the Archify icon opens the Archify
 * modal. The icon stays, never drags and never becomes a tiling tab; the
 * AppShell owns the modal state and the mobile tools strip routes here too.
 * REQ-181 — projected from the catalog (`opens: 'standalone-modal'`).
 */
export type RailStandaloneModalTab = 'archify';

export const RAIL_STANDALONE_MODALS: readonly RailStandaloneModalTab[] = surfacesWithHost('inspector')
  .filter((surface) => surface.opens === 'standalone-modal')
  .map((surface) => surface.id as RailStandaloneModalTab);

/** True when this rail entry opens a standalone modal (REQ-167). */
export function isRailStandaloneModalTab(tab: InspectorRailTab): tab is RailStandaloneModalTab {
  return (RAIL_STANDALONE_MODALS as readonly string[]).includes(tab);
}

/**
 * Any rail entry that opens a modal instead of a pane/tab — a Settings
 * section (REQ-163/164/165/166) or a standalone modal (REQ-167). These
 * never drag and never become tiling tabs.
 */
export function isRailNonPaneTab(tab: InspectorRailTab): tab is RailModalTab | RailStandaloneModalTab {
  return isRailModalTab(tab) || isRailStandaloneModalTab(tab);
}

export type InspectorRailTab = InspectorTab | RailModalTab | RailStandaloneModalTab;

/** True when this rail entry opens the Settings modal, never a pane/tab. */
export function isRailModalTab(tab: InspectorRailTab): tab is RailModalTab {
  return tab in RAIL_MODAL_SECTIONS;
}

interface InspectorRailItem {
  tab: InspectorRailTab;
  label: string;
  Icon: typeof Info;
}

/**
 * lucide icon per catalog surface id — the one rail fact the shared
 * catalog cannot carry (React components stay in the web layer). The
 * projection below throws when a catalog surface has no icon registered,
 * so a new surface fails loudly instead of silently dropping off the rail.
 */
const SURFACE_ICONS: Partial<Record<SurfaceId, typeof Info>> = {
  files: FolderOpen,
  providers: Plug2,
  models: Layers,
  usage: BarChart3,
  settings: Settings,
  terminal: Terminal,
  git: GitBranch,
  browser: Globe,
  agents: Users,
  orchestration: Cpu,
  vault: Folder,
  skills: Puzzle,
  archify: Workflow,
  testing: Beaker,
  setup: HardDrive,
  plugins: Package,
  observability: Activity,
  cron: Clock3,
  extras: Star,
  memory: Brain,
  todos: ListTodo,
};

/** Rail-renderable surface id — a catalog id that is also a rail tab. */
type InspectorRailSurfaceId = Extract<SurfaceId, InspectorRailTab>;

/** Project one catalog surface into a rail button (throws when its icon is missing). */
function railItemFor(surface: Surface): InspectorRailItem {
  const Icon = SURFACE_ICONS[surface.id];
  if (!Icon) {
    throw new Error('inspector rail: no icon registered for surface ' + surface.id);
  }
  return { tab: surface.id as InspectorRailSurfaceId, label: surface.label, Icon };
}

/**
 * REQ-181 — the rail list is a projection of the catalog's `inspector`
 * host: ids, order and labels all come from the catalog table (adding a
 * surface = one catalog row + one icon above).
 */
export const INSPECTOR_RAIL_ITEMS: InspectorRailItem[] = surfacesWithHost('inspector').map(railItemFor);

/**
 * REQ-169 — the displayed rail list is conditional: once the instance is
 * bootstrapped (first admin registered) the Setup entry has nothing left to
 * offer, so it leaves the rail. The canonical `INSPECTOR_RAIL_ITEMS` table
 * stays complete — pane/tab registration and programmatic access are
 * untouched; this filters the DISPLAY list only. Unknown state counts as
 * not bootstrapped (legacy list) so a loading/failed fetch never hides it.
 */
export function visibleInspectorRailItems(bootstrapped: boolean): InspectorRailItem[] {
  return bootstrapped ? INSPECTOR_RAIL_ITEMS.filter((item) => item.tab !== 'setup') : INSPECTOR_RAIL_ITEMS;
}

/**
 * Which physical side hosts the Inspector rail — always the opposite of
 * the Explorer (REQ-007). Pure helper so the mapping is probe-testable.
 */
export function inspectorRailSide(explorerSide: ExplorerSide): SidebarSide {
  return explorerSide === 'left' ? 'right' : 'left';
}

function InspectorRailButton({
  active,
  label,
  tab,
  Icon,
  indicatorClass,
  onClick,
}: {
  active: boolean;
  label: string;
  tab: InspectorRailTab;
  Icon: typeof Info;
  indicatorClass: string;
  onClick: () => void;
}) {
  // REQ-163/167 — modal entries (Agent Hub and the standalone Archify
  // modal) have no Inspector tab to drop, so they never start a drag and
  // keep a plain tooltip.
  const opensModal = isRailNonPaneTab(tab);
  return (
    <button
      type="button"
      onClick={onClick}
      title={opensModal ? label : `${label} — drag to a pane to open it`}
      aria-label={label}
      aria-pressed={active}
      draggable={!opensModal}
      onDragStart={
        opensModal
          ? undefined
          : (e) => {
              e.dataTransfer.setData(INSPECTOR_DRAG_MIME, encodeInspectorDrag(tab));
              e.dataTransfer.setData('text/plain', label);
              e.dataTransfer.effectAllowed = 'move';
            }
      }
      className={cn(
        'relative grid h-8 w-8 shrink-0 place-items-center rounded-md transition',
        active
          ? 'bg-terracotta/10 text-terracotta'
          : 'text-zinc-500 hover:bg-muted hover:text-ink dark:hover:text-white',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-terracotta transition-opacity',
          indicatorClass,
          active ? 'opacity-100' : 'opacity-0',
        )}
      />
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function InspectorRail({
  active,
  onSelect,
  side,
  bootstrapped = false,
}: {
  active: InspectorTab;
  onSelect: (tab: InspectorRailTab) => void;
  side: SidebarSide;
  /** REQ-169 — hide the Setup entry once the instance is bootstrapped. */
  bootstrapped?: boolean;
}) {
  // Full literal classes — Tailwind v4 never compiles dynamic `border-${x}`.
  const borderClass = side === 'left' ? 'border-r border-line' : 'border-l border-line';
  const indicatorClass = side === 'left' ? 'right-[-6px]' : 'left-[-6px]';
  return (
    <nav
      aria-label="Inspector rail"
      className={cn('hidden w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto bg-card py-2 md:flex', borderClass)}
    >
      {visibleInspectorRailItems(bootstrapped).map(({ tab, label, Icon }) => (
        <InspectorRailButton
          key={tab}
          active={active === tab}
          label={label}
          tab={tab}
          Icon={Icon}
          indicatorClass={indicatorClass}
          onClick={() => onSelect(tab)}
        />
      ))}
    </nav>
  );
}
