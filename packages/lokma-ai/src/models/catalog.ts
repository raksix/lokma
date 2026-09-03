import { providerRegistry } from '../provider/registry.js';

/**
 * Model catalog — merged view of all providers' models.
 * Cached 5m (see Docs/26 cache/models.json). Phase 0: in-memory, no disk.
 */

export type CatalogModel = {
  id: string; // e.g. anthropic/claude-sonnet-4-5
  label: string;
  provider: string;
  enabled: boolean;
};

export type ModelFlags = Record<string, { enabled: boolean }>;

let cache: { at: number; models: CatalogModel[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * Overlay persisted enable/disable flags onto a catalog. Pure — the flags
 * come from `GlobalConfig.models` on the server, so this package never
 * touches the config file itself. Unknown ids are ignored; unmapped
 * models default to enabled.
 */
export function applyModelFlags(models: CatalogModel[], flags: ModelFlags): CatalogModel[] {
  return models.map((m) => {
    const flag = flags[m.id];
    if (!flag) return m;
    return flag.enabled === m.enabled ? m : { ...m, enabled: flag.enabled };
  });
}

export async function getCatalog(): Promise<CatalogModel[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.models;

  const models: CatalogModel[] = [];
  for (const adapter of providerRegistry.list()) {
    const list = await adapter.listModels().catch(() => []);
    for (const m of list) {
      models.push({ id: m.id, label: m.label, provider: adapter.id, enabled: true });
    }
  }
  cache = { at: Date.now(), models };
  return models;
}

export function invalidateCatalog(): void {
  cache = null;
}
