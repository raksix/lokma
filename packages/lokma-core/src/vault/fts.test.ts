/**
 * Live probe for the FTS5 vault index (`./fts` + `searchNotesDetailed`).
 * Run: `HOME=$(mktemp -d) bun src/vault/fts.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Real temp HOME on disk (startup env — bun snapshots HOME at boot, so a
 * runtime override would pollute the real `~/.lokma`; the guard below
 * refuses anything outside `/tmp/`). Real `bun:sqlite` FTS5, real files.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts` from
 * `tsc -p` output (same precedent as `tools.test.ts`).
 * See Docs/28 section vault search.
 */
import { buildMatchQuery, ftsAvailable, searchFts, syncVaultIndex } from './fts';
import { ingestNote, deleteNote, searchNotesDetailed } from './vault';

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

async function main(): Promise<void> {
  assert(await ftsAvailable(), 'fts engine available on this runtime');

  // --- pure MATCH builder (no disk) ---
  assert(buildMatchQuery('  ') === null, 'match builder: blank query has no terms');
  assert(buildMatchQuery('...') === null, 'match builder: punctuation-only query has no terms');
  assert(buildMatchQuery('zephyr') === '"zephyr"*', 'match builder: single term gets prefix');
  assert(buildMatchQuery('red apple') === '"red" AND "apple"*', 'match builder: AND join, prefix on last only');
  assert(buildMatchQuery('a  b   c d e f g h i j k l')?.split(' AND ').length === 10, 'match builder: 10-term cap');
  assert(buildMatchQuery('say "hi"') === '"say" AND "hi"*', 'match builder: quote chars never reach MATCH syntax');

  // --- live index over real notes ---
  const s1 = await syncVaultIndex();
  assert(s1.added === 0 && s1.updated === 0 && s1.removed === 0, 'sync on empty vault is a no-op');

  await ingestNote('fts/zephyr-title.md', '# Zephyr Notes\nUnrelated body words here.\n', 'probe');
  await ingestNote('fts/plain-body.md', '# Plain\nThe zephyr winds blow through the valley every morning.\n', null);
  await ingestNote('fts/both-terms.md', '# Orchard log\nRed apples and green apples fill the crates.\n', 'probe');
  await ingestNote('other/garden.md', '# Garden\nRed tulips bloom beside the stone wall.\n', null);
  const s2 = await syncVaultIndex();
  assert(s2.added === 4, `sync indexes 4 new notes (added=${s2.added})`);
  const s3 = await syncVaultIndex();
  assert(s3.added === 0 && s3.updated === 0, 'second sync is a no-op (stat-based)');

  const titleFirst = await searchNotesDetailed('zephyr', '');
  assert(titleFirst.engine === 'fts5', 'search reports engine fts5');
  assert(titleFirst.hits.length === 2, `zephyr matches 2 notes (got ${titleFirst.hits.length})`);
  assert(titleFirst.hits[0]?.path === 'fts/zephyr-title.md', 'title match outranks body match');
  assert(
    titleFirst.hits.every((h) => Number.isFinite(h.score)) &&
      (titleFirst.hits[0]?.score ?? 0) >= (titleFirst.hits[1]?.score ?? 0),
    'scores are finite numbers in non-increasing rank order',
  );
  const bodyHit = titleFirst.hits.find((h) => h.path === 'fts/plain-body.md');
  assert(!!bodyHit && bodyHit.snippet.length > 0 && !bodyHit.snippet.includes(''), 'body hit carries a clean snippet');
  assert(!titleFirst.hits.some((h) => h.path === 'other/garden.md'), 'non-matching note excluded');

  const multi = await searchNotesDetailed('red apples', '');
  assert(multi.hits.length === 1 && multi.hits[0]?.path === 'fts/both-terms.md', 'multi-term AND narrows to one note');

  const prefix = await searchNotesDetailed('zeph', '');
  assert(prefix.hits.length === 2, 'last-term prefix completes partial input');

  const scoped = await searchNotesDetailed('red', 'fts');
  assert(scoped.engine === 'fts5', 'folder-scoped search stays on fts5');
  assert(scoped.hits.length === 1 && scoped.hits[0]?.path === 'fts/both-terms.md', 'folder filter keeps only fts/ hits');

  const all = await searchNotesDetailed('', '');
  assert(all.hits.length === 4 && all.hits.every((h) => h.score === 0), 'empty query lists every note');

  const none = await searchNotesDetailed('quux-no-such-word', '');
  assert(none.hits.length === 0, 'unknown term returns zero hits');

  let badQuery = false;
  try {
    await searchNotesDetailed(42 as unknown as string, '');
  } catch (e) {
    badQuery = e instanceof Error && /q must be a string/.test(e.message);
  }
  assert(badQuery, 'non-string query throws bad_query');

  let badFolder = false;
  try {
    await searchNotesDetailed('zephyr', '../evil');
  } catch (e) {
    badFolder = e instanceof Error && /folder/.test(e.message);
  }
  assert(badFolder, 'evil folder rejected');

  // --- incremental sync: edit + delete are reflected ---
  await ingestNote('fts/plain-body.md', '# Plain\nCompletely rewritten about nothing in particular.\n', null);
  const s4 = await syncVaultIndex();
  assert(s4.updated === 1, `edit detected as update (updated=${s4.updated})`);
  const afterEdit = await searchFts('zephyr', '');
  assert((afterEdit ?? []).length === 1 && afterEdit?.[0]?.path === 'fts/zephyr-title.md', 'edited note drops out of zephyr results');

  await deleteNote('fts/zephyr-title.md');
  const s5 = await syncVaultIndex();
  assert(s5.removed === 1, `delete detected as removal (removed=${s5.removed})`);
  const afterDelete = await searchFts('zephyr', '');
  assert((afterDelete ?? []).length === 0, 'deleted note leaves no stale FTS row');

  // --- cleanup: leave the temp vault empty ---
  await deleteNote('fts/plain-body.md');
  await deleteNote('fts/both-terms.md');
  await deleteNote('other/garden.md');
  await syncVaultIndex();
  const clean = await searchNotesDetailed('', '');
  assert(clean.hits.length === 0, 'temp vault empty after cleanup');

  console.log(`\nfts probe: ${passed} passed`);
}

await main();
