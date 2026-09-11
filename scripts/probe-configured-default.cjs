/**
 * Configured-default probe (REQ-128 follow-up).
 *
 * `probe-live-server.cjs` always passes an explicit `model`, so it can never
 * prove that the *deployed server's own default* — the one a real user gets
 * when they just start typing — is a working model. This probe omits `model`
 * entirely and asserts a full native tool round-trip still happens.
 *
 * Run: `NODE_PATH=/root/test-hermes/node_modules node scripts/probe-configured-default.cjs`
 * No API key is read here: the token is minted locally by the harness itself.
 */
const WebSocket = require('ws');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const BASE = 'http://127.0.0.1:3456';
const SECRET = 'BANANA-42';

let passed = 0;
function check(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

(async () => {
  const token = execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .pop();

  const cfgRes = await fetch(`${BASE}/api/config`, { headers: { Authorization: `Bearer ${token}` } });
  const cfgBody = await cfgRes.json();
  const configured = cfgBody.defaultModel ?? cfgBody.config?.defaultModel;
  console.log(`configured default: ${configured}`);
  check(typeof configured === 'string' && configured.length > 0, 'the server exposes a configured default model');

  const cwd = mkdtempSync(join(tmpdir(), 'lokma-configured-default-'));
  writeFileSync(join(cwd, 'hello.txt'), `the secret word is ${SECRET}\n`);

  const created = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cwd }), // deliberately NO model -> server default applies
  });
  check(created.status === 200 || created.status === 201, `session created without an explicit model (HTTP ${created.status})`);
  const session = await created.json();
  const sessionId = session.id ?? session.sessionId;
  check(typeof sessionId === 'string' && sessionId.length > 0, 'session id returned');

  const frames = [];
  const retries = [];
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:3456/ws/${sessionId}?token=${token}`);
    const timer = setTimeout(() => reject(new Error('timeout waiting for done')), 300_000);
    ws.on('open', () =>
      ws.send(
        JSON.stringify({
          type: 'prompt',
          sessionId,
          prompt: 'Use your read_file tool to read hello.txt, then reply with ONLY the secret word. Do not guess.',
        }),
      ),
    );
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      frames.push(msg);
      if (msg.type === 'retry_notice') retries.push(String(msg.message ?? ''));
      if (msg.type === 'error') {
        clearTimeout(timer);
        reject(new Error(`server error: ${JSON.stringify(msg).slice(0, 300)}`));
      } else if (msg.type === 'done' || msg.type === 'run_end') {
        clearTimeout(timer);
        resolve(msg);
      }
    });
    ws.on('error', reject);
  });

  const text = frames
    .filter((f) => f.type === 'text_delta' || f.type === 'text')
    .map((f) => f.text ?? f.delta ?? '')
    .join('');
  const toolStarts = frames.filter((f) => f.type === 'tool_start').length;
  const toolErrored = frames.some((f) => f.type === 'tool_result' && f.error);

  check(toolStarts >= 1, `the configured default actually called a tool (tool_start x${toolStarts})`);
  check(retries.length === 0, `the turn needed no retries (retry_notice x${retries.length}${retries[0] ? `: ${retries[0].slice(0, 120)}` : ''})`);
  check(!toolErrored, 'the tool result came back without error');
  check(text.includes(SECRET), 'the answer contains the real file contents');
  check(!/<tool>|<\/tool>|tool_call/.test(text), 'no tool markup leaked into the visible answer');

  console.log(`frames: ${[...new Set(frames.map((f) => f.type))].join(',')}`);
  console.log(`configured-default probe: ${passed} checks passed on ${configured}`);
  process.exit(0);
})().catch((err) => {
  console.error(`PROBE FAILED: ${err.message}`);
  process.exit(1);
});
