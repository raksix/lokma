/**
 * Settings barrel — Config / Appearance / Permissions / MCP tabs (W2-8).
 * Real `GET/PATCH /api/config` panes; no mock data (see Docs/38 W2-8).
 */
export { SettingsPane } from './settings-pane';
export { ConfigPane } from './config-pane';
export { AppearancePane } from './appearance-pane';
export { PermissionsPane } from './permissions-pane';
export { McpPane } from './mcp-pane';
export {
  buildHooksPatch,
  buildMcpPatch,
  buildPermissionsPatch,
  flattenHooks,
  isMcpTransport,
  isPermissionMode,
  isServerTheme,
  isValidMcpName,
  isValidRule,
  normalizeConfig,
  normalizeMcpEntry,
  normalizeMcpServers,
  serverThemeToMode,
  validateMcpForm,
  MCP_TRANSPORTS,
  PERMISSION_MODES,
  SERVER_THEMES,
  THEME_CARDS,
  type HookRow,
  type McpEntry,
  type McpTransport,
  type NormalizedConfig,
  type PermissionMode,
  type ServerTheme,
  type WebMode,
} from './settings';
