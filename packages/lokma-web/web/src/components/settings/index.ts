/**
 * Settings barrel — Config / Appearance / Permissions / MCP tabs (W2-8).
 * Real `GET/PATCH /api/config` panes; no mock data (see Docs/38 W2-8).
 */
export { SettingsPane } from './settings-pane';
export { SettingsModal } from './settings-modal';
export { ConfigPane } from './config-pane';
export { AppearancePane } from './appearance-pane';
export { PermissionsPane } from './permissions-pane';
export { McpPane } from './mcp-pane';
export { DoctorStrip } from './doctor-strip';
export {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_FULLSCREEN_KEY,
  SETTINGS_SECTIONS,
  SETTINGS_SHELL_CLASS,
  SETTINGS_SHELL_FULLSCREEN_CLASS,
  browserStorage,
  buildHooksPatch,
  buildMcpPatch,
  buildPermissionsPatch,
  flattenHooks,
  isMcpTransport,
  isPermissionMode,
  isServerTheme,
  isSettingsSection,
  isValidMcpName,
  isValidRule,
  normalizeConfig,
  normalizeMcpEntry,
  normalizeMcpServers,
  readSettingsFullscreen,
  serverThemeToMode,
  settingsDeepLink,
  settingsShellClass,
  summarizeDoctor,
  validateMcpForm,
  writeSettingsFullscreen,
  MCP_TRANSPORTS,
  PERMISSION_MODES,
  SERVER_THEMES,
  THEME_CARDS,
  type DoctorSummary,
  type HookRow,
  type McpEntry,
  type McpTransport,
  type NormalizedConfig,
  type PermissionMode,
  type ServerTheme,
  type SettingsSectionId,
  type StorageLike,
  type WebMode,
} from './settings';
