import type { FastifyInstance } from 'fastify';
import {
  ApprovalError,
  assertAgentExists,
  assertAgentIdShape,
  createCronJob,
  CronError,
  deleteCronJob,
  listAgentCronJobs,
  listApprovalDecisions,
  listCronJobs,
  updateCronJob,
} from 'lokma-core';

/**
 * Per-agent cron + approvals for the CronApprovals pane (W6-25,
 * Docs/30 §5 cron per agent + §6 human-in-the-loop).
 * `GET /api/cron` (all jobs, newest first — pane header counts),
 * `GET /api/agents/:id/cron` (one agent's jobs, 404 unknown agent),
 * `POST /api/agents/:id/cron { schedule, task, enabled? }` (server mints
 * the id; bad schedules fail closed with 400 `bad_schedule`),
 * `PATCH /api/agents/:id/cron/:jobId` (schedule/task/enabled subset,
 * empty → 400 `empty_patch`), `DELETE` (unknown → 404, never silent),
 * `GET /api/approvals` (newest-first WS decision history — the log fills
 * as real `permission_response` / `ask_response` frames arrive; the
 * Allow/Deny/Always RULES live in `PATCH /api/config` permissions, the
 * same store the chat card writes — one store, two views).
 * Firing jobs (a daemon) is a later wave: `lastRunAt` stays null.
 * All failures answer `{ code, message }` (never raw stacks or secrets).
 */

function cronErr(reply: { status: (n: number) => { send: (b: unknown) => unknown } }, e: unknown) {
  if (e instanceof CronError) return reply.status(e.status).send({ code: e.code, message: e.message });
  if (e instanceof ApprovalError) return reply.status(e.status).send({ code: e.code, message: e.message });
  throw e;
}

export async function cronRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/cron', async () => {
    const jobs = await listCronJobs();
    return { jobs, count: jobs.length };
  });

  app.get('/api/agents/:id/cron', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      assertAgentIdShape(id);
      await assertAgentExists(id);
      const jobs = await listAgentCronJobs(id);
      return { jobs, count: jobs.length, agentId: id };
    } catch (e) {
      return cronErr(reply, e);
    }
  });

  app.post('/api/agents/:id/cron', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { schedule?: unknown; task?: unknown; enabled?: unknown };
    try {
      const job = await createCronJob(id, body);
      return { ok: true, job };
    } catch (e) {
      return cronErr(reply, e);
    }
  });

  app.patch('/api/agents/:id/cron/:jobId', async (req, reply) => {
    const { id, jobId } = req.params as { id: string; jobId: string };
    const body = (req.body ?? {}) as { schedule?: unknown; task?: unknown; enabled?: unknown };
    try {
      const job = await updateCronJob(id, jobId, body);
      return { ok: true, job };
    } catch (e) {
      return cronErr(reply, e);
    }
  });

  app.delete('/api/agents/:id/cron/:jobId', async (req, reply) => {
    const { id, jobId } = req.params as { id: string; jobId: string };
    try {
      const { id: deleted } = await deleteCronJob(id, jobId);
      return { ok: true, id: deleted };
    } catch (e) {
      return cronErr(reply, e);
    }
  });

  app.get('/api/approvals', async (req) => {
    const query = req.query as { limit?: unknown };
    const limit = typeof query.limit === 'string' && query.limit.trim() !== '' ? Number(query.limit) : 100;
    const decisions = await listApprovalDecisions(Number.isSafeInteger(limit) ? (limit as number) : 100);
    return { decisions, count: decisions.length };
  });
}
