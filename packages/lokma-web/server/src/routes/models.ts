import type { FastifyInstance } from 'fastify';
import { getCatalog } from 'lokma-ai';

/**
 * Models route — merged catalog from all providers, 5m cache.
 * See Docs/22 §models and Docs/26 cache/models.json
 */

export async function modelRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/models', async () => {
    const models = await getCatalog();
    return { models, count: models.length, cached: true };
  });
}
