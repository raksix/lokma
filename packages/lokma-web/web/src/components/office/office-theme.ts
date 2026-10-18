/**
 * Office palette from the named theme tokens (REQ-204 slice 7).
 *
 * The pixel office wears the SAME theme the app wears. Every colour the
 * vendored renderer lets a theme override is derived here from the theme's
 * own tokens — the same `GET /api/themes` payload the Appearance cards show
 * (`cssVars` HSL triples + `chalk` hex + `mode`). Nothing is hand-picked:
 *
 *  - STRUCTURE (walls, bricks, floors, wood, carpets, frames, plates) follows
 *    the theme's BACKGROUND: its hue, and its saturation scaled by `tint` —
 *    a muted background gets a near-neutral room, a colourful one gets a
 *    tinted room, so the office stays the THEME's, not the author's.
 *  - HIGHLIGHTS (rug, boss chair, sign, logo) follow the theme's PRIMARY
 *    token, lightness-clamped so they stay readable on the renderer's fixed
 *    near-black tag plate (`OFFICE_TAG_PLATE`, mirrored from the renderer's
 *    base `dark`).
 *  - `dim` — the status line the office draws on that plate — comes from
 *    `muted-foreground`, clamped up for the same reason.
 *
 * The only authored numbers are the lightness ladders in `PALETTE`: the
 * office is pixel art on one fixed warm base, so a dark theme needs the whole
 * wall/floor family moved down, not one accent swapped. The table carries
 * ONE row per key with both families side by side, so a ladder that quietly
 * loses a key shows up as a missing entry (asserted in the probe).
 *
 * Honesty: a theme whose tokens do not resolve (no `cssVars`, no `chalk`) is
 * DROPPED from the registry — the renderer then keeps its own per-project
 * theme, which is exactly what `auto` mode means. A palette is never
 * invented, and no colour literal appears outside this file's token parsing.
 *
 * Nothing here fetches or renders — the pane owns the I/O — so every rule is
 * unit-provable without a DOM (the `office-view.ts` pattern).
 */

/** The three token fields the mapping reads, as the server serves them. */
export type OfficeThemeTokens = {
  id: string;
  mode: 'light' | 'dark';
  cssVars: Record<string, string>;
  chalk: Record<string, string>;
};

/** One renderer theme entry: the wall sign + the colour overrides. */
export type OfficeThemeEntry = {
  sign: string;
  colors: Record<string, number>;
};

/** How the office picks its palette (persisted view preference). */
export type OfficeThemeMode = 'app' | 'auto';

export const OFFICE_THEME_MODES: OfficeThemeMode[] = ['app', 'auto'];

/** The wall sign of a Lokma-themed room (the renderer always draws one). */
export const OFFICE_THEME_SIGN = 'LOKMA';

/** Registry key prefix — `lokma-claude`, `lokma-omp`, … */
export function officeThemeName(id: string): string {
  return 'lokma-' + id;
}

/**
 * The renderer's tag-plate background (its base `dark`, never theme-
 * overridden upstream). Our text clamps are measured against it.
 */
export const OFFICE_TAG_PLATE = 0x1d1a24;

/** WCAG relative-contrast ratio between two 0xrrggbb colours. */
export function contrastRatio(a: number, b: number): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

function relativeLuminance(rgb: number): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel((rgb >> 16) & 255) + 0.7152 * channel((rgb >> 8) & 255) + 0.0722 * channel(rgb & 255);
}

export type Hsl = { h: number; s: number; l: number };

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Parse a shadcn/tailwind HSL triple ("40 33% 98%"). `null` for anything
 * else — a malformed token must not silently become a colour somewhere else.
 */
export function parseHslTriple(value: unknown): Hsl | null {
  if (typeof value !== 'string') return null;
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 3) return null;
  const nums = parts.map((p) => Number(p.replace('%', '')));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const h = ((nums[0]! % 360) + 360) % 360;
  return { h, s: clamp(nums[1]! / 100, 0, 1), l: clamp(nums[2]! / 100, 0, 1) };
}

