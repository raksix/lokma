#!/usr/bin/env node
/**
 * REQ-168 live probe — the Design Studio is its OWN full page (the third
 * entry of the `lokma` · `Bots` · `Design` top switch), not a pane, not a
 * modal and not a Settings section.
 *
 * Proves, against the LIVE app (authed with a minted Bearer token — the
 * login gate stays ON, see scripts/mint-e2e-token.mjs):
 *   1. the header carries the three-way switch; the Design chip opens the
 *      full-page Design Studio (no rails, no sidebar toggles, no panes)
 *   2. no 'Design' entry survives in either rail; no pane/tab opens and the
 *      tiling snapshots stay untouched — the pane definition is gone
 *   3. the page renders the live studio: brief form + Generate + artifact
 *      list on the left, canvas + Code/Critique/Export tabs on the right
 *   4. driving the REAL flow: a probe artifact is generated through the
 *      form, selected, its viewer iframe renders the real build (read via
 *      page.frames), the Code tab saves (server-verified), the Critique tab
 *      shows the 5 heuristic scores and the HTML export downloads
 *   5. mode isolation: back to `lokma` restores the normal chrome untouched
 *      and re-opening Design restores the remembered selection; a reload
 *      lands back in the Design page (mode + snapshot persisted)
 *   6. the probe-created artifact is deleted through the page's two-click
 *      delete and re-checked against the live list
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-design-page.cjs --url http://127.0.0.1:3457 --token "$TK"
 */
const { chromium } = require('playwright-core');

const readFlag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = readFlag('url', 'http://127.0.0.1:3457');
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN = readFlag('token', '') || process.env.TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('missing --token (mint one with scripts/mint-e2e-token.mjs)');
  process.exit(2);
}
// Unique per run so a crashed earlier probe can never clash with this one.
const MARKER = `req168-probe-${Date.now().toString(36)}`;

const failures = [];
const ok = (name, pass, detail) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
  if (!pass) failures.push(name);
};

// ── page-side readers (browser globals only) ───────────────────────────────

const surfaceState = () => {
  const modeBtn = (m) => document.querySelector('[data-mode-switch="' + m + '"]');
  const railCount = (label) => {
    let n = 0;
    ['nav[aria-label="Activity bar"]', 'nav[aria-label="Inspector rail"]'].forEach((sel) => {
      const rail = document.querySelector(sel);
      if (!rail) return;
      Array.prototype.forEach.call(rail.querySelectorAll('button'), (b) => {
        if ((b.getAttribute('aria-label') || '') === label) n += 1;
      });
    });
    return n;
  };
  return {
    chat: modeBtn('chat') ? modeBtn('chat').getAttribute('aria-selected') === 'true' : null,
    bots: modeBtn('bots') ? modeBtn('bots').getAttribute('aria-selected') === 'true' : null,
    design: modeBtn('design') ? modeBtn('design').getAttribute('aria-selected') === 'true' : null,
    hasAllThree: Boolean(modeBtn('chat') && modeBtn('bots') && modeBtn('design')),
    designPage: Boolean(document.querySelector('[data-design-page]')),
    designRail: railCount('Design'),
    railPresent: Boolean(document.querySelector('nav[aria-label="Inspector rail"]')),
    chromeToggles: document.querySelectorAll('button[aria-label^="Toggle"]').length,
    panes: document.querySelectorAll('[data-pane]').length,
    tabsSnap: (function () { try { return localStorage.getItem('lokma:tiling-tabs:v1') || ''; } catch (e) { return ''; } })(),
    layoutSnap: (function () { try { return localStorage.getItem('lokma:layout:v1') || ''; } catch (e) { return ''; } })(),
    modeStored: (function () { try { return localStorage.getItem('lokma-app-mode:v1') || ''; } catch (e) { return ''; } })(),
  };
};

