import * as React from 'react';

/**
 * use-focus-trap — shared keyboard containment for every modal overlay.
 *
 * While `open`, the hook:
 *  - moves focus into the panel (the `[data-autofocus]` element when one
 *    is marked, otherwise the first tabbable control),
 *  - wraps Tab / Shift+Tab around the panel's tabbable controls so focus
 *    can never leak to the page behind the overlay,
 *  - closes on Escape (capture phase + stopPropagation, so the AppShell
 *    global Escape handler does not double-fire),
 *  - restores focus to whatever held it before the overlay opened.
 *
 * `nextTrapIndex()` is the DOM-free core of the wrap math so probes can
 * exercise it under bun without a browser.
 */

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Wrap-around step for a Tab press inside a trapped panel (pure, unit-tested). */
export function nextTrapIndex(current: number, total: number, shiftKey: boolean): number {
  if (total <= 0) return 0;
  if (shiftKey) return (current - 1 + total) % total;
  return (current + 1) % total;
}

/** Live tabbable controls inside a panel, in DOM order. */
export function collectFocusable(panel: ParentNode): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export function useFocusTrap(
  open: boolean,
  panelRef: React.RefObject<HTMLElement | null>,
  opts?: { onEscape?: () => void },
): void {
  const onEscapeRef = React.useRef(opts?.onEscape);
  onEscapeRef.current = opts?.onEscape;

  React.useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previouslyFocused =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // Move focus inside: explicit mark wins, else first tabbable control.
    const marked = panel.querySelector<HTMLElement>('[data-autofocus]');
    const first = collectFocusable(panel)[0];
    (marked ?? first)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = collectFocusable(panel);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const current = items.indexOf(active as HTMLElement);
      // Focus outside the panel (or on no control) — pin to the edge in
      // the tab direction instead of letting it escape.
      if (current === -1) {
        e.preventDefault();
        (e.shiftKey ? items[items.length - 1] : items[0]).focus();
        return;
      }
      e.preventDefault();
      items[nextTrapIndex(current, items.length, e.shiftKey)].focus();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previouslyFocused?.focus();
    };
  }, [open, panelRef]);
}
