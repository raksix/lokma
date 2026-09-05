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
  renderShareHtml,
} from 'lokma-core';

/**
 * Observability — agent trace timeline + frozen share snapshots (W6-24)
 * + public share pages (Phase 3 sharing).
 * `GET /api/agents/:id/trace` derives every event from durable state
 * (registry + SOUL/MEMORY mtimes + advisory locks + createdBy lineage) —
 * nothing is invented, so a fresh agent honestly shows a 1-event timeline.
 * `POST /api/share/agent|session` freezes the trace/transcript into
 * `~/.lokma/shares/<token>.json`; `GET /api/share/:token` serves the frozen
 * copy (later edits never rewrite shared history); `DELETE` drops it.
 * `GET /share/:token` serves the same frozen copy as a PUBLIC self-contained
 * HTML page (no login — the token is unguessable `sh_` + 128-bit hex; nginx
 * proxies `/share/` straight to this server without basic auth). Unknown
 * tokens get branded HTML 404, malformed tokens HTML 400 — never JSON, so
 * pasted links always render something readable. `GET /share/:kind/:token`
 * 302-redirects the pre-Phase-3 `/share/agent|session/<token>` shape to the
 * canonical `/share/<token>`.
 * All API failures use `{ code, message }` (the web ApiError shape).
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
      return { ok: true, token: record.token, url: `/share/${record.token}` };
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
      return { ok: true, token: record.token, url: `/share/${record.token}` };
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

  // Public share page — self-contained HTML, no login (nginx proxies
  // `/share/` here without basic auth; the token itself is the secret).
  app.get('/share/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    try {
      const share = await getShare(token);
      return reply.type('text/html; charset=utf-8').send(renderShareHtml(share));
    } catch (e) {
      const err = toCodedError(e);
      const status = err ? err.status : 500;
      return reply
        .status(status)
        .type('text/html; charset=utf-8')
        .send(renderShareHtml(null));
    }
  });

  // Legacy `/share/agent|session/<token>` links (copied before Phase 3
  // sharing) redirect to the canonical page; anything else is a 404 page.
  app.get('/share/:kind/:token', async (req, reply) => {
    const { kind, token } = req.params as { kind: string; token: string };
    if (kind === 'agent' || kind === 'session') {
      return reply.redirect(`/share/${token}`);
    }
    return reply.status(404).type('text/html; charset=utf-8').send(renderShareHtml(null));
  });
}
