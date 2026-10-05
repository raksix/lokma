/**
 * Probe for the REQ-181 surface catalog.
 * Run: `bun src/surfaces.test.ts` from `packages/lokma-shared`.
 * No test framework — plain asserts. Excluded from the package build.
 *
 * Locks the catalog against the live chrome: the rail projection below must
 * equal the web Inspector rail (21 entries, same order), the activity
 * projection must equal the activity bar groups, and every tool named in the
 * REQ scope table must exist with a valid gate.
 */
import { strict as assert } from 'node:assert';
import {
  SURFACES,
  surfaceById,
  surfaceTool,
  surfaceToolLine,
  surfaceToolNames,
  surfaceToolNamesByGate,
  surfaceToolRows,
  surfacesWithHost,
  type SurfaceToolGate,
} from './surfaces.js';

let checks = 0;
function ok(cond: boolean, label: string): void {
  assert.ok(cond, label);
  checks += 1;
}

// ── Table integrity ────────────────────────────────────────────────────────
const ids = SURFACES.map((s) => s.id);
ok(new Set(ids).size === ids.length, 'surface ids are unique');
const toolNames = surfaceToolNames();
ok(new Set(toolNames).size === toolNames.length, 'tool names are unique across surfaces');
const gates: SurfaceToolGate[] = ['read', 'write', 'interactive', 'browser'];
for (const row of surfaceToolRows()) {
  ok(gates.includes(row.gate), `valid gate for ${row.name} (${row.gate})`);
  ok(/^[a-z0-9_]+$/.test(row.name), `tool name shape: ${row.name}`);
  ok(row.summary.trim().length >= 20, `tool summary is a real sentence: ${row.name}`);
}
for (const surface of SURFACES) {
  ok(surface.label.trim().length > 0, `label present: ${surface.id}`);
  ok(surface.hosts.length > 0 || surface.tools.length > 0, `surface has a host or tools: ${surface.id}`);
  // section is present exactly when the surface opens a Settings section.
  ok(
    (surface.opens === 'settings-section') === (surface.section !== undefined),
    `section only on settings-section surfaces: ${surface.id}`,
  );
}

// ── Inspector rail projection (must equal the web rail, same order) ───────
const railIds = surfacesWithHost('inspector').map((s) => s.id);
assert.deepEqual(railIds, [
  'files',
  'providers',
  'models',
  'usage',
  'settings',
  'terminal',
  'git',
  'browser',
  'agents',
  'orchestration',
  'vault',
  'skills',
  'archify',
  'testing',
  'setup',
  'plugins',
  'observability',
  'cron',
  'extras',
  'memory',
  'todos',
]);
checks += 1;

// Rail entries that open the Settings modal (the generic Settings launcher
// pins General; the REQ-163..166 wave pins its own sections).
const railModalIds = surfacesWithHost('inspector')
  .filter((s) => s.opens === 'settings-section')
  .map((s) => s.id);
assert.deepEqual(railModalIds, ['settings', 'agents', 'orchestration', 'vault', 'skills', 'memory']);
checks += 1;

// Entries PINNED to one specific section (the RAIL_MODAL_SECTIONS map).
const railPinnedIds = surfacesWithHost('inspector')
  .filter((s) => s.opens === 'settings-section' && s.section !== 'general')
  .map((s) => s.id);
assert.deepEqual(railPinnedIds, ['agents', 'orchestration', 'vault', 'skills', 'memory']);
checks += 1;

// Rail entries that open their own standalone modal (REQ-167).
const standaloneIds = surfacesWithHost('inspector')
  .filter((s) => s.opens === 'standalone-modal')
  .map((s) => s.id);
assert.deepEqual(standaloneIds, ['archify']);
checks += 1;

