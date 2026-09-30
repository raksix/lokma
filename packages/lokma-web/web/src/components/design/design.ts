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

/** Mirror of the server `cwd` bound (REQ-178 store `DESIGN_CWD_MAX_LEN`). */
export const DESIGN_CWD_MAX_LEN = 500;

export type NormalizedArtifact = {
  id: string;
  type: string;
  brief: string;
  system: string;
  createdAt: string;
  updatedAt: string;
  bytes: number;
  overall: number | null;
  /** REQ-178 — absolute project cwd the artifact was written under (absent = global). */
  project?: string;
};

export type GenerateForm = {
  type: string;
  brief: string;
  system: string;
  /** Picked model id — '' means the configured default chain (REQ-177). */
  model: string;
};

export const emptyGenerateForm: GenerateForm = {
  type: 'prototype',
  brief: '',
  system: 'stripe-linear',
  model: '',
};

/**
 * REQ-179 — example brief chips for the canvas empty state: one click parks
 * the text (and its natural type) in the composer, so a first artifact never
 * starts from a blank page. Pure data, pinned by the unit probe (real type,
 * non-empty brief, unique ids, passes client validation).
 */
export type DesignSample = {
  id: string;
  label: string;
  brief: string;
  type: (typeof DESIGN_TYPES)[number];
};

export const DESIGN_SAMPLES: DesignSample[] = [
  {
    id: 'pricing',
    label: 'Pricing page',
    type: 'prototype',
    brief: 'SaaS pricing page — three tiers, annual/monthly toggle, one plan highlighted, FAQ strip.',
  },
  {
    id: 'onboarding',
    label: 'Mobile onboarding',
    type: 'mobile',
    brief: 'Mobile onboarding — three steps with progress dots, a skip link, illustration area.',
  },
  {
    id: 'deck-cover',
    label: 'Deck cover',
    type: 'deck',
    brief: 'Investor deck cover — bold serif title, one-line subtitle, quiet grid backdrop.',
  },
  {
    id: 'editorial',
    label: 'Editorial page',
    type: 'document',
    brief: 'Editorial article page — paper tones, wide margins, one pull quote, calm reading rhythm.',
  },
];

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
  if (form.model && form.model.length > 200) return 'Model id too long (200 max)';
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
    // REQ-178 — carry the project cwd when the manifest recorded one (the
    // row chip names it; absent stays undefined = global root).
    project: typeof manifest.project === 'string' && manifest.project.length > 0 ? manifest.project : undefined,
  };
}

/**
 * REQ-178 — short label for a project cwd. `''` is the global root; any
 * absolute path renders as its last segment (a chip, never the full path).
 */
export function projectLabel(cwd: string): string {
  if (!cwd) return 'Global (~)';
  const parts = cwd.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : cwd;
}

/** Overall score label for the row badge (`8/10` or `—` when uncritiqued). */
export function overallLabel(overall: number | null): string {
  return overall === null ? '—' : `${overall}/10`;
}

/**
 * REQ-172 — one session activity chip in the Design chat thread
 * ("Generated …", "HTML saved", "Critique 8/10", errors). Ephemeral by
 * design: the artifact list is the durable history, events only narrate
 * what this visit actually did.
 */
export type DesignEvent = {
  id: number;
  kind: 'ok' | 'info' | 'error';
  text: string;
  at: number;
};

/**
 * Newest-last push with a hard cap: the thread only renders the tail, so a
 * long session must not grow the list without bound. Returns a NEW array
 * (never mutates the input — React state update).
 */
export function appendDesignEvent(list: DesignEvent[], event: DesignEvent, cap = 40): DesignEvent[] {
  const keep = list.length >= cap ? list.slice(list.length - cap + 1) : list.slice();
  keep.push(event);
  return keep;
}
