#!/usr/bin/env node
/**
 * REQ-166 live probe — Skills is a Settings MODAL section, not a pane.
 *
 * Proves, against the LIVE app (authed with a minted Bearer token — the
 * login gate stays ON, see scripts/mint-e2e-token.mjs):
 *   1. the Inspector rail's Skills icon opens the Settings modal on the
 *      Skills section (shares the RAIL_MODAL_SECTIONS map); the entry is
 *      non-draggable (a modal surface has no pane drop target)
 *   2. no tiling pane opens and the tiling snapshots stay untouched — the
 *      pane/tab definitions are gone, not merely hidden
 *   3. the modal renders the LIVE Skills pane: registry search box, the
 *      count chip, Refresh, plus the @container host resolving the pane's
 *      `@min-[320px]` header rule (the subtitle is VISIBLE)
 *   4. a real skill row loads its real SKILL.md through `GET /api/skills/:id`
 *      (detail header + preview text), the Patch editor opens its real
 *      old/new textareas, and the telemetry card renders
 *   5. section switching stays healthy (Skills -> Plugins -> Skills) and the
 *      nav now carries 17 sections
 *   6. Escape and a backdrop click close the modal; no horizontal overflow,
 *      no JavaScript errors
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-skills-modal.cjs --url https://lokma.fermag.com.tr --token "$TK"
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
      return (b.getAttribute('aria-label') || '') === 'Skills';
    });
    const b = cands.filter(function (x) { return x.hasAttribute('aria-pressed'); })[0] || cands[0];
    return b ? b.getAttribute('aria-pressed') : null;
  })(),
});

const railInfo = () => {
  const rail = document.querySelector('nav[aria-label="Inspector rail"]');
  if (!rail) return null;
  const b = [].slice.call(rail.querySelectorAll('button')).filter(function (x) {
    return x.getAttribute('aria-label') === 'Skills';
  })[0];
  if (!b) return null;
  return { draggable: b.getAttribute('draggable'), title: b.getAttribute('title'), pressed: b.getAttribute('aria-pressed') };
};

const skillsInfo = () => {
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
  const skillsBtn = navBtn('Skills');
  const search = modal.querySelector('#skills-search');
  const buttons = [].slice.call(modal.querySelectorAll('button'));
  const byText = function (t) { return buttons.filter(function (b) { return (b.textContent || '').trim() === t; })[0]; };
  const rows = buttons.filter(function (b) { return typeof b.className === 'string' && b.className.indexOf('text-left') >= 0; });
  const subtitle = [].slice.call(modal.querySelectorAll('span')).filter(function (s) {
    return (s.textContent || '').indexOf('auto-discovery') >= 0;
  })[0];
  const countChip = [].slice.call(modal.querySelectorAll('span')).filter(function (s) {
    return /^\d+ skills$/.test((s.textContent || '').trim());
  })[0];
  const body = [].slice.call(modal.querySelectorAll('div')).filter(function (d) {
    return typeof d.className === 'string' && d.className.indexOf('overflow-y-auto') >= 0 && d.className.indexOf('p-4') >= 0;
  })[0];
  return {
    navSkills: skillsBtn ? skillsBtn.getAttribute('aria-pressed') : null,
    navCount: nav ? nav.querySelectorAll('button').length : 0,
    hasSearch: Boolean(search) && (search.getAttribute('placeholder') || '').indexOf('Search skills') === 0,
    searchBox: box(search),
    hasRegistryBtn: Boolean(byText('Registry')),
    hasMarketBtn: Boolean(byText('Marketplace')),
    hasRefresh: buttons.some(function (b) { return (b.textContent || '').indexOf('Refresh registry') >= 0; }),
    countChip: countChip ? (countChip.textContent || '').trim() : null,
    rowCount: rows.length,
    subtitleBox: box(subtitle),
    subtitleText: subtitle ? (subtitle.textContent || '').trim() : null,
    hasTelemetry: text.indexOf('Telemetry — .usage.json') >= 0,
    hasAvailable: text.indexOf('Injected every turn') >= 0,
    hasEmptyState: text.indexOf('No skills in the registry') >= 0,
    bodyBox: box(body),
    overflowX: body ? body.scrollWidth - body.clientWidth : null,
    panelBox: box(modal.firstElementChild),
    snippet: text.slice(0, 220),
  };
};

const detailInfo = () => {
  const modal = document.querySelector('[role="dialog"][aria-label="Settings"]');
  if (!modal) return null;
  const buttons = [].slice.call(modal.querySelectorAll('button'));
  const byText = function (t) { return buttons.filter(function (b) { return (b.textContent || '').trim() === t; })[0]; };
  const pres = [].slice.call(modal.querySelectorAll('pre'));
  const skillPre = pres.filter(function (p) { return (p.textContent || '').indexOf('# ') >= 0; })[0] || pres[0];
  const text = modal.innerText || '';
  const patchOld = modal.querySelector('#skill-patch-old');
  const patchNew = modal.querySelector('#skill-patch-new');
  return {
    hasSkillViewBtn: Boolean(byText('skill_view')),
    hasPatchBtn: Boolean(byText('Patch')),
    hasRecordBtn: Boolean(buttons.some(function (b) { return (b.textContent || '').indexOf('Record use') >= 0; })),
    preCount: pres.length,
    previewLen: skillPre ? (skillPre.textContent || '').length : 0,
    previewHead: skillPre ? (skillPre.textContent || '').slice(0, 60).replace(/\n/g, ' ') : null,
    hasPatchEditor: Boolean(patchOld && patchNew),
    hasTelemetry: text.indexOf('Telemetry — .usage.json') >= 0,
    hasAvailable: text.indexOf('<available_skills>') >= 0,
    hasLoading: text.indexOf('Loading SKILL.md') >= 0,
    hasDetailError: text.indexOf('skill_view failed') >= 0,
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

const clickFirstRow = () => {
  const modal = document.querySelector('[role="dialog"][aria-label="Settings"]');
  if (!modal) return false;
  const rows = [].slice.call(modal.querySelectorAll('button')).filter(function (b) {
    return typeof b.className === 'string' && b.className.indexOf('text-left') >= 0;
  });
  if (!rows.length) return false;
  rows[0].click();
  return true;
};

const clickButtonByText = (t) => {
  const modal = document.querySelector('[role="dialog"][aria-label="Settings"]');
  if (!modal) return false;
  const b = [].slice.call(modal.querySelectorAll('button')).filter(function (x) {
    return (x.textContent || '').trim() === t;
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
      console.log('\nprobe-skills-modal: ' + failures.length + ' failure(s): ' + failures.join(', '));
      process.exit(1);
    }
    console.log('\nprobe-skills-modal: all checks passed.');
  };

  const railReady = await page.evaluate(() => Boolean(document.querySelector('nav[aria-label="Inspector rail"]')));
  ok('the harness shell renders (Inspector rail present)', railReady, railReady ? 'rail found' : 'no rail in 6s');
  if (!railReady) return report();

  const rail = await page.evaluate(railInfo);
  ok('the Skills rail entry exists', Boolean(rail), rail ? 'title=' + rail.title : 'no Skills rail button');
  ok('rail Skills never drags (modal entry)', Boolean(rail && rail.draggable === 'false'), 'draggable=' + (rail ? rail.draggable : 'n/a'));
  ok('its title drops the drag hint', Boolean(rail && rail.title.indexOf('drag to a pane') === -1), 'title=' + (rail ? rail.title : 'n/a'));

  const before = await page.evaluate(paneSnapshot);
  ok('pre: no tiling panes open (fresh browser)', before.panes === 0, 'panes=' + before.panes);

  // 1 ── rail Skills icon -> Settings modal, Skills section.
  const clicked = await page.evaluate(clickRail, 'Skills');
  ok('the Skills rail icon is clicked', clicked, clicked ? 'rail click sent' : 'no Skills rail button');

  let skills = null;
  for (let i = 0; i < 20; i += 1) {
    skills = await page.evaluate(skillsInfo);
    if (skills) break;
    await sleep(400);
  }
  ok('the Settings modal opens on the Skills section', Boolean(skills) && skills.navSkills === 'true', skills ? 'nav aria-pressed=' + skills.navSkills : 'no modal in 8s');
  if (!skills) return report();
  ok('the section nav has 17 sections (Skills added)', skills.navCount === 17, 'sections=' + skills.navCount);

  // 3 ── the LIVE skills surface.
  ok('the live registry search box renders (#skills-search)', skills.hasSearch, skills.hasSearch ? 'placeholder ok' : 'search missing');
  ok('the Registry/Marketplace controls render', skills.hasRegistryBtn && skills.hasMarketBtn, 'registry=' + skills.hasRegistryBtn + ' market=' + skills.hasMarketBtn);
  ok('the Refresh registry control renders', skills.hasRefresh, 'refresh=' + skills.hasRefresh);
  ok('the skill count chip renders (live rows)', Boolean(skills.countChip), 'chip=' + skills.countChip);
  ok('skill rows render in the list', skills.rowCount > 0, 'rows=' + skills.rowCount);
  ok('the header subtitle is VISIBLE (@container host resolves the @min rule)', Boolean(skills.subtitleBox && skills.subtitleBox.w > 0 && skills.subtitleBox.h > 0), 'subtitle=' + JSON.stringify(skills.subtitleBox) + ' text=' + skills.subtitleText);
  console.log('  (modal excerpt: ' + skills.snippet.replace(/\n/g, ' | ') + ')');

  // 2 ── no pane/tab opened; the rail icon never becomes an active tab.
  const after = await page.evaluate(paneSnapshot);
  ok('no tiling pane opened (pane count unchanged)', after.panes === before.panes, 'before=' + before.panes + ' after=' + after.panes);
  ok('the tiling-tabs snapshot is untouched', after.tabs === before.tabs, 'stored length ' + before.tabs.length + ' -> ' + after.tabs.length);
  ok('the tiling layout snapshot is untouched', after.layout === before.layout, 'layout len ' + before.layout.length + ' -> ' + after.layout.length);
  ok('the Skills rail icon never becomes an active tab', after.railPressed === 'false', 'aria-pressed=' + after.railPressed);

  // 6 ── fits the modal body.
  const fits = skills.searchBox && skills.panelBox && skills.searchBox.right <= skills.panelBox.right + 1 && skills.searchBox.bottom <= skills.panelBox.bottom + 1;
  ok('the Skills content sits inside the modal panel', Boolean(fits), 'search=' + JSON.stringify(skills.searchBox) + ' panel=' + JSON.stringify(skills.panelBox));
  ok('the modal body has a usable height', Boolean(skills.bodyBox) && skills.bodyBox.h >= 300, 'body=' + JSON.stringify(skills.bodyBox));
  ok('no horizontal overflow in the modal body (skills)', skills.overflowX !== null && skills.overflowX <= 1, 'overflowX=' + skills.overflowX);

  await page.screenshot({ path: '/tmp/req166-skills-modal.png' });
  console.log('screenshot: /tmp/req166-skills-modal.png');

  // 4 ── a real skill row loads its real SKILL.md.
  const rowClicked = await page.evaluate(clickFirstRow);
  ok('a live skill row is clicked', rowClicked, rowClicked ? 'first row click sent' : 'no rows to click');
  let detail = null;
  for (let i = 0; i < 25; i += 1) {
    detail = await page.evaluate(detailInfo);
    if (detail && detail.previewLen > 0) break;
    await sleep(400);
  }
  ok('the skill detail renders its live SKILL.md preview', Boolean(detail) && detail.previewLen > 40, detail ? 'previewLen=' + detail.previewLen + ' head=' + detail.previewHead : 'no detail');
  ok('the skill_view + Patch + Record use controls render', Boolean(detail) && detail.hasSkillViewBtn && detail.hasPatchBtn && detail.hasRecordBtn, detail ? 'view=' + detail.hasSkillViewBtn + ' patch=' + detail.hasPatchBtn + ' record=' + detail.hasRecordBtn : 'n/a');
  ok('the telemetry + available_skills cards render', Boolean(detail) && detail.hasTelemetry && detail.hasAvailable, detail ? 'telemetry=' + detail.hasTelemetry + ' available=' + detail.hasAvailable : 'n/a');
  ok('no detail error state', Boolean(detail) && !detail.hasDetailError && !detail.hasLoading, detail ? 'error=' + detail.hasDetailError + ' loading=' + detail.hasLoading : 'n/a');

  // 4b ── the Patch editor opens its real textareas (no apply — live skill files stay untouched).
  const patchClicked = await page.evaluate(clickButtonByText, 'Patch');
  await sleep(600);
  const patchState = await page.evaluate(detailInfo);
  ok('the Patch editor opens its real old/new textareas', patchClicked && Boolean(patchState) && patchState.hasPatchEditor, patchState ? 'editor=' + patchState.hasPatchEditor : 'n/a');
  await page.evaluate(clickButtonByText, 'Cancel');
  await sleep(300);

  // 5 ── section switching stays healthy.
  const toPlugins = await page.evaluate(navSection, 'Plugins');
  await sleep(700);
  const pluginsUp = await page.evaluate(() => {
    const nav = document.querySelector('[role="dialog"][aria-label="Settings"] nav[aria-label="Settings sections"]');
    if (!nav) return false;
    const b = [].slice.call(nav.querySelectorAll('button')).filter(function (x) { return x.getAttribute('aria-label') === 'Plugins'; })[0];
    return Boolean(b) && b.getAttribute('aria-pressed') === 'true';
  });
  ok('the nav switches away to Plugins', toPlugins && pluginsUp, 'plugins pressed=' + pluginsUp);
  const backClicked = await page.evaluate(navSection, 'Skills');
  let back = null;
  for (let i = 0; i < 15; i += 1) {
    back = await page.evaluate(skillsInfo);
    if (back && back.navSkills === 'true' && back.hasSearch) break;
    await sleep(300);
  }
  ok('switching back re-renders Skills (search visible again)', backClicked && Boolean(back) && back.navSkills === 'true' && back.hasSearch, back ? 'pressed=' + back.navSkills + ' search=' + back.hasSearch : 'no modal');

  // 6 ── Escape closes the modal.
  const stillOpen = await page.evaluate(modalOpen);
  ok('the Settings modal is still open before the close checks', stillOpen, stillOpen ? 'modal alive' : 'modal vanished early');
  await page.keyboard.press('Escape');
  await sleep(700);
  const closedByEsc = await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label="Settings"]'));
  ok('Escape closes the Settings modal', closedByEsc, closedByEsc ? 'closed' : 'still open');

  // 6b ── icon -> open again, backdrop click closes.
  const reopen = await page.evaluate(clickRail, 'Skills');
  let again = null;
  for (let i = 0; i < 15; i += 1) {
    again = await page.evaluate(skillsInfo);
    if (again) break;
    await sleep(300);
  }
  ok('the Skills rail icon re-opens the modal on Skills', reopen && Boolean(again) && again.navSkills === 'true', again ? 'nav aria-pressed=' + again.navSkills : 'no modal');
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
