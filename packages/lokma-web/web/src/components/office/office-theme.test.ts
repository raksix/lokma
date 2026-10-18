/**
 * Office theme probe (REQ-204 slice 7) — run with:
 *   `bun src/components/office/office-theme.test.ts` from `packages/lokma-web/web`.
 *
 * Plain asserts, no framework, no DOM (the `office-view.test.ts` shape).
 *
 * Subject: the token -> office-palette mapping. Each rule gets a
 * DISCRIMINATING pair (cases that differ only in the rule under test) so a
 * rule nothing depends on shows up as an unasserted no-op. The four fixtures
 * carry the SAME token values as `themes/*.json` (the fields this mapping
 * reads: background / primary / muted-foreground + the chalk fallbacks); the
 * defs themselves are locked to those files by the core `themes.test.ts`.
 */
import {
  contrastRatio,
  hslToRgb,
  officeThemeForMode,
  officeThemeFromTokens,
  officeThemeName,
  officeThemeRegistry,
  OFFICE_TAG_PLATE,
  OFFICE_THEME_MODES,
  OFFICE_THEME_SIGN,
  parseHexColor,
  parseHslTriple,
  rgbToHsl,
  type OfficeThemeTokens,
} from './office-theme';
import * as office from './vendor/agent-office-core.mjs';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
  passed++;
}

// ── fixtures: the real themes' read fields ─────────────────────────────────

function tokens(id: string, mode: 'light' | 'dark', bg: string, primary: string, muted: string): OfficeThemeTokens {
  return {
    id,
    mode,
    cssVars: { background: bg, primary, 'muted-foreground': muted },
    chalk: {},
  };
}

const CLAUDE = tokens('claude', 'light', '40 33% 98%', '15 55% 52%', '30 6% 45%');
const OMP = tokens('omp', 'dark', '240 10% 4%', '239 84% 67%', '240 5% 64%');
const MIDNIGHT = tokens('midnight', 'dark', '222 47% 11%', '199 89% 48%', '215 20% 65%');
const PAPER = tokens('paper', 'light', '0 0% 100%', '240 6% 10%', '240 4% 46%');
const ALL = [CLAUDE, OMP, MIDNIGHT, PAPER];

const EXPECTED_KEYS = [
  'frame', 'ol', 'wallTop', 'wallTopHi', 'brick', 'brickDark', 'mortar',
  'cream', 'creamStripe', 'sage', 'sageStripe', 'panel', 'panelDark',
  'wainscot', 'wainscotDark', 'checkA', 'checkB', 'woodA', 'woodB', 'woodSeam',
  'carpetA', 'carpetB', 'windowFrame', 'statusBg', 'statusText',
  'rugRed', 'rugRedIn', 'bossChair', 'bossChairHi', 'signGreen', 'signGreenDark', 'logoOn',
  'accent', 'logo', 'dim',
];

// ── A. token parsing: strict, and `null` for anything malformed ────────────

const bg = parseHslTriple('40 33% 98%');
assert(bg !== null && bg.h === 40 && bg.s === 0.33 && bg.l === 0.98, 'an HSL triple parses to hue/sat/lightness fractions');
assert(parseHslTriple('  240   10%  4% ')?.h === 240, 'extra whitespace does not change the parse');
assert(parseHslTriple('0 0% 100%')?.l === 1, 'a percent at 100 parses as 1');
assert(parseHslTriple('') === null, 'an empty string is not a colour');
assert(parseHslTriple('40 33%') === null, 'a two-part value is refused (never half-read)');
assert(parseHslTriple('40 33% 98% 1') === null, 'a four-part value is refused');
assert(parseHslTriple('abc x% y%') === null, 'non-numeric parts are refused');
assert(parseHslTriple(undefined) === null && parseHslTriple(null) === null, 'absent values are refused, not coerced');

assert(parseHexColor('#C96442') === 0xc96442, 'a chalk hex parses to 0xrrggbb');
assert(parseHexColor('c96442') === 0xc96442, 'the hash is optional (the renderer accepts both)');
assert(parseHexColor('#fff') === null, 'a 3-digit shorthand is refused (we never expand silently)');
assert(parseHexColor('red') === null && parseHexColor(0xc96442) === null, 'non-strings are refused');

// ── B. colour math: the renderer's own formula + WCAG contrast ─────────────

