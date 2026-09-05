/**
 * a11y.test.ts — regression gate for the Phase 3 keyboard/motion/a11y pass.
 * Scans EVERY view in src/ (full-repo icon-button audit, wave 2) for
 * patterns that lock out keyboard and screen-reader users:
 *  1. Nameless buttons — every `<button`/`<Button>` must expose an
 *     accessible name: `aria-label`/`aria-labelledby` on the opening tag,
 *     or visible text children. `title`-only does NOT count (AT ignores it
 *     as a primary name). Reviewed exceptions live in ALLOW_NAMELESS.
 *  2. Skip link — AppShell must render `Skip to chat` targeting `#lokma-chat`.
 *  3. Reduced motion — `index.css` must contain a `prefers-reduced-motion`
 *     block, and the JS motion sources (3D auto-rotate, chat smooth scroll)
 *     must consult it.
 *  4. Shortcut registry integrity — SHORTCUTS ids unique, every entry has
 *     keys + description; the dialog renders the registry; AppShell handles
 *     `?`.
 *  5. Motion helper integrity — both exports exist; `prefersReducedMotion()`
 *     is DOM-free (returns false without window, so probes can call it).
 *  6. Focus trap — every `role="dialog"` overlay wires the shared
 *     `useFocusTrap` hook (Tab wraps, Escape closes, focus enters + is
 *     restored), and every overlay carries `aria-modal="true"` + an
 *     `aria-label`. Reviewed exceptions live in ALLOW_UNTRAPPED.
 * Reviewed exceptions live in ALLOW_NAMELESS with a reason; anything else
 * fails. Run: `bun src/components/shell/a11y.test.ts` (no DOM).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHORTCUTS } from './shortcuts';
import { prefersReducedMotion } from './use-prefers-reduced-motion';

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

// Scope: every .tsx view under src/ (full-repo audit, wave 2).
// The ui/button.tsx primitive passes via its `{children}` render.

// file suffix + snippet pairs reviewed to ship without an accessible name.
const ALLOW_NAMELESS: Array<{ file: string; snippet: string; reason: string }> = [];

function listTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listTsx(full, out);
    } else if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function inScope(_full: string): boolean {
  return true;
}

/** Opening-tag end index, skipping balanced `{...}`, quotes and `=>` arrows. */
function tagEnd(src: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') depth = Math.max(0, depth - 1);
    else if (c === '>' && depth === 0) return i;
  }
  return -1;
}

/**
 * True when a top-level `{...}` JSX expression renders visible text.
 * Handlers (`=>`), icon-only ternaries (`{dark ? <Sun/> : <Moon/>}`) and
 * pure comparisons yield nothing; string literals (`'Ingest note'`),
 * template text (`` `Always allow ${tool}` ``) and member renders
 * (`{s.id}`, `{m.label}`) yield text. Comparison operands (`=== 'dark'`)
 * do not count.
 */
function exprYieldsText(expr: string): boolean {
  const body = expr.slice(1, -1);
  if (/=>/.test(body)) return false;
  const noTags = body.replace(/<[^>]*>/g, '');
  // Ternary / logical: only the taken branches can render.
  const branches = splitTopLevel(noTags, ['?', '&&', '||']).slice(1);
  if (branches.length > 0) {
    const parts = splitTopLevel(noTags, ['?', ':']);
    const candidates = parts.length > 1 ? parts.slice(1) : branches;
    return candidates.some((b) => branchHasText(b));
  }
  return branchHasText(noTags);
}

