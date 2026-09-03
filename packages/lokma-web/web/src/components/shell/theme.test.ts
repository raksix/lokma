/**
 * theme.test.ts — probe for the `lokma-theme` contract (F5 theme port).
 * Run: `bun src/components/shell/theme.test.ts` (no DOM, no server —
 * localStorage/document are stubbed on globalThis).
 */
import { applyTheme, getTheme, toggleTheme } from './theme';

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

// Minimal browser stubs: a string store + a classList set.
const store = new Map<string, string>();
const classes = new Set<string>();

(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
(globalThis as Record<string, unknown>).document = {
  documentElement: {
    classList: {
      toggle: (cls: string, force?: boolean) => {
        const on = force ?? !classes.has(cls);
        if (on) classes.add(cls);
        else classes.delete(cls);
      },
      contains: (cls: string) => classes.has(cls),
    },
  },
};

function reset(): void {
  store.clear();
  classes.clear();
}

// Default is light with no persisted value.
reset();
check('defaults to light without storage', getTheme() === 'light');

// applyTheme persists and flips the html class.
applyTheme('dark');
check('dark persists lokma-theme', store.get('lokma-theme') === 'dark');
check('dark adds the html class', classes.has('dark'));
check('getTheme reads back dark', getTheme() === 'dark');
applyTheme('light');
check('light removes the html class', !classes.has('dark'));
check('light persists lokma-theme', store.get('lokma-theme') === 'light');

// toggleTheme flips both ways and returns the new value.
reset();
check('toggle light->dark returns dark', toggleTheme() === 'dark');
check('toggle persists + classes dark', store.get('lokma-theme') === 'dark' && classes.has('dark'));
check('toggle dark->light returns light', toggleTheme() === 'light');
check('toggle back clears the class', !classes.has('dark'));

// Unknown stored values fall back to light (never a broken theme).
store.set('lokma-theme', 'midnight');
check('unknown value falls back to light', getTheme() === 'light');

console.log(`theme.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
