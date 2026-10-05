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
import { LOOP_DEFAULT_TURN_TIMEOUT_MS } from '../agent-loop.js';
import { runLoopTurn, loopSessionId } from '../loops/executor.js';
import { pumpSessionRun } from './ws.js';

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
 *  - `POST /api/loops/:id/run`                fire ONE turn now — answers 202 (background)
 *  - `POST /api/loops/:id/pause`             user stop → `paused` + `stopReason: 'stopped'`
 *  - `POST /api/loops/:id/resume`            `paused → running`
 *  - `DELETE /api/loops/:id`                 remove the loop's directory
 *
 * `POST /:id/run` (REQ-201) hands the turn to `loops/executor.ts`, which
 * rides the existing session queue through `pumpSessionRun` — the SAME run
 * path the chat socket uses, never a second one. It answers 202 without
 * awaiting the turn: a loop turn is a full agent turn (180s ceiling) and the
 * live proxy reads `/api/` for 60s, so a synchronous answer would 504 on a
 * run that is really spending tokens. Refusals stay synchronous (404/409) so
 * a rejected click is reported as a rejection, not as an accepted run.
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

  app.post('/api/loops/:id/run', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { force?: unknown };
    let loop;
    try {
      assertLoopIdShape(id);
      // Read the record FIRST so the refusal surface is the real one: an
      // unknown id is a 404, not a 202 followed by a background failure the
      // user never sees.
      loop = await getLoopDetail(id).then((d) => d.loop);
    } catch (e) {
      return loopErr(reply, e);
    }
    if (loop.status === 'done' || loop.status === 'error') {
      return loopErr(reply, new LoopError('loop_terminal', `loop is ${loop.status} — start a new run instead (history is kept)`));
    }
    if (loop.status === 'running') {
      return loopErr(reply, new LoopError('already_running', 'a turn is already in flight — wait for it to finish', 409));
    }
    // REQ-201: answer 202 and let the turn run in the BACKGROUND.
    //
    // This route deliberately does NOT await the turn. A loop turn is a full
    // agent turn — up to LOOP_DEFAULT_TURN_TIMEOUT_MS (180s) — while the live
    // reverse proxy reads /api/ for 60s. A synchronous answer therefore ends in
    // a 504 while the turn keeps burning real tokens: the user is told "nothing
    // happened" about a run that is genuinely happening. 202 + the record is
    // the honest shape; progress is read back from GET /api/loops/:id.
    const force = body.force === true;
    void runLoopTurn(id, {
      pump: (sessionId, cwd) => {
        // `pumpSessionRun` is re-entrant (it returns while another call owns
        // the run), so this is safe even if a socket turn already holds the
        // session: the queued prompt is drained by whichever pump is running.
        void pumpSessionRun(app, sessionId, cwd).catch((e) => {
          app.log.warn('[loops] pump failed loop=' + id + ': ' + String(e));
        });
      },
      timeoutMs: LOOP_DEFAULT_TURN_TIMEOUT_MS,
      force,
    })
      .then((result) => {
        app.log.info(
          '[loops] turn settled loop=' + id + ' started=' + String(result.started) +
            ' reason=' + result.reason + ' stop=' + String(result.stopReason ?? '-'),
        );
      })
      .catch((e) => {
        // runLoopTurn books its own failures; reaching here means the setup
        // itself threw (bad cwd, unwritable dir). Log it — never swallow.
        app.log.error('[loops] turn failed loop=' + id + ': ' + String(e));
      });
    return reply.status(202).send({ accepted: true, loop, sessionId: loopSessionId(id) });
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
