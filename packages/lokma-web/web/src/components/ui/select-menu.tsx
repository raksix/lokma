import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * SelectMenu (REQ-179) — the harness' own dropdown primitive, standing in for
 * native `<select>` controls. Native selects paint the operating system's blue
 * highlight and cannot speak the cream/terracotta language (dark theme
 * included), so the Design composer and its artboard strip use this component:
 * a real button trigger plus a listbox popup with full keyboard support and
 * aria wiring.
 *
 * Contract:
 * - Controlled: value + onChange.
 * - `options` render first, then `groups` (labelled sections, e.g. providers).
 * - `triggerAttrs` carries the caller's data-* hooks onto the trigger button;
 *   `data-select-value` always mirrors the current value for probes.
 * - Keyboard: Enter/Space/Arrow opens, Arrow/Home/End move, Enter/Space
 *   commits, Escape closes back to the trigger, Tab closes and moves on.
 * - Focus stays visible: the trigger ring plus the active-row highlight are
 *   the affordances (the listbox element itself holds focus).
 */

export type SelectMenuOption = { value: string; label: string };
export type SelectMenuGroup = { label: string; options: SelectMenuOption[] };

export type SelectMenuProps = {
  value: string;
  onChange: (value: string) => void;
  options?: SelectMenuOption[];
  groups?: SelectMenuGroup[];
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  size?: 'xs' | 'sm';
  align?: 'start' | 'end';
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  triggerAttrs?: Record<string, string>;
  /** REQ-191 — opt-in filter box above the rows (long catalogs). Off by default,
   * so every existing caller's popup and keyboard flow is untouched. */
  searchable?: boolean;
  searchPlaceholder?: string;
};

type Entry =
  | { kind: 'option'; option: SelectMenuOption; index: number }
  | { kind: 'header'; label: string };

