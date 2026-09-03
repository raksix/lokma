import type { TestReport, TestSummary } from '@/lib/api';

/**
 * Pure helpers behind the TestingPane (W5-19) — no React, no fetch, so the
 * `bun src/components/testing/testing.test.ts` probe covers them directly.
 * Server validation owns the truth; these only shape/filter client state.
 * Concept mock RUNS rows are never ported — rows come from
 * `GET /api/tests/list`, never invented here.
 */

export const TEST_STAGES = [
  { n: 1, title: 'Plan', desc: 'plan headline → stored plan.json' },
  { n: 2, title: 'Inventory', desc: 'every target path → one test' },
  { n: 3, title: 'Codegen', desc: 'one real GET check per target' },
  { n: 4, title: 'Sandbox', desc: 'in-process handlers, no browser' },
  { n: 5, title: 'Classify', desc: 'contract / env / fragility' },
  { n: 6, title: 'Heal', desc: 'fix → re-run → report' },
] as const;

export type TestRunFilter = 'all' | 'fail' | 'flaky';

export type RunForm = {
  plan: string;
  /** Raw textarea — one target path per line (commas also split). */
  targets: string;
  includeShannon: boolean;
};

export const emptyRunForm: RunForm = { plan: '', targets: '', includeShannon: true };

/** Server default inventory when the client sends no targets (mirrors core). */
export const DEFAULT_TARGETS_HINT = '/health, /api/health, /api/models';

/** Split the textarea into target paths (commas + newlines, trimmed, no empties). */
export function parseTargets(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Client-side mirror of the server run rules (server re-validates). */
export function validateRunForm(form: RunForm): string | null {
  if (!form.plan.trim()) return 'Describe the run first';
  if (form.plan.trim().length > 120) return 'Plan too long (120 max)';
  const targets = parseTargets(form.targets);
  if (targets.length > 20) return 'Too many targets (20 max)';
  for (const t of targets) {
    if (!t.startsWith('/')) return `Target must start with /: ${t}`;
    if (/\s/.test(t)) return `Target must not contain whitespace: ${t}`;
    if (t.includes('..') || t.includes('://')) return `Target must stay inside this server: ${t}`;
  }
  return null;
}

/** Concept Runs filter parity — flaky is always 0 until rerun history lands. */
export function filterRuns(rows: TestSummary[], filter: TestRunFilter, query: string): TestSummary[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (filter === 'fail' && r.fail === 0) return false;
    if (filter === 'flaky' && r.flaky === 0) return false;
    if (q && !`${r.plan} ${r.id}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Card dot tone — green only when nothing failed and nothing flaky. */
export function runTone(run: TestSummary): 'good' | 'warn' | 'bad' {
  if (run.fail > 0) return 'bad';
  if (run.flaky > 0) return 'warn';
  return 'good';
}

/** Classify-stage counts over a loaded report (pane Classify strip). */
export function classifyCounts(report: TestReport): { contract: number; env: number; fragility: number } {
  const counts = { contract: 0, env: 0, fragility: 0 };
  for (const t of report.tests) {
    if (t.status !== 'fail' || !t.classification) continue;
    counts[t.classification] += 1;
  }
  return counts;
}

/** Relative `when` cell for run cards (concept `2m ago` parity). */
export function formatRunAgo(iso: string, nowMs: number = Date.now()): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const diff = Math.max(0, nowMs - ms);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return iso.slice(0, 10);
}
