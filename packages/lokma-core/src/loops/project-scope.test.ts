/**
 * Live probe for the loop project-scope WRITE contract (REQ-203 kapsam 3).
 * Run: `HOME=$(mktemp -d) bun src/loops/project-scope.test.ts` from
 * `packages/lokma-core`. No test framework — plain asserts so the package
 * stays dependency-free (`tsconfig.json` excludes `*.test.ts`).
 *
 * Real temp HOME on disk: bun snapshots HOME at boot, so the guard refuses
 * anything outside `/tmp/` (running with the real HOME would write into the
 * live `~/.lokma/` — both the loop store AND the auth store this probe needs,
 * because the contract resolves projects through `listProjects()`).
 *
 * Two halves, because the contract has two halves:
 *
 *  1. **The pure decision** (`decideLoopScope`) — every refusal reason and
 *     every canonicalisation, provable with plain object fixtures and no disk.
 *     This is where the rules that must never regress live.
 *  2. **The wired store** (`createLoop` / `updateLoop`) — the same rules at the
 *     ONE choke point every writer passes through, plus the disk evidence that a
 *     refusal wrote nothing.
 *
 * The probes this file must not silently break are the point of half 2: half 1
 * alone would pass with the check never called.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createProject, listProjects, registerFirstAdmin } from '../auth/store.js';

import { decideLoopScope, projectsAtCwd } from './project-scope.js';
import type { ScopeProject } from './project-scope.js';
import { createLoop, getLoop, listLoops, LoopError, updateLoop } from './store.js';

const HOME = process.env.HOME ?? '';
if (!HOME.startsWith('/tmp/')) {
  throw new Error(`REFUSE: HOME=${HOME || '(empty)'} — rerun with HOME=$(mktemp -d) bun ...`);
}

let passed = 0;
/**
 * `asserts cond` is load-bearing here, not decoration: the decision type is a
 * discriminated union, so without narrowing a plain `assert(x.ok)` leaves `x`
 * as the union and every `x.cwd` read is a TS2339. It also documents intent —
 * the next case can read the accepted branch after one assertion.
 */
function assert(cond: boolean, label: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}
function section(name: string): void {
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 58 - name.length))}`);
}

/** Assert a plain decision refusal (no store, no async). */
function expectRefusal(
  decision: ReturnType<typeof decideLoopScope>,
  code: string,
  label: string,
): void {
  if (decision.ok) throw new Error(`FAIL: ${label} — allowed instead of ${code}`);
  if (decision.code !== code) {
    throw new Error(`FAIL: ${label} — code ${decision.code}, wanted ${code}`);
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

const P = (id: string, name: string, cwd: string): ScopeProject => ({ id, name, cwd });

// ═══════════════════════════════════════════════════════════════════════════
// Half 1 — the pure decision. No I/O at all.
// ═══════════════════════════════════════════════════════════════════════════
section('pure decision — no project named');

const CATALOG: ScopeProject[] = [
  P('p_alpha', 'Alpha', '/mnt/apopic/alpha'),
  P('p_beta', 'Beta', '/mnt/apopic/beta'),
  P('p_ghost', 'Ghost', ''),
];

const noProject = decideLoopScope({ loopCwd: '/tmp/scratch', projectId: null, projects: CATALOG });
assert(
  noProject.ok && noProject.projectId === null && noProject.cwd === '/tmp/scratch',
  'the no-project bucket keeps the requested cwd verbatim',
);
const trailing = decideLoopScope({ loopCwd: '  /tmp/scratch/  ', projectId: null, projects: CATALOG });
assert(trailing.ok, 'a project-less loop is never refused');
assert(
  trailing.cwd === '/tmp/scratch/',
  `a project-less loop keeps the caller's spelling (whitespace trimmed, slash intact) — the contract canonicalises the cwd only when a project decides it (got "${trailing.cwd}")`,
);

section('pure decision — a named project that agrees');

const agrees = decideLoopScope({
  loopCwd: '/mnt/apopic/alpha',
  projectId: 'p_alpha',
  projects: CATALOG,
});
assert(
  agrees.ok && agrees.projectId === 'p_alpha' && agrees.cwd === '/mnt/apopic/alpha',
  'an agreeing pair stores the project and its cwd',
);
const slashy = decideLoopScope({
  loopCwd: '/mnt/apopic/alpha/',
  projectId: 'p_alpha',
  projects: CATALOG,
});
assert(
  slashy.ok && slashy.cwd === '/mnt/apopic/alpha',
  'a trailing slash is the same cwd and is canonicalised away (REQ-087)',
);

section('pure decision — refusals (never a silent preference)');

