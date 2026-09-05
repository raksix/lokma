import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

/**
 * CORS plugin — allow web (Vite SPA) to call server in dev.
 * In prod, nginx does the proxy, but keep CORS for direct :3456 access.
 */
export async function registerCors(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
}
