#!/usr/bin/env node
/**
 * REQ-148 live probe — a pane must auto-load a session's history when the
 * session changes, even when the 4 s list snapshot does not know that id.
 *
 * Story: the pane reuses the store's list cache for its "does this session
 * exist" shortcut. loadTranscript used to read "id not in the snapshot" as
 * "empty session" and cached [] with ZERO requests, so switching a pane to
 * such a session left the body blank forever — no error, no request, nothing
 * to debug from the console (the reported "history does not auto-load").
 *
 * Deterministic repro: the probe intercepts the LIST endpoint and strips one
 * REAL session (with real history) out of every snapshot the client sees,
 * seeds a pane tab for it, then switches that tab and measures:
 *   - how many GET /api/sessions/<id> the switch fires,
 *   - whether the pane renders that session's messages.
 *
 * Modes (--expect):
 *   after  (default) asserts the FIX: >=1 verification GET (200) + history
 *          renders + content matches the session's last user message.
 *   before asserts the BUG (run against the pre-fix bundle): 0 requests and
 *          a blank pane, while the in-list control session still loads.
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-pane-history.cjs --url https://lokma.fermag.com.tr \
 *       --token "$TK" [--expect before|after] [--offlist <sessionId>] \
 *       [--html-entry assets/index-<oldhash>.js]
 *
 * --html-entry rewrites the served index.html (client side only) so the page
 * boots the given entry bundle. Point it at a superseded pre-fix build still
 * on disk (emptyOutDir: false keeps them) to capture a real "before" against
 * the same live server, then rerun without it for the "after".
 *
 * Exit 0 = the behavior that the selected mode asserts was observed.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const BASE = arg('--url', 'https://lokma.fermag.com.tr');
const TOKEN = arg('--token', '') || process.env.TOKEN || '';
const EXPECT = arg('--expect', 'after');
const OFFLIST_ARG = arg('--offlist', '');
const HTML_ENTRY = arg('--html-entry', '');
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('TOKEN is required (HOME=/root bun scripts/mint-e2e-token.mjs)');
  process.exit(1);
}
if (EXPECT !== 'after' && EXPECT !== 'before') {
  console.error('--expect must be "after" or "before"');
  process.exit(1);
}

const failures = [];
const ok = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures.push(name);
};

/** Pick a REAL session with history for the off-list role (or honor --offlist). */
function pickOfflistSession() {
  if (OFFLIST_ARG) return OFFLIST_ARG;
  const root = path.join(process.env.HOME || '/root', '.lokma', 'projects');
  let best = null;
  let projects = [];
  try {
    projects = fs.readdirSync(root);
  } catch {
    return '';
  }
  for (const project of projects) {
    const dir = path.join(root, project, 'sessions');
    let files = [];
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      let lines = 0;
      try {
        lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).length;
      } catch {
        continue;
      }
      if (lines >= 4 && (!best || lines > best.lines)) best = { id: f.replace(/\.jsonl$/, ''), lines };
    }
  }
  return best ? best.id : '';
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