expectRefusal(
  decideLoopScope({ loopCwd: '/mnt/apopic/alpha', projectId: 'p_nope', projects: CATALOG }),
  'project_unknown',
  'an unknown projectId is refused instead of stored',
);
expectRefusal(
  decideLoopScope({ loopCwd: '/mnt/apopic/beta', projectId: 'p_alpha', projects: CATALOG }),
  'project_cwd_mismatch',
  'a cwd that is another live project is refused',
);
expectRefusal(
  decideLoopScope({ loopCwd: '/mnt/apopic/nowhere', projectId: 'p_alpha', projects: CATALOG }),
  'project_cwd_mismatch',
  'a cwd that matches no project at all is refused',
);

const mismatched = decideLoopScope({ loopCwd: '/mnt/apopic/beta', projectId: 'p_alpha', projects: CATALOG });
if (mismatched.ok) throw new Error('FAIL: expected a refusal to read the message from');
assert(
  mismatched.message.includes('Beta') && mismatched.message.includes('Alpha'),
  `the mismatch names BOTH projects instead of only the loser ("${mismatched.message}")`,
);
const unknownMsg = decideLoopScope({ loopCwd: '/x', projectId: 'p_nope', projects: CATALOG });
if (unknownMsg.ok) throw new Error('FAIL: expected a refusal to read the message from');
assert(unknownMsg.message.includes('p_nope'), 'the unknown-project refusal names the id it refused');

section('pure decision — the empty-cwd record claims nothing');

const ghost = decideLoopScope({
  loopCwd: '/tmp/scratch',
  projectId: 'p_ghost',
  projects: CATALOG,
});
assert(
  ghost.ok && ghost.cwd === '/tmp/scratch',
  'a project record with no cwd cannot contradict a cwd (sameCwd("","") is true by design)',
);
assert(
  projectsAtCwd('/tmp/scratch', CATALOG).length === 0,
  'an empty-cwd record never matches a cwd',
);
assert(projectsAtCwd('', CATALOG).length === 0, 'an empty cwd matches nothing');

section('pure decision — ambiguity is reportable, not guessed');

// `findOrCreateProject` is idempotent per OWNER, so two users can hold two
// records for one directory. Picking the first row would make the project's name
// in the console depend on store order.
const AMBIGUOUS: ScopeProject[] = [
  P('p_one', 'One', '/mnt/shared'),
  P('p_two', 'Two', '/mnt/shared'),
];
assert(
  projectsAtCwd('/mnt/shared', AMBIGUOUS).length === 2,
  'both records are reported for one directory (the ambiguity is visible)',
);
const ambiguous = decideLoopScope({
  loopCwd: '/mnt/shared',
  projectId: 'p_one',
  projects: AMBIGUOUS,
});
assert(
  ambiguous.ok && ambiguous.cwd === '/mnt/shared',
  'a loop INSIDE an ambiguous directory is still fine when the project matches',
);

// ═══════════════════════════════════════════════════════════════════════════
// Half 2 — the wired store: the same rules, at the choke point.
// ═══════════════════════════════════════════════════════════════════════════
section('wired store — a real project on disk');

const admin = (await registerFirstAdmin({
  email: 'scope-probe@lokma.test',
  password: 'probe-password-1',
  name: 'Scope Probe',
})).user;

const projDir = join(HOME, 'work', 'alpha');
const orphanDir = join(HOME, 'work', 'orphan');
const betaDir = join(HOME, 'work', 'beta');
const ghostDir = join(HOME, 'work', 'ghost-record');
for (const dir of [projDir, orphanDir, betaDir, ghostDir]) await mkdir(dir, { recursive: true });

const alpha = await createProject(admin, { name: 'Alpha', cwd: projDir });
const beta = await createProject(admin, { name: 'Beta', cwd: betaDir });
const ghostProject = await createProject(admin, { name: 'Ghost Record' }); // no cwd
const alphaId = alpha.id;
const betaId = beta.id;
const ghostId = ghostProject.id;

const stored = await listProjects();
assert(stored.length === 3, `three projects on disk (${stored.length})`);
assert(
  alpha.cwd === projDir,
  'createProject resolved the cwd, so the record agrees with the directory',
);

const before = (await listLoops()).length;

const scoped = await createLoop({
  name: 'scoped loop',
  cwd: projDir,
  prompt: 'work in alpha',
  projectId: alphaId,
});
assert(scoped.projectId === alphaId, 'a matching pair stores the project id');
assert(scoped.cwd === projDir, 'and stores the project cwd verbatim');

