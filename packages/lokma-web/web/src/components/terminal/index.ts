/**
 * Terminal components barrel — single import point for the W3-10 pane.
 */
export { TerminalPane } from './terminal-pane';
export {
  TERMINAL_BUFFER_CAP,
  appendCapped,
  copyText,
  exitSummary,
  filterLines,
  statusLabel,
  stripAnsi,
  terminalLabel,
} from './terminal';
