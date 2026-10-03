#!/usr/bin/env node
/**
 * REQ-189 live probe — the Design Studio's ARTIFACTS PANEL: the list is no
 * longer a permanent strip under the canvas but a closable right-hand column
 * that starts CLOSED, so the canvas gets the full width.
 *
 * Proves, against the LIVE app (authed with a minted Bearer token — the login
 * gate stays ON, see scripts/mint-e2e-token.mjs):
 *   1. default state: NO [data-design-artifacts-panel] in the DOM, and the
 *      canvas is as wide as the whole right area (chat excluded) — i.e. the
 *      panel takes no space when closed
 *   2. the toggle button carries the artifact count and reports
 *      aria-expanded=false / aria-controls pointing at the panel id
 *   3. opening: the panel mounts on the RIGHT of the canvas, the canvas
 *      narrows by roughly the panel width, and nothing overflows (1500px)
 *   4. the panel carries today's full list: search input, SelectMenu type
 *      filter (no native <select>), the filtered counter and the artboards
 *   5. selection does NOT close the panel: clicking an artboard swaps the
 *      canvas viewer and leaves the panel mounted
 *   6. Esc closes it; so does the panel's own close button
 *   7. the open/closed state survives a reload (lokma-design-page:v1)
 *   8. at 390px the page still has no horizontal overflow
 *
 * The probe creates nothing: it drives the existing artifact list, so there is
 * no generated artifact to clean up afterwards (which is also why it never
 * needs live model credits — unlike probe-design-studio-layout).
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-design-artifacts-panel.cjs --url http://127.0.0.1:3457 --token "$TK"
 */
const { chromium } = require('playwright-core');

const readFlag = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = readFlag('url', 'http://127.0.0.1:3457');
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN = readFlag('token', '') || process.env.TOKEN;
const SHOT = readFlag('shot', '/tmp/probe-design-artifacts-panel.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('missing --token (mint one with scripts/mint-e2e-token.mjs)');
  process.exit(2);
}

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
      w: Math.round(r.width),
      h: Math.round(r.height),
      left: Math.round(r.left),
      right: Math.round(r.right),
    };
  };
  const toggle = root.querySelector('[data-design-artifacts-toggle]');
  const panel = root.querySelector('[data-design-artifacts-panel]');
  const canvas = root.querySelector('[data-design-canvas]');
  return {
    panelOpen: Boolean(panel),
    panel: box(panel),
    canvas: box(canvas),
    ariaExpanded: toggle ? toggle.getAttribute('aria-expanded') : null,
    ariaControls: toggle ? toggle.getAttribute('aria-controls') : null,
    panelId: panel ? panel.id : null,
    badge: (function () {
      const b = root.querySelector('[data-design-artifacts-badge]');
      return b ? (b.textContent || '').trim() : null;
    })(),
    panelSearch: Boolean(panel && panel.querySelector('input[aria-label="Search artifacts"]')),
    panelFilter: Boolean(panel && panel.querySelector('[data-design-strip-filter]')),
    panelSelects: panel ? panel.querySelectorAll('select').length : -1,
    counter: (function () {
      const c = panel ? panel.querySelector('[data-design-artifacts-counter]') : null;
      return c ? (c.textContent || '').trim() : null;
    })(),
    emptyState: Boolean(panel && panel.querySelector('[data-design-artifacts-empty]')),
    artboards: [].slice
      .call((panel || root).querySelectorAll('[data-design-artboard]'))
      .map((a) => a.getAttribute('data-design-artboard')),
    viewerSrc: (function () {
      const f = root.querySelector('[data-design-viewer-frame]');
      return f ? f.getAttribute('src') : null;
    })(),
    overflowX: root.scrollWidth - root.clientWidth,
    docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    focusedIsPanel: (function () {
      const el = document.activeElement;
      return Boolean(el && panel && el.id === panel.id);
    })(),
  };
};

const clickSel = (sel) => {
  const b = document.querySelector(sel);
  if (!b) return false;
  b.click();
  return true;
};

