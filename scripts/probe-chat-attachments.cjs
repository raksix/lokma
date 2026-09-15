/**
 * Live E2E probe (REQ-155) — the agent sends files to the chat.
 *
 * Deployed server + real model. One run must:
 *   1. open https://fermag.com.tr and take a screenshot — the PNG lands inside
 *      the SESSION workspace and an image attachment row appears in the
 *      transcript (what the chat renders inline),
 *   2. send_file hello.txt — a text attachment row appears.
 * Plus: /api/files/raw serves the PNG as image/png (the chat's render path).
 *
 * Run from the repo root: `node scripts/probe-chat-attachments.cjs`
 */
const { mkdtempSync, writeFileSync, existsSync, readFileSync } = require('node:fs');
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

  const cwd = mkdtempSync(join(tmpdir(), 'lokma-chat-attach-'));
  writeFileSync(join(cwd, 'hello.txt'), 'merhaba sohbet eki\n');

  const created = await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cwd, model: MODEL }),
  });
  check(created.status === 200 || created.status === 201, `session created over REST (HTTP ${created.status})`);
  const session = await created.json();
  const sessionId = session.id ?? session.sessionId;
  console.log(`sessionId: ${sessionId}`);

  const frames = [];
  const ws = new WebSocket(`ws://127.0.0.1:3456/ws/${sessionId}?token=${token}`);
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for run end')), 300_000);
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'prompt',
          sessionId,
          model: MODEL,
          prompt:
            'Once open_browser aracıyla https://fermag.com.tr adresini aç. ' +
            'Sonra browser_screenshot aracını çağır (ekran görüntüsü). ' +
            'Ardından send_file aracıyla hello.txt dosyasını sohbete gönder. ' +
            'Son olarak kısaca ne yaptığını yaz.',
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
  const names = frames.filter((f) => f.type === 'tool_start').map((t) => t.tool);
  console.log(`tools: ${names.join(', ') || '(none)'}`);
  check(names.includes('browser_screenshot'), 'agent took a screenshot');
  check(names.includes('send_file'), 'agent called send_file');

  const detail = await (
    await fetch(`${BASE}/api/sessions/${sessionId}?cwd=${encodeURIComponent(cwd)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  const rows = detail.messages ?? [];
  const attachmentRows = rows.filter((r) => Array.isArray(r.attachments) && r.attachments.length > 0);
  console.log(`attachment rows: ${attachmentRows.length}`);
  const attachments = attachmentRows.flatMap((r) => r.attachments);
  const png = attachments.find((a) => a.mime === 'image/png');
  const txt = attachments.find((a) => a.path === 'hello.txt');
  check(Boolean(png), 'screenshot attachment row landed in the transcript');
  check(Boolean(txt) && txt.mime === 'text/plain', 'send_file attachment row landed');
  if (!png || !txt) throw new Error('missing attachments');

  check(png.path.startsWith('.lokma/browser-shots/'), `screenshot path is workspace-relative (${png.path})`);
  check(existsSync(join(cwd, png.path)), `screenshot file lives INSIDE the session workspace (${cwd})`);
  const head = readFileSync(join(cwd, png.path)).subarray(0, 8);
  check(head[0] === 0x89 && head[1] === 0x50, 'the delivered PNG is a real image');

  const raw = await fetch(
    `${BASE}/api/files/raw?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(png.path)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  check(raw.status === 200, `raw endpoint serves the PNG (HTTP ${raw.status})`);
  check(String(raw.headers.get('content-type') || '').includes('image/png'), 'raw content-type is image/png');

  check(end.type !== 'error', `run ended cleanly (${end.type})`);
  ws.close();
  console.log(`\nchat-attachments probe: ${passed} checks passed.`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
