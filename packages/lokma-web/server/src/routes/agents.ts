import type { FastifyInstance } from 'fastify';
import { getAgent, listAgents, listLocks, listWorktrees } from 'lokma-core';

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

  /**
   * Per-agent 3-layer safety state for the GitPane banner (W3-11) and the
   * future AgentHub (W4): live advisory locks owned by this agent
   * (expired leases split out, never silently dropped) + the agent's
   * worktree paths under `?cwd=`. Unknown agent ids still answer with
   * `agent: null` + empty locks (the banner shows "no locks", not a 404).
   */
  app.get('/api/agents/:id/locks', async (req) => {
    const { id } = req.params as { id: string };
    const query = req.query as { cwd?: unknown };
    const cwd = typeof query.cwd === 'string' && query.cwd ? query.cwd : process.cwd();
    const [agent, all, worktrees] = await Promise.all([
      getAgent(id),
      listLocks(),
      listWorktrees(cwd).catch(() => [] as string[]),
    ]);
    const now = Date.now();
    const owned = all.filter((l) => l.owner === id);
    return {
      ok: true,
      agentId: id,
      agent: agent ?? null,
      locks: owned.filter((l) => l.leaseUntil > now),
      expired: owned.filter((l) => l.leaseUntil <= now).length,
      worktrees: worktrees.filter((w) => w.endsWith(`/${id}`) || w === id),
    };
  });
}
