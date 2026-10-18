#!/usr/bin/env node
/**
 * REQ-204 slice 2 live probe — the Office surface (rail entry + pane shell).
 *
 * Asserts the deployed bundle serves the slice-2 contract:
 *   1. the Inspector rail carries exactly ONE Office entry, its icon is a
 *      lucide svg (no emoji, no icon font),
 *   2. clicking it reveals the Office pane (`[data-office-pane]`),
 *   3. the stats line is MEASURED, not stored: the numbers it prints equal
 *      the rows actually rendered (workers / waiting chips / deliveries),
 *   4. the workers section is either the honest empty state or rows — never
 *      both, never neither (no demo office, no placeholder desks),
 *   5. no emoji anywhere in the pane text.
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-office-surface.cjs --url https://lokma.fermag.com.tr --token "$TK"
 *
 * Exit 0 = the office surface is honest and reachable; 1 = regression.
 */
const { chromium } = require('playwright-core');

const BASE = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'https://lokma.fermag.com.tr';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN =
  (process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : '') ||
  process.env.TOKEN;
/** Optional evidence capture: screenshot the pane into this path. */
const SHOT = process.argv.includes('--shot') ? process.argv[process.argv.indexOf('--shot') + 1] : '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('TOKEN is required (HOME=/root bun scripts/mint-e2e-token.mjs)');
  process.exit(1);
}

const failures = [];
const ok = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures.push(name);
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('lokma-token', t);
    } catch {
      /* ignore */
    }
  }, TOKEN);
  const page = await ctx.newPage();

  await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await sleep(6500);

  // (1) rail entry: exactly one Office item, lucide svg icon, no emoji text.
  const rail = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Inspector rail"]');
    const office = nav
      ? [...nav.querySelectorAll('button[aria-label]')].filter((b) => b.getAttribute('aria-label') === 'Office')
      : [];
    const first = office[0] || null;
    return {
      railFound: !!nav,
      officeCount: office.length,
      hasSvg: first ? !!first.querySelector('svg') : false,
      text: first ? (first.textContent || '').trim() : null,
      draggable: first ? first.getAttribute('draggable') === 'true' : false,
    };
  });
  ok('rail exists', rail.railFound);
  ok('rail has exactly one Office entry', rail.officeCount === 1, `count=${rail.officeCount}`);
  ok('Office icon is a lucide svg', rail.hasSvg);
  ok('Office rail entry carries no text glyph', rail.text === '');
  ok('Office rail entry is draggable (pane-tab contract, REQ-026)', rail.draggable);

  // (2) click -> sidebar Inspector reveals the office pane.
  await page.click('nav[aria-label="Inspector rail"] button[aria-label="Office"]');
  await sleep(2500);

  const pane = await page.evaluate(() => {
    const root = document.querySelector('[data-office-pane]');
    if (!root) return { found: false };
    const statsEl = root.querySelector('[data-office-stats]');
    const workers = [...root.querySelectorAll('[data-office-worker]')];
    const waiting = [...root.querySelectorAll('[data-office-waiting]')];
    const deliveries = [...root.querySelectorAll('[data-office-delivery]')];
    const empty = [...root.querySelectorAll('[data-office-empty]')];
    const deliveriesEmpty = [...root.querySelectorAll('[data-office-deliveries-empty]')];
    const text = root.innerText || '';
    return {
      found: true,
      stats: statsEl ? statsEl.textContent.trim() : null,
      workerCount: workers.length,
      waitingCount: waiting.length,
      deliveryCount: deliveries.length,
      emptyCount: empty.length,
      deliveriesEmptyCount: deliveriesEmpty.length,
      emoji: /[\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(text),
      overflowX: root.scrollWidth - root.clientWidth,
    };
  });
  ok('clicking the rail entry opens the Office pane', pane.found);
  if (pane.found && SHOT) {
    const el = await page.$('[data-office-pane]');
    if (el) {
      await el.screenshot({ path: SHOT });
      console.log(`info  screenshot -> ${SHOT}`);
    }
  }
  if (pane.found) {
    const m = /^(\d+) working · (\d+) waiting · (\d+) delivered$/.exec(pane.stats || '');
    ok('stats line parses', !!m, pane.stats || 'none');
    if (m) {
      ok('working count == rendered worker rows', Number(m[1]) === pane.workerCount, `${m[1]} vs ${pane.workerCount}`);
      ok('waiting count == rendered waiting chips', Number(m[2]) === pane.waitingCount, `${m[2]} vs ${pane.waitingCount}`);
      ok('delivered count == rendered delivery rows', Number(m[3]) === pane.deliveryCount, `${m[3]} vs ${pane.deliveryCount}`);
    }
    ok(
      'workers section is empty-state XOR rows (never both/neither)',
      (pane.emptyCount === 1) === (pane.workerCount === 0),
      `empty=${pane.emptyCount} rows=${pane.workerCount}`,
    );
    ok(
      'deliveries section is empty-state XOR rows',
      (pane.deliveriesEmptyCount === 1) === (pane.deliveryCount === 0),
      `empty=${pane.deliveriesEmptyCount} rows=${pane.deliveryCount}`,
    );
    ok('no emoji in the pane text', !pane.emoji);
    ok('no horizontal overflow inside the pane', pane.overflowX <= 1, `overflow=${pane.overflowX}px`);
  }

  // (3) narrow viewport: the pane must not push the document sideways.
  await page.setViewportSize({ width: 390, height: 850 });
  await sleep(1500);
  const narrow = await page.evaluate(() => {
    return {
      docOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panePresent: !!document.querySelector('[data-office-pane]'),
    };
  });
  ok('390px: document has no horizontal overflow', narrow.docOverflow <= 1, `overflow=${narrow.docOverflow}px`);
  console.log(`info  narrow: panePresent=${narrow.panePresent} (mobile single-view may host it without the rail)`);

  await browser.close();
  console.log(`\n${failures.length === 0 ? 'OFFICE SURFACE OK' : `FAILURES: ${failures.length}`}`);
  if (failures.length > 0) {
    console.log(failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
})().catch((e) => {
  console.error('probe crashed:', e && e.stack ? e.stack : e);
  process.exit(1);
});
