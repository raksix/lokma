/**
 * Unit probe for the REQ-190 design version ledger — append without a new id,
 * archive-before-write, the optimistic lock, revert, pruning, and honest
 * degradation on a pre-REQ-190 artifact.
 * Uses a real tmp dir on purpose (the store stats directories); never touches
 * ~/.lokma. Run from `packages/lokma-core`:
 *   bun src/design/versions.test.ts
 * No test framework — plain asserts so the package stays dependency-free.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Hex } from '../files/files.js';
import { OFFLINE_TEMPLATE_MODEL } from './generate.js';
import {
  appendArtifactVersion,
  designRootOf,
  generateArtifact,
  getArtifact,
  listArtifactVersions,
  listArtifacts,
  normalizeVersions,
  readVersionHtml,
  revertArtifact,
  updateArtifactHtml,
  versionFileOf,
} from './store.js';
import { DESIGN_VERSION_CAP, DesignError } from './types.js';

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
    throw new Error(
      'FAIL: ' + label + ' (got ' + (e instanceof Error ? e.name + ':' + e.message : String(e)) + ')',
    );
  }
  throw new Error('FAIL: ' + label + ' (no error thrown)');
}

// ── normalizeVersions (pure, no filesystem) ───────────────────────────────
check('non-array history is empty (pre-REQ-190 artifact)', normalizeVersions(undefined).length === 0);
check('a string is not a history', normalizeVersions('nope').length === 0);
check('entries without a full sha256 hex are dropped', normalizeVersions([{ n: 1, sha: 'abc' }]).length === 0);
check('a null entry is skipped', normalizeVersions([null, { sha: 'a'.repeat(64) }]).length === 1);
check(
  'an unknown origin falls back to edit instead of failing the read',
  normalizeVersions([{ sha: 'b'.repeat(64), origin: 'wat' }])[0]?.origin === 'edit',
);
check(
  'a missing index is backfilled from position',
  normalizeVersions([{ sha: 'c'.repeat(64) }])[0]?.n === 1,
);
check(
  'a missing score becomes null (never undefined in the UI)',
  normalizeVersions([{ sha: 'd'.repeat(64) }])[0]?.overall === null,
);
check('a non-array is not coerced', normalizeVersions(42).length === 0);

// ── the ledger over a real artifact ───────────────────────────────────────
const base = await mkdtemp(join(tmpdir(), 'lokma-design-versions-'));
const proj = join(base, 'proj');
await mkdir(proj, { recursive: true }); // resolveDesignCwd stats the dir.
const root = designRootOf(proj);

const gen = await generateArtifact('prototype', 'Version ledger brief', 'stripe-linear', OFFLINE_TEMPLATE_MODEL, proj);
const first = await getArtifact(gen.id, proj);
check('generation seeds the ledger with v1', first.currentVersion === 1);
check('detail carries the current sha (the lock token)', first.sha === sha256Hex(first.html));
check('v1 is recorded as a generate-origin entry', first.manifest.versions?.[0]?.origin === 'generate');
check('v1 records the model', first.manifest.versions?.[0]?.model === OFFLINE_TEMPLATE_MODEL);
check('v1 records a 5D score', typeof first.manifest.versions?.[0]?.overall === 'number');
check('the list stays lean (no ledger array on the row)', (await listArtifacts(proj)).items[0]?.versionCount === 1);

// A tweak appends to the SAME id — the artifact list must not grow.
const tweakedHtml = first.html.replace('</body>', '<p>TERRACOTTA-PATCH</p></body>');
const appended = await appendArtifactVersion(
  gen.id,
  tweakedHtml,
  { origin: 'tweak', note: 'make the button terracotta', model: 'x/y' },
  proj,
  first.sha,
);
check('a tweak keeps the artifact id (no new row)', appended.id === gen.id);
check('a tweak advances to v2', appended.currentVersion === 2);
check('a tweak reports the new sha', appended.sha === sha256Hex(tweakedHtml));
check('a tweak carries its sentence', appended.manifest.versions?.[1]?.note === 'make the button terracotta');
check('a tweak is recorded as tweak-origin', appended.manifest.versions?.[1]?.origin === 'tweak');
check('the patched body is the current html', (await getArtifact(gen.id, proj)).html.includes('TERRACOTTA-PATCH'));
check('v1 body was archived BEFORE the new write', (await readVersionHtml(root, gen.id, first.sha)) === first.html);
check(
  'the archived file sits at versions/<sha8>.html',
  await readFile(versionFileOf(root, gen.id, first.sha), 'utf-8') === first.html,
);

const listAfterTweak = await listArtifacts(proj);
check('the artifact list count does NOT change after a tweak', listAfterTweak.count === 1);
check('the row reports v2 as current', listAfterTweak.items[0]?.currentVersion === 2);

// ── the optimistic lock ───────────────────────────────────────────────────
await expectsDesign(
  'a stale expectedSha is refused with 409',
  () => updateArtifactHtml(gen.id, '<html>v3</html>', proj, 'f'.repeat(64)),
  'stale_version',
  409,
);
check('the refused write left the body untouched', (await getArtifact(gen.id, proj)).html === tweakedHtml);
check('the refused write appended no version', (await listArtifactVersions(gen.id, proj)).versions.length === 2);
check('an omitted expectedSha still writes (back-compat)', (await updateArtifactHtml(gen.id, '<html>v3</html>', proj)).currentVersion === 3);
check('a manual edit is recorded as edit-origin', (await getArtifact(gen.id, proj)).manifest.versions?.[2]?.origin === 'edit');

// ── revert ─────────────────────────────────────────────────────────────────
const history = await listArtifactVersions(gen.id, proj);
check('history is oldest-first with a monotonic index', history.versions.map((v) => v.n).join(',') === '1,2,3');
check('history reports the current version', history.currentVersion === 3);
check('history exposes the lock sha', history.sha === sha256Hex((await getArtifact(gen.id, proj)).html));

const reverted = await revertArtifact(gen.id, 1, proj);
check('revert restores v1 html', (await getArtifact(gen.id, proj)).html === first.html);
check('revert reports the source version', reverted.restoredFrom === 1);
check('revert APPENDS rather than truncating (redo possible)', reverted.currentVersion === 4);
check('revert is recorded as revert-origin', reverted.manifest.versions?.[3]?.origin === 'revert');
check('revert keeps the intermediate v2 reachable', (await listArtifactVersions(gen.id, proj)).versions.length === 4);
check('v3 body stayed archived through the revert', (await readVersionHtml(root, gen.id, history.versions[2].sha)) !== null);

await expectsDesign('revert to an unknown version is 404', () => revertArtifact(gen.id, 99, proj), 'version_not_found', 404);
await expectsDesign('a non-integer version is 400', () => revertArtifact(gen.id, 'one', proj), 'bad_version', 400);
check('the failed reverts left the body intact', (await getArtifact(gen.id, proj)).html === first.html);

// A ledger entry whose body was deleted must fail honestly, not blank the artifact.
await rm(versionFileOf(root, gen.id, history.versions[1].sha), { force: true });
await expectsDesign(
  'a version with no stored body is 409 (artifact untouched)',
  () => revertArtifact(gen.id, 2, proj),
  'version_body_missing',
  409,
);
check('the body survives the failed revert', (await getArtifact(gen.id, proj)).html === first.html);

// ── pruning at the cap ────────────────────────────────────────────────────
const many = await generateArtifact('document', 'Prune brief', 'paper-ink', OFFLINE_TEMPLATE_MODEL, proj);
let lastSha = (await getArtifact(many.id, proj)).sha;
for (let i = 0; i < DESIGN_VERSION_CAP + 3; i += 1) {
  lastSha = (
    await appendArtifactVersion(many.id, `<html><body>rev ${i}</body></html>`, { origin: 'tweak', note: `rev ${i}` }, proj, lastSha)
  ).sha;
}
const pruned = await listArtifactVersions(many.id, proj);
check(`history is capped at ${DESIGN_VERSION_CAP}`, pruned.versions.length === DESIGN_VERSION_CAP);
check('pruning keeps the NEWEST entries', pruned.versions[pruned.versions.length - 1]?.note === `rev ${DESIGN_VERSION_CAP + 2}`);
check('the current version is still reachable', pruned.currentVersion === DESIGN_VERSION_CAP + 4);
check('the latest body is on disk', (await getArtifact(many.id, proj)).html.includes(`rev ${DESIGN_VERSION_CAP + 2}`));

// ── a pre-REQ-190 artifact (manifest with no ledger) ───────────────────────
const legacyDir = join(root, 'legacy-artifact');
await mkdir(legacyDir, { recursive: true });
await writeFile(
  join(legacyDir, 'artifact.json'),
  JSON.stringify({ id: 'legacy-artifact', type: 'prototype', brief: 'old', system: 'omp-dark', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' }),
);
await writeFile(join(legacyDir, 'artifact.html'), '<html><body>legacy</body></html>');
const legacy = await getArtifact('legacy-artifact', proj);
check('a legacy artifact still reads (no ledger = no crash)', legacy.html.includes('legacy'));
check('a legacy artifact honestly reports version 0', legacy.currentVersion === 0);
check('a legacy artifact still exposes its sha', legacy.sha === sha256Hex('<html><body>legacy</body></html>'));
check('a legacy artifact reports an empty history', (await listArtifactVersions('legacy-artifact', proj)).versions.length === 0);
const legacyRow = (await listArtifacts(proj)).items.find((i) => i.id === 'legacy-artifact');
check('a legacy row reports versionCount 0', legacyRow?.versionCount === 0 && legacyRow?.currentVersion === 0);
// Its first edit seeds v1 instead of erroring.
check('the first edit on a legacy artifact seeds v1', (await updateArtifactHtml('legacy-artifact', '<html>edited</html>', proj)).currentVersion === 1);

await rm(base, { recursive: true, force: true });
console.log(passed + ' passed');