/** Parse a `#rrggbb` / `rrggbb` chalk colour into 0xrrggbb. */
export function parseHexColor(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const body = value.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(body)) return null;
  return parseInt(body, 16);
}

/** 0xrrggbb from hue (deg)/saturation/lightness — the renderer's own formula. */
export function hslToRgb(h: number, s: number, l: number): number {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

/** Hue/sat/lightness of a 0xrrggbb colour (probe + fallback use). */
export function rgbToHsl(rgb: number): Hsl {
  const r = ((rgb >> 16) & 255) / 255;
  const g = ((rgb >> 8) & 255) / 255;
  const b = (rgb & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** Which token feeds a ladder row. */
type HueSource = 'background' | 'accent';
/** One palette row: hue source, saturation (`'accent'` = the accent's own), lightness per family. */
type Row = { hue: HueSource; sat: number | 'accent'; light: readonly [number, number] };

/**
 * Key -> ladder row. Key set = everything the renderer's own per-project
 * theme overrides (the same surface a theme is expected to dress), so a
 * themed room reads as fully themed instead of half classic.
 */
const PALETTE: Record<string, Row> = {
  frame: { hue: 'background', sat: 0.22, light: [0.2, 0.06] },
  ol: { hue: 'background', sat: 0.2, light: [0.3, 0.12] },
  wallTop: { hue: 'background', sat: 0.26, light: [0.7, 0.17] },
  wallTopHi: { hue: 'background', sat: 0.26, light: [0.78, 0.25] },
  brick: { hue: 'background', sat: 0.3, light: [0.58, 0.3] },
  brickDark: { hue: 'background', sat: 0.3, light: [0.5, 0.23] },
  mortar: { hue: 'background', sat: 0.22, light: [0.84, 0.42] },
  cream: { hue: 'background', sat: 0.24, light: [0.9, 0.3] },
  creamStripe: { hue: 'background', sat: 0.24, light: [0.84, 0.26] },
  sage: { hue: 'background', sat: 0.18, light: [0.68, 0.3] },
  sageStripe: { hue: 'background', sat: 0.18, light: [0.62, 0.26] },
  panel: { hue: 'background', sat: 0.14, light: [0.52, 0.34] },
  panelDark: { hue: 'background', sat: 0.14, light: [0.44, 0.28] },
  wainscot: { hue: 'background', sat: 0.32, light: [0.62, 0.34] },
  wainscotDark: { hue: 'background', sat: 0.32, light: [0.52, 0.27] },
  checkA: { hue: 'background', sat: 0.2, light: [0.92, 0.34] },
  checkB: { hue: 'background', sat: 0.22, light: [0.84, 0.27] },
  woodA: { hue: 'background', sat: 0.36, light: [0.64, 0.38] },
  woodB: { hue: 'background', sat: 0.36, light: [0.56, 0.32] },
  woodSeam: { hue: 'background', sat: 0.36, light: [0.42, 0.22] },
  carpetA: { hue: 'background', sat: 0.2, light: [0.8, 0.3] },
  carpetB: { hue: 'background', sat: 0.2, light: [0.74, 0.26] },
  windowFrame: { hue: 'background', sat: 0.32, light: [0.95, 0.55] },
  statusBg: { hue: 'background', sat: 0.28, light: [0.16, 0.1] },
  statusText: { hue: 'background', sat: 0.18, light: [0.92, 0.92] },
  rugRed: { hue: 'accent', sat: 'accent', light: [0.52, 0.38] },
  rugRedIn: { hue: 'accent', sat: 'accent', light: [0.44, 0.3] },
  bossChair: { hue: 'accent', sat: 'accent', light: [0.4, 0.3] },
  bossChairHi: { hue: 'accent', sat: 'accent', light: [0.5, 0.4] },
  signGreen: { hue: 'accent', sat: 'accent', light: [0.3, 0.26] },
  signGreenDark: { hue: 'accent', sat: 'accent', light: [0.22, 0.19] },
  logoOn: { hue: 'accent', sat: 0.75, light: [0.8, 0.8] },
};

type Anchors = {
  mode: 'light' | 'dark';
  bg: Hsl;
  accent: Hsl;
  dim: Hsl | null;
};

function hslOfHex(value: unknown): Hsl | null {
  const rgb = parseHexColor(value);
  return rgb === null ? null : rgbToHsl(rgb);
}

/** Resolve the theme's anchor tokens from cssVars, falling back to chalk. */
function anchorsOf(tokens: OfficeThemeTokens): Anchors | null {
  const vars = tokens.cssVars ?? {};
  const chalk = tokens.chalk ?? {};
  const bg = parseHslTriple(vars['background']) ?? hslOfHex(chalk['background']);
  const accent = parseHslTriple(vars['primary']) ?? hslOfHex(chalk['primary']);
  if (!bg || !accent) return null;
  const dim = parseHslTriple(vars['muted-foreground']) ?? hslOfHex(chalk['muted']);
  return { mode: tokens.mode === 'dark' ? 'dark' : 'light', bg, accent, dim };
}

/** Accent saturation: the token's own, floored so a mono theme still reads. */
function accentSat(accent: Hsl): number {
  return clamp(accent.s, 0.32, 0.6);
}

/**
 * Structure tint: how much of the background's own colour the room keeps.
 * Near-grey backgrounds (paper, omp) get a mostly neutral room; saturated
 * ones (claude, midnight) keep the full ladder saturation.
 */
function tintOf(bg: Hsl): number {
  return clamp(bg.s / 0.3, 0.35, 1.15);
}

function dimColor(a: Anchors): number {
  if (!a.dim) return hslToRgb(a.bg.h, Math.min(a.bg.s, 0.25), 0.72);
  return hslToRgb(a.dim.h, a.dim.s, clamp(a.dim.l, 0.62, 0.82));
}

/** Build the full override set for one resolved anchor set. */
function buildPalette(a: Anchors): Record<string, number> {
  const out: Record<string, number> = {};
  const tint = tintOf(a.bg);
  for (const key of Object.keys(PALETTE)) {
    const row = PALETTE[key]!;
    const from = row.hue === 'accent' ? a.accent : a.bg;
    const sat = row.sat === 'accent' ? accentSat(a.accent) : row.hue === 'background' ? row.sat * tint : row.sat;
    out[key] = hslToRgb(from.h, sat, row.light[a.mode === 'dark' ? 1 : 0]);
  }
  // The accent trio + dim need token-derived lightness, not a ladder value:
  // the primary token's own lightness, floored so it stays readable on the
  // renderer's near-black tag plate (the BOSS label is drawn in it).
  const accent = hslToRgb(a.accent.h, accentSat(a.accent), clamp(a.accent.l, 0.62, 0.8));
  out['accent'] = accent;
  out['logo'] = accent;
  out['dim'] = dimColor(a);
  return out;
}

/**
 * One theme entry for the renderer registry; `null` when the tokens do not
 * resolve (the caller then simply does not register the theme).
 */
export function officeThemeFromTokens(tokens: OfficeThemeTokens): OfficeThemeEntry | null {
  const anchors = anchorsOf(tokens);
  if (!anchors) return null;
  return { sign: OFFICE_THEME_SIGN, colors: buildPalette(anchors) };
}

/**
 * Theme registry for `setThemes` — every resolvable theme keyed by
 * `officeThemeName(id)`. Unresolvable defs are skipped, never guessed.
 */
export function officeThemeRegistry(list: readonly OfficeThemeTokens[]): Record<string, OfficeThemeEntry> {
  const out: Record<string, OfficeThemeEntry> = {};
  for (const tokens of list) {
    const entry = officeThemeFromTokens(tokens);
    if (entry) out[officeThemeName(tokens.id)] = entry;
  }
  return out;
}

/**
 * Forced renderer theme name for the view mode: `app` forces the app theme's
 * registered palette, `auto` (and an unresolved active id) answers `''` so
 * the renderer keeps its own per-project pick.
 */
export function officeThemeForMode(mode: OfficeThemeMode, activeThemeId: string | null): string {
  if (mode !== 'app') return '';
  if (typeof activeThemeId !== 'string' || activeThemeId.length === 0) return '';
  return officeThemeName(activeThemeId);
}
