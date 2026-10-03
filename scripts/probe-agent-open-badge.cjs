#!/usr/bin/env node
/**
 * REQ-193 slice 10 — live proof for the "Ajan açtı" badge (Kapsam 5).
 *
 * Zero model cost, real writer. An ephemeral provider stub on 127.0.0.1 forces
 * a NATIVE `open_browser` tool call over SSE, so the running server's loop
 * calls the real tool — which is the ONLY writer of the agent-open stamp — and
 * the tool emits the real `ui_action` frame. Nothing here hand-writes the
 * stamp, so the probe cannot pass on a field the product never sets.
 *
 * The browser half runs in the DEPLOYED surface (localhost:3457) with a minted
 * superadmin token, so the login gate stays ON (never flipped for a test).
 * Only the PROXY route is stubbed — the badge is a toolbar chip, so the frame
 * body is irrelevant to it.
 *
 * Both directions matter. "The badge shows" is satisfied by a chip that always
 * shows, so an agent-opened tab is compared against a tab the PROBE opened
 * over REST (the tool-only writer refuses that path's flag) — the negative
 * control that makes the first check mean anything.
 *
 * Usage (repo root):
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a \
 *     node scripts/probe-agent-open-badge.cjs --token "$TK"
 *
 * Exit 0 = the badge distinguishes an agent-opened page from a user one.
 */
const { chromium } = require('playwright-core');
const http = require('node:http');
const WebSocket = require('ws');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const REPO = join(__dirname, '..');
const WEB = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://127.0.0.1:3457';
const API = 'http://127.0.0.1:3456';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const NL = '\n';
const RUN_TIMEOUT_MS = 90000;
const PROBE_ID = 'badge-probe-' + Date.now().toString(36);
const WORKDIR = '/tmp/lokma-badge-probe';
const TARGET = 'https://badge-probe.example/page';
const PANE_ID = 'center';

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

const token = (process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : process.env.TOKEN || '')
  .trim()
  .split(NL)
  .pop();
if (!token) {
  console.error('TOKEN is required (HOME=/root bun scripts/mint-e2e-token.mjs)');
  process.exit(1);
}
const auth = { Authorization: 'Bearer ' + token };
const jsonAuth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

let step = 0;
/** Turn 1 = the forced tool call, turn 2 = a plain text answer to end the run. */
function scriptedChunks(body) {
  let promptText = '';
  try {
    const parsed = JSON.parse(body);
    promptText = JSON.stringify(parsed.messages || []);
  } catch {
    promptText = String(body);
  }
  // The second request carries the tool RESULT — that is how we know the call
  // executed, and it is the turn that ends the run.
  //
  // Whitespace-insensitive on purpose: the loop serialises messages with
  // `JSON.stringify`, which emits `"role": "tool"` WITH a space, while
  // re-serialising `parsed.messages` here can produce either form. A regex
  // pinned to `"role":"tool"` never matches, the stub keeps forcing tool
  // calls, and the run burns turns until the timeout — which reads as "the
  // tool did not run" while the frames are sitting right there.
  const isResultTurn = /"role"\s*:\s*"tool"/.test(promptText);
  if (isResultTurn) {
    return [
      { choices: [{ index: 0, finish_reason: null, delta: { content: 'PROBE-OK' } }] },
      { choices: [{ index: 0, finish_reason: 'stop', delta: {} }] },
    ];
  }
  step += 1;
  return [
    {
      choices: [
        {
          index: 0,
          finish_reason: 'tool_calls',
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call_badge_probe',
                type: 'function',
                function: { name: 'open_browser', arguments: JSON.stringify({ url: TARGET }) },
              },
            ],
          },
        },
      ],
    },
    { choices: [{ index: 0, finish_reason: 'tool_calls', delta: {} }] },
  ];
}

const stub = http.createServer((req, res) => {
  if (req.method === 'GET' && /\/models/.test(req.url)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'badge-capture-model' }] }));
    return;
  }
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    const chunks = scriptedChunks(body);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    for (const chunk of chunks) res.write('data: ' + JSON.stringify(chunk) + NL + NL);
    res.write('data: [DONE]' + NL + NL);
    res.end();
  });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs, stepMs) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(stepMs || 400);
  }
}

