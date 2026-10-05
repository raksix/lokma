import type { FastifyInstance } from 'fastify';
import {
  assertLoopIdShape,
  createLoop,
  deleteLoop,
  getLoopDetail,
  listLoops,
  listProjectLoops,
  LoopError,
  setLoopStatus,
  stopLoop,
  updateLoop,
} from '@lokma/core';
import { LoopCreateSchema, LoopPatchSchema } from '@lokma/shared';

/**
 * Harness-owned loops API (REQ-200). Backed by
 * `~/.lokma/loops/<id>/state.json` + `ledger.md` — one directory per loop.
 *
 * Routes:
 *  - `GET  /api/loops`                       all loops, newest first (`[]` when empty)
 *  - `GET  /api/loops?projectId=<id|->`      project-scoped view (REQ-203 reads this)
 *  - `GET  /api/loops/:id`                   one record (404 unknown, never silent)
 *  - `GET  /api/loops/:id/detail`            record + ledger tail + ledger path (console drawer)
 *  - `POST /api/loops`                       create in `draft` (server mints the id)
 *  - `PATCH /api/loops/:id`                  editable fields only — status/spent are NOT patchable
 *  - `POST /api/loops/:id/pause`             user stop → `paused` + `stopReason: 'stopped'`
 *  - `POST /api/loops/:id/resume`            `paused → running`
 *  - `DELETE /api/loops/:id`                 remove the loop's directory
 *
 * NOT here on purpose: starting an iteration. Firing runs belongs to the
 * executor (REQ-201) — this wave only owns records, budgets and history, so
 * nothing can burn tokens before that slice lands and is reviewed.
 *
 * All failures answer `{ code, message }` (never raw stacks or secrets).
 * Every route below `/api/*` inherits the global login gate (REQ-076).
 */

function loopErr(reply: { status: (n: number) => { send: (b: unknown) => unknown } }, e: unknown) {
  if (e instanceof LoopError) return reply.status(e.status).send({ code: e.code, message: e.message });
  throw e;
}

export async function loopRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/loops', async (req) => {
    const query = req.query as { projectId?: string } | undefined;
    const projectId = query?.projectId;
    const loops = projectId === undefined ? await listLoops() : await listProjectLoops(projectId === '-' ? null : projectId);
    return { loops, count: loops.length };
  });

  app.get('/api/loops/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      assertLoopIdShape(id);
      const { loop } = await getLoopDetail(id);
      return { loop };
    } catch (e) {
      return loopErr(reply, e);
    }
  });

  app.get('/api/loops/:id/detail', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      assertLoopIdShape(id);
      return await getLoopDetail(id);
    } catch (e) {
      return loopErr(reply, e);
    }
  });

  app.post('/api/loops', async (req, reply) => {
    const parsed = LoopCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ code: 'bad_body', message: parsed.error.issues[0]?.message ?? 'invalid body' });
    }
    try {
      const loop = await createLoop(parsed.data);
      return reply.status(201).send({ loop });
    } catch (e) {
      return loopErr(reply, e);
    }
  });

  app.patch('/api/loops/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = LoopPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ code: 'bad_body', message: parsed.error.issues[0]?.message ?? 'invalid body' });
    }
    try {
      assertLoopIdShape(id);
      const loop = await updateLoop(id, parsed.data);
      return { loop };
    } catch (e) {
      return loopErr(reply, e);
    }
  });

  app.post('/api/loops/:id/pause', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      assertLoopIdShape(id);
      const loop = await stopLoop(id);
      return { loop };
    } catch (e) {
      return loopErr(reply, e);
    }
  });

  app.post('/api/loops/:id/resume', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      assertLoopIdShape(id);
      const loop = await setLoopStatus(id, 'running');
      return { loop };
    } catch (e) {
      return loopErr(reply, e);
    }
  });

  app.delete('/api/loops/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      assertLoopIdShape(id);
      return await deleteLoop(id);
    } catch (e) {
      return loopErr(reply, e);
    }
  });
}
