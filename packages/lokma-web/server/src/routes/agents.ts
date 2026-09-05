import type { FastifyInstance } from 'fastify';
import {
  AGENT_MAX_AGENTS,
  AGENT_MAX_CONCURRENT,
  AGENT_MAX_QUEUE,
  AgentError,
  cloneAgent,
  createAgent,
  deleteAgent,
  forkAgent,
  getAgent,
  killAgent,
  listAgents,
  listLocks,
  listWorktrees,
  pauseAgent,
  readAgentDoc,
  resumeAgent,
  updateAgent,
  writeAgentDoc,
} from 'lokma-core';

/**
 * Agents — registry CRUD + lifecycle for the AgentHub pane (W4-13).
 * `POST /api/agents` creates (409 `agent_exists`, 429 `agent_limit`);
 * `PATCH /api/agents/:id` edits name/model/budgets; `POST /:id/pause|resume|kill`
 * move the lifecycle state (409 on illegal transitions — terminal states
 * completed/failed/killed reject pause/kill); `POST /:id/fork|clone` copy the
 * agent dir into a fresh id (state idle); `DELETE` removes it (404 unknown).
 * `GET|PUT /api/agents/:id/soul|memory` edit the real SOUL.md / MEMORY.md
 * files under `~/.lokma/agents/<id>/`.
 * All failures use `{ code, message }` (the web ApiError shape).
 * See Docs/30-AGENT-SYSTEM §2, §5, §12
 */

function toAgentError(e: unknown): { code: string; status: number; message: string } | null {
  if (e instanceof AgentError) return { code: e.code, status: e.status, message: e.message };
  return null;
}

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/agents', async () => {
    const agents = await listAgents();
    return {
      agents,
      count: agents.length,
      caps: { maxAgents: AGENT_MAX_AGENTS, maxConcurrent: AGENT_MAX_CONCURRENT, maxQueue: AGENT_MAX_QUEUE },
    };
  });

  app.post('/api/agents', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const agent = await createAgent({
        ...(typeof body.id === 'string' ? { id: body.id } : {}),
        name: typeof body.name === 'string' ? body.name : '',
        ...(typeof body.persona === 'string' ? { persona: body.persona } : {}),
        ...(typeof body.model === 'string' ? { model: body.model } : {}),
        ...(typeof body.cwd === 'string' ? { cwd: body.cwd } : {}),
        ...(body.budgets !== undefined ? { budgets: body.budgets as { tokens?: unknown; usd?: unknown } } : {}),
        ...(typeof body.soul === 'string' ? { soul: body.soul } : {}),
        ...(typeof body.memory === 'string' ? { memory: body.memory } : {}),
        ...(typeof body.createdBy === 'string' ? { createdBy: body.createdBy } : {}),
      });
      return { ok: true, agent };
    } catch (e) {
      const err = toAgentError(e);
      if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
      throw e;
    }
  });

  app.get('/api/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const agent = await getAgent(id);
    if (!agent) return reply.status(404).send({ code: 'agent_not_found', message: `Agent '${id}' not found` });
    return { agent };
  });

  app.patch('/api/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const agent = await updateAgent(id, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.model !== undefined ? { model: body.model } : {}),
        ...(body.budgets !== undefined ? { budgets: body.budgets } : {}),
      });
      return { ok: true, agent };
    } catch (e) {
      const err = toAgentError(e);
      if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
      throw e;
    }
  });

  app.delete('/api/agents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await deleteAgent(id);
      return { ok: true, id };
    } catch (e) {
      const err = toAgentError(e);
      if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
      throw e;
    }
  });

  for (const action of ['pause', 'resume', 'kill'] as const) {
    app.post(`/api/agents/:id/${action}`, async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const agent = action === 'pause' ? await pauseAgent(id) : action === 'resume' ? await resumeAgent(id) : await killAgent(id);
        return { ok: true, action, agent };
      } catch (e) {
        const err = toAgentError(e);
        if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
        throw e;
      }
    });
  }

  for (const action of ['fork', 'clone'] as const) {
    app.post(`/api/agents/:id/${action}`, async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const agent = action === 'fork' ? await forkAgent(id) : await cloneAgent(id);
        return { ok: true, action, from: id, agent };
      } catch (e) {
        const err = toAgentError(e);
        if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
        throw e;
      }
    });
  }

  for (const doc of ['soul', 'memory'] as const) {
    const file = doc === 'soul' ? 'SOUL.md' : 'MEMORY.md';
    app.get(`/api/agents/:id/${doc}`, async (req, reply) => {
      const { id } = req.params as { id: string };
      try {
        const content = await readAgentDoc(id, file);
        return { ok: true, id, doc: file, content };
      } catch (e) {
        const err = toAgentError(e);
        if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
        throw e;
      }
    });
    app.put(`/api/agents/:id/${doc}`, async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = (req.body ?? {}) as { content?: unknown };
      try {
        const bytes = await writeAgentDoc(id, file, body.content as string);
        return { ok: true, id, doc: file, bytes };
      } catch (e) {
        const err = toAgentError(e);
        if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
        throw e;
      }
    });
  }

  /**
   * Per-agent 3-layer safety state for the GitPane banner (W3-11) and the
   * AgentHub (W4): live advisory locks owned by this agent
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
