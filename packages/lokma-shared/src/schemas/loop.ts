import { z } from 'zod';

/**
 * Loop records (REQ-200 — the data model + persistence half of the harness-owned
 * loop wave; REQ-201 adds the executor, REQ-202 the console, REQ-203 the
 * project-scoped view).
 *
 * A loop is NOT a cron job: cron answers "run this one task at minute N"
 * (state-less), a loop carries its OWN state, budget and history and repeats a
 * task until a measured stop condition fires. Only loops created inside the
 * Lokma harness are catalogued here — Hermes' own `~/.hermes/loops/` trees are
 * deliberately out of scope and never read.
 *
 * Zod is the single source: the server validates writes against these schemas
 * and the web imports the inferred types via `api.ts`. Every field the WS
 * `loop` frame carries must exist here or the validator silently strips it.
 */

export const LOOP_STATUSES = ['draft', 'running', 'paused', 'done', 'error'] as const;
export const LoopStatusSchema = z.enum(LOOP_STATUSES);
export type LoopStatus = z.infer<typeof LoopStatusSchema>;

/** Who started the loop — the user distinction REQ-200 keeps visible. */
export const LoopOriginSchema = z.enum(['user', 'agent']);
export type LoopOrigin = z.infer<typeof LoopOriginSchema>;

/**
 * Why a loop stopped. `target_score` | `max_iters` | `max_hours` | `budget`
 * (usd cap) | `idle` (empty-turn guard, REQ-201) | `stopped` (user) |
 * `error`. Null while the loop is alive.
 */
export const LOOP_STOP_REASONS = [
  'target_score',
  'max_iters',
  'max_hours',
  'budget',
  'idle',
  'stopped',
  'error',
] as const;
export const LoopStopReasonSchema = z.enum(LOOP_STOP_REASONS);
export type LoopStopReason = z.infer<typeof LoopStopReasonSchema>;

/**
 * How the LAST measured turn went (REQ-201). `empty` is the load-bearing one:
 * it is what the idle guard counts, and the executor refuses to advance
 * `spent.iters` for it, so a turn that did nothing cannot look like progress.
 */
export const LOOP_RUN_OUTCOMES = ['ok', 'empty', 'aborted', 'error'] as const;
export const LoopRunOutcomeSchema = z.enum(LOOP_RUN_OUTCOMES);
export type LoopRunOutcome = z.infer<typeof LoopRunOutcomeSchema>;

/** Hard caps the loop stops itself at. Never raised by hand mid-run silently. */
export const LoopBudgetSchema = z.object({
  maxIters: z.number().int().min(1).max(1_000_000),
  maxHours: z.number().min(0).max(10_000),
  maxUsd: z.number().min(0).max(1_000_000),
});
export type LoopBudget = z.infer<typeof LoopBudgetSchema>;

/** Measured consumption — written by the store from run measurements only. */
export const LoopSpentSchema = z.object({
  iters: z.number().int().min(0),
  hours: z.number().min(0),
  usd: z.number().min(0),
  tokens: z.number().int().min(0),
});
export type LoopSpent = z.infer<typeof LoopSpentSchema>;

/**
 * Scores are opaque strings on purpose: a loop measures whatever its prompt
 * measures (test pass rate, gate diff, a score word in the ledger) and the
 * harness must not pretend it knows the scale. `target` + `last === target` is
 * the only comparison the store makes.
 */
export const LoopScoreSchema = z.object({
  best: z.string().max(500).nullable(),
  last: z.string().max(500).nullable(),
  target: z.string().max(500).nullable(),
});
export type LoopScore = z.infer<typeof LoopScoreSchema>;

/**
 * What makes a loop fire the NEXT iteration (REQ-201 §2).
 *
 * A loop is not a cron job, so it needs one thing cron has no answer for:
 * `interval` is measured from the loop's OWN last run, not from the wall clock,
 * so a turn that takes 9 minutes does not fire a second turn the instant it
 * ends. The calendar itself is NOT re-implemented here — `cron` reuses the
 * existing 5-field matcher in `lokma-core/src/cron/` (one calendar, two
 * concepts), which is why this is a tagged union and not a free-form string.
 */
export const LOOP_TRIGGERS = ['interval', 'cron', 'event', 'manual'] as const;
export const LoopTriggerKindSchema = z.enum(LOOP_TRIGGERS);
export type LoopTriggerKind = z.infer<typeof LoopTriggerKindSchema>;

/**
 * `cooldownSeconds` is the floor between two turns, so a fast-finishing turn
 * cannot spin: with `intervalMinutes: 10, cooldownSeconds: 60` the earliest
 * next turn is 10 minutes after the PREVIOUS one STARTED, and at least 60s
 * after the previous one FINISHED. Both halves matter — a turn that overruns
 * its interval otherwise gets its next prompt while it is still running.
 *
 * `maxEmptyIters` is the no-progress guard: an iteration in which the agent
 * neither called a tool nor wrote a line does NOT advance `spent.iters`; after
 * this many in a row the loop stops itself with `stopReason: 'idle'` rather
 * than burning its budget proving it has nothing to do.
 */
