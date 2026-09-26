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
 * REQ-161 tick 2 adds: no Bots entry survives in either rail, and the normal
 * chat's header carries no bot picker. Tick 3 adds: the Gallery's live
 * actions (run / fork / publish / copy bot.json / delete) re-homed behind
 * the selected bot's header menu — the probe drives each one against the
 * real endpoints (incl. a menu-built fork that is published, run and
 * deleted again, plus the clipboard copy), proves a message typed into the
 * fork chat lands in that bot-bound session's JSONL on disk, and cleans up
 * after itself.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

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
// Unique per run so a crashed earlier probe can never 409 the fork step.
const FORK_ID = `e2e-req161-fork-${Date.now().toString(36)}`;

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
      railBotsEntries: (() => {
        var rails = ['nav[aria-label="Activity bar"]', 'nav[aria-label="Inspector rail"]'];
        var n = 0;
        rails.forEach(function (sel) {
          var rail = document.querySelector(sel);
          if (!rail) return;
          Array.prototype.forEach.call(rail.querySelectorAll('button'), function (b) {
            if (b.getAttribute('aria-label') === 'Bots') n += 1;
          });
        });
        return n;
      })(),
      composerBotPicker: Boolean(
        document.querySelector('button[aria-label="Pick a bot for this chat"], button[aria-label^="Active bot "]'),
      ),
      noBotChip: Array.prototype.some.call(document.querySelectorAll('button'), function (b) {
        return (b.textContent || '').trim() === 'No bot';
      }),
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

