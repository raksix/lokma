#!/usr/bin/env node
/**
 * REQ-172 live probe — the Design page rebuilt after Google Stitch / Claude
 * Design: two columns only (left = the brief/iteration CHAT with its
 * composer, right = the big CANVAS with the Stitch-style artboard strip),
 * the retired card stack is gone, and every function stays reachable.
 *
 * Proves, against the LIVE app (authed with a minted Bearer token — the
 * login gate stays ON, see scripts/mint-e2e-token.mjs):
 *   1. layout: [data-design-chat] on the LEFT carries the composer (Type /
 *      System selects + brief + Generate), [data-design-canvas] on the
 *      RIGHT is the big viewer; the two sit side by side — no third column
 *   2. the card stack is gone: no [data-design-tab] strip, no
 *      [data-design-row] list, no [data-design-delete] button, no exact
 *      'Brief' / 'Artifacts' card titles anymore ('Brief' survives only as
 *      the composer field label) and no 'DESIGN.md — guard' card text (the
 *      guard is the header chip); search + type filter moved into the strip
 *   3. generate really runs: a unique probe brief adds a chat message plus a
 *      'Generated …' narration chip, the new artifact is selected, the big
 *      viewer iframe mounts at the real /api/design/:id/view build (read via
 *      page.frames, never contentDocument) and the artboard strip carries it
 *   4. no dead buttons: Code opens the drawer with the stored HTML, Critique
 *      opens its drawer with Re-run, Export lists all 6 formats, the ⋯ menu
 *      lists Delete (two-click arm)
 *   5. cleanup: the probe-created artifact is deleted through the page's
 *      two-click ⋯ delete and re-checked against the live list (stays gone)
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-design-studio-layout.cjs --url http://127.0.0.1:3457 --token "$TK"
 */
const { chromium } = require('playwright-core');

const readFlag = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = readFlag('url', 'http://127.0.0.1:3457');
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN = readFlag('token', '') || process.env.TOKEN;
const SHOT = readFlag('shot', '/tmp/probe-design-studio-layout.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('missing --token (mint one with scripts/mint-e2e-token.mjs)');
  process.exit(2);
}
// Unique per run so a crashed earlier probe can never clash with this one.
const MARKER = 'req172-probe-' + Date.now().toString(36);

const failures = [];
const ok = (name, pass, detail) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
  if (!pass) failures.push(name);
};

// ── page-side readers (browser globals only) ───────────────────────────────

const layoutState = () => {
  const root = document.querySelector('[data-design-page]');
  if (!root) return null;
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      left: Math.round(r.left),
      right: Math.round(r.right),
    };
  };
  const exactCount = (needle) => {
    const all = root.querySelectorAll('*');
    let n = 0;
    for (let i = 0; i < all.length; i += 1) {
      const el = all[i];
      if ((el.textContent || '').trim() !== needle) continue;
      if (el.children.length > 1) continue; // real containers keep their subtrees
      n += 1;
    }
    return n;
  };
  const composer = root.querySelector('[data-design-composer]');
  const strip = root.querySelector('[data-design-strip]');
  const guard = root.querySelector('[data-design-guard]');
  return {
    chat: box(root.querySelector('[data-design-chat]')),
    canvas: box(root.querySelector('[data-design-canvas]')),
    composer: box(composer),
    hasType: Boolean(root.querySelector('[data-design-composer-type]')),
    hasSystem: Boolean(root.querySelector('[data-design-composer-system]')),
    hasBrief: Boolean(root.querySelector('[data-design-brief]')),
    hasGenerate: Boolean(root.querySelector('[data-design-generate]')),
    stripSearch: Boolean(strip && strip.querySelector('input[aria-label="Search artifacts"]')),
    stripFilter: Boolean(strip && strip.querySelector('[data-design-strip-filter]')),
    oldTabs: root.querySelectorAll('[data-design-tab]').length,
    selectCount: root.querySelectorAll('select').length,
    oldRows: root.querySelectorAll('[data-design-row]').length,
    oldDelete: root.querySelectorAll('[data-design-delete]').length,
    exactBrief: exactCount('Brief'),
    exactArtifacts: exactCount('Artifacts'),
    briefLabelInComposer: composer
      ? [].slice.call(composer.querySelectorAll('label')).filter((l) => (l.textContent || '').trim() === 'Brief').length
      : -1,
    guardChip: guard ? (guard.textContent || '').replace(/\s+/g, ' ').trim() : null,
    oldGuardCard: (root.textContent || '').indexOf('DESIGN.md — guard') >= 0,
    msgIds: [].slice
      .call(root.querySelectorAll('[data-design-msg]'))
      .map((m) => m.getAttribute('data-design-msg')),
    viewerSrc: (function () {
      const f = root.querySelector('[data-design-viewer-frame]');
      return f ? f.getAttribute('src') : null;
    })(),
    events: [].slice
      .call(root.querySelectorAll('[data-design-event]'))
      .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()),
    artboards: [].slice
      .call(root.querySelectorAll('[data-design-artboard]'))
      .map((a) => a.getAttribute('data-design-artboard')),
    overflowX: root.scrollWidth - root.clientWidth,
  };
};

