import type { FastifyInstance } from 'fastify';
import { BrowserError, browserTabs } from 'lokma-core';

/**
 * Browser tabs — per-agent tab registry for the BrowserPane (W3-12).
 * `POST /api/browser/open` opens a tab (`{ tabId }` + record) tagged with the
 * owning agent/session; `GET /api/browser` lists (filter `?sessionId=`);
 * `POST /api/browser/:id/navigate {url}` pushes real history (forward entries
 * dropped, like a browser); `POST /:id/back|/forward` step the history
 * pointer (409 `no_history` at the edge); `POST /:id/reload` touches the tab
 * (the client re-sets the frame); `DELETE /api/browser/:id` forgets it.
 * Pages render live in the user's browser (sandboxed iframe) — REST only owns
 * tabs + history, never page bytes.
 * See Docs/24 §browser pane.
 */

type OpenBody = {
  url?: unknown;
  agentId?: unknown;
  sessionId?: unknown;
  cwd?: unknown;
};

export async function browserRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/browser/open', async (req, reply) => {
    const body = (req.body ?? {}) as OpenBody;
    try {
      const { record } = browserTabs.open({
        url: typeof body.url === 'string' ? body.url : undefined,
        agentId: typeof body.agentId === 'string' ? body.agentId : undefined,
        sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
        cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
      });
      return { ok: true, tabId: record.id, tab: record };
    } catch (e) {
      if (e instanceof BrowserError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/browser', async (req) => {
    const query = req.query as { sessionId?: unknown };
    const tabs = browserTabs.list(typeof query.sessionId === 'string' ? query.sessionId : undefined);
    return { ok: true, tabs, count: tabs.length };
  });

  app.get('/api/browser/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const { record } = browserTabs.get(id);
      return { ok: true, tab: record };
    } catch (e) {
      if (e instanceof BrowserError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/browser/:id/navigate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { url?: unknown };
    try {
      const { record } = browserTabs.navigate(id, body.url);
      return { ok: true, tab: record };
    } catch (e) {
      if (e instanceof BrowserError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/browser/:id/back', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const { record } = browserTabs.back(id);
      return { ok: true, tab: record };
    } catch (e) {
      if (e instanceof BrowserError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/browser/:id/forward', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const { record } = browserTabs.forward(id);
      return { ok: true, tab: record };
    } catch (e) {
      if (e instanceof BrowserError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/browser/:id/reload', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const { record } = browserTabs.reload(id);
      return { ok: true, tab: record };
    } catch (e) {
      if (e instanceof BrowserError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.delete('/api/browser/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = browserTabs.close(id);
      return { ok: true, id, ...result };
    } catch (e) {
      if (e instanceof BrowserError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });
}
