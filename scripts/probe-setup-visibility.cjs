#!/usr/bin/env node
/**
 * REQ-169 live probe — the Setup entry leaves the sidebar(s) once the
 * instance is bootstrapped; the pane itself stays registered and reachable.
 *
 * Proves, against the LIVE app (minted Bearer token, login gate stays ON):
 *   1. /api/auth/settings reports bootstrapped:true — the flag App seeds
 *      its shared store from (no extra request)
 *   2. the Inspector rail renders WITHOUT a Setup entry (20 of the 21
 *      canonical entries; Todos still present as a selector sanity check)
 *   3. the mobile tools strip hides the Setup pill too (390px viewport)
 *   4. the pane stays reachable: Extras -> doctor row -> Open switches the
 *      Inspector to the rail-less Setup tab and its header renders;
 *      GET /api/setup + /api/doctor stay 200
 *   5. negative control: with /api/auth/settings stubbed to
 *      bootstrapped:false (everything else real), the rail SHOWS the Setup
 *      entry again — proving visibility really keys on that flag
 *
 * The probe boots into a REAL probe session (created via POST
 * /api/sessions, seeded into localStorage) so the shell performs no
 * fresh-session 404s; it is deleted at the end and the deletion is
 * re-checked (GET -> 404).
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-setup-visibility.cjs --token "$TK"
 */
const { chromium } = require('playwright-core');
const { mkdirSync, rmSync } = require('node:fs');

const readFlag = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = readFlag('url', 'http://127.0.0.1:3457');
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN = readFlag('token', '') || process.env.TOKEN;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!TOKEN) {
  console.error('missing --token (mint one with scripts/mint-e2e-token.mjs)');
  process.exit(2);
}

const AUTH = { Authorization: 'Bearer ' + TOKEN };
const PROBE_CWD = '/tmp/lokma-req169-probe-' + Date.now().toString(36);
let SESSION_ID = '';

const failures = [];
const ok = (name, pass, detail) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
  if (!pass) failures.push(name);
};

// ── probe session (create before boot, delete + re-check after) ────────────

async function createProbeSession() {
  mkdirSync(PROBE_CWD, { recursive: true });
  const res = await fetch(BASE + '/api/sessions', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, AUTH),
    body: JSON.stringify({ cwd: PROBE_CWD }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !body.id) throw new Error('probe session create failed: ' + res.status);
  return body.id;
}

async function deleteProbeSession() {
  const statuses = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const del = await fetch(BASE + '/api/sessions/' + SESSION_ID, { method: 'DELETE', headers: AUTH });
    const after = await fetch(BASE + '/api/sessions/' + SESSION_ID, { headers: AUTH });
    statuses.push('del=' + del.status + ' get=' + after.status);
    if (after.status === 404) return statuses;
    await sleep(500);
  }
  return statuses;
}

// ── page-side readers (browser globals only) ───────────────────────────────

const railState = () => {
  const rail = document.querySelector('nav[aria-label="Inspector rail"]');
  if (!rail) return { present: false, total: 0, setup: 0, labels: [] };
  const buttons = Array.prototype.slice.call(rail.querySelectorAll('button'));
  const labels = buttons.map(function (button) { return button.getAttribute('aria-label') || ''; });
  return {
    present: true,
    total: buttons.length,
    setup: labels.filter(function (label) { return label === 'Setup'; }).length,
    labels: labels,
  };
};

const stripState = () => {
  const strip = document.querySelector('[aria-label="Inspector tools"]');
  if (!strip) return { present: false, total: 0, setup: 0, hasTodos: false };
  const buttons = Array.prototype.slice.call(strip.querySelectorAll('button'));
  const labels = buttons.map(function (button) { return (button.textContent || '').trim(); });
  return {
    present: true,
    total: buttons.length,
    setup: labels.filter(function (label) { return label === 'Setup'; }).length,
    hasTodos: labels.indexOf('Todos') >= 0,
  };
};

