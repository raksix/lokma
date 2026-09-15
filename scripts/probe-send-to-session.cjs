/**
 * Live E2E probe for REQ-147 (`send_to_session`): a deployed-server agent in
 * session A delivers a user message to session B, and B RUNS it with no
 * client attached to B. Second round proves the honest failure path (unknown
 * target) surfaces as a tool error instead of a silent drop.
 * Run from the repo root (needs ./node_modules/ws):
 *   node scripts/probe-send-to-session.cjs
 */
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const WebSocket = require('ws');

const BASE = 'http://127.0.0.1:3456';
const MARK = 'PROBE147-' + Date.now().toString(36);

let passed = 0;
function check(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const token = execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
    cwd: __dirname + '/..',
    encoding: 'utf8',
  }).trim().split('\n').pop();
  const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  const cwd = mkdtempSync(join(tmpdir(), 'lokma-req147-'));
  async function createSession() {
    const res = await fetch(BASE + '/api/sessions', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ cwd }),
    });
    if (res.status !== 200 && res.status !== 201) throw new Error('session create failed: HTTP ' + res.status);
    const body = await res.json();
    return body.id;
  }
  const sourceId = await createSession();
  const targetId = await createSession();
  check(sourceId !== targetId, 'two sessions created: ' + sourceId + ' -> ' + targetId);

  async function transcript(sessionId) {
    const res = await fetch(BASE + '/api/sessions/' + sessionId, { headers: auth });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body.messages) ? body.messages : [];
  }
  async function waitFor(fn, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const hit = await fn();
      if (hit) return hit;
      await sleep(700);
    }
    throw new Error('timeout waiting for ' + label);
  }

  const allFrames = [];
  const ws = new WebSocket('ws://127.0.0.1:3456/ws/' + sourceId + '?token=' + token);
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    allFrames.push(msg);
    // send_to_session is a mutating tool: auto-approve like a user clicking Allow.
    if (msg.type === 'permission_request') {
      ws.send(JSON.stringify({ type: 'permission_response', requestId: msg.requestId, decision: 'allow' }));
    }
  });
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  async function sendPrompt(prompt, timeoutMs) {
    const start = allFrames.length;
    ws.send(JSON.stringify({ type: 'prompt', sessionId: sourceId, prompt }));
    const done = await waitFor(
      () => allFrames.slice(start).find((f) => f.type === 'done' || (f.type === 'error' && f.code !== 'queued')),
      timeoutMs,
      'run end',
    );
    return { frames: allFrames.slice(start), end: done };
  }

  // ---- round 1: deliver a marker to the idle target session ----
  const round1 = await sendPrompt(
    'Sadece şu aracı çağır: send_to_session. Parametreler: sessionId="' +
      targetId +
      '", message="' +
      MARK +
      '". Tool sonucunu tek satırda özetle, başka hiçbir şey yapma.',
    240000,
  );
  const r1Tools = round1.frames.filter((f) => f.type === 'tool_start' && f.tool === 'send_to_session');
  const r1Results = round1.frames.filter((f) => f.type === 'tool_result');
  check(r1Tools.length === 1, 'round 1: the source agent called send_to_session once');
  const r1Ok = r1Results.find((r) => r.isError === false && JSON.stringify(r.result).includes(targetId));
  check(Boolean(r1Ok), 'round 1: tool result is ok and names the target session');
  const r1Ui = round1.frames.find((f) => f.type === 'ui_action' && f.action === 'send_to_session');
  check(Boolean(r1Ui) && r1Ui.targetSessionId === targetId, 'round 1: ui_action frame carries the target session');
  check(round1.end.type === 'done', 'round 1: source run ended cleanly (' + round1.end.type + ')');

  const targetRows = await waitFor(
    async () => {
      const rows = await transcript(targetId);
      return rows.some((m) => m.role === 'user' && m.content === MARK) ? rows : null;
    },
    30000,
    'the marker row in the target transcript',
  );
  check(targetRows.length > 0, 'target transcript has the delivered user row');
  const assistantRow = await waitFor(
    async () => {
      const rows = await transcript(targetId);
      const idx = rows.findIndex((m) => m.role === 'user' && m.content === MARK);
      const after = idx >= 0 ? rows.slice(idx + 1) : [];
      return after.some((m) => m.role === 'assistant' && String(m.content).trim().length > 0) ? rows : null;
    },
    240000,
    'the target session to RUN the delivered message (assistant row, no client attached)',
  );
  const idx = assistantRow.findIndex((m) => m.role === 'user' && m.content === MARK);
  const reply = assistantRow.slice(idx + 1).find((m) => m.role === 'assistant');
  check(Boolean(reply) && String(reply.content).trim().length > 0, 'target ran the message with no client attached: ' + String(reply.content).slice(0, 80).replace(/\n/g, ' '));

  // ---- round 2: unknown target must fail honestly ----
  const round2 = await sendPrompt(
    'Şimdi send_to_session aracını sessionId="sess_bogus147" ve message="merhaba" ile çağır; dönen hatayı tek satırda yaz.',
    240000,
  );
  const bogus = round2.frames.filter((f) => f.type === 'tool_result' && f.isError === true && JSON.stringify(f.result).includes('session_not_found'));
  check(bogus.length === 1, 'round 2: unknown target -> isError tool_result with session_not_found');
  check(round2.end.type === 'done', 'round 2: source run ended cleanly (' + round2.end.type + ')');

  ws.close();
  console.log('\nsend_to_session probe: ' + passed + ' checks passed for ' + MARK);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
