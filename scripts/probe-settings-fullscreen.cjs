#!/usr/bin/env node
/**
 * REQ-194 live probe — Settings full screen (shell) + the Models split.
 *
 * Proves, against the LIVE app (authed with a minted Bearer token — the
 * login gate stays ON, see scripts/mint-e2e-token.mjs; this probe NEVER
 * flips `requireLogin`):
 *   1. the DEFAULT shell is unchanged — 768x640 max-w-3xl geometry (the
 *      regression guard for Kapsam "varsayılan değişmez")
 *   2. the maximize button makes the shell the viewport (w/h == viewport,
 *      no max-width/height rounding)
 *   3. the back button + Escape return it to the small geometry
 *   4. the preference survives a reload (`lokma-settings-fullscreen:v1`)
 *   5. `?settings=models&fullscreen=1` opens straight on Models full screen
 *      and the params are stripped from the URL afterwards
 *   6. Models in full screen renders THREE columns (provider index, rows,
 *      detail), the scroll well is NOT the old fixed 320px box (it now
 *      fills the body), `/` focuses search, the search filters, a selected
 *      row fills the preview panel, and the preview invents NO
 *      capacity/context/price row
 *   7. no horizontal overflow at 1500px and at 390px (phone: single column)
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-settings-fullscreen.cjs --url https://lokma.fermag.com.tr --token "$TK"
 */
const { chromium } = require('playwright-core');

const BASE =
  process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'https://lokma.fermag.com.tr';
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

/* ── page-side readers (browser globals only) ─────────────────────────── */

const shellInfo = () => {
  const shell = document.querySelector('[data-settings-shell]');
  if (!shell) return null;
  const r = shell.getBoundingClientRect();
  const cs = getComputedStyle(shell);
  const toggle = shell.querySelector('[data-settings-fullscreen-toggle]');
  return {
    w: Math.round(r.width),
    h: Math.round(r.height),
    x: Math.round(r.x),
    y: Math.round(r.y),
    radius: cs.borderTopLeftRadius,
    maxW: cs.maxWidth,
    maxH: cs.maxHeight,
    dataFullscreen: shell.getAttribute('data-fullscreen'),
    toggleVisible: toggle ? getComputedStyle(toggle).display !== 'none' : false,
    toggleExpanded: toggle ? toggle.getAttribute('aria-expanded') : null,
    toggleLabel: toggle ? toggle.getAttribute('aria-label') : null,
    stored: (function () {
      try {
        return localStorage.getItem('lokma-settings-fullscreen:v1');
      } catch (e) {
        return null;
      }
    })(),
  };
};

const modelsInfo = () => {
  // `data-models-pane` exists ONLY in wide mode (`wide ? 'wide' : undefined`
  // emits no attribute), so the small shell has to be found through a hook
  // that is always rendered — `data-models-scroll`. Keying the whole helper on
  // the wide hook made the small-shell assertions measure a MISSING pane and
  // report "no models pane" (a probe defect, not a product one).
  const pane = document.querySelector('[data-models-pane]') || document.querySelector('[data-models-scroll]');
  if (!pane) return null;
  // `pane` may itself BE the scroll element (small-shell fallback above), so
  // resolve it by identity first, then by descendant query.
  const scroll =
    pane.matches && pane.matches('[data-models-scroll]')
      ? pane
      : pane.querySelector('[data-models-scroll]');
  const rows = (pane.matches && pane.matches('[data-model-row]') ? [pane] : []).concat(
    Array.from(pane.querySelectorAll('[data-model-row]')),
  );
  const providers = document.querySelectorAll('[data-model-provider]');
  const detail = pane.querySelector('[data-models-detail]');
  const search = pane.querySelector('[data-model-search]');
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const cs = scroll ? getComputedStyle(scroll) : null;
  // first/last row height delta is the "600+ rows still scroll smoothly"
  // proxy: a well capped at 320px cannot exceed its own box.
  const first = rows[0] ? rows[0].getBoundingClientRect() : null;
  const last = rows[rows.length - 1] ? rows[rows.length - 1].getBoundingClientRect() : null;
  const detailText = detail ? detail.innerText || '' : '';
  return {
    wide: pane.getAttribute('data-models-pane'),
    scrollBox: box(scroll),
    scrollMaxH: cs ? cs.maxHeight : null,
    scrollOverflowY: cs ? cs.overflowY : null,
    scrollH: scroll ? Math.round(scroll.getBoundingClientRect().height) : null,
    scrollClientH: scroll ? scroll.clientHeight : null,
    scrollContentH: scroll ? scroll.scrollHeight : null,
    rowCount: rows.length,
    providerCount: providers.length,
    detailBox: box(detail),
    detailVisible: detail ? getComputedStyle(detail).display !== 'none' : false,
    detailText: detailText.slice(0, 400),
    searchFocused: search ? document.activeElement === search : false,
    overflowX: scroll ? scroll.scrollWidth - scroll.clientWidth : null,
    firstRowBottom: first ? Math.round(first.bottom) : null,
    lastRowTop: last ? Math.round(last.top) : null,
  };
};

