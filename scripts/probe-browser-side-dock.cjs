#!/usr/bin/env node
/**
 * REQ-145 live probe — opening the browser docks it as a side pane.
 *
 * The browser used to land as a tab in whichever pane happened to be focused
 * (or as a sidebar tab), so a page could open behind the chat. REQ-145 docks
 * it instead: a single-pane workspace splits once — chat left, browser right —
 * an already-split workspace keeps its layout and drops the browser into its
 * right-most pane, and an already-open browser pane is focused, never
 * duplicated.
 *
 * Scenarios (desktop, 1600x950):
 *   A) tiling ON with a single pane  → clicking the Browser rail icon: 1 → 2 panes,
 *      side-by-side geometry, address bar lives in the RIGHT pane only.
 *   B) single-chat (tiling OFF, single-pane layout) → same click: workspace
 *      comes up with 2 panes (the user's "open the browser from chat" flow).
 *   C) three-pane layout → same click: pane count stays 3 (never split again)
 *      and the browser docks into the right-most pane.
 *   D) clicking again with the browser already open focuses that pane instead
 *      of adding a second copy.
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-browser-side-dock.cjs --url http://127.0.0.1:3457 --token "$TK"
 *
 * Exit code 0 = the dock behaves as specified; 1 = a check failed.
 */
const { chromium } = require('playwright-core');

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const BASE = arg('--url', 'http://127.0.0.1:3457');
const TOKEN = arg('--token', '') || process.env.TOKEN || '';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const LAYOUT_KEY = 'lokma:layout:v1';
const TABS_KEY = 'lokma:tiling-tabs:v1';
const WINDOWED_KEY = 'lokma:windowed-pos:v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('TOKEN is required (HOME=/root bun scripts/mint-e2e-token.mjs)');
  process.exit(1);
}

const failures = [];
const ok = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures.push(name);
};

const singlePane = (sessionId) => ({
  layout: { type: 'pane', id: 'a' },
  leftW: 268,
  rightW: 300,
  tiling: false,
  windowed: false,
  activeSessionId: sessionId || null,
});

const threePanes = (sessionId) => ({
  layout: {
    type: 'split',
    id: 'root',
    dir: 'row',
    sizes: [33, 34, 33],
    children: [
      { type: 'pane', id: 'a' },
      { type: 'pane', id: 'center' },
      { type: 'pane', id: 'empty' },
    ],
  },
  leftW: 268,
  rightW: 300,
  tiling: true,
  windowed: false,
  activeSessionId: sessionId || null,
});

