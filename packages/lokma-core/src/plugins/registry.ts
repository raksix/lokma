import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { PluginRecordSchema, type PluginCategory, type PluginRecord } from 'lokma-shared';
import { ensureDir, fileExists, writeAtomic } from '../utils/fs.js';

/**
 * Plugin registry — the server side of the Plugins pane (W6-23, Docs/23).
 * Bundled plugins are compiled-in capabilities with REAL manifests: every
 * `endpoints` entry names a live route (verified against
 * `server/src/routes/*.ts` — keep in sync when routes change), and the
 * `routes` prefixes drive the suspension guard (disabled plugin → its
 * routes answer 503 `plugin_disabled`, hot, no restart).
 * URL-installed plugins are plain records under `~/.lokma/plugins/` —
 * they own no routes yet (metadata resolves in the fetch follow-up) and
 * start suspended until explicitly enabled. Same store for CLI + web.
 */

export const PLUGINS_DIR = '~/.lokma/plugins';
const STATE_FILE = 'state.json';
const REGISTRY_FILE = 'registry.json';

/** Harness version the bundled manifests ship with (root package.json). */
const BUNDLED_VERSION = '0.0.1';

/**
 * Scoped ids (`@lokma/plugin-archify`) travel as one `%2F`-encoded segment
 * (same trick as skill ids) — so `@` and `/` are legal here. Ids never
 * touch the filesystem (registry compares strings; state is a JSON map),
 * so `..` is simply an unknown id (404), not a traversal risk.
 */
const PLUGIN_ID_PATTERN = /^[A-Za-z0-9@][A-Za-z0-9_./@-]{0,63}$/;

/** Typed error — routes map `code`/`status` straight into `{ code, message }`. */
export class PluginError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'PluginError';
    this.code = code;
    this.status = status;
  }
}

type BundledDef = {
  id: string;
  name: string;
  author: string;
  description: string;
  category: PluginCategory;
  routes: string[];
  endpoints: string[];
};

/**
 * Bundled registry — keep `endpoints` in sync with the route files
 * (never invent entries here; the pane count is `endpoints.length`).
 */
const BUNDLED_PLUGINS: BundledDef[] = [
  {
    id: '@lokma/plugin-archify',
    name: 'Archify',
    author: 'lokma',
    description: 'Typed JSON IR → validated HTML/SVG diagrams, 5 types, viewer deep links',
    category: 'diagram',
    routes: ['/api/archify'],
    endpoints: [
      'POST /api/archify/generate',
      'POST /api/archify/validate',
      'GET /api/archify/list',
      'GET /api/archify/:id/guide',
      'GET /api/archify/:id',
      'PUT /api/archify/:id',
      'DELETE /api/archify/:id',
      'POST /api/archify/:id/delta',
      'GET /api/archify/:id/export',
      'GET /api/archify/:id/view',
    ],
  },
  {
    id: '@lokma/plugin-design',
    name: 'Design Studio',
    author: 'lokma',
    description: '6 artifact types over bundled systems + real DESIGN.md guard',
    category: 'diagram',
    routes: ['/api/design'],
    endpoints: [
      'POST /api/design/generate',
      'GET /api/design/list',
      'GET /api/design/systems',
      'GET /api/design/guard',
      'GET /api/design/:id',
      'PUT /api/design/:id',
      'DELETE /api/design/:id',
      'POST /api/design/:id/critique',
      'GET /api/design/:id/export',
      'GET /api/design/:id/view',
    ],
  },
  {
    id: '@lokma/plugin-testing',
    name: 'Testing Lab',
    author: 'lokma',
    description: 'Plan → run → classify → junit over live handlers + Shannon scan',
    category: 'tool',
    routes: ['/api/tests'],
    endpoints: [
      'POST /api/tests/run',
      'GET /api/tests/list',
      'GET /api/tests/:id',
      'GET /api/tests/:id/junit',
      'DELETE /api/tests/:id',
    ],
  },
  {
    id: '@lokma/plugin-bots',
    name: 'Bots',
    author: 'lokma',
    description: 'Shareable bot.json packages + run-as-agent playground',
    category: 'tool',
    routes: ['/api/bots'],
    endpoints: [
      'GET /api/bots',
      'GET /api/bots/:id',
      'POST /api/bots',
      'PATCH /api/bots/:id',
      'POST /api/bots/:id/fork',
      'POST /api/bots/:id/publish',
      'POST /api/bots/:id/run',
    ],
  },
  {
    id: '@lokma/plugin-vault',
    name: 'Vault Sync',
    author: 'lokma',
    description: 'File-backed markdown vault — graph, wikilinks, ingest',
    category: 'core',
    routes: ['/api/vault'],
    endpoints: [
      'GET /api/vault/graph',
      'GET /api/vault/tree',
      'GET /api/vault/note',
      'POST /api/vault/ingest',
    ],
  },
  {
    id: '@lokma/plugin-browser',
    name: 'Browser Control',
    author: 'lokma',
    description: 'Per-agent browser tabs + server-owned history',
    category: 'tool',
    routes: ['/api/browser'],
    endpoints: [
      'POST /api/browser/open',
      'GET /api/browser',
      'GET /api/browser/:id',
      'POST /api/browser/:id/navigate',
      'POST /api/browser/:id/back',
      'POST /api/browser/:id/forward',
      'POST /api/browser/:id/reload',
      'DELETE /api/browser/:id',
    ],
  },
];

