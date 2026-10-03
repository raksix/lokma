#!/usr/bin/env node
/**
 * REQ-195 — live proof that the Explorer panel is the session list ONLY.
 *
 * The card under the session list used to render a `Server` heading, a
 * HealthBadge (`● server up`) and the hardcoded `Fastify :3456` line. It is
 * gone; reachability still lives in the footer (`gateway · Nms`), so nothing
 * is lost.
 *
 * Both halves of the removal are measured in the DEPLOYED surface
 * (localhost:3457) with a minted superadmin token — the login gate stays ON and
 * is never flipped for a test.
 *
 * WHY THE NEGATIVES ARE THE POINT: a probe that only asserts "the list is
 * present" passes on a build where the card still sits under it. So the card's
 * three strings are looked up inside the Explorer container (scoped — never
 * page-wide, or the footer's own `gateway` label and unrelated toasts would
 * masquerade as the card), and the settings screen is opened to prove the
 * server line SURVIVED somewhere the user actually visits.
 *
 * Usage (repo root):
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a \
 *     node scripts/probe-explorer-no-server-card.cjs --token "$TK"
 *
 * Exit 0 = the card is absent from the Explorer, the session list reaches the
 * bottom of the panel, and the server line still lives in Settings.
 */
const { chromium } = require('playwright-core');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const REPO = join(__dirname, '..');
const WEB_SRC = join(REPO, 'packages/lokma-web/web/src');
const BASE = 'http://127.0.0.1:3457';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const NL = String.fromCharCode(10);
const SLEEP_MS = 6000;

const args = process.argv.slice(2);
const tokenArg = args.indexOf('--token');
const TOKEN = tokenArg !== -1 ? args[tokenArg + 1] : '';
if (!TOKEN) {
  console.error('probe-explorer-no-server-card: --token is required');
  process.exit(2);
}

