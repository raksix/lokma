/**
 * Pure helpers for the CronApprovalsPane (W6-25, Docs/30 §5 + §6).
 * No fetching here — the pane owns all I/O through `@/lib/api`.
 * Relative ages reuse `formatRunAgo` from the Testing pane (DRY).
 */
import type { ApprovalDecisionView, CronJobView } from '@/lib/api';

/** Client mirror of the server schedule rule (deep check is server-side). */
export function validateScheduleInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Schedule is required (e.g. `0 3 * * *`).';
  if (trimmed.length > 100) return 'Schedule must be at most 100 characters.';
  if (trimmed.split(/\s+/).length !== 5) {
    return 'Schedule must have 5 fields: `minute hour day month weekday`.';
  }
  return null;
}

/** Client mirror of the server task rule (deep check is server-side). */
export function validateTaskInput(value: string): string | null {
  if (!value.trim()) return 'Task is required — the prompt for the agent run.';
  if (value.length > 500) return 'Task must be at most 500 characters.';
  return null;
}

export type CronCreateForm = { agentId: string; schedule: string; task: string };

/** Full create-form validation (agent + schedule + task). */
export function validateCreateForm(form: CronCreateForm): string | null {
  if (!form.agentId.trim()) return 'Pick an agent for the cron job.';
  return validateScheduleInput(form.schedule) ?? validateTaskInput(form.task);
}

/** Append a rule (trimmed, de-duplicated — the chat card never dupes either). */
export function addRule(rules: string[], value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed || rules.includes(trimmed)) return rules;
  return [...rules, trimmed];
}

/** Remove one rule (exact match). */
export function removeRule(rules: string[], value: string): string[] {
  return rules.filter((r) => r !== value);
}

/** Agent picker label — registry name when present, id otherwise (never blank). */
export function agentLabel(agent: { id: string; [k: string]: unknown }): string {
  const name = agent.name;
  return typeof name === 'string' && name.trim() ? name.trim() : agent.id;
}

/** Agent filter + text search over schedule/task/id (client-side, live list). */
export function filterJobs(jobs: CronJobView[], query: string, agentId: string): CronJobView[] {
  const q = query.trim().toLowerCase();
  return jobs.filter((j) => {
    if (agentId !== 'all' && j.agentId !== agentId) return false;
    if (!q) return true;
    return (
      j.schedule.toLowerCase().includes(q) ||
      j.task.toLowerCase().includes(q) ||
      j.id.toLowerCase().includes(q)
    );
  });
}

/** Header `N/M enabled` counts (concept parity). */
export function countEnabled(jobs: CronJobView[]): { enabled: number; total: number } {
  return { enabled: jobs.filter((j) => j.enabled).length, total: jobs.length };
}

/** Row dot tone (concept: emerald on, zinc off). */
export function jobTone(enabled: boolean): string {
  return enabled ? 'bg-emerald-500' : 'bg-zinc-300';
}

/** Next-run cell — disabled jobs never claim a future fire. */
export function formatNextRun(job: CronJobView): string {
  if (!job.enabled) return 'paused';
  if (!job.nextRunAt) return job.lastRunAt ? `last ${job.lastRunAt.slice(0, 10)}` : 'never (no daemon yet)';
  const d = new Date(job.nextRunAt);
  if (Number.isNaN(d.getTime())) return '—';
  return `next ${d.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`;
}

/** Live search over the decision history (session/request/decision/answer). */
export function filterDecisions(decisions: ApprovalDecisionView[], query: string): ApprovalDecisionView[] {
  const q = query.trim().toLowerCase();
  if (!q) return decisions;
  return decisions.filter((d) => {
    return (
      d.sessionId.toLowerCase().includes(q) ||
      d.requestId.toLowerCase().includes(q) ||
      (d.decision ?? '').toLowerCase().includes(q) ||
      (d.answer ?? '').toLowerCase().includes(q) ||
      d.kind.toLowerCase().includes(q)
    );
  });
}

/** Decision badge tone (concept pending/approved/denied parity, live data). */
export function decisionTone(decision?: string): string {
  if (decision === 'allow' || decision === 'always') return 'bg-emerald-600 text-white border-emerald-600';
  if (decision === 'deny') return 'bg-red-600 text-white border-red-600';
  return 'bg-white border-amber-200 text-amber-700';
}

/** Human label for a history row (what actually happened). */
export function decisionLabel(kind: string, decision?: string, answer?: string): string {
  if (kind === 'question') return answer ? `answered: ${answer.slice(0, 80)}` : 'answered';
  return decision ?? 'decided';
}