function pluginsRoot(): string {
  return join(homedir(), '.lokma', 'plugins');
}

export function assertPluginId(raw: unknown): string {
  if (typeof raw !== 'string' || !PLUGIN_ID_PATTERN.test(raw)) {
    throw new PluginError('bad_plugin_id', 'Invalid plugin id (1-64 chars, letters/digits/_/.-/@)', 400);
  }
  return raw;
}

type EnabledState = Record<string, boolean>;

/** Persisted hot-toggle flags (missing id = enabled). */
async function readState(): Promise<EnabledState> {
  const path = join(pluginsRoot(), STATE_FILE);
  if (!(await fileExists(`~/.lokma/plugins/${STATE_FILE}`))) return {};
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    const state: EnabledState = {};
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'boolean') state[id] = value;
    }
    return state;
  } catch {
    // Corrupt state reads as all-enabled — the toggle re-persists on write.
    return {};
  }
}

async function writeState(state: EnabledState): Promise<void> {
  await ensureDir(PLUGINS_DIR);
  await writeAtomic(join(pluginsRoot(), STATE_FILE), JSON.stringify(state, null, 2));
}

/** URL-installed records (validated on read, skipped when corrupt). */
async function readUrlRecords(): Promise<PluginRecord[]> {
  if (!(await fileExists(`~/.lokma/plugins/${REGISTRY_FILE}`))) return [];
  try {
    const raw = JSON.parse(await readFile(join(pluginsRoot(), REGISTRY_FILE), 'utf8')) as unknown;
    if (!Array.isArray(raw)) return [];
    const records: PluginRecord[] = [];
    for (const entry of raw) {
      const parsed = PluginRecordSchema.safeParse(entry);
      if (parsed.success && parsed.data.source === 'url') records.push(parsed.data);
    }
    return records;
  } catch {
    return [];
  }
}

async function writeUrlRecords(records: PluginRecord[]): Promise<void> {
  await ensureDir(PLUGINS_DIR);
  await writeAtomic(join(pluginsRoot(), REGISTRY_FILE), JSON.stringify(records, null, 2));
}

function bundledRecord(def: BundledDef, state: EnabledState): PluginRecord {
  return {
    id: def.id,
    name: def.name,
    version: BUNDLED_VERSION,
    author: def.author,
    description: def.description,
    category: def.category,
    source: 'bundled',
    installed: true,
    enabled: state[def.id] ?? true,
    routes: [...def.routes],
    endpoints: [...def.endpoints],
  };
}

/** Full registry — bundled first, then URL-installed (both id-sorted). */
export async function listPlugins(): Promise<{ plugins: PluginRecord[]; count: number }> {
  const state = await readState();
  const urlRecords = await readUrlRecords();
  const plugins: PluginRecord[] = [
    ...[...BUNDLED_PLUGINS]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((def) => bundledRecord(def, state)),
    ...urlRecords
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((record) => ({ ...record, enabled: state[record.id] ?? record.enabled })),
  ];
  return { plugins, count: plugins.length };
}

export async function getPlugin(id: string): Promise<PluginRecord | null> {
  assertPluginId(id);
  const { plugins } = await listPlugins();
  return plugins.find((p) => p.id === id) ?? null;
}

