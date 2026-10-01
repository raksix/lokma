import { CircleUserRound, Database, FlaskConical, GitBranch, Globe, MessagesSquare, Settings, Terminal } from 'lucide-react';
import { surfacesWithHost, type Surface, type SurfaceId } from '@lokma/shared/surfaces';
import { cn } from '@/lib/utils';
import { INSPECTOR_DRAG_MIME, encodeInspectorDrag, isPaneOnlyTab, type RailDropId } from '@/components/panes/panes';
import type { InspectorTab } from '@/components/providers';
import type { SettingsSectionId } from '@/components/settings/settings';
import type { SidebarSide } from './responsive';

/**
 * ActivityBar — VS Code-style icon rail docked on the Explorer panel's
 * outer edge (REQ-008 + REQ-021: it travels with the Explorer across the
 * REQ-007 swap, exactly like the InspectorRail travels with the
 * Inspector — no rail is ever left stranded next to the other panel).
 * Top: sessions, then git; middle: tiling/inspector pane shortcuts;
 * bottom: settings + account. Purely presentational: the parent owns the
 * active key and maps each click to a sidebar (Explorer vs Inspector +
 * requested Inspector tab). No data layer, lucide icons only.
 *
 * REQ-181 — the three groups are PROJECTIONS of the shared surface catalog
 * (`activity-top` / `activity-pane` / `activity-bottom`): ids, order and
 * labels come from that single table; the icon map below is the only
 * web-side registration.
 */
export type ActivityKey =
  | 'sessions'
  | 'git'
  | 'terminal'
  | 'browser'
  | 'vault'
  | 'testing'
  | 'settings'
  | 'account';

interface ActivityItem {
  key: ActivityKey;
  label: string;
  Icon: typeof MessagesSquare;
}

/**
 * lucide icon per catalog surface id — React components stay in the web
 * layer; the projection below throws when a surface has no icon, so a new
 * catalog row fails loudly instead of silently dropping off the bar.
 */
const ACTIVITY_ICONS: Partial<Record<SurfaceId, typeof MessagesSquare>> = {
  sessions: MessagesSquare,
  git: GitBranch,
  terminal: Terminal,
  browser: Globe,
  vault: Database,
  testing: FlaskConical,
  settings: Settings,
  account: CircleUserRound,
};

/** Project one catalog surface into an activity button (throws when its icon is missing). */
function activityItemFor(surface: Surface): ActivityItem {
  const Icon = ACTIVITY_ICONS[surface.id];
  if (!Icon) {
    throw new Error('activity bar: no icon registered for surface ' + surface.id);
  }
  return { key: surface.id as ActivityKey, label: surface.label, Icon };
}

const TOP_ITEMS: ActivityItem[] = surfacesWithHost('activity-top').map(activityItemFor);

const PANE_ITEMS: ActivityItem[] = surfacesWithHost('activity-pane').map(activityItemFor);

const BOTTOM_ITEMS: ActivityItem[] = surfacesWithHost('activity-bottom').map(activityItemFor);

export const ACTIVITY_ITEMS: ActivityItem[] = [...TOP_ITEMS, ...PANE_ITEMS, ...BOTTOM_ITEMS];

/**
 * Which Inspector tab an activity key opens. `null` = the key lives in
 * the Explorer panel (sessions), not the Inspector.
 *
 * REQ-109 — the returned tab is the DRAG identity for every key (rail
 * drops already land in panes, so the browser drag keeps working); a
 * browser CLICK no longer follows this map, see `activityOpensPaneTab`.
 */
export function activityInspectorTab(key: ActivityKey): InspectorTab | null {
  switch (key) {
    case 'sessions':
      return null;
    case 'git':
      return 'git';
    case 'terminal':
      return 'terminal';
    case 'browser':
      return 'browser';
    case 'vault':
      // REQ-165 — vault left the panes: its icon opens Settings → Vault
      // (see ACTIVITY_MODAL_SECTIONS), never an Inspector tab.
      return null;
    case 'testing':
      return 'testing';
    case 'settings':
      return 'settings';
    case 'account':
      // REQ-072: account opens the Settings modal (Account section), never
      // an Inspector tab — null keeps the drag fallback on sessions.
      return null;
  }
}

