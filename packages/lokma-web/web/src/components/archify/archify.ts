import type { ArchifyIR } from '@/lib/api';

/**
 * Pure helpers behind the ArchifyPane (W5-17) — no React, no fetch, so the
 * `bun src/components/archify/archify.test.ts` probe covers them directly.
 * Server validation owns the truth; these only shape/filter client state.
 * Concept mock ITEMS rows are never ported — rows come from
 * `GET /api/archify/list`, never invented here.
 */

export const ARCHIFY_TYPES = ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle'] as const;
export type ArchifyTypeFilter = (typeof ARCHIFY_TYPES)[number] | 'all';

export const ARCHIFY_PRESETS = ['signal-flow', 'blueprint', 'classic', 'minimal'] as const;

export const ARCHIFY_EXPORTS = ['svg', 'html', 'json', 'card', 'png'] as const;
export type ArchifyExportFormat = (typeof ARCHIFY_EXPORTS)[number];

export type NormalizedDiagram = {
  id: string;
  type: string;
  preset: string;
  theme: string;
  title: string;
  nodeCount: number;
  edgeCount: number;
  updatedAt: string;
};

export type GenerateForm = {
  type: string;
  prompt: string;
  preset: string;
  theme: string;
};

export const emptyGenerateForm: GenerateForm = {
  type: 'architecture',
  prompt: '',
  preset: 'signal-flow',
  theme: 'dark',
};

/** Client-side mirror of the server generate rules (server re-validates). */
export function validateGenerateForm(form: GenerateForm): string | null {
  if (!ARCHIFY_TYPES.includes(form.type as (typeof ARCHIFY_TYPES)[number])) {
    return 'Pick one of the 5 diagram types';
  }
  if (!form.prompt.trim()) return 'Describe the diagram first';
  if (form.prompt.length > 2000) return 'Prompt too long (2000 max)';
  if (
    form.preset !== '' &&
    !(ARCHIFY_PRESETS as readonly string[]).includes(form.preset)
  ) {
    return 'Unknown preset';
  }
  if (form.theme !== 'dark' && form.theme !== 'light') return 'Theme must be dark or light';
  return null;
}

/** Type filter + title search over the live list (same shape as the server). */
export function filterDiagrams(items: NormalizedDiagram[], type: ArchifyTypeFilter, q: string): NormalizedDiagram[] {
  const needle = q.trim().toLowerCase();
  return items.filter(
    (d) =>
      (type === 'all' || d.type === type) &&
      (needle === '' ||
        d.title.toLowerCase().includes(needle) ||
        d.id.toLowerCase().includes(needle)),
  );
}

/** Two-letter badge text from the type (concept shows `AR`/`WO`/…). */
export function typeBadge(type: string): string {
  return type.slice(0, 2).toUpperCase();
}

/** `2026-09-03T…` → short relative label; falls back to the date part. */
export function formatUpdated(iso: string, nowMs = Date.now()): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso.slice(0, 10);
  const diff = nowMs - ms;
  if (diff < 0) return 'just now';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return iso.slice(0, 10);
}

/** Viewer deep-link hash the standalone HTML understands (`#focus=`…). */
export function focusHash(id: string): string {
  return `#focus=${encodeURIComponent(id)}`;
}

/** Route highlight hash (`#route=a~b`) for the share-card flow. */
export function routeHash(from: string, to: string): string {
  return `#route=${encodeURIComponent(from)}~${encodeURIComponent(to)}`;
}

/** Lens filter hash (`#lens=<kind>`) — dims every other kind. */
export function lensHash(kind: string): string {
  return `#lens=${encodeURIComponent(kind.toLowerCase())}`;
}

/** Parse an IR textarea edit — returns the object or a human error. */
export function parseIrEdit(text: string): { ir?: ArchifyIR; error?: string } {
  if (!text.trim()) return { error: 'IR is empty' };
  try {
    return { ir: JSON.parse(text) as ArchifyIR };
  } catch {
    return { error: 'Invalid JSON — fix the syntax first' };
  }
}

/** Receipt pass/fail counts for the pane header badge. */
export function receiptCounts(receipt: { status: string }[]): { pass: number; fail: number } {
  let pass = 0;
  let fail = 0;
  for (const row of receipt) {
    if (row.status === 'pass') pass += 1;
    else fail += 1;
  }
  return { pass, fail };
}
