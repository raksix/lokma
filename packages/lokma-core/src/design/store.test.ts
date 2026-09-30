/**
 * Unit probe for the REQ-178 design-store project scoping — cwd resolution,
 * the shape jail, per-project listing and root-addressed id operations.
 * Uses a real tmp dir on purpose (resolveDesignCwd stats the directory);
 * never touches ~/.lokma. Run from `packages/lokma-core`:
 *   bun src/design/store.test.ts
 * No test framework — plain asserts so the package stays dependency-free.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { OFFLINE_TEMPLATE_MODEL } from './generate.js';
import {
  DESIGN_CWD_MAX_LEN,
  deleteArtifact,
  designRootOf,
  generateArtifact,
  getArtifact,
  listArtifacts,
  normalizeDesignCwd,
  resolveDesignCwd,
} from './store.js';
import { DesignError } from './types.js';

let passed = 0;
function check(label: string, cond: boolean): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

async function expectsDesign(
  label: string,
  fn: () => Promise<unknown> | unknown,
  code: string,
  status: number,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DesignError && e.code === code && e.status === status) {
      passed += 1;
      console.log('PASS: ' + label);
      return;
    }
    throw new Error('FAIL: ' + label + ' (got ' + (e instanceof Error ? e.name + ':' + e.message : String(e)) + ')');
  }
  throw new Error('FAIL: ' + label + ' (no error thrown)');
}

const home = homedir();

// ── normalizeDesignCwd (pure, no filesystem) ──────────────────────────────
check('unset cwd means global (undefined)', normalizeDesignCwd(undefined) === null);
check('unset cwd means global (empty string)', normalizeDesignCwd('') === null);
check('unset cwd means global (null)', normalizeDesignCwd(null) === null);
check('tilde expands to home', normalizeDesignCwd('~') === home);
check('tilde path expands under home', normalizeDesignCwd('~/work') === join(home, 'work'));
check('absolute path stays itself', normalizeDesignCwd('/tmp/x') === '/tmp/x');
check('segments collapse to a clean absolute path', normalizeDesignCwd('/tmp/../etc/passwd') === '/etc/passwd');
await expectsDesign('relative path is rejected', () => normalizeDesignCwd('relative/path'), 'bad_cwd', 400);
await expectsDesign('whitespace-only is rejected', () => normalizeDesignCwd('   '), 'bad_cwd', 400);
await expectsDesign(
  'null byte is rejected',
  () => normalizeDesignCwd('/tmp/' + String.fromCharCode(0) + 'x'),
  'bad_cwd',
  400,
);
await expectsDesign(
  'over-long path is rejected',
  () => normalizeDesignCwd('/' + 'a'.repeat(DESIGN_CWD_MAX_LEN)),
  'bad_cwd',
  400,
);
await expectsDesign('non-string is rejected', () => normalizeDesignCwd(42), 'bad_cwd', 400);

// ── roots ─────────────────────────────────────────────────────────────────
const base = await mkdtemp(join(tmpdir(), 'lokma-design-store-'));
const projA = join(base, 'proj-a');
const projB = join(base, 'proj-b');
await mkdir(projA, { recursive: true });
await mkdir(projB, { recursive: true });

check('global root is the home design dir', designRootOf(null) === join(home, '.lokma', 'design', 'artifacts'));
check('project root nests under the cwd', designRootOf(projA) === join(projA, '.lokma', 'design', 'artifacts'));

// ── resolveDesignCwd (existence required) ─────────────────────────────────
check('existing dir resolves to itself', (await resolveDesignCwd(projA)) === projA);
check('absent cwd stays global', (await resolveDesignCwd(undefined)) === null);
await expectsDesign('missing dir -> cwd_not_found 404', () => resolveDesignCwd(join(base, 'nope')), 'cwd_not_found', 404);

const notADir = join(base, 'file.txt');
await writeFile(notADir, 'x');
await expectsDesign('file instead of dir -> not_a_directory 400', () => resolveDesignCwd(notADir), 'not_a_directory', 400);

// ── per-project storage + listing ─────────────────────────────────────────
const genA = await generateArtifact('prototype', 'Scoped brief A', 'stripe-linear', OFFLINE_TEMPLATE_MODEL, projA);
check('generate records the project on the manifest', genA.manifest.project === projA);
const stA = await stat(join(projA, '.lokma', 'design', 'artifacts', genA.id, 'artifact.html'));
check('artifact.html lands under the PROJECT root', stA.isFile());

const listA = await listArtifacts(projA);
check('list scoped to project A sees the artifact', listA.count === 1 && listA.items[0]?.id === genA.id);
check('list echoes the resolved project', listA.project === projA);
check('list echoes the resolved root', listA.root === join(projA, '.lokma', 'design', 'artifacts'));

const listB = await listArtifacts(projB);
check('project B list is empty (roots are separate)', listB.count === 0);

const detailA = await getArtifact(genA.id, projA);
check('getArtifact reads from the project root', detailA.html.includes('<html'));
await expectsDesign('same id is absent from the global root', () => getArtifact(genA.id), 'design_not_found', 404);

await deleteArtifact(genA.id, projA);
await expectsDesign(
  'delete removed it from the project (stays gone)',
  () => getArtifact(genA.id, projA),
  'design_not_found',
  404,
);

await rm(base, { recursive: true, force: true });
console.log(passed + ' passed');
