#!/usr/bin/env node
/**
 * REQ-155 live probe — a fast double submit must send ONCE and paint ONCE.
 *
 * Types a marker, presses Enter twice quickly (the accidental repeat), then:
 *  - counts the WS `prompt` frames carrying the marker (must be 1),
 *  - counts DOM elements rendering the marker (must be 1),
 *  - samples for a few seconds to catch a late echo duplicate.
 * Finally it checks a DELIBERATE re-ask after the guard window still sends.
 *
 * Usage: TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-submit-dedupe.cjs --url https://lokma.fermag.com.tr --token "$TK"
 */
const { chromium } = require('playwright-core');

const BASE = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'https://lokma.fermag.com.tr';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN =
  (process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : '') ||
  process.env.TOKEN;
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

const COUNT = (mark) =>
  [...document.querySelectorAll('div, span, p')].filter(
    (el) => !el.children.length && (el.textContent || '').trim() === mark,
  ).length;

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

  const MARK = `DUPCHK${Date.now().toString().slice(-5)}`;
  const prompts = [];
  page.on('websocket', (ws) => {
    ws.on('framesent', (f) => {
      const s = String(f.payload);
      if (s.includes('"type":"prompt"')) prompts.push(s);
    });
  });

  await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await sleep(6000);

  // Open a real workspace session.
  await page.evaluate(() => {
    const b = document.querySelector('button[aria-label="Group by project"]');
    if (b) b.click();
  });
  await sleep(1200);
  await page.evaluate(() => {
    const isCount = (s) => /^\d+$/.test(s);
    const groups = [...document.querySelectorAll('button[aria-expanded]')]
      .map((b) => {
        const label = (b.innerText || '').trim().split('\n')[0].trim();
        const badge = b.parentElement
          ? [...b.parentElement.children].find((n) => isCount((n.innerText || '').trim()))
          : null;
        return badge ? { label, el: b, expanded: b.getAttribute('aria-expanded') === 'true' } : null;
      })
      .filter(Boolean);
    window.__g = groups;
    const g = groups.find((x) => x.label && x.label !== 'Home');
    if (g && !g.expanded) g.el.click();
  });
  await sleep(1200);
  await page.evaluate(() => {
    const g = (window.__g || []).find((x) => x.label && x.label !== 'Home');
    const block = g && g.el.parentElement ? g.el.parentElement.parentElement : document.body;
    const row = block.querySelector('div[draggable="true"]');
    if (row) (row.querySelector('.cursor-pointer') || row).click();
  });
  await sleep(4000);

  const box = page.locator('textarea').first();
  await box.click();
  await box.fill(MARK);
  // The accidental double submit: two Enters back to back.
  await box.press('Enter');
  await box.press('Enter');

  const samples = [];
  for (const wait of [1200, 1500, 2000, 3000]) {
    await sleep(wait);
    samples.push(await page.evaluate(COUNT, MARK));
  }
  const sentForMark = prompts.filter((p) => p.includes(MARK)).length;
  const maxShown = Math.max(...samples);

  ok('a double Enter sends exactly one prompt', sentForMark === 1, `${sentForMark} prompt frame(s)`);
  ok('the message is painted exactly once', maxShown === 1, `samples: ${samples.join(', ')} (max ${maxShown})`);

  // Deliberate re-ask after the guard window must still go through.
  await sleep(2000);
  await box.fill(MARK);
  await box.press('Enter');
  await sleep(2500);
  const sentAfterRetype = prompts.filter((p) => p.includes(MARK)).length;
  ok('a deliberate re-ask after the guard window is still sent', sentAfterRetype >= 2, `${sentAfterRetype} prompt frame(s)`);

  const shot = '/tmp/req155-submit-dedupe.png';
  await page.screenshot({ path: shot });
  console.log(`screenshot: ${shot}`);

  await browser.close();
  if (failures.length) {
    console.log(`\nprobe-submit-dedupe: ${failures.length} regression(s): ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nprobe-submit-dedupe: one submit, one message — all checks passed.');
})();
