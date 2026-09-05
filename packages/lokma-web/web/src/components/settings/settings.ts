/**
 * settings.ts — pure helpers for the Settings tabs (Config / Appearance /
 * Permissions / MCP). No DOM, no server: every function is probe-covered in
 * `settings.test.ts` (`bun src/components/settings/settings.test.ts`).
 *
 * The server owns the merge (global `~/.lokma/config.json` < project
 * `.lokma/settings.json` < `LOKMA_*` env); `GET /api/config` returns the
 * merged `{ config, credentials }`. These helpers only normalize that
 * payload into pane-friendly shapes and build PATCH bodies — they never
 * invent values.
 */

/** Named themes the server accepts (`GlobalConfig.theme`). */
export const SERVER_THEMES = ['claude', 'omp', 'midnight', 'paper'] as const;
export type ServerTheme = (typeof SERVER_THEMES)[number];

/** Web light/dark mode (the only modes `web/src/index.css` implements). */
export type WebMode = 'light' | 'dark';

/**
 * The four server themes mapped to the web light/dark mode.
 * Same palette facts as the concept SettingsPane Appearance tab —
 * claude/paper are light, omp/midnight are dark.
 */
export const THEME_CARDS: ReadonlyArray<{
  id: ServerTheme;
  name: string;
  desc: string;
  bg: string;
  accent: string;
  mode: WebMode;
}> = [
  { id: 'claude', name: 'Claude', desc: 'cream #FAF9F5 + terracotta #C96442', bg: '#FAF9F5', accent: '#C96442', mode: 'light' },
  { id: 'omp', name: 'OMP', desc: 'near-black + indigo #6366F1', bg: '#0A0A0F', accent: '#6366F1', mode: 'dark' },
  { id: 'midnight', name: 'Midnight', desc: 'true black #000 + zinc', bg: '#000000', accent: '#27272A', mode: 'dark' },
  { id: 'paper', name: 'Paper', desc: 'warm paper #FFFBF5 + ink', bg: '#FFFBF5', accent: '#78716C', mode: 'light' },
];

export function isServerTheme(v: unknown): v is ServerTheme {
  return typeof v === 'string' && (SERVER_THEMES as readonly string[]).includes(v);
}

/** Map a server theme id to the web light/dark mode (unknown ids fall back to light). */
export function serverThemeToMode(theme: unknown): WebMode {
  const card = THEME_CARDS.find((t) => t.id === theme);
  return card ? card.mode : 'light';
}

/** Live card shape the Appearance tab renders (server truth, not a const). */
export type ThemeCard = {
  id: string;
  name: string;
  desc: string;
  bg: string;
  accent: string;
  mode: WebMode;
  cssVars: Record<string, string>;
};

/**
 * Build a render card from one `GET /api/themes` view (Phase 3 themes
 * polish). Description comes from the server def (the old hardcoded copy
 * drifted: midnight is navy+cyan, not true-black). Unknown modes fall back
 * to light; missing previews fall back to the chalk tokens.
 */
export function themeCardFromView(view: {
  id: string;
  name: string;
  description: string;
  mode: unknown;
  cssVars: Record<string, string>;
  chalk: Record<string, string>;
  preview: { bg: string; accent: string };
}): ThemeCard {
  const mode: WebMode = view.mode === 'dark' ? 'dark' : 'light';
  return {
    id: view.id,
    name: view.name,
    desc: view.description,
    bg: view.preview?.bg ?? view.chalk?.background ?? '#ffffff',
    accent: view.preview?.accent ?? view.chalk?.primary ?? '#000000',
    mode,
    cssVars: view.cssVars,
  };
}

/** Permission default modes the server accepts (`PermissionsSchema`). */
export const PERMISSION_MODES = ['auto', 'manual', 'acceptEdits', 'plan', 'bypass'] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export function isPermissionMode(v: unknown): v is PermissionMode {
  return typeof v === 'string' && (PERMISSION_MODES as readonly string[]).includes(v);
}

/** MCP transports the server accepts (`McpServerSchema`). */
export const MCP_TRANSPORTS = ['stdio', 'http', 'sse', 'ws'] as const;
export type McpTransport = (typeof MCP_TRANSPORTS)[number];

export function isMcpTransport(v: unknown): v is McpTransport {
  return typeof v === 'string' && (MCP_TRANSPORTS as readonly string[]).includes(v);
}

/** One MCP server row as the panes render it. */
export type McpEntry = {
  name: string;
  transport: McpTransport;
  command: string;
  url: string;
  enabled: boolean;
};

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Normalize one raw `mcp.servers[name]` value into a renderable row. */
export function normalizeMcpEntry(name: string, raw: unknown): McpEntry {
  const r = asRecord(raw);
  return {
    name,
    transport: isMcpTransport(r.transport) ? r.transport : 'stdio',
    command: typeof r.command === 'string' ? r.command : '',
    url: typeof r.url === 'string' ? r.url : '',
    enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
  };
}

/** Normalize the whole `mcp.servers` record (unknown shapes become safe rows). */
export function normalizeMcpServers(raw: unknown): McpEntry[] {
  const r = asRecord(raw);
  return Object.keys(r).map((name) => normalizeMcpEntry(name, r[name]));
}

/** One hook row as the Permissions tab renders it. */
export type HookRow = { event: string; matcher: string; command: string };

