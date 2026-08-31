import type { FastifyInstance } from 'fastify';
import { listAgents, getAgent } from 'lokma-core';

/**
 * Agents — MVP CRUD (Phase 0 lists, Phase 1 full).
 * See Docs/30-AGENT-SYSTEM §12.3
 */

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/agents', async () => {
    const agents = await listAgents();
    return { agents, count: agents.length, caps: { maxAgents: 20, maxConcurrent: 5 } };
  });

  app.get('/api/agents/:id', async (req) => {
    const { id } = req.params as { id: string };
    const agent = await getAgent(id);
    if (!agent) return { ok: false, error: 'Not found' };
    return { agent };
  });
}
