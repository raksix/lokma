#!/usr/bin/env node
/**
 * REQ-144 live probe — panes must not reload themselves while you read them.
 *
 * The sessions sidebar polls the session list every 4 s. Every poll hands out
 * fresh summary objects, and `useKnownSession` returns whatever object is in
 * the store — so any pane effect keyed on that object re-runs on every tick.
 * The Files explorer was the visible one: it reset cwd/nodes/expanded/selection
 * and refetched the root, i.e. it "pressed F5" every four seconds.
 *
 * This probe opens the Files pane on a real workspace session, expands a folder,
 * opens a file, then watches for >3 poll ticks (12.5 s by default) and asserts:
 *   1. the tree renders at all (sanity),
 *   2. a folder can be expanded and a file preview opened,
 *   3. ZERO further `GET /api/files?` list calls happen while idle,
 *   4. the expanded folder is still expanded, and
 *   5. the file preview is still open — nothing reset behind the user's back.
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-pane-stability.cjs --url https://lokma.fermag.com.tr --token "$TK"
 *
 * Exit code 0 = panes are stable; 1 = a pane is reloading itself.
 */
const { chromium } = require('playwright-core');

const BASE = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'https://lokma.fermag.com.tr';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN =
  (process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : '') ||
  process.env.TOKEN;
// 12.5 s covers three 4 s sidebar polls; a 4th tick lands while we re-snapshot.
const SETTLE_MS = Number(process.env.PROBE_SETTLE_MS || 12500);
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

