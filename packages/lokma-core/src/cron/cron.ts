import { randomBytes } from 'node:crypto';
import type { CronJob } from 'lokma-shared';
import { getAgent } from '../agents/registry.js';
import { ensureDir, readJson, writeAtomic } from '../utils/fs.js';

/**
 * Per-agent cron jobs (W6-25, Docs/30 §5 cron per agent). Jobs persist in
 * `~/.lokma/cron/jobs.json` (scoped to `agentId`). The agent-runner daemon
 * (Phase 1, `cron/runner.ts` + server ticker) fires due jobs and stamps
 * `lastRunAt` via `recordJobRun()` — every fire lands a `CronRunRecord`.
 */

/** Typed cron failure — routes map it straight to `{ code, message }`. */
export class CronError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'CronError';
    this.code = code;
    this.status = status;
  }
}

const CRON_DIR = '~/.lokma/cron';
const JOBS_PATH = '~/.lokma/cron/jobs.json';

/** Server-generated job ids (`c_` + 8 hex) — never client-supplied. */
const JOB_ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

/** Agent ids travel in the URL — reject traversal before touching the registry. */
const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

/** Throw 400 unless the agent id is URL-safe (no `/`, `\`, `..`). */
export function assertAgentIdShape(agentId: unknown): asserts agentId is string {
  if (
    typeof agentId !== 'string' ||
    agentId.length === 0 ||
    agentId.length > 128 ||
    agentId.includes('/') ||
    agentId.includes('\\') ||
    agentId.includes('..') ||
    !AGENT_ID_PATTERN.test(agentId)
  ) {
    throw new CronError('bad_agent_id', 'agent id must be URL-safe (letters, digits, _, ., -)');
  }
}

/** Throw 400 unless the job id matches the server-generated shape. */
export function assertJobIdShape(jobId: unknown): asserts jobId is string {
  if (typeof jobId !== 'string' || !JOB_ID_PATTERN.test(jobId)) {
    throw new CronError('bad_job_id', 'unknown cron job');
  }
}

/** Throw 404 unless the agent exists in the registry. */
export async function assertAgentExists(agentId: string): Promise<void> {
  const agent = await getAgent(agentId);
  if (!agent) {
    throw new CronError('agent_not_found', `no agent with id ${agentId}`, 404);
  }
}

// ─── Schedule validation (5-field standard cron) ────────────────────────────

const FIELD_RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7], // day of week (7 = Sunday, normalized to 0)
];

/** Validate one comma item (`*`, `*\/s`, `n`, `a-b`, `a-b/s`) against its range. */
function validItem(item: string, min: number, max: number): boolean {
  if (item === '*') return true;
  const [range, stepRaw] = item.split('/');
  if (stepRaw !== undefined) {
    if (!/^\d+$/.test(stepRaw)) return false;
    const step = Number(stepRaw);
    if (!Number.isSafeInteger(step) || step < 1 || step > max) return false;
  }
  const body = stepRaw === undefined ? item : range;
  if (body === '*') return stepRaw !== undefined;
  if (/^\d+$/.test(body)) {
    const n = Number(body);
    return n >= min && n <= max;
  }
  const m = /^(\d+)-(\d+)$/.exec(body);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a >= min && b <= max && a <= b;
}

/** Validate one field (comma list of items). */
function validField(field: string, min: number, max: number): boolean {
  if (!field) return false;
  return field.split(',').every((item) => validItem(item, min, max));
}

/**
 * Throw 400 `bad_schedule` unless the value is a valid 5-field cron
 * expression. Accepts the standard shorthands per field (`*`, `*\/n`,
 * `n`, `a-b`, `a-b/n`, comma lists) with per-field numeric ranges.
 */
export function assertValidSchedule(schedule: unknown): asserts schedule is string {
  if (typeof schedule !== 'string') {
    throw new CronError('bad_schedule', 'schedule must be a 5-field cron string (e.g. `0 3 * * *`)');
  }
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5 || !parts.every((p, i) => validField(p, FIELD_RANGES[i][0], FIELD_RANGES[i][1]))) {
    throw new CronError(
      'bad_schedule',
      'schedule must be 5 fields: `minute hour day month weekday` (e.g. `0 3 * * *`)',
    );
  }
}

