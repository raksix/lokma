import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import type { CronJob } from 'lokma-shared';
import { dayMatches, expandField, splitSchedule } from './cron.js';
import { ensureDir, expandHome } from '../utils/fs.js';

/**
 * Cron runner primitives (Phase 1 agent-runner daemon).
 * The server ticker calls `selectDueJobs()` every ~30s and fires each due
 * job once per minute; `recordJobRun()` stamps `lastRunAt` so the pane
 * comes alive. Every fire — scheduled or manual — appends one
 * `CronRunRecord` to `~/.lokma/cron/runs.jsonl` (the pane's run history).
 * Selection here is pure (shared with probes); firing lives server-side
 * (`server/src/cron-runner.ts`) because it needs the provider stream.
 */

const RUNS_PATH = '~/.lokma/cron/runs.jsonl';

/** How a run was triggered — schedule tick or the pane's Run-now button. */
export type CronTrigger = 'schedule' | 'manual';

/** `ok` = assistant reply persisted; `failed` = error persisted, never thrown. */
export type CronRunStatus = 'ok' | 'failed';

/** One durable fire record — the pane renders these newest-first. */
export type CronRunRecord = {
  runId: string;
  jobId: string;
  agentId: string;
  sessionId: string;
  trigger: CronTrigger;
  startedAt: string;
  finishedAt: string;
  status: CronRunStatus;
  /** Assistant reply length (0 on failure) — proves a real run happened. */
  chars: number;
  /** Failure reason (absent on success — secrets never land here). */
  error?: string;
};

/** Mint a run id (`r_` + 8 hex, same shape family as job `c_` ids). */
export function mintRunId(): string {
  return `r_${randomBytes(4).toString('hex')}`;
}

/** Truncate to the minute (cron fires at minute precision). */
export function minuteStart(d: Date): Date {
  const m = new Date(d.getTime());
  m.setSeconds(0, 0);
  return m;
}

/**
 * True when a 5-field schedule fires inside `at`'s minute.
 * Reuses the store's field expansion + day semantics (single source).
 */
export function matchesMinute(schedule: string, at: Date): boolean {
  const parts = splitSchedule(schedule);
  if (
    !expandField(parts.minute, 0, 59, false).has(at.getMinutes()) ||
    !expandField(parts.hour, 0, 23, false).has(at.getHours()) ||
    !expandField(parts.month, 1, 12, false).has(at.getMonth() + 1)
  ) {
    return false;
  }
  return dayMatches(parts, at.getFullYear(), at.getMonth() + 1, at.getDate(), at.getDay());
}

/**
 * Jobs that must fire now: enabled, matching this minute, and not already
 * fired inside it (`lastRunAt` at/after the minute start means done —
 * this is the at-most-once-per-minute guard, shared by ticker + probes).
 */
export function selectDueJobs(jobs: CronJob[], now: Date = new Date()): CronJob[] {
  const start = minuteStart(now).getTime();
  return jobs.filter((job) => {
    if (!job.enabled) return false;
    if (!matchesMinute(job.schedule, now)) return false;
    if (job.lastRunAt === null) return true;
    const last = new Date(job.lastRunAt).getTime();
    return Number.isNaN(last) || last < start;
  });
}

const MAX_RUN_LINES = 2000;
const KEEP_RUN_LINES = 1000;

/** Append one run record (prunes the log past 2000 lines, keeps 1000). */
export async function appendRunRecord(rec: CronRunRecord): Promise<void> {
  await ensureDir('~/.lokma/cron');
  await appendFile(expandHome(RUNS_PATH), JSON.stringify(rec) + '\n', 'utf-8');
  try {
    const raw = await readFile(expandHome(RUNS_PATH), 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    if (lines.length > MAX_RUN_LINES) {
      await writeFile(expandHome(RUNS_PATH), lines.slice(-KEEP_RUN_LINES).join('\n') + '\n', 'utf-8');
    }
  } catch {
    // Prune is best-effort — the append above already landed.
  }
}

/**
 * Run history, newest first (`limit` clamped 1-500, default 100).
 * Corrupt lines are skipped, never fatal (same posture as the job store).
 */
export async function listRunRecords(limit = 100): Promise<CronRunRecord[]> {
  const n = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 500) : 100;
  let raw: string;
  try {
    raw = await readFile(expandHome(RUNS_PATH), 'utf-8');
  } catch {
    return [];
  }
  const out: CronRunRecord[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as CronRunRecord;
      if (typeof rec.runId === 'string' && typeof rec.jobId === 'string') out.push(rec);
    } catch {
      continue;
    }
  }
  return out.reverse().slice(0, n);
}
