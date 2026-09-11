import type { FastifyInstance } from 'fastify';
import { FileError, WorkspaceFiles } from '@lokma/core';

/**
 * Workspace files — real file-system access for the FileBrowser pane (W3-9).
 * `GET /api/files` (one-level tree + git overlay),
 * `GET /api/files/read` (capped content + full-file sha),
 * `GET /api/files/raw` (binary preview: images/pdf/html, 415 otherwise),
 * `GET /api/files/download` (any jailed file as attachment),
 * `GET /api/files/search` (fuzzy quick-open),
 * `POST /api/files/write` (atomic save with `expectedSha` lost-update guard).
 * Every path is jailed to `?cwd=` (outside escapes → 400 `outside_root`);
 * keys/secrets are never involved (file bytes only, same process user).
 * See Docs/24 §file browser.
 */

function files(cwd: unknown): WorkspaceFiles {
  return new WorkspaceFiles(typeof cwd === 'string' && cwd ? cwd : process.cwd());
}

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/files', async (req, reply) => {
    const query = req.query as { cwd?: unknown; path?: unknown };
    try {
      const rel = query.path === undefined ? '.' : query.path;
      if (typeof rel !== 'string') {
        return reply.status(400).send({ code: 'bad_path', message: 'path must be a string' });
      }
      return { ok: true, ...(await files(query.cwd).list(rel)) };
    } catch (e) {
      if (e instanceof FileError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/files/read', async (req, reply) => {
    const query = req.query as { cwd?: unknown; path?: unknown };
    if (typeof query.path !== 'string' || !query.path.trim()) {
      return reply.status(400).send({ code: 'bad_path', message: 'read needs ?path=<workspace file>' });
    }
    try {
      return { ok: true, ...(await files(query.cwd).read(query.path)) };
    } catch (e) {
      if (e instanceof FileError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/files/raw', async (req, reply) => {
    // REQ-075: raw bytes for binary preview (pdf/images) + sandboxed html.
    // Jailed to ?cwd=, 10MB cap, MIME from a fixed extension map (never
    // probed content). Auth model matches /read (open instance: open).
    const query = req.query as { cwd?: unknown; path?: unknown };
    if (typeof query.path !== 'string' || !query.path.trim()) {
      return reply.status(400).send({ code: 'bad_path', message: 'raw needs ?path=<workspace file>' });
    }
    const ext = query.path.toLowerCase().split('.').pop() ?? '';
    const mime: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      html: 'text/html; charset=utf-8',
      htm: 'text/html; charset=utf-8',
    };
    const type = mime[ext];
    if (!type) {
      return reply.status(415).send({ code: 'no_preview', message: `No binary preview for .${ext || '?'} files` });
    }
    try {
      const raw = await files(query.cwd).readRaw(query.path);
      return reply.type(type).send(raw.bytes);
    } catch (e) {
      if (e instanceof FileError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/files/download', async (req, reply) => {
    // REQ-125: real download for ANY jailed file (preview map is images/pdf/
    // html only — downloading .md/.ts/.json through /raw 415s). Same jail +
    // 10MB cap as /raw; octet-stream + attachment so the browser saves it.
    const query = req.query as { cwd?: unknown; path?: unknown };
    if (typeof query.path !== 'string' || !query.path.trim()) {
      return reply.status(400).send({ code: 'bad_path', message: 'download needs ?path=<workspace file>' });
    }
    try {
      const raw = await files(query.cwd).readRaw(query.path);
      const name = String(query.path).split('/').pop() || 'download';
      return reply
        .type('application/octet-stream')
        .header('content-disposition', `attachment; filename="${name.replace(/["\r\n]/g, '_')}"`)
        .send(raw.bytes);
    } catch (e) {
      if (e instanceof FileError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/files/search', async (req, reply) => {
    const query = req.query as { cwd?: unknown; q?: unknown; max?: unknown };
    try {
      return { ok: true, ...(await files(query.cwd).search(query.q, query.max)) };
    } catch (e) {
      if (e instanceof FileError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/files/write', async (req, reply) => {
    const body = (req.body ?? {}) as { cwd?: unknown; path?: unknown; content?: unknown; expectedSha?: unknown };
    if (typeof body.path !== 'string' || !body.path.trim()) {
      return reply.status(400).send({ code: 'bad_path', message: 'write needs { path, content }' });
    }
    try {
      const result = await files(body.cwd).write(body.path, body.content, body.expectedSha);
      return { ok: true, ...result };
    } catch (e) {
      if (e instanceof FileError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  // REQ-120: delete one file or dir tree (jailed, see WorkspaceFiles.remove).
  app.delete('/api/files', async (req, reply) => {
    const query = req.query as { cwd?: unknown; path?: unknown };
    if (typeof query.path !== 'string' || !query.path.trim()) {
      return reply.status(400).send({ code: 'bad_path', message: 'delete needs ?path=<workspace file>' });
    }
    try {
      return { ok: true, ...(await files(query.cwd).remove(query.path)) };
    } catch (e) {
      if (e instanceof FileError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  // REQ-120: rename/move inside the workspace (both paths jailed).
  app.post('/api/files/rename', async (req, reply) => {
    const body = (req.body ?? {}) as { cwd?: unknown; oldPath?: unknown; newPath?: unknown };
    if (typeof body.oldPath !== 'string' || !body.oldPath.trim() || typeof body.newPath !== 'string' || !body.newPath.trim()) {
      return reply.status(400).send({ code: 'bad_path', message: 'rename needs { oldPath, newPath }' });
    }
    try {
      return { ok: true, ...(await files(body.cwd).rename(body.oldPath, body.newPath)) };
    } catch (e) {
      if (e instanceof FileError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });
}