/** Throw 400 `bad_task` unless the task is a non-empty prompt (max 500). */
export function assertValidTask(task: unknown): asserts task is string {
  if (typeof task !== 'string' || task.trim().length === 0) {
    throw new CronError('bad_task', 'task must be a non-empty prompt for the agent run');
  }
  if (task.length > 500) {
    throw new CronError('bad_task', 'task must be at most 500 characters');
  }
}

// ─── Schedule matching + next-run ───────────────────────────────────────────

type CronParts = { minute: string; hour: string; dom: string; month: string; dow: string };

export function splitSchedule(schedule: string): CronParts {
  const [minute, hour, dom, month, dow] = schedule.trim().split(/\s+/);
  return { minute, hour, dom, month, dow };
}

/** Expand one field into the matching numbers (dow normalized: 7 → 0). */
export function expandField(field: string, min: number, max: number, isDow: boolean): Set<number> {
  const out = new Set<number>();
  for (const item of field.split(',')) {
    const [range, stepRaw] = item.split('/');
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    let lo = min;
    let hi = max;
    if (range !== '*') {
      if (/^\d+$/.test(range)) {
        lo = Number(range);
        hi = Number(range);
      } else {
        const m = /^(\d+)-(\d+)$/.exec(range);
        if (!m) continue;
        lo = Number(m[1]);
        hi = Number(m[2]);
      }
    }
    for (let n = lo; n <= hi; n += step) {
      const normalized = isDow && n === 7 ? 0 : n;
      if (normalized >= (isDow ? 0 : min) && normalized <= (isDow ? 6 : max)) out.add(normalized);
    }
  }
  return out;
}

/** Standard cron day semantics: restricted dom+dow = OR, else the restricted one. */
export function dayMatches(parts: CronParts, year: number, month: number, day: number, dow: number): boolean {
  const domRestricted = parts.dom !== '*';
  const dowRestricted = parts.dow !== '*';
  const domHit = expandField(parts.dom, 1, 31, false).has(day);
  const dowHit = expandField(parts.dow, 0, 7, true).has(dow);
  if (domRestricted && dowRestricted) return domHit || dowHit;
  if (domRestricted) return domHit;
  if (dowRestricted) return dowHit;
  return true;
}

/**
 * Next fire time after `from` (exclusive, minute precision), or null when
 * nothing fires within 366 days. Pure — the pane and probes share it.
 */
export function nextRunAfter(schedule: string, from: Date = new Date()): Date | null {
  const parts = splitSchedule(schedule);
  const minutes = expandField(parts.minute, 0, 59, false);
  const hours = expandField(parts.hour, 0, 23, false);
  const months = expandField(parts.month, 1, 12, false);
  const start = Math.floor(from.getTime() / 60000) * 60000 + 60000;
  const limit = start + 366 * 24 * 60 * 60000;
  for (let t = start; t <= limit; t += 60000) {
    const d = new Date(t);
    if (!months.has(d.getMonth() + 1)) continue;
    // Skip rolled-over days (e.g. Feb 30 never exists).
    if (d.getDate() > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) continue;
    if (!dayMatches(parts, d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getDay())) continue;
    if (!hours.has(d.getHours())) continue;
    if (!minutes.has(d.getMinutes())) continue;
    return d;
  }
  return null;
}

// ─── Job store (`~/.lokma/cron/jobs.json`) ──────────────────────────────────

type StoredJobs = Record<string, Omit<CronJob, 'nextRunAt'>>;

async function readJobsFile(): Promise<StoredJobs> {
  return readJson<StoredJobs>(JOBS_PATH, (raw) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    return raw as StoredJobs;
  }, {});
}

async function writeJobsFile(jobs: StoredJobs): Promise<void> {
  await ensureDir(CRON_DIR);
  await writeAtomic(JOBS_PATH, JSON.stringify(jobs, null, 2));
}

function toView(stored: Omit<CronJob, 'nextRunAt'>): CronJob {
  const next = stored.enabled ? nextRunAfter(stored.schedule) : null;
  return { ...stored, nextRunAt: next ? next.toISOString() : null };
}

/** All jobs, newest first (powers the pane header counts + list). */
export async function listCronJobs(): Promise<CronJob[]> {
  const jobs = await readJobsFile();
  return Object.values(jobs)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(toView);
}