/** Click the Open button of one specific Extras row (by its title text). */
const clickExtrasRowOpen = (titleText) => {
  const candidates = Array.from(document.querySelectorAll('div')).filter(function (d) {
    const t = (d.textContent || '').replace(/\s+/g, ' ').trim();
    return t.indexOf(titleText) === 0 && t.length < 220;
  });
  const title = candidates[candidates.length - 1];
  if (!title) return 'no-title';
  let el = title;
  for (let i = 0; i < 10 && el; i += 1) {
    const button = Array.from(el.querySelectorAll('button')).find(function (b) {
      return (b.textContent || '').trim().indexOf('Open') === 0;
    });
    if (button) {
      button.setAttribute('data-probe-doctor-open', '1');
      return 'marked';
    }
    el = el.parentElement;
  }
  return 'no-button';
};

// ── boot one authed page (optionally stubbing the settings response) ───────

async function bootContext(browser, options) {
  const ctx = await browser.newContext({ viewport: options.viewport });
  await ctx.addInitScript(
    function (seed) {
      try {
        localStorage.setItem('lokma-token', seed.token);
        localStorage.setItem('lokma:sessionId', seed.sessionId);
      } catch (e) {
        /* ignore */
      }
    },
    { token: TOKEN, sessionId: SESSION_ID },
  );
  await ctx.addCookies([
    { name: 'lokma_token', value: TOKEN, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: BASE.indexOf('https') === 0 },
  ]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', function (message) {
    if (message.type() === 'error') {
      let url = '';
      try {
        url = (message.location() || {}).url || '';
      } catch (e) {
        url = '';
      }
      errors.push('console: ' + message.text().slice(0, 140) + ' @ ' + url);
    }
  });
  page.on('pageerror', function (error) {
    errors.push('pageerror: ' + String(error).slice(0, 160));
  });
  if (options.stubBootstrapped !== undefined) {
    await page.route('**/api/auth/settings', async function (route) {
      const response = await route.fetch();
      let payload = null;
      try {
        payload = await response.json();
      } catch (e) {
        payload = null;
      }
      if (!payload || typeof payload !== 'object') {
        await route.fulfill({ response: response });
        return;
      }
      payload.bootstrapped = options.stubBootstrapped;
      await route.fulfill({ response: response, json: payload });
    });
  }
  await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(options.waitFor, { timeout: 20000 });
  await sleep(1500); // settings fetch + shell settle
  return { ctx: ctx, page: page, errors: errors };
}

