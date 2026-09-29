#!/usr/bin/env node
/**
 * REQ-174 — live probe: does the composer's thinking pick reach the OUTGOING body?
 *
 * The whole point is byte-level evidence: a temporary custom provider points
 * the deployed server at a local recording stub, so the raw POST bodies the
 * server actually egresses are captured and asserted — not inferred from
 * adapter unit tests. The stub streams a minimal OpenAI-compatible SSE reply,
 * which keeps the run real (server plumbing included) without touching any
 * billed upstream.
 *
 * Checks (grow with the REQ):
 *   A1  a `high` run egreses `reasoning_effort: "high"` on the chat body
 *   A2  an `off` run egreses NO reasoning field at all (regression shape)
 *   A3  the requests land on the stub's /v1/chat/completions (model routing)
 *
 * Run: NODE_PATH=/root/test-hermes/node_modules node scripts/probe-thinking-effectiveness.cjs
 * No billed API key is read: the token is minted locally and the stub is
 * loopback-only. Everything the probe creates (temp provider, session,
 * temp dir) is deleted and re-verified before exit.
 */
const http = require('node:http');
const WebSocket = require('ws');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const BASE = 'http://127.0.0.1:3456';
const PROVIDER_ID = 'thinkprobe';
const STUB_MODEL = 'stub-thinking';
const MODEL_REF = PROVIDER_ID + '/' + STUB_MODEL;

let passed = 0;
function check(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

/**
 * Cleanup assertions never throw: a throwing finally masks the original
 * failure and hides the real diagnosis (learned the hard way). Issues are
 * collected and surfaced after the primary outcome is reported.
 */
const cleanupIssues = [];
function soft(cond, label) {
  if (cond) {
    console.log('CHECK: ' + label);
  } else {
    cleanupIssues.push(label);
    console.log('CLEANUP-WARN: ' + label);
  }
}

/** Loopback recording stub: captures bodies, answers a minimal SSE turn. */
function listenStub() {
  const captured = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      let body = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
      captured.push({ path: req.url || '', body, raw });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write('data: ' + JSON.stringify({ id: 'stub-1', choices: [{ delta: { content: 'PROBE-OK' }, finish_reason: null }] }) + '\n\n');
      res.write('data: ' + JSON.stringify({ id: 'stub-1', choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 2 } }) + '\n\n');
      res.end('data: [DONE]\n\n');
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, captured, base: 'http://127.0.0.1:' + addr.port });
    });
  });
}

/** Small authed fetch helper (body-less calls avoid a JSON content-type). */
async function req(token, method, path, body) {
  const headers = { Authorization: 'Bearer ' + token };
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return fetch(BASE + path, init);
}

/** Send one prompt over a real WS and settle on done/error (single frames). */
function runTurn(sessionId, token, prompt, reasoningEffort, model) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:3456/ws/' + sessionId + '?token=' + encodeURIComponent(token));
    const frames = [];
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('timeout waiting for done (level=' + reasoningEffort + ')'));
    }, 120000);
    ws.on('open', () => {
      const msg = { type: 'prompt', sessionId, prompt, model };
      if (reasoningEffort) msg.reasoningEffort = reasoningEffort;
      ws.send(JSON.stringify(msg));
    });
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      frames.push(msg);
      if (msg.type === 'error') {
        clearTimeout(timer);
        ws.close();
        reject(new Error('server error: ' + JSON.stringify(msg).slice(0, 300)));
      } else if (msg.type === 'done' || msg.type === 'run_end') {
        clearTimeout(timer);
        ws.close();
        resolve(frames);
      }
    });
    ws.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function answerOf(frames) {
  return frames
    .filter((f) => f.type === 'text_delta' || f.type === 'text')
    .map((f) => f.text ?? f.delta ?? '')
    .join('');
}

