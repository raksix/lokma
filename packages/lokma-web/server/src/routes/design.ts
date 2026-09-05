import type { FastifyInstance } from 'fastify';
import {
  DESIGN_SYSTEM_META,
  DesignError,
  critiqueArtifact,
  deleteArtifact,
  exportArtifact,
  exportArtifactPng,
  exportArtifactWebm,
  generateArtifact,
  getArtifact,
  listArtifacts,
  readDesignGuard,
  updateArtifactHtml,
} from 'lokma-core';

/**
 * Design Studio — 6 artifact types over bundled systems (W5-18, Docs/34).
 * `POST /api/design/generate { type, brief, system? }` (starter HTML
 * derived from the brief, critiqued before it touches disk);
 * `GET /api/design/list` (newest first);
 * `GET /api/design/systems` (4 bundled cards + project guard hint);
 * `GET /api/design/guard?cwd=` (real `.lokma/DESIGN.md` parse, always 200);
 * `GET /api/design/:id` (manifest + HTML + last critique);
 * `PUT /api/design/:id { html }` (pane Code tab — validates, re-critiques);
 * `DELETE /api/design/:id` (removes the whole on-disk dir — unknown 404,
 * bad shape 400);
 * `POST /api/design/:id/critique` (re-runs the 5D heuristic, always 200);
 * `GET /api/design/:id/export?format=html|zip|json|png|webm[&scale=1|2]` (real
 * file downloads — PNG rasterizes the stored HTML with headless Chromium,
 * WebM encodes a 2s slow-zoom clip with Chromium + ffmpeg, both answering
 * `needs_toolchain` 400 when a binary is missing;
 * pdf/pptx/mp4 need a binary toolchain and answer 400 `needs_toolchain`,
 * so the pane only offers what exists here; no dead buttons);
 * `GET /api/design/:id/view` (stable viewer URL — the pane iframes this;
 * deep state lives in the URL, srcDoc cannot carry it). Inline, never an
 * attachment.
 * All failures answer `{ code, message }` (never raw keys or stacks).
 */

export async function designRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/design/generate', async (req, reply) => {
    const body = (req.body ?? {}) as { type?: unknown; brief?: unknown; system?: unknown };
    try {
      const { id, manifest, critique } = await generateArtifact(body.type, body.brief, body.system);
      return { ok: true, id, manifest, critique };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/design/list', async () => {
    const { items, count } = await listArtifacts();
    return { items, count };
  });

  app.get('/api/design/systems', async () => {
    return { ok: true, systems: Object.values(DESIGN_SYSTEM_META) };
  });

  app.get('/api/design/guard', async (req, reply) => {
    const query = req.query as { cwd?: unknown };
    try {
      // Guard never 4xx on a missing DESIGN.md — `guard.present`/`guard.ok`
      // carry it. Only an unusable `cwd` argument is a client error.
      return { ok: true, guard: await readDesignGuard(query.cwd) };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/design/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return { ok: true, ...(await getArtifact(id)) };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.put('/api/design/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { html?: unknown };
    try {
      return { ok: true, ...(await updateArtifactHtml(id, body.html)) };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/design/:id/critique', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return { ok: true, ...(await critiqueArtifact(id)) };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.delete('/api/design/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const { id: deleted } = await deleteArtifact(id);
      return { ok: true, id: deleted };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/design/:id/export', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { format?: unknown; scale?: unknown };
    try {
      if (query.format === 'png') {
        // `?scale=` arrives as a string — garbage becomes NaN → bad_scale 400.
        const scale = query.scale === undefined ? undefined : { scale: Number(query.scale) };
        const png = await exportArtifactPng(id, scale);
        return reply
          .header('Content-Type', png.contentType)
          .header('Content-Disposition', `attachment; filename="${png.filename}"`)
          .header('X-Image-Width', String(png.width))
          .header('X-Image-Height', String(png.height))
          .send(png.body);
      }
      if (query.format === 'webm') {
        const webm = await exportArtifactWebm(id);
        return reply
          .header('Content-Type', webm.contentType)
          .header('Content-Disposition', `attachment; filename="${webm.filename}"`)
          .header('X-Video-Width', String(webm.width))
          .header('X-Video-Height', String(webm.height))
          .header('X-Video-Fps', String(webm.fps))
          .header('X-Video-Frames', String(webm.frames))
          .send(webm.body);
      }
      const { filename, contentType, body } = await exportArtifact(id, query.format);
      return reply
        .header('Content-Type', contentType)
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(body);
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  // Stable viewer URL — the pane iframes this (sandboxed, self-contained
  // HTML with no CDN). Inline, never an attachment.
  app.get('/api/design/:id/view', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const { manifest, html } = await getArtifact(id);
      void manifest;
      return reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });
}
