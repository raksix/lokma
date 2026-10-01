/**
 * REQ-183 live probe — an upstream model-availability refusal is remembered
 * and the catalog badges the entry (`unsupported: true`).
 *
 * The badge chain (errors.ts upstreamCode -> agent-loop mark -> models.ts
 * annotation -> pickers) is proven end to end against the DEPLOYED server
 * with ZERO model cost:
 *
 *   1. an ephemeral provider (namespaced id) points at a local stub;
 *   2. the stub answers GET with a polite model list and every other request
 *      with the REAL unsupported_model 400 body (as observed from CommandCode);
 *   3. a prompt bound to `<provider>/refuse-model` makes the deployed loop
 *      talk to the stub, get refused, fail fast (ONE POST, no retry) and
 *      leave an honest failure row in the transcript;
 *   4. `GET /api/models` now carries `unsupported: true` on that entry —
 *      badge, never clip.
 *
 * Cleanup is part of the contract: session + temp dir + provider deleted,
 * each re-checked until it stays gone; the login gate is never touched and
 * is re-verified tokenless (401) at the end.
 *
 * Usage: node scripts/probe-unsupported-model-badge.cjs
 * Needs ./node_modules/ws and a minted superadmin token
 * (HOME=/root bun scripts/mint-e2e-token.mjs — read at runtime, never logged).
 */
'use strict';
const { mkdtempSync, rmSync, existsSync, readdirSync } = require('node:fs');
const { tmpdir, homedir } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { createServer } = require('node:http');
const WebSocket = require('ws');

const ROOT = resolve(__dirname, '..');
const BASE = 'http://127.0.0.1:3456';
const WS_BASE = 'ws://127.0.0.1:3456';
const PROJECTS_ROOT = join(homedir(), '.lokma', 'projects');
const NL = String.fromCharCode(10);
const RUN_TIMEOUT_MS = 60000;

// Unique per run so a crashed earlier run can never 409 this one.
const PROVIDER_ID = 'badge-probe-' + Date.now().toString(36);
const STUB_MODEL = 'refuse-model';
const CATALOG_ID = PROVIDER_ID + '/' + STUB_MODEL;

// The real upstream refusal shape (CommandCode), verbatim structure.
const REFUSAL_BODY = JSON.stringify({
  error: {
    message: 'Model "refuse-model" is not supported on this endpoint.',
    type: 'invalid_request_error',
    param: 'model',
    code: 'unsupported_model',
  },
});

let TOKEN = '';
let passed = 0;
const failures = [];

function check(cond, label) {
  if (cond) {
    passed += 1;
    console.log('PASS: ' + label);
  } else {
    failures.push(label);
    console.log('FAIL: ' + label);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, opts) {
  const o = opts || {};
  const headers = { Authorization: 'Bearer ' + TOKEN };
  // Fastify 400s a body-less DELETE that declares a JSON content type.
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(BASE + path, {
    method: o.method || 'GET',
    headers,
    body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
}

async function readMessages(sessionId, cwd) {
  const res = await api('/api/sessions/' + sessionId + '?cwd=' + encodeURIComponent(cwd));
  if (res.status !== 200) throw new Error('transcript read failed HTTP ' + res.status + ' for ' + sessionId);
  const body = await res.json();
  return Array.isArray(body.messages) ? body.messages : [];
}

/** Locate the project dir that holds one session's JSONL (naming-agnostic). */
function findProjectDir(sessionId) {
  let names = [];
  try {
    names = readdirSync(PROJECTS_ROOT);
  } catch {
    return null;
  }
  for (const name of names) {
    if (existsSync(join(PROJECTS_ROOT, name, 'sessions', sessionId + '.jsonl'))) {
      return join(PROJECTS_ROOT, name);
    }
  }
  return null;
}

function openSocket(sessionId, cwd) {
  const url = WS_BASE + '/ws/' + sessionId + '?token=' + encodeURIComponent(TOKEN) + '&cwd=' + encodeURIComponent(cwd);
  return new WebSocket(url);
}

function awaitOpen(ws, label) {
  return new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', (e) => rej(new Error(label + ' socket failed: ' + String(e && e.message))));
  });
}

/** Send one prompt for the probe model; settle on the run's terminal frame. */
function runPrompt(ws, sessionId, prompt) {
  return new Promise((resolveP, rejectP) => {
    const frames = [];
    let settled = false;
    let grace = null;
    const timer = setTimeout(() => finish(rejectP, new Error('run timeout after ' + RUN_TIMEOUT_MS + 'ms')), RUN_TIMEOUT_MS);
    function finish(fn, arg) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (grace) clearTimeout(grace);
      ws.removeListener('message', onMessage);
      fn(arg);
    }
    function settle() {
      if (grace) return;
      grace = setTimeout(() => finish(resolveP, { frames }), 1500);
    }
    function onMessage(raw) {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      frames.push(msg);
      if (msg.type === 'done') return settle();
      if (msg.type === 'error' && msg.code !== 'queued') return settle();
    }
    ws.on('message', onMessage);
    ws.send(JSON.stringify({ type: 'prompt', sessionId, prompt, model: CATALOG_ID }));
  });
}

