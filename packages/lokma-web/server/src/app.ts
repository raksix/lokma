import Fastify from 'fastify';
import { registerCors, registerWebsocket } from './plugins/index.js';
import { healthRoutes } from './routes/health.js';
import { configRoutes } from './routes/config.js';
import { providerRoutes } from './routes/providers.js';
import { modelRoutes } from './routes/models.js';
import { sessionRoutes } from './routes/sessions.js';
import { usageRoutes } from './routes/usage.js';
import { commandRoutes } from './routes/commands.js';
import { agentRoutes } from './routes/agents.js';
import { skillRoutes } from './routes/skills.js';
import { vaultRoutes } from './routes/vault.js';
import { fileRoutes } from './routes/files.js';
import { gitRoutes } from './routes/git.js';
import { terminalRoutes } from './routes/terminal.js';
import { browserRoutes } from './routes/browser.js';
import { archifyRoutes } from './routes/archify.js';
import { designRoutes } from './routes/design.js';
import { testsRoutes } from './routes/tests.js';
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
  await usageRoutes(app);
  await commandRoutes(app);
  await agentRoutes(app);
  await skillRoutes(app);
  await vaultRoutes(app);
  await fileRoutes(app);
  await gitRoutes(app);
  await terminalRoutes(app);
  await browserRoutes(app);
  await archifyRoutes(app);
  await designRoutes(app);
  await testsRoutes(app);
  await wsRoutes(app);

  return app;
}
