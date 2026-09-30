#!/usr/bin/env node
/**
 * REQ-177 live probe - the Design composer's model picker is REAL UI wiring.
 *
 * The server side of this request (a real model call, the request model
 * beating the default, honest failures, no silent template fallback) is
 * proven by scripts/probe-design-real-model.cjs (21/21). This probe drives
 * the LIVE Design page in a real browser and asserts the UI half:
 *
 *   1  the composer carries a Model SelectMenu (REQ-179: no native select)
 *      fed by the shared provider catalog (provider groups, concrete model
 *      options, no test sentinel leaks into the picker)
 *   2  picking a model is remembered: the page snapshot holds it and it
 *      survives a full reload
 *   3  the picked model leaves the browser in the generate request body
 *      (captured on the wire). The request is then fulfilled with a
 *      simulated upstream failure so no billed generation runs - the wire
 *      body is the thing under test here.
 *   4  that failure surfaces as an honest UI error (inline form error +
 *      error chip) and creates NOTHING (artifact list unchanged) - never
 *      a silent template fallback
 *   5  the picker keeps the selection after the failed attempt
 *
 * Before/after screenshots of artifact QUALITY ride along: the local
 * evidence files from the API probe (a-real.html = real model output,
 * c-template.html = the old deterministic builder, same brief) are
 * rendered and captured for the REQ evidence.
 *
 * Run (login gate stays ON; token minted with scripts/mint-e2e-token.mjs):
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node \
 *     scripts/probe-design-ui-model.cjs --url http://127.0.0.1:3457 \
 *     --token-file /tmp/lokma-e2e-token --out /tmp/lokma-req177
 */
'use strict';
const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright-core');

function argOf(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const BASE = argOf('--url', 'http://127.0.0.1:3457');
const TOKEN = readFileSync(argOf('--token-file', '/tmp/lokma-e2e-token'), 'utf8').trim();
const OUT = argOf('--out', '/tmp/lokma-req177');
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const PREFERRED = 'commandcode/deepseek/deepseek-v4.1-flash';
const SENTINEL = 'offline-template';

let passed = 0;
const EXPECTED = 20;
function check(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}
function info(k, v) {
  console.log('INFO: ' + k + ' = ' + v);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -- page-side readers (browser globals only, one arg max) -----------------

const pickerState = () => {
  const el = document.querySelector('[data-design-composer-model]');
  if (!el) return null;
  return {
    value: el.getAttribute('data-select-value'),
    label: (el.textContent || '').trim(),
    tag: el.tagName,
  };
};

// REQ-179 — the picker is a SelectMenu popup: open it, then walk the menu in
// DOM order so each option knows which provider group heading it sits under.
const menuState = () => {
  const menu = document.querySelector('[data-select-menu]');
  if (!menu) return null;
  let group = null;
  const options = [];
  const groups = [];
  const nodes = menu.children;
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i];
    if (el.hasAttribute('data-select-group')) {
      group = el.getAttribute('data-select-group');
      groups.push(group);
    } else if (el.hasAttribute('data-select-option')) {
      options.push({
        value: el.getAttribute('data-select-option'),
        label: (el.textContent || '').trim(),
        group: group,
      });
    }
  }
  return { options: options, groups: groups };
};

const composerState = () => {
  const box = document.querySelector('[data-design-composer]');
  if (!box) return null;
  const sel = box.querySelector('[data-design-composer-model]');
  const btn = box.querySelector('[data-design-generate]');
  return {
    text: (box.textContent || '').trim(),
    modelValue: sel ? sel.getAttribute('data-select-value') : null,
    generateDisabled: btn ? Boolean(btn.disabled) : null,
  };
};

const pageState = () => ({
  msgIds: [].slice
    .call(document.querySelectorAll('[data-design-msg]'))
    .map((m) => m.getAttribute('data-design-msg')),
  events: [].slice
    .call(document.querySelectorAll('[data-design-event]'))
    .map((e) => (e.textContent || '').trim()),
});

const snapshotRaw = () => {
  try {
    return localStorage.getItem('lokma-design-page:v1');
  } catch (e) {
    return null;
  }
};

