/**
 * Live probe for session rewind + summary timestamps (`./store` — Sessions routes).
 * Run: `HOME=$(mktemp -d) bun src/session/rewind.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Real temp HOME on disk (startup env — bun snapshots HOME at boot; the
 * guard below refuses anything outside `/tmp/`). Real SessionStore files.
 * Regression cover:
 *  (1) rewind on an unknown id throws `session_not_found` (404) and mints
 *      NO transcript file (phantom-write bug, area A run 4);
 *  (2) rewind on a real session truncates to the first N lines;
 *  (3) summary `createdAt` is never the epoch — bun reports birthtimeMs 0
 *      (no btime support), so the store must fall back to mtime.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SessionStore } from './store.js';
import type { SessionMessage } from './types.js';

const HOME = process.env.HOME ?? '';
if (!HOME.startsWith('/tmp/')) {
  throw new Error(`REFUSE: HOME=${HOME || '(empty)'} — rerun with HOME=$(mktemp -d) bun ...`);
}

const CWD = '/tmp/probe-work-rewind';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

function msg(role: SessionMessage['role'], content: string): SessionMessage {
  return { role, content, timestamp: '2026-09-05T00:00:00.000Z' };
}

async function main(): Promise<void> {
  const store = new SessionStore(CWD);

  // --- (1) unknown id: throws, creates nothing ---
  const bogus = 'nope-zzz-rewind-probe';
  try {
    await store.rewind(bogus, 1);
  } catch (e) {
    const err = e as { code?: string; statusCode?: number };
    assert(err.code === 'session_not_found', 'rewind unknown code is session_not_found');
    assert(err.statusCode === 404, 'rewind unknown status is 404');
  }
  assert(
    !existsSync(join(SessionStore.dirFor(CWD), `${bogus}.jsonl`)),
    'rewind unknown mints no transcript file',
  );

  // --- (2) real session: truncates ---
  const id = 'sess_rewind_probe';
  await store.append(id, msg('user', 'first'));
  await store.append(id, msg('assistant', 'second'));
  await store.append(id, msg('user', 'third'));
  const r = await store.rewind(id, 1);
  assert(r.kept === 1, 'rewind keeps first N lines');
  const after = await store.read(id);
  assert(after.length === 1 && after[0]?.content === 'first', 'rewind drops later lines');

  // --- (3) summary timestamps: never epoch ---
  const s = await store.summary(id);
  assert(s.createdAt !== '1970-01-01T00:00:00.000Z', 'summary createdAt is not the epoch');
  assert(!Number.isNaN(Date.parse(s.createdAt)), 'summary createdAt parses as a date');
  assert(!Number.isNaN(Date.parse(s.updatedAt)), 'summary updatedAt parses as a date');

  // --- cleanup: prove remove() works, leave zero residue ---
  const removed = await store.remove(id);
  assert(removed.existed === true, 'remove reports existed for the probe session');
  assert((await store.read(id)).length === 0, 'probe transcript gone after remove');

  console.log(`\nALL REWIND TESTS PASSED (${passed} checks)`);
}

await main();
