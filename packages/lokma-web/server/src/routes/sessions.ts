import type { FastifyInstance } from 'fastify';
import { SessionStore } from 'lokma-core';

/**
 * Sessions — JSONL same files as CLI (SessionStore).
 * Fork copies the transcript on disk (CLI `--resume <newId>` sees it too);
 * PATCH persists per-session model/title in the `<id>.meta.json` sidecar;
 * rewind truncates the transcript (server-side checkpoint restore);
 * merge appends one transcript into another; DELETE removes both files.
 * `GET /api/sessions` returns enriched summaries (title/model/counts/dates)
 * for the Sessions sidebar — same shape as `SessionSummary` in lokma-core.
 * See Docs/22 §sessions.
 */

/** Same id shape as POST /api/sessions (no central helper yet — keep in sync). */
function newSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function assertSessionId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !SESSION_ID_PATTERN.test(id)) {
    throw Object.assign(new Error('Invalid session id'), { statusCode: 400, code: 'bad_session_id' });
  }
}

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sessions', async (req) => {
    const cwd = (req.query as { cwd?: string })?.cwd ?? process.cwd();
    const store = new SessionStore(cwd);
    const sessions = await store.listSummaries();
    return { sessions, count: sessions.length };
  });

  app.get('/api/sessions/:id', async (req) => {
    const { id } = req.params as { id: string };
    assertSessionId(id);
    const cwd = (req.query as { cwd?: string })?.cwd ?? process.cwd();
    const store = new SessionStore(cwd);
    const messages = await store.read(id);
    const meta = await store.readMeta(id);
    return { id, cwd, model: meta?.model ?? null, messages, count: messages.length };
  });

  app.post('/api/sessions', async (req) => {
    const body = req.body as { cwd?: string; model?: string } | undefined;
    const cwd = body?.cwd ?? process.cwd();
    const id = newSessionId();
    // Create empty session file by appending a system marker (not a user message)
    const store = new SessionStore(cwd);
    await store.append(id, { role: 'assistant', content: `Session ${id} created`, timestamp: new Date().toISOString() });
    if (typeof body?.model === 'string' && body.model) {
      await store.writeMeta(id, { model: body.model });
    }
    return { ok: true, id, cwd };
  });

  app.post('/api/sessions/:id/fork', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      assertSessionId(id);
    } catch {
      return reply.status(400).send({ code: 'bad_session_id', message: 'Invalid session id' });
    }
    const cwd = (req.query as { cwd?: string })?.cwd ?? process.cwd();
    const store = new SessionStore(cwd);
    const existing = await store.read(id);
    if (existing.length === 0) {
      return reply.status(404).send({ code: 'session_not_found', message: `No transcript for ${id}` });
    }
    const forked = await store.fork(id, newSessionId());
    return { ok: true, id: forked.id, from: id, copied: forked.copied };
  });

  app.patch('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      assertSessionId(id);
    } catch {
      return reply.status(400).send({ code: 'bad_session_id', message: 'Invalid session id' });
    }
    const body = (req.body ?? {}) as { model?: unknown; title?: unknown };
    const patch: { model?: string; title?: string } = {};
    if (body.model !== undefined) {
      if (typeof body.model !== 'string' || !body.model.trim()) {
        return reply.status(400).send({ code: 'bad_model', message: 'PATCH needs { model: "<provider>/<id>" }' });
      }
      patch.model = body.model.trim();
    }
    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 120) {
        return reply.status(400).send({ code: 'bad_title', message: 'PATCH needs { title: "<1-120 chars>" }' });
      }
      patch.title = body.title.trim();
    }
    if (Object.keys(patch).length === 0) {
      return reply.status(400).send({ code: 'bad_patch', message: 'PATCH needs { model } and/or { title }' });
    }
    const cwd = (req.query as { cwd?: string })?.cwd ?? process.cwd();
    const store = new SessionStore(cwd);
    const meta = await store.writeMeta(id, patch);
    return { ok: true, id, model: meta.model, title: meta.title ?? null };
  });

  app.delete('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      assertSessionId(id);
    } catch {
      return reply.status(400).send({ code: 'bad_session_id', message: 'Invalid session id' });
    }
    const cwd = (req.query as { cwd?: string })?.cwd ?? process.cwd();
    const store = new SessionStore(cwd);
    const result = await store.remove(id);
    if (!result.existed) {
      return reply.status(404).send({ code: 'session_not_found', message: `No transcript for ${id}` });
    }
    return { ok: true, id };
  });

  app.post('/api/sessions/:id/merge', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      assertSessionId(id);
    } catch {
      return reply.status(400).send({ code: 'bad_session_id', message: 'Invalid session id' });
    }
    const body = (req.body ?? {}) as { from?: unknown };
    if (typeof body.from !== 'string' || !SESSION_ID_PATTERN.test(body.from)) {
      return reply.status(400).send({ code: 'bad_merge', message: 'POST needs { from: "<sessionId>" }' });
    }
    const cwd = (req.query as { cwd?: string })?.cwd ?? process.cwd();
    const store = new SessionStore(cwd);
    try {
      const result = await store.merge(id, body.from);
      return { ok: true, ...result };
    } catch (e) {
      const err = e as { statusCode?: number; code?: string; message?: string };
      const status = err.statusCode === 400 ? 400 : 404;
      return reply
        .status(status)
        .send({ code: err.code ?? 'session_not_found', message: err.message ?? 'Merge failed' });
    }
  });

  app.post('/api/sessions/:id/rewind', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      assertSessionId(id);
    } catch {
      return reply.status(400).send({ code: 'bad_session_id', message: 'Invalid session id' });
    }
    const body = (req.body ?? {}) as { keepMessages?: unknown };
    const keep = typeof body.keepMessages === 'number' ? body.keepMessages : NaN;
    if (!Number.isFinite(keep) || keep < 0) {
      return reply.status(400).send({ code: 'bad_rewind', message: 'POST needs { keepMessages: <non-negative int> }' });
    }
    const cwd = (req.query as { cwd?: string })?.cwd ?? process.cwd();
    const store = new SessionStore(cwd);
    const result = await store.rewind(id, Math.floor(keep));
    return { ok: true, id: result.id, kept: result.kept };
  });
}
