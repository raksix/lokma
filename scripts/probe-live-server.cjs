/**
 * Deployed-server E2E probe (REQ-128): drives the LIVE lokma server over its
 * real HTTP + WS API with a real model and a real workspace, proving the
 * deployed build (not just the source) calls tools natively.
 *
 * Run from the repo root (needs ./node_modules/ws):
 *   node scripts/probe-live-server.cjs [provider/model]
 */
const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const WebSocket = require('ws');

const BASE = 'http://127.0.0.1:3456';
const MODEL = process.argv[2] ?? 'omniroute/auto/best-free';
const SECRET = 'BANANA-42';

let passed = 0;
function check(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

(async () => {
  const token = execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
    cwd: __dirname + '/..',
    encoding: 'utf8',
  }).trim().split('\n').pop();

  const cwd = mkdtempSync(join(tmpdir(), 'lokma-live-server-'));
  writeFileSync(join(cwd, 'hello.txt'), `the secret word is ${SECRET}\n`);

  const created = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cwd, model: MODEL }),
  });
  check(created.status === 200 || created.status === 201, `session created over REST (HTTP ${created.status})`);
  const session = await created.json();
  const sessionId = session.id ?? session.sessionId;
  check(typeof sessionId === 'string' && sessionId.length > 0, 'session id returned');

  const frames = [];
  const ws = new WebSocket(`ws://127.0.0.1:3456/ws/${sessionId}?token=${token}`);
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for run_end/done')), 180_000);
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'prompt',
          sessionId,
          model: MODEL,
          prompt: 'Use your read_file tool to read hello.txt, then reply with ONLY the secret word. Do not guess.',
        }),
      );
    });
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      frames.push(msg);
      if (msg.type === 'done' || msg.type === 'run_end' || msg.type === 'error') {
        clearTimeout(timer);
        resolve(msg);
      }
      if (msg.type === 'permission_request') {
        ws.send(JSON.stringify({ type: 'permission_response', requestId: msg.requestId, decision: 'allow' }));
      }
    });
    ws.on('error', reject);
  });

  const end = await done;
  const types = frames.map((f) => f.type);
  const toolStarts = frames.filter((f) => f.type === 'tool_start');
  const toolResults = frames.filter((f) => f.type === 'tool_result');
  const text = frames.filter((f) => f.type === 'text_delta').map((f) => f.delta).join('');

  console.log(`frames: ${JSON.stringify([...new Set(types)])}`);
  console.log(`tools: ${toolStarts.map((t) => t.tool).join(', ') || '(none)'}`);
  console.log(`answer: ${text.slice(0, 200).replace(/\n/g, ' ')}`);

  check(toolStarts.some((t) => t.tool === 'read_file'), 'deployed server ran the read_file tool');
  check(toolResults.some((r) => r.isError === false), 'the tool result came back without error');
  check(text.includes(SECRET), `the answer contains the real file contents (${SECRET})`);
  check(!text.includes('<tool_result'), 'no tool markup leaked into the visible answer');
  check(end.type !== 'error', `run ended cleanly (${end.type})`);

  ws.close();
  console.log(`\ndeployed-server probe: ${passed} checks passed on ${MODEL}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
