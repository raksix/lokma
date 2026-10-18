#!/usr/bin/env node
/**
 * REQ-205 slice 5 — LIVE end-to-end proof of the CLIENT-SIDE free-model path.
 *
 * The acceptance criteria of the REQ, in one browser run against the
 * DEPLOYED build (gate stays ON, a real superadmin Bearer is minted in
 * process — never written to disk):
 *
 *   (a) the request really leaves the BROWSER: network capture shows a
 *       keyless POST to https://omniroute.fermag.com.tr/v1/chat/completions
 *       with stream:true, NO authorization header, and the browser's own
 *       CORS preflight answered 204 with the site origin reflected;
 *   (b) the SSE answer streams onto the chat surface (the unique marker
 *       renders while the run is still live);
 *   (c) after a full page reload the exchange is STILL there (it was
 *       persisted through the socket: transcript_record -> acks), and the
 *       on-disk transcript rows carry origin "client-free";
 *   (d) the serialized rows prove no duplicate was recorded.
 *
 * Cleanup is unconditional: the throwaway session is deleted and the file
 * must stay gone; the probe ends by re-checking that the login gate is still
 * ON (tokenless /api/auth/me -> 401).
 *
 * Run from the repo root:
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node scripts/probe-free-e2e.cjs
 *   (LOKMA_BASE defaults to https://lokma.fermag.com.tr)
 *
 * Exit codes: 0 = all checks pass - 1 = product defect - 2 = measurement
 * impossible (no token / no session / no composer).
 */
const { chromium } = require('playwright-core');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const BASE = process.env.LOKMA_BASE || 'https://lokma.fermag.com.tr';
const ORIGIN = new URL(BASE).origin;
const OMN = 'https://omniroute.fermag.com.tr';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
const failures = [];
function check(cond, label) {
  if (cond) {
    passed += 1;
    console.log('PASS  ' + label);
  } else {
    failures.push(label);
    console.log('FAIL  ' + label);
  }
}
function noMeasure(reason) {
  console.log('NO-MEASURE: ' + reason);
  process.exit(2);
}

