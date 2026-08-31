import { z } from 'zod';

/**
 * Advisory file lock — cheapest collision-free layer (Layer 1).
 * Stored at .agentlocks/locks/<sha1(path)>.json with heartbeat + lease.
 * See Docs/30-AGENT-SYSTEM §10.1 and Docs/02-TEKNIK-KARARLAR locks row.
 */
export const LockModeSchema = z.enum(['exclusive']);
export type LockMode = z.infer<typeof LockModeSchema>;

export const LockSchema = z.object({
  path: z.string().min(1), // relative path like src/api/auth.ts — glob supported
  owner: z.string().min(1), // agentId
  acquiredAt: z.number().int(), // unix ms
  leaseUntil: z.number().int(), // unix ms — heartbeat extends this
  mode: LockModeSchema.default('exclusive'),
  reason: z.string().optional(),
});

export type Lock = z.infer<typeof LockSchema>;

/** Result of locks.acquire() — on conflict returns holder info. */
export const LockAcquireResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), lock: LockSchema }),
  z.object({ ok: z.literal(false), holder: z.string(), until: z.number(), path: z.string() }),
]);

export type LockAcquireResult = z.infer<typeof LockAcquireResultSchema>;
