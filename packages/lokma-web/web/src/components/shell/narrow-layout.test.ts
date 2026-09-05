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
 *  3. Clipping toolbar headers — `h-7/h-8/h-9` + `flex` + `shrink-0` with
 *     neither `overflow-x-auto` nor `flex-wrap` is a fixed single-line
 *     header; with 3+ buttons below it (step pills, filter pills) it clips
 *     inside the pane's `overflow-hidden` on phones. Headers must scroll
 *     (`overflow-x-auto` + `shrink-0` cluster, terminal-pane precedent).
 *  4. Crowded button bars — a `flex` + `gap-*` row (no `flex-col` /
 *     `flex-wrap` / scroll) whose first button sits within 12 lines and
 *     totals 4+ buttons in 30 lines crowds on phones (the 23-tab
 *     InspectorPanel row shipped crushed until `flex-wrap`). Bars must wrap,
 *     scroll, or carry a reviewed exception below.
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

// ─── Rule 3: single-line pane headers must scroll, not clip ─────────────
// A `className` with `h-7/h-8/h-9` + `flex` + `shrink-0` and neither
// `overflow-x-auto` nor `flex-wrap` is a fixed single-line header. With 3+
// buttons in the next 40 lines (step pills, filter pills, tab clusters) it
// clips inside the pane's `overflow-hidden` below 768px. Headers must carry
// `overflow-x-auto` (terminal-pane precedent) with a `shrink-0` cluster.
const HEADER_FLEX = /(?<![a-z0-9:-])flex(?![a-z-])/;
const HEADER_SIZE = /\bh-[789]\b/;

let headerCount = 0;
let headerViolations = 0;
for (const file of files) {
  const rel = relative(SRC, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const m = /className="([^"]*)"/.exec(line);
    if (!m) return;
    const cls = m[1];
    if (!HEADER_FLEX.test(cls) || !HEADER_SIZE.test(cls)) return;
    if (!cls.includes('shrink-0')) return;
    headerCount += 1;
    if (cls.includes('overflow-x-auto') || cls.includes('flex-wrap')) return;
    const window = lines.slice(i, i + 40).join('\n');
    const n = window.split('<Button').length - 1 + (window.split('<button').length - 1);
    if (n >= 3) {
      headerViolations += 1;
      console.error(`FIXED-HEADER: ${rel}:${i + 1} [btn=${n}] clips buttons — add overflow-x-auto + shrink-0 cluster`);
    }
  });
}
check('toolbar headers scanned', headerCount >= 10);
check('no clipping single-line headers', headerViolations === 0);

// ─── Rule 4: crowded button bars must wrap, scroll, or be reviewed ──────
// A `flex` + `gap-*` row (no `flex-col`/`flex-wrap`/scroll) whose first
// button sits within 12 lines and totals 4+ buttons in 30 lines crowds on
// phones. Fix with `flex-wrap`, `overflow-x-auto`, or a reviewed entry here.
const ALLOW_TOOLBARS: Array<{ file: string; snippet: string; reason: string }> = [
  {
    file: `browser${sep}browser-pane.tsx`,
    snippet: 'col-span-2 flex gap-2',
    reason: 'Open tab is flex-1 + Cancel squeezes — fits any width',
  },
  {
    file: `chat${sep}single-chat-view.tsx`,
    snippet: 'mt-2 flex justify-end gap-1.5',
    reason: '2-button edit row (Cancel/Save), right-aligned, fits',
  },
  {
    file: `files${sep}file-browser.tsx`,
    snippet: 'mt-1.5 flex gap-1 text-[10px] text-zinc-400',
    reason: 'tiny text links wrap; the fixed context menu below is viewport-clamped',
  },
  {
    file: `git${sep}git-pane.tsx`,
    snippet: 'ml-auto flex shrink-0 items-center gap-1',
    reason: 'refresh + 3 filter pills live inside the scrolling h-7 header',
  },
  {
    file: `observability${sep}observability-pane.tsx`,
    snippet: 'ml-auto flex gap-1',
    reason: '2-button Share cluster; the explainer parent wraps on narrow',
  },
  {
    file: `observability${sep}observability-pane.tsx`,
    snippet: 'flex items-center gap-2 rounded bg-white',
    reason: 'share row: min-w-0 truncate title + shrink-0 cluster, meta hidden on xs',
  },
  {
    file: `observability${sep}observability-pane.tsx`,
    snippet: 'ml-auto flex gap-1 shrink-0',
    reason: 'Open/Copy/Delete h-5 cluster, ~130px, fits 320px panes',
  },
  {
    file: `setup${sep}setup-pane.tsx`,
    snippet: 'ml-auto flex shrink-0 gap-1',
    reason: '4 step pills live inside the scrolling h-7 header',
  },
  {
    file: `terminal${sep}terminal-pane.tsx`,
    snippet: 'ml-auto flex shrink-0 items-center gap-1',
    reason: '3 icon-only buttons inside the scrolling terminal header',
  },
];

const FLEX_ROW = /(?<![a-z0-9:-])flex(?![a-z-])/;
let gapRowCount = 0;
let toolbarViolations = 0;
for (const file of files) {
  const rel = relative(SRC, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const m = /className="([^"]*)"/.exec(line);
    if (!m) return;
    const cls = m[1];
    if (!FLEX_ROW.test(cls)) return;
    if (!cls.includes('gap-')) return;
    if (cls.includes('flex-col') || cls.includes('flex-wrap') || cls.includes('overflow-x-auto') || cls.includes('overflow-auto')) {
      return;
    }
    gapRowCount += 1;
    const head = lines.slice(i, i + 12).join('\n');
    if (!head.includes('<Button') && !head.includes('<button')) return;
    const window = lines.slice(i, i + 30).join('\n');
    const n = window.split('<Button').length - 1 + (window.split('<button').length - 1);
    if (n < 4) return;
    const allowed = ALLOW_TOOLBARS.some((a) => rel.endsWith(a.file) && cls.includes(a.snippet));
    if (!allowed) {
      toolbarViolations += 1;
      console.error(`TOOLBAR: ${rel}:${i + 1} [btn=${n}] "${cls}" — wrap it, scroll it, or allowlist it`);
    }
  });
}
check('toolbar gap rows scanned', gapRowCount >= 200);
check('no unreviewed multi-button toolbars', toolbarViolations === 0);

// The toolbar allowlist itself must stay honest: every entry must still match
// a real class in its file, so deleted exceptions cannot linger silently.
for (const entry of ALLOW_TOOLBARS) {
  const target = files.find((f) => relative(SRC, f).endsWith(entry.file));
  check(`toolbar allowlist file exists: ${entry.file}`, target !== undefined);
  if (target) {
    const text = readFileSync(target, 'utf8');
    check(`toolbar allowlist snippet live: ${entry.file} (${entry.reason})`, text.includes(entry.snippet));
  }
}

console.log(`narrow-layout.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
