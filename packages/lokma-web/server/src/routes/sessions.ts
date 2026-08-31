import type { FastifyInstance } from 'fastify';
import { SessionStore } from 'lokma-core';

/**
 * Sessions — JSONL same files as CLI (SessionStore).
 * See Docs/22 §sessions — CLI and Web read same SessionStore.
 */

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sessions', async (req) => {
    const cwd = (req.query as { cwd?: string })?.cwd ?? process.cwd();
    const store = new SessionStore(cwd);
    const ids = await store.list();
    return { sessions: ids.map((id) => ({ id, cwd })), count: ids.length };
  });

  app.get('/api/sessions/:id', async (req) => {
    const { id } = req.params as { id: string };
    const cwd = (req.query as { cwd?: string })?.cwd ?? process.cwd();
    const store = new SessionStore(cwd);
    const messages = await store.read(id);
    return { id, cwd, messages, count: messages.length };
  });

  app.post('/api/sessions', async (req) => {
    const body = req.body as { cwd?: string; model?: string } | undefined;
    const cwd = body?.cwd ?? process.cwd();
    const id = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    // Create empty session file by appending a system marker (not a user message)
    const store = new SessionStore(cwd);
    await store.append(id, { role: 'assistant', content: `Session ${id} created`, timestamp: new Date().toISOString() });
    return { ok: true, id, cwd };
  });
}
