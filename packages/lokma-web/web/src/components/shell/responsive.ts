/**
 * Responsive-shell helpers (pure, DOM-free — safe to probe with bun).
 *
 * The harness frame is a three-column desktop layout (Explorer | chat |
 * Inspector). Below MOBILE_BREAKPOINT the sidebars stop squeezing the chat
 * and become exclusive slide-over drawers instead (see `useIsMobile` and
 * `AppShell`). All width thresholds live here so the hook, the shell, and
 * the tests share one source of truth.
 */

/** Viewport widths strictly below this value count as mobile (Tailwind `md`). */
export const MOBILE_BREAKPOINT = 768;

export type SidebarSide = 'left' | 'right';

export interface SidebarVisibility {
  left: boolean;
  right: boolean;
}

/** True when the given viewport width should use the mobile drawer layout. */
export function isMobileWidth(width: number): boolean {
  return Number.isFinite(width) && width < MOBILE_BREAKPOINT;
}

/** Shared `(max-width: …)` query string for `matchMedia` (hook + boot state). */
export function mobileQuery(breakpoint: number = MOBILE_BREAKPOINT): string {
  return `(max-width: ${breakpoint - 1}px)`;
}

/**
 * Initial sidebar state: desktop opens both panels, mobile starts with a
 * full-width chat (drawers open on demand so first paint is usable).
 */
export function initialSidebarVisibility(isMobile: boolean): SidebarVisibility {
  return isMobile ? { left: false, right: false } : { left: true, right: true };
}

/**
 * Next state after toggling one sidebar. On mobile the drawers are
 * exclusive — opening one closes the other so they never stack.
 * On desktop both panels toggle independently.
 */
export function nextSidebarVisibility(
  current: SidebarVisibility,
  side: SidebarSide,
  isMobile: boolean,
): SidebarVisibility {
  if (!isMobile) {
    return side === 'left'
      ? { ...current, left: !current.left }
      : { ...current, right: !current.right };
  }
  if (side === 'left') {
    return current.left ? { ...current, left: false } : { left: true, right: false };
  }
  return current.right ? { ...current, right: false } : { left: false, right: true };
}

/** Close both sidebars (drawer dismiss: backdrop click, Escape, navigation). */
export function closeAllSidebars(current: SidebarVisibility): SidebarVisibility {
  return { ...current, left: false, right: false };
}

/** True when at least one drawer is open on a mobile viewport. */
export function anyDrawerOpen(visibility: SidebarVisibility, isMobile: boolean): boolean {
  return isMobile && (visibility.left || visibility.right);
}