/** REST helper against the deployed server (Bearer only, no state). */
async function rest(method, url, token, body) {
  const headers = {};
  if (token) headers.authorization = 'Bearer ' + token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(BASE + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

/** Locate the session JSONL across project dirs (same recipe as slice 3). */
function transcriptPathFor(sessionId) {
  const root = path.join(os.homedir(), '.lokma', 'projects');
  let dirs = [];
  try {
    dirs = fs.readdirSync(root);
  } catch {
    return null;
  }
  for (const dir of dirs) {
    const p = path.join(root, dir, 'sessions', sessionId + '.jsonl');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function readRows(sessionId) {
  const p = transcriptPathFor(sessionId);
  if (!p) return null;
  return fs
    .readFileSync(p, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** The bundle the server actually serves (proves we measured the deploy). */
function diskBundleHash() {
  const html = fs.readFileSync(path.join(REPO, 'packages/lokma-web/web/dist/index.html'), 'utf-8');
  const m = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
  return m ? m[0] : null;
}
async function liveBundleHash() {
  const res = await fetch(BASE + '/', { redirect: 'follow' });
  const html = await res.text();
  const m = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
  return m ? m[0] : null;
}

(async () => {
  // ── 0. Gate + deployed build identity ───────────────────────────────────
  const diskHash = diskBundleHash();
  const liveHash = await liveBundleHash();
  check(Boolean(diskHash) && diskHash === liveHash, 'served bundle equals the disk build (' + liveHash + ')');

  let token = '';
  try {
    token = execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
      cwd: REPO,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .pop();
  } catch {
    noMeasure('token mint failed');
  }
  if (!token || token.length < 10) noMeasure('empty token');

  const me = await rest('GET', '/api/auth/me', token);
  if (me.status !== 200) noMeasure('minted token rejected by /api/auth/me (' + me.status + ')');

  const created = await rest('POST', '/api/sessions', token, {});
  if (created.status !== 200 && created.status !== 201) {
    noMeasure('session create failed status=' + created.status + ' body=' + created.text.slice(0, 140));
  }
  let sessionId = null;
  try {
    sessionId = JSON.parse(created.text).id;
  } catch {
    noMeasure('session create answered non-JSON');
  }
  if (!sessionId) noMeasure('session create answered no id');
  console.log('info: session ' + sessionId + ' | base ' + BASE);

  const MARK = 'FREEPROBE' + Date.now().toString(36).toUpperCase();
  const PROMPT = 'Sadece su metni aynen yaz ve baska hicbir sey ekleme: ' + MARK;
  console.log('info: marker ' + MARK);

  let browser = null;
  try {
    browser = await chromium.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(
      ([t, sid]) => {
        try {
          localStorage.setItem('lokma-token', t);
          localStorage.setItem('lokma:sessionId', sid);
        } catch {}
      },
      [token, sessionId],
    );
    const page = await ctx.newPage();

    // Playwright's high-level events do not surface CORS PREFLIGHT requests,
    // so the browser's own OPTIONS is captured at the CDP Network layer —
    // that is the wire evidence the REQ asks for.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    const cdpPre = [];
    cdp.on('Network.requestWillBeSent', (e) => {
      if (e.type === 'Preflight' && String(e.request && e.request.url).indexOf(OMN) === 0) {
        cdpPre.push({ url: e.request.url, phase: 'sent' });
      }
    });
    cdp.on('Network.responseReceived', (e) => {
      if (e.type === 'Preflight' && String(e.response && e.response.url).indexOf(OMN) === 0) {
        cdpPre.push({ url: e.response.url, phase: 'response', status: e.response.status, headers: e.response.headers || {} });
      }
    });

    // Wire capture: everything the BROWSER does with the free pool + the
    // session socket (transcript_record / transcript_recorded).
    const net = { modelGets: [], preflights: [], posts: [], responses: [] };
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(OMN)) return;
      if (r.method() === 'GET' && u.indexOf('/v1/models') !== -1) net.modelGets.push(u);
      if (r.method() === 'OPTIONS') net.preflights.push({ url: u, headers: r.headers() });
      if (r.method() === 'POST') net.posts.push({ url: u, headers: r.headers(), body: r.postData() || '' });
    });
    page.on('response', (r) => {
      const u = r.url();
      if (!u.startsWith(OMN)) return;
      const h = r.headers();
      net.responses.push({
        url: u,
        method: r.request().method(),
        status: r.status(),
        ct: h['content-type'] || '',
        acao: h['access-control-allow-origin'] || '',
      });
    });
    const wsLog = { sent: [], recv: [] };
    page.on('websocket', (ws) => {
      ws.on('framesent', (f) => wsLog.sent.push(String(f.payload || '')));
      ws.on('framereceived', (f) => wsLog.recv.push(String(f.payload || '')));
    });

    await page.goto(BASE + '/?token=' + encodeURIComponent(token), { waitUntil: 'domcontentloaded' });

    const TA = 'textarea[aria-label="Message Lokma"]';
    try {
      await page.waitForSelector(TA, { timeout: 30000 });
    } catch {
      // Clean up before bailing: the session exists and the browser is up.
      console.log('NO-MEASURE: composer never rendered (session seeded but no chat input)');
      try {
        await browser.close();
      } catch {}
      await rest('DELETE', '/api/sessions/' + encodeURIComponent(sessionId), token);
      process.exit(2);
    }
    // The composer unlocks once the session socket is open.
    await page
      .waitForFunction(
        (sel) => {
          const el = document.querySelector(sel);
          return Boolean(el) && !el.disabled;
        },
        TA,
        { timeout: 30000 },
      )
      .catch(() => {});
    const taReady = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return Boolean(el) && !el.disabled;
    }, TA);
    check(taReady, 'composer is enabled (session socket open)');

    const countMarker = () =>
      page.evaluate((m) => (document.body.innerText.match(new RegExp(m, 'g')) || []).length, MARK);
    check((await countMarker()) === 0, 'the marker is nowhere on screen before sending');

    // ── 1. Pick a free model from the live catalog ────────────────────────
    await page.click('#lokma-composer-model');
    let catalogRows = 0;
    for (let i = 0; i < 40; i += 1) {
      catalogRows = await page.evaluate(() => document.querySelectorAll('[data-free-model]').length);
      if (catalogRows > 0) break;
      await sleep(500);
    }
    const catalogError = await page.evaluate(() => {
      const el = document.querySelector('[data-free-catalog-error]');
      return el ? (el.innerText || '').trim() : null;
    });
    check(catalogRows > 0, 'the free catalog rendered in the picker (' + catalogRows + ' rows)');
    if (catalogError) console.log('info: catalog error box says: ' + catalogError);

    let picked = await page.evaluate(() => {
      const el = document.querySelector('[data-free-model="free-opencode"]');
      return el ? 'free-opencode' : null;
    });
    if (!picked) {
      picked = await page.evaluate(() => {
        const el = document.querySelector('[data-free-model]');
        return el ? el.getAttribute('data-free-model') : null;
      });
    }
    check(Boolean(picked), 'a canonical free model was pickable (picked ' + picked + ')');
    if (picked) {
      await page.click('[data-free-model="' + picked + '"]');
      await sleep(600);
      const badge = await page.evaluate(() => {
        const el = document.querySelector('[data-free-badge]');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { text: (el.innerText || '').trim(), w: rect.width, h: rect.height };
      });
      check(Boolean(badge) && badge.w > 0 && badge.h > 0, 'the trigger shows the free badge after picking');
    }

    check(net.modelGets.length > 0, 'the BROWSER fetched the keyless catalog (GET ' + OMN + '/v1/models)');

    // ── 2. Send the prompt through the free path ──────────────────────────
    await page.fill(TA, PROMPT);
    await page.press(TA, 'Enter');

    // The POST must leave the browser promptly.
    for (let i = 0; i < 40 && net.posts.length === 0; i += 1) await sleep(250);
    check(net.posts.length > 0, 'a keyless POST left the browser for the free pool');
    const post = net.posts[0] || null;
    if (post) {
      check(
        post.url.indexOf('/v1/chat/completions') !== -1,
        'the POST targets /v1/chat/completions (' + post.url + ')',
      );
      let body = {};
      try {
        body = JSON.parse(post.body);
      } catch {}
      check(body.stream === true, 'the request body asks for stream:true');
      check(body.model === picked, 'the request body carries the picked catalog id (' + body.model + ')');
      const headerNames = Object.keys(post.headers || {}).map((k) => k.toLowerCase());
      check(
        headerNames.indexOf('authorization') === -1 && headerNames.indexOf('x-api-key') === -1,
        'no authorization / api-key header on the free request',
      );
      check(!/sk-[A-Za-z0-9]/.test(post.body) && post.body.indexOf('Bearer') === -1, 'the request body carries no key material');
    }

    // SSE answer streams onto the screen (marker reaches the DOM while live).
    let streamed = false;
    let seen = 0;
    for (let i = 0; i < 400; i += 1) {
      seen = await countMarker();
      if (seen >= 2) {
        streamed = true;
        break;
      }
      await sleep(300);
    }
    check(streamed, 'the SSE answer streamed onto the chat surface (marker seen live, count=' + seen + ')');

    // Wire evidence for the completion + the browser's own CORS preflight.
    const okRes = net.responses.find(
      (r) => r.method === 'POST' && r.status === 200 && r.ct.indexOf('text/event-stream') !== -1,
    );
    check(Boolean(okRes), 'the completion answered 200 text/event-stream');
    const pre = cdpPre.find((p) => p.phase === 'response');
    const preAcao = pre ? String(pre.headers['access-control-allow-origin'] || pre.headers['Access-Control-Allow-Origin'] || '') : '';
    check(
      Boolean(pre) && pre.status === 204 && preAcao.indexOf(ORIGIN) !== -1,
      'the browser preflight answered 204 with the site origin reflected (' +
        (pre ? pre.status + ' ' + preAcao : 'no preflight seen') +
        ')',
    );

    // ── 3. Persistence: the socket record + its ack ───────────────────────
    let recordFrame = null;
    for (let i = 0; i < 400 && !recordFrame; i += 1) {
      recordFrame = wsLog.sent
        .map((s) => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        })
        .find((m) => m && m.type === 'transcript_record');
      if (!recordFrame) await sleep(300);
    }
    check(Boolean(recordFrame), 'the browser sent transcript_record over the session socket');
    if (recordFrame) {
      check(recordFrame.origin === 'client-free', 'the record frame declares origin client-free');
      const rows = Array.isArray(recordFrame.rows) ? recordFrame.rows : [];
      check(rows.length >= 2, 'the record carries the run rows (' + rows.length + ')');
      check(
        rows.some((r) => r.role === 'user' && String(r.content).indexOf(MARK) !== -1) &&
          rows.some((r) => r.role === 'assistant' && String(r.content).indexOf(MARK) !== -1),
        'the record rows hold the prompt AND the answer',
      );
    }
    let ack = null;
    for (let i = 0; i < 400 && !ack; i += 1) {
      ack = wsLog.recv
        .map((s) => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        })
        .find((m) => m && m.type === 'transcript_recorded');
      if (!ack) await sleep(300);
    }
    check(Boolean(ack) && Number(ack.count) >= 2, 'the server acked the record (count=' + (ack ? ack.count : 'none') + ')');

    // Give the settle path (transcript reload) a moment, then reload fully.
    await sleep(2500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(TA, { timeout: 30000 }).catch(() => {});
    let rowsAfter = 0;
    for (let i = 0; i < 120; i += 1) {
      rowsAfter = await page.evaluate(
        (m) => [...document.querySelectorAll('[id^="chat-msg-"]')].filter((el) => (el.textContent || '').indexOf(m) !== -1).length,
        MARK,
      );
      if (rowsAfter >= 2) break;
      await sleep(500);
    }
    check(rowsAfter >= 2, 'after a full reload the exchange is still on screen (' + rowsAfter + ' rows)');

    // ── 4. Disk truth: origin marker + no duplicates ──────────────────────
    const disk = readRows(sessionId);
    check(Boolean(disk) && disk.length >= 3, 'the session JSONL holds the recorded rows (' + (disk ? disk.length : 'null') + ')');
    if (disk) {
      const user = disk.filter((r) => r.role === 'user' && String(r.content).indexOf(MARK) !== -1);
      const assistant = disk.filter((r) => r.role === 'assistant' && String(r.content).indexOf(MARK) !== -1);
      check(user.length >= 1 && user.every((r) => r.origin === 'client-free'), 'the user row persisted with origin client-free');
      check(
        assistant.length === 1 && assistant[0].origin === 'client-free',
        'exactly ONE assistant row persisted, with origin client-free (no duplicates)',
      );
      const rawPath = transcriptPathFor(sessionId);
      const raw = rawPath ? fs.readFileSync(rawPath, 'utf-8') : '';
      check(raw.indexOf('"origin":"client-free"') !== -1, 'the raw JSONL bytes carry the origin field');
    }
  } catch (e) {
    console.log('PROBE-ERROR: ' + (e && e.stack ? e.stack : String(e)));
    failures.push('probe crashed: ' + (e && e.message ? e.message : String(e)));
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    // Cleanup: the throwaway session must go and STAY gone.
    const del = await rest('DELETE', '/api/sessions/' + encodeURIComponent(sessionId), token);
    check(del.status === 200, 'cleanup: throwaway session deleted (status ' + del.status + ')');
    let gone = false;
    for (let i = 0; i < 30; i += 1) {
      if (!transcriptPathFor(sessionId)) {
        gone = true;
        break;
      }
      await sleep(200);
    }
    check(gone, 'cleanup: transcript file stays gone');
    // The gate must still be ON: tokenless read refuses.
    const anon = await fetch(BASE + '/api/auth/me');
    check(anon.status === 401, 'login gate still ON after the probe (tokenless /api/auth/me -> ' + anon.status + ')');
  }

  const total = passed + failures.length;
  console.log('\nREQ-205 slice 5 live E2E probe: ' + passed + '/' + total + ' checks passed');
  if (failures.length > 0) {
    console.log('failures:');
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  process.exit(0);
})();
