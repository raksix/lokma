/**
 * Terminal components barrel — single import point for the W3-10 pane.
 */
export { TerminalPane } from './terminal-pane';
export {
  FRAME_DEDUPE_MS,
  TERMINAL_BUFFER_CAP,
  appendCapped,
  connectionNotice,
  exitSummary,
  isRecentDuplicate,
  resolveTerminalCwd,
  shouldSendResize,
} from './terminal';