// ── Activity bar projection (groups, catalog order within each) ───────────
assert.deepEqual(surfacesWithHost('activity-top').map((s) => s.id), ['sessions', 'git']);
checks += 1;
assert.deepEqual(surfacesWithHost('activity-pane').map((s) => s.id), ['terminal', 'browser', 'vault', 'testing']);
checks += 1;
assert.deepEqual(surfacesWithHost('activity-bottom').map((s) => s.id), ['settings', 'account']);
checks += 1;

// ── Mode switch projection ────────────────────────────────────────────────
assert.deepEqual(surfacesWithHost('mode').map((s) => s.id), ['chat', 'bots', 'design']);
checks += 1;

// ── REQ scope table: every tool family must be declared ──────────────────
for (const name of [
  // Design / Archify / Testing
  'design_generate',
  'design_list',
  'design_critique',
  'archify_render',
  'testing_run',
  // Vault / Memory / Skills
  'vault_search',
  'memory_write',
  'memory_read',
  'skill_view',
  'skill_patch',
  // Observability / Cron / Plugins
  'trace_list',
  'trace_get',
  'cron_list',
  'cron_create',
  // REQ-201 kapsam 4 — the agent side of loop creation
  'loop_list',
  'loop_create',
  'plugin_list',
  'plugin_install',
  // Providers / Models
  'provider_add',
  'model_probe',
  // Git / Usage / Terminal
  'git_status',
  'git_diff',
  'git_commit',
  'usage_report',
  'open_terminal',
  'terminal_write',
  // Files
  'read_file',
  'list_files',
  'glob',
  'grep',
  'search_files',
]) {
  ok(surfaceTool(name) !== undefined, `scope tool declared: ${name}`);
}

// REQ-180 wave: the project tools are declared in this table too — the core
// permission sets read them from here, never from a second list.
ok(surfaceTool('open_project')?.surface === 'sessions', 'open_project belongs to sessions');
ok(surfaceTool('list_projects')?.surface === 'sessions', 'list_projects belongs to sessions');

// ── Ownership + gate derivation ───────────────────────────────────────────
ok(surfaceTool('design_generate')?.surface === 'design', 'design tools belong to the design surface');
ok(surfaceTool('read_file')?.surface === 'files', 'workspace reads belong to files');
ok(surfaceTool('browser_click')?.surface === 'browser', 'browser tools belong to browser');
assert.deepEqual(surfaceToolNamesByGate('interactive'), ['ask_user']);
checks += 1;
ok(surfaceToolNamesByGate('read').includes('read_file'), 'read gate includes read_file');
ok(surfaceToolNamesByGate('write').includes('git_commit'), 'write gate includes git_commit');
ok(surfaceTool('git_status')?.gate === 'read', 'git_status is a read');

// REQ-201 kapsam 4 — the loop tools carry the real gates: listing is a read
// (auto-runs), creating is a write (asks in `auto`, refused in `plan`). This
// is the assertion that stops a background-spending tool from shipping as an
// unlisted tool, because an unlisted name falls into `fallbackFor`'s
// non-read branch by accident rather than by decision.
ok(surfaceTool('loop_list')?.surface === 'loops', 'loop tools belong to the loops surface');
ok(surfaceTool('loop_list')?.gate === 'read', 'loop_list is a read');
ok(surfaceTool('loop_create')?.gate === 'write', 'loop_create is a write');
// The Loops surface has no chrome entry until its console pane ships (REQ-202)
// — asserted here so adding the rail row without the pane is a RED, not a
// silently dead button.
ok(surfacesWithHost('inspector').every((s) => s.id !== 'loops'), 'loops has no rail entry until its pane exists');

// ── Helpers ───────────────────────────────────────────────────────────────
ok(surfaceById('vault')?.label === 'Vault', 'surfaceById resolves a label');
ok(surfaceById('nope' as never) === undefined, 'unknown id resolves to undefined');
const line = surfaceToolLine(surfaceTool('memory_write')!);
ok(line.startsWith('memory_write — '), 'surfaceToolLine formatting');

console.log(`REQ-181 surface catalog: ${checks}/${checks} checks passed`);
