/**
 * Responsive-shell helpers (pure, DOM-free — safe to probe with bun).
 *
 * The harness frame is a three-column desktop layout (Inspector | chat |
 * Explorer). Below MOBILE_BREAKPOINT the sidebars stop squeezing the chat
 * and become exclusive slide-over drawers instead (see `useIsMobile` and
 * `AppShell`). All width thresholds live here so the hook, the shell, and
 * the tests share one source of truth.
 *
 * REQ-007: the two side panels are swappable via the header swap button —
 * `ExplorerSide` below is the single source of truth for which physical
 * side hosts the Explorer.
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

/**
 * REQ-007 sidebar swap — which physical side hosts the Explorer panel.
 * The header's swap button flips this; every toggle title, drawer label
 * and `[`/`]` shortcut description follows it (never hardcode
 * "left = Inspector" / "right = Explorer" in UI copy).
 */
export type ExplorerSide = 'left' | 'right';

/** localStorage key persisting the REQ-007 swap across reloads. */
export const EXPLORER_SIDE_KEY = 'lokma-explorer-side';

/** Read the persisted Explorer side (guarded — defaults to `right`). */
export function readExplorerSide(): ExplorerSide {
  try {
    if (typeof localStorage === 'undefined') return 'right';
    return localStorage.getItem(EXPLORER_SIDE_KEY) === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
}

/** Persist the Explorer side (guarded — a failed write keeps the tab state). */
export function writeExplorerSide(side: ExplorerSide): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(EXPLORER_SIDE_KEY, side);
  } catch {
    // Persistence is best-effort; the in-memory state still applies.
  }
}

/** Flip the Explorer to the opposite physical side. */
export function swappedExplorerSide(side: ExplorerSide): ExplorerSide {
  return side === 'left' ? 'right' : 'left';
}

/** Panel hosted on a physical side given the swap state. */
export function sidebarPanelTitle(side: SidebarSide, explorerSide: ExplorerSide): 'Explorer' | 'Inspector' {
  return side === explorerSide ? 'Explorer' : 'Inspector';
}

/** Header toggle-button label for a physical side, e.g. `Toggle Explorer ([)`. */
export function sidebarToggleTitle(side: SidebarSide, explorerSide: ExplorerSide): string {
  const key = side === 'left' ? '[' : ']';
  return `Toggle ${sidebarPanelTitle(side, explorerSide)} (${key})`;
}

/**
 * REQ-024 mobile single-view — the phone experience is a separate simple
 * mode: every feature stays reachable but the tiling/windowed pane system
 * never opens. One surface at a time, switched by a bottom tab bar
 * (see `MobileSingleView`); the desktop drawers evolve into these tabs.
 */

/** Single-view surfaces reachable on a mobile viewport (no pane system). */
export type MobileTab = 'chat' | 'sessions' | 'files' | 'tools';

/** Bottom-tab order for the mobile single view (stable, probe-tested). */
export const MOBILE_TABS: MobileTab[] = ['chat', 'sessions', 'files', 'tools'];

/** Short bottom-tab label for a mobile surface. */
export function mobileTabLabel(tab: MobileTab): string {
  switch (tab) {
    case 'chat':
      return 'Chat';
    case 'sessions':
      return 'Sessions';
    case 'files':
      return 'Files';
    case 'tools':
      return 'Tools';
  }
}

/**
 * Pane-system entry is desktop-only: tiling splits, floating windows and
 * session/file drag-drop never open on a mobile viewport. Callers gate
 * `setTiling(true)` / `requestFileTab` / `requestSessionTab` on this.
 */
export function isPaneSystemAllowed(isMobile: boolean): boolean {
  return !isMobile;
}

/**
 * Live viewport probe for event handlers that cannot use the
 * `useIsMobile` hook (`usePaneStore.getState()` call sites in the file
 * browser and the session list). DOM-guarded — false without a browser.
 */
export function isMobileViewport(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(mobileQuery(breakpoint)).matches;
  } catch {
    return false;
  }
}