assert(hslToRgb(0, 1, 0.5) === 0xff0000, 'hue 0 at full saturation is red');
assert(hslToRgb(120, 1, 0.5) === 0x00ff00, 'hue 120 at full saturation is green');
assert(hslToRgb(240, 1, 0.5) === 0x0000ff, 'hue 240 at full saturation is blue');
assert(hslToRgb(0, 0, 1) === 0xffffff && hslToRgb(0, 0, 0) === 0x000000, 'grey ladder endpoints are exact');
const rt = rgbToHsl(0xc96442);
assert(Math.round(rt.h) === 15 && Math.abs(rt.l - 0.52) < 0.02, 'rgbToHsl round-trips the terracotta token');
assert(contrastRatio(0x000000, 0xffffff) === 21, 'black on white is the 21:1 anchor');
assert(Math.abs(contrastRatio(0x123456, 0x123456) - 1) < 1e-9, 'a colour against itself is 1:1');

// ── C. the mapping: every key present, every colour real ───────────────────

for (const t of ALL) {
  const entry = officeThemeFromTokens(t);
  assert(entry !== null, `${t.id}: the theme resolves`);
  if (!entry) continue;
  assert(entry.sign === OFFICE_THEME_SIGN, `${t.id}: the room carries the Lokma wall sign`);
  const keys = Object.keys(entry.colors);
  assert(
    EXPECTED_KEYS.every((k) => keys.includes(k)),
    `${t.id}: every palette key the renderer dresses is present (no half-classic room)`,
  );
  assert(
    keys.every((k) => Number.isInteger(entry.colors[k]) && entry.colors[k]! >= 0 && entry.colors[k]! <= 0xffffff),
    `${t.id}: every colour is a real 0xrrggbb integer`,
  );
}

// ── D. hue rules: structure follows background, highlights follow primary ──

const claude = officeThemeFromTokens(CLAUDE)!;
const omp = officeThemeFromTokens(OMP)!;
const midnight = officeThemeFromTokens(MIDNIGHT)!;
const paper = officeThemeFromTokens(PAPER)!;

const wallHue = (e: { colors: Record<string, number> }): { h: number; s: number } => {
  const hsl = rgbToHsl(e.colors['wallTop']!);
  return { h: hsl.h, s: hsl.s };
};
assert(Math.abs(wallHue(claude).h - 40) <= 14, 'claude walls carry the background hue (warm room)');
assert(wallHue(claude).s > 0.06, 'claude walls keep the warm cast (a saturated background tints the room)');
assert(wallHue(omp).s < 0.12, 'omp walls go near-neutral (a near-grey background does not invent a tint)');
assert(Math.abs(wallHue(midnight).h - 222) <= 8, 'midnight walls carry the navy hue');
assert(Math.abs(wallHue(paper).h - 0) <= 360 && wallHue(paper).s < 0.12, 'paper walls stay neutral (white background)');

const accentHsl = (e: { colors: Record<string, number> }): { h: number; s: number; l: number } =>
  rgbToHsl(e.colors['accent']!);
assert(Math.abs(accentHsl(claude).h - 15) <= 3, 'claude accent keeps the terracotta hue');
assert(accentHsl(omp).l >= 0.6 && accentHsl(omp).s >= 0.32, 'omp accent is floored for readability, not the raw token');
assert(accentHsl(paper).l >= 0.6, 'paper accent (near-black token) is lifted off the near-black plate');
assert(accentHsl(paper).s <= 0.6, 'a mono theme accent cannot gain saturation beyond the cap');
assert(
  Math.abs(rgbToHsl(claude.colors['rugRed']!).h - 15) <= 3,
  'the rug carries the accent hue (highlights follow primary, not background)',
);

// The two families actually differ: a discriminating pair on the ladder.
assert(
  rgbToHsl(claude.colors['wallTop']!).l - rgbToHsl(omp.colors['wallTop']!).l > 0.3,
  'the light/dark ladders really move the room (light walls vs dark walls)',
);
assert(
  JSON.stringify(claude.colors) !== JSON.stringify(omp.colors) &&
    JSON.stringify(omp.colors) !== JSON.stringify(midnight.colors),
  'each theme gets its own palette',
);
assert(
  JSON.stringify(officeThemeFromTokens(CLAUDE)!.colors) === JSON.stringify(claude.colors),
  'the mapping is deterministic',
);

// ── E. contrast: the pairs the office actually draws on its dark plate ─────