// Smallest ancestor of the Files search box that also holds file rows — the
// pane root, so Vault/Design trees elsewhere in the shell cannot pollute counts.
const SNAPSHOT = () => {
  const search = [...document.querySelectorAll('input')].find((i) =>
    (i.getAttribute('placeholder') || '').toLowerCase().includes('fuzzy search'),
  );
  if (!search) return { pane: false, rows: 0, dirs: [], previewOpen: false, reloadButton: false };
  let root = search;
  while (root.parentElement && !root.querySelector('div[role="button"][title]')) root = root.parentElement;
  const dirs = [...root.querySelectorAll('div[role="button"]')]
    .filter((el) => el.querySelector('svg.lucide-folder, svg.lucide-folder-open'))
    .map((el) => ({
      name: (el.innerText || '').trim().split('\n')[0],
      open: Boolean(el.querySelector('svg.lucide-chevron-down')),
    }));
  return {
    pane: true,
    rows: root.querySelectorAll('div[role="button"][title]').length,
    dirs,
    // A selected file row wears the terracotta wash; in tiling mode the open
    // also lands as a pane tab, so the inline "Close file" chip is optional.
    selectedRows: [...root.querySelectorAll('div[role="button"][title]')].filter((el) =>
      String(el.className).includes('text-terracotta'),
    ).length,
    previewOpen: Boolean(document.querySelector('button[aria-label="Close file"]')),
    reloadButton: Boolean(document.querySelector('button[aria-label="Reload workspace tree"]')),
  };
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

  const listCalls = [];
  const badResponses = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/files?')) listCalls.push(r.url());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => badResponses.push(`failed ${r.url()}`));

  await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await sleep(6000);

  // Open a session that owns a workspace: project view → first real project
  // group (a count badge tells a group header from a composer toggle) → its
  // first session row. Home holds the cwd-less ones, so it is skipped.
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Group by project"]');
    if (btn) btn.click();
  });
  await sleep(1500);
  const groupLabel = await page.evaluate(() => {
    const isCount = (s) => /^\d+$/.test(s);
    const groups = [...document.querySelectorAll('button[aria-expanded]')]
      .map((b) => {
        const label = (b.innerText || '').trim().split('\n')[0].trim();
        const badge = b.parentElement
          ? [...b.parentElement.children].find((n) => isCount((n.innerText || '').trim()))
          : null;
        return badge
          ? { label, el: b, expanded: b.getAttribute('aria-expanded') === 'true', count: Number(badge.innerText.trim()) }
          : null;
      })
      .filter(Boolean);
    window.__lokmaProbeGroups = groups;
    const g = groups.find((x) => x.label && x.label !== 'Home' && x.count > 0);
    if (!g) return '';
    if (!g.expanded) g.el.click();
    return `${g.label}(${g.count})`;
  });
  await sleep(1200);
  // Click candidate session rows (the clickable title lives inside the
  // draggable row) until the Files tree actually shows a workspace. Sessions
  // without a cwd render "Loading workspace…", so the probe self-checks.
  const candidates = await page.evaluate(() => {
    const groups = window.__lokmaProbeGroups || [];
    const g = groups.find((x) => x.label && x.label !== 'Home' && x.count > 0);
    const block = g && g.el.parentElement ? g.el.parentElement.parentElement : document.body;
    return [...block.querySelectorAll('div[draggable="true"]')]
      .map((el) => (el.innerText || '').trim().split('\n')[0].slice(0, 60))
      .filter(Boolean);
  });
  let opened = 'no-row';
  for (let i = 0; i < Math.min(candidates.length, 6); i += 1) {
    const clicked = await page.evaluate((idx) => {
      const groups = window.__lokmaProbeGroups || [];
      const g = groups.find((x) => x.label && x.label !== 'Home' && x.count > 0);
      const block = g && g.el.parentElement ? g.el.parentElement.parentElement : document.body;
      const rows = [...block.querySelectorAll('div[draggable="true"]')];
      const row = rows[idx];
      if (!row) return false;
      // The handler sits on the inner cursor-pointer title, not on the row.
      const hit = row.querySelector('.cursor-pointer') || row.querySelector('[title]') || row;
      hit.click();
      return true;
    }, i);
    if (!clicked) break;
    await sleep(2600);
    const probeSnap = await page.evaluate(SNAPSHOT);
    if (probeSnap.rows >= 3) {
      opened = `opened ${candidates[i]}`;
      break;
    }
    opened = `no workspace for ${candidates[i]}`;
  }
  await sleep(2000);

  // Make sure the Files inspector page is the one on screen.
  let snap = await page.evaluate(SNAPSHOT);
  if (!snap.pane) {
    await page.locator('button[aria-label="Files"]').first().click().catch(() => {});
    await sleep(3000);
    snap = await page.evaluate(SNAPSHOT);
  }
  ok('the Files pane shows the workspace tree', snap.pane && snap.rows >= 3,
    `${groupLabel ? `group ${groupLabel}; ` : ''}${opened}; rows=${snap.rows}, dirs=${snap.dirs.length}`);

  // Expand the first real folder (skip dot-dirs: they may be empty).
  await page.evaluate(() => {
    const search = [...document.querySelectorAll('input')].find((i) =>
      (i.getAttribute('placeholder') || '').toLowerCase().includes('fuzzy search'),
    );
    if (!search) return;
    let root = search;
    while (root.parentElement && !root.querySelector('div[role="button"][title]')) root = root.parentElement;
    const dir = [...root.querySelectorAll('div[role="button"]')].find(
      (el) => el.querySelector('svg.lucide-folder') && !el.querySelector('svg.lucide-chevron-down'),
    );
    if (dir) dir.click();
  });
  await sleep(2000);
  snap = await page.evaluate(SNAPSHOT);
  const openedDir = snap.dirs.find((d) => d.open) || null;
  ok('a folder expands in the tree', Boolean(openedDir), openedDir ? `open: ${openedDir.name}` : 'no folder opened');

  // Open the first file row (any file proves the preview path).
  await page.evaluate(() => {
    const search = [...document.querySelectorAll('input')].find((i) =>
      (i.getAttribute('placeholder') || '').toLowerCase().includes('fuzzy search'),
    );
    if (!search) return;
    let root = search;
    while (root.parentElement && !root.querySelector('div[role="button"][title]')) root = root.parentElement;
    const file = root.querySelector('div[role="button"][title]');
    if (file) file.click();
  });
  await sleep(3500);
  snap = await page.evaluate(SNAPSHOT);
  const fileOpened = snap.previewOpen || snap.selectedRows > 0;
  ok('a file opens its preview', fileOpened,
    `selected rows=${snap.selectedRows}, inline preview=${snap.previewOpen}`);

  // Idle window: enough sidebar polls that any effect keyed on the churned
  // session summary must fire again.
  const before = listCalls.length;
  await sleep(SETTLE_MS);
  const after = listCalls.length;
  const settled = await page.evaluate(SNAPSHOT);
  const settledDir = settled.dirs.find((d) => d.name === (openedDir ? openedDir.name : '')) || null;

  ok('the tree does not refetch while you read it', after - before === 0,
    `${after - before} extra GET /api/files? in ${(SETTLE_MS / 1000).toFixed(1)}s`);
  ok('the expanded folder stays open across the session poll',
    Boolean(settledDir && settledDir.open),
    settledDir ? `${settledDir.name} open=${settledDir.open} (dirs: ${settled.dirs.map((d) => `${d.name}${d.open ? '+' : '-'}`).join(', ')})` : 'folder gone');
  ok('the file preview survives the session poll',
    settled.previewOpen || settled.selectedRows > 0,
    `selected rows=${settled.selectedRows}, inline preview=${settled.previewOpen}`);

  console.log(`\nworkspace requests during idle window: ${after - before} (total ${after})`);
  console.log(`trees rows before/after: ${snap.rows} → ${settled.rows}`);
  const shot = '/tmp/req144-pane-stability.png';
  await page.screenshot({ path: shot });
  console.log(`screenshot: ${shot}`);

  const bad = badResponses.filter((x) => !x.includes('/api/sessions/sess_'));
  ok('no failed requests', bad.length === 0, bad.slice(0, 3).join(' | '));

  await browser.close();
  if (failures.length) {
    console.log(`\nprobe-pane-stability: ${failures.length} regression(s): ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nprobe-pane-stability: panes stay put — all checks passed.');
})();
