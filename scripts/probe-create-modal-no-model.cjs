#!/usr/bin/env node
/**
 * REQ-171 live probe - the Create bot / Create agent dialogs no longer ask
 * for a Model; the composer picker owns the model choice (REQ-130 chain).
 *
 * Against the LIVE app (minted Bearer token; the login gate stays ON):
 *
 *   A. Agent side - rail 'Agents' -> Settings modal -> Agent Hub -> Create:
 *      the dialog has NO Model label/input; Persona/Name/cwd/budgets stay;
 *      creating a real agent works (GET /api/agents shows it, model falls
 *      back to the server default); pre-existing agents keep their model;
 *      the probe-created agent is deleted and verified gone.
 *   B. Bot side - Bots mode -> 'New Bot' dialog: no Model label/input;
 *      Visibility stays; creating a real bot works (GET /api/bots), its chat
 *      opens with the composer model picker (#lokma-composer-model) and a
 *      session is minted for it; pre-existing bots keep their model; the
 *      probe-created bot + its session are deleted and verified gone.
 *
 * Usage: mint a token, then run with xvfb + the shared playwright-core:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node scripts/probe-create-modal-no-model.cjs --url https://lokma.fermag.com.tr --token "$TK"
 */
const { chromium } = require('playwright-core');

const BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'https://lokma.fermag.com.tr';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN = (process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : '') || process.env.TOKEN || '';
const RUN = Date.now().toString(36);
const BOT_NAME = 'REQ-171 probe ' + RUN;
const AGENT_NAME = 'REQ-171 probe ' + RUN;

if (!TOKEN) {
  console.error('TOKEN is required (HOME=/root bun scripts/mint-e2e-token.mjs)');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
const ok = (name, pass, detail) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  - ' + detail : ''));
  if (!pass) failures.push(name);
};

