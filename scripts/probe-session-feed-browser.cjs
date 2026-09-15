/**
 * Live browser probe for REQ-149 — the sidebar's 4 s REST list poll must stay
 * OFF while a harness socket is open, and come back when there is none.
 *
 * Two arms on the SAME page/session:
 *   arm 1 — socket allowed: expect the WS to open, the list to arrive as a
 *           `sessions` WS frame, and ZERO `GET /api/sessions` polls in the
 *           measuring window (target: 0, was ~3 per 12 s before REQ-149).
 *   arm 2 — socket refused at the page level (routeWebSocket closes every
 *           attempt): expect the 4 s poll to tick again, proving arm 1's zero
 *           is the gate working and not a dead poll.
 *
 * Basic-auth creds are read at runtime from /root/.lokma-basic-auth and the
 * bearer token is minted from the live auth DB — neither is ever printed.
 *
 * Run from the repo root:
 *   NODE_PATH=/root/test-hermes/node_modules node scripts/probe-session-feed-browser.cjs
 */
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { chromium } = require('playwright-core');

const APP = 'http://127.0.0.1:3457';
const API = 'http://127.0.0.1:3456';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const WINDOW_MS = 15000;

let passed = 0;
function check(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

(async () => {
  const raw = readFileSync('/root/.lokma-basic-auth', 'utf8').trim();
  const idx = raw.indexOf(':');
  const httpCredentials = { username: raw.slice(0, idx), password: raw.slice(idx + 1) };

  const token = execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
    cwd: __dirname + '/..',
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .pop();
  const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  const created = await fetch(API + '/api/sessions', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ cwd: '/mnt/apopic/lokma' }),
  });
  if (!(created.status === 200 || created.status === 201)) throw new Error('session create HTTP ' + created.status);
  const sessionId = (await created.json()).id;
  console.log('session: ' + sessionId);

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

  async function runArm(label, { blockSocket }) {
    const ctx = await browser.newContext({ httpCredentials, viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(
      ([t, s]) => {
        localStorage.setItem('lokma-token', t);
        localStorage.setItem('lokma:sessionId', s);
      },
      [token, sessionId],
    );
    const page = await ctx.newPage();
    const listPolls = [];
    const wsOpened = [];
    const wsFrameTypes = [];
    page.on('request', (r) => {
      try {
        const u = new URL(r.url());
        if (u.port === '3457' && r.method() === 'GET' && u.pathname === '/api/sessions') listPolls.push(Date.now());
      } catch {
        /* non-URL request */
      }
    });
    page.on('websocket', (ws) => {
      wsOpened.push(ws.url());
      ws.on('framereceived', (f) => {
        try {
          wsFrameTypes.push(JSON.parse(String(f.payload)).type);
        } catch {
          /* non-JSON frame */
        }
      });
    });
    if (blockSocket) {
      // Every socket attempt is refused, so the client's open-socket counter
      // stays 0 and the fallback poll is expected to resume.
      await page.routeWebSocket('**/ws/**', (ws) => {
        ws.close();
      });
    }
    await page.goto(APP + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000); // boot: auth check + first list load + socket attempt
    const pollsBefore = listPolls.length;
    await page.waitForTimeout(WINDOW_MS);
    const pollsDuring = listPolls.length - pollsBefore;
    const out = {
      label,
      pollsBefore,
      pollsDuring,
      wsUrls: wsOpened,
      wsFrameTypes,
    };
    await ctx.close();
    return out;
  }

  // ---- arm 1: socket allowed ----
  const arm1 = await runArm('socket-open', { blockSocket: false });
  check(arm1.wsUrls.length >= 1, 'arm 1: the client opened a harness socket (' + arm1.wsUrls.join(', ') + ')');
  check(
    arm1.wsFrameTypes.includes('sessions'),
    'arm 1: the session list arrived over WS (frames: ' + arm1.wsFrameTypes.join(',') + ')',
  );
  check(
    arm1.pollsDuring === 0,
    'arm 1: 0 REST list polls in ' + WINDOW_MS / 1000 + ' s with the socket open (target 0; was ~' +
      Math.floor(WINDOW_MS / 4000) + ' before REQ-149)',
  );

  // ---- arm 2: socket blocked (negative control) ----
  const arm2 = await runArm('socket-refused', { blockSocket: true });
  check(
    arm2.pollsDuring >= 2,
    'arm 2: the 4 s poll is alive when the socket is refused (' + arm2.pollsDuring + ' polls in ' + WINDOW_MS / 1000 +
      ' s; ' + arm2.wsUrls.length + ' socket attempt(s) refused)',
  );

  console.log('\nbrowser feed probe: ' + passed + ' checks passed');
  await fetch(API + '/api/sessions/' + sessionId, { method: 'DELETE', headers: auth }).catch(() => null);
  await browser.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