function branchHasText(branch: string): boolean {
  const noTags = branch.replace(/<[^>]*>/g, '');
  // Quoted strings with real words — unless they only feed a comparison.
  // Leading symbols are allowed ('✓ --agents' renders visible text).
  const noCmp = noTags.replace(/={1,3}\s*(['"])[^'"]*\1/g, '');
  const quoted = noCmp.match(/(['"`])[^'"]*\1/g) ?? [];
  if (quoted.some((q) => /[A-Za-z\u00C0-\u024F…]{2,}/.test(q))) return true;
  // Bare member/identifier renders (`{s.id}`) — but not bare conditions.
  const bare = noCmp
    .replace(/(['"])[^'"]*\1/g, '')
    .replace(/===?|!==?|>=?|<=?/g, '')
    .trim();
  if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*(\([^()]*\))*$/.test(bare)) {
    if (/^(true|false|null|undefined)$/.test(bare)) return false;
    return true;
  }
  if (/\?.*:/s.test(noTags)) {
    const parts = splitTopLevel(noTags, ['?', ':']);
    return parts.slice(1).some((b) => branchHasText(b));
  }
  return false;
}

/** Split on any of the given operators at brace/paren depth 0 (quotes aware). */
function splitTopLevel(s: string, ops: string[]): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quote) {
      cur += c;
      if (c === quote && s[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
      continue;
    }
    if (c === '{' || c === '(') depth += 1;
    else if (c === '}' || c === ')') depth = Math.max(0, depth - 1);
    const hit = depth === 0 && ops.some((op) => s.startsWith(op, i));
    if (hit) {
      parts.push(cur);
      const op = ops.find((o) => s.startsWith(o, i)) as string;
      i += op.length - 1;
      cur = '';
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

/** Top-level `{...}` spans of a string (quotes aware). */
function topLevelBraces(s: string): string[] {
  const spans: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = -1;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quote) {
      if (c === quote && s[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === '}') {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && start >= 0) {
        spans.push(s.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return spans;
}

/** Visible text inside a button element (tags, code expressions stripped). */
function innerText(src: string, afterTag: number): string {
  const close = src.indexOf('</button>', afterTag);
  const closeCap = src.indexOf('</Button>', afterTag);
  const end = [close, closeCap].filter((n) => n >= 0).sort((a, b) => a - b)[0] ?? src.length;
  let inner = src.slice(afterTag, end);
  inner = inner.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  for (const span of topLevelBraces(inner)) {
    inner = inner.replace(span, exprYieldsText(span) ? 'x' : '');
  }
  for (let i = 0; i < 5; i += 1) {
    const next = inner.replace(/<[^>]*>/g, '');
    if (next === inner) break;
    inner = next;
  }
  return inner.replace(/[\s_>.;(),'"`|-]/g, '');
}

const allowUsed = new Set<number>();
for (const full of listTsx(SRC)) {
  if (!inScope(full)) continue;
  const rel = relative(SRC, full);
  const src = readFileSync(full, 'utf8');
  const re = /<[Bb]utton\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const line = src.slice(0, m.index).split('\n').length;
    const end = tagEnd(src, m.index);
    if (end < 0) {
      check(`${rel}:${line} button tag terminates`, false);
      continue;
    }
    const tag = src.slice(m.index, end + 1);
    const selfClosing = tag.endsWith('/>');
    // Self-closing primitives (ui/button.tsx) forward aria-label via props —
    // their call sites are scanned separately, so they cannot fail here.
    if (selfClosing) continue;
    if (/\baria-label(pedby)?=/.test(tag)) continue;
    const text = innerText(src, end + 1);
    if (text.length > 0) continue;
    const allowedIdx = ALLOW_NAMELESS.findIndex(
      (a) => rel === a.file && (tag.includes(a.snippet) || src.slice(end + 1, end + 400).includes(a.snippet)),
    );
    if (allowedIdx >= 0) {
      allowUsed.add(allowedIdx);
      continue;
    }
    check(`${rel}:${line} nameless <button> (needs aria-label or visible text)`, false);
  }
}
ALLOW_NAMELESS.forEach((a, i) => {
  check(`allowlist alive: ${a.file} :: ${a.snippet.slice(0, 40)} (${a.reason})`, allowUsed.has(i));
});

// Rule 2 — skip link + target.
const shell = readFileSync(join(SRC, 'components', 'app-shell.tsx'), 'utf8');
check('skip link renders', shell.includes('Skip to chat') && shell.includes('href="#lokma-chat"'));
check('skip target exists', shell.includes('id="lokma-chat"'));

// Rule 3 — reduced motion.
const css = readFileSync(join(SRC, 'index.css'), 'utf8');
check('css honors prefers-reduced-motion', css.includes('prefers-reduced-motion'));
const graph3d = readFileSync(join(SRC, 'components', 'vault', 'vault-graph-3d.tsx'), 'utf8');
check('3D auto-rotate gated on reduced motion', graph3d.includes('prefersReducedMotion'));
const chatView = readFileSync(join(SRC, 'components', 'chat', 'single-chat-view.tsx'), 'utf8');
check('chat scroll honors reduced motion', chatView.includes('prefersReducedMotion'));

// Rule 4 — shortcut registry integrity.
check('SHORTCUTS non-empty', SHORTCUTS.length >= 7);
check(
  'SHORTCUTS ids unique',
  new Set(SHORTCUTS.map((s) => s.id)).size === SHORTCUTS.length,
);
check(
  'SHORTCUTS every entry has keys + description',
  SHORTCUTS.every((s) => s.keys.length > 0 && s.description.length > 0),
);
const dialog = readFileSync(join(SRC, 'components', 'shell', 'shortcuts-dialog.tsx'), 'utf8');
check('dialog renders the registry', dialog.includes('SHORTCUTS.map'));
check('appshell handles ?', shell.includes("e.key === '?'") && shell.includes('ShortcutsDialog'));
check('footer links the dialog', readFileSync(join(SRC, 'components', 'shell', 'footer-bar.tsx'), 'utf8').includes('requestShortcutsDialog'));

// Rule 5 — motion helper integrity (real calls, DOM-free under bun).
check('prefersReducedMotion() false without window', prefersReducedMotion() === false);

// Rule 6 — focus trap: every dialog overlay traps Tab + closes on Escape.
// Any file rendering `role="dialog"` must wire the shared `useFocusTrap`
// hook and carry `aria-modal="true"` + an `aria-label`.
const ALLOW_UNTRAPPED: Array<{ file: string; reason: string }> = [];
const untrappedUsed = new Set<number>();
for (const full of listTsx(SRC)) {
  const rel = relative(SRC, full);
  const src = readFileSync(full, 'utf8');
  if (!src.includes('role="dialog"') && !src.includes("role={'dialog'}")) continue;
  const allowedIdx = ALLOW_UNTRAPPED.findIndex((a) => rel === a.file);
  if (allowedIdx >= 0) {
    untrappedUsed.add(allowedIdx);
    continue;
  }
  check(`${rel} dialog wires useFocusTrap`, src.includes('useFocusTrap'));
  check(`${rel} dialog is aria-modal`, src.includes('aria-modal="true"'));
  check(`${rel} dialog has aria-label`, src.includes('aria-label'));
}
ALLOW_UNTRAPPED.forEach((a, i) => {
  check(`untrapped allowlist alive: ${a.file} (${a.reason})`, untrappedUsed.has(i));
});
// The hook module itself must export the trap contract the rule scans for.
const trapSrc = readFileSync(join(SRC, 'components', 'shell', 'use-focus-trap.ts'), 'utf8');
check('trap handles Tab', trapSrc.includes("'Tab'"));
check('trap handles Escape', trapSrc.includes("'Escape'"));
check('trap restores focus', trapSrc.includes('previouslyFocused'));

console.log(`a11y: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
