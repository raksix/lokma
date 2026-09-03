import type { FastifyInstance } from 'fastify';
import { FileError, WorkspaceFiles } from 'lokma-core';

/**
 * Workspace files — real file-system access for the FileBrowser pane (W3-9).
 * `GET /api/files` (one-level tree + git overlay),
 * `GET /api/files/read` (capped content + full-file sha),
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
}
