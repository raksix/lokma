/**
 * Shell chrome barrel — single import point for the harness frame
 * (header helpers, toast bus, search, footer, error boundary, banner).
 */
export { FooterBar } from './footer-bar';
export { OfflineBanner } from './offline-banner';
export { PaneErrorBoundary } from './pane-error-boundary';
export { SearchModal, filterNoteHits, filterSessionHits, type NoteHit } from './search-modal';
export { ToastHost, TOAST_EVENT, emitToast } from './toast';
export { applyTheme, getTheme, toggleTheme, type ShellTheme } from './theme';
