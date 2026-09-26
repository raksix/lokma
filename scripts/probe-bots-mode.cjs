#!/usr/bin/env node
/**
 * REQ-161 — live Bots-mode probe: the header surface switch, the bot list
 * (search + New Bot + rows with time/preview), the bot chat opening from a
 * row click, mode persistence across a reload, and the fact that the Bots
 * surface renders WITHOUT the harness chrome (no sidebar toggles).
 *
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node scripts/probe-bots-mode.cjs --url http://127.0.0.1:3457 --token "$TK"
 *
 * Non-goals (later ticks of REQ-161): rail-entry removal, gallery action
 * re-homing, and the composer picker removal are asserted by their own
 * checks as they land.
 */
const { chromium } = require('playwright-core');

const readFlag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = readFlag('url', 'http://127.0.0.1:3457');
const TOKEN = readFlag('token', '');
if (!TOKEN) {
  console.error('missing --token (mint one with scripts/mint-e2e-token.mjs)');
  process.exit(2);
}

let passed = 0;
let failed = 0;
function check(ok, label, detail = '') {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Snapshot of the pieces this probe asserts on. */
function surfaceState(page) {
  return page.evaluate(() => {
    const modeBtn = (mode) => document.querySelector(`[data-mode-switch="${mode}"]`);
    const chatBtn = modeBtn('chat');
    const botsBtn = modeBtn('bots');
    return {
      hasChatSwitch: Boolean(chatBtn),
      hasBotsSwitch: Boolean(botsBtn),
      chatActive: chatBtn ? chatBtn.getAttribute('aria-selected') === 'true' : null,
      botsActive: botsBtn ? botsBtn.getAttribute('aria-selected') === 'true' : null,
      botsMode: Boolean(document.querySelector('[data-bots-mode]')),
      chromeToggles: document.querySelectorAll('button[aria-label^="Toggle"]').length,
      newBot: Boolean(document.querySelector('[data-new-bot]')),
      search: Boolean(document.querySelector('[data-bot-search]')),
      rows: Array.from(document.querySelectorAll('[data-bot-row]')).map((row) => ({
        id: row.getAttribute('data-bot-row'),
        text: (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        preview: (row.querySelector('[data-bot-preview]') || {}).textContent || '',
      })),
      botTitle: (document.querySelector('[data-bot-title]') || {}).textContent || '',
      pending: Boolean(document.querySelector('[data-bot-chat-pending]')),
      composer: (() => {
        const ta = document.querySelector('textarea[aria-label="Message Lokma"]');
        return ta ? ta.getAttribute('placeholder') || '' : null;
      })(),
    };
  });
}

function clickMode(page, mode) {
  return page.evaluate((m) => {
    const btn = document.querySelector(`[data-mode-switch="${m}"]`);
    if (!btn) return false;
    btn.click();
    return true;
  }, mode);
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
  page.setDefaultTimeout(15000);

  try {
    // ── Boot: normal (chat) mode is the default and carries the chrome ──
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-mode-switch="bots"]', { timeout: 20000 });
    await wait(1200);
    let s = await surfaceState(page);
    check(s.hasChatSwitch && s.hasBotsSwitch, 'header shows the lokma | Bots switch', `chat=${s.chatActive} bots=${s.botsActive}`);
    check(s.chatActive === true && s.botsMode === false, 'boots into the normal chat mode');
    check(s.chromeToggles > 0, 'normal mode keeps the sidebar toggles', `toggles=${s.chromeToggles}`);

    // ── Switch to Bots ──
    check(await clickMode(page, 'bots'), 'clicked the Bots switch');
    await page.waitForSelector('[data-bots-mode]', { timeout: 10000 });
    await wait(1500);
    s = await surfaceState(page);
    check(s.botsActive === true, 'Bots chip reads as active');
    check(s.botsMode === true, 'Bots surface is mounted');
    check(s.chromeToggles === 0, 'Bots surface renders without harness chrome (no sidebar toggles)', `toggles=${s.chromeToggles}`);
    check(s.newBot, '+ New Bot button is present above the list');
    check(s.search, 'bot search input is present');
    check(s.rows.length >= 1, 'bot list rendered rows', `rows=${s.rows.length}`);
    const ceo = s.rows.find((r) => r.id === 'lokma-ceo');
    check(Boolean(ceo), 'bundled lokma-ceo row is listed', ceo ? ceo.text.slice(0, 60) : '');
    check(Boolean(ceo && /Lokma CEO/i.test(ceo.text)), 'row carries the bot name');

    // ── Row click opens the bot chat ──
    if (ceo) {
      await page.click(`[data-bot-row="${ceo.id}"]`);
      // A bot without a session mints one first (pending state), then Chat mounts.
      let composer = null;
      for (let i = 0; i < 40 && !composer; i += 1) {
        await wait(500);
        const st = await surfaceState(page);
        if (!st.pending) composer = st.composer;
      }
      s = await surfaceState(page);
      check(s.botTitle === 'Lokma CEO', 'selected bot header shows the bot name', s.botTitle);
      check(
        typeof composer === 'string' && /^Message /.test(composer),
        'bot chat composer speaks in the bot voice',
        composer === null ? 'no composer (chat never mounted)' : composer,
      );
      check(
        s.rows.some((r) => r.id === ceo.id && r.preview.length > 0),
        'row shows a last-message preview / description',
      );
    }

    // ── Mode persistence across a reload ──
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-mode-switch="bots"]', { timeout: 20000 });
    await wait(1500);
    s = await surfaceState(page);
    check(s.botsMode === true && s.botsActive === true, 'reload lands back in the Bots mode (persisted)');

    // ── Back to lokma: normal mode returns ──
    check(await clickMode(page, 'chat'), 'clicked the lokma switch');
    await wait(1500);
    s = await surfaceState(page);
    check(s.botsMode === false && s.chatActive === true, 'normal mode returns');
    check(s.chromeToggles > 0, 'normal mode chrome is back (toggles visible)', `toggles=${s.chromeToggles}`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-mode-switch="chat"]', { timeout: 20000 });
    await wait(1500);
    s = await surfaceState(page);
    check(s.botsMode === false && s.chatActive === true, 'reload keeps the chat mode (persisted)');
  } catch (e) {
    check(false, 'probe crashed', e instanceof Error ? e.message : String(e));
  } finally {
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
