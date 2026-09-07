/**
 * Shell chrome barrel — single import point for the harness frame
 * (header helpers, toast bus, search, footer, error boundary, banner).
 */
export { FooterBar } from './footer-bar';
export {
  ACTIVITY_ITEMS,
  ActivityBar,
  activityInspectorTab,
  type ActivityKey,
} from './activity-bar';
export { OfflineBanner } from './offline-banner';
export { PaneErrorBoundary } from './pane-error-boundary';
export {
  EXPLORER_SIDE_KEY,
  MOBILE_BREAKPOINT,
  anyDrawerOpen,
  closeAllSidebars,
  initialSidebarVisibility,
  isMobileWidth,
  mobileQuery,
  nextSidebarVisibility,
  readExplorerSide,
  sidebarPanelTitle,
  sidebarToggleTitle,
  swappedExplorerSide,
  writeExplorerSide,
  type ExplorerSide,
  type SidebarSide,
  type SidebarVisibility,
} from './responsive';
export { useIsMobile } from './use-is-mobile';
export { SearchModal, filterNoteHits, filterSessionHits, type NoteHit } from './search-modal';
export { ToastHost, TOAST_EVENT, emitToast } from './toast';
export {
  SHORTCUTS,
  SHOW_SHORTCUTS_EVENT,
  isEditableTarget,
  requestShortcutsDialog,
  resolveShortcuts,
  type ShortcutDef,
} from './shortcuts';
export { ShortcutsDialog } from './shortcuts-dialog';
export { prefersReducedMotion, usePrefersReducedMotion } from './use-prefers-reduced-motion';
export { FOCUSABLE_SELECTOR, collectFocusable, nextTrapIndex, useFocusTrap } from './use-focus-trap';
export { applyTheme, applyThemeVars, clearThemeVars, getTheme, subscribeTheme, toggleTheme, THEME_EVENT, type ShellTheme } from './theme';
