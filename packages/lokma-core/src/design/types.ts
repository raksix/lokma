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
export type DesignSystem = (typeof DESIGN_SYSTEMS)[number];

/** Bundled system card — mirrors the concept picker's preset codes. */
export type DesignSystemMeta = {
  id: DesignSystem;
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

export type DesignManifest = {
  id: string;
  type: DesignType;
  brief: string;
  system: DesignSystem;
  createdAt: string;
  updatedAt: string;
};

export type DesignSummary = DesignManifest & {
  bytes: number;
  overall: number | null;
};

export type DesignDetail = {
  id: string;
  manifest: DesignManifest;
  html: string;
  critique: CritiqueResult | null;
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
