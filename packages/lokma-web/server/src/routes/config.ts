import type { FastifyInstance } from 'fastify';
import { loadConfig, saveGlobal } from 'lokma-core';
import { getMaskedCredentials } from 'lokma-core';
import { GlobalConfigSchema } from 'lokma-shared';

/**
 * Config routes — masked, same files as CLI.
 * See Docs/26-CONFIG-and-CREDENTIALS §6
 */

export async function configRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/config — merged global + project + env, keys masked
  app.get('/api/config', async (req) => {
    const cwd = (req.query as { cwd?: string })?.cwd ?? process.cwd();
    const cfg = await loadConfig(cwd);
    const creds = await getMaskedCredentials();
    return { config: cfg, credentials: creds };
  });

  // GET /api/config/effective — same as /api/config but explicit
  app.get('/api/config/effective', async (req) => {
    const cwd = (req.query as { cwd?: string })?.cwd ?? process.cwd();
    const cfg = await loadConfig(cwd);
    const creds = await getMaskedCredentials();
    return { effective: { ...cfg, _credentials: creds } };
  });

  // PATCH /api/config — validates against GlobalConfigSchema, persists to
  // ~/.lokma/config.json via saveGlobal (same file the CLI reads).
  app.patch('/api/config', async (req, reply) => {
    const patch = req.body as Record<string, unknown>;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return reply.code(400).send({ ok: false, code: 'bad_request', message: 'Invalid patch body' });
    }
    const parsed = GlobalConfigSchema.partial().safeParse(patch);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      return reply.code(400).send({ ok: false, code: 'validation_error', message: detail });
    }
    await saveGlobal(parsed.data);
    // Echo only the keys zod actually kept (unknown keys are stripped by the
    // schema, so reporting the raw patch would claim phantom writes).
    return { ok: true, patched: Object.keys(parsed.data) };
  });
}