/** Pane boxes + where the browser address bar lives. */
const snapshot = () =>
  [].map.call(document.querySelectorAll('div[data-pane]'), (el, i) => {
    const box = el.getBoundingClientRect();
    return {
      i,
      id: el.getAttribute('data-pane'),
      x: Math.round(box.x),
      y: Math.round(box.y),
      w: Math.round(box.width),
      h: Math.round(box.height),
      browser: Boolean(el.querySelector('#browser-address')),
      tabs: [].map.call(el.querySelectorAll('[data-pane-tab]'), (t) => t.getAttribute('data-pane-tab')),
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

async function seed(page, state) {
  await page.evaluate(
    (args) => {
      localStorage.setItem('lokma:layout:v1', JSON.stringify({ state: args.state, version: 1 }));
      localStorage.removeItem('lokma:tiling-tabs:v1');
      localStorage.removeItem('lokma:windowed-pos:v1');
    },
    { state },
  );
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('lokma-token', t);
    } catch {
      /* ignore */
    }
  }, TOKEN);
  const page = await ctx.newPage();
  const badResponses = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('/favicon')) badResponses.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await sleep(7000);

  // A real session id keeps the left pane a live chat, not an empty pane.
  let sessionId = await page.evaluate(() => localStorage.getItem('lokma:sessionId') || '');
  if (!sessionId) {
    sessionId = await page.evaluate(() => {
      const row = document.querySelector('div[draggable="true"] .cursor-pointer') || document.querySelector('div[draggable="true"]');
      if (!row) return '';
      row.click();
      return '';
    });
    await sleep(3000);
    sessionId = await page.evaluate(() => localStorage.getItem('lokma:sessionId') || '');
  }
  ok('sanity: a workspace session is selected', Boolean(sessionId), sessionId || 'none');

  // ── Scenario A — tiling ON, single pane: 1 → 2, browser right ─────────────
  await seed(page, singlePane(sessionId));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(4000);
  await page.evaluate(() => {
    const enter = [].slice
      .call(document.querySelectorAll('button'))
      .find((b) => (b.innerText || '').trim() === 'Tiling workspace');
    if (enter) enter.click();
  });
  await sleep(2500);
  const aBefore = await page.evaluate(snapshot);
  ok('A: single-pane workspace renders one pane', aBefore.length === 1, `panes=${aBefore.length}`);
  await clickBrowserRail(page);
  await sleep(3500);
  const aAfter = await page.evaluate(snapshot);
  ok('A: opening the browser splits 1 → 2 panes', aAfter.length === 2, `panes=${aAfter.length}`);
  if (aAfter.length === 2) {
    const [left, right] = aAfter;
    ok('A: browser docks in the RIGHT pane', right.browser === true && left.browser === false, `left=${left.browser} right=${right.browser}`);
    ok(
      'A: the two panes sit side by side',
      right.x >= left.x + left.w - 4 && Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y) > 80,
      `left x=${left.x} w=${left.w} | right x=${right.x} w=${right.w}`,
    );
    ok('A: the chat keeps the left pane', left.tabs.length > 0, `left tabs=${left.tabs.length}`);
  }

  // ── Scenario B — single-chat (tiling off) → browser opens as side pane ────
  await seed(page, singlePane(sessionId));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(4000);
  const bBefore = await page.evaluate(snapshot);
  await clickBrowserRail(page);
  await sleep(4000);
  const bAfter = await page.evaluate(snapshot);
  ok('B: single chat renders no panes yet', bBefore.length === 0, `panes=${bBefore.length}`);
  ok('B: browser from chat comes up as a side pane', bAfter.length === 2 && bAfter[1].browser === true, `panes=${bAfter.length} right=${bAfter[1] ? bAfter[1].browser : 'n/a'}`);

  // ── Scenario C — three-pane layout: never split again, right-most dock ────
  await seed(page, threePanes(sessionId));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(4500);
  const cBefore = await page.evaluate(snapshot);
  ok('C: three-pane layout restored', cBefore.length === 3, `panes=${cBefore.length}`);
  await clickBrowserRail(page);
  await sleep(3500);
  const cAfter = await page.evaluate(snapshot);
  ok('C: the layout is not split a second time', cAfter.length === 3, `panes=${cAfter.length}`);
  if (cAfter.length === 3) {
    ok(
      'C: the browser docks into the right-most pane',
      cAfter[2].browser === true && cAfter[0].browser === false,
      `right-most=${cAfter[2].browser} first=${cAfter[0].browser}`,
    );
  }

  // ── Scenario D — an already-open browser is focused, never duplicated ─────
  const dBefore = await page.evaluate(snapshot);
  await clickBrowserRail(page);
  await sleep(3000);
  const dAfter = await page.evaluate(snapshot);
  const browserPanes = dAfter.filter((p) => p.browser).length;
  ok(
    'D: reopening keeps one browser pane and no new split',
    dAfter.length === dBefore.length && browserPanes === 1,
    `panes=${dAfter.length} browserPanes=${browserPanes}`,
  );

  // ── Scenario E — mobile: no pane system, browser stays a full view ────────
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mctx.addInitScript((t) => {
    try {
      localStorage.setItem('lokma-token', t);
    } catch {
      /* ignore */
    }
  }, TOKEN);
  const mpage = await mctx.newPage();
  await mpage.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await sleep(6000);
  const mNav = await mpage.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
    if (!nav) return 'no-nav';
    const tabs = [].slice.call(nav.querySelectorAll('button'));
    const tools = tabs.filter((b) => /tool/i.test(b.getAttribute('aria-label') || ''))[0] || tabs[tabs.length - 1];
    if (!tools) return 'no-tools';
    tools.click();
    return 'tools';
  });
  await sleep(1500);
  const mBrowser = await mpage.evaluate(() => {
    const tab = document.querySelector('[role="tablist"][aria-label="Inspector tools"] button[title="Browser"]');
    if (!tab) return false;
    tab.click();
    return true;
  });
  await sleep(2500);
  const mPanes = await mpage.evaluate(() => document.querySelectorAll('div[data-pane]').length);
  if (mNav === 'tools' && mBrowser) {
    ok('E: mobile keeps the single view (no panes)', mPanes === 0, `panes=${mPanes}`);
  } else {
    console.log(`SKIP  E: mobile browser surface not reachable (${mNav}, browserTab=${mBrowser})`);
  }
  await mctx.close();

  const noise = badResponses.filter((b) => !b.includes('/api/sessions/sess_'));
  ok('no unexpected failed API requests during the run', noise.length === 0, noise.slice(0, 3).join(' | '));

  await browser.close();
  console.log(failures.length === 0 ? 'REQ-145 probe: ALL PASS' : `REQ-145 probe: ${failures.length} FAILED`);
  process.exit(failures.length === 0 ? 0 : 1);
})().catch((err) => {
  console.error('probe crashed:', err && err.message ? err.message : err);
  process.exit(1);
});
