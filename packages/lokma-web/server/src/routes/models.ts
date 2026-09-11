import type { FastifyInstance } from 'fastify';
import { applyModelFlags, getCatalog, invalidateCatalog, providerOfId, type CatalogModel } from '@lokma/ai';
import { loadConfig, saveGlobal } from '@lokma/core';
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
 * One provider's live `/v1/models` outcome inside a catalog refresh.
 * `skipped` = never probed (no stored key) — kept out of error badges so
 * keyless built-ins do not paint red on every refresh.
 */
export type LiveProbeOutcome =
  | { viewId: string; status: 'skipped'; reason: string }
  | { viewId: string; status: 'ok'; ids: string[]; count: number; latencyMs: number }
  | { viewId: string; status: 'error'; error: string; latencyMs: number };

/** One provider row in the `POST /api/models/refresh` response. */
export type RefreshProviderRow = {
  id: string;
  ok: boolean;
  modelCount: number;
  latencyMs: number;
  error?: string;
  skipped?: boolean;
};

/**
 * Fan out to every enabled provider's live `/v1/models` at once — the
 * single probe path behind both `GET /api/models` (REQ-030 merge) and
 * `POST /api/models/refresh` (REQ-032). Bounded (6s each), parallel,
 * failures come back as data and never block the others.
 */
async function probeAllEnabled(): Promise<LiveProbeOutcome[]> {
  const views = await listProviderViews();
  return Promise.all(
    views
      .filter((v) => v.enabled)
      .map(async (view): Promise<LiveProbeOutcome> => {
        const apiKey = await resolveApiKey(view.id);
        if (!apiKey && providerNeedsKey(view.id)) {
          return { viewId: view.id, status: 'skipped', reason: 'No API key stored' };
        }
        const probed = await probeProvider(view, apiKey, {
          timeoutMs: MERGE_PROBE_TIMEOUT_MS,
          maxIds: MERGE_PROBE_MAX_IDS,
        });
        if (!probed.ok || !probed.models) {
          return { viewId: view.id, status: 'error', error: probed.error ?? 'probe failed', latencyMs: probed.latencyMs };
        }
        return {
          viewId: view.id,
          status: 'ok',
          ids: probed.models,
          count: probed.modelCount ?? probed.models.length,
          latencyMs: probed.latencyMs,
        };
      }),
  );
}

/** Fold live ids into the static base (same-id live hit wins). Pure. */
export function mergeLiveIds(base: CatalogModel[], outcomes: LiveProbeOutcome[]): CatalogModel[] {
  const byId = new Map(base.map((m) => [m.id, m]));
  for (const outcome of outcomes) {
    if (outcome.status !== 'ok') continue;
    for (const raw of outcome.ids) {
      // Always namespace by the provider that actually served the id. Upstream
      // ids that already contain a slash (commandcode's `deepseek/deepseek-v4.1-flash`,
      // `Qwen/Qwen3.8-Max`, omniroute's `cmd/…`) used to be stored bare, which
      // (a) attributed them to a fabricated provider and (b) let two providers
      // collide on one Map key — so a perfectly valid configured default was
      // missing from the catalog and the picker flagged it "(unavailable)".
      const full = `${outcome.viewId}/${raw}`;
      const short = full.slice(full.lastIndexOf('/') + 1);
      byId.set(full, {
        id: full,
        label: short || full,
        provider: providerOfId(full, outcome.viewId),
        enabled: true,
      });
    }
  }
  return [...byId.values()];
}

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
  return mergeLiveIds(base, await probeAllEnabled());
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

  app.post('/api/models/refresh', async () => {
    invalidateCatalog();
    const base = await getCatalog();
    const outcomes = await probeAllEnabled();
    const cfg = await loadConfig(process.cwd());
    const models = applyModelFlags(mergeLiveIds(base, outcomes), cfg.models ?? {});
    const providers: RefreshProviderRow[] = outcomes.map((o): RefreshProviderRow => {
      if (o.status === 'ok') return { id: o.viewId, ok: true, modelCount: o.count, latencyMs: o.latencyMs };
      if (o.status === 'skipped') {
        return { id: o.viewId, ok: false, modelCount: 0, latencyMs: 0, error: o.reason, skipped: true };
      }
      return { id: o.viewId, ok: false, modelCount: 0, latencyMs: o.latencyMs, error: o.error };
    });
    return {
      ok: true,
      models,
      count: models.length,
      enabledCount: models.filter((m) => m.enabled).length,
      providers,
      refreshedAt: new Date().toISOString(),
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
