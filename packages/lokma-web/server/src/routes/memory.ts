import type { FastifyInstance } from 'fastify';
import { MemoryError, memoryAdd, memoryRemove, memoryReplace, readMemoryEntries } from 'lokma-core';

/**
 * Global memory — the §-delimited MEMORY.md / USER.md store behind the
 * agent `memory` tool (Docs/28 §5.2), now reachable over REST:
 * `GET /api/memory?target=` (entries + live `chars/limit` usage),
 * `POST /api/memory { target?, content }` (add, exact-dup idempotent),
 * `PATCH /api/memory { target?, old_text, content }` (replace),
 * `DELETE /api/memory { target?, old_text }` (remove).
 * Overflow answers 409 `memory_full` with the repair hint (the agent
 * self-repairs in the same turn); 0 matches 404 `no_match`; 2+ matches
 * 409 `ambiguous_match`. All failures answer `{ code, message }`.
 * Per-agent SOUL/MEMORY.md editing stays on `GET|PUT /api/agents/:id/soul|memory`
 * (that route owns the agent-scoped files; this one owns the global store).
 */
export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/memory', async (req, reply) => {
    const query = req.query as { target?: unknown };
    try {
      const usage = await readMemoryEntries(query.target ?? 'memory');
      return { ok: true, ...usage };
    } catch (e) {
      if (e instanceof MemoryError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/memory', async (req, reply) => {
    const body = (req.body ?? {}) as { target?: unknown; content?: unknown };
    try {
      const target = body.target ?? 'memory';
      await memoryAdd(
        target as 'memory' | 'user',
        body.content as string,
      );
      const usage = await readMemoryEntries(target);
      return { ok: true, ...usage };
    } catch (e) {
      if (e instanceof MemoryError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.patch('/api/memory', async (req, reply) => {
    const body = (req.body ?? {}) as { target?: unknown; old_text?: unknown; content?: unknown };
    try {
      const target = body.target ?? 'memory';
      await memoryReplace(
        target as 'memory' | 'user',
        body.old_text as string,
        body.content as string,
      );
      const usage = await readMemoryEntries(target);
      return { ok: true, ...usage };
    } catch (e) {
      if (e instanceof MemoryError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.delete('/api/memory', async (req, reply) => {
    const body = (req.body ?? {}) as { target?: unknown; old_text?: unknown };
    try {
      const target = body.target ?? 'memory';
      await memoryRemove(target as 'memory' | 'user', body.old_text as string);
      const usage = await readMemoryEntries(target);
      return { ok: true, ...usage };
    } catch (e) {
      if (e instanceof MemoryError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });
}
