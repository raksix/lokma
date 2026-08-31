import type { FastifyInstance } from 'fastify';

/**
 * Vault graph — Phase 0 stub (empty), Phase 1 reads vault/lokma/**.
 * See Docs/28 §4 and Docs/29.
 */

export async function vaultRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/vault/graph', async () => {
    return { nodes: [], links: [], note: 'Phase 0 stub — graph in Phase 2' };
  });

  app.get('/api/vault/tree', async () => {
    return { tree: null, note: 'Phase 0 stub' };
  });
}