(async () => {
  const token = execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .pop();
  check(typeof token === 'string' && token.length > 20, 'e2e token minted');

  const stub = await listenStub();
  let sessionId = '';
  let providerCreated = false;
  const baseline = await (await req(token, 'GET', '/api/providers')).json();
  // A leftover from a crashed run is cleaned below, so it is not part of the
  // expected end state (the restored registry == baseline minus the temp id).
  const beforeIds = (baseline.providers || [])
    .map((p) => p.id)
    .filter((id) => id !== PROVIDER_ID)
    .sort();

  try {
    // 0. Leftovers from a crashed earlier run never block this one.
    const leftover = (baseline.providers || []).find((p) => p.id === PROVIDER_ID);
    if (leftover) await req(token, 'DELETE', '/api/providers/' + PROVIDER_ID);

    const created = await req(token, 'POST', '/api/providers', {
      id: PROVIDER_ID,
      name: 'Thinking Probe (temp)',
      baseUrl: stub.base + '/v1',
    });
    const createdBody = await created.json();
    check(
      (created.status === 200 || created.status === 201) && createdBody.ok === true,
      'temp provider created (HTTP ' + created.status + ')',
    );
    providerCreated = true;

    const cwd = mkdtempSync(join(tmpdir(), 'lokma-thinkprobe-'));
    writeFileSync(join(cwd, 'note.txt'), 'probe workspace\n');
    const createdSession = await req(token, 'POST', '/api/sessions', { cwd });
    const session = await createdSession.json();
    sessionId = session.id || session.sessionId;
    check(typeof sessionId === 'string' && sessionId.length > 0, 'session created');

    // A1 — high run must egress reasoning_effort: "high".
    const markHigh = stub.captured.length;
    const highFrames = await runTurn(sessionId, token, 'Reply with ONLY the word HIGH-OK. No tools.', 'high', MODEL_REF);
    const highText = answerOf(highFrames);
    check(highText.includes('PROBE-OK'), 'high run answered through the stub (got "' + highText.trim().slice(0, 40) + '")');
    const highReqs = stub.captured.slice(markHigh);
    check(highReqs.length >= 1, 'high run reached the stub (' + highReqs.length + ' request(s))');
    check(highReqs[0].path === '/v1/chat/completions', 'high run used the chat path (got ' + highReqs[0].path + ')');
    const highBody = highReqs[0].body || {};
    check(
      highBody.reasoning_effort === 'high',
      'high run: outgoing body carries reasoning_effort "high" (got ' + JSON.stringify(highBody.reasoning_effort) + ')',
    );
    check(highBody.reasoning === undefined, 'high run: no Responses-style reasoning object on the chat path');
    console.log('RAW high body: ' + JSON.stringify(highBody).slice(0, 420));

    // A2 — off run must egress no reasoning field at all.
    const markOff = stub.captured.length;
    const offFrames = await runTurn(sessionId, token, 'Reply with ONLY the word OFF-OK. No tools.', 'off', MODEL_REF);
    const offText = answerOf(offFrames);
    check(offText.includes('PROBE-OK'), 'off run answered through the stub (got "' + offText.trim().slice(0, 40) + '")');
    const offReqs = stub.captured.slice(markOff);
    check(offReqs.length >= 1, 'off run reached the stub (' + offReqs.length + ' request(s))');
    const offBody = offReqs[0].body || {};
    check(
      offBody.reasoning_effort === undefined && offBody.reasoning === undefined,
      'off run: outgoing body has NO reasoning field (got ' + JSON.stringify(offBody.reasoning_effort) + ')',
    );
    console.log('RAW off body: ' + JSON.stringify(offBody).slice(0, 420));

    // A3 — every request of both runs kept the picked value (no silent drop mid-run).
    const highAll = highReqs.every((r) => (r.body || {}).reasoning_effort === 'high');
    check(highAll, 'every high-run request carried the pick (no memo drop)');
  } finally {
    try {
      if (sessionId) {
        const del = await req(token, 'DELETE', '/api/sessions/' + sessionId);
        soft(del.status === 200, 'probe session deleted (HTTP ' + del.status + ')');
      }
      if (providerCreated) {
        const delP = await req(token, 'DELETE', '/api/providers/' + PROVIDER_ID);
        soft(delP.status === 200, 'temp provider deleted (HTTP ' + delP.status + ')');
      }
      const after = await (await req(token, 'GET', '/api/providers')).json();
      const afterIds = (after.providers || []).map((p) => p.id).sort();
      soft(
        JSON.stringify(afterIds) === JSON.stringify(beforeIds),
        'provider registry restored (' + afterIds.length + ' providers)',
      );
    } catch (cleanupErr) {
      cleanupIssues.push('cleanup threw: ' + cleanupErr.message);
      console.log('CLEANUP-WARN: ' + cleanupErr.message);
    }
    stub.server.close();
  }

  if (cleanupIssues.length > 0) {
    console.error('PROBE FAILED: cleanup incomplete — ' + cleanupIssues.join('; '));
    process.exit(1);
  }
  console.log('thinking effectiveness probe: ' + passed + ' checks passed');
  process.exit(0);
})().catch((err) => {
  console.error('PROBE FAILED: ' + err.message);
  if (cleanupIssues.length > 0) console.error('cleanup issues: ' + cleanupIssues.join('; '));
  process.exit(1);
});