(async () => {
  SESSION_ID = await createProbeSession();
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: process.env.PROBE_HEADFUL !== '1',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  // ── context 1 — the live instance (really bootstrapped) ─────────────────
  const live = await bootContext(browser, { viewport: { width: 1500, height: 950 }, waitFor: 'nav[aria-label="Inspector rail"]' });

  const settings = await live.page.evaluate(async function () {
    const token = localStorage.getItem('lokma-token') || '';
    const res = await fetch('/api/auth/settings', { headers: { Authorization: 'Bearer ' + token } });
    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      body = null;
    }
    return { status: res.status, bootstrapped: body ? body.bootstrapped : null };
  });
  ok(
    'live /api/auth/settings reports bootstrapped:true (the flag source)',
    settings.status === 200 && settings.bootstrapped === true,
    'status=' + settings.status + ' bootstrapped=' + settings.bootstrapped,
  );

  const rail = await live.page.evaluate(railState);
  ok('Inspector rail renders (desktop)', rail.present === true);
  ok(
    'rail drops exactly the Setup entry (20 of the 21 canonical)',
    rail.total === 20 && rail.setup === 0,
    'total=' + rail.total + ' setup=' + rail.setup,
  );
  ok('rail sanity — Todos still present (selector validation)', rail.labels.indexOf('Todos') >= 0);

  // ── mobile: the tools strip hides the Setup pill too ────────────────────
  await live.page.setViewportSize({ width: 390, height: 844 });
  await live.page.waitForSelector('[data-testid="mobile-single-view"]', { timeout: 10000 });
  await sleep(700);
  const toolsClicked = await live.page.evaluate(function () {
    const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
    if (!nav) return false;
    const buttons = Array.prototype.slice.call(nav.querySelectorAll('button'));
    const target = buttons.filter(function (button) { return (button.textContent || '').trim() === 'Tools'; })[0];
    if (!target) return false;
    target.click();
    return true;
  });
  await sleep(900);
  const strip = await live.page.evaluate(stripState);
  ok('mobile tools tap opens the strip', toolsClicked === true && strip.present === true, 'total=' + strip.total);
  ok('mobile strip hides the Setup pill too', strip.setup === 0 && strip.hasTodos === true, 'setup=' + strip.setup);

  // ── pane reachability: Extras -> doctor row -> Open -> Setup tab ────────
  await live.page.setViewportSize({ width: 1500, height: 950 });
  await sleep(700);
  const extrasClicked = await live.page.evaluate(function () {
    const railEl = document.querySelector('nav[aria-label="Inspector rail"]');
    if (!railEl) return false;
    const buttons = Array.prototype.slice.call(railEl.querySelectorAll('button'));
    const target = buttons.filter(function (button) { return button.getAttribute('aria-label') === 'Extras'; })[0];
    if (!target) return false;
    target.click();
    return true;
  });
  ok('Extras rail entry opens its pane', extrasClicked === true);
  await live.page
    .waitForFunction(function () { return document.body.innerText.indexOf('lokma doctor --agents') >= 0; }, { timeout: 10000 })
    .catch(function () {});
  const marked = await live.page.evaluate(clickExtrasRowOpen, 'lokma doctor --agents');
  ok('Extras carries the Open affordance for the hidden Setup tab', marked === 'marked', marked);
  const opened = await live.page.evaluate(function () {
    const button = document.querySelector('[data-probe-doctor-open="1"]');
    if (!button) return false;
    if (typeof button.scrollIntoView === 'function') button.scrollIntoView({ block: 'center' });
    button.click();
    return true;
  });
  ok('the doctor row Open button is clickable', opened === true);
  const paneShown = await live.page
    .waitForFunction(
      function () {
        const text = document.body.innerText || '';
        return text.indexOf('1 Init') >= 0 && text.indexOf('4 Cloud') >= 0;
      },
      { timeout: 10000 },
    )
    .then(function () { return true; })
    .catch(function () { return false; });
  ok('Setup pane renders although its rail entry is gone', paneShown === true);
  const railAfter = await live.page.evaluate(railState);
  ok('rail still without Setup while the pane is open', railAfter.setup === 0);

  const apiCodes = await live.page.evaluate(async function () {
    const token = localStorage.getItem('lokma-token') || '';
    const get = async (path) => (await fetch(path, { headers: { Authorization: 'Bearer ' + token } })).status;
    return { setup: await get('/api/setup'), doctor: await get('/api/doctor') };
  });
  ok(
    'GET /api/setup + /api/doctor stay 200 (functions intact)',
    apiCodes.setup === 200 && apiCodes.doctor === 200,
    'setup=' + apiCodes.setup + ' doctor=' + apiCodes.doctor,
  );

  // ── context 2 — negative control: settings stubbed bootstrapped:false ───
  const stub = await bootContext(browser, {
    viewport: { width: 1500, height: 950 },
    waitFor: 'nav[aria-label="Inspector rail"]',
    stubBootstrapped: false,
  });
  const stubRail = await stub.page.evaluate(railState);
  ok(
    'negative control: stubbed bootstrapped:false -> rail SHOWS Setup again',
    stubRail.setup === 1 && stubRail.total === 21,
    'total=' + stubRail.total + ' setup=' + stubRail.setup,
  );

  ok('no console/page errors in the live context', live.errors.length === 0, live.errors.slice(0, 3).join(' | '));
  ok('no console/page errors in the stub context', stub.errors.length === 0, stub.errors.slice(0, 3).join(' | '));

  await live.ctx.close();
  await stub.ctx.close();
  await browser.close();

  // ── cleanup: the probe session must be gone (re-checked) ────────────────
  const cleanup = await deleteProbeSession();
  ok('probe session deleted and re-checked (GET -> 404)', cleanup[cleanup.length - 1].indexOf('get=404') >= 0, cleanup.join(' '));
  rmSync(PROBE_CWD, { recursive: true, force: true });

  console.log('');
  if (failures.length > 0) {
    console.log('probe-setup-visibility: ' + failures.length + ' FAIL - ' + failures.join('; '));
    process.exit(1);
  }
  console.log('probe-setup-visibility: ALL PASS');
})().catch(function (error) {
  console.error('probe crashed: ' + (error && error.stack ? error.stack : String(error)));
  process.exit(1);
});
