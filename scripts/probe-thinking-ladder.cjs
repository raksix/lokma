#!/usr/bin/env node
/**
 * REQ-139 — live probe for the Hermes-parity effort ladder + compact reasoning.
 *
 * Run from the repo root:
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node scripts/probe-thinking-ladder.cjs
 *   ... --url https://lokma.fermag.com.tr --token <bearer>
 *
 * Checks:
 *   1. the composer picker lists every rung of the ladder (off → max)
 *   2. the picker header reads "Effort" (Hermes wording)
 *   3. picking Max persists to localStorage
 *   4. a reasoning run renders a capped preview, not the whole trace
 */
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE = arg('url', 'http://127.0.0.1:3457');
const TOKEN = arg('token', '');
const EXPECTED = ['Off', 'Minimal', 'Low', 'Medium', 'High', 'Extra High', 'Max'];

let passed = 0;
let failed = 0;
function check(cond, label, extra = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS: ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL: ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => {
    try {
      // Start from a clean slate: a stale `last session` pointer makes the app
      // fetch a session the server has already forgotten (404 noise).
      localStorage.clear();
      localStorage.setItem('lokma-token', t);
    } catch {
      /* ignore */
    }
  }, TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  const badResponses = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('response', async (r) => {
    if (r.status() >= 400) {
      const body = await r.text().catch(() => '');
      badResponses.push(`${r.status()} ${r.url()} ${body.slice(0, 80)}`);
    }
  });
  const url = TOKEN ? `${BASE}/?token=${encodeURIComponent(TOKEN)}` : `${BASE}/`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  // 1+2. Open the picker and read its rows.
  const trigger = page.locator('button[aria-label="Thinking budget"]').first();
  await trigger.waitFor({ timeout: 15000 });
  await trigger.click();
  await page.waitForTimeout(400);

  const header = (await page.locator('div.uppercase').first().textContent().catch(() => '')) || '';
  check(header.trim().toLowerCase() === 'effort', 'picker header reads Effort', header.trim());

  const labels = await page.evaluate(() => {
    // Rows carry `data-effort-option={id}` (REQ-143 dropped the hint line the
    // old selector keyed on) — the composer trigger has no such attribute.
    const rows = Array.from(document.querySelectorAll('button[data-effort-option]'));
    return rows.map((b) => (b.textContent || '').trim());
  });
  const seen = EXPECTED.filter((l) => labels.some((t) => t.startsWith(l)));
  check(
    seen.length === EXPECTED.length,
    `picker lists all ${EXPECTED.length} rungs`,
    `saw ${JSON.stringify(seen)}`,
  );
  check(labels.length === EXPECTED.length, 'no duplicate rows in the picker', `${labels.length} rows`);

  // REQ-143: the picker dropped its per-rung descriptions and got compact.
  const menu = await page.evaluate(() => {
    const el = document.querySelector('[data-effort-menu]');
    if (!el) return null;
    const rows = Array.from(el.querySelectorAll('button[data-effort-option]'));
    const rect = el.getBoundingClientRect();
    const texts = rows.map((r) => (r.textContent || '').trim());
    return {
      h: Math.round(rect.height),
      w: Math.round(rect.width),
      rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
      maxWords: Math.max(...texts.map((t) => t.split(/\s+/).length)),
      texts,
    };
  });
  if (!menu) {
    check(false, 'the effort menu is addressable', 'data-effort-menu not found');
  } else {
    const tallest = Math.max(...menu.rowHeights);
    check(tallest <= 32, 'every rung is one compact line', `tallest ${tallest}px [${menu.rowHeights.join(',')}]`);
    check(menu.h <= 240, 'the menu stays short', `${menu.h}px tall`);
    check(menu.w <= 200, 'the menu stays narrow', `${menu.w}px wide`);
    check(menu.maxWords <= 2, 'no description text under the labels', JSON.stringify(menu.texts));
  }

  // 3. Pick the top rung and confirm persistence.
  await page.locator('button', { hasText: /^Max/ }).first().click();
  await page.waitForTimeout(300);
  const stored = await page.evaluate(() => localStorage.getItem('lokma-composer-thinking'));
  check(stored === 'max', 'picking Max persists to localStorage', String(stored));

  // 4. Compact preview: structural check against the rendered transcript.
  const preview = await page.evaluate(() => {
    const details = Array.from(document.querySelectorAll('details'));
    const trace = details.find((d) => (d.querySelector('summary')?.textContent || '').includes('Thinking'));
    if (!trace) return { found: false };
    const body = trace.querySelector('div div');
    const more = Array.from(trace.querySelectorAll('button')).find((b) => /more line/.test(b.textContent || ''));
    return {
      found: true,
      lines: (body?.textContent || '').split('\n').filter(Boolean).length,
      capped: Boolean(more),
      moreText: more?.textContent?.trim() || '',
    };
  });
  if (preview.found) {
    check(preview.lines <= 5 || preview.capped, 'reasoning preview is capped', JSON.stringify(preview));
  } else {
    console.log('SKIP: no reasoning block in this transcript (probe ran without a reasoning turn)');
  }

  // Known-benign noise: a missing favicon, and the client's own probe for a
  // freshly minted session id that has no transcript yet (`session_not_found`).
  const realErrors = badResponses.filter(
    (r) => !/favicon/i.test(r) && !/session_not_found/.test(r),
  );
  check(realErrors.length === 0, 'no failed requests', realErrors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\nprobe-thinking-ladder: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('PROBE ERROR:', err.message);
  process.exit(1);
});