(async () => {
  const offlist = pickOfflistSession();
  if (!offlist) {
    console.error('no off-list session candidate found (pass --offlist <sessionId>)');
    process.exit(1);
  }
  console.log(`MODE --expect ${EXPECT} (${EXPECT === 'after' ? 'the fix must load the history' : 'the bug must leave the pane blank'})`);
  console.log(`off-list session: ${offlist}`);

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

  // ── network instrumentation ────────────────────────────────────────────────
  const sessionGets = []; // { id, status }
  const pageErrors = [];
  page.on('response', (r) => {
    const m = r.url().match(/\/api\/sessions\/([^/?#]+)(?:[?#]|$)/);
    if (m) sessionGets.push({ id: decodeURIComponent(m[1]), status: r.status() });
  });
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e).slice(0, 160)));

  // Optional: boot a specific (older) entry bundle by rewriting the served
  // index.html client side — same live server, same data, only the JS entry
  // differs. Registered BEFORE the list route (Playwright matches handlers in
  // reverse registration order, so the list regex still wins for /api calls).
  if (HTML_ENTRY) {
    if (!/^assets\/index-[\w-]+\.js$/.test(HTML_ENTRY)) {
      console.error('--html-entry must look like assets/index-<hash>.js');
      process.exit(1);
    }
    await page.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const resp = await route.fetch();
      const body = (await resp.text()).replace(/assets\/index-[\w-]+\.js/g, HTML_ENTRY);
      return route.fulfill({
        response: resp,
        body,
        headers: { ...resp.headers(), 'content-type': 'text/html; charset=utf-8' },
      });
    });
    console.log(`html entry forced to ${HTML_ENTRY} (client-side rewrite; pre-fix simulation)`);
  }

  // The list endpoint must NEVER know the off-list session: strip it from
  // every snapshot the client sees (bare list and ?cwd= calls alike).
  let listStrips = 0;
  await page.route(/\/api\/sessions(?:[?#].*)?$/, async (route) => {
    const resp = await route.fetch();
    let body = null;
    try {
      body = await resp.json();
    } catch {
      return route.fulfill({ response: resp });
    }
    if (!body || !Array.isArray(body.sessions)) return route.fulfill({ response: resp });
    const kept = body.sessions.filter((s) => s && s.id !== offlist);
    if (kept.length !== body.sessions.length) listStrips += 1;
    return route.fulfill({ response: resp, json: { ...body, sessions: kept, count: kept.length } });
  });

  // ── page helpers ───────────────────────────────────────────────────────────
  const readActive = () =>
    page.evaluate(() => {
      let states = {};
      try {
        states = JSON.parse(localStorage.getItem('lokma:tiling-tabs:v1') || '{}');
      } catch {
        states = {};
      }
      for (const [paneId, st] of Object.entries(states)) {
        const tabs = Array.isArray(st.tabs) ? st.tabs : [];
        const active = tabs.find((t) => t.id === st.active);
        if (!active) continue;
        const paneEl = document.querySelector(`[data-pane="${CSS.escape(paneId)}"]`);
        return {
          paneId,
          tabId: active.id,
          sessionId: active.sessionId || '',
          rows: paneEl ? paneEl.querySelectorAll('[id^="chat-msg-"]').length : 0,
          text: paneEl ? (paneEl.innerText || '').slice(0, 12000) : '',
          tabs: tabs.map((t) => ({ id: t.id, sessionId: t.sessionId || '' })),
        };
      }
      return null;
    });

  await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await sleep(6000);

  // ── 1) tiling on ───────────────────────────────────────────────────────────
  const toggled = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      (x.innerText || '').includes('Tiling workspace'),
    );
    if (b) {
      b.click();
      return true;
    }
    return false;
  });
  await sleep(2500);
  const paneCount = await page.evaluate(() => document.querySelectorAll('[data-pane]').length);
  ok('the tiling workspace is up', paneCount >= 1, `toggle ${toggled ? 'clicked' : 'absent'}, panes=${paneCount}`);
  if (paneCount === 0) {
    await browser.close();
    console.log('\nprobe-pane-history: could not enter tiling — aborting.');
    process.exit(1);
  }

  // ── 2) open an in-list session (A) with real history = the control ─────────
  // Scope to the sidebar rows: pane tabs are draggable divs too once tiling
  // is on, and only session rows carry the "Drag into a tiling pane" title.
  const ROW_SEL = 'div[draggable="true"][title^="Drag into a tiling pane"]';
  const rows = await page.evaluate((sel) => document.querySelectorAll(sel).length, ROW_SEL);
  let control = null;
  for (let i = 0; i < Math.min(rows, 8); i += 1) {
    const clicked = await page.evaluate(({ sel, idx }) => {
      const list = [...document.querySelectorAll(sel)];
      const row = list[idx];
      if (!row) return false;
      const hit = row.querySelector('.cursor-pointer') || row.querySelector('[title]') || row;
      hit.click();
      return true;
    }, { sel: ROW_SEL, idx: i });
    if (!clicked) break;
    await sleep(2800);
    const snap = await readActive();
    if (snap && snap.sessionId && snap.sessionId !== offlist && snap.rows >= 1) {
      control = snap;
      break;
    }
  }
  ok(
    'control: an in-list session opens with its history',
    Boolean(control),
    control ? `session ${control.sessionId}, rows=${control.rows}` : `no rich row among ${rows} candidates`,
  );
  if (!control) {
    await browser.close();
    console.log('\nprobe-pane-history: no control session — aborting.');
    process.exit(1);
  }
  const A = control.sessionId;
  const aTabId = control.tabId;
  const aGetsBefore = sessionGets.filter((r) => r.id === A).length;

  // ── 3) seed the off-list tab into the SAME pane (kept inactive) ────────────
  // Init script: runs before the app boots on the next navigation, so the
  // restored tab state carries the seeded tab AND keeps A as the active tab.
  await ctx.addInitScript((offId) => {
    try {
      const KEY = 'lokma:tiling-tabs:v1';
      const states = JSON.parse(localStorage.getItem(KEY) || '{}');
      let touched = false;
      for (const st of Object.values(states)) {
        const tabs = Array.isArray(st && st.tabs) ? st.tabs : null;
        if (!tabs) continue;
        if (tabs.some((t) => t && t.sessionId === offId)) continue;
        tabs.push({ id: 'tab-probe-req148', title: 'REQ-148 probe', kind: 'session', sessionId: offId });
        touched = true;
      }
      if (touched) localStorage.setItem(KEY, JSON.stringify(states));
    } catch {
      /* the probe reports the missing tab below */
    }
  }, offlist);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(7000);

  const restored = await readActive();
  const seededTab = restored ? restored.tabs.find((t) => t.id === 'tab-probe-req148') : null;
  ok('the off-list tab survives the reload (list still strips it)', Boolean(seededTab), `list strips: ${listStrips}`);
  ok('the control session is the restored active tab', Boolean(restored && restored.sessionId === A), restored ? `active=${restored.sessionId}, rows=${restored.rows}` : 'no active tab');
  const controlRowsAfterReload = restored ? restored.rows : 0;

  // ── 4) THE SWITCH — click the off-list tab ─────────────────────────────────
  const sId = offlist;
  const sGetsBefore = sessionGets.filter((r) => r.id === sId).length;
  await page.evaluate(() => {
    const el = document.querySelector('[data-pane-tab="tab-probe-req148"]');
    if (el) el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    if (el) el.click();
  });
  await sleep(5500);
  const after = await readActive();
  const sGets = sessionGets.filter((r) => r.id === sId);
  const switched = Boolean(after && after.sessionId === sId);
  ok('the pane switched to the off-list session', switched, after ? `active=${after.sessionId}` : 'no active tab');

  // Content ground truth straight from the server (same fetch the app makes).
  const detail = await page.evaluate(async (id) => {
    try {
      const t = localStorage.getItem('lokma-token') || '';
      const r = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
      if (!r.ok) return { ok: false, status: r.status, count: 0, lastUser: '' };
      const d = await r.json();
      const msgs = Array.isArray(d.messages) ? d.messages : [];
      const lastUser = [...msgs].reverse().find((m) => m && m.role === 'user');
      return { ok: true, status: r.status, count: d.count != null ? d.count : msgs.length, lastUser: lastUser ? String(lastUser.content || '') : '' };
    } catch (e) {
      return { ok: false, status: 0, count: 0, lastUser: '', error: String(e).slice(0, 120) };
    }
  }, sId);
  const expectedChunk = norm(detail.lastUser).slice(0, 60);
  const contentHit = Boolean(expectedChunk) && norm(after ? after.text : '').includes(expectedChunk);

  if (EXPECT === 'before') {
    ok('BUG: the switch fires zero verification GETs', sGets.length === 0, `${sGets.length} request(s)`);
    ok('BUG: the pane stays blank', Boolean(after) && after.rows === 0, after ? `rows=${after.rows}` : 'no tab');
    ok('control stays green (the harness itself works)', controlRowsAfterReload >= 1, `rows=${controlRowsAfterReload}`);
  } else {
    ok('the switch fires a verification GET for the off-list session', sGets.length >= 1, `${sGets.length} request(s): status ${sGets.map((x) => x.status).join(', ')}`);
    ok('the verification GET succeeded', sGets.some((x) => x.status === 200), `statuses ${sGets.map((x) => x.status).join(', ')}`);
    ok('the pane renders the history', Boolean(after) && after.rows >= 1, after ? `rows=${after.rows} (server count ${detail.count})` : 'no tab');
    ok('the rendered text matches the session content', contentHit, `expected "${expectedChunk}"`);

    // Cycling tabs must keep both histories on screen. The raw GET count is
    // logged, never asserted: every chat mount also fetches session meta and
    // run state, and the post-done path refetches by design — URL counting
    // cannot isolate loadTranscript's cache hit (stores.test.ts proves that
    // contract: 'fresh transcript skips refetch').
    await page.evaluate((tabId) => {
      const el = document.querySelector(`[data-pane-tab="${CSS.escape(tabId)}"]`);
      if (el) el.click();
    }, aTabId);
    await sleep(2200);
    const backA = await readActive();
    await page.evaluate(() => {
      const el = document.querySelector('[data-pane-tab="tab-probe-req148"]');
      if (el) el.click();
    });
    await sleep(3500);
    const backS = await readActive();
    const aGetsAfter = sessionGets.filter((r) => r.id === A).length;
    const cycleNote = `A rows=${backA ? backA.rows : 'n/a'} → S rows=${backS ? backS.rows : 'n/a'} (A detail GETs while cycling: ${aGetsAfter - aGetsBefore})`;
    ok(
      'cycling tabs keeps both histories rendered',
      Boolean(backA && backA.rows >= 1) && Boolean(backS && backS.rows >= 1),
      cycleNote,
    );
    ok(
      'the revisited off-list history still matches',
      norm(backS ? backS.text : '').includes(expectedChunk),
      `expected "${expectedChunk}"`,
    );
  }

  ok('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

  const shot = `/tmp/req148-pane-history-${EXPECT}.png`;
  await page.screenshot({ path: shot });
  console.log(`\nnetwork: GET /api/sessions/${sId} = ${sGets.length}, list snapshots stripped = ${listStrips}, control session = ${A}`);
  console.log(`screenshot: ${shot}`);

  await browser.close();
  if (failures.length) {
    console.log(`\nprobe-pane-history (${EXPECT}): ${failures.length} expected observation(s) missing: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log(`\nprobe-pane-history (${EXPECT}): all checks passed.`);
})();