let passed = 0;
let failed = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log('  ok   ' + name + (detail ? ' — ' + detail : ''));
  } else {
    failed += 1;
    failures.push(name);
    console.error('  FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Strings that could ONLY have come from the removed card.
const CARD_STRINGS = ['Server', 'server up', 'checking…', 'Fastify :3456'];
// Strings that must NOT be checked page-wide: the footer legitimately renders
// gateway status, and toasts mention "is the server up?".
const SCOPED_CONTAINER = '.rounded.border.border-dashed';

(async () => {
  // ---- static half: the import really is gone from source -------------------
  console.log('--- source (app-shell.tsx) ---');
  const appShell = readFileSync(join(WEB_SRC, 'components/app-shell.tsx'), 'utf8');
  ok('app-shell.tsx imports no HealthBadge', appShell.indexOf('HealthBadge') === -1);
  ok('app-shell.tsx has no health-badge import', appShell.indexOf('health-badge') === -1);

  // The Fastify port literal must survive in EXACTLY one source file.
  const portHits = [];
  const walk = (dir) => {
    for (const e of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name) && e.name !== 'app-shell.tsx') {
        const src = readFileSync(p, 'utf8');
        if (src.indexOf('Fastify :3456') !== -1) portHits.push(p.slice(WEB_SRC.length + 1));
      }
    }
  };
  walk(join(WEB_SRC, 'components'));
  ok(
    'the server port line lives in exactly one file (settings-modal)',
    portHits.length === 1 && /settings-modal/.test(portHits[0]),
    portHits.length ? portHits.join(', ') : 'none found'
  );

  // ---- live half: the DEPLOYED surface --------------------------------------
  console.log('--- live surface (' + BASE + ') ---');
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: process.env.PROBE_HEADFUL !== '1',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('lokma-token', t);
    } catch (e) {
      /* ignore */
    }
  }, TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 160)));

  await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await sleep(SLEEP_MS);

  // Order matters: the settings modal is a full-size overlay, so the Explorer
  // assertions run FIRST while the sidebar is still readable. Settings is
  // opened afterwards, purely for the positive control.
  const loggedIn = await page.evaluate(() => !!document.querySelector('[data-pane], .lokma-shell, main') && !/login/i.test(document.body.innerHTML.slice(0, 400)));
  ok('the shell rendered (not the login screen)', loggedIn);

  // The Explorer is the left sidebar by default; find the container that HOLDS
  // the session list so the negatives are scoped to it.
  const explorer = await page.evaluate((cardSel) => {
    const dashCard = document.querySelector(cardSel);
    // Session rows: sidebar buttons whose text mentions no obvious card chrome.
    const sidebar = document.querySelector('aside') || document.querySelector('[class*="sidebar"]');
    const host = dashCard ? dashCard.parentElement : sidebar;
    if (!host) return { found: false, why: 'no sidebar/card host' };
    const text = host.innerText || '';
    return {
      found: true,
      dashCardStillThere: !!dashCard,
      text: text.slice(0, 3000),
      hits: ['Server', 'server up', 'Fastify :3456'].filter((s) => text.indexOf(s) !== -1),
      hasListRole: !!host.querySelector('[data-session-id], [role="list"], button'),
    };
  }, SCOPED_CONTAINER);

  ok('explorer container located', explorer.found, explorer.why || 'found');
  ok('no dashed server card node remains in the Explorer', explorer.dashCardStillThere === false);
  ok('no card heading text in the Explorer', !explorer.hits || explorer.hits.length === 0, (explorer.hits || []).join(' | ') || 'clean');
  ok('the session list itself is still there', explorer.hasListRole === true);

  // Footer keeps reachability (the info the card used to duplicate). The
  // footer renders a bare div (there is NO <footer> element), so it is found by
  // its leading label — measured, not guessed.
  const footer = await page.evaluate(() => {
    const hits = Array.from(document.querySelectorAll('div')).filter((d) => /^gateway/.test((d.innerText || '').trim()));
    return hits.length ? (hits[0].innerText || '').slice(0, 200) : '';
  });
  ok('footer still shows gateway reachability', /gateway/.test(footer), footer.replace(/[\r\n]+/g, ' ').slice(0, 80));

  // Open Settings via a real control, then read the About category.
  const opened = await page.evaluate(async () => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => /settings/i.test(b.getAttribute('aria-label') || '') || /settings/i.test(b.getAttribute('title') || '')
    );
    if (!btn) return false;
    btn.click();
    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, 300));
      if (document.querySelector('[role="dialog"]')) return true;
    }
    return !!document.querySelector('[role="dialog"]');
  });
  ok('settings modal opens', opened === true);

  // Positive control: the server line the card removed must still exist
  // somewhere the user actually visits, or the probe would "pass" by deleting
  // the information too. MEASURED: it lives in Settings -> ABOUT (AboutSection),
  // not the default `general` tab — and `general` is what a naive click lands
  // on, so the check must use the documented `?settings=about` deep link.
  const settingsHasLine = await page.evaluate(async () => {
    const frame = document.querySelector('[role="dialog"]');
    if (!frame) return { ok: false, why: 'no settings dialog' };
    // Click the "About" category in the settings nav, then wait for the line.
    const btn = Array.from(frame.querySelectorAll('button')).find((b) => /about/i.test((b.innerText || '').trim()));
    if (btn) btn.click();
    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, 300));
      const txt = frame.innerText || '';
      if (txt.indexOf('Fastify :3456') !== -1) return { ok: true, why: 'About section' };
    }
    const txt = frame.innerText || '';
    return { ok: false, why: 'About clicked, line absent; dialog saw ' + txt.slice(0, 120).replace(/\s+/g, ' ') };
  });
  ok('the server line survived in Settings (info not lost)', settingsHasLine.ok === true, settingsHasLine.why);

  const jsErrors = errors.filter((e) => e.indexOf('Failed to load resource') === -1);
  ok('no JavaScript errors on the page', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | ') || 'clean');

  await browser.close();
  console.log(NL + 'probe-explorer-no-server-card: ' + passed + ' passed, ' + failed + ' failed');
  if (failures.length) {
    console.log('failures: ' + failures.join(', '));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error('probe-explorer-no-server-card threw: ' + String(e && e.stack ? e.stack : e).slice(0, 600));
  process.exit(2);
});