export const LoopTriggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('interval'), intervalMinutes: z.number().min(1).max(10_000) }),
  z.object({ kind: z.literal('cron'), schedule: z.string().min(1).max(120) }),
  z.object({ kind: z.literal('event'), event: z.enum(['file_changed', 'commit']), path: z.string().max(1024).nullish() }),
  z.object({ kind: z.literal('manual') }),
]);

export type LoopTrigger = z.infer<typeof LoopTriggerSchema>;

export const LoopTriggerInputSchema = z
  .object({
    kind: LoopTriggerKindSchema.optional(),
    intervalMinutes: z.number().min(1).max(10_000).nullish(),
    schedule: z.string().min(1).max(120).nullish(),
    event: z.enum(['file_changed', 'commit']).nullish(),
    path: z.string().max(1024).nullish(),
    cooldownSeconds: z.number().int().min(0).max(86_400).nullish(),
    maxEmptyIters: z.number().int().min(1).max(100).nullish(),
  })
  .strict();

export type LoopTriggerInput = z.infer<typeof LoopTriggerInputSchema>;

export const LoopSchema = z.object({
  /** Server-minted: `l_` + 8 hex. Never client-supplied. */
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  /** Null for a loop that is not project-scoped (REQ-203 groups those). */
  projectId: z.string().min(1).max(64).nullable(),
  /** Absolute workspace directory the loop works in (its lock target). */
  cwd: z.string().min(1).max(1024),
  /** Task text replayed every iteration. */
  prompt: z.string().min(1).max(20_000),
  origin: LoopOriginSchema,
  status: LoopStatusSchema,
  stopReason: LoopStopReasonSchema.nullable(),
  budget: LoopBudgetSchema,
  spent: LoopSpentSchema,
  score: LoopScoreSchema,
  /** "What is next" — written by the loop, shown verbatim in the console. */
  nextHint: z.string().max(2000).nullable(),
  /** What fires the next turn (REQ-201). `manual` until the user picks one. */
  trigger: LoopTriggerSchema,
  /** Minimum gap between turns; 0 = only the trigger decides. */
  cooldownSeconds: z.number().int().min(0).max(86_400),
  /** Consecutive no-progress turns before the loop stops itself as `idle`. */
  maxEmptyIters: z.number().int().min(1).max(100),
  /** Last measured turn outcome (REQ-201): `ok` | `empty` | `aborted` | `error`. */
  lastRunOutcome: LoopRunOutcomeSchema.nullable(),
  /** Consecutive `empty` turns — the persisted half of the idle guard. */
  emptyIters: z.number().int().min(0).max(100),
  /** When the last turn STARTED — `interval` is measured from here. */
  lastRunStartedAt: z.string().datetime().nullable(),
  model: z.string().min(1).max(200),
  reasoningEffort: z.string().min(1).max(40),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
});

export type Loop = z.infer<typeof LoopSchema>;

export const LoopBudgetInputSchema = LoopBudgetSchema.partial();
export type LoopBudgetInput = z.infer<typeof LoopBudgetInputSchema>;


export const LoopCreateSchema = z.object({
  name: z.string().min(1).max(80),
  cwd: z.string().min(1).max(1024),
  prompt: z.string().min(1).max(20_000),
  projectId: z.string().min(1).max(64).nullish(),
  origin: LoopOriginSchema.optional(),
  model: z.string().min(1).max(200).optional(),
  reasoningEffort: z.string().min(1).max(40).optional(),
  budget: LoopBudgetInputSchema.optional(),
  target: z.string().max(500).nullish(),
  nextHint: z.string().max(2000).nullish(),
  /** REQ-201: omitted = `manual` + default cooldown/empty guard. */
  trigger: LoopTriggerInputSchema.optional(),
});

export type LoopCreate = z.infer<typeof LoopCreateSchema>;

export const LoopPatchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    cwd: z.string().min(1).max(1024).optional(),
    prompt: z.string().min(1).max(20_000).optional(),
    projectId: z.string().min(1).max(64).nullable().optional(),
    model: z.string().min(1).max(200).optional(),
    reasoningEffort: z.string().min(1).max(40).optional(),
    budget: LoopBudgetInputSchema.optional(),
    target: z.string().max(500).nullable().optional(),
    nextHint: z.string().max(2000).nullish().optional(),
    /** REQ-201: edits what fires the next turn + the two guards around it. */
    trigger: LoopTriggerInputSchema.optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.cwd !== undefined ||
      v.prompt !== undefined ||
      v.projectId !== undefined ||
      v.model !== undefined ||
      v.reasoningEffort !== undefined ||
      v.budget !== undefined ||
      v.target !== undefined ||
      v.nextHint !== undefined ||
      v.trigger !== undefined,
    { message: 'empty patch — send one editable loop field' },
  );

export type LoopPatch = z.infer<typeof LoopPatchSchema>;

/** What the store stamps into `state.json` after a measured iteration. */
export const LoopIterationMeasurementSchema = z.object({
  /** Measured wall time of the run, in seconds. */
  seconds: z.number().min(0).max(1_000_000),
  tokens: z.number().int().min(0).max(1_000_000_000),
  usd: z.number().min(0).max(1_000_000),
  /** Free-form score string for this iteration, when the loop measures one. */
  score: z.string().max(500).optional(),
});

export type LoopIterationMeasurement = z.infer<typeof LoopIterationMeasurementSchema>;