// Wait until the studio has settled: the artifact thread has rendered rows (or
// its honest empty card) instead of the "Loading artifacts…" line.
const waitStudio = async (page) => {
  await page.waitForSelector('[data-design-page]', { timeout: 20000 });
  for (let i = 0; i < 30; i += 1) {
    const ready = await page.evaluate(() => {
      const root = document.querySelector('[data-design-page]');
      if (!root) return false;
      const loading = (root.textContent || '').indexOf('Loading artifacts') >= 0;
      return !loading && Boolean(root.querySelector('[data-design-composer]'));
    });
    if (ready) return true;
    await sleep(400);
  }
  return false;
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

  const report = async () => {
    console.log('--- errors seen ---');
    console.log(errors.slice(0, 6).join('\n') || '(none)');
    const jsErrors = errors.filter((e) => e.indexOf('Failed to load resource') === -1);
    ok('no JavaScript errors on the page', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | ') || 'clean');
    await browser.close();
    if (failures.length) {
      console.log('\nprobe-design-artifacts-panel: ' + failures.length + ' failure(s): ' + failures.join(', '));
      process.exit(1);
    }
    console.log('\nprobe-design-artifacts-panel: all checks passed.');
  };

  const openDesign = async () => {
    await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-mode-switch="design"]', { timeout: 20000 });
    await sleep(1000);
    await page.evaluate(() => {
      const b = document.querySelector('[data-mode-switch="design"]');
      if (b) b.click();
    });
    await waitStudio(page);
    await sleep(600);
  };

  await openDesign();

  // ── 1 ── default: the panel is absent, the canvas owns the whole area ────
  let L = await page.evaluate(layoutState);
  ok('the Design page renders', Boolean(L));
  ok('the panel is CLOSED by default (not in the DOM)', Boolean(L && !L.panelOpen));
  ok('the toggle button is on the canvas toolbar', Boolean(L && L.ariaExpanded !== null), 'aria-expanded=' + (L ? L.ariaExpanded : 'n/a'));
  ok(
    'the toggle reports aria-expanded=false while closed',
    Boolean(L && L.ariaExpanded === 'false'),
    'aria-expanded=' + (L ? L.ariaExpanded : 'n/a'),
  );
  const closedWidth = L && L.canvas ? L.canvas.w : 0;
  ok(
    'the canvas fills the area right of the chat (>= 700px at 1500)',
    closedWidth >= 700,
    'canvas.w=' + closedWidth,
  );
  ok('no horizontal overflow with the panel closed', Boolean(L && L.overflowX <= 1), 'overflowX=' + (L ? L.overflowX : 'n/a'));

  // ── 2 ── open: the panel mounts on the RIGHT and the canvas narrows ────
  ok('the toggle click is dispatched', await page.evaluate(clickSel, '[data-design-artifacts-toggle]'));
  await sleep(900);
  L = await page.evaluate(layoutState);
  ok('the panel is now in the DOM', Boolean(L && L.panelOpen));
  ok(
    'aria-expanded flips to true',
    Boolean(L && L.ariaExpanded === 'true'),
    'aria-expanded=' + (L ? L.ariaExpanded : 'n/a'),
  );
  ok(
    'aria-controls resolves to the mounted panel id',
    Boolean(L && L.ariaControls && L.panelId && L.ariaControls === L.panelId),
    'controls=' + (L ? L.ariaControls : 'n/a') + ' id=' + (L ? L.panelId : 'n/a'),
  );
  ok(
    'the panel sits on the RIGHT of the canvas',
    Boolean(L && L.panel && L.canvas && L.canvas.right <= L.panel.left + 1),
    L ? 'canvas.right=' + (L.canvas ? L.canvas.right : 'n/a') + ' panel.left=' + (L.panel ? L.panel.left : 'n/a') : 'n/a',
  );
  ok(
    'the panel width is in the 380–440px band',
    Boolean(L && L.panel && L.panel.w >= 380 && L.panel.w <= 440),
    'panel.w=' + (L ? (L.panel ? L.panel.w : 'n/a') : 'n/a'),
  );
  ok(
    'the canvas narrowed by roughly the panel width',
    Boolean(L && L.canvas && closedWidth - L.canvas.w >= 340 && closedWidth - L.canvas.w <= 470),
    'before=' + closedWidth + ' after=' + (L && L.canvas ? L.canvas.w : 'n/a'),
  );
  ok('no horizontal overflow with the panel open', Boolean(L && L.overflowX <= 1), 'overflowX=' + (L ? L.overflowX : 'n/a'));
  ok('focus moved into the panel on open', Boolean(L && L.focusedIsPanel));

  // ── 3 ── the panel carries today's full list ────────────────────────────
  ok('the panel has the artifact search', Boolean(L && L.panelSearch));
  ok('the panel has the SelectMenu type filter', Boolean(L && L.panelFilter));
  ok('no native <select> inside the panel (REQ-179)', Boolean(L && L.panelSelects === 0), 'selects=' + (L ? L.panelSelects : 'n/a'));
  ok(
    'the panel shows the filtered/total counter',
    Boolean(L && L.counter && /^\d+\/\d+$/.test(L.counter)),
    'counter=' + (L ? L.counter : 'n/a'),
  );
  const listCount = L ? L.artboards.length : 0;
  ok(
    'the panel lists the artifacts (or an honest empty state)',
    listCount > 0 || Boolean(L && L.emptyState),
    'artboards=' + listCount + ' emptyState=' + (L ? L.emptyState : 'n/a'),
  );
  ok(
    'the toggle badge carries the artifact count',
    Boolean(L && L.badge !== null && /^\d+$/.test(L.badge)),
    'badge=' + (L ? L.badge : 'n/a'),
  );

  // ── 3b ── search and the type filter actually NARROW the list ──────────
  // Presence is not function: an input that renders but never filters would
  // pass every check above, so type a real fragment and read the counter.
  if (listCount > 1) {
    const probe = await page.evaluate(layoutState);
    const all = probe.artboards.slice();
    await page.fill('input[aria-label="Search artifacts"]', 'zzz-no-such-artifact');
    await sleep(700);
    const empty = await page.evaluate(layoutState);
    ok(
      'a search with no match empties the list (search really filters)',
      empty.artboards.length === 0 && empty.counter === '0/' + all.length,
      'artboards=' + empty.artboards.length + ' counter=' + empty.counter,
    );
    ok(
      'the honest no-match line renders',
      Boolean((await page.evaluate(layoutState)) && true) &&
        (await page.evaluate(() => {
          const p = document.querySelector('[data-design-artifacts-panel]');
          return Boolean(p && (p.textContent || '').indexOf('No artifacts match') >= 0);
        })),
    );
    // Put it back and prove the list returns, then narrow by the real brief of
    // the first artifact.
    await page.fill('input[aria-label="Search artifacts"]', '');
    await sleep(700);
    const restored = await page.evaluate(layoutState);
    ok(
      'clearing the search restores every artifact',
      restored.artboards.length === all.length,
      'restored=' + restored.artboards.length + ' of ' + all.length,
    );
    const brief = await page.evaluate((id) => {
      const b = document.querySelector('[data-design-artboard="' + id + '"]');
      const span = b ? b.querySelector('span span') : null;
      return span ? (span.textContent || '').trim() : '';
    }, all[0]);
    const frag = brief.split(' ')[0] || 'a';
    await page.fill('input[aria-label="Search artifacts"]', frag);
    await sleep(700);
    const narrowed = await page.evaluate(layoutState);
    ok(
      'a real brief fragment narrows the list to fewer rows',
      narrowed.artboards.length > 0 && narrowed.artboards.length < all.length,
      'frag=' + frag + ' rows=' + narrowed.artboards.length + '/' + all.length,
    );
    await page.fill('input[aria-label="Search artifacts"]', '');
    await sleep(600);
  } else {
    console.log('SKIP  search-narrowing checks (fewer than 2 artifacts on this account)');
  }

  // ── 4 ── selection keeps the panel open and swaps the canvas ───────────
  if (listCount > 0) {
    const first = L.artboards[0];
    const viewerBefore = L.viewerSrc;
    ok(
      'clicking an artboard selects it',
      await page.evaluate((id) => {
        const b = document.querySelector('[data-design-artboard="' + id + '"]');
        if (!b) return false;
        b.click();
        return true;
      }, first),
    );
    await sleep(1200);
    const after = await page.evaluate(layoutState);
    ok('the panel stays open after a selection', Boolean(after && after.panelOpen));
    ok(
      'the canvas viewer now shows the selected artifact',
      Boolean(after && after.viewerSrc && after.viewerSrc.indexOf(encodeURIComponent(first)) >= 0),
      'src=' + (after ? after.viewerSrc : 'n/a'),
    );
    if (!viewerBefore) {
      ok('the viewer was empty before the selection (baseline read)', true);
    }
  } else {
    console.log('SKIP  selection checks (the account has no artifacts yet)');
  }

  // ── 5 ── Esc closes, then the button re-opens and X closes ─────────────
  await page.keyboard.press('Escape');
  await sleep(700);
  L = await page.evaluate(layoutState);
  ok('Esc closes the panel', Boolean(L && !L.panelOpen));
  ok('the canvas reclaims the panel width after Esc', Boolean(L && L.canvas && L.canvas.w >= closedWidth - 2), 'canvas.w=' + (L && L.canvas ? L.canvas.w : 'n/a'));

  ok('the toggle re-opens the panel', await page.evaluate(clickSel, '[data-design-artifacts-toggle]'));
  await sleep(700);
  L = await page.evaluate(layoutState);
  ok('the panel is open again', Boolean(L && L.panelOpen));
  ok('the panel close button exists', await page.evaluate(clickSel, '[data-design-artifacts-close]'));
  await sleep(700);
  L = await page.evaluate(layoutState);
  ok('the panel close button closes the panel', Boolean(L && !L.panelOpen));

  // ── 6 ── the state survives a reload ───────────────────────────────────
  await page.evaluate(clickSel, '[data-design-artifacts-toggle]');
  await sleep(700);
  ok('the panel is open before the reload', Boolean((await page.evaluate(layoutState)).panelOpen));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-mode-switch="design"]', { timeout: 20000 });
  await sleep(1200);
  await page.evaluate(() => {
    const b = document.querySelector('[data-mode-switch="design"]');
    if (b) b.click();
  });
  await waitStudio(page);
  await sleep(700);
  L = await page.evaluate(layoutState);
  ok('the open panel is restored after a reload (lokma-design-page:v1)', Boolean(L && L.panelOpen));
  // Leave the account as we found it: the panel closed.
  await page.evaluate(clickSel, '[data-design-artifacts-toggle]');
  await sleep(500);

  // ── 7 ── narrow viewport: no overflow ──────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(900);
  L = await page.evaluate(layoutState);
  ok('no horizontal overflow at 390px with the panel closed', Boolean(L && L.docOverflowX <= 1), 'docOverflowX=' + (L ? L.docOverflowX : 'n/a'));

  await page.screenshot({ path: SHOT, fullPage: false });
  console.log('screenshot: ' + SHOT);

  await report();
})().catch((e) => {
  console.error('probe-design-artifacts-panel: crashed — ' + String(e && e.stack ? e.stack : e));
  process.exit(1);
});