const orphan = await createLoop({
  name: 'orphan loop',
  cwd: orphanDir,
  prompt: 'work alone',
});
assert(orphan.projectId === null && orphan.cwd === orphanDir, 'the no-project loop keeps its own cwd');

section('wired store — refusals write NOTHING');

const loopsBeforeRefusals = (await listLoops()).length;
await expectCode(
  () => createLoop({ name: 'unknown proj', cwd: projDir, prompt: 'x', projectId: 'p_nope' }),
  'project_unknown',
  'createLoop refuses an unknown projectId',
);
await expectCode(
  () => createLoop({ name: 'cross proj', cwd: betaDir, prompt: 'x', projectId: alphaId }),
  'project_cwd_mismatch',
  'createLoop refuses a cwd belonging to another project',
);
await expectCode(
  () => createLoop({ name: 'off proj', cwd: orphanDir, prompt: 'x', projectId: alphaId }),
  'project_cwd_mismatch',
  'createLoop refuses a cwd outside its project directory',
);
assert(
  (await listLoops()).length === loopsBeforeRefusals,
  'a refused create wrote no loop (the refusal is not a partial write)',
);
assert(before + 2 === loopsBeforeRefusals, 'the two accepted creates are the only new rows');

section('wired store — PATCH re-checks the pair');

await expectCode(
  () => updateLoop(scoped.id, { cwd: betaDir }),
  'project_cwd_mismatch',
  'a PATCH cannot walk a scoped loop into another project directory',
);
await expectCode(
  () => updateLoop(scoped.id, { cwd: orphanDir }),
  'project_cwd_mismatch',
  'a PATCH cannot move a scoped loop out of its project',
);
await expectCode(
  () => updateLoop(orphan.id, { projectId: alphaId }),
  'project_cwd_mismatch',
  'assigning a project to a loop sitting elsewhere is refused',
);
await expectCode(
  () => updateLoop(scoped.id, { projectId: 'p_nope' }),
  'project_unknown',
  'a PATCH cannot attach an unknown projectId',
);

const stillScoped = await getLoop(scoped.id);
assert(
  stillScoped.cwd === projDir && stillScoped.projectId === alphaId,
  'every refused PATCH left the stored record untouched',
);
const stillOrphan = await getLoop(orphan.id);
assert(
  stillOrphan.projectId === null && stillOrphan.cwd === orphanDir,
  'the project-less loop was not rewritten by a refused PATCH',
);

section('wired store — the accepted half of a PATCH still works');

const renamed = await updateLoop(scoped.id, { name: 'scoped loop renamed' });
assert(renamed.name === 'scoped loop renamed' && renamed.cwd === projDir, 'a name-only PATCH passes the contract');
const dropped = await updateLoop(scoped.id, { projectId: null });
assert(
  dropped.projectId === null && dropped.cwd === projDir,
  'detaching a project is allowed (the loop stays in its directory)',
);

section('the empty-cwd record cannot block creation');

const ghostLoop = await createLoop({
  name: 'ghost scoped',
  cwd: ghostDir,
  prompt: 'x',
  projectId: ghostId,
});
assert(ghostLoop.projectId === ghostId, 'a cwd-less project record does not refuse a create');
assert(ghostLoop.cwd === ghostDir, 'and the loop keeps its own directory');

section('canonicalisation is stored on disk');

const trailingStored = await createLoop({
  name: 'trailing slash',
  cwd: `${projDir}/`,
  prompt: 'x',
  projectId: alphaId,
});
assert(
  trailingStored.cwd === projDir,
  `a trailing slash is normalised in the STORED record, not just in memory (got "${trailingStored.cwd}")`,
);
const statePath = join(homedir(), '.lokma', 'loops', trailingStored.id, 'state.json');
const stateRaw = JSON.parse(await readFile(statePath, 'utf-8')) as { cwd: string };
assert(stateRaw.cwd === projDir, 'the canonical cwd is what a restart will read back');

section('cleanup — no leftover loops, no leftover projects');

const created = [scoped, orphan, ghostLoop, trailingStored];
for (const l of created) await rm(join(homedir(), '.lokma', 'loops', l.id), { recursive: true, force: true });
assert(
  created.every((l) => !existsSync(join(homedir(), '.lokma', 'loops', l.id))),
  'every probe-created loop directory is gone',
);

console.log(`\n${passed} passed`);

async function expectCode(
  fn: () => Promise<unknown>,
  code: string,
  label: string,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof LoopError && e.code === code) {
      passed += 1;
      console.log(`PASS: ${label}`);
      return;
    }
    throw new Error(`FAIL: ${label} — wrong error ${(e as Error)?.message}`);
  }
  throw new Error(`FAIL: ${label} — did not throw`);
}
