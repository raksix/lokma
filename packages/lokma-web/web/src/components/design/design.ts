import type { DesignManifest, DesignVersion } from '@/lib/api';

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
  // REQ-191 — a system id is now EITHER a bundled preset or an installed
  // package id, so membership in the frozen 4-table is no longer the rule
  // (it would reject a catalog row the picker just offered). The server
  // re-validates against the real catalog; here we only refuse a shape that
  // could never be a system id.
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(form.system)) {
    return 'Pick a design system';
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

// ─── REQ-190 — version history (tweak in place, picker, revert) ───────────────

/**
 * REQ-190 — cap + sentence length for the tweak box, shared by the composer's
 * counter and the server's own `assertTweakNote` so the UI cannot promise a
 * note the server will reject. Kept in sync by `design.test.ts`.
 */
export const DESIGN_TWEAK_NOTE_CAP = 400;

/** Validate a tweak sentence before spending a metered model call. */
export function validateTweakNote(note: string): string | null {
  if (!note.trim()) return 'Describe the change you want';
  if (note.length > DESIGN_TWEAK_NOTE_CAP) return `Tweak too long (${DESIGN_TWEAK_NOTE_CAP} chars max)`;
  return null;
}

/**
 * REQ-190 — the option row for a version. The label names the origin and the
 * score so the history is readable without opening anything, and the current
 * entry is marked rather than silently selected.
 */
export function versionLabel(version: DesignVersion, currentVersion: number): string {
  const origin = ORIGIN_LABEL[version.origin] ?? version.origin;
  const head = `v${version.n} · ${origin}`;
  const score = version.overall === null || version.overall === undefined ? '' : ` · ${version.overall}/10`;
  return version.n === currentVersion ? `${head} · current${score}` : `${head}${score}`;
}

/** Human origin names for the picker (a new origin falls back to its raw name). */
const ORIGIN_LABEL: Record<DesignVersion['origin'], string> = {
  generate: 'generated',
  tweak: 'tweak',
  edit: 'edit',
  revert: 'revert',
};

/**
 * REQ-190 — is `n` the entry a revert should target? The current version is
 * excluded (reverting to what you already see is a no-op that would still burn
 * a write) and so is anything the ledger does not contain, so the UI can never
 * send a version the server will 404.
 */
export function canRevertTo(versions: DesignVersion[], n: number, currentVersion: number): boolean {
  if (!Number.isInteger(n) || n === currentVersion) return false;
  return versions.some((v) => v.n === n);
}

/**
 * REQ-190 — the version a revert lands on. The server appends the restored
 * body as a NEW current entry, so the selector must advance to the version
 * after the one being restored; a server that answered a smaller index is
 * reported as-is rather than invented forward.
 */
export function versionAfterRevert(currentVersion: number, restoredFrom: number): number {
  return Math.max(currentVersion + 1, 1);
}

// ─── REQ-190 §3 — editable field surfaces (one control per field) ───────────

/**
 * REQ-190 §3 — the Figma-flavoured edit surface: a fixed, small set of fields
 * the user can change on the artifact in front of them instead of retyping a
 * whole brief. Each field is ONE control plus the free-text tweak sentence
 * that already exists; picking a field does not invent a second write path.
 */
export const DESIGN_TWEAK_FIELDS = ['type', 'system', 'palette', 'density', 'model', 'content'] as const;
export type DesignTweakField = (typeof DESIGN_TWEAK_FIELDS)[number];

/** Palette choices the picker offers — a name + the hex it asks for. */
export const DESIGN_PALETTES = [
  { id: 'terracotta', label: 'Terracotta', hex: '#C96442' },
  { id: 'ink', label: 'Ink', hex: '#262624' },
  { id: 'sage', label: 'Sage', hex: '#5E7D5A' },
  { id: 'ocean', label: 'Ocean', hex: '#2F5D7C' },
  { id: 'plum', label: 'Plum', hex: '#6B4E71' },
] as const;

/** Density steps — spacing rhythm, not font size. */
export const DESIGN_DENSITIES = ['compact', 'regular', 'spacious'] as const;
export type DesignDensity = (typeof DESIGN_DENSITIES)[number];

/** The two things a field pick must be able to say about itself. */
export type DesignFieldControl = {
  field: DesignTweakField;
  label: string;
  /** `select` rows carry options; `text` is the free-content block. */
  kind: 'select' | 'text';
  options: { value: string; label: string }[];
};

/**
 * Build the picker rows for one field. `systems` is the LIVE system catalog
 * (REQ-191 replaces the bundled four), so this never re-declares the list.
 */
export function fieldOptions(
  field: DesignTweakField,
  systems: readonly { id: string; name: string }[],
): { value: string; label: string }[] {
  if (field === 'type') return DESIGN_TYPES.map((t) => ({ value: t, label: t }));
  if (field === 'system') return systems.map((s) => ({ value: s.id, label: s.name }));
  if (field === 'density') return DESIGN_DENSITIES.map((d) => ({ value: d, label: d }));
  if (field === 'palette') return DESIGN_PALETTES.map((p) => ({ value: p.id, label: `${p.label} ${p.hex}` }));
  if (field === 'model') return [];
  return [];
}

/**
 * REQ-190 §3 — what the artifact's manifest actually records for a field, or
 * `null` when the manifest does NOT know it. Palette, density and content live
 * only inside the generated HTML, so reporting a "current" value for them
 * would be a fabrication; the honest answer is `null` and the UI says so.
 */
export function fieldCurrentValue(field: DesignTweakField, manifest: { type: string; system: string; model?: string } | null): string | null {
  if (!manifest) return null;
  if (field === 'type') return manifest.type;
  if (field === 'system') return manifest.system;
  if (field === 'model') return manifest.model ?? null;
  return null;
}

/**
 * REQ-190 §3 — the tweak sentence a field pick produces. Returns `null` when
 * the pick cannot be expressed (empty value) or would be a no-op against a
 * value the manifest already records — a metered rewrite that changes nothing
 * is worse than no button.
 */
export function buildFieldTweakNote(
  field: DesignTweakField,
  value: string,
  current: string | null,
): string | null {
  const v = value.trim();
  if (!v) return null;
  if (current !== null && current === v) return null;
  if (field === 'type') return `Re-cut this artifact as a ${v} — keep the same content and product intent.`;
  if (field === 'system') return `Re-skin this artifact with the ${v} design system — same layout and content, new tokens.`;
  if (field === 'density') return `Change the layout density to ${v} — same elements, ${v === 'compact' ? 'tighter' : v === 'spacious' ? 'roomier' : 'regular'} spacing rhythm.`;
  if (field === 'palette') {
    const pal = DESIGN_PALETTES.find((p) => p.id === v);
    return `Switch the accent palette to ${pal ? `${pal.label} ${pal.hex}` : v} — recolor buttons, links and focus rings, keep the layout.`;
  }
  if (field === 'model') return `Regenerate this artifact with the model ${v} — keep the same brief and system.`;
  return `Rewrite the copy of this artifact using this text:\n${v}`;
}

/** Full control descriptor (label + kind + options) for one field. */
export function fieldControl(
  field: DesignTweakField,
  systems: readonly { id: string; name: string }[],
): DesignFieldControl {
  if (field === 'type') return { field, label: 'Type', kind: 'select', options: fieldOptions(field, systems) };
  if (field === 'system') return { field, label: 'System', kind: 'select', options: fieldOptions(field, systems) };
  if (field === 'palette') return { field, label: 'Palette', kind: 'select', options: fieldOptions(field, systems) };
  if (field === 'density') return { field, label: 'Density', kind: 'select', options: fieldOptions(field, systems) };
  if (field === 'model') return { field, label: 'Model', kind: 'select', options: fieldOptions(field, systems) };
  return { field, label: 'Content', kind: 'text', options: [] };
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
