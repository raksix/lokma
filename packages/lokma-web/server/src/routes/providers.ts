import type { FastifyInstance } from 'fastify';
import {
  BUILTINS,
  isValidBaseUrl,
  isValidProviderId,
  listProviderViews,
  loadConfig,
  probeProvider,
  removeCredentials,
  resolveApiKey,
  saveCredentials,
  saveGlobal,
} from '@lokma/core';

/**
 * Provider routes — registry list + custom provider CRUD + live connection test.
 * Pure registry logic (views, upstream, probes) lives in `lokma-core`
 * (`src/providers/`) and is re-exported here so existing importers
 * (`ws.ts`, `models.ts`, `setup.ts`, `cron-runner.ts`) keep working
 * unchanged; this file keeps only the HTTP handlers.
 * See Docs/22-WEB-FEATURES §providers
 */

// Re-export the core registry for server-side importers (single implementation).
export {
  BUILTINS,
  BUILTIN_ORDER,
  ENV_KEYS,
  isValidBaseUrl,
  isValidProviderId,
  listProviderViews,
  probeProvider,
  providerNeedsKey,
  resolveApiKey,
  resolveProviderUpstream,
} from '@lokma/core';
export type { ProviderView } from '@lokma/core';

export async function providerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/providers', async () => {
    const providers = await listProviderViews();
    return { providers };
  });

  app.post('/api/providers', async (req, reply) => {
    const body = (req.body ?? {}) as { id?: unknown; name?: unknown; baseUrl?: unknown; apiKey?: unknown; enabled?: unknown };
    if (!isValidProviderId(body.id)) {
      return reply.code(400).send({ ok: false, code: 'bad_id', message: 'id must be a slug: lowercase letters, digits, dashes (2-41 chars)' });
    }
    if (typeof body.name !== 'string' || body.name.trim().length === 0 || body.name.length > 80) {
      return reply.code(400).send({ ok: false, code: 'bad_name', message: 'name is required (1-80 chars)' });
    }
    if (!isValidBaseUrl(body.baseUrl)) {
      return reply.code(400).send({ ok: false, code: 'bad_url', message: 'baseUrl must be an http(s) URL' });
    }
    if (body.apiKey !== undefined && (typeof body.apiKey !== 'string' || body.apiKey.length === 0)) {
      return reply.code(400).send({ ok: false, code: 'bad_key', message: 'apiKey must be a non-empty string when provided' });
    }
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
      return reply.code(400).send({ ok: false, code: 'bad_enabled', message: 'enabled must be a boolean' });
    }

    const existing = await listProviderViews();
    if (existing.some((p) => p.id === body.id)) {
      return reply.code(409).send({ ok: false, code: 'duplicate_id', message: `Provider already exists: ${body.id}` });
    }

    const cfg = await loadConfig(process.cwd());
    const providers = [...(cfg.providers ?? [])];
    providers.push({
      id: body.id,
      enabled: body.enabled ?? true,
      priority: existing.length,
      name: body.name.trim(),
      baseUrl: (body.baseUrl as string).replace(/\/$/, ''),
    });
    await saveGlobal({ providers });
    if (typeof body.apiKey === 'string') await saveCredentials(body.id, body.apiKey);

    const providersAfter = await listProviderViews();
    const created = providersAfter.find((p) => p.id === body.id);
    return reply.code(201).send({ ok: true, provider: created });
  });

  app.patch('/api/providers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await listProviderViews();
    if (!existing.some((p) => p.id === id)) {
      return reply.code(404).send({ ok: false, code: 'not_found', message: `Unknown provider: ${id}` });
    }
    const body = (req.body ?? {}) as {
      name?: unknown;
      baseUrl?: unknown;
      enabled?: unknown;
      priority?: unknown;
      apiKey?: unknown;
    };
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length === 0 || body.name.length > 80)) {
      return reply.code(400).send({ ok: false, code: 'bad_name', message: 'name must be 1-80 chars' });
    }
    if (body.baseUrl !== undefined && !isValidBaseUrl(body.baseUrl)) {
      return reply.code(400).send({ ok: false, code: 'bad_url', message: 'baseUrl must be an http(s) URL' });
    }
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
      return reply.code(400).send({ ok: false, code: 'bad_enabled', message: 'enabled must be a boolean' });
    }
    if (body.priority !== undefined && (typeof body.priority !== 'number' || !Number.isInteger(body.priority) || body.priority < 0)) {
      return reply.code(400).send({ ok: false, code: 'bad_priority', message: 'priority must be a non-negative integer' });
    }
    if (body.apiKey !== undefined && (typeof body.apiKey !== 'string' || body.apiKey.length === 0)) {
      return reply.code(400).send({ ok: false, code: 'bad_key', message: 'apiKey must be a non-empty string when provided' });
    }
    if (
      body.name === undefined &&
      body.baseUrl === undefined &&
      body.enabled === undefined &&
      body.priority === undefined &&
      body.apiKey === undefined
    ) {
      return reply.code(400).send({ ok: false, code: 'empty_patch', message: 'Nothing to update' });
    }

    const cfg = await loadConfig(process.cwd());
    const providers = [...(cfg.providers ?? [])];
    const idx = providers.findIndex((p) => p.id === id);
    const current: { id: string; enabled?: boolean; priority?: number; name?: string; baseUrl?: string } =
      idx >= 0 ? { ...providers[idx] } : { id };
    if (typeof body.name === 'string') current.name = body.name.trim();
    if (typeof body.baseUrl === 'string') current.baseUrl = body.baseUrl.replace(/\/$/, '');
    if (typeof body.enabled === 'boolean') current.enabled = body.enabled;
    if (typeof body.priority === 'number') current.priority = body.priority;
    if (idx >= 0) providers[idx] = current as (typeof providers)[number];
    else {
      if (current.enabled === undefined) current.enabled = true;
      if (current.priority === undefined) {
        const views = await listProviderViews();
        const found = views.find((p) => p.id === id);
        current.priority = found?.priority ?? views.length;
      }
      providers.push(current as (typeof providers)[number]);
    }
    await saveGlobal({ providers });
    if (typeof body.apiKey === 'string') await saveCredentials(id, body.apiKey);

    const providersAfter = await listProviderViews();
    return { ok: true, provider: providersAfter.find((p) => p.id === id) };
  });

  app.delete('/api/providers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (BUILTINS[id]) {
      return reply.code(400).send({ ok: false, code: 'cannot_delete_builtin', message: `Built-in provider cannot be deleted (disable it instead): ${id}` });
    }
    const cfg = await loadConfig(process.cwd());
    const providers = [...(cfg.providers ?? [])];
    if (!providers.some((p) => p.id === id)) {
      return reply.code(404).send({ ok: false, code: 'not_found', message: `Unknown provider: ${id}` });
    }
    await saveGlobal({ providers: providers.filter((p) => p.id !== id) });
    await removeCredentials(id);
    return { ok: true, id };
  });

  app.post('/api/providers/reorder', async (req, reply) => {
    const body = (req.body ?? {}) as { order?: unknown };
    const current = await listProviderViews();
    const currentIds = new Set(current.map((p) => p.id));
    if (
      !Array.isArray(body.order) ||
      body.order.length !== current.length ||
      new Set(body.order).size !== current.length ||
      !(body.order as unknown[]).every((id) => typeof id === 'string' && currentIds.has(id))
    ) {
      return reply
        .code(400)
        .send({ ok: false, code: 'bad_order', message: 'order must list every known provider id exactly once' });
    }
    const order = body.order as string[];
    const cfg = await loadConfig(process.cwd());
    const providers = [...(cfg.providers ?? [])];
    const byId = new Map(providers.map((p) => [p.id, p]));
    // Persist every provider (built-ins gain an override entry) so order survives restarts.
    const next = order.map((id, priority) => ({ ...(byId.get(id) ?? { id, enabled: true }), priority }));
    await saveGlobal({ providers: next as (typeof providers)[number][] });
    return { ok: true, providers: await listProviderViews() };
  });

  app.post('/api/providers/:id/test', async (req, reply) => {
    const { id } = req.params as { id: string };
    const views = await listProviderViews();
    const view = views.find((p) => p.id === id);
    if (!view) {
      return reply.code(404).send({ ok: false, code: 'not_found', message: `Unknown provider: ${id}` });
    }
    if (!view.enabled) {
      return reply.code(400).send({ ok: false, code: 'provider_disabled', message: `Provider is disabled: ${id}` });
    }
    const needsKey = BUILTINS[id]?.needsKey ?? true;
    const apiKey = await resolveApiKey(id);
    if (needsKey && !apiKey) {
      return { ok: false, provider: id, error: 'No API key stored — add a key first' };
    }
    const result = await probeProvider(view, apiKey);
    return { provider: id, ...result };
  });
}
