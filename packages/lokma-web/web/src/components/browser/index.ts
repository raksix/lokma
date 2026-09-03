/**
 * Browser components barrel — single import point for the W3-12 pane.
 */
export { BrowserPane } from './browser-pane';
export {
  BROWSER_BLANK_URL,
  BROWSER_URL_CAP,
  canGoBack,
  canGoForward,
  groupByAgent,
  historyPosition,
  shortScope,
  tabLabel,
  validateTabUrl,
} from './browser';
export type { AgentTabGroup } from './browser';
