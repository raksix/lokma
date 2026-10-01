/**
 * REQ-181 wave-2 surface-tool probe — Vault + Memory + Skills tool families
 * against REAL stores. Same isolated-HOME child pattern as
 * surface-tools.test.ts: bun snapshots `os.homedir()` at startup, so the
 * sandbox (vault, memories, skills) needs a child process with HOME moved.
 * Run: `bun src/tools/surface-tools-wave2.test.ts` from `packages/lokma-core`.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { READ_TOOLS, WRITE_TOOLS, decideToolCall } from './gate';
import type { ToolDefinition } from './registry';
import { SKILLS_TOOL_NAMES, buildSkillTools } from './skills-inspect';
import { VAULT_MEMORY_TOOL_NAMES, buildVaultMemoryTools } from './vault-memory';

const CHILD_ENV = 'LOKMA_SURFACE_WAVE2_TEST_CHILD';
if (process.env[CHILD_ENV] !== '1') {
  const tmpHome = mkdtempSync(join(tmpdir(), 'lokma-wave2-home-'));
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

// ── Gate classification: the catalog drives these sets (no second list) ──
const AUTO = { allow: [] as string[], deny: [] as string[], defaultMode: 'auto' as const };
const PLAN = { allow: [] as string[], deny: [] as string[], defaultMode: 'plan' as const };

check(READ_TOOLS.has('vault_search') && !WRITE_TOOLS.has('vault_search'), 'vault_search derives as a read');
check(READ_TOOLS.has('memory_read') && !WRITE_TOOLS.has('memory_read'), 'memory_read derives as a read');
check(WRITE_TOOLS.has('memory_write') && !READ_TOOLS.has('memory_write'), 'memory_write derives as a write');
check(READ_TOOLS.has('skill_view') && !WRITE_TOOLS.has('skill_view'), 'skill_view derives as a read');
check(WRITE_TOOLS.has('skill_patch') && !READ_TOOLS.has('skill_patch'), 'skill_patch derives as a write');

check(decideToolCall(AUTO, 'vault_search') === 'allow', 'auto: vault_search runs');
check(decideToolCall(AUTO, 'memory_read') === 'allow', 'auto: memory_read runs');
check(decideToolCall(AUTO, 'memory_write') === 'ask', 'auto: memory_write asks');
check(decideToolCall(AUTO, 'skill_view') === 'allow', 'auto: skill_view runs');
check(decideToolCall(AUTO, 'skill_patch') === 'ask', 'auto: skill_patch asks');
check(decideToolCall(PLAN, 'memory_write') === 'deny', 'plan: memory_write refused');
check(decideToolCall(PLAN, 'skill_patch') === 'deny', 'plan: skill_patch refused');
check(decideToolCall(PLAN, 'vault_search') === 'allow', 'plan: vault_search allowed');

// ── Builders expose exactly the catalog names, honest readOnly flags ─────
const vmTools = buildVaultMemoryTools();
const skillTools = buildSkillTools();
check(
  vmTools.map((t) => t.name).join(',') === VAULT_MEMORY_TOOL_NAMES.join(','),
  'vault/memory builder exposes the catalog names in order',
);
check(
  skillTools.map((t) => t.name).join(',') === SKILLS_TOOL_NAMES.join(','),
  'skills builder exposes the catalog names in order',
);
const vmByName = new Map(vmTools.map((t) => [t.name, t]));
const skByName = new Map(skillTools.map((t) => [t.name, t]));

// ── Vault: real notes under an isolated ~/.lokma/vault ───────────────────
const home = process.env.HOME as string;
await mkdir(join(home, '.lokma', 'vault', 'notes'), { recursive: true });
await writeFile(
  join(home, '.lokma', 'vault', 'notes', 'probe-note.md'),
  '---\ntitle: Probe Note\ntags: probe, wave2\n---\n# Probe Note\n\nThe zebraunicorn marker lives here.\n',
  'utf-8',
);

const found = await run(vmByName.get('vault_search') as ToolDefinition, { q: 'zebraunicorn' });
check(found.ok === true, 'vault_search answers ok');
check(found.count === 1, 'vault_search finds exactly the probe note');
const hits = found.hits as { path: string; title: string; snippet: string }[];
check(String(hits[0]?.path).endsWith('probe-note.md'), 'vault_search returns the vault-relative path');
check(typeof hits[0]?.snippet === 'string', 'vault_search carries a snippet');
check(typeof found.engine === 'string', 'vault_search reports the engine honestly');

const browse = await run(vmByName.get('vault_search') as ToolDefinition, {});
check(browse.ok === true && (browse.count as number) >= 1, 'vault_search with no query lists notes');

const jailed = await run(vmByName.get('vault_search') as ToolDefinition, { q: 'x', folder: '../etc' });
check(jailed.ok === false && jailed.code === 'bad_folder', 'vault_search refuses a `..` folder');

const noHit = await run(vmByName.get('vault_search') as ToolDefinition, { q: 'nothing-matches-this' });
check(noHit.ok === true && noHit.count === 0, 'vault_search with no match is an honest empty');

// ── Memory: entry add/replace/remove with the live budget line ───────────
const memRead = vmByName.get('memory_read') as ToolDefinition;
const memWrite = vmByName.get('memory_write') as ToolDefinition;

const empty = await run(memRead, { target: 'memory' });
check(empty.ok === true && empty.count === 0 && empty.usage === '0/20000', 'memory_read starts empty at the 20k budget');

const add1 = await run(memWrite, { op: 'add', target: 'memory', content: 'Wave2 entry one' });
check(add1.ok === true && add1.count === 1, 'memory_write add appends one entry');
const addDup = await run(memWrite, { op: 'add', target: 'memory', content: 'Wave2 entry one' });
check(addDup.ok === true && addDup.count === 1, 'duplicate add dedups (count stays 1)');
const add2 = await run(memWrite, { op: 'add', target: 'memory', content: 'Wave2 entry two' });
check(add2.ok === true && add2.count === 2, 'second distinct entry lands');

const missingContent = await run(memWrite, { op: 'add', target: 'memory' });
check(missingContent.ok === false && missingContent.code === 'missing_content', 'add without content is refused honestly');

const replaced = await run(memWrite, {
  op: 'replace',
  target: 'memory',
  old_text: 'entry one',
  new_text: 'Wave2 entry one rewritten',
});
check(replaced.ok === true && replaced.count === 2, 'replace rewrites the matching entry in place');

const noMatch = await run(memWrite, { op: 'replace', target: 'memory', old_text: 'no-such-entry', new_text: 'x' });
check(noMatch.ok === false && noMatch.code === 'no_match', 'replace with a dead anchor answers no_match');

const removed = await run(memWrite, { op: 'remove', target: 'memory', old_text: 'entry two' });
check(removed.ok === true && removed.count === 1, 'remove drops exactly one entry');

const userRead = await run(memRead, { target: 'user' });
check(userRead.ok === true && userRead.usage === '0/5000', 'user target keeps its own 5k budget');

// ── Skills: view + jailed reference + curator patch ──────────────────────
const skillDir = join(home, '.lokma', 'skills', 'wave2-probe-skill');
await mkdir(join(skillDir, 'references'), { recursive: true });
await writeFile(
  join(skillDir, 'SKILL.md'),
  '---\nname: wave2-probe-skill\ndescription: Use when probing the REQ-181 wave-2 skill tools.\n---\n# Wave2 Probe Skill\n\nWAVE2-MARKER line lives here.\n',
  'utf-8',
);
await writeFile(join(skillDir, 'references', 'notes.md'), '# Notes\n\nREFERENCE-MARKER inside.\n', 'utf-8');

const skView = skByName.get('skill_view') as ToolDefinition;
const skPatch = skByName.get('skill_patch') as ToolDefinition;

const view = await run(skView, { id: 'wave2-probe-skill' });
check(view.ok === true, 'skill_view answers ok');
check(String(view.content).includes('WAVE2-MARKER'), 'skill_view carries the SKILL.md body');
check(
  Array.isArray(view.linked_files) && (view.linked_files as string[]).includes('references/notes.md'),
  'skill_view lists the linked references',
);

const ref = await run(skView, { id: 'wave2-probe-skill', file: 'references/notes.md' });
check(ref.ok === true && String(ref.content).includes('REFERENCE-MARKER'), 'skill_view loads a linked reference file');

const refJail = await run(skView, { id: 'wave2-probe-skill', file: '../SKILL.md' });
check(refJail.ok === false && refJail.code === 'outside_root', 'reference read is jailed to the skill directory');

const viewMiss = await run(skView, { id: 'no-such-skill' });
check(viewMiss.ok === false && viewMiss.code === 'skill_not_found', 'skill_view of an unknown id answers skill_not_found');

const patched = await run(skPatch, { id: 'wave2-probe-skill', old_string: 'WAVE2-MARKER', new_string: 'WAVE2-PATCHED' });
check(patched.ok === true && (patched.bytes as number) > 0, 'skill_patch rewrites the marker');

const reView = await run(skView, { id: 'wave2-probe-skill' });
check(reView.ok === true && String(reView.content).includes('WAVE2-PATCHED'), 'patch result reads back through skill_view');

const patchMiss = await run(skPatch, { id: 'wave2-probe-skill', old_string: 'NOT-IN-FILE', new_string: 'x' });
check(patchMiss.ok === false && patchMiss.code === 'no_match', 'patch with a dead anchor answers no_match');

console.log(`\nREQ-181 wave-2 surface tools: ${passed}/${passed} checks passed`);
