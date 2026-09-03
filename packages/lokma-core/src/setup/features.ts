import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { stat } from 'node:fs/promises';
import { loadConfig, saveGlobal } from '../config/loader.js';
import { ensureDir, fileExists, writeAtomic } from '../utils/fs.js';
import { ProjectSettingsSchema } from 'lokma-shared';

/**
 * Optional-stack setup — the server side of `lokma init` / `lokma setup`
 * (Docs/32) and the SetupPane (W6-22). The registry mirrors the concept
 * `SetupWizardPane` checkboxes 1:1; the state persists in
 * `~/.lokma/config.json` → `features` (same file the CLI reads).
 */

/** One optional-stack checkbox (id is the `features` map key). */
export type SetupFeature = {
  id: string;
  label: string;
  desc: string;
  /** Docs pointer shown next to the label (e.g. `32-§3`). */
  docs: string;
  defaultOn: boolean;
};

/** Registry — keep in sync with the concept pane (never invent ids here). */
export const SETUP_FEATURES: SetupFeature[] = [
  {
    id: 'browser',
    label: 'Browser',
    desc: 'Browser Use / Playwright / CDP — harness can navigate/click/screenshot',
    docs: '32-§3',
    defaultOn: true,
  },
  {
    id: 'search',
    label: 'Web Search',
    desc: 'SearXNG :8889 → Exa → Brave fallback chain',
    docs: '32-§4',
    defaultOn: true,
  },
  {
    id: 'gateway',
    label: 'Gateway',
    desc: 'Telegram / Discord / Slack / WA / Signal — 35 platforms',
    docs: '32-§5',
    defaultOn: false,
  },
  {
    id: 'mcp',
    label: 'MCP Catalog',
    desc: '70 MCPs — stdio/http/sse/ws, dynamic tools',
    docs: '32-§6',
    defaultOn: true,
  },
  {
    id: 'vault',
    label: 'Vault',
    desc: 'memory.fermag.com.tr/lokma · FTS5 + graph',
    docs: '28-29',
    defaultOn: true,
  },
];

/** Feature state with the persisted flag resolved (stored flag wins). */
export type SetupFeatureState = SetupFeature & { enabled: boolean };

/** Typed setup failure — routes map it straight to `{ code, message }`. */
export class SetupError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'SetupError';
    this.code = code;
    this.status = status;
  }
}

/** Registry + current flags (stored `features` win, registry defaults fill gaps). */
export async function getSetupState(): Promise<{ features: SetupFeatureState[]; applied: Record<string, boolean> }> {
  const cfg = await loadConfig(process.cwd());
  const stored = cfg.features ?? {};
  const features = SETUP_FEATURES.map((f) => ({
    ...f,
    enabled: typeof stored[f.id] === 'boolean' ? stored[f.id] : f.defaultOn,
  }));
  const applied: Record<string, boolean> = {};
  for (const f of features) applied[f.id] = f.enabled;
  return { features, applied };
}

/**
 * Persist a full or partial feature map. Unknown ids fail closed (400
 * `unknown_feature`) so typos never silently persist; non-booleans fail
 * with 400 `bad_feature`. An empty object is ambiguous (all-off must be
 * explicit, one key per feature) → 400 `empty_patch`.
 */
export async function applySetupFeatures(input: unknown): Promise<Record<string, boolean>> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new SetupError('bad_features', 'features must be an object mapping feature id to boolean');
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) {
    throw new SetupError('empty_patch', 'features is empty — send one boolean per feature id');
  }
  const known = new Set(SETUP_FEATURES.map((f) => f.id));
  const next: Record<string, boolean> = {};
  for (const [id, value] of entries) {
    if (!known.has(id)) {
      throw new SetupError('unknown_feature', `unknown feature: ${id} (known: ${[...known].join(', ')})`);
    }
    if (typeof value !== 'boolean') {
      throw new SetupError('bad_feature', `feature ${id} must be a boolean`);
    }
    next[id] = value;
  }
  const cfg = await loadConfig(process.cwd());
  await saveGlobal({ features: { ...(cfg.features ?? {}), ...next } });
  return next;
}

/** Home subdirectories the harness stores live data in (created by init). */
const INIT_SUBDIRS = ['skills', 'agents', 'bots', 'archify', 'design/artifacts', 'test-runs'] as const;

const GLOBAL_CONFIG_PATH = '~/.lokma/config.json';

/**
 * `lokma init` for the web harness — ensures the global config + home data
 * dirs exist (missing ones are created, existing ones are reported, never
 * wiped). With `cwd`, also scaffolds a per-project `.lokma/settings.json`
 * when the project has none yet. Returns display paths for the pane.
 */
export async function runSetupInit(cwd?: string): Promise<{ created: string[]; existed: string[] }> {
  const created: string[] = [];
  const existed: string[] = [];

  if (await fileExists(GLOBAL_CONFIG_PATH)) {
    existed.push(GLOBAL_CONFIG_PATH);
  } else {
    await saveGlobal({});
    created.push(GLOBAL_CONFIG_PATH);
  }

  for (const sub of INIT_SUBDIRS) {
    const display = `~/.lokma/${sub}`;
    try {
      const s = await stat(join(homedir(), '.lokma', ...sub.split('/')));
      if (s.isDirectory()) {
        existed.push(display);
        continue;
      }
    } catch {
      // Missing — created below.
    }
    await ensureDir(`~/.lokma/${sub}`);
    created.push(display);
  }

  if (cwd !== undefined) {
    const abs = resolve(cwd);
    let dirStat;
    try {
      dirStat = await stat(abs);
    } catch {
      throw new SetupError('bad_cwd', `cwd does not exist: ${cwd}`);
    }
    if (!dirStat.isDirectory()) {
      throw new SetupError('bad_cwd', `cwd is not a directory: ${cwd}`);
    }
    const candidates = ['.lokma/settings.json', 'lokma.json'].map((c) => join(abs, c));
    let hasProject = false;
    for (const cand of candidates) {
      try {
        const s = await stat(cand);
        if (s.isFile()) {
          hasProject = true;
          existed.push(cand);
          break;
        }
      } catch {
        // Keep looking.
      }
    }
    if (!hasProject) {
      const target = join(abs, '.lokma/settings.json');
      const parsed = ProjectSettingsSchema.parse({});
      await writeAtomic(target, JSON.stringify(parsed, null, 2));
      created.push(target);
    }
  }

  return { created, existed };
}
