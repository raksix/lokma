/**
 * Theme loader — single token source for CLI (Chalk) + Web (CSS vars).
 * See Docs/11-ARASTIRMA-omp-temalar-ve-tasarim.md and Docs/02 themes row.
 */

export type ThemeName = 'claude' | 'omp' | 'midnight' | 'paper';

export type ThemeTokens = {
  name: ThemeName;
  label: string;
  description: string;
  cssVars: Record<string, string>;
  chalk: Record<string, string>;
};

// Static imports for bundling — Next.js can tree-shake
import claude from './claude.json' with { type: 'json' };
import omp from './omp.json' with { type: 'json' };
import midnight from './midnight.json' with { type: 'json' };
import paper from './paper.json' with { type: 'json' };

const THEMES: Record<ThemeName, ThemeTokens> = {
  claude: claude as ThemeTokens,
  omp: omp as ThemeTokens,
  midnight: midnight as ThemeTokens,
  paper: paper as ThemeTokens,
};

export function getTheme(name: ThemeName): ThemeTokens {
  return THEMES[name] ?? THEMES.omp;
}

export function listThemes(): ThemeTokens[] {
  return Object.values(THEMES);
}

/** Generate CSS :root block from tokens — used in globals.css build step. */
export function themeToCssVars(theme: ThemeTokens): string {
  const lines = Object.entries(theme.cssVars).map(([k, v]) => `  --${k}: ${v};`);
  return `:root {\n${lines.join('\n')}\n}`;
}
