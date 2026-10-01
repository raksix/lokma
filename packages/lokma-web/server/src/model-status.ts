/**
 * REQ-183: server-side memory of upstream model-availability refusals.
 *
 * When an upstream answers `unsupported_model` / `model_not_found` for a
 * model id the merged catalog still offers, the agent loop remembers the id
 * here and `GET /api/models` annotates the entry with `unsupported: true` —
 * the pickers then show "not on server" instead of silently offering a model
 * that cannot run.
 *
 * In-memory on purpose: same lifetime as the catalog cache. A restart only
 * clears the badges; the next refused run re-marks the id.
 */

const unsupported = new Set<string>();

/** The `unsupported` flag the catalog carries for remembered ids. */
export type ModelSupportFlag = { unsupported?: boolean };

/** Remember that the upstream refused this catalog model id (idempotent). */
export function markModelUnsupported(id: string): void {
  if (id) unsupported.add(id);
}

/** Remembered ids in insertion order (view / diagnostics). */
export function unsupportedModelIds(): string[] {
  return [...unsupported];
}

/**
 * Annotate catalog rows with the support flag — fresh array, never mutates
 * the input (the catalog base is cached and shared between callers).
 */
export function annotateModelSupport<T extends { id: string }>(models: T[]): Array<T & ModelSupportFlag> {
  if (unsupported.size === 0) return models;
  return models.map((m) => (unsupported.has(m.id) ? { ...m, unsupported: true } : m));
}
