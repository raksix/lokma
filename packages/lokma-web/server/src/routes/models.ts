import type { FastifyInstance } from 'fastify';
import { applyModelFlags, getCatalog, invalidateCatalog, providerOfId, type CatalogModel } from 'lokma-ai';
import { loadConfig, saveGlobal } from 'lokma-core';
import { listProviderViews, probeProvider, providerNeedsKey, resolveApiKey } from './providers.js';

/**
 * Models route — merged catalog from all providers, 5m cache.
 * Enable/disable flags persist in `GlobalConfig.models[id] = { enabled }`
 * (same `~/.lokma/config.json` the CLI reads). Model ids contain slashes
 * (`provider/model`), so mutations are body-driven (`PATCH /api/models`)
 * instead of `:id` URL params. See Docs/22 §models.
 */

const MAX_BULK_KEYS = 500;

/** Live-probe budget for the catalog merge — bounded, parallel, failures skipped. */
const MERGE_PROBE_TIMEOUT_MS = 6_000;
const MERGE_PROBE_MAX_IDS = 500;

/**
 * Merged catalog: static adapter models (`getCatalog`, 5m cached) enriched
 * with live `/v1/models` results from every enabled provider that can be
 * reached (stored key, or keyless local like Ollama). Static entries are the
 * fallback — a failed probe never removes them; a live hit overwrites the
 * same id. Bare upstream ids gain a `provider/` prefix so picker badges stay
 * honest (REQ-030).
 */
export async function getMergedCatalog(): Promise<CatalogModel[]> {
  const base = await getCatalog();
  const views = await listProviderViews();
  const probes = views
    .filter((v) => v.enabled)
    .map(async (view) => {
      const apiKey = await resolveApiKey(view.id);
      if (!apiKey && providerNeedsKey(view.id)) return null;
      const probed = await probeProvider(view, apiKey, {
        timeoutMs: MERGE_PROBE_TIMEOUT_MS,
        maxIds: MERGE_PROBE_MAX_IDS,
      });
      if (!probed.ok || !probed.models) return null;
      return { viewId: view.id, ids: probed.models };
    });
  const settled = await Promise.all(probes);
  const byId = new Map(base.map((m) => [m.id, m]));
  for (const hit of settled) {
    if (!hit) continue;
    for (const raw of hit.ids) {
      const full = raw.includes('/') ? raw : `${hit.viewId}/${raw}`;
      const short = full.slice(full.lastIndexOf('/') + 1);
      byId.set(full, {
        id: full,
        label: short || full,
        provider: providerOfId(full, hit.viewId),
        enabled: true,
      });
    }
  }
  return [...byId.values()];
}

export async function modelRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/models', async () => {
    const cfg = await loadConfig(process.cwd());
    const models = applyModelFlags(await getMergedCatalog(), cfg.models ?? {});
    return {
      models,
      count: models.length,
      enabledCount: models.filter((m) => m.enabled).length,
      cached: true,
    };
  });

  app.patch('/api/models', async (req, reply) => {
    const body = (req.body ?? {}) as {
      id?: unknown;
      enabled?: unknown;
      models?: unknown;
    };
    // Single-toggle shape { id, enabled } or bulk shape { models: { id: enabled } }.
    let entries: [string, boolean][];
    if (body.models !== undefined) {
      if (
        typeof body.models !== 'object' ||
        body.models === null ||
        Array.isArray(body.models) ||
        !Object.values(body.models as Record<string, unknown>).every((v) => typeof v === 'boolean')
      ) {
        return reply.code(400).send({
          ok: false,
          code: 'bad_models',
          message: 'models must be an object mapping model id to boolean',
        });
      }
      entries = Object.entries(body.models as Record<string, boolean>);
      if (entries.length > MAX_BULK_KEYS) {
        return reply.code(400).send({
          ok: false,
          code: 'too_many_models',
          message: `models holds at most ${MAX_BULK_KEYS} entries`,
        });
      }
    } else {
      if (typeof body.id !== 'string' || body.id.length === 0 || body.id.length > 200) {
        return reply.code(400).send({ ok: false, code: 'bad_id', message: 'id is required (1-200 chars)' });
      }
      if (typeof body.enabled !== 'boolean') {
        return reply.code(400).send({ ok: false, code: 'bad_enabled', message: 'enabled must be a boolean' });
      }
      entries = [[body.id, body.enabled]];
    }
    if (entries.length === 0) {
      return reply.code(400).send({ ok: false, code: 'empty_patch', message: 'Nothing to update' });
    }

    const base = await getMergedCatalog();
    const known = new Set(base.map((m) => m.id));
    const unknown = entries.map(([id]) => id).filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return reply.code(400).send({
        ok: false,
        code: 'unknown_model',
        message: `Unknown model id: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? ` (+${unknown.length - 5} more)` : ''}`,
      });
    }

    const cfg = await loadConfig(process.cwd());
    const flags = { ...(cfg.models ?? {}) };
    for (const [id, enabled] of entries) flags[id] = { enabled };
    await saveGlobal({ models: flags });
    invalidateCatalog();

    const models = applyModelFlags(base, flags);
    return {
      ok: true,
      updated: entries.length,
      models,
      count: models.length,
      enabledCount: models.filter((m) => m.enabled).length,
    };
  });
}
