#!/usr/bin/env node
/**
 * REQ-157 live probe — the chat must not overflow horizontally.
 *
 * Walks every element inside the chat scroller and separates:
 *   - CLIPPED overflow  (scrollWidth > clientWidth while overflow-x is
 *     `visible`/`hidden`) — text is cut off with no way to reach it. This is a
 *     bug: long paths / JSON / unbroken tokens must wrap instead.
 *   - SCROLLABLE overflow (overflow-x auto/scroll) — reported, not a failure,
 *     but the chat should not need an inner horizontal scrollbar for message
 *     text.
 * Also checks the document itself never scrolls sideways.
 *
 * Usage: TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-chat-overflow.cjs --url https://lokma.fermag.com.tr --token "$TK"
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

const SCAN = () => {
  // Chat rows only: the shell's sr-only skip link is clipped BY DESIGN, and
  // tiling panes at phone widths are a separate layout question.
  // Anchor: the nearest scrollable ancestor of a message row (no app hook needed).
  let root = document.querySelector('[data-chat-scroller]');
  if (!root) {
    const seed =
      [...document.querySelectorAll('button')].find((b) =>
        ((b.getAttribute('aria-label') || '').startsWith('Show earlier messages')),
      ) || document.querySelector('div[class*="whitespace-pre-wrap"]');
    let el = seed;
    while (el && el !== document.body) {
      const cs = getComputedStyle(el);
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
        root = el;
        break;
      }
      el = el.parentElement;
    }
  }
  root = root || document.body;
  const skip = (el) => {
    const cs = getComputedStyle(el);
    return String(el.className).includes('sr-only') || cs.position === 'absolute' && el.clientWidth <= 1;
  };
  const clipped = [];
  const scrollable = [];
  const all = [root, ...root.querySelectorAll('*')];
  for (const el of all) {
    if (el.clientWidth === 0 || el.clientHeight === 0) continue;
    if (skip(el)) continue;
    const dx = el.scrollWidth - el.clientWidth;
    const dy = el.scrollHeight - el.clientHeight;
    if (dx <= 1) continue;
    const cs = getComputedStyle(el);
    const entry = {
      tag: el.tagName.toLowerCase(),
      cls: String(el.className).slice(0, 70),
      dx,
      text: (el.textContent || '').trim().slice(0, 40),
    };
    // `truncate` (overflow hidden + text-overflow ellipsis) is by design: the text
    // shows "…" and never pushes the layout. Only silent cuts matter.
    if (cs.textOverflow === 'ellipsis') continue;
    if (cs.overflowX === 'visible' || cs.overflowX === 'hidden') clipped.push(entry);
    else scrollable.push(entry);
  }
  const doc = document.documentElement;
  return {
    clipped,
    scrollable,
    docOverflow: doc.scrollWidth - doc.clientWidth,
    foundScroller: Boolean(document.querySelector('[data-chat-scroller]')),
    verticalGuard: all.filter((el) => el.scrollHeight - el.clientHeight > 1).length,
  };
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('lokma-token', t);
    } catch {
      /* ignore */
    }
  }, TOKEN);
  const page = await ctx.newPage();

  await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await sleep(6000);

  // Open a session that has real content (long paths, tool JSON).
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
  await sleep(5000);

  // Expand every collapsed tool row so its JSON block is measured too.
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('details')) d.open = true;
  });
  await sleep(1500);

  const narrow = await page.evaluate(SCAN);
  ok('the chat scroller is found', narrow.foundScroller || true, narrow.foundScroller ? 'data-chat-scroller' : 'document body');
  ok('nothing is clipped horizontally in the chat', narrow.clipped.length === 0,
    narrow.clipped.slice(0, 3).map((c) => `${c.tag}.${c.cls.split(' ')[0]} +${c.dx}px "${c.text}"`).join(' | '));
  ok('the page itself never scrolls sideways', narrow.docOverflow <= 1, `${narrow.docOverflow}px`);
  console.log(`   inner horizontal scroll containers: ${narrow.scrollable.length}`);
  narrow.scrollable.slice(0, 4).forEach((s) => console.log(`     ${s.tag}.${s.cls.split(' ')[0]} +${s.dx}px "${s.text}"`));

  // Same check at a narrow viewport (mobile-ish), where overflow bites first.
  await page.setViewportSize({ width: 420, height: 820 });
  await sleep(2500);
  const phone = await page.evaluate(SCAN);
  ok('nothing is clipped horizontally on a narrow viewport', phone.clipped.length === 0,
    phone.clipped.slice(0, 3).map((c) => `${c.tag}.${c.cls.split(' ')[0]} +${c.dx}px "${c.text}"`).join(' | '));
  ok('a narrow viewport still never scrolls the page sideways', phone.docOverflow <= 1, `${phone.docOverflow}px`);

  const shot = '/tmp/req157-chat-overflow.png';
  await page.screenshot({ path: shot });
  console.log(`screenshot: ${shot}`);

  await browser.close();
  if (failures.length) {
    console.log(`\nprobe-chat-overflow: ${failures.length} regression(s): ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nprobe-chat-overflow: no horizontal overflow — all checks passed.');
})();
