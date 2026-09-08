import * as React from 'react';
import { cn } from '@/lib/utils';

export type MenuIcon = React.ComponentType<{ className?: string }>;

export type ContextMenuEntry =
  | { type: 'header'; label: string }
  | { type: 'separator' }
  | {
      type: 'item';
      label: string;
      icon?: MenuIcon;
      danger?: boolean;
      disabled?: boolean;
      hint?: string;
      onSelect: () => void;
    };

/**
 * ContextMenu — one shared right-click menu primitive (REQ-056).
 * Fixed-position at the cursor with viewport clamping, closes on
 * outside mousedown / Escape / any scroll capture. Every hub surface
 * (sessions, files, pane tabs, agents, bots, terminals, providers)
 * renders its own entries through this component instead of ad-hoc
 * absolutely-positioned divs, so behavior and styling stay identical.
 */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
  label,
}: {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
  label: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number }>(() => ({
    left: typeof window === 'undefined' ? x : Math.max(4, Math.min(x, window.innerWidth - 224)),
    top: typeof window === 'undefined' ? y : Math.max(4, Math.min(y, window.innerHeight - 200)),
  }));

  // Re-clamp once mounted so the real menu box (not the estimate)
  // decides the final position.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(4, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y]);

  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[100] w-52 overflow-hidden rounded-md border border-line bg-white py-1 shadow-lg dark:bg-[#1E1E21]"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((entry, i) => {
        if (entry.type === 'header') {
          return (
            <div
              key={`h-${i}`}
              className="truncate px-2.5 py-1.5 text-[11px] text-zinc-500 dark:text-zinc-400"
              title={entry.label}
            >
              {entry.label}
            </div>
          );
        }
        if (entry.type === 'separator') {
          return <div key={`s-${i}`} className="my-1 border-t border-line/60" />;
        }
        const Icon = entry.icon;
        return (
          <button
            key={`i-${i}`}
            role="menuitem"
            disabled={entry.disabled}
            title={entry.hint ?? entry.label}
            className={cn(
              'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-40',
              entry.danger
                ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40'
                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
            )}
            onClick={() => {
              onClose();
              entry.onSelect();
            }}
          >
            {Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
            <span className="flex-1 truncate">{entry.label}</span>
            {entry.hint ? <span className="shrink-0 text-[10px] text-zinc-400">{entry.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * useContextMenu — cursor-anchored open/close state for one surface.
 * Usage: `const ctx = useContextMenu<string>();` then
 * `onContextMenu={(e) => ctx.open(e, rowId)}` and render
 * `{ctx.menu ? <ContextMenu x={ctx.menu.x} ... /> : null}`.
 */
export function useContextMenu<K>() {
  const [menu, setMenu] = React.useState<{ x: number; y: number; key: K } | null>(null);
  const open = React.useCallback((e: React.MouseEvent, key: K) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, key });
  }, []);
  const close = React.useCallback(() => setMenu(null), []);
  return { menu, open, close };
}
