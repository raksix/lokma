import type { FastifyInstance } from 'fastify';
import {
  AgentError,
  ShareError,
  buildAgentTrace,
  createAgentShare,
  createSessionShare,
  deleteShare,
  getShare,
  listShares,
} from 'lokma-core';

/**
 * Observability — agent trace timeline + frozen share snapshots (W6-24).
 * `GET /api/agents/:id/trace` derives every event from durable state
 * (registry + SOUL/MEMORY mtimes + advisory locks + createdBy lineage) —
 * nothing is invented, so a fresh agent honestly shows a 1-event timeline.
 * `POST /api/share/agent|session` freezes the trace/transcript into
 * `~/.lokma/shares/<token>.json`; `GET /api/share/:token` serves the frozen
 * copy (later edits never rewrite shared history); `DELETE` drops it.
 * All failures use `{ code, message }` (the web ApiError shape).
 * See Docs/24 §orchestration + Docs/36 §sharing.
 */

type CodedError = { code: string; status: number; message: string };

function toCodedError(e: unknown): CodedError | null {
  if (e instanceof AgentError || e instanceof ShareError) {
    return { code: e.code, status: e.status, message: e.message };
  }
  return null;
}

export async function observabilityRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/agents/:id/trace', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const trace = await buildAgentTrace(id);
      return { ...trace };
    } catch (e) {
      const err = toCodedError(e);
      if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
      throw e;
    }
  });

  app.get('/api/share', async () => {
    const shares = await listShares();
    return { shares, count: shares.length };
  });

  app.post('/api/share/agent', async (req, reply) => {
    const body = (req.body ?? {}) as { agentId?: unknown };
    try {
      const record = await createAgentShare(body.agentId);
      return { ok: true, token: record.token, url: `/share/agent/${record.token}` };
    } catch (e) {
      const err = toCodedError(e);
      if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
      throw e;
    }
  });

  app.post('/api/share/session', async (req, reply) => {
    const body = (req.body ?? {}) as { sessionId?: unknown; cwd?: unknown };
    const cwd = typeof body.cwd === 'string' && body.cwd ? body.cwd : process.cwd();
    try {
      const record = await createSessionShare(body.sessionId, cwd);
      return { ok: true, token: record.token, url: `/share/session/${record.token}` };
    } catch (e) {
      const err = toCodedError(e);
      if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
      throw e;
    }
  });

  app.get('/api/share/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    try {
      const share = await getShare(token);
      return { share };
    } catch (e) {
      const err = toCodedError(e);
      if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
      throw e;
    }
  });

  app.delete('/api/share/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    try {
      await deleteShare(token);
      return { ok: true, token };
    } catch (e) {
      const err = toCodedError(e);
      if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
      throw e;
    }
  });
}
