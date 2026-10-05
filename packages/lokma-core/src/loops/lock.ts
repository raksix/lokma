import { acquire, heartbeat, listLocks, release } from '../agents/locks.js';
import { expandHome } from '../utils/fs.js';
import type { Lock } from '@lokma/shared';

/**
 * Loop ⇄ cwd lock discipline (REQ-200 kapsam 5).
 *
 * Two loops editing the same directory is the collision REQ-062 already defines
 * for agents, so a loop borrows the EXISTING primitive in `agents/locks.ts`
 * rather than inventing a second one: a loop's `cwd` is its lock target, the
 * owner is the loop id, and the lease is refreshed per iteration (REQ-201's
 * executor heartbeats; this module owns the identity + normalize rules).
 *
 * Two things make this more than a thin wrapper:
 *
 * - **Re-entrancy.** `acquire()` is not re-entrant: a live lock held by the
 *   SAME owner still answers `{ ok: false }`. A loop that is already running
 *   refreshes its lock every iteration, so the wrapper has to tell "mine" from
 *   "someone else's" itself. Confusing the two makes a running loop refuse its
 *   own second iteration — the failure looks like a lock bug, not a lease bug.
 * - **One lock per directory, however it is spelled.** The primitive hashes the
 *   path STRING, so `/srv/app`, `/srv/app/` and `~/app` would be three locks on
 *   one directory. Normalizing before the hash is what makes the guarantee real.
 *
 * No dependency on `store.ts` (this module returns results, the store throws) —
 * a store↔lock cycle would only surface at build time.
 */

/** Owner prefix, so a lock file says who holds it without a second index. */
const OWNER_PREFIX = 'loop:';

/**
 * Lease for one iteration. Generously longer than the primitive's 60s default
 * because a real agent turn runs for minutes; the executor heartbeats between
 * iterations, and an expired lease is what lets a crashed loop's lock recover
 * on its own instead of wedging the directory forever.
 */
export const LOOP_LOCK_LEASE_MS = 15 * 60_000;

export type LoopCwdLockResult =
  | { ok: true; held: 'acquired' | 'already' }
  | { ok: false; holder: string; holderLoopId: string | null; until: number; path: string };

/**
 * Canonical lock target for a `cwd`: `~` expanded, duplicate/trailing slashes
 * collapsed, so one directory is one lock. A path that normalizes to nothing
 * keeps the caller's spelling (a relative path is still a valid target — the
 * store validates absoluteness separately).
 */
export function normalizeLoopCwd(cwd: string): string {
  const expanded = expandHome(cwd.trim());
  const collapsed = expanded.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return collapsed.length > 0 ? collapsed : expanded;
}

/** The lock owner string for a loop id. */
export function loopLockOwner(loopId: string): string {
  return `${OWNER_PREFIX}${loopId}`;
}

/** The loop id behind a lock owner, or null when the lock belongs to an agent. */
export function loopIdFromLockOwner(owner: string): string | null {
  return owner.startsWith(OWNER_PREFIX) ? owner.slice(OWNER_PREFIX.length) : null;
}

/**
 * Claim a loop's `cwd`. `ok:false` means ANOTHER owner holds it — the caller
 * must refuse honestly rather than wait silently.
 */
export async function acquireLoopCwd(loopId: string, cwd: string): Promise<LoopCwdLockResult> {
  const path = normalizeLoopCwd(cwd);
  const owner = loopLockOwner(loopId);
  const result = await acquire(path, owner, LOOP_LOCK_LEASE_MS, `lokma loop ${loopId}`);
  if (result.ok) return { ok: true, held: 'acquired' };
  if (result.holder === owner) return { ok: true, held: 'already' };
  return { ok: false, holder: result.holder, holderLoopId: loopIdFromLockOwner(result.holder), until: result.until, path };
}

/**
 * Extend a lock this loop already holds. Returns false when the lock is gone or
 * belongs to someone else — the caller treats that as "someone took the
 * directory", never as a no-op.
 */
export async function heartbeatLoopCwd(loopId: string, cwd: string): Promise<boolean> {
  return heartbeat(normalizeLoopCwd(cwd), loopLockOwner(loopId), LOOP_LOCK_LEASE_MS);
}

/** Release a loop's `cwd` lock. False when it was already gone — idempotent. */
export async function releaseLoopCwd(loopId: string, cwd: string): Promise<boolean> {
  return release(normalizeLoopCwd(cwd), loopLockOwner(loopId));
}

/** Every loop lock on disk (live + expired) — the console's "who holds what". */
export async function listLoopLocks(): Promise<Array<Lock & { loopId: string }>> {
  const locks = await listLocks();
  const out: Array<Lock & { loopId: string }> = [];
  for (const lock of locks) {
    const loopId = loopIdFromLockOwner(lock.owner);
    if (loopId !== null) out.push({ ...lock, loopId });
  }
  return out;
}

/**
 * Is a DIFFERENT loop (or an agent) already editing this directory? Used to
 * badge a loop before the user ever presses Start, and by the store to build
 * the refusal message. `now` is injectable so the lease check stays testable.
 */
export async function cwdLockConflict(
  loopId: string,
  cwd: string,
  now: number = Date.now(),
): Promise<{ holder: string; holderLoopId: string | null; until: number; path: string } | null> {
  const path = normalizeLoopCwd(cwd);
  const own = loopLockOwner(loopId);
  for (const lock of await listLocks()) {
    if (lock.path !== path) continue;
    if (lock.leaseUntil <= now) continue; // Expired locks never conflict.
    if (lock.owner === own) continue;
    return { holder: lock.owner, holderLoopId: loopIdFromLockOwner(lock.owner), until: lock.leaseUntil, path };
  }
  return null;
}

/** Directory a loop locks, for callers that want the resolved path in one call. */
export function loopCwdPath(cwd: string): string {
  return normalizeLoopCwd(cwd);
}
