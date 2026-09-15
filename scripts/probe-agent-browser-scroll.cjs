/**
 * Live E2E probe (REQ-154) — the DEPLOYED server's agent drives the browser
 * engine: "aşağı scroll et" becomes real browser_scroll calls and the answer
 * carries the real scroll position.
 *
 * Run from the repo root: `node scripts/probe-agent-browser-scroll.cjs [model]`
 * (needs ./node_modules/ws — same requirement as probe-live-server.cjs).
 */
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const WebSocket = require('ws');

const BASE = 'http://127.0.0.1:3456';
const MODEL = process.argv[2] ?? 'commandcode/deepseek/deepseek-v4.1-flash';

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

  const cwd = mkdtempSync(join(tmpdir(), 'lokma-browser-agent-'));
  const created = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cwd, model: MODEL }),
  });
  check(created.status === 200 || created.status === 201, `session created over REST (HTTP ${created.status})`);
  const session = await created.json();
  const sessionId = session.id ?? session.sessionId;

  const frames = [];
  const ws = new WebSocket(`ws://127.0.0.1:3456/ws/${sessionId}?token=${token}`);
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for run end')), 240_000);
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'prompt',
          sessionId,
          model: MODEL,
          prompt:
            'Once open_browser aracıyla https://en.wikipedia.org/wiki/Web_browser adresini tarayıcı panelinde aç. ' +
            'Sonra browser_scroll aracını direction=down ile İKİ kez çağır. ' +
            'Son yanıtında ikinci kaydırma sonrasındaki scrollY sayısını yaz. Başka araç kullanma.',
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
  const toolStarts = frames.filter((f) => f.type === 'tool_start');
  const toolResults = frames.filter((f) => f.type === 'tool_result');
  const text = frames.filter((f) => f.type === 'text_delta').map((f) => f.delta).join('');
  const names = toolStarts.map((t) => t.tool);

  console.log(`frames: ${JSON.stringify([...new Set(frames.map((f) => f.type))])}`);
  console.log(`tools: ${names.join(', ') || '(none)'}`);
  console.log(`answer: ${text.slice(0, 300).replace(/\n/g, ' ')}`);

  check(names.includes('open_browser'), 'agent opened the page in the browser pane');
  check(names.filter((n) => n === 'browser_scroll').length >= 2, 'agent called browser_scroll twice');
  console.log(`sample tool_result: ${JSON.stringify(toolResults[0] ?? null).slice(0, 260)}`);
  const scrollCallIds = toolStarts.filter((t) => t.tool === 'browser_scroll').map((t) => t.callId);
  const scrollResults = toolResults.filter((r) => scrollCallIds.includes(r.callId));
  const okScroll = scrollResults.filter((r) => r.isError !== true);
  check(scrollResults.length >= 2 && okScroll.length >= 2, 'both browser_scroll calls produced error-free results');
  check(okScroll.some((r) => /scrollY/.test(JSON.stringify(r.result ?? ''))), 'a browser_scroll result carries the real scrollY payload');
  check(/\d{2,}/.test(text), 'the answer carries a scroll position number');
  check(end.type !== 'error', `run ended cleanly (${end.type})`);

  ws.close();
  console.log(`\nagent browser-scroll probe: ${passed} checks passed on ${MODEL}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
