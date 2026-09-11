/**
 * Live thinking-budget probe (REQ-133).
 *
 * The composer now sends a `reasoningEffort` level with every prompt; this
 * probe drives the DEPLOYED server over a real WebSocket to prove the field
 * is accepted end-to-end: a full turn finishes with no error frame, and the
 * same session still answers when the level is `off` (regression guard).
 * Whether the model actually streams reasoning is reported, not asserted —
 * that depends on the upstream, not on the harness.
 *
 * Run: `NODE_PATH=/root/test-hermes/node_modules node scripts/probe-live-thinking.cjs`
 * No API key is read here: the token is minted locally by the harness itself.
 */
const WebSocket = require('ws');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const BASE = 'http://127.0.0.1:3456';

let passed = 0;
function check(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

/** Send one prompt with a given thinking level and settle on done/error. */
function runTurn(sessionId, token, prompt, reasoningEffort) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:3456/ws/${sessionId}?token=${token}`);
    const frames = [];
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`timeout waiting for done (level=${reasoningEffort})`));
    }, 300_000);
    ws.on('open', () => {
      const msg = { type: 'prompt', sessionId, prompt };
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
        reject(new Error(`server error (level=${reasoningEffort}): ${JSON.stringify(msg).slice(0, 300)}`));
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

  const cfgRes = await fetch(`${BASE}/api/config`, { headers: { Authorization: `Bearer ${token}` } });
  const cfgBody = await cfgRes.json();
  const configured = cfgBody.defaultModel ?? cfgBody.config?.defaultModel;
  console.log(`configured default: ${configured}`);

  const cwd = mkdtempSync(join(tmpdir(), 'lokma-thinking-'));
  writeFileSync(join(cwd, 'note.txt'), 'the harness reads this file fine\n');

  const created = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cwd }),
  });
  check(created.status === 200 || created.status === 201, `session created (HTTP ${created.status})`);
  const session = await created.json();
  const sessionId = session.id ?? session.sessionId;
  check(typeof sessionId === 'string' && sessionId.length > 0, 'session id returned');

  // 1. The level the composer sends must not break a real turn.
  const highFrames = await runTurn(
    sessionId,
    token,
    'Reply with ONLY the word THINKING-OK. No tools, no explanation.',
    'high',
  );
  const highText = answerOf(highFrames);
  const highThinking = highFrames.filter((f) => f.type === 'thinking_delta').length;
  check(highText.includes('THINKING-OK'), `a high-budget turn still answers (got "${highText.trim().slice(0, 60)}")`);
  check(!highFrames.some((f) => f.type === 'error'), 'no error frame on the high-budget turn');
  console.log(`info: thinking_delta frames on the high-budget turn: ${highThinking}`);

  // 2. Regression: the default (`off`) path is untouched.
  const offFrames = await runTurn(
    sessionId,
    token,
    'Reply with ONLY the word PLAIN-OK. No tools, no explanation.',
    'off',
  );
  const offText = answerOf(offFrames);
  check(offText.includes('PLAIN-OK'), `an off-budget turn still answers (got "${offText.trim().slice(0, 60)}")`);
  check(!offFrames.some((f) => f.type === 'error'), 'no error frame on the off-budget turn');

  // 3. A tool round-trip still works with thinking on (the two features
  //    share the same request body, so this is where a clash would show).
  const toolFrames = await runTurn(
    sessionId,
    token,
    'Use your read_file tool to read note.txt, then reply with ONLY the file contents.',
    'medium',
  );
  const toolStarts = toolFrames.filter((f) => f.type === 'tool_start').length;
  const toolText = answerOf(toolFrames);
  check(toolStarts >= 1, `a thinking turn still calls tools (tool_start x${toolStarts})`);
  check(toolText.includes('harness reads this file fine'), 'the tool result reached the answer');

  console.log(`frames(high): ${[...new Set(highFrames.map((f) => f.type))].join(',')}`);
  console.log(`live thinking probe: ${passed} checks passed (model: ${configured})`);
  process.exit(0);
})().catch((err) => {
  console.error(`PROBE FAILED: ${err.message}`);
  process.exit(1);
});
