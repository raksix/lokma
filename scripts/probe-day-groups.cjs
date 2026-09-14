#!/usr/bin/env node
/**
 * REQ-142 — the sidebar's normal view is a pure date list.
 *
 *   normal ("by day"):  EVERY session, grouped Today / Yesterday / Last week /
 *                       Last month / Older — no Projects section, no Home.
 *   project ("by project"): unchanged — Projects section with Home pinned first.
 *
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node scripts/probe-day-groups.cjs --url https://lokma.fermag.com.tr --token "$TK"
 */
const { chromium } = require('playwright-core');

const readFlag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = readFlag('url', 'https://lokma.fermag.com.tr');
const TOKEN = readFlag('token', '');
if (!TOKEN) {
  console.error('missing --token (mint one with scripts/mint-e2e-token.mjs)');
  process.exit(2);
}

const BUCKETS = ['Today', 'Yesterday', 'Last week', 'Last month', 'Older'];
let passed = 0;
let failed = 0;
function check(ok, label, detail = '') {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Sidebar shape: section headers (uppercase, with a count badge on the right)
 * plus the mode switch. The list scroll body is the first scrollable div in the
 * sidebar, so headers are read from there to keep composer labels out.
 */
function sidebarShape(page) {
  return page.evaluate((buckets) => {
    const btn = document.querySelector('button[aria-label^="Group by"]');
    // The toggle names the mode you would switch *to*, so invert it to describe
    // the view that is on screen right now.
    const mode = btn ? (btn.getAttribute('aria-label') === 'Group by project' ? 'day' : 'project') : null;

    // Section headers are the small uppercase label rows (bucket names and the
    // "Projects" heading). They carry the count as a sibling badge.
    const rows = [...document.querySelectorAll('div[class*="uppercase"]')].map((el) => ({
      el,
      own: [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(' ')
        .trim(),
    }));
    const headers = rows.map((r) => r.own).filter((t) => buckets.includes(t) || t === 'Projects');
    const counts = {};
    for (const r of rows) {
      if (!buckets.includes(r.own)) continue;
      const m = (r.el.innerText || '').match(/\d+/);
      if (m) counts[r.own] = Number(m[0]);
    }
    const counter = (document.body.innerText.match(/·\s*(\d+)\s*sessions?/) || [])[1] || null;
    const modeRow = [...document.querySelectorAll('span[title*="Yesterday"]')].map((s) =>
      (s.textContent || '').trim(),
    )[0];

    return {
      mode,
      headers,
      bucketsFound: headers.filter((h) => buckets.includes(h)),
      counts,
      hasProjects: headers.includes('Projects'),
      homeGroup: [...document.querySelectorAll('button[aria-expanded]')].some((b) =>
        /^Home\b/.test((b.textContent || '').trim()),
      ),
      counter: counter === null ? null : Number(counter),
      statusText: modeRow || null,
    };
  }, BUCKETS);
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('lokma-token', t);
    } catch {
      /* ignore */
    }
  }, TOKEN);
  const page = await ctx.newPage();
  const failedReq = [];
  const benign = (url, status) =>
    /favicon\.ico/.test(url) || (status === 404 && /\/api\/sessions\/sess_[\w-]+$/.test(url));
  page.on('response', (r) => {
    if (r.status() >= 400 && !benign(r.url(), r.status())) failedReq.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(`${BASE}/?token=${encodeURIComponent(TOKEN)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);

  // ---------------------------------------------------------------- day view
  const day = await sidebarShape(page);
  check(day.mode === 'day', 'a fresh sidebar opens in the normal (by day) view', `mode=${day.mode}`);
  check(day.statusText === 'By day', 'the mode row says "By day"', `label=${day.statusText}`);
  check(day.bucketsFound.length > 0, 'day buckets are rendered', day.bucketsFound.join(', '));
  check(
    day.bucketsFound.every((b) => BUCKETS.includes(b)),
    'every rendered bucket is one of the five',
    day.bucketsFound.join(', '),
  );
  check(
    day.bucketsFound.length === 0 ||
      JSON.stringify(day.bucketsFound) ===
        JSON.stringify(BUCKETS.filter((b) => day.bucketsFound.includes(b))),
    'buckets keep the Today → Older order',
    day.bucketsFound.join(' > '),
  );
  check(!day.hasProjects, 'the normal view has no Projects section');
  check(!day.homeGroup, 'the normal view has no Home group');
  check(day.counter !== null && day.counter > 0, 'the counter reports the whole session list', `n=${day.counter}`);

  // Every session lands in a bucket: bucket counts must add up to the counter.
  const sums = Object.values(day.counts).reduce((a, b) => a + b, 0);
  check(sums === day.counter, 'the bucket counts add up to the session counter', `${sums} vs ${day.counter}`);

  // ------------------------------------------------------------ project view
  await page.click('button[aria-label="Group by project"]');
  await page.waitForTimeout(1200);
  const project = await sidebarShape(page);
  check(project.mode === 'project', 'the toggle switches to the project view', `mode=${project.mode}`);
  check(project.hasProjects, 'the project view renders the Projects section');
  check(project.homeGroup, 'the project view renders Home again (unchanged behaviour)');

  // ------------------------------------------------- back to day, and F5 keeps it
  await page.click('button[aria-label="Group by day"]');
  await page.waitForTimeout(1000);
  const back = await sidebarShape(page);
  check(back.mode === 'day' && !back.hasProjects, 'switching back returns to the pure day list');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const afterReload = await sidebarShape(page);
  check(afterReload.mode === 'day', 'the day view survives a reload (REQ-142 mode persistence)');

  const shot = '/tmp/req142-day-groups.png';
  await page.screenshot({ path: shot, fullPage: false });
  console.log(`screenshot: ${shot}`);
  check(failedReq.length === 0, 'no failed requests', failedReq.slice(0, 3).join(' | '));
  console.log(`\nprobe-day-groups: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
