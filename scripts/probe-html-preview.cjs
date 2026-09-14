#!/usr/bin/env node
/**
 * REQ-137 live probe — HTML preview in the real app.
 *
 * Opens a self-contained HTML file from the workspace, then asserts the two
 * things that regressed:
 *   1. the preview frame keeps `sandbox="allow-scripts"` while it is open
 *      (a session poll used to reset the pane every few seconds), and
 *   2. the page's scripts actually ran - measured *inside the frame*, because
 *      `iframe.contentDocument` is null for any sandboxed (opaque origin) doc.
 *
 * Usage:
 *   TOKEN=... NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-html-preview.cjs [file.html] [--url http://127.0.0.1:3457]
 *
 * Exit code 0 = preview is stable and its scripts ran; 1 = regression.
 */
const { chromium } = require('playwright-core');

const BASE = (process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://127.0.0.1:3457');
const TARGET = process.argv.slice(2).find((a) => !a.startsWith('--') && a !== BASE) || 'lunapark_muse.html';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN = process.env.TOKEN;
const SAMPLES = 10;
const EVERY_MS = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('TOKEN is required (bun scripts/mint-e2e-token.mjs)');
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
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
  await sleep(5000);
  // Reach the workspace + file through the explorer; tolerant of label changes.
  await page.locator('text=deneme').first().click().catch(() => {});
  await sleep(2500);
  await page.locator('text=/lunapark|3D|deneme/i').nth(1).click().catch(() => {});
  await sleep(4000);
  await page.locator(`text=${TARGET}`).first().click();
  await sleep(10000);

  const sandboxes = [];
  let scene = 'no-frame';
  for (let i = 0; i < SAMPLES; i++) {
    const sb = await page
      .evaluate((name) => {
        const f = [...document.querySelectorAll('iframe')].find(
          (el) => (el.getAttribute('title') || '').includes(name),
        );
        return f ? (f.getAttribute('sandbox') ?? 'ABSENT') : 'NO-FRAME';
      }, TARGET)
      .catch(() => 'ERR');
    sandboxes.push(sb);
    if (i === 0) {
      const frame = page.frames().find((fr) => {
        const u = fr.url();
        return u === '' || u.startsWith('about:srcdoc');
      });
      if (frame) {
        scene = await frame
          .evaluate(() => {
            const c = document.querySelectorAll('canvas').length;
            return `title="${document.title}" canvas=${c} THREE=${typeof window.THREE}`;
          })
          .catch((e) => 'eval-err: ' + String(e).slice(0, 60));
      }
    }
    await sleep(EVERY_MS);
  }

  const unique = [...new Set(sandboxes)];
  const stable = unique.length === 1 && unique[0] === 'allow-scripts';
  const scriptsRan = /canvas=[1-9]|THREE=object/.test(scene);

  console.log(`file:      ${TARGET}`);
  console.log(`sandbox:   ${sandboxes.join(' ')}  (unique: ${unique.join(', ')})`);
  console.log(`in-frame:  ${scene}`);
  console.log(`stable:    ${stable ? 'PASS' : 'FAIL'}`);
  console.log(`scripts:   ${scriptsRan ? 'PASS' : 'FAIL'}`);
  console.log(stable && scriptsRan ? 'RESULT: PASS' : 'RESULT: FAIL');

  await browser.close();
  process.exit(stable && scriptsRan ? 0 : 1);
})();
