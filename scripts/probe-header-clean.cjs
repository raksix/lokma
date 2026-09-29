#!/usr/bin/env node
/**
 * REQ-175 live probe — the header must NOT print the session id (sess_...)
 * nor a Checking/Active/Down status pill any more: the gateway state lives
 * in the footer status bar and the session id lives in the session list.
 * The mode chips (lokma/Bots/Design) and the centre cost readout stay.
 *
 * Asserts on the rendered header (innerText + DOM), so a stale bundle that
 * still ships the old block fails loudly instead of passing on source text.
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-header-clean.cjs \
 *     --url http://127.0.0.1:3457 --token "$TK" --tag before
 */
const { chromium } = require('playwright-core');

const readFlag = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = readFlag('url', 'http://127.0.0.1:3457');
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN = readFlag('token', '') || process.env.TOKEN;
const TAG = readFlag('tag', 'live');
const SHOT_DIR = readFlag('shot-dir', '/tmp/req175');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('missing --token (mint one with scripts/mint-e2e-token.mjs)');
  process.exit(2);
}

const failures = [];
let checks = 0;
const ok = (name, pass, detail) => {
  checks += 1;
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  -- ' + detail : ''));
  if (!pass) failures.push(name);
};

// Runs in the browser: snapshot everything the assertions need in one shot.
const readHeader = () => {
  const header = document.querySelector('header');
  if (!header) return { error: 'no header element' };
  // Collapse whitespace without regex literals: split on any run of
  // whitespace chars (innerText separates elements with newlines).
  const collapse = (s) => {
    const parts = String(s || '').split(/\s+/).filter(Boolean);
    return parts.join(' ');
  };
  const text = collapse(header.innerText);
  const words = text.length > 0 ? text.split(' ') : [];
  const pillWords = words.filter((w) => w === 'Active' || w === 'Down' || w === 'Checking');
  const chips = [].slice.call(header.querySelectorAll('[data-mode-switch]')).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      id: el.getAttribute('data-mode-switch'),
      label: collapse(el.innerText),
      selected: el.getAttribute('aria-selected') === 'true',
      visible: r.width > 0 && r.height > 0,
    };
  });
  const costEl = header.querySelector('[title^="WS "]');
  const costRect = costEl ? costEl.getBoundingClientRect() : null;
  const mono = [].slice.call(header.querySelectorAll('.font-mono')).map((el) => collapse(el.innerText));
  const buttons = [].slice.call(header.querySelectorAll('button')).map((b) => ({
    title: b.getAttribute('title') || '',
    label: b.getAttribute('aria-label') || '',
  }));
  return {
    text,
    sess: text.indexOf('sess_') >= 0,
    pillWords,
    mono,
    chips,
    cost: costEl ? collapse(costEl.innerText) : null,
    costTitle: costEl ? costEl.getAttribute('title') : null,
    costVisible: Boolean(costRect && costRect.width > 0 && costRect.height > 0),
    buttons,
  };
};

(async () => {
  const fs = require('fs');
  fs.mkdirSync(SHOT_DIR, { recursive: true });
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
  const pageErrors = [];
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const loc = m.location();
      consoleErrors.push((loc && loc.url ? loc.url + ' :: ' : '') + m.text().slice(0, 140));
    }
  });
  page.on('pageerror', (e) => pageErrors.push('pageerror: ' + String(e).slice(0, 160)));

  await page.emulateMedia({ media: 'screen', hover: 'hover', pointer: 'fine' }).catch(() => undefined);
  await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await sleep(7000); // let the async server-theme stamp settle

  const h = await page.evaluate(readHeader);
  if (h.error) {
    ok('header element found', false, h.error);
  } else {
    ok(
      'header prints no session id (sess_ / font-mono)',
      !h.sess && h.mono.length === 0,
      'sess_=' + h.sess + ' mono=' + JSON.stringify(h.mono).slice(0, 120),
    );
    ok(
      'no Checking/Active/Down pill in the header',
      h.pillWords.length === 0,
      'words=' + JSON.stringify(h.pillWords) + ' text="' + h.text.slice(0, 160) + '"',
    );
    const chipIds = h.chips.map((c) => c.id).sort().join(',');
    ok(
      'three mode chips visible (lokma/Bots/Design)',
      h.chips.length === 3 && h.chips.every((c) => c.visible),
      'chips=' + chipIds,
    );
    ok(
      'centre cost readout stays',
      Boolean(h.cost && h.cost.length > 0 && h.costVisible),
      'cost="' + (h.cost || '') + '" title="' + (h.costTitle || '') + '" visible=' + h.costVisible,
    );
    const titles = h.buttons.map((b) => b.title + '|' + b.label).join(' ;; ');
    ok(
      'theme / search / settings buttons stay',
      h.buttons.some((b) => b.title === 'Toggle theme') &&
        h.buttons.some((b) => b.title.indexOf('Search') === 0) &&
        h.buttons.some((b) => b.title === 'Settings'),
      'buttons=' + titles.slice(0, 220),
    );
  }

  let shotOk = false;
  try {
    const header = page.locator('header').first();
    await header.screenshot({ path: SHOT_DIR + '/REQ-175-' + TAG + '-header.png' });
    await page.screenshot({ path: SHOT_DIR + '/REQ-175-' + TAG + '-full.png' });
    shotOk = true;
  } catch (e) {
    shotOk = false;
  }
  ok('screenshots captured (best effort)', shotOk, SHOT_DIR);

  ok('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ').slice(0, 300));
  // Resource 404s are informational: the app 404s /favicon.ico on every boot
  // (pre-existing, unrelated to this REQ), so they must not gate the probe.
  if (consoleErrors.length > 0) {
    console.log('INFO  console resource errors (' + consoleErrors.length + '): ' + consoleErrors.slice(0, 4).join(' | ').slice(0, 400));
  }

  await browser.close();
  const verdict = failures.length === 0 ? 'PASS' : 'FAIL';
  console.log(
    'probe-header-clean.cjs [' + TAG + ']: ' + (checks - failures.length) + '/' + checks + ' ' + verdict,
  );
  process.exit(failures.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error('probe crashed: ' + String(e).slice(0, 400));
  process.exit(1);
});
