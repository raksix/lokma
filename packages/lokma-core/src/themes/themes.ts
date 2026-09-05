/**
 * themes.ts — canonical theme registry (Phase 3 themes polish).
 *
 * Single source of truth for the four named themes (`themes/*.json` at the
 * repo root: claude/omp/midnight/paper). The values below are copied 1:1
 * from those files and locked by `themes.test.ts` (parity probe fails the
 * suite if they drift). Embedded as consts (not read from disk) so the
 * compiled `dist` carries the data anywhere — no runtime path lookups.
 * The server exposes them via `GET /api/themes`; the web applies the
 * active one (`data-theme` + CSS vars); the CLI will read the same defs.
 */

/** Web light/dark family a theme belongs to (drives the `.dark` class). */
export type ThemeMode = 'light' | 'dark';

/** One theme definition — mirrors `themes/<id>.json` plus a derived mode. */
export type ThemeDef = {
  id: string;
  /** Short display name (e.g. "Claude"). Derived from the label. */
  name: string;
  /** Full label from the JSON (e.g. "Claude — cream/terracotta, warm light"). */
  label: string;
  description: string;
  mode: ThemeMode;
  /** shadcn-style CSS vars (`background`, `primary`, `chart-1`, …). */
  cssVars: Record<string, string>;
  /** CLI Chalk tokens (`primary`, `background`, `foreground`, …). */
  chalk: Record<string, string>;
};

/** Card preview swatches derived from the Chalk tokens (never invented). */
export type ThemePreview = { bg: string; accent: string };

/** Derive the card preview from a def's own Chalk tokens. */
export function themePreview(def: ThemeDef): ThemePreview {
  return { bg: def.chalk['background'] ?? '#ffffff', accent: def.chalk['primary'] ?? '#000000' };
}

const CLAUDE: ThemeDef = {
  id: 'claude',
  name: 'Claude',
  label: 'Claude — cream/terracotta, warm light',
  description:
    "Light minimal with cream #FAF9F5 + terracotta #C96442 + ink #262624 — the 'Claude colors' Furkan likes",
  mode: 'light',
  cssVars: {
    background: '40 33% 98%',
    foreground: '30 8% 15%',
    card: '40 33% 98%',
    'card-foreground': '30 8% 15%',
    popover: '0 0% 100%',
    'popover-foreground': '30 8% 15%',
    primary: '15 55% 52%',
    'primary-foreground': '0 0% 98%',
    secondary: '30 10% 94%',
    'secondary-foreground': '30 8% 15%',
    muted: '30 10% 94%',
    'muted-foreground': '30 6% 45%',
    accent: '30 10% 94%',
    'accent-foreground': '30 8% 15%',
    destructive: '0 84% 60%',
    'destructive-foreground': '0 0% 98%',
    border: '30 8% 88%',
    input: '30 8% 88%',
    ring: '15 55% 52%',
    radius: '0.5rem',
    'chart-1': '15 55% 52%',
    'chart-2': '173 58% 39%',
    'chart-3': '197 37% 24%',
    'chart-4': '43 74% 66%',
    'chart-5': '27 87% 67%',
  },
  chalk: {
    primary: '#C96442',
    background: '#FAF9F5',
    foreground: '#262624',
    muted: '#8a8684',
    border: '#e6e2de',
  },
};

const OMP: ThemeDef = {
  id: 'omp',
  name: 'OMP',
  label: 'OMP — near-black + indigo (default)',
  description: 'Near-black #0a0a0f + indigo #6366f1 + zinc — OMP benchmarked, dark first',
  mode: 'dark',
  cssVars: {
    background: '240 10% 4%',
    foreground: '0 0% 98%',
    card: '240 10% 4%',
    'card-foreground': '0 0% 98%',
    popover: '240 10% 4%',
    'popover-foreground': '0 0% 98%',
    primary: '239 84% 67%',
    'primary-foreground': '0 0% 98%',
    secondary: '240 4% 16%',
    'secondary-foreground': '0 0% 98%',
    muted: '240 4% 16%',
    'muted-foreground': '240 5% 64%',
    accent: '240 4% 16%',
    'accent-foreground': '0 0% 98%',
    destructive: '0 63% 31%',
    'destructive-foreground': '0 0% 98%',
    border: '240 4% 16%',
    input: '240 4% 16%',
    ring: '239 84% 67%',
    radius: '0.5rem',
    'chart-1': '239 84% 67%',
    'chart-2': '173 58% 39%',
    'chart-3': '197 37% 24%',
    'chart-4': '43 74% 66%',
    'chart-5': '27 87% 67%',
  },
  chalk: {
    primary: '#6366f1',
    background: '#0a0a0f',
    foreground: '#e6e6eb',
    muted: '#71717a',
    border: '#27272a',
  },
};

