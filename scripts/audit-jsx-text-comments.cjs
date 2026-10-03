#!/usr/bin/env node
/**
 * Gate: no `//` comment in JSX CHILDREN position.
 *
 * In JSX children, `//` is NOT a comment — the parser keeps it as TEXT, so
 * the comment's words are rendered into the DOM as a text node. Measured in
 * REQ-194: a three-line comment in the settings modal's children gap became
 * a 193-char / 1249px-wide text node that pushed the Models pane off-screen
 * (middle column 0px) while the unit tests and tsc stayed green.
 *
 * Comments are legal — and NOT flagged — when they sit in JS context: inside
 * `{ ... }` (a statement block or an arrow-function body, including the
 * attribute position of an arrow function), at file top level, or inside an
 * element's attribute list (a comment cannot start inside `<tag ...` until
 * the tag closes, so anything before the closing `>` is attribute position).
 *
 * Detection is EXACT, not heuristic: walk the real AST with the TypeScript
 * compiler and flag every `JsxText` whose trimmed value starts with `//`.
 * (A line-trimming heuristic missed the one real instance and flagged three
 * comments that live inside arrow-function bodies — see the note in
 * scripts/audit-jsx-text-comments.mjs, kept only as history.)
 *
 * Usage:
 *   node scripts/audit-jsx-text-comments.cjs [rootDir]      # human report
 *   node scripts/audit-jsx-text-comments.cjs --json         # machine report
 * Exit 1 when any JsxText looks like a line comment.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const ROOTS = argv.filter((a) => !a.startsWith('--'));
const ROOT = ROOTS[0] || 'packages/lokma-web/web/src';

function walk(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const findings = [];

for (const file of walk(ROOT)) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const raw = node.getFullText(sf);
      const trimmed = raw.trim();
      // A JSX text run that begins with `//` is a line comment rendered as
      // content. (Leading indentation/newlines are stripped by the tokenizer;
      // what survives is the authored comment.)
      if (trimmed.startsWith('//')) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        const { character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        findings.push({
          file,
          line: line + 1,
          column: character + 1,
          text: trimmed.slice(0, 100),
          bytes: trimmed.length,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (AS_JSON) {
  console.log(JSON.stringify({ root: ROOT, findings }, null, 1));
} else if (!findings.length) {
  console.log('OK: no // comment in JSX children position under ' + ROOT + ' (AST-checked ' + 'all .tsx)');
} else {
  console.log('FAIL: ' + findings.length + ' // comment(s) rendered as JSX TEXT under ' + ROOT + ':');
  for (const f of findings) {
    console.log('  ' + f.file + ':' + f.line + ':' + f.column + '  (' + f.bytes + ' chars)  ' + f.text);
  }
}

process.exit(findings.length ? 1 : 0);