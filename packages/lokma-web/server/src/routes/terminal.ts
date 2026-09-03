import type { FastifyInstance } from 'fastify';
import { TerminalError, terminalManager } from 'lokma-core';

/**
 * Terminals — live shell processes for the TerminalPane (W3-10).
 * `POST /api/terminal` spawns `$SHELL` in `cwd` (must be an existing dir);
 * `GET /api/terminal` lists live + exited records (no output bytes);
 * `GET /api/terminal/:id` adds the scrollback `tail` for late-joining panes;
 * `POST /api/terminal/:id/input` writes stdin (WS `terminal/input` is the
 * hot path, this stays for CLI parity + probes);
 * `DELETE /api/terminal/:id` kills the real PID and forgets the record.
 * Output streams as WS `terminal/data`, process end as `terminal/exit`
 * (see routes/ws.ts) — REST never carries the byte flow.
 * See Docs/24 §terminal pane.
 */

type SpawnBody = {
  cwd?: unknown;
  agentId?: unknown;
  sessionId?: unknown;
  cols?: unknown;
  rows?: unknown;
};

export async function terminalRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/terminal', async (req, reply) => {
    const body = (req.body ?? {}) as SpawnBody;
    if (body.agentId !== undefined && (typeof body.agentId !== 'string' || !body.agentId.trim())) {
      return reply.status(400).send({ code: 'bad_agent', message: 'agentId must be a non-empty string' });
    }
    if (body.sessionId !== undefined && typeof body.sessionId !== 'string') {
      return reply.status(400).send({ code: 'bad_session', message: 'sessionId must be a string' });
    }
    try {
      const { record } = await terminalManager.spawn({
        cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
        agentId: typeof body.agentId === 'string' ? body.agentId : undefined,
        sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
        cols: typeof body.cols === 'number' ? body.cols : undefined,
        rows: typeof body.rows === 'number' ? body.rows : undefined,
      });
      return { ok: true, terminal: record };
    } catch (e) {
      if (e instanceof TerminalError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/terminal', async () => {
    const terminals = terminalManager.list();
    return { ok: true, terminals, count: terminals.length };
  });

  app.get('/api/terminal/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const { record, tail } = terminalManager.get(id);
      return { ok: true, terminal: record, tail };
    } catch (e) {
      if (e instanceof TerminalError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/terminal/:id/input', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { data?: unknown };
    try {
      const { bytes } = terminalManager.write(id, body.data);
      return { ok: true, id, bytes };
    } catch (e) {
      if (e instanceof TerminalError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.delete('/api/terminal/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await terminalManager.remove(id);
      return { ok: true, id, ...result };
    } catch (e) {
      if (e instanceof TerminalError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });
}
