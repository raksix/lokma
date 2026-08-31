import { GlobalConfigSchema, ProjectSettingsSchema, type GlobalConfig } from 'lokma-shared';
import { expandHome, readJson } from '../utils/fs.js';

/**
 * Layered config loader — global < project < env.
 * See Docs/26-CONFIG-and-CREDENTIALS.md §5.
 */

const GLOBAL_PATH = '~/.lokma/config.json';
const PROJECT_CANDIDATES = ['.lokma/settings.json', 'lokma.json'];

async function findProjectConfig(cwd: string): Promise<string | null> {
  const { stat } = await import('node:fs/promises');
  const { join } = await import('node:path');
  for (const cand of PROJECT_CANDIDATES) {
    const full = join(cwd, cand);
    try {
      await stat(full);
      return full;
    } catch {}
  }
  return null;
}

function readEnv(): Partial<GlobalConfig> {
  const env: Record<string, string | undefined> = {
    defaultModel: process.env.LOKMA_MODEL,
    theme: process.env.LOKMA_THEME as GlobalConfig['theme'] | undefined,
  };
  // Strip undefined
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(env)) if (v) out[k] = v;
  return out as Partial<GlobalConfig>;
}

/** Load and merge config. Never throws — returns defaults on corrupt files. */
export async function loadConfig(cwd: string): Promise<GlobalConfig> {
  const globalRaw = await readJson(GLOBAL_PATH, (r) => GlobalConfigSchema.parse(r), GlobalConfigSchema.parse({}));
  const projectPath = await findProjectConfig(cwd);
  const projectRaw = projectPath
    ? await readJson(projectPath, (r) => ProjectSettingsSchema.parse(r), null as unknown as ReturnType<typeof ProjectSettingsSchema.parse>)
    : null;

  const env = readEnv();

  // Shallow merge: project and env win over global
  const merged: GlobalConfig = {
    ...globalRaw,
    ...(projectRaw as unknown as Partial<GlobalConfig>),
    ...env,
  } as GlobalConfig;

  // Re-parse to ensure defaults
  return GlobalConfigSchema.parse(merged);
}

/** Atomic save to global config.json (masked over API). */
export async function saveGlobal(patch: Partial<GlobalConfig>): Promise<void> {
  const cur = await loadConfig(process.cwd());
  const next = GlobalConfigSchema.parse({ ...cur, ...patch });
  const { writeAtomic } = await import('../utils/fs.js');
  await writeAtomic(GLOBAL_PATH, JSON.stringify(next, null, 2));
}
