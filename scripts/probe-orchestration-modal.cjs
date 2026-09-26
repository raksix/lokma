#!/usr/bin/env node
/**
 * REQ-164 live probe — Orchestration is a Settings MODAL section, not a pane.
 *
 * Proves, against the LIVE app (authed with a minted Bearer token — the
 * login gate stays ON, see scripts/mint-e2e-token.mjs):
 *   1. the Inspector rail's Orchestration icon opens the Settings modal on
 *      the Orchestration section (shares the REQ-163 RAIL_MODAL_SECTIONS map)
 *   2. no tiling pane opens and the tiling snapshots stay untouched — the
 *      pane/tab definition is gone, not merely hidden
 *   3. the modal renders the LIVE Orchestration pane (header + running badge,
 *      caps chip, All/Running/Queued filters, Cancel all, Refresh registry,
 *      tree state) — real surfaces, no dead buttons
 *   4. the Fan-out button is VISIBLE: the section wraps the pane in the same
 *      @container host the pane tab uses, so its @min-[320px] rule resolves
 *   5. BOTH moved sections work inside the same modal (Orchestration <->
 *      Agent Hub switching does not break either)
 *   6. Escape and a backdrop click close the modal; the section fits the
 *      modal body (no horizontal overflow)
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-orchestration-modal.cjs --url https://lokma.fermag.com.tr --token "$TK"
 */
const { chromium } = require('playwright-core');

const BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'https://lokma.fermag.com.tr';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN = (process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : '') || process.env.TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('TOKEN required');
  process.exit(1);
}

const failures = [];
const ok = (name, pass, detail) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
  if (!pass) failures.push(name);
};

// ── page-side readers (browser globals only) ───────────────────────────────

const paneSnapshot = () => ({
  panes: document.querySelectorAll('[data-pane]').length,
  tabs: (function () { try { return localStorage.getItem('lokma:tiling-tabs:v1') || ''; } catch (e) { return ''; } })(),
  layout: (function () { try { return localStorage.getItem('lokma:layout:v1') || ''; } catch (e) { return ''; } })(),
  railPressed: (function () {
    const cands = [].slice.call(document.querySelectorAll('nav[aria-label="Inspector rail"] button')).filter(function (b) {
      return (b.getAttribute('aria-label') || '') === 'Orchestration';
    });
    const b = cands.filter(function (x) { return x.hasAttribute('aria-pressed'); })[0] || cands[0];
    return b ? b.getAttribute('aria-pressed') : null;
  })(),
});

const modalInfo = () => {
  const modal = document.querySelector('[role="dialog"][aria-label="Settings"]');
  if (!modal) return null;
  const box = function (el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
  };
  const text = modal.innerText || '';
  const nav = modal.querySelector('nav[aria-label="Settings sections"]');
  const navBtn = function (label) {
    return nav
      ? [].slice.call(nav.querySelectorAll('button')).filter(function (b) { return (b.getAttribute('aria-label') || '') === label; })[0]
      : null;
  };
  const orchBtn = navBtn('Orchestration');
  const hubBtn = navBtn('Agent Hub');
  const headerSpan = [].slice.call(modal.querySelectorAll('span')).filter(function (s) {
    return (s.textContent || '').trim() === 'Orchestration';
  })[0];
  const body = [].slice.call(modal.querySelectorAll('div')).filter(function (d) {
    return typeof d.className === 'string' && d.className.indexOf('overflow-y-auto') >= 0 && d.className.indexOf('p-4') >= 0;
  })[0];
  const buttons = [].slice.call(modal.querySelectorAll('button'));
  const byText = function (t) { return buttons.filter(function (b) { return (b.textContent || '').trim() === t; })[0]; };
  const fanout = byText('Fan-out');
  const cancelAll = buttons.filter(function (b) {
    const t = (b.textContent || '').trim();
    return t === 'Cancel all' || t.indexOf('Confirm (') === 0;
  })[0];
  const refresh = buttons.filter(function (b) { return (b.getAttribute('aria-label') || '') === 'Refresh registry'; })[0];
  const filterBtns = buttons.filter(function (b) {
    return ['all', 'running', 'queued'].indexOf((b.textContent || '').trim().toLowerCase()) >= 0;
  });
  const panel = modal.firstElementChild;
  return {
    navOrch: orchBtn ? orchBtn.getAttribute('aria-pressed') : null,
    navHub: hubBtn ? hubBtn.getAttribute('aria-pressed') : null,
    navCount: nav ? nav.querySelectorAll('button').length : 0,
    headerBox: box(headerSpan),
    panelBox: box(panel),
    bodyBox: box(body),
    overflowX: body ? body.scrollWidth - body.clientWidth : null,
    hasBadge: /\d+ running · \d+ total/.test(text),
    hasCapsChip: /caps \d+\/\d+\/\d+/.test(text),
    filterCount: filterBtns.length,
    hasFanout: Boolean(fanout),
    fanoutBox: box(fanout),
    fanoutDisplay: fanout ? getComputedStyle(fanout).display : null,
    hasCancelAll: Boolean(cancelAll),
    cancelTitle: cancelAll ? cancelAll.getAttribute('title') : null,
    hasRefresh: Boolean(refresh),
    hasTree: /(No agents yet|agents right now|Loading agents)/.test(text) || /(running|queued|idle|stopped|cancelled|done|failed) · \d+/.test(text),
    hasSpawnDepth: text.indexOf('maxSpawnDepth 3') >= 0,
    snippet: text.slice(0, 220),
  };
};

