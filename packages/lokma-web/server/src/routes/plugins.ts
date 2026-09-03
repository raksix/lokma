import type { FastifyInstance } from 'fastify';
import {
  PluginError,
  deletePlugin,
  getPlugin,
  installPluginFromUrl,
  listPlugins,
  setPluginEnabled,
  suspendedPrefixes,
} from 'lokma-core';

/**
 * Plugins — kernel registry for the Plugins pane (W6-23, Docs/23).
 * `GET /api/plugins` (bundled manifests with REAL endpoint lists +
 * URL-installed records); `GET /api/plugins/:id` (manifest detail);
 * `PATCH /api/plugins/:id { enabled }` (hot toggle — the suspension
 * guard below reads live state, no restart); `POST /api/plugins/install
 * { url }` (strict https validation, stored suspended, no fetch);
 * `DELETE /api/plugins/:id` (URL records only — bundled are
 * 400 `bundled_readonly`).
 * Suspended plugins answer 503 `plugin_disabled` on their owned route
 * prefixes (the toggle is enforced, never a dead switch).
 * All failures answer `{ code, message }`.
 */

/** Suspended-prefix cache — refreshed on every mutation in-process (the only writer is this server). */
let guardCache: { prefix: string; id: string }[] | null = null;

async function refreshGuard(): Promise<void> {
  guardCache = await suspendedPrefixes();
}

function pluginErr(reply: { status: (n: number) => { send: (b: unknown) => unknown } }, e: unknown) {
  if (e instanceof PluginError) return reply.status(e.status).send({ code: e.code, message: e.message });
  throw e;
}

export async function pluginsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    const raw = req.raw.url ?? req.url;
    const path = raw.split('?')[0];
    if (!path.startsWith('/api/') || path.startsWith('/api/plugins')) return;
    if (guardCache === null) await refreshGuard();
    const hit = (guardCache ?? []).find(
      (g) => path === g.prefix || path.startsWith(`${g.prefix}/`),
    );
    if (hit) {
      return reply.status(503).send({
        code: 'plugin_disabled',
        message: `Plugin '${hit.id}' is suspended — enable it in the Plugins pane`,
      });
    }
  });

  app.get('/api/plugins', async () => {
    const { plugins, count } = await listPlugins();
    return { plugins, count };
  });

  app.get('/api/plugins/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const plugin = await getPlugin(id);
      if (!plugin) return reply.status(404).send({ code: 'plugin_not_found', message: `Plugin '${id}' not found` });
      return { ok: true, plugin };
    } catch (e) {
      return pluginErr(reply, e);
    }
  });

  app.patch('/api/plugins/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { enabled?: unknown };
    if (body.enabled === undefined) {
      return reply.status(400).send({ code: 'empty_patch', message: 'enabled is required (boolean)' });
    }
    try {
      const plugin = await setPluginEnabled(id, body.enabled);
      await refreshGuard();
      return { ok: true, plugin };
    } catch (e) {
      return pluginErr(reply, e);
    }
  });

  app.post('/api/plugins/install', async (req, reply) => {
    const body = (req.body ?? {}) as { url?: unknown };
    try {
      const plugin = await installPluginFromUrl(body.url);
      await refreshGuard();
      return { ok: true, plugin };
    } catch (e) {
      return pluginErr(reply, e);
    }
  });

  app.delete('/api/plugins/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const { id: deleted } = await deletePlugin(id);
      await refreshGuard();
      return { ok: true, id: deleted };
    } catch (e) {
      return pluginErr(reply, e);
    }
  });
}
