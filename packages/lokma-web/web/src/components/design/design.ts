import type { DesignManifest } from '@/lib/api';

/**
 * Pure helpers behind the DesignPane (W5-18) — no React, no fetch, so the
 * `bun src/components/design/design.test.ts` probe covers them directly.
 * Server validation owns the truth; these only shape/filter client state.
 * Concept mock rows are never ported — rows come from
 * `GET /api/design/list`, never invented here.
 */

export const DESIGN_TYPES = ['prototype', 'deck', 'mobile', 'image', 'document', 'hyperframe'] as const;
export type DesignTypeFilter = (typeof DESIGN_TYPES)[number] | 'all';

export const DESIGN_SYSTEMS = ['stripe-linear', 'omp-dark', 'paper-ink', 'minimal-geo'] as const;

export const DESIGN_EXPORTS = ['html', 'zip', 'json', 'png', 'webm'] as const;
export type DesignExportFormat = (typeof DESIGN_EXPORTS)[number];

export type NormalizedArtifact = {
  id: string;
  type: string;
  brief: string;
  system: string;
  createdAt: string;
  updatedAt: string;
  bytes: number;
  overall: number | null;
};

export type GenerateForm = {
  type: string;
  brief: string;
  system: string;
};

export const emptyGenerateForm: GenerateForm = {
  type: 'prototype',
  brief: '',
  system: 'stripe-linear',
};

/** Client-side mirror of the server generate rules (server re-validates). */
export function validateGenerateForm(form: GenerateForm): string | null {
  if (!(DESIGN_TYPES as readonly string[]).includes(form.type)) {
    return 'Pick one of the 6 artifact types';
  }
  if (!form.brief.trim()) return 'Describe the artifact first';
  if (form.brief.length > 2000) return 'Brief too long (2000 max)';
  if (!(DESIGN_SYSTEMS as readonly string[]).includes(form.system)) {
    return 'Pick one of the 4 design systems';
  }
  return null;
}

/** Type filter + brief search over the live list (same shape as the server). */
export function filterArtifacts(items: NormalizedArtifact[], type: DesignTypeFilter, q: string): NormalizedArtifact[] {
  const needle = q.trim().toLowerCase();
  return items.filter(
    (d) =>
      (type === 'all' || d.type === type) &&
      (needle === '' ||
        d.brief.toLowerCase().includes(needle) ||
        d.id.toLowerCase().includes(needle)),
  );
}

/** Two-letter badge text from the type (concept shows `PR`/`DE`/…). */
export function artifactBadge(type: string): string {
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

/** Parse an HTML textarea edit — returns the document or a human error. */
export function parseHtmlEdit(text: string): { html?: string; error?: string } {
  if (!text.trim()) return { error: 'HTML is empty' };
  if (!text.includes('<') || !text.includes('>')) return { error: 'Not markup — the Code tab saves HTML' };
  if (text.length > 512 * 1024) return { error: 'HTML too large (512KB max)' };
  return { html: text };
}

/** Score → tone for the 5D critique rows (pane maps tones to classes). */
export function scoreTone(score: number): 'good' | 'warn' | 'bad' {
  if (score >= 8) return 'good';
  if (score >= 6) return 'warn';
  return 'bad';
}

/** Normalize a design detail manifest into a list row (null when foreign). */
export function toRow(manifest: DesignManifest, bytes: number, overall: number | null): NormalizedArtifact {
  return {
    id: manifest.id,
    type: manifest.type,
    brief: manifest.brief,
    system: manifest.system,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    bytes,
    overall,
  };
}

/** Overall score label for the row badge (`8/10` or `—` when uncritiqued). */
export function overallLabel(overall: number | null): string {
  return overall === null ? '—' : `${overall}/10`;
}