const MIDNIGHT: ThemeDef = {
  id: 'midnight',
  name: 'Midnight',
  label: 'Midnight — deep navy + cyan',
  description: 'Deep navy #0f172a + cyan #06b6d4 + slate — IDE dark, calm',
  mode: 'dark',
  cssVars: {
    background: '222 47% 11%',
    foreground: '210 40% 98%',
    card: '222 47% 11%',
    'card-foreground': '210 40% 98%',
    popover: '222 47% 11%',
    'popover-foreground': '210 40% 98%',
    primary: '199 89% 48%',
    'primary-foreground': '222 47% 11%',
    secondary: '217 33% 17%',
    'secondary-foreground': '210 40% 98%',
    muted: '217 33% 17%',
    'muted-foreground': '215 20% 65%',
    accent: '217 33% 17%',
    'accent-foreground': '210 40% 98%',
    destructive: '0 63% 31%',
    'destructive-foreground': '210 40% 98%',
    border: '217 33% 17%',
    input: '217 33% 17%',
    ring: '199 89% 48%',
    radius: '0.5rem',
    'chart-1': '199 89% 48%',
    'chart-2': '173 58% 39%',
    'chart-3': '43 74% 66%',
    'chart-4': '27 87% 67%',
    'chart-5': '142 71% 45%',
  },
  chalk: {
    primary: '#06b6d4',
    background: '#0f172a',
    foreground: '#f1f5f9',
    muted: '#94a3b8',
    border: '#1e293b',
  },
};

const PAPER: ThemeDef = {
  id: 'paper',
  name: 'Paper',
  label: 'Paper — pure white + neutral',
  description: 'Pure white #ffffff + neutral #52525b + accent indigo — clean light, print-friendly',
  mode: 'light',
  cssVars: {
    background: '0 0% 100%',
    foreground: '240 10% 4%',
    card: '0 0% 100%',
    'card-foreground': '240 10% 4%',
    popover: '0 0% 100%',
    'popover-foreground': '240 10% 4%',
    primary: '240 6% 10%',
    'primary-foreground': '0 0% 98%',
    secondary: '240 5% 96%',
    'secondary-foreground': '240 6% 10%',
    muted: '240 5% 96%',
    'muted-foreground': '240 4% 46%',
    accent: '240 5% 96%',
    'accent-foreground': '240 6% 10%',
    destructive: '0 84% 60%',
    'destructive-foreground': '0 0% 98%',
    border: '240 6% 90%',
    input: '240 6% 90%',
    ring: '240 6% 10%',
    radius: '0.5rem',
    'chart-1': '240 6% 10%',
    'chart-2': '173 58% 39%',
    'chart-3': '197 37% 24%',
    'chart-4': '43 74% 66%',
    'chart-5': '27 87% 67%',
  },
  chalk: {
    primary: '#18181b',
    background: '#ffffff',
    foreground: '#18181b',
    muted: '#71717a',
    border: '#e4e4e7',
  },
};

/** All named themes in gallery order (default first). */
const THEMES: readonly ThemeDef[] = [OMP, CLAUDE, MIDNIGHT, PAPER];

/** List every named theme (gallery order, default first). */
export function listThemes(): ThemeDef[] {
  return [...THEMES];
}

/** Look up one theme by id (exact match, case-sensitive). */
export function getThemeDef(id: string): ThemeDef | null {
  return THEMES.find((t) => t.id === id) ?? null;
}

/** Check an unknown value is a known theme id. */
export function isThemeId(v: unknown): v is string {
  return typeof v === 'string' && THEMES.some((t) => t.id === v);
}

/** Default theme of a light/dark family (server default is omp). */
export function defaultThemeForMode(mode: ThemeMode): ThemeDef {
  return mode === 'dark' ? OMP : CLAUDE;
}

/** Wire shape the server sends (def + derived card preview). */
export type ThemeView = ThemeDef & { preview: ThemePreview };

/** Enrich a def with its card preview for the wire. */
export function toThemeView(def: ThemeDef): ThemeView {
  return { ...def, preview: themePreview(def) };
}