function analyze(res) {
  const frames = res.frames;
  return {
    text: frames.filter((f) => f.type === 'text_delta').map((f) => String(f.delta || '')).join(''),
    done: frames.find((f) => f.type === 'done'),
    errs: frames.filter((f) => f.type === 'error' && f.code !== 'queued'),
  };
}

async function getModels() {
  const res = await api('/api/models');
  if (res.status !== 200) throw new Error('GET /api/models HTTP ' + res.status);
  const body = await res.json();
  return Array.isArray(body.models) ? body.models : [];
}

function findModel(models, id) {
  return models.find((m) => m.id === id) || null;
}

/** Delete any provider left behind by a crashed earlier run of this probe. */
async function purgeStaleProviders() {
  const res = await api('/api/providers');
  if (res.status !== 200) return;
  const body = await res.json();
  const stale = (body.providers || [])
    .map((p) => p.id)
    .filter((id) => id.indexOf('badge-probe-') === 0 && id !== PROVIDER_ID);
  for (const id of stale) {
    await api('/api/providers/' + id, { method: 'DELETE' }).catch(() => {});
    console.log('-- purged stale provider ' + id);
  }
}

async function cleanupSession(sessionId, cwd) {
  const proj = findProjectDir(sessionId);
  try {
    const res = await api('/api/sessions/' + sessionId + '?cwd=' + encodeURIComponent(cwd), { method: 'DELETE' });
    check(res.status === 200 || res.status === 204, 'cleanup: session deleted (HTTP ' + res.status + ')');
  } catch (e) {
    check(false, 'cleanup: session delete threw: ' + String(e));
  }
  if (proj) rmSync(proj, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
  let gone = false;
  for (let i = 0; i < 6 && !gone; i += 1) {
    await sleep(400);
    if (proj && existsSync(proj)) rmSync(proj, { recursive: true, force: true });
    if (findProjectDir(sessionId)) {
      await api('/api/sessions/' + sessionId + '?cwd=' + encodeURIComponent(cwd), { method: 'DELETE' }).catch(() => {});
      const again = findProjectDir(sessionId);
      if (again) rmSync(again, { recursive: true, force: true });
    }
    gone = (!proj || !existsSync(proj)) && !findProjectDir(sessionId) && !existsSync(cwd);
  }
  check(gone, 'cleanup: session + project dir + temp dir stay gone');
}

/** Stub: polite model list on GET, the real refusal shape on anything else. */
function startStub() {
  const posts = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: STUB_MODEL }] }));
        return;
      }
      posts.push({ at: Date.now(), path: String(req.url || ''), body });
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(REFUSAL_BODY);
    });
  });
  return new Promise((res) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      res({ server, base: 'http://127.0.0.1:' + addr.port + '/v1', posts });
    });
  });
}