const clickDesignMode = () => {
  const b = document.querySelector('[data-mode-switch="design"]');
  if (!b) return false;
  b.click();
  return true;
};

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
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
  // The viewer iframe is a plain navigation: a real session also carries the
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
  await page.waitForSelector('[data-mode-switch="design"]', { timeout: 20000 });
  await page.evaluate(clickDesignMode);
  await page.waitForSelector('[data-design-page]', { timeout: 15000 });
  await sleep(1500);

  // ── 1 ── the picker renders and is fed by the provider catalog ─────────
  // REQ-179 — the picker is a SelectMenu popup (no native <select>): open
  // it, read the options/groups in DOM order, then pick by clicking the row.
  let P = null;
  let M = null;
  for (let i = 0; i < 30; i += 1) {
    P = await page.evaluate(pickerState);
    if (!P) {
      await sleep(500);
      continue;
    }
    const menuOpen = await page.evaluate(() => Boolean(document.querySelector('[data-select-menu]')));
    if (!menuOpen) await page.click('[data-design-composer-model]');
    M = await page.evaluate(menuState);
    if (M && M.options.length > 1 && M.groups.length > 0) break;
    if (menuOpen) await page.keyboard.press('Escape');
    await sleep(500);
  }
  check(Boolean(P), '1 the composer model picker renders');
  check(
    Boolean(P && P.tag !== 'SELECT'),
    '1b the picker is a SelectMenu trigger, not a native <select> (tag=' + (P ? P.tag : 'n/a') + ')',
  );
  check(
    Boolean(M && M.options.length > 1),
    '2 the picker is fed from the catalog (options > 1; got ' + (M ? M.options.length : 'n/a') + ')',
  );
  check(
    Boolean(M && M.groups.length > 0),
    '3 provider groups present (' + (M ? M.groups.length : 'n/a') + ' groups)',
  );
  check(
    Boolean(M && M.options.every((o) => o.value !== SENTINEL)),
    '4 no test sentinel leaks into the picker (' + SENTINEL + ' absent)',
  );

  const preferred = M.options.find((o) => o.value === PREFERRED);
  const fallback = M.options.find((o) => o.group === 'commandcode' && o.value);
  const chosen = preferred || fallback || M.options.find((o) => o.value);
  check(
    Boolean(chosen && chosen.value),
    '5 a concrete model option is selectable (' + (chosen ? chosen.value : 'none') + ')',
  );
  info('picked model', chosen.value);

  // The menu is open from the catalog scan; pick the row, then confirm the
  // popup closed itself and the trigger mirrors the value.
  if (!(await page.evaluate(() => Boolean(document.querySelector('[data-select-menu]'))))) {
    await page.click('[data-design-composer-model]');
    await page.waitForSelector('[data-select-menu]', { timeout: 5000 });
  }
  await page.click('[data-select-option="' + chosen.value + '"]');
  await sleep(800);
  let C = await page.evaluate(composerState);
  check(Boolean(C && C.modelValue === chosen.value), '6 selecting a model updates the picker value');
  const snap = await page.evaluate(snapshotRaw);
  check(
    Boolean(snap && snap.indexOf(chosen.value) >= 0),
    '7 the page snapshot remembers the picked model (localStorage)',
  );
  await page.screenshot({ path: join(OUT, 'ui-1-picker.png') });

  // ── 2 ── reload: mode + picker selection both come back ────────────────
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(6000);
  let backOnDesign = false;
  for (let i = 0; i < 20 && !backOnDesign; i += 1) {
    backOnDesign = Boolean(await page.$('[data-design-page]'));
    if (!backOnDesign) await sleep(500);
  }
  if (!backOnDesign) {
    await page.waitForSelector('[data-mode-switch="design"]', { timeout: 15000 });
    await page.evaluate(clickDesignMode);
    for (let i = 0; i < 20 && !backOnDesign; i += 1) {
      backOnDesign = Boolean(await page.$('[data-design-page]'));
      if (!backOnDesign) await sleep(500);
    }
  }
  check(backOnDesign, '8 reload lands back on the Design page (mode persisted)');
  let P2 = null;
  for (let i = 0; i < 30; i += 1) {
    P2 = await page.evaluate(pickerState);
    if (P2 && P2.options.length > 1) break;
    await sleep(500);
  }
  check(
    Boolean(P2 && P2.value === chosen.value),
    '9 the picked model survives the reload (snapshot restore; got ' + (P2 ? P2.value : 'n/a') + ')',
  );

  // ── 3 ── generate: the wire body must carry the picked model ───────────
  // Intercepted on purpose: the wire body is under test; the real
  // end-to-end generation is already covered by the API probe. Fulfilled
  // with a simulated upstream failure so no billed call runs.
  let captured = null;
  await page.route('**/api/design/generate', async (route) => {
    const req = route.request();
    let body = null;
    try {
      body = JSON.parse(req.postData() || '{}');
    } catch (e) {
      body = null;
    }
    captured = { method: req.method(), body: body };
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'design_upstream_error',
        message: 'probe simulated upstream failure (intercepted)',
      }),
    });
  });
  const beforeIds = (await page.evaluate(pageState)).msgIds;
  const brief = 'model picker probe ' + Date.now().toString(36);
  await page.fill('[data-design-brief]', brief);
  await page.click('[data-design-generate]');
  for (let i = 0; i < 40 && !captured; i += 1) await sleep(250);
  check(Boolean(captured && captured.body), '10 the generate POST left the browser');
  info('wire body', JSON.stringify(captured && captured.body));
  check(
    Boolean(captured && captured.body && captured.body.model === chosen.value),
    '11 the wire body carries the picked model (' + (captured && captured.body ? String(captured.body.model) : 'n/a') + ')',
  );
  check(
    Boolean(captured && captured.body && captured.body.brief === brief),
    '12 the wire body carries the probe brief',
  );

  // ── 4 ── the failure shows honestly and creates nothing ────────────────
  let E = null;
  for (let i = 0; i < 40; i += 1) {
    E = await page.evaluate(composerState);
    if (E && E.text.indexOf('probe simulated upstream failure') >= 0) break;
    await sleep(250);
  }
  check(
    Boolean(E && E.text.indexOf('probe simulated upstream failure') >= 0),
    '13 the inline form error shows the honest server message',
  );
  const st = await page.evaluate(pageState);
  check(
    st.events.some((t) => t.indexOf('Generate failed') === 0),
    '14 an error chip lands in the thread (' + JSON.stringify(st.events.slice(-3)) + ')',
  );
  check(
    st.msgIds.length === beforeIds.length,
    '15 no artifact was silently created (message count ' + st.msgIds.length + ' = ' + beforeIds.length + ')',
  );
  const C2 = await page.evaluate(composerState);
  check(
    Boolean(C2 && C2.modelValue === chosen.value),
    '16 the picker keeps the selection after the failed attempt',
  );
  await page.screenshot({ path: join(OUT, 'ui-2-error.png') });

  // ── 5 ── before/after artifact-quality evidence shots ─────────────────
  const realHtml = readFileSync(join(OUT, 'a-real.html'), 'utf8');
  const tplHtml = readFileSync(join(OUT, 'c-template.html'), 'utf8');
  check(
    realHtml.length > 10000 && tplHtml.length < 5000 && realHtml !== tplHtml,
    '17 before/after sources exist and differ (real ' +
      realHtml.length +
      ' vs template ' +
      tplHtml.length +
      ' bytes)',
  );
  const artPage = await ctx.newPage();
  await artPage.setViewportSize({ width: 1440, height: 900 });
  const shots = [
    { file: 'c-template.html', out: 'artifact-before-template.png' },
    { file: 'a-real.html', out: 'artifact-after-real.png' },
  ];
  for (const s of shots) {
    await artPage.goto('file://' + join(OUT, s.file), { waitUntil: 'load' });
    await sleep(1200);
    await artPage.screenshot({ path: join(OUT, s.out), fullPage: true });
    info('screenshot', s.out);
  }
  const shotFiles = ['ui-1-picker.png', 'ui-2-error.png', 'artifact-before-template.png', 'artifact-after-real.png'];
  check(
    shotFiles.every((f) => existsSync(join(OUT, f))),
    '18 all four evidence screenshots were written',
  );

  // ── report ─────────────────────────────────────────────────────────────
  console.log('--- 4xx/5xx responses seen ---');
  console.log(http4xx.join('\n') || '(none)');
  const jsErrors = errors.filter((e) => e.indexOf('Failed to load resource') === -1);
  check(jsErrors.length === 0, '19 no JavaScript errors on the page (' + (jsErrors.slice(0, 2).join(' | ') || 'clean') + ')');

  writeFileSync(
    join(OUT, 'ui-summary.json'),
    JSON.stringify(
      {
        checks: passed + '/' + EXPECTED,
        pickedModel: chosen.value,
        wireBody: captured && captured.body,
        simulatedMessage: 'probe simulated upstream failure (intercepted)',
        shots: shotFiles,
      },
      null,
      2,
    ),
  );
  await browser.close();
  if (passed !== EXPECTED) throw new Error('expected ' + EXPECTED + ' checks, ran ' + passed);
  console.log('TOTAL: ' + passed + '/' + EXPECTED + ' PASS - evidence at ' + OUT);
})().catch(function (e) {
  console.error('PROBE FAILED after ' + passed + '/' + EXPECTED + ' checks: ' + (e && e.message));
  process.exit(1);
});
