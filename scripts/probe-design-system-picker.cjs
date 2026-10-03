#!/usr/bin/env bun
/**
 * REQ-191 slice 2 — live browser proof that the System picker is GROUPED by
 * the OpenDesign taxonomy and SEARCHABLE, fed by the real installed catalog.
 *
 * Zero model cost: nothing is generated.
 * The login gate stays ON (minted superadmin Bearer, never flipped).
 */
const { readFileSync } = require(node:fs);
const { chromium } = require('playwright-core');

const BASE = process.env.KB_BASE || 'http://127.0.0.1:3457';
const TOKEN = process.argv[2] || readFileSync('/tmp/lokma-tok.txt', 'utf8').trim();
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

let passed = 0;
function ok(label, cond, extra) {
  if (cond) { passed += 1; console.log('PASS  ' + label + (extra ? '  — ' + extra : '')); }
  else { console.log('FAIL  ' + label + (extra ? '  — ' + extra : '')); process.exitCode = 1; }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([
    { name: 'lokma_token', value: TOKEN, domain: '127.0.0.1', path: '/' },
  ]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-mode-switch]', { timeout: 20000 }).catch(() => {});
  // Open the Design page (top switch), then the composer's System menu.
  const opened = await page.evaluate(() => {
    const el = [...document.querySelectorAll('button,[role="tab"]')]
      .find((n) => (n.textContent || '').trim().toLowerCase() === 'design');
    if (el) { el.click(); return true; }
    return false;
  });
  ok('the Design switch opens', opened);
  await page.waitForSelector('[data-design-composer-system]', { timeout: 20000 });
  await page.click('[data-design-composer-system]');
  await page.waitForSelector('[data-select-menu-open]', { timeout: 8000 });

  const groups = await page.$$eval('[data-select-group]', (ns) => ns.map((n) => n.textContent.trim()));
  ok('the picker renders TAXONOMY group headers', groups.length >= 3, 'groups=' + JSON.stringify(groups));
  ok('AI & LLM group is visible', groups.some((g) => /AI/i.test(g)), JSON.stringify(groups));
  ok('Developer Tools group is visible', groups.some((g) => /Developer Tools/i.test(g)));
  ok('Fintech group is visible', groups.some((g) => /Fintech/i.test(g)));

  const hasSearch = await page.$('[data-select-search]');
  ok('the picker has a search box', Boolean(hasSearch));

  // Filter narrows the list AND empties a group header rather than printing it empty.
  await page.fill('[data-select-search]', 'linear');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    groups: [...document.querySelectorAll('[data-select-group]')].map((n) => n.textContent.trim()),
    opts: [...document.querySelectorAll('[data-select-option]')].map((n) => n.getAttribute('data-select-option')),
  }));
  ok('searching narrows the options', after.opts.length === 1 && after.opts[0] === 'linear-pkg', JSON.stringify(after.opts));
  ok('a filtered-out group header disappears', !after.groups.some((g) => /AI|Fintech/i.test(g)), JSON.stringify(after.groups));

  // Space must not commit a row while the box has focus.
  await page.fill('[data-select-search]', '');
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  const stillOpen = await page.$('[data-select-menu-open]');
  ok('Space in the search box does not close the menu', Boolean(stillOpen));

  // Commit the filtered row for real: the selection must reach the form.
  await page.fill('[data-select-search]', 'stripe');
  await page.waitForTimeout(350);
  await page.click('[data-select-option="stripe-pkg"]');
  await page.waitForTimeout(500);
  const value = await page.getAttribute('[data-design-composer-system]', 'data-select-value');
  ok('picking a catalog row sets the form system', value === 'stripe-pkg', 'value=' + value);

  await page.click('[data-design-composer-system]');
  await page.waitForSelector('[data-select-menu-open]', { timeout: 8000 });
  await page.screenshot({ path: '/tmp/req191-system-picker.png' });
  console.log('screenshot: /tmp/req191-system-picker.png');

  ok('no JavaScript errors on the page', errors.length === 0, errors.slice(0, 2).join(' | '));
  await browser.close();
  console.log('\nsystem picker: ' + passed + ' passed, ' + (process.exitCode ? 'failures above' : '0 failed'));
})().catch((e) => { console.log('PROBE ERROR: ' + e.message); process.exit(1); });
