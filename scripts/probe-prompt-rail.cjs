#!/usr/bin/env node
/**
 * REQ-140 — live prompt-rail probe: the dot rail must list only the prompts
 * the user sent (never assistant/tool/thinking rows), and clicking a dot must
 * land on that prompt.
 *
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node scripts/probe-prompt-rail.cjs --url https://lokma.fermag.com.tr --token "$TK"
 */
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = arg('url', 'http://127.0.0.1:3457');
const TOKEN = arg('token', '');

const PROMPTS = ['PROMPT RAIL PROBE ONE', 'PROMPT RAIL PROBE TWO', 'PROMPT RAIL PROBE THREE'];

const results = [];
function check(ok, label, extra = '') {
  results.push({ ok, label });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${extra ? ` — ${extra}` : ''}`);
}

/** Benign noise: favicon, and the fresh-session transcript 404 (by design). */
function benign(url, status) {
  if (/favicon/.test(url)) return true;
  if (status === 404 && /\/api\/sessions\/[^/]+$/.test(url)) return true;
  return false;
}

/** Row count of the transcript, plus whether a run is still in flight. */
function snapshot(page) {
  return page.evaluate(() => ({
    rows: document.querySelectorAll('[id^="chat-msg-"]').length,
    busy: /working|thinking|stop/i.test(
      Array.from(document.querySelectorAll('button')).map((b) => b.getAttribute('aria-label') || '').join(' '),
    ),
  }));
}

async function waitForRunEnd(page, before, timeoutMs = 90000) {
  const started = Date.now();
  let stable = 0;
  let last = before;
  while (Date.now() - started < timeoutMs) {
    await page.waitForTimeout(1500);
    const snap = await snapshot(page);
    if (snap.rows > before && snap.rows === last) stable += 1;
    else stable = 0;
    last = snap.rows;
    if (snap.rows > before && stable >= 2) return snap.rows;
  }
  return last;
}

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
  const failed = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && !benign(r.url(), r.status())) failed.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(`${BASE}/?token=${encodeURIComponent(TOKEN)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  // Start from an empty session: boot resumes the most recent one, which would
  // make the expected prompt count depend on whatever ran before.
  await page.locator('button[aria-label="New session"]').first().click();
  await page.waitForTimeout(2500);

  const box = page.locator('textarea').first();
  await box.waitFor({ timeout: 20000 });

  // Send three prompts; each one becomes a user row (and, when the upstream
  // answers, an assistant row — which the rail must ignore).
  for (const text of PROMPTS) {
    const before = (await snapshot(page)).rows;
    await box.fill(text);
    await box.press('Enter');
    await waitForRunEnd(page, before);
  }

  // ---- measure the rail
  const rail = await page.evaluate(() => {
    const dots = Array.from(document.querySelectorAll('[aria-label^="Go to your prompt"]'));
    const rows = Array.from(document.querySelectorAll('[id^="chat-msg-"]')).map((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return {
        id: el.id,
        snippet: text.slice(0, 50),
        // UserRow renders the avatar glyph then the literal "You" label.
        user: /^You/.test(text),
      };
    });
    return {
      dots: dots.map((d) => ({
        label: d.getAttribute('aria-label'),
        title: d.getAttribute('title'),
        target: d.getAttribute('data-target'),
      })),
      rows,
    };
  });
  console.log('rows:', JSON.stringify(rail.rows, null, 1));

  const userPrompts = rail.rows.filter((r) => r.user).length;
  const targets = rail.dots.map((d) => Number(/(\d+)$/.exec(d.target || '')?.[1] ?? -1));
  check(rail.dots.length > 0, 'rail renders dots', `${rail.dots.length} dots`);
  check(
    rail.dots.length === PROMPTS.length,
    'rail lists exactly the prompts sent',
    `dots=${rail.dots.length} prompts sent=${PROMPTS.length}`,
  );
  check(
    userPrompts <= rail.dots.length,
    'rail never lists rows that are not prompts',
    `mounted prompt rows=${userPrompts} total rows=${rail.rows.length} dots=${rail.dots.length}`,
  );
  check(
    rail.dots.every((d) => /^Go to your prompt \d+ of \d+: /.test(d.label || '')),
    'dots are labelled as prompts',
    rail.dots[0]?.label || '(none)',
  );
  check(
    PROMPTS.every((p) => rail.dots.some((d) => (d.title || '').includes(p) && (d.label || '').includes(p))),
    'dot labels and tooltips quote the prompt text',
    (rail.dots[0]?.title || '(none)').slice(0, 60),
  );
  check(
    targets.every((t, i) => t > 0 && (i === 0 || t > targets[i - 1])) &&
      rail.dots.every((d) => d.target === `chat-msg-${Number(/(\d+)$/.exec(d.target || '')?.[1])}`),
    'dots point at ascending transcript rows',
    targets.join(','),
  );

  // ---- jump: scroll to the bottom, click the FIRST prompt dot. The row may not
  // be mounted yet (long sessions render a tail window), so the click has to
  // widen the window and then land on the prompt.
  const targetId = rail.dots[0].target;
  const before = await page.evaluate((target) => {
    const row = document.querySelector('[id^="chat-msg-"]');
    let el = row?.parentElement;
    while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
    return {
      found: Boolean(el),
      scrollTop: el ? Math.round(el.scrollTop) : 0,
      mounted: Boolean(document.getElementById(target)),
    };
  }, targetId);
  await page.waitForTimeout(1200);

  await page.locator('[data-target="' + targetId + '"]').first().click();
  await page.waitForTimeout(1800);

  const jump = await page.evaluate((id) => {
    const node = document.getElementById(id);
    const scrollable = (() => {
      let el = node?.parentElement;
      while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
      return el;
    })();
    if (!node) return { resolved: false, target: null, viewport: Math.round(window.innerHeight / 2), scrollTop: -1 };
    const r = node.getBoundingClientRect();
    const scrollTop = scrollable ? Math.round(scrollable.scrollTop) : -1;
    return {
      resolved: true,
      target: {
        top: Math.round(r.top),
        center: Math.round(r.top + r.height / 2),
        visible: r.top >= 0 && r.bottom <= window.innerHeight,
        isPrompt: /^You/.test((node.textContent || '').replace(/\s+/g, ' ').trim()),
      },
      atTop: scrollTop <= 4,
      viewport: Math.round(window.innerHeight / 2),
      scrollTop,
    };
  }, targetId);

  check(before.found, 'chat scroller found', `scrollTop=${before.scrollTop}`);
  check(jump.resolved, 'the click resolves its prompt row (window widened when needed)', `${targetId} mounted before=${before.mounted}`);
  check(
    jump.resolved && jump.target.isPrompt,
    'the jumped-to row is a prompt of mine',
    jump.resolved ? (jump.target.isPrompt ? 'starts with the You label' : 'row is not a prompt') : 'no row',
  );
  check(
    jump.resolved && jump.target.visible && (Math.abs(jump.target.center - jump.viewport) < 320 || jump.atTop),
    'clicking a dot lands on that prompt',
    jump.resolved
      ? `center=${jump.target.center} viewportMid=${jump.viewport} visible=${jump.target.visible} atTop=${jump.atTop}`
      : 'no geometry',
  );
  check(
    jump.scrollTop !== before.scrollTop,
    'the click actually moves the transcript',
    `scrollTop ${before.scrollTop} -> ${jump.scrollTop}`,
  );

  // The active dot must follow the viewport: exactly one dot is highlighted.
  const active = await page.evaluate(() => {
    const dots = Array.from(document.querySelectorAll('[aria-label^="Go to your prompt"]'));
    const hot = dots.filter((d) => getComputedStyle(d).backgroundColor.includes('201, 100, 66'));
    return { total: dots.length, hot: hot.length };
  });
  check(active.hot === 1, 'exactly one dot is marked as the current prompt', `${active.hot}/${active.total} highlighted`);

  await page.screenshot({ path: '/tmp/req140-prompt-rail.png', fullPage: false });
  console.log('screenshot: /tmp/req140-prompt-rail.png');
  check(failed.length === 0, 'no failed requests', failed.slice(0, 3).join(' | '));

  await browser.close();
  const ok = results.every((r) => r.ok);
  console.log(`\nprobe-prompt-rail: ${results.filter((r) => r.ok).length} passed, ${results.filter((r) => !r.ok).length} failed`);
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('PROBE ERROR:', e.message);
  process.exit(1);
});