async function api(path, opts) {
  const o = opts || {};
  const headers = { Authorization: 'Bearer ' + TOKEN };
  // Fastify rejects body-less requests that still declare a JSON content
  // type (FST_ERR_CTP_EMPTY_JSON_BODY -> 400) -- only declare it when a
  // body is actually sent.
  if (o.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method: o.method || 'GET',
    headers: headers,
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { json = null; }
  return { status: res.status, json: json, text: text };
}

// ---- page-side readers (browser globals only) -----------------------------

function dialogProbe(aria) {
  const d = document.querySelector('div[role="dialog"][aria-label="' + aria + '"]');
  if (!d) return null;
  const labels = [].slice.call(d.querySelectorAll('label')).map(function (l) { return (l.textContent || '').trim(); });
  const text = d.innerText || '';
  return {
    exists: true,
    hasModelInput: Boolean(d.querySelector('#bot-model, #agent-model')),
    hasModelLabel: labels.some(function (l) { return l === 'Model'; }),
    hasModelWord: text.toLowerCase().indexOf('model') !== -1,
    labels: labels,
    hasName: Boolean(d.querySelector('#bot-name, #agent-name')),
    hasDescription: Boolean(d.querySelector('#bot-description')),
    hasVisibility: Boolean(d.querySelector('#bot-visibility')),
    hasPersona: Boolean(d.querySelector('#agent-persona')),
    hasCwd: Boolean(d.querySelector('#agent-cwd')),
  };
}

function clickBySelector(sel) {
  const el = document.querySelector(sel);
  if (!el) return false;
  el.click();
  return true;
}

function clickDialogButton(arg) {
  const d = document.querySelector('div[role="dialog"][aria-label="' + arg.aria + '"]');
  if (!d) return false;
  const buttons = [].slice.call(d.querySelectorAll('button'));
  for (let i = 0; i < buttons.length; i += 1) {
    if ((buttons[i].textContent || '').trim() === arg.label) { buttons[i].click(); return true; }
  }
  return false;
}

function clickModalButton(text) {
  const modal = document.querySelector('[role="dialog"][aria-label="Settings"]');
  if (!modal) return false;
  const buttons = [].slice.call(modal.querySelectorAll('button'));
  for (let i = 0; i < buttons.length; i += 1) {
    if ((buttons[i].textContent || '').trim() === text) { buttons[i].click(); return true; }
  }
  return false;
}

function settingsModalOpen() {
  return Boolean(document.querySelector('[role="dialog"][aria-label="Settings"]'));
}

function agentHubReady() {
  const modal = document.querySelector('[role="dialog"][aria-label="Settings"]');
  if (!modal) return false;
  // The nav LABEL says 'Agent Hub' too, so requiring that text matches too
  // early; require the pane body's Create button -- it only exists once the
  // lazy pane has actually rendered into the section body.
  const buttons = [].slice.call(modal.querySelectorAll('button'));
  for (let i = 0; i < buttons.length; i += 1) {
    if ((buttons[i].textContent || '').trim() === 'Create') return true;
  }
  return false;
}

function modalButtons() {
  const modal = document.querySelector('[role="dialog"][aria-label="Settings"]');
  if (!modal) return [];
  return [].slice.call(modal.querySelectorAll('button')).map(function (b) { return (b.textContent || '').trim(); }).slice(0, 30);
}

function dialogTextOf(aria) {
  const d = document.querySelector('div[role="dialog"][aria-label="' + aria + '"]');
  return d ? (d.innerText || '').slice(0, 240) : null;
}

function botsState(botId) {
  const title = document.querySelector('[data-bot-title]');
  return {
    mode: Boolean(document.querySelector('[data-bots-mode]')),
    row: Boolean(document.querySelector('[data-bot-row="' + botId + '"]')),
    title: title ? (title.textContent || '').trim() : null,
    composerPicker: Boolean(document.querySelector('#lokma-composer-model')),
    chatPending: Boolean(document.querySelector('[data-bot-chat-pending]')),
  };
}

// ---- probe -----------------------------------------------------------------

(async () => {
  const created = { botId: null, botSessionId: null, agentId: null };
  let browser = null;

  const cleanup = async () => {
    // Delete AND re-check: a delete that returns a status is not a delete;
    // poll the API until the record stays gone.
    if (created.botSessionId) {
      const id = created.botSessionId;
      const del = await api('/api/sessions/' + id, { method: 'DELETE' });
      console.log('  cleanup: session ' + id + ' -> HTTP ' + del.status);
      let gone = false;
      for (let i = 0; i < 15; i += 1) {
        const r = await api('/api/sessions');
        gone = !(((r.json && r.json.sessions) || []).some((s) => s.id === id));
        if (gone) break;
        await sleep(300);
      }
      ok('cleanup: the probe session stays gone', gone, gone ? 'verified over the API' : 'still listed');
      created.botSessionId = null;
    }
    if (created.botId) {
      const id = created.botId;
      const del = await api('/api/bots/' + id, { method: 'DELETE' });
      console.log('  cleanup: bot ' + id + ' -> HTTP ' + del.status);
      let gone = false;
      for (let i = 0; i < 15; i += 1) {
        const r = await api('/api/bots');
        gone = !(((r.json && r.json.bots) || []).some((b) => b.id === id));
        if (gone) break;
        await sleep(300);
      }
      ok('cleanup: the probe bot stays gone', gone, gone ? 'verified over the API' : 'still listed');
      created.botId = null;
    }
    if (created.agentId) {
      const id = created.agentId;
      const del = await api('/api/agents/' + id, { method: 'DELETE' });
      console.log('  cleanup: agent ' + id + ' -> HTTP ' + del.status);
      let gone = false;
      for (let i = 0; i < 15; i += 1) {
        const r = await api('/api/agents');
        gone = !(((r.json && r.json.agents) || []).some((a) => a.id === id));
        if (gone) break;
        await sleep(300);
      }
      ok('cleanup: the probe agent stays gone', gone, gone ? 'verified over the API' : 'still listed');
      created.agentId = null;
    }
  };

  try {
    // Baselines over REST (the API GET before/after comparison the REQ asks for).
    const beforeBots = await api('/api/bots');
    const beforeAgents = await api('/api/agents');
    const baselineBots = (beforeBots.json && beforeBots.json.bots) || [];
    const baselineAgents = (beforeAgents.json && beforeAgents.json.agents) || [];
    console.log('baseline: ' + baselineBots.length + ' bots, ' + baselineAgents.length + ' agents');

    browser = await chromium.launch({
      executablePath: CHROME,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    await ctx.addInitScript((t) => {
      try { localStorage.setItem('lokma-token', t); } catch (e) { /* ignore */ }
    }, TOKEN);
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 160)));

    await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
    await sleep(6000);

    const railReady = await page.evaluate(() => Boolean(document.querySelector('nav[aria-label="Inspector rail"]')));
    ok('the harness shell renders (Inspector rail present)', railReady, railReady ? 'rail found' : 'no rail in 6s');
    if (!railReady) { await cleanup(); await finish(browser, errors, failures); return; }

    // ---- A. Agent side ------------------------------------------------------
    const agentsClicked = await page.evaluate(clickBySelector, 'nav[aria-label="Inspector rail"] button[aria-label="Agents"]');
    ok("the rail 'Agents' icon is clicked", agentsClicked, agentsClicked ? 'click sent' : 'no Agents rail button');

    await page.waitForSelector('[role="dialog"][aria-label="Settings"]', { timeout: 15000 }).catch(() => null);
    ok('the Settings modal opens on the Agents section', await page.evaluate(settingsModalOpen), 'modal present');

    let hub = false;
    for (let i = 0; i < 30; i += 1) {
      hub = await page.evaluate(agentHubReady);
      if (hub) break;
      await sleep(400);
    }
    ok('the Agent Hub pane renders inside the modal (Create button present)', hub, hub ? 'pane body found' : 'no pane body in 12s');
    if (!hub) {
      console.log('  modal buttons: ' + JSON.stringify(await page.evaluate(modalButtons)));
      await cleanup(); await finish(browser, errors, failures); return;
    }

    const createClicked = await page.evaluate(clickModalButton, 'Create');
    ok("the Agent Hub 'Create' button is clicked", createClicked);
    if (!createClicked) console.log('  modal buttons: ' + JSON.stringify(await page.evaluate(modalButtons)));

    await page.waitForSelector('div[role="dialog"][aria-label="Create agent"]', { timeout: 10000 }).catch(() => null);
    const aDialog = await page.evaluate(dialogProbe, 'Create agent');
    ok('the Create agent dialog opens', Boolean(aDialog));
    if (aDialog) {
      ok('the dialog has NO #agent-model input', !aDialog.hasModelInput, aDialog.hasModelInput ? 'model input still rendered' : 'no model input');
      ok('no Model label in the dialog', !aDialog.hasModelLabel, aDialog.labels.join(' | '));
      ok('the word model is gone from the dialog body', !aDialog.hasModelWord, aDialog.hasModelWord ? 'word still present' : 'absent');
      ok('Name stays (visible label)', aDialog.hasName && aDialog.labels.join('|').indexOf('Name') !== -1);
      ok('Persona stays (visible label)', aDialog.hasPersona && aDialog.labels.join('|').indexOf('Persona') !== -1);
      ok('Working directory stays', aDialog.hasCwd && aDialog.labels.join('|').indexOf('Working directory') !== -1);
      ok('budget fields stay', aDialog.labels.join('|').indexOf('Token budget') !== -1 && aDialog.labels.join('|').indexOf('USD budget') !== -1);
      await page.screenshot({ path: '/tmp/req171-agent-dialog.png' });
      console.log('screenshot: /tmp/req171-agent-dialog.png');
    }

    await page.fill('#agent-name', AGENT_NAME).catch(() => null);
    const aSubmitted = await page.evaluate(clickDialogButton, { aria: 'Create agent', label: 'Create agent' });
    ok('the Create agent submit is clicked', aSubmitted);

    let aGone = false;
    for (let i = 0; i < 25; i += 1) {
      aGone = await page.evaluate((x) => !document.querySelector('div[role="dialog"][aria-label="' + x + '"]'), 'Create agent');
      if (aGone) break;
      await sleep(300);
    }
    ok('the Create agent dialog closes after create', aGone, aGone ? 'closed' : String(await page.evaluate(dialogTextOf, 'Create agent')));

    for (let i = 0; i < 25; i += 1) {
      const res = await api('/api/agents');
      const found = ((res.json && res.json.agents) || []).filter((a) => a.name === AGENT_NAME);
      if (found.length) { created.agentId = found[0].id; break; }
      await sleep(400);
    }
    const agentRow = created.agentId
      ? ((((await api('/api/agents')).json || {}).agents) || []).find((a) => a.id === created.agentId)
      : null;
    ok('the agent is registered over the API', Boolean(agentRow), agentRow ? 'id=' + agentRow.id : 'not found');
    ok('the new agent carries a non-empty model (server default)', Boolean(agentRow && typeof agentRow.model === 'string' && agentRow.model.length > 0), agentRow ? 'model=' + agentRow.model : 'n/a');

    const afterAgents = ((await api('/api/agents')).json || {}).agents || [];
    const agentDrift = baselineAgents.filter((a) => {
      const now = afterAgents.find((x) => x.id === a.id);
      return now && now.model !== a.model;
    }).map((a) => a.id);
    ok('pre-existing agents keep their model', agentDrift.length === 0, agentDrift.join(',') || 'all unchanged');

    // ---- B. Bot side --------------------------------------------------------
    await page.evaluate(() => { try { localStorage.setItem('lokma-app-mode:v1', 'bots'); } catch (e) { /* ignore */ } });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(5000);

    const botsMode = await page.evaluate(() => Boolean(document.querySelector('[data-bots-mode]')));
    ok('the Bots mode renders after reload', botsMode, botsMode ? 'data-bots-mode found' : 'no bots mode in 5s');
    if (!botsMode) { await cleanup(); await finish(browser, errors, failures); return; }

    const newBotClicked = await page.evaluate(clickBySelector, '[data-new-bot]');
    ok("the 'New Bot' button is clicked", newBotClicked);

    await page.waitForSelector('div[role="dialog"][aria-label="Create bot"]', { timeout: 10000 }).catch(() => null);
    const bDialog = await page.evaluate(dialogProbe, 'Create bot');
    ok('the Create bot dialog opens', Boolean(bDialog));
    if (bDialog) {
      ok('the dialog has NO #bot-model input', !bDialog.hasModelInput, bDialog.hasModelInput ? 'model input still rendered' : 'no model input');
      ok('no Model label in the dialog', !bDialog.hasModelLabel, bDialog.labels.join(' | '));
      ok('the word model is gone from the dialog body', !bDialog.hasModelWord, bDialog.hasModelWord ? 'word still present' : 'absent');
      ok('Name stays', bDialog.hasName && bDialog.labels.join('|').indexOf('Name') !== -1);
      ok('Description stays', bDialog.hasDescription && bDialog.labels.join('|').indexOf('Description') !== -1);
      ok('Visibility stays', bDialog.hasVisibility && bDialog.labels.join('|').indexOf('Visibility') !== -1);
      ok('System prompt stays', bDialog.labels.join('|').indexOf('System prompt') !== -1);
      await page.screenshot({ path: '/tmp/req171-bot-dialog.png' });
      console.log('screenshot: /tmp/req171-bot-dialog.png');
    }

    await page.fill('#bot-name', BOT_NAME).catch(() => null);
    await page.fill('#bot-description', 'REQ-171 live probe - safe to delete').catch(() => null);
    const bSubmitted = await page.evaluate(clickDialogButton, { aria: 'Create bot', label: 'Create bot' });
    ok('the Create bot submit is clicked', bSubmitted);

    let bGone = false;
    for (let i = 0; i < 25; i += 1) {
      bGone = await page.evaluate((x) => !document.querySelector('div[role="dialog"][aria-label="' + x + '"]'), 'Create bot');
      if (bGone) break;
      await sleep(300);
    }
    ok('the Create bot dialog closes after create', bGone, bGone ? 'closed' : String(await page.evaluate(dialogTextOf, 'Create bot')));

    for (let i = 0; i < 25; i += 1) {
      const res = await api('/api/bots');
      const found = ((res.json && res.json.bots) || []).filter((b) => b.name === BOT_NAME);
      if (found.length) { created.botId = found[0].id; break; }
      await sleep(400);
    }
    const botRow = created.botId
      ? ((((await api('/api/bots')).json || {}).bots) || []).find((b) => b.id === created.botId)
      : null;
    ok('the bot is registered over the API', Boolean(botRow), botRow ? 'id=' + botRow.id : 'not found');
    ok('the new bot carries a non-empty model (server default)', Boolean(botRow && typeof botRow.model === 'string' && botRow.model.length > 0), botRow ? 'model=' + botRow.model : 'n/a');

    let bState = null;
    if (created.botId) {
      for (let i = 0; i < 30; i += 1) {
        bState = await page.evaluate(botsState, created.botId);
        if (bState && bState.row && bState.composerPicker) break;
        await sleep(400);
      }
    }
    ok('the new bot row appears in the list', Boolean(bState && bState.row), bState ? 'title=' + bState.title : 'n/a');
    ok('the bot chat opens with the composer model picker (#lokma-composer-model)', Boolean(bState && bState.composerPicker), bState ? 'picker=' + bState.composerPicker + ' pending=' + bState.chatPending : 'n/a');

    for (let i = 0; i < 20; i += 1) {
      const res = await api('/api/bots?sessions=1');
      const found = ((res.json && res.json.bots) || []).find((b) => b.id === created.botId);
      if (found && found.lastSession && found.lastSession.id) { created.botSessionId = found.lastSession.id; break; }
      await sleep(400);
    }
    ok('a chat session is minted and bound to the bot', Boolean(created.botSessionId), created.botSessionId || 'no lastSession in 8s');

    const afterBots = ((await api('/api/bots')).json || {}).bots || [];
    const botDrift = baselineBots.filter((b) => {
      const now = afterBots.find((x) => x.id === b.id);
      return now && now.model !== b.model;
    }).map((b) => b.id);
    ok('pre-existing bots keep their model', botDrift.length === 0, botDrift.join(',') || 'all unchanged');

    // ---- cleanup ------------------------------------------------------------
    await cleanup();

    await finish(browser, errors, failures);
  } catch (e) {
    console.error('probe crashed: ' + String(e));
    await cleanup();
    if (browser) await browser.close().catch(() => null);
    process.exit(1);
  }
})();

async function finish(browser, errors, failures) {
  const jsErrors = errors.filter((e) => e.indexOf('Failed to load resource') === -1);
  ok('no JavaScript errors on the page', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | ') || 'clean');
  await browser.close().catch(() => null);
  if (failures.length) {
    console.log('probe-create-modal-no-model: ' + failures.length + ' failure(s): ' + failures.join(', '));
    process.exit(1);
  }
  console.log('probe-create-modal-no-model: all checks passed.');
  process.exit(0);
}
