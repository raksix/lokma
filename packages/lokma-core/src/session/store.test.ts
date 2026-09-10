/**
 * Probe for the REQ-087 session-home helpers (`normalizeCwd`,
 * `locateSession`, `listAllSummaries`).
 * Run: `HOME=$(mktemp -d) bun src/session/store.test.ts` from
 * `packages/lokma-core`. No test framework — plain asserts.
 * Real temp HOME on disk (startup env — bun snapshots HOME at boot, so a
 * runtime override would pollute the real `~/.lokma`; the guard refuses
 * anything outside `/tmp/`). Not imported by library code; excluded from
 * `tsc -p` output like the other `*.test.ts` probes.
 */
import { homedir } from 'node:os';
import { strict as assert } from 'node:assert';
import { normalizeCwd, locateSession, listAllSummaries, SessionStore } from './store.js';
import type { SessionSummary } from './types.js';

const home = homedir();
if (!home.startsWith('/tmp/')) {
  throw new Error(`refusing to run outside a temp HOME (got ${home})`);
}

// normalizeCwd — trailing slashes collapse, `~` expands, idempotent.
assert.equal(normalizeCwd('/x/proj'), '/x/proj');
assert.equal(normalizeCwd('/x/proj/'), '/x/proj');
assert.equal(normalizeCwd('/x/proj//'), '/x/proj');
assert.equal(normalizeCwd('  /x/proj/  '), '/x/proj');
assert.equal(normalizeCwd('~'), home);
assert.equal(normalizeCwd('~/sub/'), `${home}/sub`);
assert.equal(normalizeCwd('/'), '/');
assert.equal(normalizeCwd(normalizeCwd('/x/proj/')), '/x/proj');

// locateSession + listAllSummaries against a real temp-home store.
const cwdPlain = '/tmp/req087-proj';
const cwdSlashed = '/tmp/req087-proj/';
const storePlain = new SessionStore(cwdPlain);
await storePlain.append('sess_aaa', {
  role: 'user',
  content: 'hello',
  timestamp: new Date().toISOString(),
});
await storePlain.writeMeta('sess_aaa', { model: 'test/model' });
// Legacy slash-variant dir (pre-normalization records kept the slash).
const storeSlashed = new SessionStore(cwdSlashed);
await storeSlashed.append('sess_bbb', {
  role: 'user',
  content: 'world',
  timestamp: new Date().toISOString(),
});
await storeSlashed.writeMeta('sess_bbb', { model: 'test/model' });

const foundA = await locateSession('sess_aaa');
assert.ok(foundA, 'locateSession finds the plain session');
assert.equal(foundA?.cwd, cwdPlain);
const foundB = await locateSession('sess_bbb');
assert.ok(foundB, 'locateSession finds the legacy slash-variant session');
assert.equal(foundB?.cwd, cwdSlashed);
assert.equal(await locateSession('sess_nope'), null);
assert.equal(await locateSession('../../evil'), null);

const all = await listAllSummaries();
const ids = all.map((s: SessionSummary) => s.id);
assert.ok(ids.includes('sess_aaa'), 'listAllSummaries includes the plain session');
assert.ok(ids.includes('sess_bbb'), 'listAllSummaries includes the slash-variant session');
const sumB = all.find((s: SessionSummary) => s.id === 'sess_bbb');
assert.equal(sumB?.messageCount, 1);

// REQ-116 FAZ D-continuity: the Claude --resume handle survives meta merges.
const storeC = new SessionStore('/tmp/req116-proj');
await storeC.append('sess_ccc', {
  role: 'user',
  content: 'hi',
  timestamp: new Date().toISOString(),
});
await storeC.writeMeta('sess_ccc', { model: 'claude-code/sonnet', claudeSessionId: 's-1' });
assert.equal((await storeC.readMeta('sess_ccc'))?.claudeSessionId, 's-1');
// Unrelated patches (model/title) keep the handle.
await storeC.writeMeta('sess_ccc', { model: 'claude-code/opus' });
assert.equal((await storeC.readMeta('sess_ccc'))?.claudeSessionId, 's-1');
// Explicit empty clears back to a fresh engine run.
await storeC.writeMeta('sess_ccc', { claudeSessionId: '' });
assert.equal((await storeC.readMeta('sess_ccc'))?.claudeSessionId, undefined);
// A fresh session id never inherits another session's handle (no fork leak).
await storeC.writeMeta('sess_ddd', { model: 'claude-code/sonnet' });
assert.equal((await storeC.readMeta('sess_ddd'))?.claudeSessionId, undefined);

console.log('store probe: normalizeCwd + locateSession + listAllSummaries OK');
