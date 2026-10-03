import type { FastifyInstance } from 'fastify';
import {
  DesignError,
  appendArtifactVersion,
  critiqueArtifact,
  deleteArtifact,
  exportArtifact,
  exportArtifactPng,
  exportArtifactWebm,
  generateArtifact,
  getArtifact,
  installDesignSystem,
  listArtifactVersions,
  listArtifacts,
  listDesignSkills,
  listDesignSystems,
  listDesignTemplates,
  readDesignGuard,
  revertArtifact,
  runTweak,
  updateArtifactHtml,
  useDesignSystem,
} from '@lokma/core';
import { expandPromptMentions } from '../utils/context-blocks.js';

/**
 * Design Studio — 6 artifact types over bundled systems (W5-18, Docs/34).
 * `POST /api/design/generate { type, brief, system?, model? }` (REQ-177:
 * the HTML comes from a REAL model call — the request's model, else the
 * configured default; critiqued before it touches disk);
 * `GET /api/design/list?cwd=` (newest first; REQ-178: scoped to a project
 * cwd when given, else the global `~/.lokma/design/artifacts` root);
 * `GET /api/design/systems` (the INSTALLED package catalog — reads
 * `~/.lokma/design/systems/<id>/manifest.json`, labelled bundled when empty —
 * plus taxonomy + `POST /api/design/systems { source }` to install one and
 * `POST /api/design/systems/:id/use { cwd }` to activate it in the project);
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
    const body = (req.body ?? {}) as { type?: unknown; brief?: unknown; system?: unknown; model?: unknown; cwd?: unknown; skills?: unknown; template?: unknown };
    try {
      // REQ-188 — the brief rides the shared ComposerInput, so `@path` mentions
      // are real context now: read them into `<context>` blocks against the
      // SAME project cwd the artifact is stored in, instead of handing the
      // model a bare filename. Unreadable paths are skipped, never fatal.
      const cwd = typeof body.cwd === 'string' ? body.cwd : process.cwd();
      const brief =
        typeof body.brief === 'string' ? await expandPromptMentions(cwd, body.brief) : body.brief;
      // REQ-192 — `skills` is the design-skill axis (how it looks) and
      // `template` the template axis (which document shape ships). They are
      // resolved separately in core: the ids become the real SKILL.md bodies
      // before the prompt is built.
      const { id, manifest, critique } = await generateArtifact(body.type, brief, body.system, body.model, body.cwd, body.skills, body.template);
      return { ok: true, id, manifest, critique };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  // ── REQ-192: the design SKILL catalog ───────────────────────────────────────
  // The SECOND, separate axis beside `/systems`: a system is a palette, a skill
  // is a `SKILL.md` instruction set. Rows come from the real skill registry,
  // filtered to `scope: design` — a scopeless skill is never listed, and
  // `unscoped` reports how many were excluded so the UI can say why.
  app.get('/api/design/skills', async () => {
    return { ok: true, ...(await listDesignSkills()) };
  });

  // ── REQ-192 slice 3: the design TEMPLATE catalog ────────────────────────────
  // The THIRD axis: a template is the OUTPUT SKELETON (which document shape
  // ships), not a palette and not a style. Rows come from a real directory scan
  // (repo `design-templates/` + `~/.lokma/design/templates`), so the catalog
  // grows by dropping a directory in — there is no frozen table behind it.
  app.get('/api/design/templates', async () => {
    return { ok: true, ...(await listDesignTemplates()) };
  });

  app.get('/api/design/list', async (req, reply) => {
    const query = req.query as { cwd?: unknown };
    try {
      const { items, count, project, root } = await listArtifacts(query.cwd);
      return { items, count, project, root };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  // ── REQ-191: the design-system CATALOG ─────────────────────────────────────
  // `GET` reads the installed packages (`~/.lokma/design/systems/*/manifest.json`),
  // not a frozen table; `source` says which one the caller is looking at so a
  // bundled fallback is never presented as a catalog. `POST` installs one
  // package (SSRF/zip guards live in core, once); `POST :id/use` activates it
  // by copying DESIGN.md + tokens.css into the project `.lokma/` — the very
  // files `GET /api/design/guard` already reads, so the choice is visible in
  // generation without a second reader.
  app.get('/api/design/systems', async () => {
    return { ok: true, ...(await listDesignSystems()) };
  });

  app.post('/api/design/systems', async (req, reply) => {
    const body = (req.body ?? {}) as { source?: unknown };
    try {
      const installed = await installDesignSystem(body.source);
      return reply.status(201).send({ ok: true, ...installed });
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/design/systems/:id/use', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { cwd?: unknown };
    try {
      return { ok: true, ...(await useDesignSystem(id, body.cwd)) };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
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
    const query = req.query as { cwd?: unknown };
    try {
      return { ok: true, ...(await getArtifact(id, query.cwd)) };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  // REQ-190: the manual Code-tab edit is a mutating write like any tweak, so
  // it takes the SAME optimistic lock (409 `stale_version`) instead of
  // silently overwriting a body the pane never loaded. A stale edit is refused
  // rather than applied on top of an unseen change.
  app.put('/api/design/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { html?: unknown; cwd?: unknown; expectedSha?: unknown };
    try {
      return { ok: true, ...(await updateArtifactHtml(id, body.html, body.cwd, body.expectedSha)) };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/design/:id/critique', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { cwd?: unknown };
    try {
      return { ok: true, ...(await critiqueArtifact(id, query.cwd)) };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  // ── REQ-190: tweak in place, read the history, undo a version ──────────────
  // The tweak lands as the NEXT version of THIS artifact — a new artifact id
  // is never created, so the list does not grow and the old design is not
  // "lost". `expectedSha` is the optimistic lock (409 `stale_version`).
  app.post('/api/design/:id/tweak', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { note?: unknown; model?: unknown; cwd?: unknown; expectedSha?: unknown };
    try {
      const result = await runTweak(
        {
          read: async () => {
            const detail = await getArtifact(id, body.cwd);
            return { type: detail.manifest.type, system: detail.manifest.system, html: detail.html, sha: detail.sha };
          },
          append: async (html, note, model) =>
            appendArtifactVersion(id, html, { origin: 'tweak', note, model }, body.cwd, body.expectedSha),
        },
        { noteRaw: body.note, modelRaw: body.model, expectedShaRaw: body.expectedSha },
      );
      return { ok: true, ...result };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  // History for the version picker. A pre-REQ-190 artifact answers
  // `versions: []` + `currentVersion: 0` — honest, never a faked v1.
  app.get('/api/design/:id/versions', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { cwd?: unknown };
    try {
      return { ok: true, ...(await listArtifactVersions(id, query.cwd)) };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/design/:id/revert', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { version?: unknown; cwd?: unknown };
    try {
      return { ok: true, ...(await revertArtifact(id, body.version, body.cwd)) };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.delete('/api/design/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { cwd?: unknown };
    try {
      const { id: deleted } = await deleteArtifact(id, query.cwd);
      return { ok: true, id: deleted };
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/design/:id/export', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { format?: unknown; scale?: unknown; cwd?: unknown };
    try {
      if (query.format === 'png') {
        // `?scale=` arrives as a string — garbage becomes NaN → bad_scale 400.
        const scale = query.scale === undefined ? undefined : { scale: Number(query.scale) };
        const png = await exportArtifactPng(id, scale, query.cwd);
        return reply
          .header('Content-Type', png.contentType)
          .header('Content-Disposition', `attachment; filename="${png.filename}"`)
          .header('X-Image-Width', String(png.width))
          .header('X-Image-Height', String(png.height))
          .send(png.body);
      }
      if (query.format === 'webm') {
        const webm = await exportArtifactWebm(id, query.cwd);
        return reply
          .header('Content-Type', webm.contentType)
          .header('Content-Disposition', `attachment; filename="${webm.filename}"`)
          .header('X-Video-Width', String(webm.width))
          .header('X-Video-Height', String(webm.height))
          .header('X-Video-Fps', String(webm.fps))
          .header('X-Video-Frames', String(webm.frames))
          .send(webm.body);
      }
      const { filename, contentType, body } = await exportArtifact(id, query.format, query.cwd);
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
    const query = req.query as { cwd?: unknown };
    try {
      const { manifest, html } = await getArtifact(id, query.cwd);
      void manifest;
      return reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
    } catch (e) {
      if (e instanceof DesignError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });
}
