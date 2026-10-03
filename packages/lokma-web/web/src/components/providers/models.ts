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

/* ------------------------------------------------------------------ *
 * REQ-194 Kapsam 4 — the Models split layout (full screen only)
 *
 * In the fixed 768x640 settings shell the Models tab has room for exactly
 * one column, and its list carries its own `max-h-[320px] overflow-auto`
 * well so 600+ catalog rows scroll inside a box. Full screen has the width
 * for the catalog's real shape: a provider index on the left, the rows in
 * the middle, a detail panel on the right, and the surrounding modal body
 * owning the scroll (the fixed-height well is dropped there, so a short
 * list no longer leaves a gap and a long one uses the full height).
 *
 * Every geometry lives behind ONE resolver, and the DEFAULT geometries are
 * byte-identical to what shipped, so the inspector tab / inspector panel
 * callers of `<ModelsPane />` (no prop) are untouched.
 * ------------------------------------------------------------------ */

/** Stable DOM/store identity for one catalog row (provider-scoped: ids repeat across providers). */
export function modelRowKey(m: { id: string; provider: string }): string {
  return `${m.provider}::${m.id}`;
}

/** Single-column list shell (default — unchanged). */
export const MODELS_LIST_CLASS = 'overflow-hidden rounded-lg border border-line';

/** Single-column scroll well (default — the shipped `max-h-[320px]`). */
export const MODELS_LIST_SCROLL_CLASS = 'max-h-[320px] overflow-auto';

/** Split list shell — the well's height now comes from the modal body. */
export const MODELS_LIST_SPLIT_CLASS = 'min-h-0 overflow-hidden rounded-lg border border-line';

/** Split scroll area — no fixed height; the parent row chain hands it one. */
export const MODELS_LIST_SPLIT_SCROLL_CLASS = 'h-full min-h-0 overflow-auto';

/** The one place that decides the list shell geometry (probe-covered). */
export function modelsListClass(wide: boolean): string {
  return wide ? MODELS_LIST_SPLIT_CLASS : MODELS_LIST_CLASS;
}

/** The one place that decides the list scroll geometry (probe-covered). */
export function modelsListScrollClass(wide: boolean): string {
  return wide ? MODELS_LIST_SPLIT_SCROLL_CLASS : MODELS_LIST_SCROLL_CLASS;
}

/** Split shell: index | rows | detail. Stacks below `lg` (index becomes a chip row, detail hides). */
export const MODELS_SPLIT_CLASS = 'grid min-h-0 gap-2 lg:grid-cols-[180px_minmax(0,1fr)_240px]';

/** Provider-index entries with both counts — derived from the SAME groups the list renders. */
export function providerIndex(
  groups: Array<{ provider: string; models: ModelInfo[] }>,
): Array<{ provider: string; total: number; enabled: number }> {
  return groups.map((g) => ({
    provider: g.provider,
    total: g.models.length,
    enabled: countEnabled(g.models),
  }));
}

/**
 * Scope the grouped list to one provider (null = every provider). An
 * unknown provider yields nothing rather than everything, so a stale
 * selection can never silently widen the list back.
 */
export function scopeGroupsToProvider<T extends { provider: string }>(
  groups: T[],
  provider: string | null,
): T[] {
  if (provider === null) return groups;
  return groups.filter((g) => g.provider === provider);
}

/**
 * `/` focuses the search field — unless the user is typing in a field
 * (then `/` must stay a literal slash). Pure so the probe can assert both
 * halves; the component supplies `inEditable` from the event target.
 */
export function shouldFocusModelSearch(key: string, inEditable: boolean): boolean {
  return key === '/' && !inEditable;
}

export type ModelPreviewRow = { label: string; value: string; mono?: boolean };

/**
 * Detail rows for the selected model.
 *
 * Kapsam 4 asked for capacity / context / price. The server catalog
 * carries NONE of those (`CatalogModel` is id/label/provider/enabled plus
 * the REQ-183 `unsupported` flag; this pane's header has refused the
 * concept's mock "Ctx" column since the port for exactly that reason), so
 * the panel shows only REAL fields. Fabricating a context window here would
 * make the catalog lie — the fields arrive when the provider feed ships
 * them, and this list is the single place to add them.
 */
export function modelPreviewRows(model: ModelInfo): ModelPreviewRow[] {
  return [
    { label: 'Label', value: model.label || model.id },
    { label: 'Model id', value: model.id, mono: true },
    { label: 'Provider', value: model.provider },
    { label: 'Status', value: model.enabled ? 'Enabled' : 'Disabled' },
    { label: 'Server support', value: model.unsupported === true ? 'Not on server' : 'Available' },
  ];
}
