/**
 * Design Studio types — 6 artifact kinds over 4 bundled systems (Docs/34).
 * The agent produces branded HTML, Lokma validates (DESIGN.md guard +
 * 5-dimension heuristic critique) and stores deterministic self-contained
 * files under `~/.lokma/design/artifacts/<id>/` — no CDN, no image model.
 */

export const DESIGN_TYPES = [
  'prototype',
  'deck',
  'mobile',
  'image',
  'document',
  'hyperframe',
] as const;
export type DesignType = (typeof DESIGN_TYPES)[number];

export const DESIGN_SYSTEMS = [
  'stripe-linear',
  'omp-dark',
  'paper-ink',
  'minimal-geo',
] as const;
/**
 * REQ-191 — a system is a bundled preset id OR an installed package id, so the
 * type is the plain string: a closed union here would make every catalog row
 * inexpressible in the manifest. `DESIGN_SYSTEM_META` lookup is therefore always
 * indexed behind a membership guard (see `designSystemMeta` in systems.ts).
 */
export type DesignSystem = string;

/** Bundled system card — mirrors the concept picker's preset codes. */
export type DesignSystemMeta = {
  id: typeof DESIGN_SYSTEMS[number];
  name: string;
  preset: string;
  tokens: string;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  accentSoft: string;
  line: string;
  font: string;
};

export const DESIGN_SYSTEM_META: Record<DesignSystem, DesignSystemMeta> = {
  'stripe-linear': {
    id: 'stripe-linear',
    name: 'Stripe/Linear',
    preset: 'A1',
    tokens: 'cream #FAF9F5 + terracotta #C96442 · tight',
    bg: '#FAF9F5',
    surface: '#FFFFFF',
    ink: '#262624',
    muted: '#6B7280',
    accent: '#C96442',
    accentSoft: '#FDF0E6',
    line: '#E8E4DE',
    font: 'Inter, system-ui, sans-serif',
  },
  'omp-dark': {
    id: 'omp-dark',
    name: 'OMP Midnight',
    preset: 'A2',
    tokens: 'near-black · indigo #6366F1 · zinc',
    bg: '#0B0B0F',
    surface: '#16161D',
    ink: '#F4F4F5',
    muted: '#9CA3AF',
    accent: '#6366F1',
    accentSoft: '#1E1E2E',
    line: '#2A2A35',
    font: 'Inter, system-ui, sans-serif',
  },
  'paper-ink': {
    id: 'paper-ink',
    name: 'Paper Ink',
    preset: 'B',
    tokens: 'warm paper #FFFBF5 · ink #1A1A1A',
    bg: '#FFFBF5',
    surface: '#FFFFFF',
    ink: '#1A1A1A',
    muted: '#78716C',
    accent: '#B45309',
    accentSoft: '#FEF3C7',
    line: '#E7E0D4',
    font: 'Georgia, "Times New Roman", serif',
  },
  'minimal-geo': {
    id: 'minimal-geo',
    name: 'Minimal Geo',
    preset: 'C',
    tokens: 'geometric · spacious',
    bg: '#FFFFFF',
    surface: '#F8F8F8',
    ink: '#111111',
    muted: '#737373',
    accent: '#111111',
    accentSoft: '#F0F0F0',
    line: '#E5E5E5',
    font: 'Inter, system-ui, sans-serif',
  },
};

export const DESIGN_EXPORTS = ['html', 'zip', 'json'] as const;
export type DesignExportFormat = (typeof DESIGN_EXPORTS)[number];

/** Formats the concept offers that need a binary toolchain (honest 400). */
export const DESIGN_DEFERRED_EXPORTS = ['pdf', 'pptx', 'mp4'] as const;

export type CritiqueDim = 'visual' | 'interaction' | 'copy' | 'motion' | 'brand';

export type CritiqueScore = {
  dim: CritiqueDim;
  /** 0-10 deterministic heuristic (see store.ts — never an LLM grade). */
  score: number;
  fixes: string[];
};

export type CritiqueResult = {
  overall: number;
  scores: CritiqueScore[];
};

/**
 * REQ-190 — one entry of an artifact's version history. Every mutation of an
 * artifact (generation, tweak, manual Code-tab edit, revert) appends one
 * entry, so an edit is REVERSIBLE and a tweak never grows the artifact list.
 * The HTML body is NOT stored per version: version N's bytes live in
 * `versions/<sha8>.html` and the CURRENT body stays in `artifact.html`, so
 * the existing read paths keep working unchanged.
 */
export type DesignVersion = {
  /** Monotonic index into `manifest.versions` (v1 = the first body). */
  n: number;
  /** sha256 of that version's HTML, full hex — the optimistic-lock token. */
  sha: string;
  bytes: number;
  createdAt: string;
  /** What produced it: `generate` | `tweak` | `edit` | `revert`. */
  origin: DesignVersionOrigin;
  /** The tweak sentence / manual note (absent for plain generation). */
  note?: string;
  /** Model that produced the body when known (generation + tweaks). */
  model?: string;
  /** 5D heuristic score of THIS body, so the picker can show history. */
  overall: number | null;
};

export const DESIGN_VERSION_ORIGINS = ['generate', 'tweak', 'edit', 'revert'] as const;
export type DesignVersionOrigin = (typeof DESIGN_VERSION_ORIGINS)[number];

/** Max versions kept per artifact (oldest are pruned, newest always wins). */
export const DESIGN_VERSION_CAP = 20;

export type DesignManifest = {
  id: string;
  type: DesignType;
  brief: string;
  system: DesignSystem;
  /** Model that generated the artifact (absent on pre-REQ-177 artifacts). */
  model?: string;
  /** REQ-178 — absolute project dir when stored under a project (absent = global). */
  project?: string;
  createdAt: string;
  updatedAt: string;
  /** REQ-190 — version history, oldest first. Absent on pre-REQ-190 artifacts. */
  versions?: DesignVersion[];
};

export type DesignSummary = Omit<DesignManifest, 'versions'> & {
  bytes: number;
  overall: number | null;
  /**
   * REQ-190 — history size + which entry is current (v1 = the first body).
   * The array itself rides on `DesignDetail` only; the list stays lean.
   */
  versionCount: number;
  currentVersion: number;
};

export type DesignDetail = {
  id: string;
  manifest: DesignManifest;
  html: string;
  critique: CritiqueResult | null;
  /** REQ-190 — sha256 of the CURRENT html: the `expectedSha` lock token. */
  sha: string;
  /** REQ-190 — `versions[].n` of the current body (1 when history is absent). */
  currentVersion: number;
};

export type DesignGuard = {
  cwd: string;
  present: boolean;
  h2Count: number;
  sections: string[];
  /** True when the file holds 7+ H2 sections (Docs/34 §4.2 lint rule). */
  ok: boolean;
  message: string;
};

/** Max brief chars accepted by `generateArtifact()`. */
export const DESIGN_BRIEF_CAP = 2000;
/** Max stored HTML bytes (pane editor + PUT guard). */
export const DESIGN_HTML_CAP = 512 * 1024;
/** Max artifacts listed (the pane renders rows, not a virtual list). */
export const DESIGN_LIST_CAP = 200;

/** Typed error — routes map `code`/`status` straight into `{ code, message }`. */
export class DesignError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'DesignError';
    this.code = code;
    this.status = status;
  }
}
