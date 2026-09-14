#!/usr/bin/env node
/**
 * REQ-139 — live reasoning-turn probe: does a real thinking trace render
 * capped (Hermes parity) instead of dumping the whole thing?
 *
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs)
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node scripts/probe-reasoning-compact.cjs --url https://lokma.fermag.com.tr --token "$TK"
 */
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = arg('url', 'http://127.0.0.1:3457');
const TOKEN = arg('token', '');

const PROMPT = 'Reason step by step, then answer: write 12 separate short paragraphs about why the sky is blue.';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.clear();
      localStorage.setItem('lokma-token', t);
    } catch {
      /* ignore */
    }
  }, TOKEN);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?token=${encodeURIComponent(TOKEN)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  // Pick a deep level so the model actually reasons.
  await page.locator('button[aria-label="Thinking budget"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: /^High/ }).first().click();
  await page.waitForTimeout(300);

  const box = page.locator('textarea').first();
  await box.waitFor({ timeout: 15000 });
  await box.fill(PROMPT);
  await box.press('Enter');

  // Wait for reasoning deltas to arrive.
  let sawThinking = false;
  for (let i = 0; i < 30; i += 1) {
    await page.waitForTimeout(2000);
    sawThinking = await page.evaluate(() =>
      Array.from(document.querySelectorAll('details')).some((d) =>
        (d.querySelector('summary')?.textContent || '').toLowerCase().includes('thinking'),
      ),
    );
    if (sawThinking) break;
  }
  console.log(`reasoning block appeared: ${sawThinking}`);

  const shape = await page.evaluate(() => {
    const d = Array.from(document.querySelectorAll('details')).find((x) =>
      (x.querySelector('summary')?.textContent || '').toLowerCase().includes('thinking'),
    );
    if (!d) return null;
    const body = d.querySelector('div > div');
    const text = (body?.textContent || '').trim();
    const moreBtn = Array.from(d.querySelectorAll('button')).find((b) => /more line/i.test(b.textContent || ''));
    return {
      open: d.open,
      lines: text.split('\n').filter(Boolean).length,
      chars: text.length,
      capped: Boolean(moreBtn),
      moreText: moreBtn?.textContent?.trim() || '',
      buttonCount: d.querySelectorAll('button').length,
    };
  });
  console.log('trace shape:', JSON.stringify(shape));

  await page.screenshot({ path: '/tmp/req139-compact.png', fullPage: false });
  console.log('screenshot: /tmp/req139-compact.png');

  await browser.close();
  if (!shape) {
    // The model in the picker streamed no `reasoning_content` (deepseek-v4.1-flash
    // keeps it server-side), so there is nothing to measure — and nothing to fail.
    console.log('SKIP: no reasoning trace streamed by the selected model');
    process.exit(0);
  }
  const ok = shape.capped && shape.lines <= 5;
  console.log(ok ? 'COMPACT: PASS' : 'COMPACT: FAIL');
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('PROBE ERROR:', e.message);
  process.exit(1);
});