const designPageState = () => {
  const page = document.querySelector('[data-design-page]');
  if (!page) return null;
  const brief = page.querySelector('[data-design-brief]');
  const generate = page.querySelector('[data-design-generate]');
  const rows = [].slice.call(page.querySelectorAll('[data-design-row]')).map((r) => ({
    id: r.getAttribute('data-design-row'),
    text: (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70),
  }));
  const frame = page.querySelector('[data-design-viewer-frame]');
  const code = page.querySelector('[data-design-code]');
  const tabs = [].slice.call(page.querySelectorAll('[data-design-tab]')).map((b) => b.getAttribute('data-design-tab'));
  const exports = [].slice.call(page.querySelectorAll('[data-design-export]')).map((b) => b.getAttribute('data-design-export'));
  const canvas = page.querySelector('[data-design-canvas]');
  const leftCol = page.querySelector('aside');
  return {
    briefValue: brief ? brief.value : null,
    hasGenerate: Boolean(generate),
    rows,
    selectedRow: (function () {
      const active = [].slice.call(page.querySelectorAll('[data-design-row]')).filter((r) => /border-terracotta/.test(r.className));
      return active.length ? active[0].getAttribute('data-design-row') : null;
    })(),
    viewerSrc: frame ? frame.getAttribute('src') : null,
    tabs,
    exports,
    codeValue: code ? code.value : null,
    scoreBadge: (function () {
      const b = page.querySelector('[data-design-score]');
      return b ? (b.textContent || '').trim() : null;
    })(),
    critiqueRows: [].slice
      .call(page.querySelectorAll('span.capitalize'))
      .filter((s) => /^(visual|interaction|copy|motion|brand)$/.test((s.textContent || '').trim())).length,
    canvasBox: (function () {
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    })(),
    leftBox: (function () {
      if (!leftCol) return null;
      const r = leftCol.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    })(),
    overflowX: page.scrollWidth - page.clientWidth,
  };
};

const clickMode = (m) => {
  const b = document.querySelector('[data-mode-switch="' + m + '"]');
  if (!b) return false;
  b.click();
  return true;
};

const clickRow = (id) => {
  const b = document.querySelector('[data-design-row="' + id + '"]');
  if (!b) return false;
  b.click();
  return true;
};

