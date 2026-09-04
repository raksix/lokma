import type { FastifyInstance } from 'fastify';
import { VaultError, buildGraph, deleteNote, ingestNote, readNote, readTree, searchNotesDetailed } from 'lokma-core';

/**
 * File vault — real markdown notes under `~/.lokma/vault/` for the VaultPane (W4-15).
 * `GET /api/vault/graph?folder=&depth=&q=` (seeded graph + BFS over resolved
 * `[[wikilink]]` edges, depth 1-3, `count` of returned nodes);
 * `GET /api/vault/search?q=&folder=` (FTS5 full-text hits with BM25 score +
 * snippet, `engine` names the answering engine — cheaper than `graph` for
 * typeaheads, which is why the global SearchModal uses it);
 * `GET /api/vault/tree?folder=` (nested dirs + notes, path-sorted);
 * `GET /api/vault/note?path=` (full note read for wikilink clicks);
 * `POST /api/vault/ingest { path, content, provenance? }` (writes a `.md`
 * note, `provenance:` records the ingesting agent id);
 * `DELETE /api/vault/note?path=` (removes a `.md` note — the undo for
 * ingest; unknown notes 404, non-`.md` paths 400, jail keeps `rm` inside
 * the vault root).
 * All failures answer `{ code, message }` (never raw keys or stacks).
 * See Docs/28 §vault and Docs/29 (file vault wins, no Obsidian daemon).
 */

export async function vaultRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/vault/graph', async (req, reply) => {
    const query = req.query as { folder?: unknown; depth?: unknown; q?: unknown };
    try {
      const graph = await buildGraph({
        folder: query.folder ?? '',
        depth: query.depth ?? '',
        q: query.q ?? '',
      });
      return { ok: true, ...graph };
    } catch (e) {
      if (e instanceof VaultError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/vault/search', async (req, reply) => {
    const query = req.query as { q?: unknown; folder?: unknown };
    try {
      const folder = typeof query.folder === 'string' ? query.folder : '';
      const { hits, engine } = await searchNotesDetailed(query.q ?? '', folder);
      return { ok: true, q: typeof query.q === 'string' ? query.q : '', folder, hits, count: hits.length, engine };
    } catch (e) {
      if (e instanceof VaultError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/vault/tree', async (req, reply) => {
    const query = req.query as { folder?: unknown };
    try {
      const tree = await readTree(typeof query.folder === 'string' ? query.folder : '');
      return { ok: true, tree };
    } catch (e) {
      if (e instanceof VaultError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/vault/note', async (req, reply) => {
    const query = req.query as { path?: unknown };
    try {
      return { ok: true, ...(await readNote(query.path)) };
    } catch (e) {
      if (e instanceof VaultError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/vault/ingest', async (req, reply) => {
    const body = (req.body ?? {}) as { path?: unknown; content?: unknown; provenance?: unknown };
    try {
      return { ok: true, ...(await ingestNote(body.path, body.content, body.provenance)) };
    } catch (e) {
      if (e instanceof VaultError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.delete('/api/vault/note', async (req, reply) => {
    const query = req.query as { path?: unknown };
    try {
      return { ok: true, ...(await deleteNote(query.path)) };
    } catch (e) {
      if (e instanceof VaultError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });
}
