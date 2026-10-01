/**
 * Gate probe — REQ-181: the permission sets are catalog-derived.
 * Run: `bun src/tools/gate.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 *
 * The single-source contract: every tool declared in the surface catalog
 * lands in exactly the set its `gate` field names (both directions — a set
 * cannot gain or lose a member without the catalog changing), and
 * `decideToolCall` keeps its shape across `auto` / `plan` / `manual`.
 */
import { strict as assert } from 'node:assert';
import { surfaceToolNamesByGate, type SurfaceToolGate } from '@lokma/shared';
import {
  BROWSER_TOOLS,
  INTERACTIVE_TOOLS,
  READ_TOOLS,
  WRITE_TOOLS,
  decideToolCall,
} from './gate.js';

let checks = 0;
function ok(cond: boolean, label: string): void {
  assert.ok(cond, label);
  checks += 1;
}

// ── Exact derivation: set == catalog gate list, both directions ───────────
const GATE_SETS: readonly (readonly [SurfaceToolGate, ReadonlySet<string>])[] = [
  ['read', READ_TOOLS],
  ['write', WRITE_TOOLS],
  ['browser', BROWSER_TOOLS],
  ['interactive', INTERACTIVE_TOOLS],
];
for (const [gate, set] of GATE_SETS) {
  assert.deepEqual(
    [...set].sort(),
    surfaceToolNamesByGate(gate).sort(),
    `${gate} set is exactly the catalog gate list`,
  );
  checks += 1;
  ok(set.size > 0, `${gate} set is not empty`);
}

// REQ-180: the project tools derive through the catalog — the sets must not
// carry a second copy of these classifications.
ok(READ_TOOLS.has('list_projects'), 'list_projects derives as a read');
ok(WRITE_TOOLS.has('open_project'), 'open_project derives as a write');

// ── Decisions keep their shape for each class ─────────────────────────────
const AUTO = { allow: [] as string[], deny: [] as string[], defaultMode: 'auto' as const };
const PLAN = { allow: [] as string[], deny: [] as string[], defaultMode: 'plan' as const };
const MANUAL = { allow: [] as string[], deny: [] as string[], defaultMode: 'manual' as const };

ok(decideToolCall(AUTO, 'read_file') === 'allow', 'auto: a read runs');
ok(decideToolCall(AUTO, 'design_generate') === 'ask', 'auto: a catalog write asks');
ok(decideToolCall(AUTO, 'browser_click') === 'ask', 'auto: a browser action asks');
ok(decideToolCall(AUTO, 'ask_user') === 'allow', 'auto: interactive never asks');
ok(decideToolCall(PLAN, 'read_file') === 'allow', 'plan: a read is allowed');
ok(decideToolCall(PLAN, 'write_file') === 'deny', 'plan: a write is refused');
ok(decideToolCall(PLAN, 'browser_click') === 'deny', 'plan: a browser action is refused');
ok(decideToolCall(MANUAL, 'read_file') === 'ask', 'manual: even reads ask');
ok(decideToolCall(AUTO, 'list_projects') === 'allow', 'auto: list_projects runs (REQ-180 read)');
ok(decideToolCall(PLAN, 'open_project') === 'deny', 'plan: open_project is refused (REQ-180 write)');

console.log(`REQ-181 gate derivation: ${checks}/${checks} checks passed`);
