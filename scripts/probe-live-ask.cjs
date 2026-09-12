/**
 * Live ask-the-user probe (REQ-134).
 *
 * Drives the DEPLOYED server over a real WebSocket with the two `<ask>` shapes
 * models actually emit:
 *
 *   1. the older closed block        `<ask question="Q?">a|b</ask>`
 *   2. the shape from the screenshot `<ask question="Q?" choices="a|b|c">`
 *      (no body, no closing tag)
 *
 * For each: the turn must pause on an `ask_user_question` frame, the raw
 * markup must NOT leak into the chat text, and answering with `ask_response`
 * must let the run finish.
 *
 * Run: `NODE_PATH=/root/test-hermes/node_modules node scripts/probe-live-ask.cjs`
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

/**
 * Send one prompt, answer every question frame it raises, wait for `done`.
 * Resolves with every frame seen plus the questions that arrived.
 */
function runAskTurn(sessionId, token, prompt, answerText) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:3456/ws/${sessionId}?token=${token}`);
    const frames = [];
    const asks = [];
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`timeout (asks=${asks.length}, last="${asks.length ? asks[asks.length - 1].question : '-'}")`));
    }, 300_000);
    const finish = () => {
      clearTimeout(timer);
      ws.close();
      resolve({ frames, asks });
    };
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'prompt', sessionId, prompt }));
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
        reject(new Error(`server error: ${JSON.stringify(msg).slice(0, 300)}`));
        return;
      }
      if (msg.type === 'ask_user_question') {
        asks.push(msg);
        // A model that re-asks after an answer must not wedge the probe.
        if (asks.length <= 4) {
          ws.send(JSON.stringify({ type: 'ask_response', requestId: msg.requestId, answer: answerText }));
        }
        return;
      }
      if (msg.type === 'done' || msg.type === 'run_end') finish();
    });
    ws.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function chatText(frames) {
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

  const cwd = mkdtempSync(join(tmpdir(), 'lokma-ask-'));
  writeFileSync(join(cwd, 'note.txt'), 'ask probe workspace\n');

  const created = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cwd }),
  });
  check(created.status === 200 || created.status === 201, `session created (HTTP ${created.status})`);
  const session = await created.json();
  const sessionId = session.id ?? session.sessionId;
  check(typeof sessionId === 'string' && sessionId.length > 0, 'session id returned');

  // 1. The screenshot shape: choices on the attribute, no body, no closing tag.
  const dangling = await runAskTurn(
    sessionId,
    token,
    'Ask me ONE blocking question using the <ask> tag with `question` and `choices` attributes and NO closing tag — ' +
      'exactly like this shape: <ask question="Nereden devam edelim?" choices="sayfayı iyileştir|metinleri düzelt|özellik ekle"> ' +
      'Put all three choices on the choices attribute, separated by |. After I answer, reply with ONLY the word ASK-OK.',
    'sayfayı iyileştir',
  );
  const q1 = dangling.asks[0];
  check(!!q1, 'unclosed attribute ask became a real question frame');
  check(q1 && q1.question.length > 5, `question text arrived (got "${q1 ? q1.question : '-'}")`);
  check(
    q1 && Array.isArray(q1.choices) && q1.choices.length >= 2 && !q1.choices.some((c) => c.includes('|')),
    `choices survived the attribute parse (got ${q1 ? JSON.stringify(q1.choices) : '-'})`,
  );
  check(!chatText(dangling.frames).includes('<ask'), 'raw <ask> markup never reached the chat text');
  check(
    dangling.frames.some((f) => f.type === 'done' || f.type === 'run_end'),
    'the run finished after the answer was sent',
  );

  // 2. The older closed block still works (regression).
  const closed = await runAskTurn(
    sessionId,
    token,
    'Ask me ONE blocking question, verbatim: <ask question="Devam?">evet|hayır</ask> ' +
      'After I answer, reply with ONLY the word ASK2-OK.',
    'evet',
  );
  const q2 = closed.asks[0];
  check(!!q2, 'closed <ask> block still becomes a question frame');
  check(
    q2 && q2.choices && q2.choices.length >= 2 && !q2.choices.some((c) => c.includes('|')),
    `closed-block choices intact (got ${q2 ? JSON.stringify(q2.choices) : '-'})`,
  );
  check(!chatText(closed.frames).includes('<ask'), 'closed block markup never reached the chat text');

  console.log(`\nlive ask probe: ${passed} checks passed`);
  process.exit(0);
})().catch((err) => {
  console.error(`PROBE FAILED: ${err.message}`);
  process.exit(1);
});
