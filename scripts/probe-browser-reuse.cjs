#!/usr/bin/env node
/**
 * REQ-146 tur-2 live probe — an already-open browser pane follows the agent.
 *
 * Tur 1 proved the SERVER halves (open_or_reuse: same tab id, real history
 * push, REST reuse flag). This probe proves the CLIENT half against the
 * deployed build: with a browser pane ALREADY open, a real agent run that
 * calls the open_browser tool must
 *   A) not open a second pane and not stack a second tab,
 *   B) make the visible pane follow the agent's URL (address bar + iframe),
 *   C) keep the same tab id across two agent opens (URL swaps in place).
 *
 * Flow: create a session over REST -> open the app, seed the tiling layout,
 * click the Browser rail (2 panes: chat left, browser right) -> type a prompt
 * in the chat composer asking the agent to call open_browser with URL A, poll
 * the DOM -> repeat with URL B -> assert DOM + REST tab list each round.
 *
 * Usage (repo root):
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a \
 *     node scripts/probe-browser-reuse.cjs --url http://127.0.0.1:3457 --token "$TK"
 *
 * Exit 0 = the pane follows the reused tab; 1 = a check failed.
 */
const { chromium } = require('playwright-core');
const WebSocket = require('ws');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const WEB = arg('--url', 'http://127.0.0.1:3457');
const API = arg('--api', 'http://127.0.0.1:3456');
const MODEL = arg('--model', 'commandcode/deepseek/deepseek-v4.1-flash');
const TOKEN = arg('--token', '') || process.env.TOKEN || '';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const URL_A = 'https://example.com';
const URL_B = 'https://example.org';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** The server normalizes bare hosts ("https://example.com" -> ".../"), so URL
 *  comparisons strip trailing slashes on both sides. */
const norm = (u) => String(u || '').replace(/\/+$/, '');

if (!TOKEN) {
  console.error('TOKEN is required (HOME=/root bun scripts/mint-e2e-token.mjs)');
  process.exit(1);
}

const failures = [];
const ok = (name, pass, detail) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' — ' + detail : ''));
  if (!pass) failures.push(name);
};

const authHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN };

/** Poll `fn` until it returns truthy or the timeout elapses; returns the value. */
async function waitFor(fn, timeoutMs, stepMs) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(stepMs || 1500);
  }
}

/** Pane boxes + the browser pane's address bar / iframe src. */
const snapshot = () =>
  [].map.call(document.querySelectorAll('div[data-pane]'), (el, i) => {
    const box = el.getBoundingClientRect();
    const address = el.querySelector('#browser-address');
    const frame = el.querySelector('iframe');
    return {
      i,
      id: el.getAttribute('data-pane'),
      x: Math.round(box.x),
      w: Math.round(box.width),
      browser: Boolean(address),
      address: address ? address.value : null,
      src: frame ? frame.getAttribute('src') : null,
    };
  });

const clickBrowserRail = (page) =>
  page.evaluate(() => {
    const buttons = [].slice.call(document.querySelectorAll('button[aria-label="Browser"]'));
    const visible = buttons.filter((b) => b.offsetParent !== null);
    const target = visible[0] || buttons[0];
    if (!target) return false;
    target.click();
    return true;
  });

/** Type one prompt into the chat composer and hit Enter. */
async function sendPrompt(page, text) {
  const ta = page.locator('textarea[aria-label="Message Lokma"]').first();
  await ta.waitFor({ state: 'visible', timeout: 30000 });
  await waitFor(async () => !(await ta.isDisabled()), 30000, 700);
  await ta.click();
  await ta.fill(text);
  await ta.press('Enter');
}