/** Flatten the server `hooks` record (`{Event: [{matcher, command}]}`) into rows. */
export function flattenHooks(raw: unknown): HookRow[] {
  const r = asRecord(raw);
  const rows: HookRow[] = [];
  for (const event of Object.keys(r)) {
    const list = r[event];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const h = asRecord(item);
      rows.push({
        event,
        matcher: typeof h.matcher === 'string' ? h.matcher : '',
        command: typeof h.command === 'string' ? h.command : typeof h.cmd === 'string' ? h.cmd : '',
      });
    }
  }
  return rows;
}

/** Fold hook rows back into the server `hooks` record shape for PATCH. */
export function buildHooksPatch(rows: HookRow[]): Record<string, Array<{ matcher: string; command: string }>> {
  const out: Record<string, Array<{ matcher: string; command: string }>> = {};
  for (const row of rows) {
    if (!row.event.trim()) continue;
    const key = row.event.trim();
    if (!out[key]) out[key] = [];
    out[key].push({ matcher: row.matcher, command: row.command });
  }
  return out;
}

/** Effective config as the Config tab renders it (every field optional — tolerant reads). */
export type NormalizedConfig = {
  defaultModel: string;
  defaultProvider: string;
  theme: ServerTheme | null;
  permissions: { allow: string[]; deny: string[]; defaultMode: PermissionMode };
  mcpServers: McpEntry[];
  hooks: HookRow[];
  maxAgents: number | null;
  maxConcurrent: number | null;
  maxQueue: number | null;
  agentDefaultModel: string;
  vaultHost: string | null;
  coordinatorMode: string;
  credentials: Record<string, { keySet: boolean; last4: string | null }>;
};

/**
 * Normalize a raw `GET /api/config` payload (`{ config, credentials }`).
 * Missing sections fall back to schema defaults — never to invented data.
 */
export function normalizeConfig(raw: unknown): NormalizedConfig {
  const root = asRecord(raw);
  const cfg = asRecord(root.config);
  const perms = asRecord(cfg.permissions);
  const agents = asRecord(cfg.agents);
  const coord = asRecord(cfg.coordinator);
  const vault = asRecord(cfg.vault);
  const mcp = asRecord(cfg.mcp);
  return {
    defaultModel: typeof cfg.defaultModel === 'string' ? cfg.defaultModel : '',
    defaultProvider: typeof cfg.defaultProvider === 'string' ? cfg.defaultProvider : '',
    theme: isServerTheme(cfg.theme) ? cfg.theme : null,
    permissions: {
      allow: asStringArray(perms.allow),
      deny: asStringArray(perms.deny),
      defaultMode: isPermissionMode(perms.defaultMode) ? perms.defaultMode : 'auto',
    },
    mcpServers: normalizeMcpServers(mcp.servers),
    hooks: flattenHooks(cfg.hooks),
    maxAgents: typeof agents.maxAgents === 'number' ? agents.maxAgents : null,
    maxConcurrent: typeof agents.maxConcurrent === 'number' ? agents.maxConcurrent : null,
    maxQueue: typeof agents.maxQueue === 'number' ? agents.maxQueue : null,
    agentDefaultModel: typeof agents.defaultModel === 'string' ? agents.defaultModel : '',
    vaultHost: typeof vault.host === 'string' ? vault.host : null,
    coordinatorMode: typeof coord.mode === 'string' ? coord.mode : '',
    credentials: asRecord(root.credentials) as NormalizedConfig['credentials'],
  };
}

/** A permission rule is a non-empty tool pattern (same store the chat card writes). */
export function isValidRule(rule: unknown): boolean {
  return typeof rule === 'string' && rule.trim().length > 0 && rule.trim().length <= 200;
}

/** MCP server name rule (same slug shape as provider ids). */
export function isValidMcpName(name: unknown): boolean {
  return typeof name === 'string' && /^[a-z0-9][a-z0-9-]{1,62}$/.test(name.trim());
}

/** Validate the MCP add/edit form; returns per-field errors (empty = valid). */
export function validateMcpForm(input: { name: string; transport: string; command: string; url: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isValidMcpName(input.name)) errors.name = 'Lowercase slug, 2-63 chars (letters, digits, dashes).';
  if (!isMcpTransport(input.transport)) errors.transport = 'Pick stdio, http, sse, or ws.';
  if (input.transport === 'stdio') {
    if (!input.command.trim()) errors.command = 'stdio needs a command (e.g. npx @modelcontextprotocol/server-filesystem).';
  } else if (!/^(https?|wss?):\/\/.+/.test(input.url.trim())) {
    errors.url = 'http/sse/ws needs an http(s) or ws(s) endpoint URL.';
  }
  return errors;
}

/**
 * Build a PATCH body for the full permissions object. Always sends allow +
 * deny + defaultMode together — `saveGlobal` shallow-merges, so a partial
 * object would wipe the sibling lists.
 */
export function buildPermissionsPatch(allow: string[], deny: string[], defaultMode: PermissionMode): Record<string, unknown> {
  return { permissions: { allow, deny, defaultMode } };
}

/** Build a PATCH body for the full MCP servers map (same shallow-merge reason). */
export function buildMcpPatch(servers: McpEntry[]): Record<string, unknown> {
  const map: Record<string, { transport: string; command?: string; url?: string; enabled: boolean }> = {};
  for (const s of servers) {
    const entry: { transport: string; command?: string; url?: string; enabled: boolean } = {
      transport: s.transport,
      enabled: s.enabled,
    };
    if (s.transport === 'stdio') {
      entry.command = s.command;
    } else {
      entry.url = s.url;
    }
    map[s.name] = entry;
  }
  return { mcp: { servers: map } };
}
