/**
 * themes.test.ts — probe for the canonical theme registry.
 * Run: `bun src/themes/themes.test.ts` from packages/lokma-core
 * (no server, real embedded defs + real repo-root JSON parity check).
 */
import { readFile } from 'node:fs/promises';
import {
  defaultThemeForMode,
  getThemeDef,
  isThemeId,
  listThemes,
  themePreview,
  toThemeView,
} from './themes';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${name}`);
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/;

// Registry shape: four themes, unique ids, gallery order (default first).
const all = listThemes();
check('four themes', all.length === 4);
check(
  'ids are claude/omp/midnight/paper',
  ['claude', 'omp', 'midnight', 'paper'].every((id) => all.some((t) => t.id === id)),
);
check('ids unique', new Set(all.map((t) => t.id)).size === 4);
check('default (omp) first', all[0]?.id === 'omp');

// Modes: claude/paper light, omp/midnight dark.
check('claude is light', getThemeDef('claude')?.mode === 'light');
check('paper is light', getThemeDef('paper')?.mode === 'light');
check('omp is dark', getThemeDef('omp')?.mode === 'dark');
check('midnight is dark', getThemeDef('midnight')?.mode === 'dark');

// Every def carries real display facts (never empty).
for (const t of all) {
  check(`${t.id} has a name`, t.name.trim().length > 0);
  check(`${t.id} has a label`, t.label.trim().length > 0);
  check(`${t.id} has a description`, t.description.trim().length > 0);
}

// cssVars: same key set on all four (the web writes the full set inline,
// so a missing key on one theme would leak the previous theme's value).
const keySets = all.map((t) => Object.keys(t.cssVars).sort().join(','));
check('cssVars key sets identical across themes', new Set(keySets).size === 1);
for (const k of ['background', 'foreground', 'primary', 'ring', 'border', 'chart-1', 'radius']) {
  check(`cssVars has ${k} on every theme`, all.every((t) => typeof t.cssVars[k] === 'string' && t.cssVars[k]!.length > 0));
}

// Chalk tokens are real hex colors on every theme.
for (const t of all) {
  for (const k of ['primary', 'background', 'foreground', 'muted', 'border']) {
    check(`${t.id}.chalk.${k} is hex`, HEX.test(t.chalk[k] ?? ''));
  }
}

// Previews derive from the def's own chalk (bg + accent differ per theme).
const previews = all.map((t) => themePreview(t));
check('preview bgs differ', new Set(previews.map((p) => p.bg)).size === 4);
check('preview accents differ', new Set(previews.map((p) => p.accent)).size === 4);
check('omp preview is near-black + indigo', previews[0]?.bg === '#0a0a0f' && previews[0]?.accent === '#6366f1');
check(
  'midnight preview is navy + cyan',
  themePreview(getThemeDef('midnight')!).bg === '#0f172a' &&
    themePreview(getThemeDef('midnight')!).accent === '#06b6d4',
);

// Lookup helpers.
check('getThemeDef unknown returns null', getThemeDef('nope') === null);
check('getThemeDef is case-sensitive', getThemeDef('OMP') === null);
check('isThemeId accepts omp', isThemeId('omp') === true);
check('isThemeId rejects junk', isThemeId('../x') === false && isThemeId(42) === false);
check('defaultThemeForMode dark is omp', defaultThemeForMode('dark').id === 'omp');
check('defaultThemeForMode light is claude', defaultThemeForMode('light').id === 'claude');
check('toThemeView carries preview', toThemeView(getThemeDef('paper')!).preview.bg === '#ffffff');

// Parity: embedded defs match the repo-root themes/*.json 1:1
// (name/label/description/cssVars/chalk — mode lives only in code).
const root = new URL('../../../../themes/', import.meta.url);
for (const t of all) {
  const raw = JSON.parse(await readFile(new URL(`${t.id}.json`, root), 'utf8')) as Record<string, unknown>;
  check(
    `${t.id} parity with themes/${t.id}.json`,
    raw['name'] === t.id &&
      raw['label'] === t.label &&
      raw['description'] === t.description &&
      JSON.stringify(raw['cssVars']) === JSON.stringify(t.cssVars) &&
      JSON.stringify(raw['chalk']) === JSON.stringify(t.chalk),
  );
}

console.log(`themes.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
