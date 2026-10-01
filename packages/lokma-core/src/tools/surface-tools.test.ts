/**
 * REQ-181 wave-1 surface-tool probe — Design Studio + Archify + Testing Lab
 * tool families against REAL stores. Plain asserts (same precedent as
 * tools.test.ts). Run: `bun src/tools/surface-tools.test.ts` from
 * `packages/lokma-core`.
 *
 * The file re-execs itself once in a child process with an isolated HOME:
 * bun snapshots `os.homedir()` at startup, so mutating `process.env.HOME`
 * in-process cannot move the global stores (verified) — with the child, the
 * global `~/.lokma/archify` + `~/.lokma/test-runs` stores land in a sandbox
 * and the real home is never touched. Design tools are project-scoped via a
 * temp cwd and need no HOME games.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFLINE_TEMPLATE_MODEL } from '../design/index';
import { ARCHIFY_TOOL_NAMES, buildArchifyTools } from './archify';
import { DESIGN_TOOL_NAMES, buildDesignTools } from './design';
import { READ_TOOLS, WRITE_TOOLS, decideToolCall } from './gate';
import type { ToolDefinition } from './registry';
import { TESTING_TOOL_NAMES, buildTestingTools } from './testing';

const CHILD_ENV = 'LOKMA_SURFACE_TEST_CHILD';
if (process.env[CHILD_ENV] !== '1') {
  const tmpHome = mkdtempSync(join(tmpdir(), 'lokma-surface-home-'));
  const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, HOME: tmpHome, [CHILD_ENV]: '1' },
    stdio: 'inherit',
  });
  rmSync(tmpHome, { recursive: true, force: true });
  // NOTE: this Bun fills `res.error` even when the child merely exits
  // non-zero — never throw it; the child's status is the verdict.
  process.exit(res.status ?? 1);
}

let passed = 0;
function check(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

type ToolResult = Record<string, unknown> & { ok: boolean; code?: string };

async function run(tool: ToolDefinition, input: unknown): Promise<ToolResult> {
  return (await tool.handler(input, undefined)) as ToolResult;
}

// ── Gate classification: the catalog drives these sets (no second list) ───
const AUTO = { allow: [] as string[], deny: [] as string[], defaultMode: 'auto' as const };
const PLAN = { allow: [] as string[], deny: [] as string[], defaultMode: 'plan' as const };

check(READ_TOOLS.has('design_list'), 'design_list derives as a read');
check(!READ_TOOLS.has('design_generate'), 'design_generate is NOT a read');
check(WRITE_TOOLS.has('design_generate') && WRITE_TOOLS.has('design_critique'), 'design generate/critique derive as writes');
check(WRITE_TOOLS.has('archify_render'), 'archify_render derives as a write');
check(WRITE_TOOLS.has('testing_run'), 'testing_run derives as a write');

check(decideToolCall(AUTO, 'design_list') === 'allow', 'auto: design_list runs');
check(decideToolCall(AUTO, 'design_generate') === 'ask', 'auto: design_generate asks');
check(decideToolCall(AUTO, 'archify_render') === 'ask', 'auto: archify_render asks');
check(decideToolCall(AUTO, 'testing_run') === 'ask', 'auto: testing_run asks');
check(decideToolCall(PLAN, 'design_generate') === 'deny', 'plan: design_generate refused');
check(decideToolCall(PLAN, 'archify_render') === 'deny', 'plan: archify_render refused');
check(decideToolCall(PLAN, 'testing_run') === 'deny', 'plan: testing_run refused');
check(decideToolCall(PLAN, 'design_list') === 'allow', 'plan: design_list allowed');

// ── Builders expose exactly the catalog names, with honest readOnly flags ─
const base = await mkdtemp(join(tmpdir(), 'lokma-surface-tools-'));
const proj = join(base, 'proj');
await mkdir(proj, { recursive: true });

const designTools = buildDesignTools(proj);
check(
  designTools.map((t) => t.name).join(',') === DESIGN_TOOL_NAMES.join(','),
  'design builder exposes the three catalog names',
);
const byName = new Map(designTools.map((t) => [t.name, t]));
check(byName.get('design_list')?.readOnly === true, 'design_list is readOnly');
check(byName.get('design_generate')?.readOnly === false, 'design_generate is not readOnly');
check(buildArchifyTools().map((t) => t.name).join(',') === ARCHIFY_TOOL_NAMES.join(','), 'archify builder exposes archify_render');
check(buildTestingTools({}).map((t) => t.name).join(',') === TESTING_TOOL_NAMES.join(','), 'testing builder exposes testing_run');

// Schema-level enum guards (production parses BEFORE the handler runs).
const genTool = byName.get('design_generate');
const archTool = buildArchifyTools()[0];
const testTool = buildTestingTools({})[0];
assert.ok(genTool && archTool && testTool, 'all three families present');
check(genTool.inputSchema.safeParse({ type: 'nope', brief: 'x' }).success === false, 'schema rejects an unknown design type');
check(archTool.inputSchema.safeParse({ type: 'nope', prompt: 'x' }).success === false, 'schema rejects an unknown diagram type');
check(testTool.inputSchema.safeParse({ plan: '' }).success === false, 'schema rejects an empty plan');

// ── Design: real generate (offline template — no model call) + list + critique
const genRes = await run(genTool, {
  type: 'prototype',
  brief: 'Surface tool probe page',
  system: 'stripe-linear',
  model: OFFLINE_TEMPLATE_MODEL,
});
check(genRes.ok === true, 'design_generate stores an artifact (offline template path)');
check(typeof genRes.id === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(String(genRes.id)), 'generate returns a valid id');
const critique = genRes.critique as { overall?: number; scores?: unknown[] } | undefined;
check(typeof critique?.overall === 'number', 'generate returns a critique score');

const listRes = await run(byName.get('design_list') as ToolDefinition, {});
check(listRes.ok === true && listRes.count === 1, 'design_list sees exactly the generated artifact');
const items = listRes.items as { id: string }[];
check(items[0]?.id === genRes.id, 'design_list echoes the generated id');

const critRes = await run(byName.get('design_critique') as ToolDefinition, { id: genRes.id });
check(critRes.ok === true, 'design_critique re-runs over the stored artifact');
check(typeof (critRes.critique as { overall?: number })?.overall === 'number', 'critique result carries an overall score');

const badBrief = await run(genTool, { type: 'prototype', brief: '   ', system: 'stripe-linear' });
check(badBrief.ok === false && badBrief.code === 'bad_brief', 'whitespace brief refused honestly');
const missing = await run(byName.get('design_critique') as ToolDefinition, { id: 'no-such-artifact' });
check(missing.ok === false && missing.code === 'design_not_found', 'critique of an unknown id answers design_not_found');

// ── Archify: real render into the sandboxed global store ─────────────────
const archRes = await run(archTool, { type: 'architecture', prompt: 'web -> api -> db', format: 'svg' });
check(archRes.ok === true, 'archify_render stores + renders a diagram');
check(typeof archRes.id === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(String(archRes.id)), 'render returns a valid diagram id');
check(String(archRes.body).includes('<svg'), 'svg body returned');
const badPrompt = await run(archTool, { type: 'architecture', prompt: '   ' });
check(badPrompt.ok === false && badPrompt.code === 'bad_prompt', 'whitespace prompt refused honestly');

// ── Testing: honest refusal without a runner, real run with a stub runner ─
const noRunner = await run(testTool, { plan: 'smoke' });
check(noRunner.ok === false && noRunner.code === 'runner_unavailable', 'without a runner testing_run answers honestly');

const withRunner = buildTestingTools({
  executeCheck: async (target: string) => ({ status: target === '/missing' ? 404 : 200, body: 'ok' }),
})[0] as ToolDefinition;
const runRes = await run(withRunner, { plan: 'smoke', targets: ['/health', '/missing'] });
check(runRes.ok === true, 'testing_run completes with a bound runner');
check(runRes.fail === 1, 'exactly one failing check');
const tests = runRes.tests as { name: string; status: string; classification: string | null }[];
const httpRows = tests.filter((t) => t.name.startsWith('GET '));
check(
  httpRows.length === 2 && httpRows.filter((t) => t.status === 'pass').length === 1,
  'one http pass and one http fail (the shannon row excluded)',
);
check(tests.find((t) => t.name === 'GET /missing')?.classification === 'contract', 'non-2xx classified as contract');
check(runRes.shannon === 'clean', 'shannon scan reports clean for clean bodies');

await rm(base, { recursive: true, force: true });
console.log(`REQ-181 surface tools: ${passed}/${passed} checks passed`);