/** Jobs for one agent (404 when the agent is unknown). */
export async function listAgentCronJobs(agentId: string): Promise<CronJob[]> {
  assertAgentIdShape(agentId);
  await assertAgentExists(agentId);
  const jobs = await readJobsFile();
  return Object.values(jobs)
    .filter((j) => j.agentId === agentId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(toView);
}

/** Create a job for an agent (id is server-generated, never client-supplied). */
export async function createCronJob(
  agentId: string,
  input: { schedule?: unknown; task?: unknown; enabled?: unknown },
): Promise<CronJob> {
  assertAgentIdShape(agentId);
  await assertAgentExists(agentId);
  assertValidSchedule(input.schedule);
  assertValidTask(input.task);
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new CronError('bad_enabled', 'enabled must be a boolean');
  }
  const now = new Date().toISOString();
  const stored: Omit<CronJob, 'nextRunAt'> = {
    id: `c_${randomBytes(4).toString('hex')}`,
    agentId,
    schedule: (input.schedule as string).trim().replace(/\s+/g, ' '),
    task: (input.task as string).trim(),
    enabled: input.enabled ?? true,
    createdAt: now,
    updatedAt: now,
    lastRunAt: null,
  };
  const jobs = await readJobsFile();
  jobs[stored.id] = stored;
  await writeJobsFile(jobs);
  return toView(stored);
}

/** Edit schedule/task/enabled (empty patch → 400, like the agents PATCH). */
export async function updateCronJob(
  agentId: string,
  jobId: string,
  input: { schedule?: unknown; task?: unknown; enabled?: unknown },
): Promise<CronJob> {
  assertAgentIdShape(agentId);
  assertJobIdShape(jobId);
  await assertAgentExists(agentId);
  if (input.schedule === undefined && input.task === undefined && input.enabled === undefined) {
    throw new CronError('empty_patch', 'send schedule, task, or enabled');
  }
  if (input.schedule !== undefined) assertValidSchedule(input.schedule);
  if (input.task !== undefined) assertValidTask(input.task);
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') {
    throw new CronError('bad_enabled', 'enabled must be a boolean');
  }
  const jobs = await readJobsFile();
  const current = jobs[jobId];
  if (!current || current.agentId !== agentId) {
    throw new CronError('cron_not_found', `no cron job ${jobId} for agent ${agentId}`, 404);
  }
  const next: Omit<CronJob, 'nextRunAt'> = {
    ...current,
    schedule:
      input.schedule === undefined
        ? current.schedule
        : (input.schedule as string).trim().replace(/\s+/g, ' '),
    task: input.task === undefined ? current.task : (input.task as string).trim(),
    enabled: input.enabled === undefined ? current.enabled : (input.enabled as boolean),
    updatedAt: new Date().toISOString(),
  };
  jobs[jobId] = next;
  await writeJobsFile(jobs);
  return toView(next);
}

/** Delete a job (two-click in the pane; unknown → 404, never silent). */
export async function deleteCronJob(agentId: string, jobId: string): Promise<{ id: string }> {
  assertAgentIdShape(agentId);
  assertJobIdShape(jobId);
  await assertAgentExists(agentId);
  const jobs = await readJobsFile();
  const current = jobs[jobId];
  if (!current || current.agentId !== agentId) {
    throw new CronError('cron_not_found', `no cron job ${jobId} for agent ${agentId}`, 404);
  }
  delete jobs[jobId];
  await writeJobsFile(jobs);
  return { id: jobId };
}

/**
 * Stamp a job's `lastRunAt` after the runner fires it (scheduled or manual).
 * Scoped by job id only — the runner already resolved the agent — but the
 * id shape is still validated and unknown ids 404 (never silent).
 */
export async function recordJobRun(jobId: string, finishedAt: string): Promise<CronJob> {
  assertJobIdShape(jobId);
  const jobs = await readJobsFile();
  const current = jobs[jobId];
  if (!current) {
    throw new CronError('cron_not_found', `no cron job ${jobId}`, 404);
  }
  const next: Omit<CronJob, 'nextRunAt'> = { ...current, lastRunAt: finishedAt, updatedAt: finishedAt };
  jobs[jobId] = next;
  await writeJobsFile(jobs);
  return toView(next);
}
