/**
 * Server directory-browser probe (REQ-084).
 * Run: `bun src/routes/fs.test.ts` from `packages/lokma-web/server`.
 * No test framework — plain asserts so the package stays dependency-free.
 * `resolveFsPath` is pure; `listFsDirs` hits a temp tree under os.tmpdir().
 */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { FsError, isListableDirName, listFsDirs, resolveFsPath } from './fs';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

function expectFsError(fn: () => unknown, code: string, label: string): void {
  try {
    fn();
  } catch (e) {
    assert(e instanceof FsError && e.code === code, `${label} (got ${(e as Error)?.message})`);
    return;
  }
  throw new Error(`FAIL: ${label} — no error thrown`);
}

// 1. Empty/undefined resolves to the server home.
assert(resolveFsPath(undefined) === homedir(), 'undefined resolves to home');
assert(resolveFsPath('') === homedir(), 'empty string resolves to home');
assert(resolveFsPath('~') === homedir(), '~ expands to home');
assert(resolveFsPath('~/') === homedir() + sep, '~/ expands under home');

// 2. Absolute paths normalize; `..` above root collapses (cannot escape).
assert(resolveFsPath('/a/b/../c') === `${sep}a${sep}c`, '.. segments collapse');
assert(resolveFsPath('/../../etc') === `${sep}etc`, '.. above root stays jailed');

// 3. Relative paths + bad shapes are rejected.
expectFsError(() => resolveFsPath('mnt/x'), 'bad_path', 'relative path rejected');
expectFsError(() => resolveFsPath('   '), 'bad_path', 'blank path rejected');
expectFsError(() => resolveFsPath(42), 'bad_path', 'non-string rejected');
expectFsError(() => resolveFsPath('/a\0b'), 'bad_path', 'null byte rejected');
expectFsError(() => resolveFsPath('/' + 'a'.repeat(600)), 'bad_path', 'over-long path rejected');

// 4. Hidden names are never listable.
assert(isListableDirName('projects') === true, 'plain name listable');
assert(isListableDirName('.lokma') === false, '.lokma hidden');
assert(isListableDirName('.ssh') === false, '.ssh hidden');
assert(isListableDirName('') === false, 'empty name not listable');

// 5. Live listing against a temp tree: dirs only, dot-dirs hidden.
const root = await mkdtemp(join(tmpdir(), 'lokma-fs-'));
await mkdir(join(root, 'alpha'));
await mkdir(join(root, 'beta'));
await mkdir(join(root, '.hidden'));
await writeFile(join(root, 'notes.txt'), 'x');
const listed = await listFsDirs(root);
assert(listed.path === root, 'listing echoes resolved path');
assert(listed.parent === dirname(root), `parent is the containing dir (got ${listed.parent})`);
assert(
  listed.entries.length === 2 && listed.entries[0].name === 'alpha' && listed.entries[1].name === 'beta',
  `only visible dirs listed (got ${listed.entries.map((e) => e.name).join(',')})`,
);
assert(listed.entries[0].path === join(root, 'alpha'), 'entry path is absolute');
assert(listed.truncated === false, 'small listing not truncated');

// 6. Missing / file / unreadable shapes map to typed errors.
try {
  await listFsDirs(join(root, 'nope'));
  throw new Error('FAIL: missing dir — no error thrown');
} catch (e) {
  assert(e instanceof FsError && e.code === 'not_found', 'missing dir is not_found');
}
try {
  await listFsDirs(join(root, 'notes.txt'));
  throw new Error('FAIL: file path — no error thrown');
} catch (e) {
  assert(e instanceof FsError && (e.code === 'not_a_directory' || e.code === 'not_found'), 'file path rejected');
}

// 7. Root has no parent.
const rootListed = await listFsDirs(sep);
assert(rootListed.parent === null, 'filesystem root has null parent');

await rm(root, { recursive: true, force: true });

console.log(`\nOK: ${passed} fs-browser asserts passed`);
