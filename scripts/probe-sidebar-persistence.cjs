#!/usr/bin/env node
/**
 * REQ-141 — live sidebar persistence probe: fold Home, reload, and the fold
 * must still be there. Also proves the sidebar search (which folds everything
 * while it runs) does not overwrite the stored layout.
 *
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node scripts/probe-sidebar-persistence.cjs --url https://lokma.fermag.com.tr --token "$TK"
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

const KEY = 'lokma-sidebar-groups';
let passed = 0;
let failed = 0;
function check(ok, label, detail = '') {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}`);
}

/** The Home group header (label + count) carries aria-expanded. */
function homeState(page) {
  return page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button[aria-expanded]')).find((b) =>
      /^Home\b/.test((b.textContent || '').trim()),
    );
    const store = (() => {
      try {
        return window.localStorage.getItem('lokma-sidebar-groups');
      } catch {
        return 'unavailable';
      }
    })();
    return {
      found: Boolean(btn),
      label: btn ? (btn.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) : '',
      expanded: btn ? btn.getAttribute('aria-expanded') === 'true' : null,
      stored: store,
      // Collapsed groups render only the first few rows; expanded ones show all.
      rows: document.querySelectorAll('[data-session-row], .session-row').length,
    };
  });
}

function clickHome(page) {
  return page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button[aria-expanded]')).find((b) =>
      /^Home\b/.test((b.textContent || '').trim()),
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Each run gets a brand-new context, so storage already starts empty. Do NOT
  // clear here: addInitScript also runs on reload, and wiping it on F5 would
  // delete the very layout this probe is meant to verify.
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('lokma-token', t);
    } catch {
      /* ignore */
    }
  }, TOKEN);
  const page = await ctx.newPage();
  const failedReq = [];
  // A 404 on a bare /api/sessions/<id> is the app probing a session that was
  // never created / already gone — not a rail regression.
  const benign = (url, status) => /favicon\.ico/.test(url) || (status === 404 && /\/api\/sessions\/sess_[\w-]+$/.test(url));
  page.on('response', (r) => {
    if (r.status() >= 400 && !benign(r.url(), r.status())) failedReq.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(`${BASE}/?token=${encodeURIComponent(TOKEN)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);

  const initial = await homeState(page);
  check(initial.found, 'the Home group is rendered', initial.label);
  check(initial.expanded === true, 'a fresh browser starts with Home open (default layout)');
  check(
    initial.stored === null || initial.stored === '["home"]',
    'nothing folded is stored as the default',
    `stored=${initial.stored}`,
  );

  // ---- fold Home, then reload: this is the user's actual complaint
  check(await clickHome(page), 'Home can be folded');
  await page.waitForTimeout(800);
  const folded = await homeState(page);
  check(folded.expanded === false, 'Home is folded after the click');
  check(folded.stored === '[]', 'the fold is written to storage', `stored=${folded.stored}`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const afterReload = await homeState(page);
  check(afterReload.expanded === false, 'F5 keeps Home folded', `aria-expanded=${afterReload.expanded}`);
  check(afterReload.stored === '[]', 'the stored layout survived the reload', `stored=${afterReload.stored}`);

  // ---- search folds everything while it runs; clearing must restore the fold
  const search = page.locator('input[type="search"], input[placeholder*="Search" i]').first();
  if ((await search.count()) > 0) {
    await search.fill('zzz-no-such-session');
    await page.waitForTimeout(900);
    const during = await homeState(page);
    check(during.stored === '[]', 'a search does not overwrite the stored layout', `stored=${during.stored}`);
    await search.fill('');
    await page.waitForTimeout(900);
    const cleared = await homeState(page);
    check(cleared.expanded === false, 'clearing the search brings the folded layout back');
  } else {
    check(false, 'the sidebar search input was found');
  }

  // ---- and unfolding is remembered too
  await clickHome(page);
  await page.waitForTimeout(800);
  const reopened = await homeState(page);
  check(reopened.expanded === true, 'Home can be unfolded again');
  check(
    reopened.stored === '["home"]',
    'unfolding is written to storage',
    `stored=${reopened.stored}`,
  );

  const shot = '/tmp/req141-sidebar-fold.png';
  await page.screenshot({ path: shot });
  console.log(`screenshot: ${shot}`);
  check(failedReq.length === 0, 'no failed requests', failedReq.slice(0, 3).join(' | '));
  console.log(`\nprobe-sidebar-persistence: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
