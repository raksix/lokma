import { z } from 'zod';

/**
 * Per-agent cron jobs + human-in-the-loop approval decisions (W6-25,
 * Docs/30 §5 cron per agent + §6 approvals). Zod is the single source —
 * the server validates writes, the web imports these types via `api.ts`.
 * Deep schedule validation lives in `lokma-core` (pure, probe-covered);
 * the schema only guards the wire shape so bad payloads fail closed.
 */

export const CronJobSchema = z.object({
  id: z.string().min(1).max(64),
  agentId: z.string().min(1).max(128),
  /** 5-field standard cron (`minute hour dom month dow`). */
  schedule: z.string().min(1).max(100),
  /** What the run should do (prompt handed to the agent runner). */
  task: z.string().min(1).max(500),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Last fire time — null until the agent runner wave fires a job. */
  lastRunAt: z.string().datetime().nullable(),
  /** Next computed fire time — null when disabled or none within a year. */
  nextRunAt: z.string().datetime().nullable(),
});

export type CronJob = z.infer<typeof CronJobSchema>;

export const CronCreateSchema = z.object({
  schedule: z.string().min(1).max(100),
  task: z.string().min(1).max(500),
  enabled: z.boolean().optional(),
});

export type CronCreate = z.infer<typeof CronCreateSchema>;

export const CronPatchSchema = z
  .object({
    schedule: z.string().min(1).max(100).optional(),
    task: z.string().min(1).max(500).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => v.schedule !== undefined || v.task !== undefined || v.enabled !== undefined, {
    message: 'empty patch — send schedule, task, or enabled',
  });

export type CronPatch = z.infer<typeof CronPatchSchema>;

export const ApprovalDecisionSchema = z.object({
  id: z.string().min(1).max(64),
  at: z.string().datetime(),
  /** `ws` = a real WS answer; `manual` reserved for future pane writes. */
  source: z.enum(['ws', 'manual']),
  sessionId: z.string().min(1).max(128),
  kind: z.enum(['permission', 'question']),
  requestId: z.string().min(1).max(128),
  decision: z.enum(['allow', 'deny', 'always']).optional(),
  /** ask_response answer text (truncated server-side, never a secret). */
  answer: z.string().max(500).optional(),
});

export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
