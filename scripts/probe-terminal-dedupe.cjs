#!/usr/bin/env node
/**
 * REQ-158 live probe — the terminal must not repeat what you type, and the
 * synthetic `$` + cursor prompt line must be gone.
 *
 * DOM-driven (the terminal list is served over WS, not REST): open a session,
 * open its Terminal pane, type `echo <MARKER>` and count how often the marker
 * is painted. A duplicated frame delivery repeats the typed line 2-3×; the
 * natural echo + result is what we expect to see once each.
 *
 * Usage: TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-terminal-dedupe.cjs --url https://lokma.fermag.com.tr --token "$TK"
 */
const { chromium } = require('playwright-core');

const BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'https://lokma.fermag.com.tr';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN = (process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : '') || process.env.TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MARKER = `lokma${Math.floor(Math.random() * 90000 + 10000)}`;

if (!TOKEN) {
  console.error('TOKEN required');
  process.exit(1);
}

const failures = [];
const ok = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures.push(name);
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await sleep(6000);

  // Open a real workspace session (same path the submit-dedupe probe uses).
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
        const badge = b.parentElement ? [...b.parentElement.children].find((n) => isCount((n.innerText || '').trim())) : null;
        return badge ? { label, el: b, expanded: b.getAttribute('aria-expanded') === 'true' } : null;
      })
      .filter(Boolean);
    window.__g = groups;
    const g = groups.find((x) => x.label && x.label !== 'Home');
    if (g && !g.expanded) g.el.click();
  });
  await sleep(1200);
  const openedSession = await page.evaluate(() => {
    const g = (window.__g || []).find((x) => x.label && x.label !== 'Home');
    const block = g && g.el.parentElement ? g.el.parentElement.parentElement : document.body;
    const row = block.querySelector('div[draggable="true"]');
    if (!row) return null;
    (row.querySelector('.cursor-pointer') || row).click();
    return (row.innerText || '').trim().split('\n')[0].slice(0, 40);
  });
  ok('a session opens', Boolean(openedSession), openedSession || 'no sidebar row found');
  await sleep(4000);

  // Open the Terminal pane.
  const openedTerminal = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('button')].filter(
      (b) =>
        /terminal|shell/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')) ||
        b.querySelector('svg[class*="terminal"]'),
    );
    if (!cands.length) return false;
    cands[0].click();
    return true;
  });
  ok('the Terminal pane opens', openedTerminal, openedTerminal ? 'clicked' : 'no terminal button found');
  await sleep(5000);

  // The synthetic prompt line is a green "$" in the terminal viewport.
  const promptGlyphs = await page.evaluate(() => {
    return [...document.querySelectorAll('.text-emerald-400')].filter((el) => (el.textContent || '').trim() === '$').length;
  });
  ok('the synthetic "$" prompt line is gone', promptGlyphs === 0, `${promptGlyphs} on screen`);

  // Type a unique command into the focused terminal.
  await page.evaluate(() => {
    const cands = [...document.querySelectorAll('.font-mono, [tabindex]')].filter((el) => el.clientHeight > 60);
    const target = cands[cands.length - 1];
    if (target) target.click();
  });
  await page.keyboard.type(`echo ${MARKER}`);
  await page.keyboard.press('Enter');
  await sleep(5000);

  const count = await page.evaluate((m) => {
    const text = document.body.innerText;
    return text.split(m).length - 1;
  }, MARKER);

  // Legit: the shell echoes the command, then prints the result → 2 (sometimes 3
  // if the scrollback redraws). A duplicated delivery lands at 4-6.
  ok('the typed line is not repeated by duplicate deliveries', count <= 3, `marker painted ${count}× (expect 2-3)`);
  ok('the command actually ran', count >= 2, `${count}× — the shell echo and its output`);

  await page.screenshot({ path: '/tmp/req158-terminal.png' });
  console.log('screenshot: /tmp/req158-terminal.png');
  await browser.close();
  if (failures.length) {
    console.log(`\nprobe-terminal-dedupe: ${failures.length} failure(s): ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nprobe-terminal-dedupe: all checks passed.');
})();
