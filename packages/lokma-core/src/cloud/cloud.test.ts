/**
 * Live probe for portable cloud transfer (`./transfer` — export/import of
 * the `~/.lokma` home for the move to a cloud box, Phase 3 cloud prep).
 * Run: `HOME=$(mktemp -d) bun src/cloud/cloud.test.ts` from
 * `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Real temp HOME on disk (startup env — bun snapshots HOME at boot, so a
 * runtime override would pollute the real `~/.lokma`; the guard below
 * refuses anything outside `/tmp/`). Real files, real zips, real imports.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts` from
 * `tsc -p` output (same precedent as `tools.test.ts`).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildStoredZip, readStoredZip } from '../utils/zip.js';
import {
  CLOUD_EXPORT_VERSION,
  CLOUD_MANIFEST_NAME,
  CloudError,
  assertImportableName,
  exportState,
  importState,
} from './transfer';

const HOME = process.env.HOME ?? '';
if (!HOME.startsWith('/tmp/')) {
  throw new Error(`REFUSE: HOME=${HOME || '(empty)'} — rerun with HOME=$(mktemp -d) bun ...`);
}

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

async function expectCloudError(fn: () => Promise<unknown>, code: string, label: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    assert(e instanceof CloudError, `${label} throws CloudError`);
    assert((e as CloudError).code === code, `${label} code is ${code}`);
    return;
  }
  throw new Error(`FAIL: ${label} did not throw`);
}

async function seed(rel: string, content: string): Promise<void> {
  const full = join(homedir(), '.lokma', rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content);
}

async function main(): Promise<void> {
  // --- empty home exports an empty honest bundle ---
  const empty = await exportState();
  assert(empty.contentType === 'application/zip', 'export content type is zip');
  assert(empty.filename.startsWith('lokma-state-') && empty.filename.endsWith('.zip'), 'export filename is dated');
  assert(empty.manifest.tool === 'lokma-cloud-transfer', 'manifest tool tag');
  assert(empty.manifest.version === CLOUD_EXPORT_VERSION, 'manifest version is current');
  assert(empty.manifest.entries.length === 0, 'empty home exports zero entries');
  assert(empty.manifest.excluded.includes('credentials.json'), 'manifest lists the credentials exclusion');
  assert(empty.manifest.excluded.includes('auth/'), 'manifest lists the auth exclusion');
  const emptyBack = readStoredZip(empty.body);
  assert(emptyBack.length === 1 && emptyBack[0]?.name === CLOUD_MANIFEST_NAME, 'empty bundle holds only the manifest');

  // --- seed a lived-in home (portable + secrets + derived + binary) ---
  await seed('config.json', '{"theme":"midnight"}');
  await seed('memories/MEMORY.md', 'first §second');
  await seed('agents/demo/SOUL.md', '# soul');
  await seed('vault/note.md', 'hello [[other]]');
  await seed('vault/.fts5/vault.db', 'derived-index-bytes');
  await seed('credentials.json', '{"x":1}');
  await seed('auth/users.json', '{"admin":true}');
  await writeFile(join(homedir(), '.lokma', 'vault/blob.bin'), Buffer.from([0x89, 0x50, 0x00, 0x41]));

  const full = await exportState();
  const names = full.manifest.entries.map((e) => e.path);
  assert(names.includes('config.json'), 'export packs config.json');
  assert(names.includes('memories/MEMORY.md'), 'export packs memory');
  assert(names.includes('agents/demo/SOUL.md'), 'export packs agent docs');
  assert(names.includes('vault/note.md'), 'export packs vault notes');
  assert(!names.some((n) => n.includes('.fts5')), 'export skips derived indexes');
  assert(!names.includes('credentials.json'), 'export never packs credentials');
  assert(!names.some((n) => n.startsWith('auth/')), 'export never packs auth');
  assert(!names.includes('vault/blob.bin'), 'export skips binary files');
  const skipReasons = new Map(full.manifest.skipped.map((s) => [s.path, s.reason]));
  assert(skipReasons.get('vault/blob.bin') === 'binary', 'binary skip is reported');
  assert(full.manifest.entries.every((e) => e.sha256.length === 64), 'every entry carries a sha256');
  const back = readStoredZip(full.body);
  assert(back.length === names.length + 1, 'bundle holds manifest + every entry');

  // --- import restores deleted files byte-identical (same home, wiped first) ---
  const { rm } = await import('node:fs/promises');
  await rm(join(homedir(), '.lokma', 'vault/note.md'));
  await rm(join(homedir(), '.lokma', 'config.json'));
  const restored1 = await importState(full.body);
  assert(restored1.created.includes('config.json'), 'import recreates config.json');
  assert(restored1.created.includes('vault/note.md'), 'import recreates vault notes');
  assert(restored1.skipped.includes('agents/demo/SOUL.md'), 'import skips the surviving agent doc');
  assert((await readFile(join(homedir(), '.lokma', 'vault/note.md'), 'utf-8')) === 'hello [[other]]', 'restored bytes are identical');
  assert((await readFile(join(homedir(), '.lokma', 'config.json'), 'utf-8')) === '{"theme":"midnight"}', 'restored config is identical');

  // --- re-import without overwrite skips; with overwrite replaces ---
  const res3 = await importState(full.body);
  assert(res3.created.length === 0 && res3.skipped.length === full.manifest.entries.length, 'second import skips every existing file');
  const res4 = await importState(full.body, { overwrite: true });
  assert(res4.overwritten.length === full.manifest.entries.length, 'overwrite import replaces every file');

  // --- crafted evil bundles fail closed (rejected, never written) ---
  const evilManifest = JSON.stringify({ tool: 'lokma-cloud-transfer', version: CLOUD_EXPORT_VERSION, entries: [] });
  const evil = buildStoredZip([
    { name: CLOUD_MANIFEST_NAME, content: evilManifest },
    { name: '../evil.txt', content: 'escape' },
    { name: '/abs.txt', content: 'absolute' },
    { name: 'auth/users.json', content: '{}' },
    { name: 'credentials.json', content: '{}' },
    { name: 'vault/.fts5/x.db', content: 'derived' },
  ]);
  const evilRes = await importState(evil);
  assert(evilRes.created.length === 0, 'evil bundle creates nothing');
  assert(evilRes.rejected.length === 5, 'all five evil entries are rejected');
  assert(evilRes.rejected.every((r) => r.reason === 'outside_portable_set'), 'evil rejections carry the reason');

  // --- malformed inputs fail with typed codes, never stacks ---
  await expectCloudError(() => importState(Buffer.from('not a zip at all............')), 'bad_zip', 'garbage rejected');
  await expectCloudError(() => importState(Buffer.alloc(0)), 'bad_zip', 'empty buffer rejected');
  const noManifest = buildStoredZip([{ name: 'vault/a.md', content: 'x' }]);
  await expectCloudError(() => importState(noManifest), 'bad_manifest', 'manifest-less bundle rejected');
  const wrongTool = buildStoredZip([
    { name: CLOUD_MANIFEST_NAME, content: JSON.stringify({ tool: 'other', version: 1, entries: [] }) },
  ]);
  await expectCloudError(() => importState(wrongTool), 'bad_manifest', 'foreign manifest rejected');
  const tamperedManifest = JSON.stringify({
    tool: 'lokma-cloud-transfer',
    version: CLOUD_EXPORT_VERSION,
    entries: [{ path: 'vault/a.md', bytes: 1, sha256: '0'.repeat(64) }],
  });
  const tampered = buildStoredZip([
    { name: CLOUD_MANIFEST_NAME, content: tamperedManifest },
    { name: 'vault/a.md', content: 'DIFFERENT-LONGER-BYTES' },
  ]);
  const tampRes = await importState(tampered);
  assert(tampRes.created.length === 0 && tampRes.rejected[0]?.reason === 'manifest_mismatch', 'tampered entry rejected on hash');

  // --- name allowlist unit checks ---
  await expectCloudError(async () => assertImportableName(''), 'bad_entry', 'empty name rejected');
  await expectCloudError(async () => assertImportableName('a\\b'), 'bad_entry', 'backslash rejected');
  await expectCloudError(async () => assertImportableName('vault/../../x'), 'bad_entry', 'dotdot rejected');
  assert((await (async () => { assertImportableName('vault/a.md'); return true; })()), 'allowlisted name passes');

  console.log(`\ncloud probe: ${passed} passed`);
}

await main();