for (const t of ALL) {
  const e = officeThemeFromTokens(t)!;
  const dimOnPlate = contrastRatio(e.colors['dim']!, OFFICE_TAG_PLATE);
  const statusPair = contrastRatio(e.colors['statusText']!, e.colors['statusBg']!);
  assert(dimOnPlate >= 4.5, `${t.id}: the status line stays readable on the tag plate (${dimOnPlate.toFixed(2)}:1)`);
  assert(statusPair >= 4.5, `${t.id}: the status pair keeps >= 4.5:1 (${statusPair.toFixed(2)}:1)`);
}
// Negative control: the RAW muted token (no clamp) fails the bar — so the
// clamp is load-bearing, not decoration.
const rawClaudeMuted = hslToRgb(30, 0.06, 0.45);
assert(
  contrastRatio(rawClaudeMuted, OFFICE_TAG_PLATE) < 4.5,
  'the unclamped muted token would fail 4.5:1 (the clamp is what makes dim readable)',
);
assert(
  OFFICE_THEME_MODES.includes('app') && OFFICE_THEME_MODES.includes('auto'),
  'both theme modes exist (app theme + per-project auto)',
);

// ── F. registry + forced-theme resolution ─────────────────────────────────

const broken: OfficeThemeTokens = { id: 'broken', mode: 'light', cssVars: {}, chalk: {} };
const registry = officeThemeRegistry([...ALL, broken]);
assert(Object.keys(registry).length === 4, 'the registry holds exactly the resolvable themes');
assert(registry[officeThemeName('claude')] !== undefined, 'a theme registers under its prefixed name');
assert(registry['lokma-broken'] === undefined, 'a theme with no resolvable tokens is dropped, never guessed');
assert(Object.keys(officeThemeRegistry([])).length === 0, 'an empty catalog registers nothing');

// Chalk fallback: a def without cssVars still resolves from its hex tokens.
const chalkOnly: OfficeThemeTokens = {
  id: 'chalk',
  mode: 'dark',
  cssVars: {},
  chalk: { background: '#0a0a0f', primary: '#6366f1', muted: '#71717a' },
};
const chalkEntry = officeThemeFromTokens(chalkOnly);
assert(chalkEntry !== null, 'chalk hex tokens are a working fallback when cssVars are absent');
assert(
  chalkEntry !== null && Math.abs(accentHsl(chalkEntry).h - 239) <= 4,
  'the chalk fallback keeps the token hue (indigo)',
);

assert(officeThemeName('claude') === 'lokma-claude', 'the renderer key prefixes the theme id');
assert(officeThemeForMode('app', 'claude') === 'lokma-claude', 'app mode forces the active theme palette');
assert(officeThemeForMode('app', null) === '', 'app mode without an active id forces nothing (renderer decides)');
assert(officeThemeForMode('app', '') === '', 'an empty id is not a theme name');
assert(officeThemeForMode('auto', 'claude') === '', 'auto mode always keeps the per-project theme');
assert(officeThemeForMode('auto', null) === '', 'auto mode without an id is still auto');

// ── G. the palette reaches the renderer (vendor smoke, no DOM) ─────────────
// The tables above are only worth their bytes if the drawn office changes:
// register the themes + force one, then READ THE FRAMEBUFFER.

office.setGeometry(900, 400);
office.resetOffice();
const scene = { workers: [], delivered: 0, isBossBusy: false, project: '' };
const frameOf = (): { fb: Uint32Array; fp: number } => {
  const { fb } = office.render(1000, scene);
  let fp = 0;
  for (let i = 0; i < fb.length; i++) fp = (fp * 33 + fb[i]!) % 0xffffffff;
  return { fb, fp };
};

office.setThemes(officeThemeRegistry(ALL));
office.setTheme(officeThemeForMode('app', 'claude'));
const claudeFrame = frameOf();
office.setTheme(officeThemeForMode('app', 'omp'));
const ompFrame = frameOf();
assert(claudeFrame.fp !== ompFrame.fp, 'the active app theme actually changes the drawn office (framebuffer differs)');
const claudeColors = new Set<number>();
for (let i = 0; i < claudeFrame.fb.length; i++) claudeColors.add(claudeFrame.fb[i]!);
assert(claudeColors.has(claude.colors['wallTop']!), 'the theme wall colour is really on screen (not just in the table)');
assert(claudeColors.size > 30, 'the themed office is still a rich scene (dozens of colours, not a flat fill)');
office.setTheme('');
const autoFrame = frameOf();
assert(autoFrame.fp !== claudeFrame.fp, 'auto mode draws something other than the forced app theme (the toggle switches)');

console.log('---');
console.log(passed + ' assertions passed');
