import type { FastifyInstance } from 'fastify';

/**
 * GET /health — liveness probe for PM2/nginx.
 * No auth, no DB — just proves the process is up.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return { ok: true, service: 'lokma-server', version: '0.0.1', uptime: process.uptime() };
  });

  app.get('/api/health', async () => {
    return { ok: true, service: 'lokma-server', version: '0.0.1' };
  });
}
