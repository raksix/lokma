#!/usr/bin/env node
/**
 * REQ-165 live probe — Vault + Memory are Settings MODAL sections, not panes.
 *
 * Proves, against the LIVE app (authed with a minted Bearer token — the
 * login gate stays ON, see scripts/mint-e2e-token.mjs):
 *   1. the Inspector rail's Vault icon opens the Settings modal on the Vault
 *      section (shares the RAIL_MODAL_SECTIONS map), and the Memory icon
 *      lands on Memory the same way
 *   2. no tiling pane opens and the tiling snapshots stay untouched — the
 *      pane/tab definitions are gone, not merely hidden; both rail entries
 *      are non-draggable (modal surfaces have no pane drop target)
 *   3. the modal renders the LIVE Vault pane (search box, folder filter,
 *      depth slider, New/Refresh, 2D/3D toggle, live SVG graph, FTS5 footer)
 *      — real surfaces, no dead buttons — and the @container host resolves
 *      the pane's @min-* rules (the notes meta line/path label are VISIBLE)
 *   4. the Memory section renders live (Store usage progressbar, MEMORY.md /
 *      USER.md target toggle, entry search + add form)
 *   5. Vault <-> Memory switching works inside the same modal; the nav now
 *      carries 16 sections
 *   6. the ACTIVITY BAR Vault icon opens the same modal section (desktop
 *      left rail), Escape and a backdrop click close the modal, and the
 *      section fits the modal body with no horizontal overflow
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-vault-memory-modal.cjs --url https://lokma.fermag.com.tr --token "$TK"
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
      return (b.getAttribute('aria-label') || '') === 'Vault';
    });
    const b = cands.filter(function (x) { return x.hasAttribute('aria-pressed'); })[0] || cands[0];
    return b ? b.getAttribute('aria-pressed') : null;
  })(),
});

const railsInfo = () => {
  const pick = function (nav, label) {
    if (!nav) return null;
    const b = [].slice.call(nav.querySelectorAll('button')).filter(function (x) { return x.getAttribute('aria-label') === label; })[0];
    if (!b) return null;
    return {
      draggable: b.getAttribute('draggable'),
      title: b.getAttribute('title'),
      pressed: b.getAttribute('aria-pressed'),
    };
  };
  const rail = document.querySelector('nav[aria-label="Inspector rail"]');
  const bar = document.querySelector('nav[aria-label="Activity bar"]');
  return {
    railVault: pick(rail, 'Vault'),
    railMemory: pick(rail, 'Memory'),
    barVault: pick(bar, 'Vault'),
  };
};

const vaultInfo = () => {
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
  const vaultBtn = navBtn('Vault');
  const memoryBtn = navBtn('Memory');
  const search = modal.querySelector('#vault-search');
  const depth = modal.querySelector('#vault-depth');
  const graph = modal.querySelector('svg[role="img"]');
  const metaSpan = [].slice.call(modal.querySelectorAll('span')).filter(function (s) {
    return (s.textContent || '').indexOf('file vault \u00b7') >= 0;
  })[0];
  const body = [].slice.call(modal.querySelectorAll('div')).filter(function (d) {
    return typeof d.className === 'string' && d.className.indexOf('overflow-y-auto') >= 0 && d.className.indexOf('p-4') >= 0;
  })[0];
  const buttons = [].slice.call(modal.querySelectorAll('button'));
  const byLabel = function (l) { return buttons.filter(function (b) { return b.getAttribute('aria-label') === l; })[0]; };
  const byText = function (t) { return buttons.filter(function (b) { return (b.textContent || '').trim() === t; })[0]; };
  const headerSpan = [].slice.call(modal.querySelectorAll('span')).filter(function (s) {
    return (s.textContent || '').trim() === 'Vault';
  })[0];
  return {
    navVault: vaultBtn ? vaultBtn.getAttribute('aria-pressed') : null,
    navMemory: memoryBtn ? memoryBtn.getAttribute('aria-pressed') : null,
    navCount: nav ? nav.querySelectorAll('button').length : 0,
    headerBox: box(headerSpan),
    hasSearch: Boolean(search) && (search.getAttribute('placeholder') || '').indexOf('Vault ara') === 0,
    searchBox: box(search),
    hasFolder: Boolean(modal.querySelector('#vault-folder')),
    hasDepth: Boolean(depth),
    depthBox: box(depth),
    hasNew: Boolean(byLabel('New vault note')),
    hasRefresh: Boolean(byLabel('Refresh vault graph')),
    has2d: Boolean(byText('2D')),
    has3d: Boolean(byText('3D')),
    hasNewForm: Boolean(modal.querySelector('#vault-note-path') || byLabel('Save note')),
    metaBox: box(metaSpan),
    metaText: metaSpan ? (metaSpan.textContent || '').trim() : null,
    graphBox: box(graph),
    graphLabel: graph ? graph.getAttribute('aria-label') : null,
    hasFts: text.indexOf('FTS5 full-text') >= 0,
    bodyBox: box(body),
    overflowX: body ? body.scrollWidth - body.clientWidth : null,
    panelBox: box(modal.firstElementChild),
    snippet: text.slice(0, 200),
  };
};

const memoryInfo = () => {
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
  const memoryBtn = navBtn('Memory');
  const bar = modal.querySelector('#memory-usage-bar');
  const add = modal.querySelector('#memory-add');
  const search = modal.querySelector('#memory-search');
  const heading = [].slice.call(modal.querySelectorAll('h3')).filter(function (h) {
    return (h.textContent || '').trim() === 'Memory';
  })[0];
  const buttons = [].slice.call(modal.querySelectorAll('button'));
  const targetLabels = buttons.map(function (b) { return (b.textContent || '').trim(); }).filter(function (t) {
    return t === 'MEMORY.md' || t === 'USER.md';
  });
  const body = [].slice.call(modal.querySelectorAll('div')).filter(function (d) {
    return typeof d.className === 'string' && d.className.indexOf('overflow-y-auto') >= 0 && d.className.indexOf('p-4') >= 0;
  })[0];
  return {
    navMemory: memoryBtn ? memoryBtn.getAttribute('aria-pressed') : null,
    hasHeading: Boolean(heading),
    headingBox: box(heading),
    hasUsageBar: Boolean(bar) && bar.getAttribute('role') === 'progressbar',
    usageNow: bar ? bar.getAttribute('aria-valuenow') : null,
    hasStoreUsage: text.indexOf('Store usage') >= 0,
    hasCharsLine: text.indexOf('chars \u00b7') >= 0 && text.indexOf('left') >= 0,
    hasTargets: targetLabels.length === 2,
    targetLabels: targetLabels.join('+'),
    hasAdd: Boolean(add) && (add.getAttribute('placeholder') || '').indexOf('E.g. User prefers') === 0,
    addBox: box(add),
    hasSearch: Boolean(search),
    overflowX: body ? body.scrollWidth - body.clientWidth : null,
    bodyBox: box(body),
    panelBox: box(modal.firstElementChild),
    snippet: text.slice(0, 200),
  };
};

const clickRail = (label) => {
  const cands = [].slice.call(document.querySelectorAll('nav[aria-label="Inspector rail"] button')).filter(function (b) {
    return (b.getAttribute('aria-label') || '') === label;
  });
  const b = cands.filter(function (x) { return x.hasAttribute('aria-pressed'); })[0] || cands[0];
  if (!b) return false;
  b.click();
  return true;
};

const clickActivity = (label) => {
  const bar = document.querySelector('nav[aria-label="Activity bar"]');
  if (!bar) return false;
  const b = [].slice.call(bar.querySelectorAll('button')).filter(function (x) {
    return (x.getAttribute('aria-label') || '') === label;
  })[0];
  if (!b) return false;
  b.click();
  return true;
};

const navSection = (label) => {
  const nav = document.querySelector('[role="dialog"][aria-label="Settings"] nav[aria-label="Settings sections"]');
  if (!nav) return false;
  const b = [].slice.call(nav.querySelectorAll('button')).filter(function (x) {
    return (x.getAttribute('aria-label') || '') === label;
  })[0];
  if (!b) return false;
  b.click();
  return true;
};

const modalOpen = () => Boolean(document.querySelector('[role="dialog"][aria-label="Settings"]'));

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
      console.log('\nprobe-vault-memory-modal: ' + failures.length + ' failure(s): ' + failures.join(', '));
      process.exit(1);
    }
    console.log('\nprobe-vault-memory-modal: all checks passed.');
  };

  const railReady = await page.evaluate(() => Boolean(document.querySelector('nav[aria-label="Inspector rail"]')));
  ok('the harness shell renders (Inspector rail present)', railReady, railReady ? 'rail found' : 'no rail in 6s');
  if (!railReady) return report();

  const rails = await page.evaluate(railsInfo);
  ok('the Vault rail entry exists', Boolean(rails.railVault), rails.railVault ? 'title=' + rails.railVault.title : 'no Vault rail button');
  ok('the Memory rail entry exists', Boolean(rails.railMemory), rails.railMemory ? 'title=' + rails.railMemory.title : 'no Memory rail button');
  ok('the Vault activity-bar entry exists', Boolean(rails.barVault), rails.barVault ? 'title=' + rails.barVault.title : 'no Vault activity button');
  ok('rail Vault never drags (modal entry)', Boolean(rails.railVault && rails.railVault.draggable === 'false'), 'draggable=' + (rails.railVault ? rails.railVault.draggable : 'n/a'));
  ok('rail Memory never drags (modal entry)', Boolean(rails.railMemory && rails.railMemory.draggable === 'false'), 'draggable=' + (rails.railMemory ? rails.railMemory.draggable : 'n/a'));
  ok('activity Vault never drags (modal entry)', Boolean(rails.barVault && rails.barVault.draggable === 'false'), 'draggable=' + (rails.barVault ? rails.barVault.draggable : 'n/a'));
  ok('modal titles drop the drag hint', Boolean(rails.railVault && rails.railVault.title.indexOf('drag to a pane') === -1 && rails.barVault && rails.barVault.title.indexOf('drag to a pane') === -1), 'rail=' + (rails.railVault ? rails.railVault.title : 'n/a'));

  const before = await page.evaluate(paneSnapshot);
  ok('pre: no tiling panes open (fresh browser)', before.panes === 0, 'panes=' + before.panes);

  // 1 ── rail Vault icon -> Settings modal, Vault section.
  const clicked = await page.evaluate(clickRail, 'Vault');
  ok('the Vault rail icon is clicked', clicked, clicked ? 'rail click sent' : 'no Vault rail button');

  let vault = null;
  for (let i = 0; i < 20; i += 1) {
    vault = await page.evaluate(vaultInfo);
    if (vault) break;
    await sleep(400);
  }
  ok('the Settings modal opens on the Vault section', Boolean(vault) && vault.navVault === 'true', vault ? 'nav aria-pressed=' + vault.navVault : 'no modal in 8s');
  if (!vault) return report();
  ok('the section nav has 16 sections (Vault added)', vault.navCount === 16, 'sections=' + vault.navCount);
  ok('the Vault header renders inside the modal', Boolean(vault.headerBox) && vault.headerBox.h >= 14, vault.headerBox ? JSON.stringify(vault.headerBox) : 'no Vault header span');

  // 3 ── the LIVE vault surface.
  ok('the live vault search box renders (#vault-search)', vault.hasSearch, vault.hasSearch ? 'placeholder ok' : 'search missing');
  ok('the folder filter + depth slider render', vault.hasFolder && vault.hasDepth, 'folder=' + vault.hasFolder + ' depth=' + vault.hasDepth);
  ok('the New/Refresh + 2D/3D controls render', vault.hasNew && vault.hasRefresh && vault.has2d && vault.has3d, 'new=' + vault.hasNew + ' refresh=' + vault.hasRefresh + ' 2d=' + vault.has2d + ' 3d=' + vault.has3d);
  ok('the live SVG graph renders with its aria-label', Boolean(vault.graphBox && vault.graphBox.w > 0 && vault.graphBox.h > 0 && vault.graphLabel && vault.graphLabel.indexOf('Vault graph') === 0), 'box=' + JSON.stringify(vault.graphBox) + ' label=' + vault.graphLabel);
  ok('the FTS5 footer line renders', vault.hasFts, vault.hasFts ? 'footer text found' : 'footer missing');
  ok('the notes meta line is VISIBLE (@container host resolves the @min rule)', Boolean(vault.metaBox && vault.metaBox.w > 0 && vault.metaBox.h > 0), 'meta=' + JSON.stringify(vault.metaBox) + ' text=' + vault.metaText);
  console.log('  (modal excerpt: ' + vault.snippet.replace(/\n/g, ' | ') + ')');

  // 2 ── no pane/tab opened; the rail icon never becomes an active tab.
  const after = await page.evaluate(paneSnapshot);
  ok('no tiling pane opened (pane count unchanged)', after.panes === before.panes, 'before=' + before.panes + ' after=' + after.panes);
  ok('the tiling-tabs snapshot is untouched', after.tabs === before.tabs, 'stored length ' + before.tabs.length + ' -> ' + after.tabs.length);
  ok('the tiling layout snapshot is untouched', after.layout === before.layout, 'layout len ' + before.layout.length + ' -> ' + after.layout.length);
  ok('the Vault rail icon never becomes an active tab', after.railPressed === 'false', 'aria-pressed=' + after.railPressed);

  // 6 ── fits the modal body.
  const fits = vault.searchBox && vault.panelBox && vault.searchBox.right <= vault.panelBox.right + 1 && vault.searchBox.bottom <= vault.panelBox.bottom + 1;
  ok('the Vault content sits inside the modal panel', Boolean(fits), 'search=' + JSON.stringify(vault.searchBox) + ' panel=' + JSON.stringify(vault.panelBox));
  ok('the modal body has a usable height', Boolean(vault.bodyBox) && vault.bodyBox.h >= 300, 'body=' + JSON.stringify(vault.bodyBox));
  ok('no horizontal overflow in the modal body (vault)', vault.overflowX !== null && vault.overflowX <= 1, 'overflowX=' + vault.overflowX);

  await page.screenshot({ path: '/tmp/req165-vault-modal.png' });
  console.log('screenshot: /tmp/req165-vault-modal.png');

  // 5 ── Vault <-> Memory switching in the same modal.
  const memClicked = await page.evaluate(navSection, 'Memory');
  let mem = null;
  for (let i = 0; i < 15; i += 1) {
    mem = await page.evaluate(memoryInfo);
    if (mem && mem.navMemory === 'true' && mem.hasUsageBar) break;
    await sleep(300);
  }
  ok('the nav switches to the Memory section', memClicked && Boolean(mem) && mem.navMemory === 'true', mem ? 'nav aria-pressed=' + mem.navMemory : 'no modal');
  ok('the live memory usage bar renders (#memory-usage-bar)', Boolean(mem) && mem.hasUsageBar && typeof mem.usageNow === 'string', mem ? 'aria-valuenow=' + mem.usageNow : 'n/a');
  ok('the Store usage + chars line render', Boolean(mem) && mem.hasStoreUsage && mem.hasCharsLine, mem ? 'usage=' + mem.hasStoreUsage + ' chars=' + mem.hasCharsLine : 'n/a');
  ok('the MEMORY.md / USER.md target toggle renders', Boolean(mem) && mem.hasTargets, mem ? 'targets=' + mem.targetLabels : 'n/a');
  ok('the entry search + add form render', Boolean(mem) && mem.hasSearch && mem.hasAdd, mem ? 'search=' + mem.hasSearch + ' add=' + mem.hasAdd : 'n/a');
  ok('no horizontal overflow in the modal body (memory)', Boolean(mem) && mem.overflowX !== null && mem.overflowX <= 1, mem ? 'overflowX=' + mem.overflowX : 'n/a');
  console.log('  (modal excerpt: ' + (mem ? mem.snippet.replace(/\n/g, ' | ') : 'n/a') + ')');

  await page.screenshot({ path: '/tmp/req165-memory-modal.png' });
  console.log('screenshot: /tmp/req165-memory-modal.png');

  const backClicked = await page.evaluate(navSection, 'Vault');
  let back = null;
  for (let i = 0; i < 15; i += 1) {
    back = await page.evaluate(vaultInfo);
    if (back && back.navVault === 'true' && back.hasSearch) break;
    await sleep(300);
  }
  ok('switching back re-renders Vault (search visible again)', backClicked && Boolean(back) && back.navVault === 'true' && back.hasSearch, back ? 'pressed=' + back.navVault + ' search=' + back.hasSearch : 'no modal');

  // 6 ── Escape closes the modal.
  const stillOpen = await page.evaluate(modalOpen);
  ok('the Settings modal is still open before the close checks', stillOpen, stillOpen ? 'modal alive' : 'modal vanished early');
  await page.keyboard.press('Escape');
  await sleep(700);
  const closedByEsc = await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Settings"]'));
  ok('Escape closes the Settings modal', closedByEsc, closedByEsc ? 'closed' : 'still open');

  // 6b ── the ACTIVITY BAR Vault entry opens the same modal section.
  const actClicked = await page.evaluate(clickActivity, 'Vault');
  let act = null;
  for (let i = 0; i < 15; i += 1) {
    act = await page.evaluate(vaultInfo);
    if (act) break;
    await sleep(300);
  }
  ok('the activity-bar Vault icon opens the modal on Vault', actClicked && Boolean(act) && act.navVault === 'true', act ? 'nav aria-pressed=' + act.navVault : 'no modal');
  await page.mouse.click(14, 14);
  await sleep(700);
  const closedByBackdrop = await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Settings"]'));
  ok('a backdrop click closes the modal', closedByBackdrop, closedByBackdrop ? 'closed' : 'still open');

  const end = await page.evaluate(paneSnapshot);
  ok('still no tiling pane after the whole run', end.panes === 0, 'panes=' + end.panes);

  return report();
})().catch((e) => {
  console.error('probe crashed:', e);
  process.exit(2);
});