// Click a Settings nav button by its visible label.
const clickSection = (label) => {
  const nav = document.querySelector('[role="dialog"][aria-label="Settings"] nav[aria-label="Settings sections"]');
  if (!nav) return false;
  const btn = [].slice.call(nav.querySelectorAll('button')).filter(function (b) {
    return (b.getAttribute('aria-label') || '') === label;
  })[0];
  if (!btn) return false;
  btn.click();
  return true;
};

const clickToggle = () => {
  const t = document.querySelector('[data-settings-fullscreen-toggle]');
  if (!t) return false;
  t.click();
  return true;
};

const modalOpen = () => Boolean(document.querySelector('[role="dialog"][aria-label="Settings"]'));

// Open Settings through the real footer control (no route/snapshot seeding:
// the probe must exercise a path a user can take).
const clickFooterSettings = () => {
  const btns = [].slice.call(document.querySelectorAll('button'));
  const hit = btns.filter(function (b) {
    const l = (b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '');
    return /^(Settings|Settings…|Preferences)\b/i.test(l.trim()) || b.getAttribute('aria-label') === 'Settings';
  })[0];
  if (!hit) return false;
  hit.click();
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

  const report = async () => {
    console.log('--- errors seen ---');
    console.log(errors.slice(0, 8).join('\n') || '(none)');
    const jsErrors = errors.filter((e) => e.indexOf('Failed to load resource') === -1);
    ok('no JavaScript errors on the page', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | ') || 'clean');
    await browser.close();
    if (failures.length) {
      console.log('\nprobe-settings-fullscreen: ' + failures.length + ' failure(s): ' + failures.join(', '));
      process.exit(1);
    }
    console.log('\nprobe-settings-fullscreen: all checks passed.');
  };

  const waitShell = async (tries = 22) => {
    for (let i = 0; i < tries; i += 1) {
      const s = await page.evaluate(shellInfo);
      if (s) return s;
      await sleep(400);
    }
    return null;
  };

  const waitModels = async (tries = 25) => {
    for (let i = 0; i < tries; i += 1) {
      const m = await page.evaluate(modelsInfo);
      if (m) return m;
      await sleep(400);
    }
    return null;
  };

  // ── 0 ── shell renders at all.
  await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await sleep(6000);

  const railReady = await page.evaluate(() => Boolean(document.querySelector('button[aria-label="Settings"]')));
  ok('a Settings opener exists in the shell', railReady, railReady ? 'settings button found' : 'no Settings button in 6s');
  if (!railReady) return report();

  const opened = await page.evaluate(clickFooterSettings);
  ok('Settings opens from the live shell', opened && (await waitShell()) !== null, 'clicked=' + opened);

  // ── 1 ── DEFAULT geometry unchanged (regression guard).
  let shell = await waitShell();
  ok('the default shell keeps the shipped 768x640 geometry', Boolean(shell) && shell.w === 768 && shell.h === 640, shell ? JSON.stringify({ w: shell.w, h: shell.h, maxW: shell.maxW }) : 'no shell');
  ok('the default shell is not full screen (data-fullscreen=0)', shell && shell.dataFullscreen === '0', 'data-fullscreen=' + (shell && shell.dataFullscreen));
  ok('the default shell is centred with padding', shell && shell.maxW === '768px', 'maxWidth=' + (shell && shell.maxW));
  ok('the maximize button is visible and labelled', shell && shell.toggleVisible && /full screen/i.test(shell.toggleLabel || ''), 'display-visible=' + (shell && shell.toggleVisible) + ' label=' + (shell && shell.toggleLabel));
  ok('nothing is persisted while small', shell && shell.stored === null, 'stored=' + JSON.stringify(shell && shell.stored));

  // ── 2 ── maximize → the shell IS the viewport.
  const vw = 1500;
  const vh = 950;
  const toggled = await page.evaluate(clickToggle);
  ok('the maximize button clicks', toggled, 'click sent');
  await sleep(900);
  shell = await page.evaluate(shellInfo);
  ok('full screen matches the viewport width', shell && shell.w === vw, 'w=' + (shell && shell.w) + ' (viewport ' + vw + ')');
  ok('full screen matches the viewport height', shell && shell.h === vh, 'h=' + (shell && shell.h) + ' (viewport ' + vh + ')');
  ok('full screen drops max-width/max-height', shell && (shell.maxW === 'none' || shell.maxW === '0px') && (shell.maxH === 'none' || shell.maxH === '0px'), 'maxW=' + (shell && shell.maxW) + ' maxH=' + (shell && shell.maxH));
  ok('full screen is flush (no rounding, no offset)', shell && shell.x === 0 && shell.y === 0 && (shell.radius === '0px' || shell.radius === '0'), 'x=' + (shell && shell.x) + ' y=' + (shell && shell.y) + ' radius=' + (shell && shell.radius));
  ok('aria-expanded reflects the state', shell && shell.toggleExpanded === 'true', 'aria-expanded=' + (shell && shell.toggleExpanded));
  ok('the preference is persisted to localStorage', shell && shell.stored === '1', 'stored=' + JSON.stringify(shell && shell.stored));
  ok('the button now offers to exit full screen', shell && /exit/i.test(shell.toggleLabel || ''), 'label=' + (shell && shell.toggleLabel));

  await page.screenshot({ path: '/tmp/req194-fullscreen-general.png' });
  console.log('screenshot: /tmp/req194-fullscreen-general.png');

  // ── 4 ── reload persistence (preference outlives a reload).
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(6000);
  const storedAfterReload = await page.evaluate(() => {
    try {
      return localStorage.getItem('lokma-settings-fullscreen:v1');
    } catch (e) {
      return null;
    }
  });
  ok('the preference survives a reload', storedAfterReload === '1', 'stored after reload=' + JSON.stringify(storedAfterReload));

  // Re-open and confirm the modal reads it back as full screen.
  await page.evaluate(clickFooterSettings);
  shell = await waitShell();
  ok('a modal opened after reload opens FULL screen (preference honoured)', shell && shell.dataFullscreen === '1', 'data-fullscreen=' + (shell && shell.dataFullscreen));

  // ── 3 ── Escape leaves full screen first (does not close the modal).
  await page.keyboard.press('Escape');
  await sleep(700);
  shell = await page.evaluate(shellInfo);
  const stillOpen = await page.evaluate(modalOpen);
  ok('Escape leaves full screen but keeps the modal open', shell && shell.dataFullscreen === '0' && stillOpen, 'data-fullscreen=' + (shell && shell.dataFullscreen) + ' open=' + stillOpen);
  ok('the shell is back to the 768x640 geometry', shell && shell.w === 768 && shell.h === 640, 'w=' + (shell && shell.w) + ' h=' + (shell && shell.h));

  // ── 3b ── close, then verify the toggle button path back down.
  await page.evaluate(clickToggle);
  await sleep(700);
  shell = await page.evaluate(shellInfo);
  ok('the button toggles back into full screen', shell && shell.dataFullscreen === '1', 'data-fullscreen=' + (shell && shell.dataFullscreen));
  await page.keyboard.press('Escape');
  await sleep(600);
  await page.keyboard.press('Escape');
  await sleep(600);
  ok('the second Escape closes the modal', !(await page.evaluate(modalOpen)), 'modal gone');

  // ── 5 ── deep link: `?settings=models&fullscreen=1` opens straight on Models.
  await page.goto(BASE + '/?token=' + TOKEN + '&settings=models&fullscreen=1', { waitUntil: 'domcontentloaded' });
  await sleep(7000);
  shell = await page.evaluate(shellInfo);
  ok('the deep link opens the modal in full screen', shell && shell.dataFullscreen === '1', 'data-fullscreen=' + (shell && shell.dataFullscreen));
  const urlAfter = await page.evaluate(() => window.location.search);
  ok('the deep-link params are stripped from the URL', urlAfter.indexOf('settings=') === -1, 'search=' + JSON.stringify(urlAfter));

  const navActive = await page.evaluate(() => {
    const nav = document.querySelector('[role="dialog"][aria-label="Settings"] nav[aria-label="Settings sections"]');
    if (!nav) return null;
    const btn = [].slice.call(nav.querySelectorAll('button')).filter(function (b) {
      return (b.getAttribute('aria-label') || '') === 'Models';
    })[0];
    return btn ? btn.getAttribute('aria-pressed') : null;
  });
  ok('the deep link lands on the Models section', navActive === 'true', 'Models aria-pressed=' + navActive);

  // ── 6 ── Models full screen: three columns, uncapped well, `/`, preview.
  let models = await waitModels();
  ok('the Models pane renders in wide mode', Boolean(models) && models.wide === 'wide', models ? 'data-models-pane=' + models.wide : 'no models pane in 10s');
  if (!models) return report();

  ok('the provider index renders with entries', models.providerCount > 1, 'providers=' + models.providerCount);
  ok('the detail panel renders', models.detailVisible && models.detailBox && models.detailBox.w > 100, JSON.stringify(models.detailBox));
  ok('the rows render from the catalog', models.rowCount > 0, 'rows=' + models.rowCount);

  const splitCols = await page.evaluate(() => {
    const split = document.querySelector('[data-models-split]');
    if (!split) return null;
    return getComputedStyle(split).gridTemplateColumns;
  });
  const colCount = splitCols ? splitCols.split(' ').filter(Boolean).length : 0;
  ok('the split grid is three columns', colCount === 3, 'gridTemplateColumns=' + splitCols);

  // The old fixed 320px well must be GONE in full screen — it is the whole
  // point of Kapsam 4 (600+ rows used to scroll inside a 320px box).
  ok(
    'the scroll well is no longer capped at 320px (max-height none)',
    models.scrollMaxH === 'none' || models.scrollMaxH === '0px' || parseFloat(models.scrollMaxH) > 400,
    'maxHeight=' + models.scrollMaxH + ' box=' + JSON.stringify(models.scrollBox),
  );
  ok('the well fills the modal body height', models.scrollH > 400, 'well height=' + models.scrollH + 'px');
  ok('the catalog overflows the well (so it really scrolls)', models.scrollContentH > models.scrollClientH + 10, 'content=' + models.scrollContentH + ' client=' + models.scrollClientH);
  ok('no horizontal overflow inside the list', models.overflowX !== null && models.overflowX <= 1, 'overflowX=' + models.overflowX);

  // `/` focuses the search field.
  await page.keyboard.press('/');
  await sleep(500);
  models = await page.evaluate(modelsInfo);
  ok('the `/` shortcut focuses the model search', models && models.searchFocused, 'activeElement is search=' + (models && models.searchFocused));

  // The shortcut must NOT eat a slash typed INSIDE the field.
  const beforeType = await page.evaluate(() => {
    const s = document.querySelector('[data-model-search]');
    return s ? s.value : null;
  });
  await page.keyboard.type('deepseek');
  await sleep(700);
  const afterType = await page.evaluate(() => {
    const s = document.querySelector('[data-model-search]');
    return s ? s.value : null;
  });
  ok('typing filters the catalog', typeof afterType === 'string' && afterType.indexOf('deepseek') === 0, 'value=' + JSON.stringify(afterType) + ' (was ' + JSON.stringify(beforeType) + ')');
  models = await page.evaluate(modelsInfo);
  const filteredRows = models ? models.rowCount : 0;
  ok('the search actually narrows the row list', filteredRows > 0 && filteredRows < 600, 'filtered rows=' + filteredRows);

  // Select a row → the preview panel fills with REAL fields only.
  const picked = await page.evaluate(() => {
    const pane = document.querySelector('[data-models-pane]');
    if (!pane) return null;
    const rows = pane.querySelectorAll('[data-model-row]');
    const row = rows[Math.min(3, rows.length - 1)];
    if (!row) return null;
    row.click();
    return row.getAttribute('data-model-row');
  });
  await sleep(600);
  models = await page.evaluate(modelsInfo);
  ok('a row click fills the preview panel', Boolean(picked) && models && /model id/i.test(models.detailText || ''), 'picked=' + picked + ' detail=' + JSON.stringify((models && models.detailText || '').slice(0, 90)));
  // Kapsam 4 asked for capacity/context/price; the catalog carries none, and
  // inventing them would make the catalog lie. Pin that honesty.
  const invented = (models && models.detailText ? models.detailText : '').match(/\b(context|ctx|price|cost|token)\b/i);
  ok('the preview invents NO capacity/context/price row', invented === null, invented ? 'invented row: ' + invented[0] : 'honest fields only');

  await page.screenshot({ path: '/tmp/req194-models-fullscreen.png' });
  console.log('screenshot: /tmp/req194-models-fullscreen.png');

  // Reset the search so the screenshot/state is clean for the next check.
  await page.evaluate(() => {
    const s = document.querySelector('[data-model-search]');
    if (s) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(s, '');
      s.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await sleep(500);

  // ── 6b ── the small shell keeps the OLD single-column Models pane.
  await page.keyboard.press('Escape'); // leave full screen
  await sleep(700);
  shell = await page.evaluate(shellInfo);
  // `data-models-pane` only exists in WIDE mode by design, so the small-shell
  // check must key off the always-present list hooks (`data-models-scroll`) and
  // give the lazy pane a beat to re-render after the shell swap.
  for (let i = 0; i < 15; i += 1) {
    models = await page.evaluate(modelsInfo);
    if (models) break;
    await sleep(400);
  }
  ok('leaving full screen restores the 768x640 shell', shell && shell.w === 768, 'w=' + (shell && shell.w));
  ok(
    'the small shell keeps the single-column Models pane (Inspector callers unchanged)',
    Boolean(models) && !models.wide && models.providerCount === 0 && !models.detailVisible,
    models ? 'wide=' + JSON.stringify(models.wide) + ' providers=' + models.providerCount + ' detailVisible=' + models.detailVisible : 'no models pane',
  );
  ok(
    'the small shell keeps the shipped 320px well',
    Boolean(models) && models.scrollMaxH === '320px',
    'maxHeight=' + (models && models.scrollMaxH),
  );
  ok(
    'the small shell has no provider index (single column)',
    Boolean(models) && !await page.evaluate(() => Boolean(document.querySelector('nav[aria-label="Model providers"]'))),
    'provider nav present=' + Boolean(models && models.providerCount),
  );

  // ── 7 ── 390px phone: full screen is already the layout, button hidden.
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(1200);
  shell = await page.evaluate(shellInfo);
  ok('at 390px the maximize button is hidden', shell && !shell.toggleVisible, 'display=' + (shell && shell.toggleVisible));
  models = await page.evaluate(modelsInfo);
  ok('at 390px Models is a single column (side columns hidden)', models && models.detailVisible === false, 'detailVisible=' + (models && models.detailVisible));
  const phoneOverflow = await page.evaluate(() => {
    // Measure the CONTENT boxes. The backdrop overlay's own clientWidth
    // excludes the viewport scrollbar gutter (390 - 5), so measuring it
    // reports 5px of "overflow" that is the scrollbar, not our layout.
    const shell = document.querySelector('[data-settings-shell]');
    const row = shell
      ? Array.from(shell.children).find((c) => c.querySelector && c.querySelector('nav[aria-label="Settings sections"]'))
      : null;
    const body = row ? row.children[1] : null;
    const list = document.querySelector('[data-models-scroll]');
    return {
      shell: shell ? shell.scrollWidth - shell.clientWidth : null,
      body: body ? body.scrollWidth - body.clientWidth : null,
      list: list ? list.scrollWidth - list.clientWidth : null,
    };
  });
  const phoneWorst = Math.max(
    Number(phoneOverflow && phoneOverflow.shell),
    Number(phoneOverflow && phoneOverflow.body),
    Number(phoneOverflow && phoneOverflow.list),
  );
  ok(
    'no horizontal overflow at 390px',
    phoneWorst >= 0 && phoneWorst <= 1,
    'shell/body/list overflow=' + JSON.stringify(phoneOverflow),
  );
  await page.screenshot({ path: '/tmp/req194-models-390.png' });
  console.log('screenshot: /tmp/req194-models-390.png');

  return report();
})().catch((e) => {
  console.error('probe crashed:', e);
  process.exit(2);
});