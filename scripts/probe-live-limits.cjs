/**
 * Live turn-budget probe (REQ-136).
 *
 * Proves the two halves of the "my work keeps getting cut off" report:
 *
 *   1. `config.loop.maxTurns` is honoured by the deployed server — with a low
 *      budget the run pauses with a `turn_limit` frame instead of dying with a
 *      generic error.
 *   2. Saying "continue" really picks the work back up in the same session.
 *
 * Run: `NODE_PATH=/root/test-hermes/node_modules node scripts/probe-live-limits.cjs <expectedMaxTurns>`
 * No API key is read here: the token is minted locally by the harness itself.
 */
const WebSocket = require('ws');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const BASE = 'http://127.0.0.1:3456';
const EXPECTED = Number(process.argv[2] || '0');

let passed = 0;
function check(cond, label) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

/** One prompt; resolves once the run ends (done or error). */
function runTurn(sessionId, token, prompt) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:3456/ws/${sessionId}?token=${token}`);
    const frames = [];
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('timeout waiting for run end'));
    }, 420_000);
    const finish = () => {
      clearTimeout(timer);
      ws.close();
      resolve(frames);
    };
    ws.on('open', () => ws.send(JSON.stringify({ type: 'prompt', sessionId, prompt })));
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      frames.push(msg);
      if (msg.type === 'done') finish();
      if (msg.type === 'error') finish();
    });
    ws.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function toolStarts(frames) {
  return frames.filter((f) => f.type === 'tool_start').length;
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
  const cfg = cfgBody.config ?? cfgBody;
  const liveMax = cfg?.loop?.maxTurns;
  console.log(`info: server reports loop.maxTurns=${liveMax}`);
  if (EXPECTED > 0) {
    check(liveMax === EXPECTED, `the server honours the configured budget (expected ${EXPECTED}, got ${liveMax})`);
  }

  // A workspace where one turn must be a write (read-only calls batch together,
  // so a read/read/read plan would finish in a single turn).
  const cwd = mkdtempSync(join(tmpdir(), 'lokma-limits-'));
  writeFileSync(join(cwd, 'note.txt'), 'first\n');

  const created = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cwd }),
  });
  const session = await created.json();
  const sessionId = session.id ?? session.sessionId;
  check(typeof sessionId === 'string' && sessionId.length > 0, 'session created');

  // Step-by-step work: read → write → read → write → read. Far more turns than
  // a 2-turn budget, so the run must pause mid-flight.
  const work =
    'Do this strictly step by step, one tool call per turn, never in parallel:\n' +
    '1. read_file note.txt\n' +
    '2. write_file note.txt with the content "second"\n' +
    '3. read_file note.txt\n' +
    '4. write_file note.txt with the content "third"\n' +
    '5. read_file note.txt\n' +
    'Then reply with ONLY the final file content.';

  const paused = await runTurn(sessionId, token, work);
  const limitErr = paused.find((f) => f.type === 'error' && f.code === 'turn_limit');
  const tools = toolStarts(paused);
  console.log(`info: turns used before the pause = ${tools}`);
  check(!!limitErr, 'the run paused with code turn_limit');
  check(
    typeof limitErr?.message === 'string' && /continue/i.test(limitErr.message),
    `the pause message tells the user how to resume (got "${limitErr ? limitErr.message.slice(0, 90) : '-'}")`,
  );

  // Resume in the same session. Each run gets its own budget, so a second
  // pause is a valid, honest end — what must NOT happen is a generic error.
  const resumed = await runTurn(sessionId, token, 'continue');
  const resumedTools = toolStarts(resumed);
  const resumedDone = resumed.some((f) => f.type === 'done');
  const resumedPaused = resumed.some((f) => f.type === 'error' && f.code === 'turn_limit');
  const resumedFailed = resumed.some((f) => f.type === 'error' && f.code !== 'turn_limit');
  console.log(`info: resume used ${resumedTools} more tool turns (done=${resumedDone}, paused=${resumedPaused})`);
  check(resumedTools >= 1, 'the resume did real work (tool calls happened)');
  check(resumedDone || resumedPaused, 'the resumed run ended honestly (done or another budget pause)');
  check(!resumedFailed, 'the resume hit no real error');

  console.log(`\nlive turn-budget probe: ${passed} checks passed`);
  process.exit(0);
})().catch((err) => {
  console.error(`PROBE FAILED: ${err.message}`);
  process.exit(1);
});
