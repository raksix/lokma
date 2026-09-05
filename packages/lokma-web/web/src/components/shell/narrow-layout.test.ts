/**
 * narrow-layout.test.ts — regression gate for the mobile pane-level pass.
 * Scans every `src/**.tsx` view (excluding probes) for layout patterns that
 * break below the 768px breakpoint:
 *  1. Fixed multi-column grids — a `className` with an unprefixed
 *     `grid-cols-N` (N >= 2, including `grid-cols-[...]`) and no responsive
 *     grid override (`sm:|md:|lg:|xl:|2xl:grid-cols-`) squeezes columns on
 *     phones. Panes must stack (`grid-cols-1 … sm:grid-cols-N`).
 *  2. Bare tables — every `<table` must sit inside an `overflow-x-auto`
 *     scroller so wide content scrolls instead of clipping the pane.
 * Reviewed exceptions live in ALLOW_FIXED_GRIDS with a reason; anything else
 * fails. Run: `bun src/components/shell/narrow-layout.test.ts` (no DOM).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..');

// file suffix + class-snippet pairs reviewed to fit narrow viewports.
const ALLOW_FIXED_GRIDS: Array<{ file: string; snippet: string; reason: string }> = [
  {
    file: `auth${sep}auth-pane.tsx`,
    snippet: 'grid grid-cols-2 gap-1 rounded-md bg-muted/40',
    reason: 'login/invite toggle: two tiny buttons inside a max-w-[360px] card',
  },
  {
    file: `panes${sep}pane.tsx`,
    snippet: 'grid grid-cols-2 gap-1',
    reason: 'SessionDropChooser: four short-label buttons inside a max-w-xs modal',
  },
  {
    file: `providers${sep}models-pane.tsx`,
    snippet: 'grid-cols-[28px_1fr_90px_60px]',
    reason: 'model rows: flexible 1fr column with truncate + title tooltip',
  },
];

function collectTsx(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsx(full, out);
    } else if (full.endsWith('.tsx') && !full.endsWith('.test.tsx')) {
      out.push(full);
    }
  }
}

// Unprefixed grid-cols-2..9 or grid-cols-[...]; responsive variants carry a
// breakpoint prefix (sm:|md:|lg:|xl:|2xl:) which the negative lookbehind skips.
const FIXED_GRID = /(?<![a-z0-9:-])grid-cols-(?:[2-9]|\[)/;
const RESPONSIVE_GRID = /(?:sm|md|lg|xl|2xl):grid-cols-/;
const CLASS_ATTR = /className="([^"]*)"/g;

const files: string[] = [];
collectTsx(SRC, files);
check('pane sources found', files.length > 50);

let fixedGridViolations = 0;
for (const file of files) {
  const rel = relative(SRC, file);
  const text = readFileSync(file, 'utf8');
  let m: RegExpExecArray | null;
  CLASS_ATTR.lastIndex = 0;
  while ((m = CLASS_ATTR.exec(text)) !== null) {
    const cls = m[1];
    if (!FIXED_GRID.test(cls) || RESPONSIVE_GRID.test(cls)) continue;
    const allowed = ALLOW_FIXED_GRIDS.some((a) => rel.endsWith(a.file) && cls.includes(a.snippet));
    if (!allowed) {
      fixedGridViolations += 1;
      console.error(`FIXED-GRID: ${rel}: "${cls}"`);
    }
  }
}
check('no unreviewed fixed multi-column grids', fixedGridViolations === 0);

// Every <table must have an overflow-x-auto scroller within the 12 lines above
// it (the wrapper div that lets wide content scroll on narrow panes).
let tableViolations = 0;
let tableCount = 0;
for (const file of files) {
  const rel = relative(SRC, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!line.includes('<table')) return;
    tableCount += 1;
    const window = lines.slice(Math.max(0, i - 12), i).join('\n');
    if (!window.includes('overflow-x-auto')) {
      tableViolations += 1;
      console.error(`BARE-TABLE: ${rel}:${i + 1} has no overflow-x-auto wrapper above it`);
    }
  });
}
check('at least one table scanned', tableCount >= 1);
check('every table scrolls horizontally', tableViolations === 0);

// The allowlist itself must stay honest: every entry must still match a real
// class in its file, so deleted exceptions cannot linger silently.
for (const entry of ALLOW_FIXED_GRIDS) {
  const target = files.find((f) => relative(SRC, f).endsWith(entry.file));
  check(`allowlist file exists: ${entry.file}`, target !== undefined);
  if (target) {
    const text = readFileSync(target, 'utf8');
    check(`allowlist snippet live: ${entry.file} (${entry.reason})`, text.includes(entry.snippet));
  }
}

console.log(`narrow-layout.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
