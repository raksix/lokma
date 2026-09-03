import type { FastifyInstance } from 'fastify';
import {
  ArchifyError,
  compareDiagrams,
  exportDiagram,
  generateDiagram,
  getDiagram,
  guideStarter,
  listDiagrams,
  updateDiagram,
  validateIr,
} from 'lokma-core';

/**
 * Archify — typed IR → validated deterministic HTML/SVG (W5-17, Docs/31).
 * `POST /api/archify/generate { type, prompt, preset?, theme? }` (starter IR
 * derived from the prompt, validated before it touches disk);
 * `POST /api/archify/validate { ir }` (5 atomic gates, always 200);
 * `GET /api/archify/list` (newest first);
 * `GET /api/archify/:id` (IR + receipt + viewer HTML);
 * `PUT /api/archify/:id { ir }` (pane JSON editor — validates, rebuilds);
 * `POST /api/archify/:id/delta { baseId }` (Before/Delta/After);
 * `GET /api/archify/:id/export?format=svg|html|json|card` (real file
 * downloads — PNG/WebM need headless Chromium and are a follow-up, so the
 * pane only offers what exists here; no dead buttons).
 * All failures answer `{ code, message }` (never raw keys or stacks).
 */

export async function archifyRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/archify/generate', async (req, reply) => {
    const body = (req.body ?? {}) as { type?: unknown; prompt?: unknown; preset?: unknown; theme?: unknown };
    try {
      const { id, ir } = await generateDiagram(body.type, body.prompt, body.preset, body.theme);
      return { ok: true, id, ir };
    } catch (e) {
      if (e instanceof ArchifyError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/archify/validate', async (req) => {
    const body = (req.body ?? {}) as { ir?: unknown };
    // Validate never 4xx on bad IR — `ok` carries validity, the pane shows
    // the receipt table either way.
    return validateIr(body.ir);
  });

  app.get('/api/archify/list', async () => {
    const { items, count } = await listDiagrams();
    return { items, count };
  });

  app.get('/api/archify/:id/guide', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { topic?: unknown };
    try {
      const { ir } = await getDiagram(id);
      const topic = typeof query.topic === 'string' && query.topic.trim() ? query.topic : ir.title;
      return { ok: true, id, starter: guideStarter(topic) };
    } catch (e) {
      if (e instanceof ArchifyError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/archify/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return { ok: true, ...(await getDiagram(id)) };
    } catch (e) {
      if (e instanceof ArchifyError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.put('/api/archify/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { ir?: unknown };
    try {
      return { ok: true, ...(await updateDiagram(id, body.ir)) };
    } catch (e) {
      if (e instanceof ArchifyError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/archify/:id/delta', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { baseId?: unknown };
    try {
      if (typeof body.baseId !== 'string' || !body.baseId) {
        throw new ArchifyError('bad_base', 'baseId must be a non-empty string', 400);
      }
      return { ok: true, ...(await compareDiagrams(id, body.baseId)) };
    } catch (e) {
      if (e instanceof ArchifyError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/archify/:id/export', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { format?: unknown };
    try {
      const { filename, contentType, body } = await exportDiagram(id, query.format);
      return reply
        .header('Content-Type', contentType)
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(body);
    } catch (e) {
      if (e instanceof ArchifyError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  // Stable viewer URL — the pane iframes this (deep-link hashes work on a
  // real URL; srcDoc cannot carry one). Inline, never an attachment.
  app.get('/api/archify/:id/view', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const { html } = await getDiagram(id);
      return reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
    } catch (e) {
      if (e instanceof ArchifyError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });
}
