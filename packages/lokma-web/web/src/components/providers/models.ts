/**
 * Pure Models-tab helpers — no React, no server.
 * Covered by `models.test.ts` (`bun src/components/providers/models.test.ts`).
 */
import type { ModelInfo } from '@/lib/api';

/** Models whose id or provider matches the query (case-insensitive). */
export function filterModels(models: ModelInfo[], query: string): ModelInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return models;
  return models.filter(
    (m) => m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
  );
}

/** How many catalog models are enabled. */
export function countEnabled(models: ModelInfo[]): number {
  return models.filter((m) => m.enabled).length;
}

/** Bulk flag map for Allow All / Disable All (one PATCH, not N round-trips). */
export function buildBulkMap(models: ModelInfo[], enabled: boolean): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const m of models) flags[m.id] = enabled;
  return flags;
}

/**
 * Single-source model list for pickers (Composer dropdown, header select).
 * Only enabled models are offered — the Models tab owns the flags.
 */
export function enabledModels(models: ModelInfo[]): ModelInfo[] {
  return models.filter((m) => m.enabled);
}
