import type { FastifyInstance } from 'fastify';
import { applyModelFlags, getCatalog, invalidateCatalog } from 'lokma-ai';
import { loadConfig, saveGlobal } from 'lokma-core';

/**
 * Models route — merged catalog from all providers, 5m cache.
 * Enable/disable flags persist in `GlobalConfig.models[id] = { enabled }`
 * (same `~/.lokma/config.json` the CLI reads). Model ids contain slashes
 * (`provider/model`), so mutations are body-driven (`PATCH /api/models`)
 * instead of `:id` URL params. See Docs/22 §models.
 */

const MAX_BULK_KEYS = 500;

export async function modelRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/models', async () => {
    const cfg = await loadConfig(process.cwd());
    const models = applyModelFlags(await getCatalog(), cfg.models ?? {});
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

    const known = new Set((await getCatalog()).map((m) => m.id));
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

    const models = applyModelFlags(await getCatalog(), flags);
    return {
      ok: true,
      updated: entries.length,
      models,
      count: models.length,
      enabledCount: models.filter((m) => m.enabled).length,
    };
  });
}