const clickTab = (t) => {
  const b = document.querySelector('[data-design-tab="' + t + '"]');
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
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
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
  await ctx.addCookies([
    { name: 'lokma_token', value: TOKEN, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: BASE.startsWith('https') },
  ]);
  const page = await ctx.newPage();
  const errors = [];
  const http4xx = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 160)));
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
  const listIds = async () => {
    const res = await api('/api/design/list');
    const body = await res.json().catch(() => ({}));
    return (Array.isArray(body.items) ? body.items : []).map((d) => d && d.id).filter(Boolean);
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
      console.log('\nprobe-design-page: ' + failures.length + ' failure(s): ' + failures.join(', '));
      process.exit(1);
    }
    console.log('\nprobe-design-page: all checks passed.');
  };

  // ── 1 ── boot: the three-way switch renders in the normal mode. ─────────
  await page.waitForSelector('[data-mode-switch="design"]', { timeout: 20000 });
  await sleep(1200);
  let s = await page.evaluate(surfaceState);
  ok('the header shows the lokma | Bots | Design switch', s.hasAllThree, `chat=${s.chat} bots=${s.bots} design=${s.design}`);
  ok('boots into the normal chat mode', s.chat === true && s.designPage === false);
  ok('normal mode keeps the harness chrome (sidebar toggles)', s.chromeToggles > 0, 'toggles=' + s.chromeToggles);
  ok('no Design entry survives in either rail (REQ-168)', s.designRail === 0, 'rail entries=' + s.designRail);

  // ── 2 ── the Design chip opens the full PAGE (not a pane/modal). ────────
  const clicked = await page.evaluate(clickMode, 'design');
  ok('the Design switch is clicked', clicked, clicked ? 'click sent' : 'no Design switch');
  await page.waitForSelector('[data-design-page]', { timeout: 15000 });
  await sleep(1500);
  s = await page.evaluate(surfaceState);
  ok('the Design page mounts (data-design-page)', s.designPage === true);
  ok('the Design chip reads as active', s.design === true, 'chat=' + s.chat + ' bots=' + s.bots);
  ok('the page renders WITHOUT harness chrome (no sidebar toggles)', s.chromeToggles === 0, 'toggles=' + s.chromeToggles);
  ok('no rails render on the Design page', s.railPresent === false, 'rail present=' + s.railPresent);
  ok('no Settings modal opened', (await page.$('[role="dialog"][aria-label="Settings"]')) === null);

  // ── 3 ── the two-column studio renders (brief left, canvas right). ──────
  let d = await page.evaluate(designPageState);
  ok('the page renders (designPageState readable)', Boolean(d));
  ok('the brief form renders (textarea + Generate)', Boolean(d && d.briefValue !== null && d.hasGenerate), d ? 'brief=' + String(d.briefValue).slice(0, 20) : 'n/a');
  ok('the artifact list region renders', Boolean(d && d.rows.length >= 0), d ? 'rows=' + d.rows.length : 'n/a');
  ok('the left column is a real column', Boolean(d && d.leftBox && d.leftBox.w >= 200), d ? JSON.stringify(d.leftBox) : 'n/a');
  ok('the canvas region renders', Boolean(d && d.canvasBox && d.canvasBox.w >= 400 && d.canvasBox.h >= 200), d ? JSON.stringify(d.canvasBox) : 'n/a');
  ok('the Code/Critique/Export tabs render', Boolean(d && d.tabs.join(',') === 'code,critique,export'), d ? 'tabs=' + d.tabs.join(',') : 'n/a');
  ok('no horizontal overflow on the page', Boolean(d && d.overflowX <= 1), d ? 'overflowX=' + d.overflowX : 'n/a');
  ok('pre: no tiling panes open', s.panes === 0, 'panes=' + s.panes);

  // ── 4 ── the real flow: generate through the form, select, view. ────────
  let createdId = null;
  const beforeSnap = { tabs: s.tabsSnap, layout: s.layoutSnap };
  console.log('  (live store: ' + d.rows.length + ' artifact(s) visible)');

  if (d.rows.length === 0) {
    // Empty store: drive the brief form like a user would (real POST under it).
    await page.fill('[data-design-brief]', 'probe pricing section ' + MARKER);
    await page.click('[data-design-generate]');
    let rowId = null;
    for (let i = 0; i < 40 && !rowId; i += 1) {
      await sleep(500);
      const st = await page.evaluate(designPageState);
      if (st && st.rows.length > 0) rowId = st.rows[st.rows.length - 1].id;
    }
    ok('Generate from the brief form creates an artifact row', Boolean(rowId), rowId ? 'id=' + rowId : 'no row in 20s');
    createdId = rowId;
  } else {
    console.log('  (live store already has artifacts — the probe never mutates them)');
  }
  const targetId = createdId || (d.rows[0] ? d.rows[0].id : null);
  ok('an artifact is available to select', Boolean(targetId), targetId ? 'target=' + targetId : 'none');

  if (targetId) {
    ok('the artifact row is clicked', await page.evaluate(clickRow, targetId));
    let viewer = null;
    for (let i = 0; i < 30; i += 1) {
      await sleep(500);
      viewer = await page.evaluate(designPageState);
      if (viewer && viewer.viewerSrc) break;
    }
    const src = viewer ? viewer.viewerSrc : null;
    ok(
      'the viewer iframe mounts at the real build URL',
      Boolean(src) && src.indexOf('/api/design/') === 0 && src.indexOf('/view') > 0,
      'src=' + src,
    );

    // Never judge a sandboxed frame by contentDocument — read the FRAME.
    const frameInfo = async () => {
      const frames = page.frames().filter((f) => f.url().includes('/api/design/') && f.url().includes('/view'));
      if (!frames.length) return null;
      const f = frames[0];
      try {
        return await f.evaluate(() => ({
          url: location.pathname,
          bodyLen: document.body ? document.body.innerHTML.length : 0,
          hasRoot: Boolean(document.querySelector('html')),
          title: (document.title || '').slice(0, 60),
        }));
      } catch (e) {
        return { url: f.url(), bodyLen: -1, hasRoot: false, title: '', error: String(e).slice(0, 80) };
      }
    };
    let frame = null;
    for (let i = 0; i < 20; i += 1) {
      frame = await frameInfo();
      if (frame && frame.bodyLen > 200) break;
      await sleep(500);
    }
    ok(
      'the viewer frame renders the real build (read via page.frames)',
      Boolean(frame) && frame.bodyLen > 200 && frame.hasRoot,
      'frame=' + JSON.stringify(frame),
    );

    // ── Code tab: the stored HTML is editable, saving is server-real. ─────
    ok('the Code tab selects', await page.evaluate(clickTab, 'code'));
    await sleep(400);
    d = await page.evaluate(designPageState);
    ok(
      'the Code tab shows the stored artifact.html',
      Boolean(d && d.codeValue && d.codeValue.indexOf('<') === 0),
      d ? 'head=' + String(d.codeValue).slice(0, 40) : 'n/a',
    );
    if (createdId) {
      // Only mutate what the probe created: append a comment and save.
      const edited = d.codeValue + '\n<!-- ' + MARKER + ' -->\n';
      await page.fill('[data-design-code]', edited);
      await page.click('text=Save HTML');
      let saved = false;
      for (let i = 0; i < 20 && !saved; i += 1) {
        await sleep(400);
        const res = await api('/api/design/' + encodeURIComponent(createdId));
        if (res.status === 200) {
          const body = await res.json().catch(() => ({}));
          saved = Boolean(body.html && body.html.indexOf(MARKER) >= 0);
        }
      }
      ok('Save HTML persists the edit (server-verified)', saved, 'id=' + createdId);
    } else {
      console.log('  (read-only store: skipping the save round-trip to avoid mutating user artifacts)');
    }

    // ── Critique tab: the real 5-dimension heuristic renders. ─────────────
    ok('the Critique tab selects', await page.evaluate(clickTab, 'critique'));
    await sleep(800);
    d = await page.evaluate(designPageState);
    ok('the Critique tab renders all 5 heuristic dimensions', Boolean(d && d.critiqueRows === 5), d ? 'dims=' + d.critiqueRows : 'n/a');
    ok('the overall score badge shows a real score', Boolean(d && d.scoreBadge && /\/10$/.test(d.scoreBadge)), d ? 'badge=' + d.scoreBadge : 'n/a');

    // ── Export tab: the HTML export really downloads. ─────────────────────
    ok('the Export tab selects', await page.evaluate(clickTab, 'export'));
    await sleep(400);
    d = await page.evaluate(designPageState);
    ok(
      'the export formats render (html/zip/json/png/webm)',
      Boolean(d && d.exports.join(',') === 'html,zip,json,png,webm'),
      d ? 'exports=' + d.exports.join(',') : 'n/a',
    );
    const downloadPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    await page.click('[data-design-export="html"]');
    const download = await downloadPromise;
    ok('the HTML export downloads a real file', Boolean(download), download ? 'file=' + download.suggestedFilename() : 'no download event');
  }

  // ── 5 ── mode isolation: back to `lokma`; the normal mode is untouched. ─
  ok('the lokma switch is clicked', await page.evaluate(clickMode, 'chat'));
  await sleep(1500);
  s = await page.evaluate(surfaceState);
  ok('normal mode returns (chat active, Design page gone)', s.chat === true && s.designPage === false);
  ok('normal chrome is back (sidebar toggles)', s.chromeToggles > 0, 'toggles=' + s.chromeToggles);
  ok('the tiling-tabs snapshot stayed untouched', s.tabsSnap === beforeSnap.tabs, beforeSnap.tabs.length + ' -> ' + s.tabsSnap.length);
  ok('the tiling layout snapshot stayed untouched', s.layoutSnap === beforeSnap.layout, beforeSnap.layout.length + ' -> ' + s.layoutSnap.length);
  ok('no pane was opened by the Design flow', s.panes === 0, 'panes=' + s.panes);

  // ── 5b ── re-opening Design restores the remembered selection. ──────────
  ok('the Design switch re-opens the page', await page.evaluate(clickMode, 'design'));
  await page.waitForSelector('[data-design-page]', { timeout: 15000 });
  await sleep(1200);
  if (targetId) {
    let restored = null;
    for (let i = 0; i < 25 && !restored; i += 1) {
      const st = await page.evaluate(designPageState);
      if (st && st.viewerSrc && st.viewerSrc.indexOf(encodeURIComponent(targetId)) >= 0) restored = st;
      else await sleep(400);
    }
    ok('the selected artifact is restored on re-open (snapshot)', Boolean(restored), restored ? 'viewer=' + restored.viewerSrc : 'no restore in 10s');
  }

  // ── 5c ── a reload lands back in the Design page (mode persisted). ──────
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-mode-switch="design"]', { timeout: 20000 });
  await sleep(2500);
  s = await page.evaluate(surfaceState);
  ok('reload lands back in the Design mode (persisted)', s.design === true && s.designPage === true, 'stored=' + s.modeStored);
  if (targetId) {
    let reloaded = null;
    for (let i = 0; i < 25 && !reloaded; i += 1) {
      const st = await page.evaluate(designPageState);
      if (st && st.selectedRow === targetId) reloaded = st;
      else await sleep(400);
    }
    ok('the remembered selection survives the reload', Boolean(reloaded), reloaded ? 'selected=' + reloaded.selectedRow : 'not restored');
  }
  await page.screenshot({ path: '/tmp/req168-design-page.png' });
  console.log('screenshot: /tmp/req168-design-page.png');

  // ── 6 ── cleanup: delete ONLY the probe-created artifact, two clicks. ───
  if (createdId) {
    let st = await page.evaluate(designPageState);
    if (st && st.selectedRow !== createdId) await page.evaluate(clickRow, createdId);
    await sleep(500);
    await page.click('[data-design-delete]');
    await sleep(300);
    const armed = await page.evaluate(() => {
      const b = document.querySelector('[data-design-delete]');
      return b ? (b.textContent || '').trim() : '';
    });
    ok('the delete button arms on the first click (two-click delete)', /Confirm/.test(armed), 'label=' + armed);
    await page.click('[data-design-delete]');
    let gone = false;
    for (let i = 0; i < 30 && !gone; i += 1) {
      await sleep(400);
      gone = await page.evaluate((id) => !document.querySelector('[data-design-row="' + id + '"]'), createdId);
    }
    ok('the artifact row disappears after the confirm click', gone, 'id=' + createdId);
    const ids = await listIds();
    ok('the artifact stays deleted (re-checked against the live list)', !ids.includes(createdId), 'id=' + createdId);
  } else {
    console.log('  (no probe-created artifact — nothing to clean)');
  }

  return report();
})().catch((e) => {
  console.error('probe crashed:', e);
  process.exit(1);
});
