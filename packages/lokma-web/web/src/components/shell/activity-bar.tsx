import { Bot, CircleUserRound, Database, FlaskConical, GitBranch, Globe, MessagesSquare, Settings, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InspectorTab } from '@/components/providers';

/**
 * ActivityBar — VS Code-style icon rail docked at the far right edge.
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
      return 'auth';
  }
}

function ActivityButton({
  active,
  label,
  Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  Icon: typeof MessagesSquare;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'relative grid h-9 w-9 place-items-center rounded-md transition',
        active
          ? 'bg-terracotta/10 text-terracotta'
          : 'text-zinc-500 hover:bg-muted hover:text-ink dark:hover:text-white',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-terracotta transition-opacity',
          'left-[-6px]',
          active ? 'opacity-100' : 'opacity-0',
        )}
      />
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

export function ActivityBar({ active, onSelect }: { active: ActivityKey; onSelect: (key: ActivityKey) => void }) {
  return (
    <nav
      aria-label="Activity bar"
      className="hidden w-12 shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-l border-line bg-card py-2 md:flex"
    >
      {TOP_ITEMS.map(({ key, label, Icon }) => (
        <ActivityButton key={key} active={active === key} label={label} Icon={Icon} onClick={() => onSelect(key)} />
      ))}
      <span aria-hidden="true" className="my-1.5 h-px w-6 shrink-0 bg-line" />
      {PANE_ITEMS.map(({ key, label, Icon }) => (
        <ActivityButton key={key} active={active === key} label={label} Icon={Icon} onClick={() => onSelect(key)} />
      ))}
      <span className="flex-1" />
      {BOTTOM_ITEMS.map(({ key, label, Icon }) => (
        <ActivityButton key={key} active={active === key} label={label} Icon={Icon} onClick={() => onSelect(key)} />
      ))}
    </nav>
  );
}