(async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'lokma-browser-reuse-'));
  let sessionId = '';
  let browser = null;
  let observer = null;
  const frames = [];

  try {
    // 1. A real session pinned to the live default model.
    const created = await fetch(API + '/api/sessions', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ cwd, model: MODEL }),
    });
    const session = await created.json().catch(() => ({}));
    sessionId = session.id || session.sessionId || '';
    ok('session created over REST', (created.status === 200 || created.status === 201) && Boolean(sessionId), 'HTTP ' + created.status);
    if (!sessionId) throw new Error('no session id; cannot continue');

    // 2. Observer socket: raw frames (evidence of what the server emitted).
    observer = new WebSocket('ws://127.0.0.1:3456/ws/' + sessionId + '?token=' + TOKEN);
    observer.on('message', (raw) => {
      try {
        frames.push(JSON.parse(String(raw)));
      } catch (_e) {
        /* ignore */
      }
    });
    await waitFor(() => observer.readyState === 1, 15000, 300);

    // 3. The app, seeded to a single-pane workspace on this session.
    browser = await chromium.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('lokma-token', t);
      } catch (_e) {
        /* ignore */
      }
    }, TOKEN);
    const page = await ctx.newPage();
    const apiErrors = [];
    page.on('response', (r) => {
      // A session created over REST has no transcript until the first turn is
      // written, and GET /api/sessions/:id is 404 by design until then — the
      // same benign pattern the REQ-145 probe filters.
      if (r.status() >= 400 && r.url().includes('/api/') && !r.url().includes('/api/sessions/sess_')) {
        apiErrors.push(r.status() + ' ' + r.url());
      }
    });
    await page.goto(WEB + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
    await sleep(7000);
    await page.evaluate(
      (args) => {
        localStorage.setItem(
          'lokma:layout:v1',
          JSON.stringify({
            state: { layout: { type: 'pane', id: 'a' }, leftW: 268, rightW: 300, tiling: false, windowed: false, activeSessionId: args.sid },
            version: 1,
          }),
        );
        localStorage.setItem('lokma:sessionId', args.sid);
        localStorage.removeItem('lokma:tiling-tabs:v1');
        localStorage.removeItem('lokma:windowed-pos:v1');
      },
      { sid: sessionId },
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(5000);
    const composerReady = await page.locator('textarea[aria-label="Message Lokma"]').first().count();
    ok('chat composer is present (session pane live)', composerReady > 0, 'count=' + composerReady);

    // 4. Open the browser pane first (rail) — the pane already exists now.
    const clicked = await clickBrowserRail(page);
    await sleep(4000);
    const s1 = await page.evaluate(snapshot);
    const s1Browser = s1.filter((p) => p.browser);
    ok('browser rail opened one browser pane', clicked && s1Browser.length === 1, 'panes=' + s1.length + ' browserPanes=' + s1Browser.length);
    ok('address bar starts blank', s1Browser.length === 1 && s1Browser[0].address === '', 'address=' + JSON.stringify(s1Browser[0] ? s1Browser[0].address : null));

    // 5. Round A — the agent opens URL A while the pane is already open.
    const framesBeforeA = frames.length;
    await sendPrompt(page, 'Call your open_browser tool exactly once with url ' + URL_A + ' . Then reply with ONLY the word DONE. Do nothing else.');
    const addrA = await waitFor(async () => {
      const s = await page.evaluate(snapshot);
      const bp = s.filter((p) => p.browser)[0];
      return bp && norm(bp.address) === norm(URL_A) ? bp : null;
    }, 150000, 1500);
    ok('A: pane address bar follows the agent URL', Boolean(addrA), 'address=' + JSON.stringify(addrA ? addrA.address : null));
    await waitFor(() => frames.slice(framesBeforeA).some((f) => f.type === 'done'), 150000, 1500);
    const s2 = await page.evaluate(snapshot);
    const s2Browser = s2.filter((p) => p.browser);
    ok('A: no second pane appeared', s2.length === s1.length, 'panes ' + s1.length + ' -> ' + s2.length);
    ok('A: still exactly one browser pane', s2Browser.length === 1, 'browserPanes=' + s2Browser.length);
    ok('A: iframe src is the agent URL', s2Browser.length === 1 && norm(s2Browser[0].src) === norm(URL_A), 'src=' + JSON.stringify(s2Browser[0] ? s2Browser[0].src : null));

    let tabs = (await (await fetch(API + '/api/browser?sessionId=' + encodeURIComponent(sessionId), { headers: authHeaders })).json()).tabs || [];
    ok('A: server holds exactly one tab for the session', tabs.length === 1, 'tabs=' + tabs.length);
    const tabIdA = tabs[0] ? tabs[0].id : '';
    ok('A: that tab carries the agent URL', Boolean(tabs[0]) && norm(tabs[0].url) === norm(URL_A), 'url=' + (tabs[0] ? tabs[0].url : 'n/a'));
    const uiActionA = frames.slice(framesBeforeA).filter((f) => f.type === 'ui_action' && f.action === 'open_browser')[0];
    ok('A: server emitted a ui_action frame with the tab id', Boolean(uiActionA) && uiActionA.tabId === tabIdA, 'frameTabId=' + (uiActionA ? uiActionA.tabId : 'none') + ' serverTabId=' + tabIdA);

    // 6. Round B — a second agent open swaps the SAME tab's URL.
    const framesBeforeB = frames.length;
    await sendPrompt(page, 'Call your open_browser tool exactly once with url ' + URL_B + ' . Then reply with ONLY the word DONE. Do nothing else.');
    const addrB = await waitFor(async () => {
      const s = await page.evaluate(snapshot);
      const bp = s.filter((p) => p.browser)[0];
      return bp && norm(bp.address) === norm(URL_B) ? bp : null;
    }, 150000, 1500);
    ok('B: pane address bar swaps to the second URL', Boolean(addrB), 'address=' + JSON.stringify(addrB ? addrB.address : null));
    await waitFor(() => frames.slice(framesBeforeB).some((f) => f.type === 'done'), 150000, 1500);
    const s3 = await page.evaluate(snapshot);
    const s3Browser = s3.filter((p) => p.browser);
    ok('B: pane count unchanged', s3.length === s2.length, 'panes ' + s2.length + ' -> ' + s3.length);
    ok('B: still exactly one browser pane', s3Browser.length === 1, 'browserPanes=' + s3Browser.length);
    tabs = (await (await fetch(API + '/api/browser?sessionId=' + encodeURIComponent(sessionId), { headers: authHeaders })).json()).tabs || [];
    ok('B: server still holds exactly one tab', tabs.length === 1, 'tabs=' + tabs.length);
    ok('B: the tab id is the SAME record (reuse, not a new tab)', Boolean(tabs[0]) && tabs[0].id === tabIdA, 'before=' + tabIdA + ' after=' + (tabs[0] ? tabs[0].id : 'n/a'));
    ok('B: the reused tab carries the second URL', Boolean(tabs[0]) && norm(tabs[0].url) === norm(URL_B), 'url=' + (tabs[0] ? tabs[0].url : 'n/a'));

    ok('no unexpected API failures during the run', apiErrors.length === 0, apiErrors.slice(0, 3).join(' | '));
  } catch (err) {
    ok('probe completed without crashing', false, err && err.message ? err.message : String(err));
    console.log('last frames: ' + JSON.stringify(frames.slice(-6).map((f) => f.type + ':' + (f.action || f.reason || f.code || '')).slice(-6)));
  } finally {
    // Cleanup — leave no probe session / temp dir / sockets behind.
    if (observer && observer.readyState === 1) observer.close();
    if (browser) await browser.close().catch(() => {});
    if (sessionId) {
      await fetch(API + '/api/sessions/' + encodeURIComponent(sessionId), { method: 'DELETE', headers: authHeaders }).catch(() => {});
    }
    rmSync(cwd, { recursive: true, force: true });
  }

  console.log(failures.length === 0 ? 'REQ-146 probe: ALL PASS' : 'REQ-146 probe: ' + failures.length + ' FAILED');
  process.exit(failures.length === 0 ? 0 : 1);
})();
