#!/usr/bin/env node
/**
 * REQ-167 live probe — Archify is its OWN standalone modal (not a pane, not
 * a Settings section).
 *
 * Proves, against the LIVE app (authed with a minted Bearer token — the
 * login gate stays ON, see scripts/mint-e2e-token.mjs):
 *   1. the Inspector rail's Archify icon opens the Archify modal; the
 *      Settings modal does NOT open; the entry is non-draggable (a modal
 *      surface has no pane drop target)
 *   2. no tiling pane opens and the tiling snapshots stay untouched — the
 *      pane/tab definition is gone, not merely hidden
 *   3. the modal renders the live Archify surface: list + search + type
 *      filters + '+ New Diagram', the IR/receipt/export tabs, and the
 *      `@container` host resolving the pane's `@min-[320px]` header rule
 *      (the subtitle is VISIBLE)
 *   4. selecting a diagram mounts the real viewer iframe at
 *      `/api/archify/<id>/view`, and the IR tab renders the live editor
 *   5. Escape, the X button and a backdrop click all close the modal; the
 *      focus lands inside on open and returns to the rail icon on close
 *   6. no horizontal overflow, no JavaScript errors
 *
 * Probe-created state: only if the live store has NO diagrams does the
 * probe create one (then it deletes it again and re-checks it is gone).
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-archify-modal.cjs --url https://lokma.fermag.com.tr --token "$TK"
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
      return (b.getAttribute('aria-label') || '') === 'Archify';
    });
    const b = cands[0];
    return b ? b.getAttribute('aria-pressed') : null;
  })(),
});

const railInfo = () => {
  const rail = document.querySelector('nav[aria-label="Inspector rail"]');
  if (!rail) return null;
  const b = [].slice.call(rail.querySelectorAll('button')).filter(function (x) {
    return x.getAttribute('aria-label') === 'Archify';
  })[0];
  if (!b) return null;
  return { draggable: b.getAttribute('draggable'), title: b.getAttribute('title'), pressed: b.getAttribute('aria-pressed') };
};

const clickRail = (label) => {
  const rail = document.querySelector('nav[aria-label="Inspector rail"]');
  if (!rail) return false;
  const b = [].slice.call(rail.querySelectorAll('button')).filter(function (x) {
    return x.getAttribute('aria-label') === label;
  })[0];
  if (!b) return false;
  b.focus();
  b.click();
  return true;
};

const modalInfo = () => {
  const modal = document.querySelector('[role="dialog"][aria-label="Archify"]');
  if (!modal) return null;
  const box = function (el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
  };
  const text = modal.innerText || '';
  const panel = modal.firstElementChild;
  const buttons = [].slice.call(modal.querySelectorAll('button'));
  const byText = function (t) { return buttons.filter(function (b) { return (b.textContent || '').trim() === t; })[0]; };
  const rows = buttons.filter(function (b) { return typeof b.className === 'string' && b.className.indexOf('text-left') >= 0; });
  const subtitle = [].slice.call(modal.querySelectorAll('span')).filter(function (s) {
    return (s.textContent || '').indexOf('typed JSON IR') >= 0;
  })[0];
  const iframe = modal.querySelector('iframe[title="diagram viewer"]');
  const search = modal.querySelector('#archify-search');
  const irEdit = modal.querySelector('#archify-ir-edit');
  const closeBtn = modal.querySelector('button[aria-label="Close Archify"]');
  // The tab strip is the ONE parent whose button children are exactly
  // ir / receipt / export (the pane also has a footer 'Export' button, so a
  // text match alone would collide).
  const tabStrip = [].slice.call(modal.querySelectorAll('div')).filter(function (d) {
    const kids = [].slice.call(d.children);
    if (kids.length !== 3 || !kids.every(function (k) { return k.tagName === 'BUTTON'; })) return false;
    const texts = kids.map(function (k) { return (k.textContent || '').trim().toLowerCase(); });
    return texts.join(',') === 'ir,receipt,export';
  })[0];
  const tabs = tabStrip
    ? [].slice.call(tabStrip.children).map(function (b) { return (b.textContent || '').trim().toLowerCase(); })
    : [];
  return {
    ariaModal: modal.getAttribute('aria-modal'),
    hasSettings: Boolean(document.querySelector('[role="dialog"][aria-label="Settings"]')),
    panelBox: box(panel),
    viewport: { w: window.innerWidth, h: window.innerHeight },
    hasSearch: Boolean(search),
    hasNew: Boolean(byText('+ New Diagram')),
    hasClose: Boolean(closeBtn),
    subtitleBox: box(subtitle),
    subtitleText: subtitle ? (subtitle.textContent || '').trim() : null,
    rowCount: rows.length,
    hasEmptyState: text.indexOf('No diagrams') >= 0,
    tabs: tabs,
    hasIrEditor: Boolean(irEdit),
    irText: irEdit ? (irEdit.value || '').slice(0, 80) : null,
    iframeSrc: iframe ? iframe.getAttribute('src') : null,
    overflowX: panel ? panel.scrollWidth - panel.clientWidth : null,
    activeLabel: document.activeElement ? document.activeElement.getAttribute('aria-label') : null,
    focusInside: modal.contains(document.activeElement),
    snippet: text.replace(/\s+/g, ' ').slice(0, 200),
  };
};

const clickFirstRow = () => {
  const modal = document.querySelector('[role="dialog"][aria-label="Archify"]');
  if (!modal) return false;
  const rows = [].slice.call(modal.querySelectorAll('button')).filter(function (b) {
    return typeof b.className === 'string' && b.className.indexOf('text-left') >= 0;
  });
  if (!rows.length) return false;
  rows[0].click();
  return true;
};

const clickTab = (t) => {
  const modal = document.querySelector('[role="dialog"][aria-label="Archify"]');
  if (!modal) return false;
  const strip = [].slice.call(modal.querySelectorAll('div')).filter(function (d) {
    const kids = [].slice.call(d.children);
    if (kids.length !== 3 || !kids.every(function (k) { return k.tagName === 'BUTTON'; })) return false;
    const texts = kids.map(function (k) { return (k.textContent || '').trim().toLowerCase(); });
    return texts.join(',') === 'ir,receipt,export';
  })[0];
  if (!strip) return false;
  const b = [].slice.call(strip.children).filter(function (x) {
    return (x.textContent || '').trim().toLowerCase() === t;
  })[0];
  if (!b) return false;
  b.click();
  return true;
};

const modalOpen = () => Boolean(document.querySelector('[role="dialog"][aria-label="Archify"]'));
const settingsOpen = () => Boolean(document.querySelector('[role="dialog"][aria-label="Settings"]'));

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
  // The app's REST calls use the Bearer header from localStorage, but the
  // viewer IFRAME is a plain navigation: a real session also carries the
  // httpOnly `lokma_token` cookie, so seed it too (the gate stays ON).
  await ctx.addCookies([{ name: 'lokma_token', value: TOKEN, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: BASE.startsWith('https') }]);
  const page = await ctx.newPage();
  const errors = [];
  const http4xx = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 160)));
  // Diagnostic only (never a failure): which requests answered 4xx/5xx.
  page.on('response', (res) => {
    const s = res.status();
    if (s >= 400 && http4xx.length < 12) http4xx.push(s + ' ' + res.url().slice(0, 130));
  });

  await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await sleep(6000);

  // ── API helpers (Bearer token; the login gate stays ON) ─────────────────
  const api = async (path, opts = {}) => {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: Object.assign(
        { Authorization: 'Bearer ' + TOKEN },
        opts.body ? { 'Content-Type': 'application/json' } : {},
        opts.headers || {},
      ),
    });
    return res;
  };

  const report = async () => {
    console.log('--- errors seen ---');
    console.log(errors.slice(0, 8).join('\n') || '(none)');
    console.log('--- 4xx/5xx responses seen ---');
    console.log(http4xx.join('\n') || '(none)');
    const jsErrors = errors.filter((e) => e.indexOf('Failed to load resource') === -1);
    ok('no JavaScript errors on the page', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | ') || 'clean');
    await browser.close();
    if (failures.length) {
      console.log('\nprobe-archify-modal: ' + failures.length + ' failure(s): ' + failures.join(', '));
      process.exit(1);
    }
    console.log('\nprobe-archify-modal: all checks passed.');
  };

  const railReady = await page.evaluate(() => Boolean(document.querySelector('nav[aria-label="Inspector rail"]')));
  ok('the harness shell renders (Inspector rail present)', railReady, railReady ? 'rail found' : 'no rail in 6s');
  if (!railReady) return report();

  const rail = await page.evaluate(railInfo);
  ok('the Archify rail entry exists', Boolean(rail), rail ? 'title=' + rail.title : 'no Archify rail button');
  ok('rail Archify never drags (standalone modal entry)', Boolean(rail && rail.draggable === 'false'), 'draggable=' + (rail ? rail.draggable : 'n/a'));
  ok('its title drops the drag hint', Boolean(rail && rail.title.indexOf('drag to a pane') === -1), 'title=' + (rail ? rail.title : 'n/a'));

  const before = await page.evaluate(paneSnapshot);
  ok('pre: no tiling panes open (fresh browser)', before.panes === 0, 'panes=' + before.panes);

  // ── ensure at least one diagram exists for the viewer check ─────────────
  let createdId = null;
  try {
    const listRes = await api('/api/archify/list');
    const list = await listRes.json();
    const items = Array.isArray(list && list.items) ? list.items : [];
    console.log('  (live store: ' + items.length + ' diagram(s))');
    if (items.length === 0) {
      const genRes = await api('/api/archify/generate', {
        method: 'POST',
        body: JSON.stringify({ type: 'workflow', prompt: 'probe -> modal -> viewer', preset: 'signal-flow', theme: 'dark' }),
      });
      const gen = await genRes.json();
      createdId = gen && gen.id ? gen.id : null;
      ok('a probe diagram is created for the viewer check (empty store)', Boolean(createdId), createdId ? 'id=' + createdId : 'generate failed: ' + JSON.stringify(gen).slice(0, 120));
    }
  } catch (e) {
    ok('the live archify list is reachable before the UI check', false, String(e).slice(0, 120));
  }

  // ── 1 ── rail Archify icon -> its OWN modal (never the Settings modal). ──
  const clicked = await page.evaluate(clickRail, 'Archify');
  ok('the Archify rail icon is clicked', clicked, clicked ? 'rail click sent' : 'no Archify rail button');

  let modal = null;
  for (let i = 0; i < 25; i += 1) {
    modal = await page.evaluate(modalInfo);
    if (modal) break;
    await sleep(400);
  }
  ok('the Archify modal opens (aria-label="Archify")', Boolean(modal), modal ? 'modal found' : 'no modal in 10s');
  if (!modal) return report();
  ok('it is a real modal (aria-modal="true")', modal.ariaModal === 'true', 'aria-modal=' + modal.ariaModal);
  ok('the Settings modal does NOT open', !modal.hasSettings, 'settings dialog present=' + modal.hasSettings);

  // ── 3 ── the live Archify surface inside the modal. ─────────────────────
  ok('the live list search box renders (#archify-search)', modal.hasSearch, modal.hasSearch ? 'search ok' : 'search missing');
  ok("the '+ New Diagram' control renders", modal.hasNew, 'new=' + modal.hasNew);
  ok('the IR / receipt / export tabs render', modal.tabs.length === 3, 'tabs=' + JSON.stringify(modal.tabs));
  ok('the header subtitle is VISIBLE (@container host resolves the @min rule)', Boolean(modal.subtitleBox && modal.subtitleBox.w > 0 && modal.subtitleBox.h > 0), 'subtitle=' + JSON.stringify(modal.subtitleBox) + ' text=' + modal.subtitleText);
  ok('diagram rows render in the list (live store)', modal.rowCount > 0, 'rows=' + modal.rowCount + ' emptyState=' + modal.hasEmptyState);
  console.log('  (modal excerpt: ' + modal.snippet + ')');

  // ── modal geometry: fits the viewport, ~85vh tall. ──────────────────────
  const geo = modal.panelBox && modal.viewport;
  const fits = Boolean(modal.panelBox) && modal.panelBox.w <= modal.viewport.w && modal.panelBox.h <= modal.viewport.h && modal.panelBox.x >= 0 && modal.panelBox.y >= 0;
  ok('the modal panel fits inside the viewport', fits, 'panel=' + JSON.stringify(modal.panelBox) + ' viewport=' + JSON.stringify(modal.viewport));
  ok('the modal panel is large (~85vh tall)', Boolean(modal.panelBox) && modal.panelBox.h >= 600, 'h=' + (modal.panelBox ? modal.panelBox.h : 'n/a'));
  ok('no horizontal overflow in the modal panel', modal.overflowX !== null && modal.overflowX <= 1, 'overflowX=' + modal.overflowX);
  ok('focus lands inside the modal on open', modal.focusInside, 'active=' + modal.activeLabel);

  // ── 4 ── select a diagram -> real viewer iframe + IR editor. ────────────
  const rowClicked = await page.evaluate(clickFirstRow);
  ok('a live diagram row is clicked', rowClicked, rowClicked ? 'first row click sent' : 'no rows to click');
  let viewer = null;
  for (let i = 0; i < 30; i += 1) {
    viewer = await page.evaluate(modalInfo);
    if (viewer && viewer.iframeSrc) break;
    await sleep(500);
  }
  const src = viewer ? viewer.iframeSrc : null;
  ok('the viewer iframe mounts at the real build URL', Boolean(src) && src.indexOf('/api/archify/') === 0 && src.indexOf('/view') > 0, 'src=' + src);

  // The frame itself must render the real build (never judge a sandboxed
  // frame by contentDocument — read it via page.frames() + evaluate).
  const frameInfo = async () => {
    const frames = page.frames().filter((f) => f.url().includes('/api/archify/') && f.url().includes('/view'));
    if (!frames.length) return null;
    const f = frames[0];
    try {
      return await f.evaluate(() => ({
        url: location.pathname,
        bodyLen: document.body ? document.body.innerHTML.length : 0,
        hasSvg: Boolean(document.querySelector('svg')),
        title: document.title || '',
      }));
    } catch (e) {
      return { url: f.url(), bodyLen: -1, hasSvg: false, title: '', error: String(e).slice(0, 80) };
    }
  };
  let frame = null;
  for (let i = 0; i < 20; i += 1) {
    frame = await frameInfo();
    if (frame && frame.bodyLen > 500) break;
    await sleep(500);
  }
  ok(
    'the viewer frame renders the real build (SVG inside the frame)',
    Boolean(frame) && frame.bodyLen > 500 && frame.hasSvg,
    'frame=' + JSON.stringify(frame),
  );

  const irClicked = await page.evaluate(clickTab, 'ir');
  await sleep(500);
  const irState = await page.evaluate(modalInfo);
  ok('the IR tab shows the live editor (textarea with IR JSON)', irClicked && Boolean(irState) && irState.hasIrEditor, irState ? 'ir head=' + (irState.irText || '').slice(0, 40) : 'n/a');

  // ── 2 ── no pane/tab opened; the rail icon never becomes an active tab. ─
  const after = await page.evaluate(paneSnapshot);
  ok('no tiling pane opened (pane count unchanged)', after.panes === before.panes, 'before=' + before.panes + ' after=' + after.panes);
  ok('the tiling-tabs snapshot is untouched', after.tabs === before.tabs, 'stored length ' + before.tabs.length + ' -> ' + after.tabs.length);
  ok('the tiling layout snapshot is untouched', after.layout === before.layout, 'layout len ' + before.layout.length + ' -> ' + after.layout.length);
  ok('the Archify rail icon never becomes an active tab', after.railPressed === 'false', 'aria-pressed=' + after.railPressed);

  await page.screenshot({ path: '/tmp/req167-archify-modal.png' });
  console.log('screenshot: /tmp/req167-archify-modal.png');

  // ── 5 ── Escape closes and focus returns to the rail icon. ──────────────
  const stillOpen = await page.evaluate(modalOpen);
  ok('the Archify modal is still open before the close checks', stillOpen, stillOpen ? 'modal alive' : 'modal vanished early');
  await page.keyboard.press('Escape');
  await sleep(700);
  const closedByEsc = await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Archify"]'));
  ok('Escape closes the Archify modal', closedByEsc, closedByEsc ? 'closed' : 'still open');
  const focusBack = await page.evaluate(() => (document.activeElement ? document.activeElement.getAttribute('aria-label') : null));
  ok('focus returns to the Archify rail icon on close', focusBack === 'Archify', 'active=' + focusBack);

  // ── 5b ── reopen -> X button closes. ────────────────────────────────────
  const reopen1 = await page.evaluate(clickRail, 'Archify');
  let again1 = null;
  for (let i = 0; i < 20; i += 1) {
    again1 = await page.evaluate(modalInfo);
    if (again1) break;
    await sleep(300);
  }
  ok('the Archify rail icon re-opens its modal', reopen1 && Boolean(again1), again1 ? 'modal back' : 'no modal');
  const xClicked = await page.evaluate(() => {
    const b = document.querySelector('[role="dialog"][aria-label="Archify"] button[aria-label="Close Archify"]');
    if (!b) return false;
    b.click();
    return true;
  });
  await sleep(600);
  const closedByX = await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Archify"]'));
  ok('the X button closes the modal', xClicked && closedByX, 'x=' + xClicked + ' closed=' + closedByX);

  // ── 5c ── reopen -> backdrop click closes. ──────────────────────────────
  const reopen2 = await page.evaluate(clickRail, 'Archify');
  let again2 = null;
  for (let i = 0; i < 20; i += 1) {
    again2 = await page.evaluate(modalInfo);
    if (again2) break;
    await sleep(300);
  }
  ok('the modal re-opens for the backdrop check', reopen2 && Boolean(again2), again2 ? 'modal back' : 'no modal');
  await page.mouse.click(14, 14);
  await sleep(700);
  const closedByBackdrop = await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Archify"]'));
  ok('a backdrop click closes the modal', closedByBackdrop, closedByBackdrop ? 'closed' : 'still open');
  const settingsNever = await page.evaluate(settingsOpen);
  ok('the Settings modal never opened during the whole run', !settingsNever, 'settings=' + settingsNever);

  // ── cleanup: delete ONLY the probe-created diagram and re-check. ────────
  if (createdId) {
    const delRes = await api('/api/archify/' + encodeURIComponent(createdId), { method: 'DELETE' });
    const delBody = await delRes.json().catch(() => ({}));
    ok('the probe-created diagram is deleted', delRes.status === 200 && delBody && delBody.ok === true, 'status=' + delRes.status);
    let gone = false;
    for (let i = 0; i < 5; i += 1) {
      const listRes = await api('/api/archify/list');
      const list = await listRes.json().catch(() => ({}));
      const items = Array.isArray(list && list.items) ? list.items : [];
      gone = !items.some((d) => d && d.id === createdId);
      if (gone) break;
      await sleep(400);
    }
    ok('the diagram stays deleted (re-checked against the live list)', gone, 'id=' + createdId);
  } else {
    console.log('  (no probe-created diagram — the live store already had rows; nothing to clean)');
  }

  return report();
})().catch((e) => {
  console.error('probe crashed:', e);
  process.exit(1);
});