/**
 * What an activity-icon drag carries (REQ-026): the mapped Inspector tab —
 * or 'sessions' for the Explorer sessions list, whose drop opens the pane
 * tab picker (the live sessions + tools chooser). Pure so probes cover it.
 *
 * REQ-109 — the browser drag id stays 'browser' (drops open a pane tab,
 * exactly where clicks go now), so this mapper is unchanged for clicks
 * that `activityOpensPaneTab` intercepts.
 */
export function activityDragId(key: ActivityKey): RailDropId {
  return activityInspectorTab(key) ?? 'sessions';
}

/**
 * REQ-109 — activity keys whose CLICK always opens a tiling pane tab,
 * never the sidebar Inspector (mirrors `isPaneOnlyTab` in panes.ts —
 * the single source; this wrapper keeps the shell barrel typed on
 * `ActivityKey`). Drags are unaffected (see `activityDragId`).
 */
export function activityOpensPaneTab(key: ActivityKey): boolean {
  return isPaneOnlyTab(key);
}

/**
 * REQ-165 — activity keys that open the Settings modal on a section instead
 * of an Inspector tab (Vault left the panes, same wave as the rail). The
 * icon stays visible; it no longer drags, because a modal surface has no
 * pane drop target.
 * REQ-181 — projected from the catalog: the pane-group activity hosts
 * whose `opens` is a settings-section.
 */
export type ActivityModalKey = 'vault';

export const ACTIVITY_MODAL_SECTIONS: Record<ActivityModalKey, SettingsSectionId> = Object.fromEntries(
  surfacesWithHost('activity-pane')
    .filter(
      (surface): surface is Surface & { section: SettingsSectionId } =>
        surface.opens === 'settings-section' && surface.section !== undefined,
    )
    .map((surface) => [surface.id, surface.section] as const),
) as Record<ActivityModalKey, SettingsSectionId>;

/** True when this activity entry opens the Settings modal, never a pane/tab. */
export function isActivityModalKey(key: ActivityKey): key is ActivityModalKey {
  return key in ACTIVITY_MODAL_SECTIONS;
}

function ActivityButton({
  active,
  label,
  dragId,
  Icon,
  indicatorClass,
  onClick,
  opensModal = false,
}: {
  active: boolean;
  label: string;
  dragId: RailDropId;
  Icon: typeof MessagesSquare;
  indicatorClass: string;
  onClick: () => void;
  /** REQ-165 — modal entries (Vault) never drag: no pane drop target exists. */
  opensModal?: boolean;
}) {
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
              e.dataTransfer.setData(INSPECTOR_DRAG_MIME, encodeInspectorDrag(dragId));
              e.dataTransfer.setData('text/plain', label);
              e.dataTransfer.effectAllowed = 'move';
            }
      }
      className={cn(
        'relative grid h-8 w-8 place-items-center rounded-md transition',
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

export function ActivityBar({
  active,
  onSelect,
  side,
}: {
  active: ActivityKey;
  onSelect: (key: ActivityKey) => void;
  side: SidebarSide;
}) {
  // Full literal classes — Tailwind v4 never compiles dynamic `border-${x}`.
  const borderClass = side === 'left' ? 'border-r border-line' : 'border-l border-line';
  const indicatorClass = side === 'left' ? 'right-[-6px]' : 'left-[-6px]';
  return (
    <nav
      aria-label="Activity bar"
      className={cn(
        'hidden w-11 shrink-0 flex-col items-center gap-0.5 overflow-y-auto bg-card py-2 md:flex',
        borderClass,
      )}
    >
      {TOP_ITEMS.map(({ key, label, Icon }) => (
        <ActivityButton key={key} active={active === key} label={label} dragId={activityDragId(key)} Icon={Icon} indicatorClass={indicatorClass} opensModal={isActivityModalKey(key)} onClick={() => onSelect(key)} />
      ))}
      <span aria-hidden="true" className="my-1.5 h-px w-6 shrink-0 bg-line" />
      {PANE_ITEMS.map(({ key, label, Icon }) => (
        <ActivityButton key={key} active={active === key} label={label} dragId={activityDragId(key)} Icon={Icon} indicatorClass={indicatorClass} opensModal={isActivityModalKey(key)} onClick={() => onSelect(key)} />
      ))}
      <span className="flex-1" />
      {BOTTOM_ITEMS.map(({ key, label, Icon }) => (
        <ActivityButton key={key} active={active === key} label={label} dragId={activityDragId(key)} Icon={Icon} indicatorClass={indicatorClass} opensModal={isActivityModalKey(key)} onClick={() => onSelect(key)} />
      ))}
    </nav>
  );
}