/** REQ-161 tick 2 — the scattered Bots entries were removed from the chrome. */
function checkNoScatteredBots(s, where) {
  check(s.railBotsEntries === 0, 'no Bots entry in either rail (' + where + ')', 'entries=' + s.railBotsEntries);
  check(
    !s.composerBotPicker && !s.noBotChip,
    'no bot picker in the normal chat header (' + where + ')',
  );
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('lokma-token', t);
    } catch {
      /* ignore */
    }
  }, TOKEN);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);

  // Captured during the action checks so the cleanup (finally) can never
  // leave a probe agent/session behind, even after a crash.
  let runAgentId = null;
  let runSessionId = null;
  let forkSessionId = null;

  try {
    // ── Boot: normal (chat) mode is the default and carries the chrome ──
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-mode-switch="bots"]', { timeout: 20000 });
    await wait(1200);
    let s = await surfaceState(page);
    check(s.hasChatSwitch && s.hasBotsSwitch, 'header shows the lokma | Bots switch', `chat=${s.chatActive} bots=${s.botsActive}`);
    check(s.chatActive === true && s.botsMode === false, 'boots into the normal chat mode');
    check(s.chromeToggles > 0, 'normal mode keeps the sidebar toggles', `toggles=${s.chromeToggles}`);

    // ── REQ-161 tick 2: the scattered Bots entries are gone from chat mode ──
    checkNoScatteredBots(s, 'chat mode boot');

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

    // ── REQ-161 tick 3 — the gallery actions live behind the header menu ──
    const openMenu = async () => {
      const menu = page.locator('[role="menu"][aria-label="Bot actions"]');
      await menu.waitFor({ state: 'visible', timeout: 5000 });
      return menu.evaluate((el) =>
        Array.from(el.querySelectorAll('[role="menuitem"]')).map((b) => ({
          label: (b.textContent || '').replace(/\s+/g, ' ').trim(),
          disabled: b.hasAttribute('disabled'),
        })),
      );
    };

    await page.click('[data-bot-menu="lokma-ceo"]');
    const items = await openMenu();
    const labels = items.map((i) => i.label);
    check(labels.some((l) => /Run agent/.test(l)), 'header menu offers Run agent', labels.join(' | ').slice(0, 150));
    check(labels.some((l) => /Fork bot/.test(l)), 'header menu offers Fork bot');
    check(labels.some((l) => /Publish/.test(l)), 'header menu offers Publish');
    check(labels.some((l) => /Copy bot\.json/.test(l)), 'header menu offers Copy bot.json');
    check(labels.some((l) => /Delete bot/.test(l)), 'header menu offers Delete bot');
    const publishItem = items.find((i) => /Publish/.test(i.label));
    const deleteItem = items.find((i) => /Delete bot/.test(i.label));
    check(Boolean(publishItem && publishItem.disabled), 'bundled bot: Publish is disabled (read-only)');
    check(Boolean(deleteItem && deleteItem.disabled), 'bundled bot: Delete is disabled (read-only)');

    // Copy bot.json → the real record lands on the clipboard.
    await page.click('[role="menu"][aria-label="Bot actions"] [role="menuitem"]:has-text("Copy bot.json")');
    await wait(400);
    const clip = await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return '';
      }
    });
    let clipDoc = null;
    try {
      clipDoc = JSON.parse(clip);
    } catch {
      clipDoc = null;
    }
    check(
      Boolean(clipDoc && clipDoc.id === 'lokma-ceo' && typeof clipDoc.model === 'string'),
      'Copy bot.json puts the real record on the clipboard',
      clip.slice(0, 50),
    );

    // Fork from the menu → dialog → the fork appears as a row and is selected.
    await page.click('[data-bot-menu="lokma-ceo"]');
    await page.waitForSelector('[role="menu"][aria-label="Bot actions"]');
    await page.click('[role="menu"][aria-label="Bot actions"] [role="menuitem"]:has-text("Fork bot")');
    await page.waitForSelector('[data-bot-action="fork"]');
    await page.fill('[data-bot-fork-input]', FORK_ID);
    await page.click('[data-bot-action="fork"] [data-bot-action-submit]');
    let forked = false;
    for (let i = 0; i < 30 && !forked; i += 1) {
      await wait(400);
      forked = await page.evaluate((id) => Boolean(document.querySelector(`[data-bot-row="${id}"]`)), FORK_ID);
    }
    check(forked, 'Fork from the menu creates the bot (row appears)', FORK_ID);
    let forkSelected = false;
    for (let i = 0; i < 20 && !forkSelected; i += 1) {
      forkSelected = await page.evaluate((id) => Boolean(document.querySelector(`[data-bot-menu="${id}"]`)), FORK_ID);
      if (!forkSelected) await wait(400);
    }
    check(forkSelected, 'the fresh fork becomes the selected bot (header menu follows)');

    // The fork's minted session (removed again in the cleanup below).
    const forkedList = await ctx.request.get(`${BASE}/api/bots?sessions=1`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const forkedBody = await forkedList.json().catch(() => null);
    forkSessionId =
      (forkedBody && (forkedBody.bots || []).find((b) => b.id === FORK_ID)?.lastSession?.id) || null;

    // "The message is really delivered" (REQ-161 acceptance): type into the
    // fork chat's composer and prove the row lands in THAT bot-bound session
    // server-side (its JSONL on disk), not just somewhere in the browser.
    const MARKER = `req161-probe-msg-${Date.now().toString(36)}`;
    const composed = await page.evaluate(() => {
      const ta = document.querySelector('textarea[aria-label="Message Lokma"]');
      return ta ? ta.getAttribute('placeholder') || '' : null;
    });
    check(
      typeof composed === 'string' && composed.startsWith('Message '),
      'fork chat composer is mounted for the message check',
      composed === null ? 'no textarea' : composed,
    );
    await page.fill('textarea[aria-label="Message Lokma"]', MARKER);
    await page.press('textarea[aria-label="Message Lokma"]', 'Enter');
    const sessionFileFor = (id) => {
      const root = path.join(process.env.HOME || '/root', '.lokma', 'projects');
      let projects = [];
      try {
        projects = fs.readdirSync(root);
      } catch {
        return null;
      }
      for (const p of projects) {
        const f = path.join(root, p, 'sessions', `${id}.jsonl`);
        if (fs.existsSync(f)) return f;
      }
      return null;
    };
    let deliveredFile = null;
    for (let i = 0; i < 40 && !deliveredFile; i += 1) {
      await wait(500);
      const f = forkSessionId ? sessionFileFor(forkSessionId) : null;
      if (f) {
        try {
          if (fs.readFileSync(f, 'utf8').includes(MARKER)) deliveredFile = f;
        } catch {
          /* keep polling */
        }
      }
    }
    check(
      Boolean(deliveredFile),
      'the sent message lands in the bot-bound session (server-side JSONL)',
      deliveredFile || 'marker not found within 20s',
    );
    const domMarker = await page.evaluate((m) => {
      return Array.prototype.some.call(document.querySelectorAll('*'), (el) => {
        return el.children.length === 0 && (el.textContent || '').includes(m);
      });
    }, MARKER);
    check(domMarker, 'the sent message paints in the fork chat (dom)');

    // Run agent on the fork: an empty task validates, a real task spawns one.
    await page.click(`[data-bot-menu="${FORK_ID}"]`);
    await page.waitForSelector('[role="menu"][aria-label="Bot actions"]');
    await page.click('[role="menu"][aria-label="Bot actions"] [role="menuitem"]:has-text("Run agent")');
    await page.waitForSelector('[data-bot-action="run"]');
    await page.click('[data-bot-action="run"] [data-bot-action-submit]');
    const emptyRunText = await page.evaluate(() => {
      const dlg = document.querySelector('[data-bot-action="run"]');
      return dlg ? dlg.textContent || '' : '';
    });
    check(/Task must be/.test(emptyRunText), 'Run dialog validates an empty task before sending');

    const runWait = page.waitForResponse(
      (r) => r.url().includes(`/api/bots/${FORK_ID}/run`) && r.request().method() === 'POST',
      { timeout: 15000 },
    );
    await page.fill('[data-bot-task-input]', 'E2E probe: confirm the bot name.');
    await page.click('[data-bot-action="run"] [data-bot-action-submit]');
    const runRes = await runWait.catch(() => null);
    let runBody = null;
    if (runRes) {
      try {
        runBody = await runRes.json();
      } catch {
        runBody = null;
      }
    }
    check(
      Boolean(runRes && runRes.status() === 200 && runBody && runBody.agentId),
      'Run agent spawns a real agent (HTTP 200 + agentId)',
      runRes ? `status=${runRes.status()}` : 'no response',
    );
    runAgentId = (runBody && runBody.agentId) || null;
    runSessionId = (runBody && runBody.sessionId) || null;
    let runDialogClosed = false;
    for (let i = 0; i < 20 && !runDialogClosed; i += 1) {
      runDialogClosed = await page.evaluate(() => !document.querySelector('[data-bot-action="run"]'));
      if (!runDialogClosed) await wait(300);
    }
    check(runDialogClosed, 'Run dialog closes after a successful run');

    // Publish the fork (editable) → real visibility flip, server-confirmed.
    await page.click(`[data-bot-menu="${FORK_ID}"]`);
    await page.waitForSelector('[role="menu"][aria-label="Bot actions"]');
    await page.click('[role="menu"][aria-label="Bot actions"] [role="menuitem"]:has-text("Publish")');
    await page.waitForSelector('[data-bot-action="publish"]');
    await page.click('[data-bot-publish="shared"]');
    await page.click('[data-bot-action="publish"] [data-bot-action-submit]');
    let published = false;
    for (let i = 0; i < 20 && !published; i += 1) {
      const res = await ctx.request.get(`${BASE}/api/bots/${FORK_ID}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const body = await res.json().catch(() => null);
      if (body && body.bot && body.bot.visibility === 'shared') published = true;
      if (!published) await wait(400);
    }
    check(published, 'Publish from the menu flips visibility (server-confirmed)');

    // Delete the fork from the menu → confirm dialog → row and server entry gone.
    await page.click(`[data-bot-menu="${FORK_ID}"]`);
    await page.waitForSelector('[role="menu"][aria-label="Bot actions"]');
    await page.click('[role="menu"][aria-label="Bot actions"] [role="menuitem"]:has-text("Delete bot")');
    await page.waitForSelector('[data-bot-action="delete"]');
    await page.click('[data-bot-action="delete"] [data-bot-action-submit]');
    let forkGone = false;
    for (let i = 0; i < 30 && !forkGone; i += 1) {
      await wait(400);
      forkGone = await page.evaluate((id) => !document.querySelector(`[data-bot-row="${id}"]`), FORK_ID);
    }
    check(forkGone, 'Delete from the menu removes the row');
    const goneRes = await ctx.request.get(`${BASE}/api/bots/${FORK_ID}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    check(goneRes.status() === 404, 'deleted bot is gone server-side (404)', `status=${goneRes.status()}`);

    // Cleanup this probe's session/agent state (the fork itself is gone above).
    for (const url of [
      runAgentId ? `${BASE}/api/agents/${runAgentId}` : null,
      runSessionId ? `${BASE}/api/sessions/${runSessionId}` : null,
      forkSessionId ? `${BASE}/api/sessions/${forkSessionId}` : null,
    ]) {
      if (url) {
        await ctx.request.delete(url, { headers: { Authorization: `Bearer ${TOKEN}` } }).catch(() => {});
      }
    }
    // A run started by the delivered message may still append rows and
    // recreate its file — re-delete it if it came back (file-checked).
    for (let attempt = 0; forkSessionId && attempt < 3; attempt += 1) {
      await wait(attempt === 0 ? 600 : 5000);
      if (!sessionFileFor(forkSessionId)) break;
      await ctx.request.delete(`${BASE}/api/sessions/${forkSessionId}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }).catch(() => {});
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
    checkNoScatteredBots(s, 'back from the Bots mode');
    check(s.chromeToggles > 0, 'normal mode chrome is back (toggles visible)', `toggles=${s.chromeToggles}`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-mode-switch="chat"]', { timeout: 20000 });
    await wait(1500);
    s = await surfaceState(page);
    check(s.botsMode === false && s.chatActive === true, 'reload keeps the chat mode (persisted)');
  } catch (e) {
    check(false, 'probe crashed', e instanceof Error ? e.message : String(e));
  } finally {
    // Best-effort: never leave probe state behind, even after a crash.
    try {
      if (runAgentId) {
        await ctx.request.delete(`${BASE}/api/agents/${runAgentId}`, {
          headers: { Authorization: `Bearer ${TOKEN}` },
        });
      }
      await ctx.request.delete(`${BASE}/api/bots/${FORK_ID}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
    } catch {
      /* best-effort cleanup */
    }
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
