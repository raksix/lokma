/**
 * Live probe for the memory manager (`./manager` — §-delimited MEMORY.md/USER.md).
 * Run: `HOME=$(mktemp -d) bun src/memory/memory.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Real temp HOME on disk (startup env — bun snapshots HOME at boot, so a
 * runtime override would pollute the real `~/.lokma`; the guard below
 * refuses anything outside `/tmp/`). Real files, real § splitting.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts` from
 * `tsc -p` output (same precedent as `tools.test.ts`).
 * See Docs/28 section 5.2 (memory tool contract).
 */
import {
  MEMORY_LIMITS,
  MemoryError,
  memoryAdd,
  memoryRemove,
  memoryReplace,
  readMemory,
  readMemoryEntries,
} from './manager';

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

async function expectMemoryError(
  fn: () => Promise<unknown>,
  code: string,
  status: number,
  label: string,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    assert(e instanceof MemoryError, `${label} throws MemoryError`);
    assert((e as MemoryError).code === code, `${label} code is ${code}`);
    assert((e as MemoryError).status === status, `${label} status is ${status}`);
    return;
  }
  throw new Error(`FAIL: ${label} did not throw`);
}

async function main(): Promise<void> {
  // --- empty read + usage shape ---
  const empty = await readMemoryEntries('memory');
  assert(empty.count === 0 && empty.entries.length === 0, 'empty memory reads zero entries');
  assert(empty.limit === MEMORY_LIMITS.memory, 'usage carries the memory char budget');
  assert(empty.usage === `${empty.chars}/${empty.limit}`, 'usage string is live chars/limit');

  // --- target validation ---
  await expectMemoryError(() => readMemoryEntries('evil'), 'bad_target', 400, 'bad target rejected');
  await expectMemoryError(() => memoryAdd('memory', '   '), 'empty_content', 400, 'blank add rejected');
  await expectMemoryError(
    () => memoryReplace('memory', '', 'x'),
    'empty_old_text',
    400,
    'blank old_text rejected',
  );

  // --- add + dedup + read round-trip ---
  await memoryAdd('memory', 'probe entry alpha');
  await memoryAdd('memory', 'probe entry beta');
  await memoryAdd('memory', 'probe entry alpha'); // exact dup → idempotent ok
  assert((await readMemory('memory')).length === 2, 'exact-dup add stays idempotent');
  const after = await readMemoryEntries('memory');
  assert(after.count === 2, 'usage count follows adds');
  assert(after.entries.includes('probe entry beta'), 'entries echo the added content');

  // --- replace ---
  await memoryReplace('memory', 'alpha', 'probe entry alpha v2');
  assert((await readMemory('memory')).includes('probe entry alpha v2'), 'replace swaps the entry');
  await expectMemoryError(
    () => memoryReplace('memory', 'missing-zzz', 'x'),
    'no_match',
    404,
    'replace with no match 404s',
  );
  await expectMemoryError(
    () => memoryRemove('memory', 'missing-zzz'),
    'no_match',
    404,
    'remove with no match 404s',
  );

  // --- ambiguous match (both entries share the substring) ---
  await expectMemoryError(
    () => memoryReplace('memory', 'probe entry', 'x'),
    'ambiguous_match',
    409,
    'replace with 2 matches 409s',
  );
  await expectMemoryError(
    () => memoryRemove('memory', 'probe entry'),
    'ambiguous_match',
    409,
    'remove with 2 matches 409s',
  );

  // --- remove ---
  await memoryRemove('memory', 'beta');
  assert((await readMemory('memory')).length === 1, 'remove drops exactly one entry');

  // --- overflow honors the budget (user target is small enough to fill fast) ---
  const big = `u-${'x'.repeat(4000)}`;
  await memoryAdd('user', big);
  try {
    await memoryAdd('user', `${big}-overflow`);
    throw new Error('FAIL: overflow add did not throw');
  } catch (e) {
    assert(e instanceof MemoryError && e.code === 'memory_full', 'overflow throws memory_full');
    assert(e instanceof MemoryError && e.status === 409, 'overflow status is 409');
    assert(e instanceof Error && /consolidate/.test(e.message), 'overflow message tells how to repair');
  }
  assert((await readMemory('user')).length === 1, 'failed add writes nothing');

  // --- § separator round-trip (entries containing newlines survive) ---
  await memoryAdd('memory', 'multi\nline\nentry');
  assert(
    (await readMemory('memory')).includes('multi\nline\nentry'),
    'multiline entries survive the § split',
  );

  console.log(`\nOK: ${passed} checks passed`);
}

await main();