(async () => {
  console.log('unsupported-model badge probe — provider=' + PROVIDER_ID + ' server=' + BASE);
  TOKEN = execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .trim()
    .split(NL)
    .pop();
  if (!TOKEN || TOKEN.length < 20) throw new Error('mint failed — no token');
  console.log('token minted (len ' + TOKEN.length + ', value never logged)');

  const stub = await startStub();
  const cwd = mkdtempSync(join(tmpdir(), 'lokma-req183-badge-'));
  let providerCreated = false;
  let sid = null;
  let ws = null;
  try {
    await purgeStaleProviders();

    // 1. Ephemeral provider -> local stub.
    const created = await api('/api/providers', {
      method: 'POST',
      body: { id: PROVIDER_ID, name: 'Badge probe (ephemeral)', baseUrl: stub.base, apiKey: 'probe-local-key' },
    });
    check(created.status === 201, 'provider created (HTTP ' + created.status + ')');
    providerCreated = true;

    // 2. Baseline: the live merge lists the stub model, no flag yet.
    const modelsBefore = await getModels();
    const before = findModel(modelsBefore, CATALOG_ID);
    check(Boolean(before), 'catalog lists the stub model via live merge (' + CATALOG_ID + ')');
    check(before !== null && before.unsupported !== true, 'baseline: no unsupported flag before any refusal');

    // 3. Run bound to the stub model — the deployed loop must hit the stub.
    const sessionRes = await api('/api/sessions', { method: 'POST', body: { cwd, model: CATALOG_ID } });
    check(sessionRes.status === 200 || sessionRes.status === 201, 'session created (HTTP ' + sessionRes.status + ')');
    const sessionBody = await sessionRes.json();
    sid = sessionBody.id;
    ws = openSocket(sid, cwd);
    await awaitOpen(ws, 'badge');
    ws.on('error', (e) => console.log('ws error: ' + String(e && e.message)));

    const historyBefore = await readMessages(sid, cwd);
    const res = await runPrompt(ws, sid, 'Say hi.');
    const a = analyze(res);
    const delta = (await readMessages(sid, cwd)).slice(historyBefore.length);
    const errMsg = a.errs.map((e) => String(e.message)).join(' | ');

    check(stub.posts.length >= 1, 'the deployed loop talked to the stub (chat POST seen)');
    check(stub.posts.length === 1, 'the refusal is never retried (fail fast, got ' + stub.posts.length + ' POSTs)');
    check(a.errs.length >= 1, 'the run surfaced an error frame');
    check(/unsupported_model|not supported/i.test(errMsg), 'the error names the unsupported model: ' + errMsg.slice(0, 140));
    check(delta.some((m) => String(m.content).includes('[run failed')), 'transcript carries the honest failure row');

    // 4. The badge: the same catalog now flags the id (bounded poll).
    let after = null;
    for (let i = 0; i < 6; i += 1) {
      const modelsAfter = await getModels();
      after = findModel(modelsAfter, CATALOG_ID);
      if (after && after.unsupported === true) break;
      await sleep(400);
    }
    check(Boolean(after), 'the entry is still offered after the refusal (badge, never clip)');
    check(after !== null && after.unsupported === true, 'catalog badges the refused id (unsupported: true) — ' + JSON.stringify(after));
  } finally {
    if (ws) {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
    await sleep(150);
    if (sid) await cleanupSession(sid, cwd);
    else rmSync(cwd, { recursive: true, force: true });
    if (providerCreated) {
      const del = await api('/api/providers/' + PROVIDER_ID, { method: 'DELETE' }).catch(() => null);
      check(del !== null && (del.status === 200 || del.status === 204), 'cleanup: provider deleted');
      let gone = false;
      for (let i = 0; i < 5 && !gone; i += 1) {
        await sleep(300);
        const list = await api('/api/providers');
        const listBody = list.status === 200 ? await list.json() : { providers: [] };
        gone = !(listBody.providers || []).some((p) => p.id === PROVIDER_ID);
        if (!gone) await api('/api/providers/' + PROVIDER_ID, { method: 'DELETE' }).catch(() => {});
      }
      check(gone, 'cleanup: provider stays gone');
    }
    stub.server.close();

    // The login gate is never flipped — verify tokenless it still refuses.
    const gate = await fetch(BASE + '/api/auth/me', { signal: AbortSignal.timeout(10000) });
    check(gate.status === 401, 'login gate stays ON (tokenless /api/auth/me = 401)');
  }

  console.log('');
  if (failures.length === 0) {
    console.log('unsupported-model badge probe: ' + passed + ' checks passed');
    process.exit(0);
  }
  console.log('unsupported-model badge probe: ' + passed + ' passed, ' + failures.length + ' FAILED');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
})().catch((e) => {
  console.error('PROBE CRASHED: ' + (e && e.stack ? e.stack : String(e)));
  console.log('unsupported-model badge probe: ' + passed + ' passed, ' + failures.length + ' recorded failures before the crash');
  process.exit(1);
});