export function SelectMenu({
  value,
  onChange,
  options = [],
  groups = [],
  label,
  ariaLabel,
  disabled = false,
  size = 'sm',
  align = 'start',
  className,
  triggerClassName,
  menuClassName,
  triggerAttrs,
  searchable = false,
  searchPlaceholder = 'Search',
}: SelectMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [query, setQuery] = React.useState('');
  const uid = React.useId();
  const listId = uid + '-listbox';
  const triggerId = uid + '-trigger';
  const listRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  // REQ-191 — the filter narrows BOTH the flat options and the group bodies,
  // and an emptied group header disappears instead of printing an empty section.
  const needle = query.trim().toLowerCase();
  const matches = (option: SelectMenuOption) =>
    needle === '' ||
    option.label.toLowerCase().includes(needle) ||
    option.value.toLowerCase().includes(needle);
  const flatOptions = React.useMemo(() => options.filter(matches), [options, needle]);
  const shownGroups = React.useMemo(
    () =>
      groups
        .map((group) => ({ label: group.label, options: group.options.filter(matches) }))
        .filter((group) => group.options.length > 0),
    [groups, needle],
  );

  const all = React.useMemo(
    () => [...flatOptions, ...shownGroups.flatMap((group) => group.options)],
    [flatOptions, shownGroups],
  );
  const selectedIndex = all.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? all[selectedIndex] : undefined;
  const display = selected ? selected.label : value || '—';

  const entries = React.useMemo(() => {
    const out: Entry[] = [];
    let index = 0;
    for (const option of flatOptions) out.push({ kind: 'option', option, index: index++ });
    for (const group of shownGroups) {
      out.push({ kind: 'header', label: group.label });
      for (const option of group.options) out.push({ kind: 'option', option, index: index++ });
    }
    return out;
  }, [flatOptions, shownGroups]);

  const closeMenu = React.useCallback((refocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (refocus && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const openMenu = React.useCallback(() => {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [disabled, selectedIndex]);

  const commit = React.useCallback(
    (index: number) => {
      const option = all[index];
      if (!option) return;
      onChange(option.value);
      closeMenu(true);
    },
    [all, onChange, closeMenu],
  );

  // The popup owns keyboard focus while open (standard listbox pattern).
  const searchRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!open) return;
    if (searchable) searchRef.current?.focus();
    else listRef.current?.focus();
  }, [open, searchable]);

  // REQ-191 — a NEW filter starts at the top row; opening the menu must NOT be
  // undone by this, so it keys on the needle changing, not on `open`.
  const lastNeedle = React.useRef('');
  React.useEffect(() => {
    if (lastNeedle.current === needle) return;
    lastNeedle.current = needle;
    setActive(0);
  }, [needle]);

  // Keep the highlighted row inside the scroll viewport.
  React.useEffect(() => {
    if (!open) return;
    const el = document.getElementById(listId + '-opt-' + active);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, active, listId]);

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) openMenu();
    }
  };

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, all.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(all.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      commit(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === 'Tab') {
      closeMenu(false);
    }
  };

  return (
    <div className={cn('relative', className)}>
      {label ? (
        <label
          htmlFor={triggerId}
          className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
        >
          {label}
        </label>
      ) : null}
      <button
        {...triggerAttrs}
        ref={triggerRef}
        id={triggerId}
        type="button"
        data-select-trigger
        data-select-value={value}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel ?? (label ? undefined : 'Select')}
        disabled={disabled}
        title={selected ? selected.label : undefined}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md border border-line bg-white text-left text-ink transition-colors focus-visible:ring-2 focus-visible:ring-terracotta/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#0F0F11] dark:text-white',
          size === 'xs' ? 'h-6 px-1.5 text-[10px]' : 'h-7 px-2 text-[11px]',
          open
            ? 'border-terracotta/50 ring-1 ring-terracotta/30'
            : 'hover:border-zinc-300 dark:hover:border-zinc-600',
          triggerClassName,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{display}</span>
        <ChevronDown
          className={cn(
            'h-3 w-3 shrink-0 text-zinc-500 transition-transform dark:text-zinc-400',
            open && 'rotate-180',
          )}
        />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => closeMenu(true)} aria-hidden="true" />
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel ?? label ?? 'Options'}
            tabIndex={-1}
            data-select-menu
            data-select-menu-open=""
            onKeyDown={onListKeyDown}
            className={cn(
              'absolute z-50 mt-1 max-h-[260px] w-full min-w-[11rem] overflow-y-auto rounded-xl border border-line bg-white p-0.5 shadow-2xl focus-visible:outline-none dark:border-[#2A2A2E] dark:bg-[#111113]',
              align === 'end' ? 'right-0' : 'left-0',
              menuClassName,
            )}
          >
            {searchable ? (
              <div className="sticky top-0 z-10 bg-white px-1 pb-1 dark:bg-[#111113]">
                <input
                  ref={searchRef}
                  type="text"
                  data-select-search=""
                  value={query}
                  placeholder={searchPlaceholder}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    // The box owns typing. Every key stops here: WITHOUT this a
                    // Space/Enter bubbles to the listbox handler below, which
                    // COMMITs the highlighted row and closes the menu — the
                    // measured symptom was "typing a space picks a system".
                    event.stopPropagation();
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      closeMenu(true);
                    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                      event.preventDefault();
                      listRef.current?.focus();
                    }
                  }}
                  className="h-6 w-full rounded-md border border-line bg-white px-1.5 text-[11px] text-ink placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-terracotta/50 focus-visible:outline-none dark:bg-[#0F0F11] dark:text-white dark:placeholder:text-zinc-500"
                />
              </div>
            ) : null}
            {entries.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
                No matches
              </div>
            ) : null}
            {entries.map((entry) =>
              entry.kind === 'header' ? (
                <div
                  key={'header-' + entry.label}
                  data-select-group={entry.label}
                  role="presentation"
                  className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-widest text-zinc-500 uppercase dark:text-zinc-400"
                >
                  {entry.label}
                </div>
              ) : (
                <button
                  key={'option-' + entry.index}
                  id={listId + '-opt-' + entry.index}
                  type="button"
                  role="option"
                  aria-selected={entry.option.value === value}
                  data-select-option={entry.option.value}
                  title={entry.option.label}
                  onMouseEnter={() => setActive(entry.index)}
                  onClick={() => commit(entry.index)}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11.5px] leading-5 text-ink hover:bg-muted dark:text-white dark:hover:bg-white/10',
                    active === entry.index && 'bg-muted dark:bg-white/10',
                    entry.option.value === value && 'font-medium',
                  )}
                >
                  <span className="flex w-3 shrink-0 justify-center">
                    {entry.option.value === value ? <Check className="h-3 w-3 text-terracotta" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{entry.option.label}</span>
                </button>
              ),
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