const clickRailOrchestration = () => {
  const cands = [].slice.call(document.querySelectorAll('nav[aria-label="Inspector rail"] button')).filter(function (b) {
    return (b.getAttribute('aria-label') || '') === 'Orchestration';
  });
  const b = cands.filter(function (x) { return x.hasAttribute('aria-pressed'); })[0] || cands[0];
  if (!b) return false;
  b.click();
  return true;
};

const clickNavSection = (label) => {
  const nav = document.querySelector('[role="dialog"][aria-label="Settings"] nav[aria-label="Settings sections"]');
  if (!nav) return false;
  const b = [].slice.call(nav.querySelectorAll('button')).filter(function (x) {
    return (x.getAttribute('aria-label') || '') === label;
  })[0];
  if (!b) return false;
  b.click();
  return true;
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: process.env.PROBE_HEADFUL !== '1',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('lokma-token', t);
    } catch (e) {
      /* ignore */
    }
  }, TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 160)));

  await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await sleep(6000);

  const report = async () => {
    console.log('--- errors seen ---');
    console.log(errors.slice(0, 8).join('\n') || '(none)');
    const jsErrors = errors.filter((e) => e.indexOf('Failed to load resource') === -1);
    ok('no JavaScript errors on the page', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | ') || 'clean');
    await browser.close();
    if (failures.length) {
      console.log('\nprobe-orchestration-modal: ' + failures.length + ' failure(s): ' + failures.join(', '));
      process.exit(1);
    }
    console.log('\nprobe-orchestration-modal: all checks passed.');
  };

  const railReady = await page.evaluate(() => Boolean(document.querySelector('nav[aria-label="Inspector rail"]')));
  ok('the harness shell renders (Inspector rail present)', railReady, railReady ? 'rail found' : 'no rail in 6s');
  if (!railReady) return report();

  const before = await page.evaluate(paneSnapshot);
  ok('pre: no tiling panes open (fresh browser)', before.panes === 0, 'panes=' + before.panes);

  // 1 ── rail Orchestration icon → Settings modal, Orchestration section.
  const clicked = await page.evaluate(clickRailOrchestration);
  ok('the Orchestration rail icon is clicked', clicked, clicked ? 'rail click sent' : 'no Orchestration rail button');

  let modal = null;
  for (let i = 0; i < 20; i += 1) {
    modal = await page.evaluate(modalInfo);
    if (modal) break;
    await sleep(400);
  }
  ok('the Settings modal opens', Boolean(modal), modal ? 'dialog[aria-label="Settings"] visible' : 'no modal in 8s');
  if (!modal) return report();

  ok('it lands on the Orchestration section (initialSection)', modal.navOrch === 'true', 'nav aria-pressed=' + modal.navOrch + ', sections=' + modal.navCount);
  ok('the section nav has 15 sections (Agent Hub + Orchestration added)', modal.navCount === 15, 'sections=' + modal.navCount);
  ok('the Orchestration header renders inside the modal', Boolean(modal.headerBox) && modal.headerBox.h >= 14, modal.headerBox ? JSON.stringify(modal.headerBox) : 'no Orchestration header span');
  ok('the live running/total badge renders', modal.hasBadge, modal.hasBadge ? 'badge text found' : 'badge missing');
  ok('the caps chip renders (caps maxAgents/maxConcurrent/maxQueue)', modal.hasCapsChip, modal.hasCapsChip ? 'caps chip found' : 'caps chip missing');
  ok('the All/Running/Queued filters render', modal.filterCount === 3, 'filters=' + modal.filterCount);
  ok('the Fan-out button is present', modal.hasFanout, modal.hasFanout ? 'fanout found' : 'fanout missing');
  ok('the Fan-out button is VISIBLE (@container host resolves the @min rule)', Boolean(modal.hasFanout && modal.fanoutDisplay !== 'none' && modal.fanoutBox && modal.fanoutBox.w > 0 && modal.fanoutBox.h > 0), 'display=' + modal.fanoutDisplay + ' box=' + JSON.stringify(modal.fanoutBox));
  ok('Cancel all is present (real kill path)', modal.hasCancelAll, 'title=' + modal.cancelTitle);
  ok('Refresh registry is present', modal.hasRefresh, modal.hasRefresh ? 'refresh found' : 'refresh missing');
  ok('the tree area renders (empty state or live rows)', modal.hasTree, modal.hasTree ? 'tree state found' : 'no tree state');
  console.log('  (modal excerpt: ' + modal.snippet.slice(0, 160).replace(/\n/g, ' | ') + ')');

  // 2 ── no pane/tab opened; the rail icon never becomes an active tab.
  const after = await page.evaluate(paneSnapshot);
  ok('no tiling pane opened (pane count unchanged)', after.panes === before.panes, 'before=' + before.panes + ' after=' + after.panes);
  ok('the tiling-tabs snapshot is untouched', after.tabs === before.tabs, 'stored length ' + before.tabs.length + ' -> ' + after.tabs.length);
  ok('the tiling layout snapshot is untouched', after.layout === before.layout, 'layout len ' + before.layout.length + ' -> ' + after.layout.length);
  ok('the Orchestration rail icon never becomes an active tab', after.railPressed === 'false', 'aria-pressed=' + after.railPressed);

  // 6 ── fits the modal body.
  const fitsHeader = modal.headerBox && modal.panelBox && modal.headerBox.bottom <= modal.panelBox.bottom + 1 && modal.headerBox.right <= modal.panelBox.right + 1;
  ok('the Orchestration content sits inside the modal panel', Boolean(fitsHeader), 'header=' + JSON.stringify(modal.headerBox) + ' panel=' + JSON.stringify(modal.panelBox));
  ok('the modal body has a usable height', Boolean(modal.bodyBox) && modal.bodyBox.h >= 300, 'body=' + JSON.stringify(modal.bodyBox));
  ok('no horizontal overflow in the modal body', modal.overflowX !== null && modal.overflowX <= 1, 'overflowX=' + modal.overflowX);

  await page.screenshot({ path: '/tmp/req164-orchestration-modal.png' });
  console.log('screenshot: /tmp/req164-orchestration-modal.png');

  // 5 ── both moved sections work in the same modal (Orchestration <-> Agent Hub).
  const hubClicked = await page.evaluate(clickNavSection, 'Agent Hub');
  ok('the nav switches to the Agent Hub section', hubClicked, hubClicked ? 'nav click sent' : 'no Agent Hub nav button');
  let hub = null;
  for (let i = 0; i < 15; i += 1) {
    hub = await page.evaluate(modalInfo);
    if (hub && hub.navHub === 'true' && hub.hasSpawnDepth) break;
    await sleep(300);
  }
  ok('the Agent Hub section still renders after the switch (maxSpawnDepth chip)', Boolean(hub) && hub.navHub === 'true' && hub.hasSpawnDepth, hub ? 'hub pressed=' + hub.navHub + ' spawnDepth=' + hub.hasSpawnDepth : 'no modal');

  const backClicked = await page.evaluate(clickNavSection, 'Orchestration');
  let back = null;
  for (let i = 0; i < 15; i += 1) {
    back = await page.evaluate(modalInfo);
    if (back && back.navOrch === 'true' && back.hasFanout) break;
    await sleep(300);
  }
  ok('switching back re-renders Orchestration (Fan-out visible again)', backClicked && Boolean(back) && back.navOrch === 'true' && back.fanoutDisplay !== 'none' && Boolean(back.fanoutBox && back.fanoutBox.w > 0), back ? 'pressed=' + back.navOrch + ' fanout display=' + back.fanoutDisplay : 'no modal');

  // 6 ── Escape closes the modal.
  const stillOpen = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-label="Settings"]')));
  ok('the Settings modal is still open before the close checks', stillOpen, stillOpen ? 'modal alive' : 'modal vanished early');
  await page.keyboard.press('Escape');
  await sleep(700);
  const closedByEsc = await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Settings"]'));
  ok('Escape closes the Settings modal', closedByEsc, closedByEsc ? 'closed' : 'still open');

  // 6b ── reopen via the rail, then a backdrop click closes it.
  await page.evaluate(clickRailOrchestration);
  let reopened = null;
  for (let i = 0; i < 15; i += 1) {
    reopened = await page.evaluate(modalInfo);
    if (reopened) break;
    await sleep(300);
  }
  ok('the rail reopens the modal on Orchestration', Boolean(reopened) && reopened.navOrch === 'true', reopened ? 'nav aria-pressed=' + reopened.navOrch : 'no modal');
  await page.mouse.click(14, 14);
  await sleep(700);
  const closedByBackdrop = await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Settings"]'));
  ok('a backdrop click closes the modal', closedByBackdrop, closedByBackdrop ? 'closed' : 'still open');

  return report();
})().catch((e) => {
  console.error('probe crashed:', e);
  process.exit(2);
});