/** Hot toggle — persists instantly, no restart (the guard reads live state). */
export async function setPluginEnabled(id: string, enabled: unknown): Promise<PluginRecord> {
  assertPluginId(id);
  if (typeof enabled !== 'boolean') {
    throw new PluginError('bad_enabled', 'enabled must be a boolean', 400);
  }
  const { plugins } = await listPlugins();
  const current = plugins.find((p) => p.id === id);
  if (!current) throw new PluginError('plugin_not_found', `Plugin '${id}' not found`, 404);
  const state = await readState();
  state[id] = enabled;
  await writeState(state);
  return { ...current, enabled };
}

/** Route prefixes currently suspended (the server guard calls this per request). */
export async function suspendedPrefixes(): Promise<{ prefix: string; id: string }[]> {
  const { plugins } = await listPlugins();
  const suspended: { prefix: string; id: string }[] = [];
  for (const plugin of plugins) {
    if (!plugin.enabled) {
      for (const prefix of plugin.routes) suspended.push({ prefix, id: plugin.id });
    }
  }
  return suspended;
}

const URL_CAP = 500;

function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase().replace(/\.$/, '');
  if (lower === 'localhost' || lower === '::1' || lower === '[::1]') return true;
  if (/^127\./.test(lower) || lower === '0.0.0.0') return true;
  if (/^10\./.test(lower) || /^192\.168\./.test(lower)) return true;
  const m172 = lower.match(/^172\.(\d+)\./);
  if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return true;
  return false;
}

function slugFromUrl(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean);
  const tail = parts.length > 0 ? parts[parts.length - 1] : '';
  const base = tail.replace(/\.(git|tgz|tar\.gz|zip)$/i, '');
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 64);
  if (!slug || !PLUGIN_ID_PATTERN.test(slug)) {
    throw new PluginError('bad_url', 'Cannot derive a plugin id from this URL path', 400);
  }
  return slug;
}

/**
 * Add-from-URL — validates strictly and stores a real (suspended) record.
 * No network fetch happens here (no SSRF surface): metadata resolves in
 * the fetch follow-up, so the record ships with version `0.0.0` and no
 * routes until then. The pane says so next to the form.
 */
export async function installPluginFromUrl(rawUrl: unknown): Promise<PluginRecord> {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > URL_CAP) {
    throw new PluginError('bad_url', 'url must be a non-empty https URL (max 500 chars)', 400);
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new PluginError('bad_url', 'url is not a valid URL', 400);
  }
  if (url.protocol !== 'https:') {
    throw new PluginError('bad_url', 'Only https plugin URLs are accepted', 400);
  }
  if (url.username || url.password || rawUrl.includes('@')) {
    throw new PluginError('bad_url', 'Plugin URLs must not carry credentials', 400);
  }
  if (isPrivateHost(url.hostname)) {
    throw new PluginError('bad_url', 'Plugin URLs must not target local/private hosts', 400);
  }
  const id = slugFromUrl(url);
  const { plugins } = await listPlugins();
  if (plugins.some((p) => p.id === id)) {
    throw new PluginError('plugin_exists', `Plugin '${id}' is already installed`, 409);
  }
  const name = id
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .slice(0, 60);
  const record: PluginRecord = {
    id,
    name: name || id,
    version: '0.0.0',
    author: url.hostname,
    description: `Added from ${url.hostname} — metadata resolves on first fetch`,
    category: 'tool',
    source: 'url',
    installed: true,
    enabled: false,
    routes: [],
    endpoints: [],
    url: rawUrl.slice(0, URL_CAP),
  };
  const urlRecords = await readUrlRecords();
  urlRecords.push(record);
  await writeUrlRecords(urlRecords);
  const state = await readState();
  state[id] = false;
  await writeState(state);
  return record;
}

/** Delete a URL-installed record (bundled rows are 400 `bundled_readonly`). */
export async function deletePlugin(id: string): Promise<{ id: string }> {
  assertPluginId(id);
  const def = BUNDLED_PLUGINS.find((b) => b.id === id);
  if (def) throw new PluginError('bundled_readonly', `Bundled plugin '${id}' cannot be deleted`, 400);
  const urlRecords = await readUrlRecords();
  const index = urlRecords.findIndex((r) => r.id === id);
  if (index === -1) throw new PluginError('plugin_not_found', `Plugin '${id}' not found`, 404);
  urlRecords.splice(index, 1);
  await writeUrlRecords(urlRecords);
  const state = await readState();
  delete state[id];
  await writeState(state);
  return { id };
}
