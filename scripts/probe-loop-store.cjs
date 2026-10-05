#!/usr/bin/env node
/**
 * REQ-200 — live proof for the harness-owned loop store over the DEPLOYED
 * server (`lokma-server`, :3456). Zero model cost: nothing here starts a run,
 * because firing iterations is REQ-201's job — this probe owns records,
 * budgets and history only.
 *
 * The server is restarted by the caller, so a fresh build is what answers.
 * Every assertion is a live HTTP round trip; nothing is stubbed and nothing is
 * hand-written into `state.json`.
 *
 * The gate stays ON — the token is minted, never the login flag flipped:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   node scripts/probe-loop-store.cjs --token "$TK"
 *
 * Both directions matter. "POST creates a loop" is satisfied by any 200, so
 * every write is followed by a GET of the SAME id (server-minted, never
 * client-supplied) plus a disk read of the real `state.json`, and the negative
 * controls (unknown id, traversal, terminal transition, patchable status) prove
 * the refusals are real rather than unreachable code.
 *
 * Exit 0 = every check passed.
 */
const { execFileSync } = require('node:child_process');
const { readFileSync, existsSync, readdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const API = process.argv.includes('--api') ? process.argv[process.argv.indexOf('--api') + 1] : 'http://127.0.0.1:3456';
const TOKEN = process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : '';
const LOOPS_DIR = '/root/.lokma/loops';

let passed = 0;
const created = [];

function ok(cond, label) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
    throw new Error(`FAIL: ${label}`);
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/** The state.json the server itself wrote — filesystem evidence, not an echo. */
function stateOnDisk(id) {
  const path = join(LOOPS_DIR, id, 'state.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

async function expectStatus(method, path, body, want, label) {
  const { status, json } = await api(method, path, body);
  ok(status === want, `${label} → HTTP ${want} (got ${status}${json?.code ? ` ${json.code}` : ''})`);
  return json;
}

async function main() {
  if (!TOKEN) throw new Error('REFUSE: no --token — mint one with HOME=/root bun scripts/mint-e2e-token.mjs');

  // ─── empty list is an honest [] ───────────────────────────────────────
  const before = await api('GET', '/api/loops');
  ok(before.status === 200, 'GET /api/loops → 200');
  ok(Array.isArray(before.json.loops) && typeof before.json.count === 'number', 'list answers { loops, count }');

  // ─── create: server mints the id, record lands on disk ────────────────
  const created1 = await expectStatus(
    'POST',
    '/api/loops',
    { name: 'probe store', cwd: '/tmp/lokma-loop-probe', prompt: 'run the gate, report the count', budget: { maxIters: 2 } },
    201,
    'POST /api/loops',
  );
  const id = created1.loop?.id;
  ok(typeof id === 'string' && /^l_[a-f0-9]{8}$/.test(id), 'server mints an l_ id (client never supplies one)');
  ok(created1.loop.status === 'draft', 'a created loop starts draft');
  ok(created1.loop.spent.iters === 0 && created1.loop.spent.usd === 0, 'counters start at zero');
  created.push(id);

  const onDisk = stateOnDisk(id);
  ok(onDisk !== null, 'state.json exists on disk at ~/.lokma/loops/<id>/');
  ok(onDisk.id === id && onDisk.budget.maxIters === 2, 'state.json carries the same id + budget the API returned');
  ok(existsSync(join(LOOPS_DIR, id, 'prompt.md')), 'prompt.md mirror exists next to state.json');

  const fetched = await api('GET', `/api/loops/${id}`);
  ok(fetched.status === 200 && fetched.json.loop.id === id, 'GET /api/loops/:id returns the same record');

  const list = await api('GET', '/api/loops');
  ok(list.json.loops.some((l) => l.id === id), 'the new loop appears in GET /api/loops');
  ok(list.json.count === list.json.loops.length, 'count matches the returned array');

  const detail = await api('GET', `/api/loops/${id}/detail`);
  ok(detail.status === 200 && detail.json.loop.id === id && typeof detail.json.ledger === 'string', 'GET detail answers loop + ledger + path');
  ok(detail.json.ledgerPath.includes(`${id}/ledger.md`), 'detail reports the real ledger path');

  // ─── negative controls: refusals must be reachable, not dead code ─────
  await expectStatus('GET', '/api/loops/l_deadbeef', undefined, 404, 'unknown loop id');
  await expectStatus('GET', '/api/loops/not-an-id', undefined, 400, 'client-shaped loop id');
  await expectStatus('GET', '/api/loops/..%2F..%2Fetc', undefined, 400, 'traversal loop id');
  await expectStatus('POST', '/api/loops', { name: '', cwd: '/tmp', prompt: 'x' }, 400, 'blank name');
  await expectStatus('POST', '/api/loops', { name: 'n', cwd: '/tmp', prompt: '' }, 400, 'blank prompt');
  await expectStatus('POST', '/api/loops', { name: 'n', cwd: '/tmp', prompt: 'x', origin: 'cron' }, 400, 'unknown origin');
  await expectStatus('PATCH', `/api/loops/${id}`, {}, 400, 'empty patch');

  // A client-supplied id must be IGNORED, not honoured.
  const spoof = await expectStatus('POST', '/api/loops', { id: 'l_deadbeef', name: 'spoof', cwd: '/tmp', prompt: 'x' }, 201, 'POST with a client id');
  ok(spoof.loop.id !== 'l_deadbeef', 'a client-supplied id is ignored, never honoured');
  created.push(spoof.loop.id);

  // ─── status is NOT patchable: that is what keeps counters measured ─────
  const patched = await expectStatus(
    'PATCH',
    `/api/loops/${id}`,
    { nextHint: 'slice 2', target: '39/39' },
    200,
    'PATCH editable fields',
  );
  ok(patched.loop.nextHint === 'slice 2', 'nextHint is editable');
  ok(patched.loop.score.target === '39/39', 'target score is editable');

  for (const field of ['status', 'spent', 'stopReason', 'startedAt', 'finishedAt']) {
    const { status, json } = await api('PATCH', `/api/loops/${id}`, { [field]: 'done' });
    const after = stateOnDisk(id);
    ok(
      status === 400 && after.status === 'draft',
      `${field} is refused by the schema and unchanged on disk (HTTP ${status}, disk still ${after.status}${json?.code ? ` ${json.code}` : ''})`,
    );
  }
  ok(stateOnDisk(id).spent.iters === 0, 'PATCH can never invent progress (spent.iters still 0 on disk)');

  // ─── transitions ──────────────────────────────────────────────────────
  await expectStatus('POST', `/api/loops/${id}/pause`, undefined, 400, 'pausing a draft loop is refused');
  await expectStatus('POST', `/api/loops/${id}/resume`, undefined, 200, 'resuming a draft loop starts it');
  ok(stateOnDisk(id).status === 'running', 'the status landed on disk, not just in the response');
  ok(typeof stateOnDisk(id).startedAt === 'string', 'startedAt is stamped by the first transition to running');

  await expectStatus('POST', `/api/loops/${id}/pause`, undefined, 200, 'pause a running loop');
  const paused = stateOnDisk(id);
  ok(paused.status === 'paused' && paused.stopReason === 'stopped', 'pause records stopReason stopped');

  // ─── terminal is terminal (needs a done loop; the executor makes them) ──
  // There is no route that can make a loop `done` in this slice, so the
  // terminal refusal is asserted through the unit probe — here we assert the
  // shape we CAN reach: a paused loop still reports honestly.
  ok(stateOnDisk(id).finishedAt === null, 'a paused loop has no finishedAt (it never finished)');

  // ─── cwd lock discipline over the wire (kapsam 5) ─────────────────────
  // The holder must be RUNNING for the lock to be held: the transitions block
  // above left it paused, and a paused loop has (correctly) given its directory
  // back — so resuming it here is what makes the refusals below mean something.
  await expectStatus('POST', `/api/loops/${id}/resume`, undefined, 200, 'resume the holder so it owns the directory');

  // A second loop on the SAME directory must be refused with 409 + a machine
  // code, and the refusal must NAME the holder — a "locked" answer with no owner
  // is the one reply that leaves the user with nothing to do.
  const rival = await expectStatus(
    'POST',
    '/api/loops',
    { name: 'probe rival', cwd: '/tmp/lokma-loop-probe/', prompt: 'collide on purpose' },
    201,
    'a second loop on the locked directory is created (draft — creation never locks)',
  );
  const rivalId = rival.loop?.id;
  created.push(rivalId);
  const locked = await api('POST', `/api/loops/${rivalId}/resume`);
  ok(locked.status === 409, `starting the rival on a held directory → 409 (got ${locked.status})`);
  ok(locked.json?.code === 'cwd_locked', `the refusal carries the cwd_locked code (got ${locked.json?.code})`);
  ok(typeof locked.json?.message === 'string' && locked.json.message.includes(id), 'the refusal names the holding loop id');
  ok(typeof locked.json?.message === 'string' && locked.json.message.includes('/tmp/lokma-loop-probe'), 'the refusal names the directory');
  ok(stateOnDisk(rivalId).status === 'draft', 'the refused start left the rival draft on disk');

  // The same directory spelled differently is still the same directory.
  const twin = await expectStatus(
    'POST',
    '/api/loops',
    { name: 'probe twin', cwd: '/tmp/lokma-loop-probe//', prompt: 'same dir, other spelling' },
    201,
    'a third loop on a differently spelled path is created',
  );
  const twinId = twin.loop?.id;
  created.push(twinId);
  const twinLocked = await api('POST', `/api/loops/${twinId}/resume`);
  ok(twinLocked.status === 409 && twinLocked.json?.code === 'cwd_locked', 'a trailing-slash spelling does not slip past the lock');

  // Pausing the holder hands the directory back, so the rival can then start —
  // the release half of the guarantee, which a create-only check would miss.
  await expectStatus('POST', `/api/loops/${id}/pause`, undefined, 200, 'pausing the holder again');
  const afterRelease = await expectStatus('POST', `/api/loops/${rivalId}/resume`, undefined, 200, 'the released directory can now be claimed');
  ok(stateOnDisk(rivalId).status === 'running', 'the rival is running on the released directory');
  await expectStatus('POST', `/api/loops/${rivalId}/pause`, undefined, 200, 'pause the rival before cleanup');

  // ─── project scoping ──────────────────────────────────────────────────
  const scoped = await expectStatus(
    'POST',
    '/api/loops',
    { name: 'probe scoped', cwd: '/tmp/lokma-loop-probe', prompt: 'x', projectId: 'demo-project' },
    201,
    'create a project-scoped loop',
  );
  created.push(scoped.loop.id);
  const projList = await api('GET', '/api/loops?projectId=demo-project');
  ok(projList.status === 200 && projList.json.loops.every((l) => l.projectId === 'demo-project'), '?projectId returns only that project');
  ok(projList.json.loops.some((l) => l.id === scoped.loop.id), 'the scoped loop is in the project view');
  const noneList = await api('GET', '/api/loops?projectId=-');
  ok(noneList.status === 200 && noneList.json.loops.every((l) => l.projectId === null), '?projectId=- returns the project-less bucket');
  ok(noneList.json.loops.some((l) => l.id === id), 'the project-less loop is IN the project-less view');
  ok(!projList.json.loops.some((l) => l.id === id), 'the project-less loop is absent from the scoped view');

  // ─── the tokenless matrix: the loop API inherits the login gate ───────
  const tokenless = await fetch(`${API}/api/loops`);
  ok(tokenless.status === 401, `tokenless GET /api/loops → 401 (got ${tokenless.status}) — the gate covers the new routes`);
  const tokenlessCreate = await fetch(`${API}/api/loops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x', cwd: '/tmp', prompt: 'y' }),
  });
  ok(tokenlessCreate.status === 401, `tokenless POST /api/loops → 401 (got ${tokenlessCreate.status})`);

  // ─── cleanup: delete everything the probe created, then prove it is gone ──
  for (const loopId of created) {
    const del = await api('DELETE', `/api/loops/${loopId}`);
    ok(del.status === 200, `DELETE /api/loops/${loopId} → 200`);
  }
  await expectStatus('DELETE', '/api/loops/l_deadbeef', undefined, 404, 'deleting an unknown loop 404s');
  for (const loopId of created) {
    ok(!existsSync(join(LOOPS_DIR, loopId)), `probe state cleaned up: ~/.lokma/loops/${loopId} is gone`);
  }
  const leftovers = existsSync(LOOPS_DIR) ? readdirSync(LOOPS_DIR).filter((d) => created.includes(d)) : [];
  ok(leftovers.length === 0, 'no probe loop directory survives the cleanup');

  // Lock files outlive the process that wrote them, so the cleanup claim is
  // incomplete without them: a leftover would make the NEXT probe run fail with
  // a ghost "held by l_xxxx" refusal on a directory nobody is using.
  const lockDir = '/root/.lokma/agentlocks/locks';
  const leftLocks = existsSync(lockDir) ? readdirSync(lockDir).filter((f) => f.endsWith('.json')) : [];
  ok(leftLocks.length === 0, `no probe lock file survives the cleanup (${leftLocks.length} left)`);

  console.log(`\n${passed} passed`);
}

main().catch((e) => {
  console.error(String(e));
  // Leave no state behind even on a red run — including lock files, or the next
  // run inherits a ghost holder on a directory it is about to reuse.
  for (const loopId of created) {
    try {
      rmSync(join(LOOPS_DIR, loopId), { recursive: true, force: true });
    } catch {}
  }
  try {
    const lockDir = '/root/.lokma/agentlocks/locks';
    if (existsSync(lockDir)) {
      for (const f of readdirSync(lockDir)) {
        if (!f.endsWith('.json')) continue;
        const raw = readFileSync(join(lockDir, f), 'utf-8');
        if (created.some((id) => raw.includes(id))) rmSync(join(lockDir, f), { force: true });
      }
    }
  } catch {}
  process.exit(1);
});
