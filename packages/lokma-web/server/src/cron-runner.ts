import type { FastifyInstance } from 'fastify';
import {
  appendRunRecord,
  assertAgentIdShape,
  assertJobIdShape,
  CronError,
  estimateCost,
  estimateTokens,
  listAgentCronJobs,
  listCronJobs,
  mintRunId,
  recordJobRun,
  requireAgent,
  selectDueJobs,
  SessionStore,
  UsageLedger,
  type CronRunRecord,
  type CronTrigger,
} from 'lokma-core';
import type { CronJob } from 'lokma-shared';
import { stream as aiStream } from 'lokma-ai';
import { resolveProviderUpstream } from './routes/providers.js';

/**
 * Agent-runner daemon, wave 1: cron firing (Phase 1).
 * `fireCronJob()` runs one job end-to-end — resolves the agent, opens a
 * real session seeded with the job's task, streams the agent's model via
 * the shared `lokma-ai stream()` (same path as WS chat, never a stub),
 * persists both transcript sides, records usage, stamps `lastRunAt`, and
 * appends a `CronRunRecord`. Failures are RECORDED (`status: failed`),
 * never thrown past the run boundary (validation 404s still throw).
 * `startCronTicker()` fires due jobs every `intervalMs` (at-most-once per
 * minute per job via `selectDueJobs` + an in-flight guard). The ticker
 * starts in `index.ts` only — `createApp()` stays side-effect free so
 * in-process probes never fire on their own.
 */

/** Fire one cron job now — shared by the ticker (schedule) + Run-now (manual). */
export async function fireCronJob(
  app: FastifyInstance,
  agentId: string,
  jobId: string,
  trigger: CronTrigger,
): Promise<{ job: CronJob; run: CronRunRecord }> {
  assertAgentIdShape(agentId);
  assertJobIdShape(jobId);
  const agent = await requireAgent(agentId);
  const jobs = await listAgentCronJobs(agentId);
  const job = jobs.find((j) => j.id === jobId);
  if (!job) {
    throw new CronError('cron_not_found', `no cron job ${jobId} for agent ${agentId}`, 404);
  }

  const cwd = agent.cwd ?? process.cwd();
  const store = new SessionStore(cwd);
  const sessionId = `cron-${job.id}-${Date.now().toString(36)}`;
  const startedAt = new Date().toISOString();
  const provider = agent.model.split('/')[0] ?? 'anthropic';

  await store.writeMeta(sessionId, { model: agent.model, title: `cron · ${job.task.slice(0, 80)}` });
  await store.append(sessionId, { role: 'user', content: job.task, timestamp: startedAt });

  let status: CronRunRecord['status'] = 'ok';
  let chars = 0;
  let error: string | undefined;
  let upstream: { provider: 'anthropic' | 'openai'; baseUrl: string; apiKey: string | null };
  try {
    upstream = await resolveProviderUpstream(provider);
  } catch (e) {
    upstream = { provider: provider === 'anthropic' ? 'anthropic' : 'openai', baseUrl: '', apiKey: null };
    status = 'failed';
    error = String(e instanceof Error ? e.message : e).slice(0, 500);
  }
  if (status !== 'failed') {
  try {
    let full = '';
    for await (const chunk of aiStream({
      provider: upstream.provider,
      model: agent.model,
      messages: [{ role: 'user', content: job.task }],
      apiKey: upstream.apiKey,
      baseUrl: upstream.baseUrl,
    })) {
      if (chunk.type === 'text_delta') full += chunk.delta;
      else if (chunk.type === 'done') break;
    }
    chars = full.length;
    await store.append(sessionId, { role: 'assistant', content: full, timestamp: new Date().toISOString() });
    // Same accounting as WS chat — best-effort, never breaks the run.
    try {
      const inputTokens = estimateTokens(job.task.length);
      const outputTokens = estimateTokens(full.length);
      const { costUsd, priced } = estimateCost(agent.model, inputTokens, outputTokens);
      await new UsageLedger(cwd).record({
        sessionId,
        provider,
        model: agent.model,
        inputTokens,
        outputTokens,
        costUsd,
        priced,
      });
    } catch (e) {
      app.log.warn(`[cron] usage record failed job=${job.id}: ${String(e)}`);
    }
  } catch (e) {
    // No key / unknown provider / outage — the run is failed EVIDENCE,
    // with the user prompt still in the session for a manual retry.
    status = 'failed';
    error = String(e).slice(0, 500);
    app.log.warn(`[cron] fire failed job=${job.id}: ${error}`);
  }
  }

  const finishedAt = new Date().toISOString();
  const run: CronRunRecord = {
    runId: mintRunId(),
    jobId: job.id,
    agentId,
    sessionId,
    trigger,
    startedAt,
    finishedAt,
    status,
    chars,
    ...(error ? { error } : {}),
  };
  // The stamp is best-effort (a job deleted mid-run must not eat the record).
  try {
    await recordJobRun(job.id, finishedAt);
  } catch (e) {
    app.log.warn(`[cron] lastRunAt stamp failed job=${job.id}: ${String(e)}`);
  }
  await appendRunRecord(run);
  const refreshed = (await listAgentCronJobs(agentId)).find((j) => j.id === jobId) ?? {
    ...job,
    lastRunAt: finishedAt,
    updatedAt: finishedAt,
  };
  app.log.info(`[cron] fired job=${job.id} trigger=${trigger} status=${status} session=${sessionId}`);
  return { job: refreshed, run };
}

/**
 * Start the firing loop. Returns a stop function (the server never calls
 * it — the process owns the ticker for its whole life).
 */
export function startCronTicker(app: FastifyInstance, intervalMs = 30_000): () => void {
  const firing = new Set<string>();
  const tick = async (): Promise<void> => {
    let jobs: CronJob[];
    try {
      jobs = await listCronJobs();
    } catch (e) {
      app.log.warn(`[cron] tick list failed: ${String(e)}`);
      return;
    }
    const due = selectDueJobs(jobs, new Date());
    for (const job of due) {
      if (firing.has(job.id)) continue;
      firing.add(job.id);
      fireCronJob(app, job.agentId, job.id, 'schedule')
        .catch((e) => app.log.warn(`[cron] scheduled fire failed job=${job.id}: ${String(e)}`))
        .finally(() => firing.delete(job.id));
    }
    if (due.length > 0) app.log.info(`[cron] tick fired ${due.length} due job(s)`);
  };
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  return () => clearInterval(timer);
}
