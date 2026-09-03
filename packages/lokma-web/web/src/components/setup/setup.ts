import type { DoctorCheckView, SetupFeatureView } from '@/lib/api';

/**
 * Pure helpers for the SetupPane (W6-22, Docs/32) — no React, no I/O.
 * The server owns the registry, the flags and every probe; these only
 * shape loaded data for rendering. Covered by `setup.test.ts`
 * (`bun src/components/setup/setup.test.ts`).
 */

/** Row tone for a doctor probe result (dark terminal list). */
export function probeTone(ok: boolean): string {
  return ok ? 'text-emerald-400' : 'text-red-400';
}

/** `12` → `12ms` — guards the non-finite edge the server never sends. */
export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  return `${Math.round(ms)}ms`;
}

/** Passed/total over a doctor check list. */
export function countPassed(checks: DoctorCheckView[]): { passed: number; total: number } {
  return { passed: checks.filter((c) => c.ok).length, total: checks.length };
}

/** Checkbox state from the loaded registry (stored flags already resolved). */
export function currentMap(features: SetupFeatureView[]): Record<string, boolean> {
  return Object.fromEntries(features.map((f) => [f.id, f.enabled]));
}

/** Reset target — registry defaults (the concept `Reset` button). */
export function defaultMap(features: SetupFeatureView[]): Record<string, boolean> {
  return Object.fromEntries(features.map((f) => [f.id, f.defaultOn]));
}

/** All-off target (the concept `Turn all off` button). */
export function allOffMap(features: SetupFeatureView[]): Record<string, boolean> {
  return Object.fromEntries(features.map((f) => [f.id, false]));
}

/** Enabled ids for the save toast (`browser, search, vault`). */
export function enabledIds(map: Record<string, boolean>): string[] {
  return Object.entries(map)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

/** One-line init summary for the result banner. */
export function summarizeInit(created: string[], existed: string[]): string {
  return `${created.length} created · ${existed.length} already present`;
}

/** Single doctor line for the Copy button (`✓ config — … (3ms)`). */
export function doctorLine(check: DoctorCheckView): string {
  const mark = check.ok ? '✓' : '✗';
  return `${mark} ${check.name} — ${check.detail} (${formatLatency(check.latencyMs)})`;
}

/** Full doctor output for the Copy button (rows + pass footer). */
export function doctorCopyText(checks: DoctorCheckView[]): string {
  const { passed, total } = countPassed(checks);
  const footer = passed === total ? `All checks passed · ${passed}/${total}` : `${passed}/${total} passed — see failing rows above`;
  return [...checks.map(doctorLine), footer].join('\n');
}
