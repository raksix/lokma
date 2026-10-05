import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  LoopSchema,
  type Loop,
  type LoopBudget,
  type LoopIterationMeasurement,
  type LoopOrigin,
  type LoopPatch,
  type LoopRunOutcome,
  type LoopStatus,
  type LoopStopReason,
  type LoopTrigger,
  type LoopTriggerInput,
} from '@lokma/shared';
import { assertValidSchedule } from '../cron/cron.js';
import { ensureDir, readJson, writeAtomic } from '../utils/fs.js';
import { LOOPS_DIR, ledgerPath, loopDir, readLedger } from './ledger.js';
import { acquireLoopCwd, cwdLockConflict, releaseLoopCwd } from './lock.js';

/**
 * Harness-owned loop store (REQ-200). One directory per loop under
 * `~/.lokma/loops/<id>/`:
 *
 *   state.json   the `Loop` record — the single source of truth
 *   prompt.md    the task text, readable without parsing JSON
 *   ledger.md    append-only human-readable history (see `ledger.ts`)
 *   scope.md     optional working notes / remaining-work list (REQ-202 reads it)
 *
 * Design rules that are load-bearing (not preferences):
 *
 * - **Counters are measured, never typed.** `spent` only ever grows through
 *   `recordIteration()`, which takes a measurement and recomputes from disk.
 *   There is deliberately no "set spent" API, so a loop's own bookkeeping can
 *   never invent progress it did not make.
 * - **Budget stops the loop by itself.** When a measurement crosses
 *   `maxIters` / `maxHours` / `maxUsd`, the SAME write moves the loop to a
 *   terminal status with the matching `stopReason` — the caller never has to
 *   remember to check, so an unbounded run cannot leak past its cap.
 * - **Terminal is terminal.** `done` / `error` never auto-restart; resuming
 *   means a new run, history intact (REQ-201 opens runs).
 * - **Corrupt rows are skipped, never fatal** — same file-backed tolerance as
 *   the todos store.
 */

/** Typed loop failure — routes map it straight to `{ code, message }`. */
export class LoopError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'LoopError';
    this.code = code;
    this.status = status;
  }
}

/** Server-generated loop ids (`l_` + 8 hex) — never client-supplied. */
const LOOP_ID_PATTERN = /^l_[a-f0-9]{8}$/;

/** `projectId` comes from the auth store's project ids — URL-safe shape only. */
const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const TERMINAL_STATUSES: ReadonlySet<LoopStatus> = new Set<LoopStatus>(['done', 'error']);

/** 1 MiB — a prompt is text, not an upload. */
const MAX_PROMPT_BYTES = 64 * 1024;

export const DEFAULT_LOOP_BUDGET: LoopBudget = { maxIters: 400, maxHours: 24, maxUsd: 50 };

/** REQ-201 defaults: 60s between turns, 3 no-progress turns → `idle`. */
export const DEFAULT_COOLDOWN_SECONDS = 60;
export const DEFAULT_MAX_EMPTY_ITERS = 3;

/**
 * Cooldown + empty guard bounds. Both are "how careful is this loop" knobs, so
 * an unusable value falls back to the default instead of throwing — unlike
 * `intervalMinutes`, where a missing number would silently change the loop's
 * whole behaviour (see `resolveTrigger`).
 */
function pickGuard(value: number | null | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback;
  return Math.trunc(value);
}

/**
 * Turn the loose create/patch input into a validated `LoopTrigger`. Unknown or
 * partial input resolves to `manual` rather than throwing: a loop whose trigger
 * was never chosen is a loop the user drives by hand, and failing the whole
 * creation over a missing optional field would be a worse answer than a
 * loop that simply waits for a button press.
 *
 * `interval` without a usable number is a caller bug worth refusing — it means
 * someone asked for a repeating loop and the number got lost, and silently
 * answering "manual" would leave a background loop that never repeats.
 */
