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

/**
 * Group the catalog by provider, alphabetically, keeping the server's order
 * inside each group. The Models tab renders these as sticky headers so a
 * 600-entry catalog reads like the Composer dropdown instead of one flat wall.
 */
export function groupByProvider(
  models: ModelInfo[],
): Array<{ provider: string; models: ModelInfo[] }> {
  const groups = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const list = groups.get(m.provider);
    if (list) list.push(m);
    else groups.set(m.provider, [m]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([provider, list]) => ({ provider, models: list }));
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

/**
 * Built-in last-resort model (mirrors the server WS `DEFAULT_MODEL`).
 * Used only when the catalog is empty and nothing else resolves.
 */
export const FALLBACK_MODEL = 'anthropic/claude-sonnet-4-5';

/** Where a resolved default model came from (REQ-104 smart chain). */
export type DefaultModelSource = 'configured' | 'most-used' | 'first-enabled' | 'fallback';

/**
 * Trim a model id (non-strings become empty — never crashes on odd payloads).
 */
export function normalizeModelId(id: unknown): string {
  return typeof id === 'string' ? id.trim() : '';
}

/**
 * Tolerant id equality — the stored config predates the slash canonical
 * form (`provider::model` vs `provider/model`), so both separators match.
 */
export function modelIdMatches(a: string, b: string): boolean {
  if (a === b) return true;
  const canon = (s: string): string => s.replace(/::/g, '/');
  return canon(a) === canon(b);
}

/**
 * Smart default-model chain (REQ-104):
 * 1. configured `defaultModel` — when it still matches an enabled model;
 * 2. most-used model (`GET /api/usage/summary` topModel) — when enabled;
 * 3. first enabled catalog model;
 * 4. built-in fallback.
 * Returns the catalog-canonical id whenever a catalog row matched, so the
 * Composer sends the exact id the server catalog knows.
 */
export function resolveDefaultModel(input: {
  configured: unknown;
  usageTop: unknown;
  models: ModelInfo[];
  fallback?: string;
}): { model: string; source: DefaultModelSource } {
  const fallback = normalizeModelId(input.fallback) || FALLBACK_MODEL;
  const enabled = enabledModels(input.models);
  const configured = normalizeModelId(input.configured);
  const usageTop = normalizeModelId(input.usageTop);
  if (enabled.length === 0) {
    if (configured) return { model: configured, source: 'configured' };
    if (usageTop) return { model: usageTop, source: 'most-used' };
    return { model: fallback, source: 'fallback' };
  }
  const configuredHit = configured ? enabled.find((m) => modelIdMatches(m.id, configured)) : undefined;
  if (configuredHit) return { model: configuredHit.id, source: 'configured' };
  const usageHit = usageTop ? enabled.find((m) => modelIdMatches(m.id, usageTop)) : undefined;
  if (usageHit) return { model: usageHit.id, source: 'most-used' };
  const first = enabled[0];
  if (first) return { model: first.id, source: 'first-enabled' };
  return { model: fallback, source: 'fallback' };
}
