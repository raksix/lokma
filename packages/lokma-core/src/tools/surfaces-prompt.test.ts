/**
 * REQ-181 prompt-block probe — the `<available_surfaces>` block is derived
 * from the SAME catalog as the tools (birebir) and lists only registered
 * tools. Plain asserts (same precedent as surface-tools.test.ts).
 * Run: `bun src/tools/surfaces-prompt.test.ts` from `packages/lokma-core`.
 */
import { strict as assert } from 'node:assert';
import { surfaceToolNames } from '@lokma/shared';
import { buildSurfaceSystemPrompt, surfacePromptNames } from './surfaces-prompt.js';

let passed = 0;
function check(cond: boolean, label: string): void {
  assert.ok(cond, `FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

/** Extract tool names from a built block (`- Label: a, b, c` rows). */
function blockToolNames(block: string): string[] {
  const names: string[] = [];
  for (const line of block.split('\n')) {
    if (!line.startsWith('- ')) continue;
    const idx = line.indexOf(': ');
    if (idx === -1) continue;
    for (const token of line.slice(idx + 2).split(', ')) names.push(token.trim());
  }
  return names;
}

// ── 1. Full catalog registered → the block IS the catalog, birebir ────────
const all = surfaceToolNames();
const full = buildSurfaceSystemPrompt(all);
check(full.startsWith('<available_surfaces>'), 'full: block opens with the tag');
check(full.trimEnd().endsWith('</available_surfaces>'), 'full: block closes with the tag');
check(
  JSON.stringify(blockToolNames(full)) === JSON.stringify(all),
  `full: block tool names == catalog, in catalog order (${all.length} tools)`,
);
check(full.includes('- Design: design_generate, design_list, design_critique'), 'full: design family line present');
check(full.includes('- Archify: archify_render'), 'full: archify line present');
check(surfacePromptNames(all).length === all.length, 'full: name helper matches catalog');

// ── 2. Subset → only registered tools, only non-empty surfaces ────────────
const some = buildSurfaceSystemPrompt(['read_file', 'design_generate']);
check(
  JSON.stringify(blockToolNames(some)) === JSON.stringify(['read_file', 'design_generate']),
  'subset: exactly the registered catalog tools remain',
);
check(some.includes('- Files: read_file'), 'subset: Files line carries read_file');
check(some.includes('- Design: design_generate'), 'subset: Design line carries design_generate');
check(!some.includes('grep'), 'subset: unregistered files tools are not listed');
check(!some.includes('skill_view'), 'subset: unregistered catalog tools are never advertised');

// ── 3. A surface with no registered tool is omitted entirely ──────────────
const one = buildSurfaceSystemPrompt(['read_file']);
check(!one.includes('- Sessions:'), 'omit: a tool-less surface never renders');
check(!one.includes('- Design:'), 'omit: surfaces outside the registry are absent');
check(blockToolNames(one).length === 1, 'omit: exactly one tool row remains');

// ── 4. Nothing registered → no block at all (honest empty) ────────────────
check(buildSurfaceSystemPrompt([]) === '', 'empty: no registry, no block');

console.log(`\nsurfaces-prompt: ${passed} checks passed`);
