#!/usr/bin/env node
/**
 * REQ-163 live probe — Agent Hub is a Settings MODAL section, not a pane.
 *
 * Proves, against the LIVE app (authed with a minted Bearer token — the
 * login gate stays ON, see scripts/mint-e2e-token.mjs):
 *   1. the Inspector rail's Agents icon opens the Settings modal on the
 *      Agent Hub section (initialSection wired like REQ-072's Account icon)
 *   2. no tiling pane opens and the tiling-tabs snapshot stays untouched —
 *      the pane/tab definition is gone, not merely hidden
 *   3. the modal renders the LIVE Agent Hub content (registry header, caps
 *      chips, slots-used line, + Create, refresh)
 *   4. + Create opens the real create dialog and Cancel closes it (this
 *      probe creates no agent)
 *   5. Escape and a backdrop click both close the modal
 *   6. the section fits the modal body (no horizontal overflow)
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-agent-hub-modal.cjs --url https://lokma.fermag.com.tr --token "$TK"
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
      return (b.getAttribute('aria-label') || '') === 'Agents';
    });
    const b = cands.filter(function (x) { return x.hasAttribute('aria-pressed'); })[0] || cands[0];
    return b ? b.getAttribute('aria-pressed') : null;
  })(),
});

const modalInfo = () => {
  const modal = document.querySelector('[role="dialog"][aria-label="Settings"]');
  if (!modal) return null;
  const text = modal.innerText || '';
  const nav = modal.querySelector('nav[aria-label="Settings sections"]');
  const hubBtn = nav
    ? [].slice.call(nav.querySelectorAll('button')).filter(function (b) { return (b.getAttribute('aria-label') || '') === 'Agent Hub'; })[0]
    : null;
  const headerSpan = [].slice.call(modal.querySelectorAll('span')).filter(function (s) {
    return (s.textContent || '').trim() === 'Agent Hub';
  })[0];
  const createBtn = [].slice.call(modal.querySelectorAll('button')).filter(function (b) {
    return (b.textContent || '').trim() === 'Create';
  })[0];
  const refreshBtn = modal.querySelector('button[aria-label="Refresh registry"]');
  const panel = modal.firstElementChild;
  const body = [].slice.call(modal.querySelectorAll('div')).filter(function (d) {
    return typeof d.className === 'string' && d.className.indexOf('overflow-y-auto') >= 0 && d.className.indexOf('p-4') >= 0;
  })[0];
  const box = function (el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
  };
  return {
    navActive: hubBtn ? hubBtn.getAttribute('aria-pressed') : null,
    navCount: nav ? nav.querySelectorAll('button').length : 0,
    headerBox: box(headerSpan),
    panelBox: box(panel),
    bodyBox: box(body),
    overflowX: body ? body.scrollWidth - body.clientWidth : null,
    hasCreate: Boolean(createBtn),
    hasRefresh: Boolean(refreshBtn),
    hasCaps: text.indexOf('maxAgents') >= 0 && text.indexOf('maxConcurrent') >= 0 && text.indexOf('maxQueue') >= 0,
    hasSlots: text.indexOf('slots used') >= 0 || text.indexOf('registry full') >= 0,
    hasSpawnDepth: text.indexOf('maxSpawnDepth 3') >= 0,
    hasList: text.indexOf('No agents yet') >= 0 || text.indexOf('Loading agents') >= 0 || text.indexOf('Select an agent') >= 0,
    snippet: text.slice(0, 200),
  };
};

const clickRailAgents = () => {
  const cands = [].slice.call(document.querySelectorAll('nav[aria-label="Inspector rail"] button')).filter(function (b) {
    return (b.getAttribute('aria-label') || '') === 'Agents';
  });
  const b = cands.filter(function (x) { return x.hasAttribute('aria-pressed'); })[0] || cands[0];
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
      console.log('\nprobe-agent-hub-modal: ' + failures.length + ' failure(s): ' + failures.join(', '));
      process.exit(1);
    }
    console.log('\nprobe-agent-hub-modal: all checks passed.');
  };

  const railReady = await page.evaluate(() => Boolean(document.querySelector('nav[aria-label="Inspector rail"]')));
  ok('the harness shell renders (Inspector rail present)', railReady, railReady ? 'rail found' : 'no rail in 6s');
  if (!railReady) return report();

  const before = await page.evaluate(paneSnapshot);
  ok('pre: no tiling panes open (fresh browser)', before.panes === 0, 'panes=' + before.panes);

  // 1 ── rail Agents icon → Settings modal, Agent Hub section.
  const clicked = await page.evaluate(clickRailAgents);
  ok('the Agents rail icon is clicked', clicked, clicked ? 'rail click sent' : 'no Agents rail button');

  let modal = null;
  for (let i = 0; i < 20; i += 1) {
    modal = await page.evaluate(modalInfo);
    if (modal) break;
    await sleep(400);
  }
  ok('the Settings modal opens', Boolean(modal), modal ? 'dialog[aria-label="Settings"] visible' : 'no modal in 8s');
  if (!modal) return report();

  ok('it lands on the Agent Hub section (initialSection)', modal.navActive === 'true', 'nav aria-pressed=' + modal.navActive + ', sections=' + modal.navCount);
  ok('the Agent Hub registry header renders inside the modal', Boolean(modal.headerBox) && modal.headerBox.h >= 14, modal.headerBox ? JSON.stringify(modal.headerBox) : 'no Agent Hub header span');
  ok('the live caps chips render (maxAgents/maxConcurrent/maxQueue)', modal.hasCaps, modal.hasCaps ? 'caps text found' : 'caps text missing');
  ok('the slots-used line renders', modal.hasSlots, modal.hasSlots ? 'slots text found' : 'slots text missing');
  ok('the maxSpawnDepth chip renders', modal.hasSpawnDepth, modal.hasSpawnDepth ? 'maxSpawnDepth 3' : 'missing');
  ok('the registry list/empty state renders', modal.hasList, modal.hasList ? 'list state found' : 'no list state');
  ok('+ Create and Refresh registry are present', modal.hasCreate && modal.hasRefresh, 'create=' + modal.hasCreate + ' refresh=' + modal.hasRefresh);
  console.log('  (modal excerpt: ' + modal.snippet.slice(0, 140).replace(/\n/g, ' | ') + ')');

  // 2 ── no pane/tab opened; the rail icon never becomes an active tab.
  const after = await page.evaluate(paneSnapshot);
  ok('no tiling pane opened (pane count unchanged)', after.panes === before.panes, 'before=' + before.panes + ' after=' + after.panes);
  ok('the tiling-tabs snapshot is untouched', after.tabs === before.tabs, 'stored length ' + before.tabs.length + ' -> ' + after.tabs.length);
  ok('the tiling layout snapshot is untouched', after.layout === before.layout, 'layout len ' + before.layout.length + ' -> ' + after.layout.length);
  ok('the Agents rail icon never becomes an active tab', after.railPressed === 'false', 'aria-pressed=' + after.railPressed);

  // 6 ── fits the modal body.
  const fitsHeader = modal.headerBox && modal.panelBox && modal.headerBox.bottom <= modal.panelBox.bottom + 1 && modal.headerBox.right <= modal.panelBox.right + 1;
  ok('the Agent Hub content sits inside the modal panel', Boolean(fitsHeader), 'header=' + JSON.stringify(modal.headerBox) + ' panel=' + JSON.stringify(modal.panelBox));
  ok('the modal body has a usable height', Boolean(modal.bodyBox) && modal.bodyBox.h >= 300, 'body=' + JSON.stringify(modal.bodyBox));
  ok('no horizontal overflow in the modal body', modal.overflowX !== null && modal.overflowX <= 1, 'overflowX=' + modal.overflowX);

  await page.screenshot({ path: '/tmp/req163-agent-hub-modal.png' });
  console.log('screenshot: /tmp/req163-agent-hub-modal.png');

  // 4 ── + Create opens the real dialog; Cancel closes it.
  const createClicked = await page.evaluate(() => {
    const modal = document.querySelector('[role="dialog"][aria-label="Settings"]');
    if (!modal) return false;
    const btn = [].slice.call(modal.querySelectorAll('button')).filter(function (b) {
      return (b.textContent || '').trim() === 'Create';
    })[0];
    if (!btn) return false;
    btn.click();
    return true;
  });
  ok('the + Create button clicks', createClicked, createClicked ? 'create click sent' : 'no Create button');

  let dialog = null;
  for (let i = 0; i < 15; i += 1) {
    dialog = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-label="Create agent"]');
      if (!d) return null;
      return {
        name: Boolean(d.querySelector('#agent-name')),
        persona: Boolean(d.querySelector('#agent-persona')),
        model: Boolean(d.querySelector('#agent-model')),
        cancel: [].slice.call(d.querySelectorAll('button')).some(function (b) { return (b.textContent || '').trim() === 'Cancel'; }),
      };
    });
    if (dialog) break;
    await sleep(300);
  }
  ok('the create-agent dialog opens (real form fields)', Boolean(dialog) && dialog.name && dialog.persona && dialog.model, dialog ? JSON.stringify(dialog) : 'no dialog in 4.5s');

  if (dialog) {
    const cancelled = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-label="Create agent"]');
      if (!d) return false;
      const btn = [].slice.call(d.querySelectorAll('button')).filter(function (b) {
        return (b.textContent || '').trim() === 'Cancel';
      })[0];
      if (!btn) return false;
      btn.click();
      return true;
    });
    await sleep(500);
    const gone = await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Create agent"]'));
    ok('Cancel closes the create dialog (no agent created)', cancelled && gone, 'cancel=' + cancelled + ' gone=' + gone);
  }

  // 5 ── Escape closes the modal.
  const stillOpen = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-label="Settings"]')));
  ok('the Settings modal is still open after the dialog dance', stillOpen, stillOpen ? 'modal alive' : 'modal vanished early');
  await page.keyboard.press('Escape');
  await sleep(700);
  const closedByEsc = await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Settings"]'));
  ok('Escape closes the Settings modal', closedByEsc, closedByEsc ? 'closed' : 'still open');

  // 5b ── reopen via the rail, then a backdrop click closes it.
  await page.evaluate(clickRailAgents);
  let reopened = null;
  for (let i = 0; i < 15; i += 1) {
    reopened = await page.evaluate(modalInfo);
    if (reopened) break;
    await sleep(300);
  }
  ok('the rail reopens the modal on Agent Hub', Boolean(reopened) && reopened.navActive === 'true', reopened ? 'nav aria-pressed=' + reopened.navActive : 'no modal');
  await page.mouse.click(14, 14);
  await sleep(700);
  const closedByBackdrop = await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Settings"]'));
  ok('a backdrop click closes the modal', closedByBackdrop, closedByBackdrop ? 'closed' : 'still open');

  return report();
})().catch((e) => {
  console.error('probe crashed:', e);
  process.exit(2);
});
