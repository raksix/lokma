import { Bot, CircleUserRound, Database, FlaskConical, GitBranch, Globe, MessagesSquare, Settings, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { INSPECTOR_DRAG_MIME, encodeInspectorDrag, type RailDropId } from '@/components/panes/panes';
import type { InspectorTab } from '@/components/providers';
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
 */
export type ActivityKey =
  | 'sessions'
  | 'git'
  | 'terminal'
  | 'browser'
  | 'vault'
  | 'testing'
  | 'bots'
  | 'settings'
  | 'account';

interface ActivityItem {
  key: ActivityKey;
  label: string;
  Icon: typeof MessagesSquare;
}

const TOP_ITEMS: ActivityItem[] = [
  { key: 'sessions', label: 'Sessions', Icon: MessagesSquare },
  { key: 'git', label: 'Git', Icon: GitBranch },
];

const PANE_ITEMS: ActivityItem[] = [
  { key: 'terminal', label: 'Terminal', Icon: Terminal },
  { key: 'browser', label: 'Browser', Icon: Globe },
  { key: 'vault', label: 'Vault', Icon: Database },
  { key: 'testing', label: 'Testing Lab', Icon: FlaskConical },
  { key: 'bots', label: 'Bots', Icon: Bot },
];

const BOTTOM_ITEMS: ActivityItem[] = [
  { key: 'settings', label: 'Settings', Icon: Settings },
  { key: 'account', label: 'Account', Icon: CircleUserRound },
];

export const ACTIVITY_ITEMS: ActivityItem[] = [...TOP_ITEMS, ...PANE_ITEMS, ...BOTTOM_ITEMS];

/**
 * Which Inspector tab an activity key opens. `null` = the key lives in
 * the Explorer panel (sessions), not the Inspector.
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
      return 'vault';
    case 'testing':
      return 'testing';
    case 'bots':
      return 'bots';
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
 */
export function activityDragId(key: ActivityKey): RailDropId {
  return activityInspectorTab(key) ?? 'sessions';
}

function ActivityButton({
  active,
  label,
  dragId,
  Icon,
  indicatorClass,
  onClick,
}: {
  active: boolean;
  label: string;
  dragId: RailDropId;
  Icon: typeof MessagesSquare;
  indicatorClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} — drag to a pane to open it`}
      aria-label={label}
      aria-pressed={active}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(INSPECTOR_DRAG_MIME, encodeInspectorDrag(dragId));
        e.dataTransfer.setData('text/plain', label);
        e.dataTransfer.effectAllowed = 'move';
      }}
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
        <ActivityButton key={key} active={active === key} label={label} dragId={activityDragId(key)} Icon={Icon} indicatorClass={indicatorClass} onClick={() => onSelect(key)} />
      ))}
      <span aria-hidden="true" className="my-1.5 h-px w-6 shrink-0 bg-line" />
      {PANE_ITEMS.map(({ key, label, Icon }) => (
        <ActivityButton key={key} active={active === key} label={label} dragId={activityDragId(key)} Icon={Icon} indicatorClass={indicatorClass} onClick={() => onSelect(key)} />
      ))}
      <span className="flex-1" />
      {BOTTOM_ITEMS.map(({ key, label, Icon }) => (
        <ActivityButton key={key} active={active === key} label={label} dragId={activityDragId(key)} Icon={Icon} indicatorClass={indicatorClass} onClick={() => onSelect(key)} />
      ))}
    </nav>
  );
}
