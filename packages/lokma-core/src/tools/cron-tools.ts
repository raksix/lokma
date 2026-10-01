import { z } from 'zod';
import { CronError, createCronJob, listCronJobs } from '../cron/cron.js';
import type { ToolDefinition } from './registry.js';

/**
 * Cron tool family (REQ-181 wave 4) — the agent drives the SAME core
 * module the Cron pane's REST routes call (`cron/cron.ts`): the full job
 * list and a create that mirrors `POST /api/agents/:id/cron` field for
 * field (server-minted `c_` id, 5-field schedule validation, the owning
 * agent must exist). The `write` gate is the approval — `cron_create`
 * asks before it lands, and `plan` mode refuses it outright.
 * Failures come back as `{ ok: false, code, message }` (e.g.
 * `bad_schedule`, `agent_not_found`), never as a silent no-op.
 */

const CronListInput = z.object({});

const CronCreateInput = z.object({
  /** Owning agent — a live agent id (list them with `trace_list`). */
  agentId: z.string().min(1).max(64),
  /** 5-field cron schedule, e.g. `0 3 * * *`. */
  schedule: z.string().min(1).max(200),
  /** The prompt the agent runs on every fire. */
  task: z.string().min(1).max(4000),
  /** Create enabled (default true) or parked. */
  enabled: z.boolean().optional(),
});

export const CRON_TOOL_NAMES = ['cron_list', 'cron_create'] as const;

export function buildCronTools(): ToolDefinition[] {
  return [
    {
      name: 'cron_list',
      description:
        'List the scheduled cron jobs (per agent) with their schedule, task, enabled state and last run — the same list the Cron pane renders.',
      inputSchema: CronListInput,
      readOnly: true,
      maxResultSizeChars: 12_000,
      handler: async () => {
        try {
          const jobs = await listCronJobs();
          return { ok: true, jobs, count: jobs.length };
        } catch (e) {
          if (e instanceof CronError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
    {
      name: 'cron_create',
      description:
        'Create a scheduled job for an agent: a 5-field cron schedule plus the agent prompt task; the job fires through the server cron runner exactly like the pane create.',
      inputSchema: CronCreateInput,
      readOnly: false,
      maxResultSizeChars: 6_000,
      handler: async (input) => {
        const { agentId, schedule, task, enabled } = input as z.infer<typeof CronCreateInput>;
        try {
          const job = await createCronJob(agentId, { schedule, task, enabled });
          return { ok: true, job };
        } catch (e) {
          if (e instanceof CronError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
  ];
}
