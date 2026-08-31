import type { FastifyInstance } from 'fastify';
import { getMaskedCredentials } from 'lokma-core';
import { providerRegistry } from 'lokma-ai';

/**
 * Provider routes — masked keys + registry list.
 * See Docs/22-WEB-FEATURES §providers
 */

export async function providerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/providers', async () => {
    const creds = await getMaskedCredentials();
    const providers = providerRegistry.list().map((p) => ({
      id: p.id,
      enabled: true,
      keySet: creds[p.id]?.keySet ?? false,
      last4: creds[p.id]?.last4 ?? null,
    }));
    return { providers };
  });

  app.post('/api/providers/:id/test', async (req) => {
    const { id } = req.params as { id: string };
    const adapter = providerRegistry.get(id);
    if (!adapter) return { ok: false, error: `Unknown provider: ${id}` };
    // Phase 0: mock test — real key validation in Phase 1
    return { ok: true, provider: id, note: 'Phase 0 mock — real test in Phase 1' };
  });
}