export function resolveTrigger(input: LoopTriggerInput | undefined): LoopTrigger {
  const kind = input?.kind ?? 'manual';
  if (kind === 'interval') {
    const minutes = input?.intervalMinutes;
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 1) {
      throw new LoopError('bad_trigger', 'intervalMinutes must be a number >= 1 for an interval trigger');
    }
    return { kind: 'interval', intervalMinutes: minutes };
  }
  if (kind === 'cron') {
    const schedule = input?.schedule;
    if (typeof schedule !== 'string' || schedule.trim().length === 0) {
      throw new LoopError('bad_trigger', 'schedule must be a 5-field cron string for a cron trigger');
    }
    // The SAME validator cron uses — one calendar, two concepts. Wrapping the
    // error keeps the loop route's `{ code }` contract while naming the field.
    try {
      assertValidSchedule(schedule.trim());
    } catch {
      throw new LoopError('bad_trigger', 'schedule must be 5 fields: `minute hour day month weekday` (e.g. `0 3 * * *`)');
    }
    return { kind: 'cron', schedule: schedule.trim() };
  }
  if (kind === 'event') {
    return { kind: 'event', event: input?.event ?? 'file_changed', path: input?.path ?? null };
  }
  return { kind: 'manual' };
}

/** Reject traversal + absurd values before any path is built. */
export function assertLoopIdShape(loopId: unknown): asserts loopId is string {
  if (typeof loopId !== 'string' || !LOOP_ID_PATTERN.test(loopId)) {
    throw new LoopError('bad_loop_id', 'unknown loop');
  }
}

function assertNameShape(name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new LoopError('bad_name', 'name must be a non-empty string');
  }
  if (name.length > 80) {
    throw new LoopError('bad_name', 'name must be at most 80 characters');
  }
}

function assertPromptShape(prompt: unknown): asserts prompt is string {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new LoopError('bad_prompt', 'prompt must be a non-empty task description');
  }
  if (Buffer.byteLength(prompt, 'utf-8') > MAX_PROMPT_BYTES) {
    throw new LoopError('bad_prompt', 'prompt must be at most 64 KiB');
  }
}

function assertCwdShape(cwd: unknown): asserts cwd is string {
  if (typeof cwd !== 'string' || cwd.trim().length === 0) {
    throw new LoopError('bad_cwd', 'cwd must be a non-empty absolute path');
  }
  if (cwd.length > 1024) {
    throw new LoopError('bad_cwd', 'cwd must be at most 1024 characters');
  }
}

function assertProjectIdShape(projectId: unknown): asserts projectId is string | null {
  if (projectId === null || projectId === undefined) return;
  if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new LoopError('bad_project_id', 'projectId must be URL-safe (letters, digits, _, -, .) or null');
  }
}

function assertOriginShape(origin: unknown): asserts origin is LoopOrigin {
  if (origin !== 'user' && origin !== 'agent') {
    throw new LoopError('bad_origin', "origin must be 'user' or 'agent'");
  }
}

/**
 * Budget fields merge over `base`; an unusable value falls back instead of
 * being reinterpreted. A zero/negative `maxIters` falls back (a loop that may
 * run zero iterations is not a loop), while `maxUsd: 0` / `maxHours: 0` are
 * KEPT as 0 because there they mean "no ceiling on this dimension".
 */
export function resolveBudget(input: Partial<LoopBudget> | undefined, base: LoopBudget = DEFAULT_LOOP_BUDGET): LoopBudget {
  if (!input) return { ...base };
  const pick = (patch: number | undefined, fallback: number): number =>
    typeof patch === 'number' && Number.isFinite(patch) && patch >= 0 ? patch : fallback;
  const iters = pick(input.maxIters, base.maxIters);
  return {
    maxIters: Math.trunc(iters) >= 1 ? Math.trunc(iters) : base.maxIters,
    maxHours: pick(input.maxHours, base.maxHours),
    maxUsd: pick(input.maxUsd, base.maxUsd),
  };
}

function statePath(loopId: string): string {
  return join(loopDir(loopId), 'state.json');
}

function promptPath(loopId: string): string {
  return join(loopDir(loopId), 'prompt.md');
}