(async () => {
  const createdSessions = [];
  const createdTabs = [];

  // The tab the probe opens ITSELF — the negative control. The REST route has
  // no field for the agent stamp (tool-only writer), so this tab must never
  // earn the badge no matter what the browser sends.
  const userTabRes = await fetch(API + '/api/browser/open', {
    method: 'POST',
    headers: jsonAuth,
    body: JSON.stringify({ sessionId: PROBE_ID + '-user', url: 'https://user.example/' }),
  });
  const userTab = (await userTabRes.json()).tab;
  createdTabs.push(userTab.id);

  const forged = await fetch(API + '/api/browser/open', {
    method: 'POST',
    headers: jsonAuth,
    body: JSON.stringify({ sessionId: PROBE_ID + '-forge', url: TARGET, openedByAgent: true }),
  });
  const forgedTab = (await forged.json()).tab;
  createdTabs.push(forgedTab.id);
  ok('the REST route refuses a forged openedByAgent flag', forgedTab.openedByAgentAt === null);

  await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
  const baseUrl = 'http://127.0.0.1:' + stub.address().port + '/v1';

  let browser;
  try {
    // namespaced cleanup of a crashed earlier run
    const existing = await fetch(API + '/api/providers', { headers: auth }).then((r) => r.json());
    for (const p of (existing.providers || []).filter((x) => String(x.id).startsWith('badge-probe-'))) {
      await fetch(API + '/api/providers/' + encodeURIComponent(p.id), { method: 'DELETE', headers: auth });
    }
    const add = await fetch(API + '/api/providers', {
      method: 'POST',
      headers: jsonAuth,
      body: JSON.stringify({ id: PROBE_ID, name: 'Badge probe (temp)', baseUrl, apiKey: 'probe-local-key' }),
    });
    if (!add.ok) throw new Error('could not register the ephemeral provider: ' + add.status + ' ' + (await add.text()));
    ok('the ephemeral provider is registered', true, PROBE_ID);

    // ── run the agent so the REAL tool stamps the tab ───────────────────────
    const model = PROBE_ID + '/badge-capture-model';
    const created = await fetch(API + '/api/sessions', {
      method: 'POST',
      headers: jsonAuth,
      body: JSON.stringify({ cwd: WORKDIR, model }),
    });
    const session = await created.json();
    const sessionId = session.id || (session.session && session.session.id);
    createdSessions.push({ id: sessionId });
    if (!sessionId) throw new Error('could not create a session: ' + JSON.stringify(session).slice(0, 200));

    const frames = [];
    const ws = new WebSocket('ws://127.0.0.1:3456/ws/' + sessionId + '?token=' + token);
    const ended = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for the run to end')), RUN_TIMEOUT_MS);
      ws.on('open', () =>
        ws.send(JSON.stringify({ type: 'prompt', sessionId, model, prompt: 'Open the probe page in the browser pane.' })),
      );
      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        frames.push(msg);
        if (msg.type === 'done' || msg.type === 'run_end' || msg.type === 'error') {
          clearTimeout(timer);
          resolve(msg);
        }
      });
      ws.on('error', reject);
    });
    let end;
    try {
      end = await ended;
    } finally {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
    ok('the run finished', Boolean(end), end && end.type);

    // The frame is the first half of the wire contract: without the schema
    // field, Zod would strip the stamp and the badge could only ever appear
    // one fetch late.
    const uiFrame = frames.find((f) => f.type === 'ui_action' && f.action === 'open_browser');
    ok('the agent emitted an open_browser ui_action frame', Boolean(uiFrame));
    ok('the frame carries the agent-open stamp', typeof (uiFrame && uiFrame.openedByAgentAt) === 'string', uiFrame && uiFrame.openedByAgentAt);
    const toolResult = frames.find((f) => f.type === 'tool_result');
    ok('the tool actually ran (a result frame exists)', Boolean(toolResult));

    const agentTab = await waitFor(
      async () => {
        const res = await fetch(API + '/api/browser?sessionId=' + sessionId, { headers: auth });
        const body = await res.json();
        const tab = (body.tabs || [])[0];
        return tab && tab.openedByAgentAt ? tab : null;
      },
      8000,
      400,
    );
    ok('the tab RECORD carries the agent-open stamp', Boolean(agentTab), agentTab && agentTab.openedByAgentAt);
    if (agentTab) createdTabs.push(agentTab.id);

    // ── the pane half, on the deployed surface ───────────────────────────────
    browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript((t) => {
      localStorage.setItem('lokma-token', t);
    }, token);
    await ctx.route('**/api/browser/proxy**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>stub</title><body>stub</body>' }),
    );
    const page = await ctx.newPage();

    async function openPane(sessionIdForPane) {
      await page.goto(WEB + '/', { waitUntil: 'domcontentloaded' });
      const seedId = await page.evaluate(
        async ({ sid, bearer, paneId }) => {
          // The session already exists (created over REST); point the app at it.
          localStorage.setItem('lokma:sessionId', sid);
          localStorage.setItem('lokma:layout:v1', JSON.stringify({
            state: {
              layout: { type: 'pane', id: paneId },
              leftW: 268,
              rightW: 300,
              tiling: false,
              windowed: false,
              activeSessionId: sid,
            },
            version: 1,
          }));
          void bearer;
          return sid;
        },
        { sid: sessionIdForPane, bearer: token, paneId: PANE_ID },
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page
        .waitForSelector('[aria-label="Inspector rail"]', { state: 'attached', timeout: 25000 })
        .catch(() => undefined);
      await page
        .waitForFunction(() => !/Connecting|Lost|reconnect/i.test(document.body.innerText || ''), undefined, { timeout: 20000 })
        .catch(() => undefined);
      // Scope the rail selector INSIDE the rail container: a bare
      // `aria-label="Browser"` also exists elsewhere on the page and would
      // answer the click, leaving the pane unopened. A zero count ABORTS — a
      // probe that measured an empty pane would report the feature missing.
      const rail = page.locator('[aria-label="Inspector rail"] [aria-label="Browser"]');
      const railCount = await rail.count();
      if (railCount !== 1) {
        const seen = await page.evaluate(() => ({
          rails: document.querySelectorAll('[aria-label="Inspector rail"]').length,
          browserLabels: document.querySelectorAll('[aria-label="Browser"]').length,
          emptyPane: (document.body.innerText || '').includes('Type an address above'),
          text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 160),
        }));
        throw new Error('selector is not validated: expected 1 Browser rail entry, found ' + railCount + ' — ' + JSON.stringify(seen));
      }
      await rail.click();
      await page.waitForSelector('iframe', { timeout: 20000 });
      await sleep(1200);
      return seedId;
    }

    console.log('== the agent-opened tab renders the badge ==');
    await openPane(sessionId);
    const chip = page.locator('[data-agent-chip="1"]');
    await chip.first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => undefined);
    const chipCount = await chip.count();
    ok('the badge renders for an agent-opened tab', chipCount === 1);
    if (chipCount === 1) {
      const text = (await chip.first().innerText()).toLowerCase();
      ok('the badge names the agent', text.includes('ajan'), JSON.stringify(text));
      const title = await chip.first().getAttribute('title');
      ok('the badge explains the proxy + no-cookie boundary', (title || '').length > 20);
      const box = await chip.first().boundingBox();
      ok('the badge occupies a real box', Boolean(box && box.width > 40 && box.height > 8), box && Math.round(box.width) + 'x' + Math.round(box.height));
      const icon = await page.locator('[data-agent-chip="1"] svg').count();
      ok('the badge uses a lucide icon, not an emoji glyph', icon >= 1);
    }

    // ── negative control on the SAME surface ────────────────────────────────
    console.log('== a tab the user opened shows no badge ==');
    // Point the same app at a session whose tab was opened over REST.
    const userSession = await fetch(API + '/api/sessions', {
      method: 'POST',
      headers: jsonAuth,
      body: JSON.stringify({ cwd: WORKDIR, model }),
    }).then((r) => r.json());
    const userSessionId = userSession.id || (userSession.session && userSession.session.id);
    createdSessions.push({ id: userSessionId });
    const adopt = await fetch(API + '/api/browser/open', {
      method: 'POST',
      headers: jsonAuth,
      body: JSON.stringify({ sessionId: userSessionId, url: 'https://user.example/' }),
    }).then((r) => r.json());
    createdTabs.push(adopt.tab.id);
    ok('the control tab carries no stamp', adopt.tab.openedByAgentAt === null);

    await openPane(userSessionId);
    ok('no badge on a user-opened tab', (await page.locator('[data-agent-chip="1"]').count()) === 0);
    ok('the control pane really has a page open (a zero badge is not an empty pane)',
      await page.evaluate(() => !!document.querySelector('iframe')));

    // ── the badge must NOT survive the user taking over ─────────────────────
    console.log('== typing an address drops the badge ==');
    await openPane(sessionId);
    await page.waitForSelector('#browser-address', { timeout: 15000 });
    await page.fill('#browser-address', 'https://typed.example/');
    await page.press('#browser-address', 'Enter');
    const dropped = await waitFor(async () => (await page.locator('[data-agent-chip="1"]').count()) === 0, 10000, 300);
    ok('a user navigation clears the badge (navigate() nulls the stamp)', dropped === true);
    const afterNav = await waitFor(
      async () => {
        const res = await fetch(API + '/api/browser?sessionId=' + sessionId, { headers: auth });
        const body = await res.json();
        const tab = (body.tabs || [])[0];
        return tab && tab.url.indexOf('typed.example') !== -1 ? tab : null;
      },
      8000,
      400,
    );
    ok('the record really navigated to the typed url', Boolean(afterNav), afterNav && afterNav.url);
    ok('the record stamp is null after the user navigated', afterNav && afterNav.openedByAgentAt === null);
  } finally {
    if (browser) await browser.close();
    // ── cleanup: namespaced, then re-check by GETting the RESOURCE ───────────
    for (const t of createdTabs) {
      // A body is required: Fastify's parser rejects an empty DELETE body
      // (FST_ERR_CTP_EMPTY_JSON_BODY) before the handler runs.
      await fetch(API + '/api/browser/' + t, { method: 'DELETE', headers: jsonAuth, body: '{}' }).catch(() => undefined);
    }
    for (const t of createdTabs) {
      const res = await fetch(API + '/api/browser/' + t, { headers: auth }).catch(() => ({ status: 0 }));
      ok('probe tab ' + t + ' is gone (direct GET 404, not absent-from-a-list)', res.status === 404, 'status ' + res.status);
    }
    for (const s of createdSessions) {
      // Two traps meet on this route, both measured here:
      //  - `?cwd=` is required — the handler resolves the workspace from the
      //    query and 404s `existed:false` when it looks in the wrong dir,
      //    which reads as "never there" instead of "the delete missed";
      //  - the request must be BODYLESS. Sending `Content-Type:
      //    application/json` with no body makes Fastify's own parser reject it
      //    (FST_ERR_CTP_EMPTY_JSON_BODY) before the handler runs, so a
      //    JSON-auth header silently turns cleanup into a 400.
      const q = '?cwd=' + encodeURIComponent(WORKDIR);
      const del = await fetch(API + '/api/sessions/' + s.id + q, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }).catch(() => ({ status: 0 }));
      const res = await fetch(API + '/api/sessions/' + s.id + q, { headers: auth }).catch(() => ({ status: 0 }));
      ok('probe session ' + s.id + ' is gone', res.status === 404, 'delete ' + del.status + ', then GET ' + res.status);
    }
    await fetch(API + '/api/providers/' + PROBE_ID, { method: 'DELETE', headers: auth }).catch(() => undefined);
    const left = await fetch(API + '/api/providers', { headers: auth })
      .then((r) => r.json())
      .catch(() => ({ providers: [] }));
    ok('the ephemeral provider is deleted', !(left.providers || []).some((p) => p.id === PROBE_ID));
    stub.close();
  }

  console.log('agent-open badge probe: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) {
    console.error('failed: ' + failures.join(' | '));
    process.exit(1);
  }
})().catch((e) => {
  console.error('probe error: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});