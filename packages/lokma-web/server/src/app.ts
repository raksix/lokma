import Fastify from 'fastify';
import { registerCors, registerWebsocket } from './plugins/index.js';
import { healthRoutes } from './routes/health.js';
import { configRoutes } from './routes/config.js';
import { providerRoutes } from './routes/providers.js';
import { modelRoutes } from './routes/models.js';
import { sessionRoutes } from './routes/sessions.js';
import { agentRoutes } from './routes/agents.js';
import { skillRoutes } from './routes/skills.js';
import { vaultRoutes } from './routes/vault.js';
import { wsRoutes } from './routes/ws.js';

/**
 * Create Fastify app — registers all plugins + routes.
 * DRY: server and CLI both call createApp() (don't duplicate route lists).
 */
export async function createApp(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: true });

  await registerCors(app);
  await registerWebsocket(app);

  await healthRoutes(app);
  await configRoutes(app);
  await providerRoutes(app);
  await modelRoutes(app);
  await sessionRoutes(app);
  await agentRoutes(app);
  await skillRoutes(app);
  await vaultRoutes(app);
  await wsRoutes(app);

  return app;
}
