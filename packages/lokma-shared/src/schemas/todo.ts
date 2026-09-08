import { z } from 'zod';

/**
 * Project todos with agent claim leases (REQ-062 Parça C, REQ-065).
 * One `todos.json` per project on the server; the web TodoPane and the
 * agent `claim_todo`/`complete_todo` tools speak these shapes.
 * Claim rule: `open → claimed` is a single atomic file write carrying
 * `claimedBy` + `leaseUntil`; a second agent hitting a live lease gets
 * RED (`todo_claimed` + holder), never a silent double-take. Heartbeats
 * extend the lease; an expired lease auto-releases to `open` (no orphans).
 */

export const TodoStatusSchema = z.enum(['open', 'claimed', 'done']);

export type TodoStatus = z.infer<typeof TodoStatusSchema>;

export const TodoClaimSchema = z.object({
  sessionId: z.string().min(1).max(128),
  userId: z.string().min(1).max(64),
  claimedAt: z.string().datetime(),
});

export type TodoClaim = z.infer<typeof TodoClaimSchema>;

export const TodoSchema = z.object({
  id: z.string().min(1).max(64),
  projectId: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  status: TodoStatusSchema.default('open'),
  claimedBy: TodoClaimSchema.nullable().default(null),
  /** Epoch ms — a live lease blocks other claimants; past = auto-open. */
  leaseUntil: z.number().int().nonnegative().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().default(null),
});

export type Todo = z.infer<typeof TodoSchema>;

/** Default lease for one claim (5 minutes, renewed by heartbeats). */
export const TODO_CLAIM_LEASE_MS = 5 * 60_000;

/** Heartbeat cadence the agent loop aims for (about once a minute). */
export const TODO_HEARTBEAT_MS = 60_000;
