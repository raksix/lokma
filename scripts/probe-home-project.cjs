#!/usr/bin/env node
/**
 * REQ-138 live probe — Home is a project.
 *
 * Sessions with no project record used to fall into a nameless `default`
 * bucket inside the date groups. Home is now a virtual project group pinned
 * above the real ones and expanded by default. This probe asserts:
 *   1. Home renders as a group header with its own session list,
 *   2. it is expanded on load (the default view),
 *   3. it sits above every other group, and
 *   4. its sessions do not reappear in the lists below (no duplicates).
 *
 * Usage:
 *   TOKEN=... NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-home-project.cjs [--url https://lokma.fermag.com.tr]
 *
 * Exit code 0 = Home behaves like a project; 1 = regression.
 */
const { chromium } = require('playwright-core');

const BASE = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'https://lokma.fermag.com.tr';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN = process.env.TOKEN;
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
  await sleep(6000);

  const snapshot = await page.evaluate(() => {
    // A group is a header button plus the block that holds its list. Group
    // headers carry a chevron plus a count badge as siblings — composer
    // toggles ("No bot", "Thinking") also expose aria-expanded but have none,
    // so the badge is what tells a real sidebar group apart.
    const isCount = (s) => /^\d+$/.test(s);
    const groups = [...document.querySelectorAll('button[aria-expanded]')]
      .map((b) => {
        const label = (b.innerText || '').trim().split('\n')[0].trim();
        const box = b.getBoundingClientRect();
        if (!label || box.top < 0 || box.top > 940) return null;
        const badge = b.parentElement ? [...b.parentElement.children].find((n) => isCount((n.innerText || '').trim())) : null;
        if (!badge) return null;
        // The list lives next to the header row, inside the group block.
        const block = b.parentElement && b.parentElement.parentElement;
        const rows = block
          ? (block.innerText || '')
              .split('\n')
              .map((s) => s.trim())
              .filter((s) => s && s !== label && !isCount(s))
          : [];
        return { label, expanded: b.getAttribute('aria-expanded') === 'true', top: Math.round(box.top), count: Number(badge.innerText.trim()), rows };
      })
      .filter(Boolean);

    const homeIndex = groups.findIndex((g) => g.label === 'Home');
    const home = homeIndex >= 0 ? groups[homeIndex] : null;
    const later = home ? groups.slice(homeIndex + 1) : [];
    const dupes = home ? home.rows.filter((r) => later.some((g) => g.rows.includes(r))) : [];
    const above = home ? groups.filter((g) => g.top < home.top).map((g) => g.label) : [];
    const homeSvg = homeIndex >= 0
      ? [...document.querySelectorAll('button[aria-expanded]')].some((b) => (b.innerText || '').trim().startsWith('Home') && b.querySelector('svg.lucide-house'))
      : false;

    return {
      groupLabels: groups.map((g) => `${g.label}${g.expanded ? '+' : '-'}${g.count ? `(${g.count})` : ''}`),
      homeIndex,
      homeExpanded: home ? home.expanded : false,
      homeCount: home ? home.count : 0,
      homeRows: home ? home.rows.length : 0,
      homeSample: home ? home.rows.slice(0, 3) : [],
      above,
      dupes,
      homeSvg,
    };
  });

  ok('Home renders as a group', snapshot.homeIndex >= 0, `groups: ${snapshot.groupLabels.join(', ') || 'none'}`);
  ok('Home is expanded on load', snapshot.homeExpanded === true);
  ok('Home has the house icon', snapshot.homeSvg === true);
  ok('Home holds the unfiled sessions', snapshot.homeCount > 0 && snapshot.homeRows > 0,
    `badge=${snapshot.homeCount}, rendered rows=${snapshot.homeRows}`);
  ok('Home sits above every other group', snapshot.above.length === 0,
    snapshot.above.length ? `above: ${snapshot.above.join(', ')}` : '');
  ok('no session renders twice', snapshot.dupes.length === 0, snapshot.dupes.slice(0, 3).join(' | '));

  console.log(`\nHome rows (first 3): ${snapshot.homeSample.join(' | ') || '—'}`);
  await browser.close();

  if (failures.length) {
    console.log(`\nREQ-138 probe: ${failures.length} regression(s): ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nREQ-138 probe: Home behaves like a project — all checks passed.');
})();
