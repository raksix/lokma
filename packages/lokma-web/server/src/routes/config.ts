import type { FastifyInstance } from 'fastify';
import { loadConfig } from 'lokma-core';
import { getMaskedCredentials } from 'lokma-core';

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

  // PATCH /api/config — writes to ~/.lokma/config.json (stub, full in Phase 1)
  app.patch('/api/config', async (req) => {
    const patch = req.body as Record<string, unknown>;
    if (!patch || typeof patch !== 'object') {
      return { ok: false, error: 'Invalid patch body' };
    }
    // Phase 0: echo back — real save in Phase 1 via saveGlobal()
    return { ok: true, patched: Object.keys(patch), note: 'Phase 0 stub — save lands in Phase 1' };
  });
}