const clickMode = (m) => {
  const b = document.querySelector('[data-mode-switch="' + m + '"]');
  if (!b) return false;
  b.click();
  return true;
};

const clickSel = (sel) => {
  const b = document.querySelector(sel);
  if (!b) return false;
  b.click();
  return true;
};

const clickMsg = (id) => {
  const b = document.querySelector('[data-design-msg="' + id + '"]');
  if (!b) return false;
  b.click();
  return true;
};

const menuItemTexts = () =>
  [].slice.call(document.querySelectorAll('[role="menu"] [role="menuitem"]')).map((b) => ({
    label: (b.textContent || '').replace(/\s+/g, ' ').trim(),
    disabled: Boolean(b.disabled),
  }));

const clickMenuItem = (label) => {
  const buttons = [].slice.call(document.querySelectorAll('[role="menu"] [role="menuitem"]'));
  const b = buttons.find((x) => (x.textContent || '').indexOf(label) >= 0);
  if (!b) return false;
  b.click();
  return true;
};

const closePanel = (sel) => {
  const b = document.querySelector(sel + ' [data-design-panel-close]');
  if (b) b.click();
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
  // The app's REST calls use the Bearer header from localStorage, but the
  // viewer IFRAME is a plain navigation: a real session also carries the
  // httpOnly `lokma_token` cookie, so seed it too (the gate stays ON).
  await ctx.addCookies([
    {
      name: 'lokma_token',
      value: TOKEN,
      domain: new URL(BASE).hostname,
      path: '/',
      httpOnly: true,
      secure: BASE.startsWith('https'),
    },
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
      console.log('\nprobe-design-studio-layout: ' + failures.length + ' failure(s): ' + failures.join(', '));
      process.exit(1);
    }
    console.log('\nprobe-design-studio-layout: all checks passed.');
  };

  // ── 1 ── open the Design page. ──────────────────────────────────────────
  await page.waitForSelector('[data-mode-switch="design"]', { timeout: 20000 });
  await sleep(1200);
  ok('the Design switch is clicked', await page.evaluate(clickMode, 'design'));
  await page.waitForSelector('[data-design-page]', { timeout: 15000 });
  await sleep(1500);

  // ── 2 ── layout: chat left + canvas right, no card stack. ───────────────
  let L = await page.evaluate(layoutState);
  ok('the page renders (layoutState readable)', Boolean(L));
  ok(
    'the LEFT column is the chat with its composer',
    Boolean(L && L.chat && L.composer && L.chat.w >= 280),
    L ? 'chat=' + JSON.stringify(L.chat) : 'n/a',
  );
  ok(
    'the composer carries Type / System / brief / Generate',
    Boolean(L && L.hasType && L.hasSystem && L.hasBrief && L.hasGenerate),
    L ? 'type=' + L.hasType + ' system=' + L.hasSystem + ' brief=' + L.hasBrief + ' generate=' + L.hasGenerate : 'n/a',
  );
  ok(
    'the RIGHT column is the big canvas',
    Boolean(L && L.canvas && L.canvas.w >= 500 && L.canvas.h >= 300),
    L ? 'canvas=' + JSON.stringify(L.canvas) : 'n/a',
  );
  ok(
    'the columns sit side by side (chat.right <= canvas.left)',
    Boolean(L && L.chat && L.canvas && L.chat.right <= L.canvas.left + 1),
    L ? 'chat.right=' + (L.chat ? L.chat.right : 'n/a') + ' canvas.left=' + (L.canvas ? L.canvas.left : 'n/a') : 'n/a',
  );
  ok('the old tab strip is gone ([data-design-tab] = 0)', Boolean(L && L.oldTabs === 0), 'count=' + (L ? L.oldTabs : 'n/a'));
  ok('the old artifact list rows are gone ([data-design-row] = 0)', Boolean(L && L.oldRows === 0), 'count=' + (L ? L.oldRows : 'n/a'));
  ok('the old delete button is gone ([data-design-delete] = 0)', Boolean(L && L.oldDelete === 0), 'count=' + (L ? L.oldDelete : 'n/a'));
  ok(
    "no 'Artifacts' card title renders anymore",
    Boolean(L && L.exactArtifacts === 0),
    'exact-text count=' + (L ? L.exactArtifacts : 'n/a'),
  );
  ok(
    "'Brief' survives only as the composer field label",
    Boolean(L && L.exactBrief === 1 && L.briefLabelInComposer === 1),
    L ? 'exact=' + L.exactBrief + ' inComposer=' + L.briefLabelInComposer : 'n/a',
  );
  ok(
    "the 'DESIGN.md — guard' card text is gone",
    Boolean(L && L.oldGuardCard === false),
    L ? 'found=' + L.oldGuardCard : 'n/a',
  );
  ok(
    'the guard reads as a header chip',
    Boolean(L && L.guardChip && (L.guardChip.indexOf('DESIGN.md') === 0 || L.guardChip.indexOf('No .lokma/DESIGN.md') === 0)),
    L ? 'chip=' + L.guardChip : 'n/a',
  );
  ok(
    'search + type filter moved into the artboard strip',
    Boolean(L && L.stripSearch && L.stripFilter),
    L ? 'search=' + L.stripSearch + ' filter=' + L.stripFilter : 'n/a',
  );
  ok(
    'REQ-179: no native <select> control remains on the design page',
    Boolean(L && L.selectCount === 0),
    'selects=' + (L ? L.selectCount : 'n/a'),
  );
  ok('no horizontal overflow on the page', Boolean(L && L.overflowX <= 1), 'overflowX=' + (L ? L.overflowX : 'n/a'));

  // ── 3 ── generate through the REAL composer; the artifact is selected. ──
  const before = (L && L.msgIds) || [];
  await page.fill('[data-design-brief]', 'probe pricing section ' + MARKER);
  // REQ-179 — the composer controls are SelectMenu popups now: open, pick,
  // and the popup closes itself (there is no native select left to drive).
  await page.click('[data-design-composer-type]');
  await page.waitForSelector('[data-select-option="prototype"]', { timeout: 5000 });
  await page.click('[data-select-option="prototype"]');
  await page.click('[data-design-composer-system]');
  await page.waitForSelector('[data-select-option="stripe-linear"]', { timeout: 5000 });
  await page.click('[data-select-option="stripe-linear"]');
  await page.click('[data-design-generate]');
  let createdId = null;
  for (let i = 0; i < 60 && !createdId; i += 1) {
    await sleep(500);
    const st = await page.evaluate(layoutState);
    const fresh = st ? st.msgIds.filter((id) => before.indexOf(id) === -1) : [];
    if (fresh.length > 0) createdId = fresh[0];
  }
  ok('Generate adds a chat message for the new brief', Boolean(createdId), createdId ? 'id=' + createdId : 'no message in 30s');

  L = await page.evaluate(layoutState);
  ok(
    "a 'Generated …' narration chip lands in the thread",
    Boolean(L && L.events.some((t) => /^Generated /.test(t))),
    L ? 'events=' + JSON.stringify(L.events.slice(-3)) : 'n/a',
  );

  let src = null;
  for (let i = 0; i < 40 && !src; i += 1) {
    await sleep(500);
    const st = await page.evaluate(layoutState);
    if (st && st.viewerSrc && createdId && st.viewerSrc.indexOf(encodeURIComponent(createdId)) >= 0) src = st.viewerSrc;
  }
  ok('the big viewer mounts at the real build URL', Boolean(src), 'src=' + src);

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
      }));
    } catch (e) {
      return { url: f.url(), bodyLen: -1, hasRoot: false, error: String(e).slice(0, 80) };
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

  let strip = null;
  for (let i = 0; i < 20 && !strip; i += 1) {
    const st = await page.evaluate(layoutState);
    if (st && createdId && st.artboards.indexOf(createdId) >= 0) strip = st;
    else await sleep(400);
  }
  ok('the artboard strip carries the new variant thumbnail', Boolean(strip), 'id=' + createdId);

  // ── 4 ── no dead buttons (the artifact is selected now). ────────────────
  ok('the Code toggle opens the code drawer', await page.evaluate(clickSel, '[data-design-code-toggle]'));
  await sleep(500);
  const codeOpen = await page.evaluate(() => {
    const p = document.querySelector('[data-design-code-panel]');
    const t = p ? p.querySelector('[data-design-code]') : null;
    return { open: Boolean(p), len: t ? t.value.length : 0 };
  });
  ok('the code drawer shows the stored HTML', codeOpen.open && codeOpen.len > 100, 'htmlLen=' + codeOpen.len);
  await page.evaluate(closePanel, '[data-design-code-panel]');
  await sleep(300);

  ok('the Critique toggle opens the critique drawer', await page.evaluate(clickSel, '[data-design-critique-toggle]'));
  await sleep(500);
  const critiqueOpen = await page.evaluate(() =>
    Boolean(document.querySelector('[data-design-critique-panel] [data-design-critique-rerun]')),
  );
  ok('the critique drawer carries the Re-run action', critiqueOpen);
  await page.evaluate(closePanel, '[data-design-critique-panel]');
  await sleep(300);

  ok('the Export toolbar button opens its menu', await page.evaluate(clickSel, '[data-design-export-toggle]'));
  await sleep(500);
  const exportItems = await page.evaluate(menuItemTexts);
  const enabledExports = exportItems.filter((i) => !i.disabled);
  ok(
    'the export menu lists all 6 formats, enabled',
    enabledExports.length >= 6,
    'items=' + JSON.stringify(exportItems.map((i) => i.label)),
  );
  await page.keyboard.press('Escape');
  await sleep(300);

  ok('the ⋯ toolbar button opens the artifact menu', await page.evaluate(clickSel, '[data-design-menu-toggle]'));
  await sleep(400);
  const artItems = await page.evaluate(menuItemTexts);
  ok(
    'the artifact menu lists Delete',
    artItems.some((i) => /Delete/.test(i.label)),
    'items=' + JSON.stringify(artItems.map((i) => i.label)),
  );
  await page.keyboard.press('Escape');
  await sleep(300);

  // ── 5 ── screenshot (after-state evidence for the REQ file). ────────────
  try {
    await page.screenshot({ path: SHOT });
    console.log('screenshot: ' + SHOT);
  } catch (e) {
    console.log('screenshot failed (non-fatal): ' + String(e).slice(0, 120));
  }

  // ── 6 ── cleanup: delete ONLY the probe-created artifact, two clicks. ───
  if (createdId) {
    const isSelected = await page.evaluate((id) => {
      const msg = document.querySelector('[data-design-msg="' + id + '"]');
      return msg ? /terracotta/.test(msg.className) : false;
    }, createdId);
    if (!isSelected) {
      await page.evaluate(clickMsg, createdId);
      await sleep(600);
    }
    await page.evaluate(clickSel, '[data-design-menu-toggle]');
    await sleep(400);
    const firstClick = await page.evaluate(clickMenuItem, 'Delete artifact');
    await sleep(500);
    await page.evaluate(clickSel, '[data-design-menu-toggle]');
    await sleep(400);
    const armedItems = await page.evaluate(menuItemTexts);
    ok(
      'the ⋯ menu arms the two-click delete (Confirm delete)',
      armedItems.some((i) => /Confirm delete/.test(i.label)),
      'firstClick=' + firstClick + ' items=' + JSON.stringify(armedItems.map((i) => i.label)),
    );
    await page.evaluate(clickMenuItem, 'Confirm delete');
    let gone = false;
    for (let i = 0; i < 40 && !gone; i += 1) {
      await sleep(400);
      gone = await page.evaluate((id) => !document.querySelector('[data-design-msg="' + id + '"]'), createdId);
    }
    ok('the artifact message disappears after the confirm click', gone, 'id=' + createdId);
    // Poll on disk (bounded) so a late re-write can never resurrect the row.
    let staysGone = false;
    for (let i = 0; i < 3 && !staysGone; i += 1) {
      await sleep(1200);
      const ids = await listIds();
      staysGone = !ids.includes(createdId);
    }
    ok('the artifact stays deleted (re-checked against the live list)', staysGone, 'id=' + createdId);
  } else {
    console.log('  (no probe-created artifact — nothing to clean)');
  }

  return report();
})().catch((e) => {
  console.error('probe crashed:', e);
  process.exit(1);
});