/** All loops from disk, newest first (powers the console header + list). */
export async function listLoops(): Promise<Loop[]> {
  let names: string[];
  try {
    names = await readdir(LOOPS_DIR);
  } catch {
    return [];
  }
  const out: Loop[] = [];
  for (const name of names) {
    if (!LOOP_ID_PATTERN.test(name)) continue;
    const row = await readJson<unknown>(statePath(name), (raw) => raw, null);
    if (row === null) continue;
    const parsed = LoopSchema.safeParse(row);
    if (!parsed.success) continue; // Corrupt state never breaks the list.
    out.push(parsed.data);
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** One loop by id (404 when unknown — never silent). */
export async function getLoop(loopId: string): Promise<Loop> {
  assertLoopIdShape(loopId);
  const row = await readJson<unknown>(statePath(loopId), (raw) => raw, null);
  const parsed = LoopSchema.safeParse(row);
  if (!parsed.success) {
    throw new LoopError('loop_not_found', `no loop ${loopId}`, 404);
  }
  return parsed.data;
}

/** Loops scoped to one project (null projectId = the "no project" bucket). */
export async function listProjectLoops(projectId: string | null): Promise<Loop[]> {
  assertProjectIdShape(projectId);
  const all = await listLoops();
  return all.filter((l) => l.projectId === projectId);
}

/** Persist a record + its mirror `prompt.md` atomically-ish (state last wins). */
async function persist(loop: Loop): Promise<Loop> {
  await ensureDir(loopDir(loop.id));
  await writeAtomic(promptPath(loop.id), `${loop.prompt.trim()}\n`);
  await writeAtomic(statePath(loop.id), JSON.stringify(loop, null, 2));
  return loop;
}

/**
 * Create a loop in `draft`. `startedAt` stays null — `draft → running` happens
 * only with the first real run (REQ-201), never at creation time, so a loop the
 * user saved but never ran is honestly reported as never having run.
 */
export async function createLoop(input: {
  name?: unknown;
  cwd?: unknown;
  prompt?: unknown;
  projectId?: unknown;
  origin?: unknown;
  model?: unknown;
  reasoningEffort?: unknown;
  budget?: Partial<LoopBudget> | undefined;
  target?: string | null;
  nextHint?: string | null;
  trigger?: LoopTriggerInput | undefined;
  cooldownSeconds?: number | null;
  maxEmptyIters?: number | null;
}): Promise<Loop> {
  assertNameShape(input.name);
  assertCwdShape(input.cwd);
  assertPromptShape(input.prompt);
  assertProjectIdShape(input.projectId);
  const origin: LoopOrigin = input.origin === undefined ? 'user' : (input.origin as LoopOrigin);
  assertOriginShape(origin);
  const now = new Date().toISOString();
  const loop: Loop = {
    id: `l_${randomBytes(4).toString('hex')}`,
    name: (input.name as string).trim(),
    projectId: (input.projectId as string | null | undefined) ?? null,
    cwd: (input.cwd as string).trim(),
    prompt: (input.prompt as string).trim(),
    origin,
    status: 'draft',
    stopReason: null,
    budget: resolveBudget(input.budget),
    spent: { iters: 0, hours: 0, usd: 0, tokens: 0 },
    score: { best: null, last: null, target: input.target ?? null },
    nextHint: input.nextHint ?? null,
    trigger: resolveTrigger(input.trigger),
    cooldownSeconds: pickGuard(input.cooldownSeconds, DEFAULT_COOLDOWN_SECONDS),
    maxEmptyIters: pickGuard(input.maxEmptyIters, DEFAULT_MAX_EMPTY_ITERS),
    lastRunOutcome: null,
    emptyIters: 0,
    lastRunStartedAt: null,
    model: typeof input.model === 'string' && input.model.trim() ? input.model.trim() : 'inherit',
    reasoningEffort:
      typeof input.reasoningEffort === 'string' && input.reasoningEffort.trim()
        ? input.reasoningEffort.trim()
        : 'off',
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
  };
  LoopSchema.parse(loop); // Fail before touching disk if a field drifted.
  return persist(loop);
}

/**
 * Edit the editable fields. `status`/`spent`/`stopReason` are NOT patchable —
 * they only move through the transition functions below, which is what keeps
 * the measured-counter guarantee true.
 */
export async function updateLoop(loopId: string, patch: LoopPatch): Promise<Loop> {
  const current = await getLoop(loopId);
  if (patch.name !== undefined) assertNameShape(patch.name);
  if (patch.cwd !== undefined) assertCwdShape(patch.cwd);
  if (patch.prompt !== undefined) assertPromptShape(patch.prompt);
  if (patch.projectId !== undefined) assertProjectIdShape(patch.projectId);
  const nextCwd = patch.cwd === undefined ? current.cwd : patch.cwd.trim();
  // Editing the cwd of a RUNNING loop re-points its lock; the old directory must
  // be released and the new one claimed, or the loop keeps editing a directory it
  // no longer owns (or edits one that is already somebody else's).
  const movingCwd = nextCwd !== current.cwd;
  if (movingCwd && current.status === 'running') await claimCwd(loopId, nextCwd);
  const next: Loop = {
    ...current,
    name: patch.name === undefined ? current.name : patch.name.trim(),
    cwd: nextCwd,
    prompt: patch.prompt === undefined ? current.prompt : patch.prompt.trim(),
    projectId: patch.projectId === undefined ? current.projectId : patch.projectId,
    model: patch.model === undefined ? current.model : patch.model.trim(),
    reasoningEffort: patch.reasoningEffort === undefined ? current.reasoningEffort : patch.reasoningEffort.trim(),
    budget: patch.budget === undefined ? current.budget : resolveBudget(patch.budget, current.budget),
    score: {
      ...current.score,
      target: patch.target === undefined ? current.score.target : patch.target,
    },
    nextHint: patch.nextHint === undefined ? current.nextHint : patch.nextHint,
    trigger: patch.trigger === undefined ? current.trigger : resolveTrigger(patch.trigger),
    cooldownSeconds:
      patch.trigger?.cooldownSeconds === undefined || patch.trigger?.cooldownSeconds === null
        ? current.cooldownSeconds
        : pickGuard(patch.trigger.cooldownSeconds, current.cooldownSeconds),
    maxEmptyIters:
      patch.trigger?.maxEmptyIters === undefined || patch.trigger?.maxEmptyIters === null
        ? current.maxEmptyIters
        : pickGuard(patch.trigger.maxEmptyIters, current.maxEmptyIters),
    updatedAt: new Date().toISOString(),
  };
  const saved = await persist(next);
  if (movingCwd) await releaseLoopCwd(loopId, current.cwd);
  return saved;
}

/**
 * Legal state machine. `draft → running` needs the first run (which sets
 * `startedAt`), `running ↔ paused` is the user's stop/resume, and
 * `done`/`error` are terminal — a refusal, never a silent no-op, because a UI
 * that pauses a finished loop must be able to say why nothing happened.
 */
export function assertTransition(from: LoopStatus, to: LoopStatus): void {
  if (from === to) return;
  if (TERMINAL_STATUSES.has(from)) {
    throw new LoopError(
      'loop_terminal',
      `loop is ${from} — start a new run instead (history is kept)`,
    );
  }
  const legal: Record<string, LoopStatus[]> = {
    draft: ['running'],
    running: ['paused', 'done', 'error'],
    paused: ['running'],
  };
  if (!(legal[from] ?? []).includes(to)) {
    throw new LoopError('bad_transition', `cannot go ${from} → ${to}`);
  }
}

/**
 * Claim the loop's `cwd` before it starts editing it, or refuse HONESTLY.
 *
 * The conflict message names the holder and the directory, because "locked" with
 * no owner is the one answer that leaves the user with nothing to do (the same
 * rule as the install-hint lesson: a refusal that names a blocked thing must
 * carry what to do next). Status 409 — the request was well-formed, the state
 * just does not allow it — and `code: 'cwd_locked'` so the console can badge
 * the row without parsing English.
 */
async function claimCwd(loopId: string, cwd: string): Promise<void> {
  const conflict = await cwdLockConflict(loopId, cwd);
  if (conflict) {
    throw new LoopError(
      'cwd_locked',
      `${conflict.path} is already held by ${conflict.holderLoopId ?? conflict.holder} (lease until ${new Date(conflict.until).toISOString()})`,
      409,
    );
  }
  const claim = await acquireLoopCwd(loopId, cwd);
  if (!claim.ok) {
    throw new LoopError('cwd_locked', `${claim.path} is already held by ${claim.holderLoopId ?? claim.holder}`, 409);
  }
}

/** Move the loop to an explicit status, stamping terminal timestamps. */
export async function setLoopStatus(
  loopId: string,
  to: LoopStatus,
  opts: { stopReason?: LoopStopReason | null } = {},
): Promise<Loop> {
  const current = await getLoop(loopId);
  assertTransition(current.status, to);
  if (to === 'running') await claimCwd(loopId, current.cwd);
  const now = new Date().toISOString();
  const next: Loop = {
    ...current,
    status: to,
    stopReason: to === 'running' ? null : (opts.stopReason ?? null),
    startedAt: current.startedAt ?? (to === 'running' ? now : null),
    finishedAt: TERMINAL_STATUSES.has(to) ? now : null,
    updatedAt: now,
  };
  const saved = await persist(next);
  // Release the directory whenever the loop is NOT running — not only on
  // `paused`. REQ-201 measured this: a loop that stops ITSELF (`done` from
  // target/budget/max_iters, or `error`) went terminal while still holding its
  // cwd lock for the whole 15-minute lease, so a legitimate new loop in that
  // directory was refused with "already worked on by loop X (running)" — a
  // status it is not in. The lock exists to stop concurrent EDITING; a loop
  // that is not editing must not hold it. Releasing is idempotent, so a
  // `draft → paused` (which never claimed) is harmless.
  if (to !== 'running') await releaseLoopCwd(loopId, current.cwd);
  return saved;
}

/**
 * Which budget cap a measurement just crossed, or null while the loop is still
 * inside its budget. Pure so the rule is unit-testable without a store.
 *
 * Iterations and continuous budgets differ deliberately: `maxIters` is the
 * number of iterations the loop is ALLOWED to run, so a measurement landing
 * exactly on it still counts as running and the next one stops the loop (the
 * REQ's own criterion: `maxIters: 2` stops on the 3rd turn). Continuous
 * budgets (`maxUsd` / `maxHours`) are ceilings — reaching them stops the loop
 * immediately, because overspending is what they exist to prevent.
 */
export function budgetBreach(loop: {
  spent: Pick<Loop['spent'], 'iters' | 'hours' | 'usd'>;
  budget: Loop['budget'];
}): LoopStopReason | null {
  const { spent, budget } = loop;
  if (spent.iters > budget.maxIters) return 'max_iters';
  if (budget.maxHours > 0 && spent.hours >= budget.maxHours) return 'max_hours';
  if (budget.maxUsd > 0 && spent.usd >= budget.maxUsd) return 'budget';
  return null;
}

/** Target reached when the loop declares one and the last score equals it. */
export function targetReached(loop: Pick<Loop, 'score'>): boolean {
  const { target, last } = loop.score;
  return typeof target === 'string' && target.length > 0 && typeof last === 'string' && last === target;
}

/**
 * Record ONE measured iteration. This is the only writer of `spent`, and it
 * stops the loop itself the moment a cap or the target is reached — no caller
 * can forget to check, so a long run cannot outlive its budget.
 *
 * `countIteration: false` is the empty-turn guard REQ-201 needs: an iteration
 * where the agent did no work records time/cost but leaves `iters` alone, so
 * a loop cannot burn its budget doing nothing.
 */
export async function recordIteration(
  loopId: string,
  measurement: LoopIterationMeasurement,
  opts: { countIteration?: boolean } = {},
): Promise<Loop> {
  const current = await getLoop(loopId);
  if (TERMINAL_STATUSES.has(current.status)) {
    throw new LoopError('loop_terminal', `loop is ${current.status} — no further iterations`);
  }
  if (current.status === 'draft') await claimCwd(loopId, current.cwd);
  const count = opts.countIteration !== false;
  const spent: Loop['spent'] = {
    iters: current.spent.iters + (count ? 1 : 0),
    hours: current.spent.hours + measurement.seconds / 3600,
    usd: current.spent.usd + measurement.usd,
    tokens: current.spent.tokens + measurement.tokens,
  };
  const last = typeof measurement.score === 'string' && measurement.score.length > 0 ? measurement.score : current.score.last;
  const best = betterScore(last, current.score.best);
  const now = new Date().toISOString();
  const candidate: Loop = {
    ...current,
    spent,
    score: { best, last, target: current.score.target },
    status: current.status === 'draft' ? 'running' : current.status,
    startedAt: current.startedAt ?? now,
    updatedAt: now,
  };

  const breach = budgetBreach(candidate);
  const reached = targetReached(candidate);
  const stopReason: LoopStopReason | null = reached ? 'target_score' : breach;
  if (!stopReason) return persist(candidate);
  // A terminal stop must hand the directory back, or a finished loop would hold
  // its cwd until the lease expires 15 minutes later.
  const saved = await persist({
    ...candidate,
    status: 'done',
    stopReason,
    finishedAt: now,
  });
  await releaseLoopCwd(loopId, current.cwd);
  return saved;
}

/**
 * Stamp ONE finished turn: its measured outcome + when it started. The
 * executor calls this before `recordIteration` so the idle guard's consecutive
 * counter and `lastRunStartedAt` (what `interval` measures from) are persisted
 * even when the turn does NOT count as an iteration.
 *
 * Deliberately separate from `recordIteration`: an empty turn records time and
 * cost but must not advance `spent.iters`, so the two writes cannot be one.
 */
export async function recordRunTiming(
  loopId: string,
  opts: { outcome: LoopRunOutcome; startedAt: string },
): Promise<Loop> {
  const current = await getLoop(loopId);
  const emptyIters = opts.outcome === 'empty' ? current.emptyIters + 1 : 0;
  const next: Loop = {
    ...current,
    lastRunOutcome: opts.outcome,
    emptyIters,
    lastRunStartedAt: opts.startedAt,
    updatedAt: new Date().toISOString(),
  };
  return persist(next);
}

/**
 * Compare two score strings as decimals when both parse as numbers, else
 * lexicographically. Scores are opaque loop-defined strings, so this is a
 * best-effort "best so far" and never claims to understand the scale.
 */
export function betterScore(candidate: string | null, current: string | null): string | null {
  if (candidate === null) return current;
  if (current === null) return candidate;
  const a = Number(candidate);
  const b = Number(current);
  if (Number.isFinite(a) && Number.isFinite(b)) return a >= b ? candidate : current;
  return candidate >= current ? candidate : current;
}

/** Stop a running loop at the user's request (recorded, not a delete). */
export async function stopLoop(loopId: string): Promise<Loop> {
  const current = await getLoop(loopId);
  if (current.status === 'paused') return current;
  if (current.status === 'draft') throw new LoopError('bad_transition', 'cannot go draft → paused');
  if (TERMINAL_STATUSES.has(current.status)) {
    throw new LoopError('loop_terminal', `loop is ${current.status} — nothing to stop`);
  }
  return setLoopStatus(loopId, 'paused', { stopReason: 'stopped' });
}

/** Delete a loop's directory (the pane's two-click Delete; unknown → 404). */
export async function deleteLoop(loopId: string): Promise<{ id: string }> {
  const loop = await getLoop(loopId); // 404 before removing anything.
  // Release the cwd lock too — a deleted loop must not keep a directory claimed
  // for the rest of the lease.
  await releaseLoopCwd(loopId, loop.cwd);
  const { rm } = await import('node:fs/promises');
  await rm(loopDir(loopId), { recursive: true, force: true });
  return { id: loopId };
}

/** Loop record + ledger tail — the console detail payload (REQ-202 reads it). */
export async function getLoopDetail(loopId: string, tailLines = 20): Promise<{
  loop: Loop;
  ledger: string;
  ledgerPath: string;
}> {
  const loop = await getLoop(loopId);
  const raw = await readLedger(loopId);
  const lines = raw.trimEnd().split('\n');
  return { loop, ledger: lines.slice(-Math.max(1, tailLines)).join('\n'), ledgerPath: ledgerPath(loopId) };
}
