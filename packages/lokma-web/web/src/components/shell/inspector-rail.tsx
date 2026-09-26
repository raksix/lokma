import { Activity, BarChart3, Beaker, Brain, Clock3, Cpu, Folder, FolderOpen, GitBranch, Globe, HardDrive, Info, Layers, ListTodo, Package, Paintbrush, Plug2, Puzzle, Settings, Star, Terminal, Users, Workflow } from 'lucide-react';
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
 */
/**
 * REQ-163 — rail entries that open a Settings modal SECTION instead of an
 * Inspector tab (Agent Hub moved out of the panes). One map, one truth: the
 * rail renders these without a drag, the desktop rail click opens the modal
 * on the mapped section, and the mobile tools strip routes the same way.
 * REQ-164 — Orchestration joined the map (same wave). REQ-165 — Vault and
 * Memory followed (their icons stay, their pane/tab definitions are gone).
 * REQ-166 — Skills followed last (same wave: icon stays, pane definitions gone).
 */
export const RAIL_MODAL_SECTIONS: Record<
  'agents' | 'orchestration' | 'vault' | 'memory' | 'skills',
  SettingsSectionId
> = {
  agents: 'agents',
  orchestration: 'orchestration',
  vault: 'vault',
  memory: 'memory',
  skills: 'skills',
};

/** Rail tabs that launch the Settings modal instead of a pane (REQ-163). */
export type RailModalTab = keyof typeof RAIL_MODAL_SECTIONS;

export type InspectorRailTab = InspectorTab | RailModalTab;

/** True when this rail entry opens the Settings modal, never a pane/tab. */
export function isRailModalTab(tab: InspectorRailTab): tab is RailModalTab {
  return tab in RAIL_MODAL_SECTIONS;
}

interface InspectorRailItem {
  tab: InspectorRailTab;
  label: string;
  Icon: typeof Info;
}

export const INSPECTOR_RAIL_ITEMS: InspectorRailItem[] = [
  // REQ-043 — Files first (VS Code Explorer position): its page shows
  // ONLY files, separate from every other Inspector tab.
  { tab: 'files', label: 'Files', Icon: FolderOpen },
  { tab: 'providers', label: 'Providers', Icon: Plug2 },
  { tab: 'models', label: 'Models', Icon: Layers },
  { tab: 'usage', label: 'Usage', Icon: BarChart3 },
  { tab: 'settings', label: 'Settings', Icon: Settings },
  { tab: 'terminal', label: 'Terminal', Icon: Terminal },
  { tab: 'git', label: 'Git', Icon: GitBranch },
  { tab: 'browser', label: 'Browser', Icon: Globe },
  { tab: 'agents', label: 'Agents', Icon: Users },
  { tab: 'orchestration', label: 'Orchestration', Icon: Cpu },
  { tab: 'vault', label: 'Vault', Icon: Folder },
  { tab: 'skills', label: 'Skills', Icon: Puzzle },
  { tab: 'archify', label: 'Archify', Icon: Workflow },
  { tab: 'design', label: 'Design', Icon: Paintbrush },
  { tab: 'testing', label: 'Testing', Icon: Beaker },
  { tab: 'setup', label: 'Setup', Icon: HardDrive },
  { tab: 'plugins', label: 'Plugins', Icon: Package },
  { tab: 'observability', label: 'Observability', Icon: Activity },
  { tab: 'cron', label: 'Cron', Icon: Clock3 },
  { tab: 'extras', label: 'Extras', Icon: Star },
  { tab: 'memory', label: 'Memory', Icon: Brain },
  { tab: 'todos', label: 'Todos', Icon: ListTodo },
];

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
  // REQ-163 — modal entries (Agent Hub) have no Inspector tab to drop, so
  // they never start a drag and keep a plain tooltip.
  const opensModal = isRailModalTab(tab);
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
}: {
  active: InspectorTab;
  onSelect: (tab: InspectorRailTab) => void;
  side: SidebarSide;
}) {
  // Full literal classes — Tailwind v4 never compiles dynamic `border-${x}`.
  const borderClass = side === 'left' ? 'border-r border-line' : 'border-l border-line';
  const indicatorClass = side === 'left' ? 'right-[-6px]' : 'left-[-6px]';
  return (
    <nav
      aria-label="Inspector rail"
      className={cn('hidden w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto bg-card py-2 md:flex', borderClass)}
    >
      {INSPECTOR_RAIL_ITEMS.map(({ tab, label, Icon }) => (
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
