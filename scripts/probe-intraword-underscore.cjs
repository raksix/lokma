#!/usr/bin/env node
/**
 * REQ-184 live probe — intraword underscores survive the inline markdown pass.
 *
 * The server writes `Session <id> created` into a fresh session transcript
 * (routes/sessions.ts, POST /api/sessions). Session ids carry two underscores
 * (`sess_<a>_<b>`), so this marker is exactly the class the inline renderer
 * used to flatten (`sess_a_b` -> `sessab`, measured live in REQ-182). This
 * probe drives the DEPLOYED web bundle in a real browser with zero model
 * calls:
 *
 *   1. create a session over REST (server appends the marker; read the disk
 *      side back through GET /api/sessions/:id),
 *   2. open the app with the minted token + that session seeded,
 *   3. assert the chat renders the marker EXACTLY (underscores intact) and
 *      never the flat form,
 *   4. clean up (DELETE + bounded stays-gone re-check including the disk
 *      file, temp dir removed) and re-assert the login gate (tokenless
 *      /api/auth/me must answer 401).
 *
 * Usage:
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node scripts/probe-intraword-underscore.cjs
 *
 * Flags: --url <web-base> --server <api-base> --token <bearer>
 */
const { mkdtempSync, rmSync, existsSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright-core');

const NL = String.fromCharCode(10);
const readFlag = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const WEB = readFlag('url', 'http://127.0.0.1:3457');
const SERVER = readFlag('server', 'http://127.0.0.1:3456');
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

let TOKEN = readFlag('token', '');
let passed = 0;
const failures = [];

function check(cond, label, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS: ' + label);
  } else {
    failures.push(label);
    console.log('FAIL: ' + label + (detail ? '  - ' + detail : ''));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mintToken() {
  return execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
  })
    .trim()
    .split(NL)
    .pop();
}

async function api(path, opts) {
  const o = opts || {};
  const headers = { Authorization: 'Bearer ' + TOKEN };
  if (o.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(SERVER + path, {
    method: o.method || 'GET',
    headers: headers,
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = null;
  }
  return { status: res.status, json: json, text: text };
}

/** Does the on-disk transcript for this id still exist under ~/.lokma? */
function diskHasSession(id) {
  const base = join(process.env.HOME || '/root', '.lokma', 'projects');
  let dirs = [];
  try {
    dirs = readdirSync(base);
  } catch (e) {
    return false;
  }
  for (const d of dirs) {
    if (existsSync(join(base, d, 'sessions', id + '.jsonl'))) return true;
  }
  return false;
}

(async () => {
  if (!TOKEN) TOKEN = mintToken();

  const cwd = mkdtempSync(join(tmpdir(), 'lokma-req184-sess-'));
  console.log('session cwd: ' + cwd);

  const created = await api('/api/sessions', { method: 'POST', body: { cwd: cwd } });
  check(created.status === 200 || created.status === 201, 'probe session created over REST (HTTP ' + created.status + ')');
  const SESSION = (created.json || {}).id || '';
  if (!SESSION) {
    console.log('cannot proceed without a session id');
    process.exit(1);
  }
  console.log('sessionId: ' + SESSION);

  const underscores = SESSION.split('_').length - 1;
  check(underscores >= 2, 'session id carries the intraword pattern (sess_a_b class, ' + underscores + ' underscores)');

  const DISK_TEXT = 'Session ' + SESSION + ' created';
  const FLAT_TEXT = 'Session ' + SESSION.split('_').join('') + ' created';

  const disk = await api('/api/sessions/' + SESSION);
  const first = ((disk.json || {}).messages || [])[0] || {};
  check(
    disk.status === 200 && String(first.content || '') === DISK_TEXT,
    'disk transcript holds the exact marker (HTTP ' + disk.status + ')',
  );

  let browser = null;
  let seen = '';
  try {
    browser = await chromium.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(
      (arg) => {
        try {
          localStorage.setItem('lokma-token', arg.token);
          localStorage.setItem('lokma:sessionId', arg.sessionId);
        } catch (e) {
          /* ignore */
        }
      },
      { token: TOKEN, sessionId: SESSION },
    );
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') pageErrors.push('console: ' + m.text().slice(0, 160));
    });
    page.on('pageerror', (e) => pageErrors.push('pageerror: ' + String(e).slice(0, 160)));

    await page.goto(WEB + '/', { waitUntil: 'domcontentloaded' });

    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      seen = await page.evaluate(() => document.body.innerText || '');
      if (seen.indexOf(DISK_TEXT) !== -1 || seen.indexOf(FLAT_TEXT) !== -1) break;
      await sleep(500);
    }
    check(seen.indexOf(DISK_TEXT) !== -1, 'chat renders the marker EXACTLY (underscores intact)');
    check(seen.indexOf(FLAT_TEXT) === -1, 'flat form (eaten underscores) is absent');
    if (seen.indexOf(DISK_TEXT) === -1) {
      console.log('DOM sample: ' + JSON.stringify(seen.slice(0, 400)));
    }
    check(pageErrors.length === 0, 'no page errors during the check', pageErrors.slice(0, 3).join(' | '));
  } finally {
    if (browser) await browser.close().catch(() => {});

    // Cleanup — bounded re-check: delete until the session stays gone (API
    // 404 AND no disk transcript), then drop the temp dir.
    for (let i = 0; i < 5; i++) {
      await api('/api/sessions/' + SESSION, { method: 'DELETE' }).catch(() => {});
      await sleep(300);
      const goneApi = await api('/api/sessions/' + SESSION).catch(() => ({ status: 0 }));
      if (goneApi.status === 404 && !diskHasSession(SESSION)) break;
    }
    rmSync(cwd, { recursive: true, force: true });
    const after = await api('/api/sessions/' + SESSION).catch(() => ({ status: 0 }));
    check(after.status === 404 && !diskHasSession(SESSION), 'session stays gone (API 404 + no disk file)');
    check(!existsSync(cwd), 'temp cwd removed');

    // The login gate must still be ON — a probe never flips it.
    const gate = await fetch(SERVER + '/api/auth/me').catch(() => ({ status: 0 }));
    check(gate.status === 401, 'tokenless /api/auth/me is 401 (login gate ON)');
  }

  console.log('');
  console.log('probe-intraword-underscore: ' + passed + ' passed, ' + failures.length + ' failed');
  if (failures.length) {
    console.log('failures: ' + failures.join(' | '));
    process.exit(1);
  }
})().catch((err) => {
  console.log('PROBE ERROR: ' + (err && err.stack ? err.stack : String(err)));
  process.exit(1);
});
