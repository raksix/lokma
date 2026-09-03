/**
 * Shell theme helper — single place that owns the `lokma-theme` contract.
 * Light is the default; dark toggles the `dark` class on <html> (same key
 * the concept shell uses, so concept-saved preferences keep working).
 * F5 ported the concept token set 1:1 into `web/src/index.css`, so this
 * file only owns the light/dark switch — the `themes/*.json`
 * (claude/omp/midnight/paper) palettes stay CLI-side until a web theme
 * picker wave wires them to CSS vars.
 */

const THEME_KEY = 'lokma-theme';

export type ShellTheme = 'light' | 'dark';

/** Read the persisted theme without crashing outside the browser. */
export function getTheme(): ShellTheme {
  try {
    if (typeof localStorage === 'undefined') return 'light';
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Apply a theme to the document and persist it. */
export function applyTheme(theme: ShellTheme): void {
  try {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_KEY, theme);
    }
  } catch {
    // Non-browser runtimes (probes, SSR) skip DOM persistence.
  }
}

/** Flip the current theme, apply + persist it, and return the new value. */
export function toggleTheme(): ShellTheme {
  const next: ShellTheme = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
