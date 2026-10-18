#!/usr/bin/env node
/**
 * REQ-204 live probe — the office surface (pixel canvas + worker detail panel).
 *
 * Proves the DEPLOYED bundle draws the office from LIVE Lokma data and the
 * slice-4 panel reads the REAL transcript:
 *   1. the seeded Office tab mounts wide, the canvas is painted (distinct
 *      colours, opaque pixels) and ANIMATED (two fingerprints differ);
 *   2. a real run (ephemeral provider -> slow capture stub) appears as a
 *      worker; the counter attribute equals the rows actually rendered;
 *   3. the tool badge is live: the stub forces one `read_file` call and the
 *      worker row carries that tool (`data-office-tool`);
 *   4. clicking a worker on the floor selects it (hitTest -> selection),
 *      the hint line names the selection;
 *   5. the WORKER DETAIL PANEL (slice 4): selecting opens the panel for that
 *      worker; its task is the REAL prompt from the transcript, its tool rows
 *      are the persisted read_file row, and its output is EXACTLY what the
 *      run has produced SO FAR (the stub's marker — the final answer has not
 *      arrived yet, so a fabricated one would show up as a wrong string);
 *   6. when the run ends the worker AND its panel leave together ("no workers
 *      -> honest empty state"); the canvas keeps drawing;
 *   7. a sub-600px pane (split layout) falls back to the row list;
 *   8. 390px phone width: no sideways overflow, no canvas.
 *
 * The browser comes up FIRST and the prompt is only sent afterwards, so the
 * pane is provably listening before the run's frames exist (a frame sent
 * before the listener mounts is not a product bug, it is a race the probe
 * must not run into).
 *
 * Usage:
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-office-canvas.cjs [--url https://lokma.fermag.com.tr] [--shots DIR]
 *
 * Exit 0 = every office-surface invariant held; 1 = regression or a leak.
 */
const { execFileSync } = require('node:child_process');
const http = require('node:http');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { WebSocket } = require('ws');
const { chromium } = require('playwright-core');

const NL = '\n';
const argOf = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const BASE = argOf('--url', 'https://lokma.fermag.com.tr');
const API = argOf('--api', 'http://127.0.0.1:3456');
const WS_BASE = argOf('--ws', 'ws://127.0.0.1:3456');
const SHOTS = argOf('--shots', '');
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const RUN_TIMEOUT_MS = 120_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
const failures = [];
function check(cond, label) {
  if (cond) {
    passed += 1;
    console.log('PASS: ' + label);
  } else {
    failures.push(label);
    console.log('FAIL: ' + label);
  }
}

const PROBE_ID = 'office-probe-' + Date.now().toString(36);
const MODEL = PROBE_ID + '/capture-model';
const TOOL_FILE = 'notes.txt';
/** The prompt the socket sends — the panel's task must equal this marker. */
const TASK_MARKER = 'office-panel-task-marker';
/** Text the stub streams BEFORE the run ends — the panel's "output so far". */
const OUTPUT_MARKER = 'PANEL-OUTPUT-MARKER';

/** Wide layout: ONE pane with the Office tab. */
const WIDE = {
  layout: {
    state: {
      layout: { type: 'pane', id: 'center' },
      leftW: 268,
      rightW: 300,
      tiling: true,
      windowed: false,
      activeSessionId: null,
    },
    version: 1,
  },
  tabs: {
    center: {
      tabs: [{ id: 'tab-office-probe', title: 'Office', kind: 'inspector', inspectorId: 'office' }],
      active: 'tab-office-probe',
    },
  },
};

/** Split layout: the Office pane ends up ~half the main area (<600px). */
const NARROW = {
  layout: {
    state: {
      layout: {
        type: 'split',
        id: 'root',
        dir: 'row',
        sizes: [50, 50],
        children: [
          { type: 'pane', id: 'left' },
          { type: 'pane', id: 'right' },
        ],
      },
      leftW: 268,
      rightW: 300,
      tiling: true,
      windowed: false,
      activeSessionId: null,
    },
    version: 1,
  },
  tabs: {
    left: {
      tabs: [{ id: 'tab-office-narrow', title: 'Office', kind: 'inspector', inspectorId: 'office' }],
      active: 'tab-office-narrow',
    },
    right: {
      tabs: [{ id: 'tab-todos-narrow', title: 'Todos', kind: 'inspector', inspectorId: 'todos' }],
      active: 'tab-todos-narrow',
    },
  },
};

// ── capture stub: slow SSE so the run stays alive while the canvas is probed ─
let script = [];
const stub = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'capture-model' }] }));
      return;
    }
    const step = script.shift() || { text: 'PROBE-EXTRA', delayMs: 2000 };
    const delayMs = typeof step.delayMs === 'number' ? step.delayMs : 2000;
    setTimeout(() => {
      const chunks = [];
      const hasTools = Array.isArray(step.toolCalls) && step.toolCalls.length > 0;
      // REQ-204 slice 4: a step may carry text AND tool calls. The loop
      // persists the step's text row BEFORE the tools run, which is what
      // lets the detail panel show "output so far" while the run is alive.
      const text = typeof step.text === 'string' && step.text ? step.text : hasTools ? '' : 'PROBE-OK';
      if (text) {
        chunks.push({ choices: [{ index: 0, finish_reason: null, delta: { content: text } }] });
      }
      if (hasTools) {
        step.toolCalls.forEach((call, i) => {
          chunks.push({
            choices: [
              {
                index: 0,
                finish_reason: null,
                delta: {
                  tool_calls: [
                    { index: i, id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args || {}) } },
                  ],
                },
              },
            ],
          });
        });
        chunks.push({ choices: [{ index: 0, finish_reason: 'tool_calls', delta: {} }] });
      } else {
        chunks.push({ choices: [{ index: 0, finish_reason: 'stop', delta: {} }] });
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
      for (const chunk of chunks) res.write('data: ' + JSON.stringify(chunk) + NL + NL);
      res.write('data: [DONE]' + NL + NL);
      res.end();
    }, delayMs);
  });
});

(async () => {
  const token = execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
  })
    .trim()
    .split(NL)
    .pop();
  const jsonAuth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
  const baseUrl = 'http://127.0.0.1:' + stub.address().port + '/v1';

  const createdSessions = [];
  const dirs = [];
  let providerReady = false;
  let browser = null;
  let probeWs = null;

  try {
    // 1. ephemeral provider -> capture stub
    const add = await fetch(API + '/api/providers', {
      method: 'POST',
      headers: jsonAuth,
      body: JSON.stringify({ id: PROBE_ID, name: 'Office probe (temp)', baseUrl, apiKey: 'probe-key' }),
    });
    providerReady = add.status === 201;
    check(providerReady, 'ephemeral provider registered (HTTP ' + add.status + ')');

    const cwd = mkdtempSync(join(tmpdir(), 'lokma-office-canvas-'));
    dirs.push(cwd);
    writeFileSync(join(cwd, TOOL_FILE), 'office probe file\n');
    const created = await fetch(API + '/api/sessions', {
      method: 'POST',
      headers: jsonAuth,
      body: JSON.stringify({ cwd, model: MODEL }),
    });
    const sessionBody = await created.json();
    const sessionId = sessionBody.id;
    createdSessions.push({ id: sessionId, cwd });
    check(typeof sessionId === 'string' && sessionId.length > 0, 'probe session created (' + sessionId + ')');

    // 2. browser FIRST: the pane must be listening before any run frame exists.
    // The probe session is the ACTIVE one: the app's socket attaches to the
    // active session (the server broadcasts run frames per session), so this is
    // also the boss case — the user's own agent at the boss desk.
    browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    await ctx.addInitScript(
      (payload) => {
        try {
          localStorage.setItem('lokma-token', payload.token);
          // Seed the probe layout ONLY on a fresh profile: the init script runs
          // on every navigation, so an unconditional write would clobber the
          // NARROW layout the probe seeds later via page.evaluate.
          if (localStorage.getItem('lokma:tiling-tabs:v1') === null) {
            localStorage.setItem('lokma:sessionId', payload.sessionId);
            const wide = JSON.parse(JSON.stringify(payload.WIDE));
            wide.layout.state.activeSessionId = payload.sessionId;
            localStorage.setItem('lokma:layout:v1', JSON.stringify(wide.layout));
            localStorage.setItem('lokma:tiling-tabs:v1', JSON.stringify(wide.tabs));
          }
        } catch {
          /* ignore */
        }
      },
      { token, WIDE, sessionId },
    );
    const page = await ctx.newPage();
    const consoleErrors = [];
    const http404 = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('response', (res) => {
      if (res.status() >= 400) http404.push(res.status() + ' ' + res.url());
    });
    await page.goto(BASE + '/?token=' + token, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-office-pane]', { timeout: 25_000 });
    check(true, 'the seeded Office tab mounted in the workspace');

    const canvas = await page.waitForSelector('[data-office-canvas]', { timeout: 25_000 });
    const box = await canvas.boundingBox();
    check(box !== null && box.width >= 600, 'the canvas renders at a readable width (' + (box ? Math.round(box.width) : 0) + 'px >= 600)');

    const readCanvas = () =>
      page.evaluate(() => {
        const el = document.querySelector('[data-office-canvas]');
        if (!el) return null;
        const g = el.getContext('2d');
        const img = g.getImageData(0, 0, el.width, el.height).data;
        const colors = new Set();
        let opaque = 0;
        let sum = 0;
        for (let i = 0; i < img.length; i += 4 * 97) {
          if (img[i + 3] > 0) opaque += 1;
          colors.add((img[i] << 16) | (img[i + 1] << 8) | img[i + 2]);
          sum += img[i] + img[i + 1] + img[i + 2];
        }
        return { w: el.width, h: el.height, distinct: colors.size, opaque, sum };
      });
    const readOffice = () =>
      page.evaluate((sid) => {
        const rows = [...document.querySelectorAll('[data-office-worker]')];
        const canvasEl = document.querySelector('[data-office-canvas]');
        const empty = document.querySelector('[data-office-empty]');
        const mine = document.querySelector('[data-office-worker="run:' + sid + '"]');
        const tool = mine ? mine.querySelector('[data-office-tool]') : null;
        return {
          rows: rows.length,
          ids: rows.map((r) => r.getAttribute('data-office-worker')),
          canvasWorkers: canvasEl ? Number(canvasEl.getAttribute('data-office-canvas-workers')) : null,
          selected: canvasEl ? canvasEl.getAttribute('data-office-canvas-selected') : null,
          emptyVisible: Boolean(empty),
          mine: Boolean(mine),
          mineType: mine ? mine.getAttribute('data-office-worker-type') : null,
          tool: tool ? (tool.textContent || '').trim() : null,
        };
      }, sessionId);

    await sleep(1500);
    const shotA = await readCanvas();
    check(shotA !== null && shotA.distinct >= 12, 'the canvas is painted (distinct sampled colours ' + (shotA ? shotA.distinct : '?') + ' >= 12)');
    check(shotA !== null && shotA.opaque > 0, 'the canvas has opaque pixels (alpha-checked)');
    await sleep(1600);
    const shotB = await readCanvas();
    check(shotA !== null && shotB !== null && shotA.sum !== shotB.sum, 'the office is animated (fingerprint differs across 1.6s)');
    const fresh = await readOffice();
    check(fresh.canvasWorkers === fresh.rows, 'canvas worker counter == rendered rows before the run (' + fresh.canvasWorkers + ')');
    check(fresh.rows === 0 ? fresh.emptyVisible : !fresh.emptyVisible, 'rows and the honest empty state are mutually exclusive');

    // 3. NOW start the run (pane listening): the first step carries BOTH its
    // output-so-far text and the read_file call; the slow final answer lands
    // 30 s later, so the panel's "output so far" is provably the marker.
    script = [
      { text: OUTPUT_MARKER, toolCalls: [{ id: 'probe_read_1', name: 'read_file', args: { path: TOOL_FILE } }], delayMs: 5000 },
      { text: 'PROBE-DONE', delayMs: 30_000 },
    ];
    const frames = [];
    const ws = new WebSocket(WS_BASE + '/ws/' + sessionId + '?token=' + token);
    probeWs = ws;
    const runDone = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for run end')), RUN_TIMEOUT_MS);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'prompt', sessionId, model: MODEL, prompt: TASK_MARKER })));
      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        frames.push(msg);
        if (msg.type === 'done' || msg.type === 'error') {
          clearTimeout(timer);
          resolve(msg);
        }
      });
      ws.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    let office = null;
    for (let i = 0; i < 25; i++) {
      office = await readOffice();
      if (office.mine) break;
      await sleep(1000);
    }
    check(office.mine === true, 'the live run appears as a worker row (run:' + sessionId + ')');
    check(office.mineType === 'run', 'the row is typed as a run');
    check(office.canvasWorkers === office.rows, 'canvas worker counter == rendered rows with the run live (' + office.canvasWorkers + ')');

    // 4. tool badge — the stub's read_file lands ~5s in
    let tool = '';
    for (let i = 0; i < 25; i++) {
      office = await readOffice();
      tool = (office.tool || '').trim();
      if (tool.length > 0) break;
      await sleep(1000);
    }
    const frameTypes = [...new Set(frames.map((f) => f.type))];
    check(tool === 'read_file', 'the live tool badge shows the tool the run actually called (' + tool + '; frames: ' + frameTypes.join(',') + ')');

    // 5. click the boss on the floor -> selection. Real mouse clicks at
    // computed positions: the office layout is deterministic (boss seat at
    // logical 54,54; desks on a 40px grid from x=59, y=148), and a real click
    // is also what a user does — a synthetic dispatch proved unreliable here.
    const hitInfo = await (async () => {
      const rect = await page.evaluate(() => {
        const el = document.querySelector('[data-office-canvas]');
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, cw: el.width };
      });
      const scale = rect.cw / rect.width; // canvas px per css px (1 on desktop)
      // Logical office coordinates -> canvas pixels (S=2 here) -> css offsets.
      const S = 2;
      const points = [];
      for (let gx = 34; gx <= 74; gx += 8) for (let gy = 30; gy <= 74; gy += 8) points.push([gx * S, gy * S]);
      for (let c = 0; c < 9; c += 1) {
        const cx = (59 + c * 40) * S;
        for (const dy of [118, 130, 142, 150]) points.push([cx - 8, dy * S], [cx + 8, dy * S]);
      }
      let clicks = 0;
      const readSel = () =>
        page.evaluate(() => {
          const el = document.querySelector('[data-office-canvas]');
          return el ? el.getAttribute('data-office-canvas-selected') || '' : '';
        });
      for (const [x, y] of points) {
        await page.mouse.click(rect.left + x / scale, rect.top + y / scale);
        clicks += 1;
        const sel = await readSel();
        if (sel !== '') return { selected: sel, at: { x, y }, clicks };
        await sleep(40);
      }
      return { selected: await readSel(), at: null, clicks };
    })();
    office = await readOffice();
    const selected = hitInfo.selected || office.selected || '';
    check(hitInfo.at !== null, 'a real click on the floor hit a worker (first hit at ' + (hitInfo.at ? hitInfo.at.x + ',' + hitInfo.at.y : 'nowhere') + '; ' + hitInfo.clicks + ' clicks)');
    check(selected.length > 0 && office.ids.includes(selected), 'the selection is one of the rendered workers (' + selected + ')');
    const hint = await page.evaluate(() => {
      const el = document.querySelector('[data-office-canvas-hint]');
      return el ? (el.textContent || '').trim() : '';
    });
    check(selected.length > 0 && hint.length > 0 && hint.indexOf('Click a worker') === -1, 'the hint line names the selected worker (' + hint.slice(0, 40) + ')');
    const bossChip = await page.evaluate(
      (sid) => {
        const row = document.querySelector('[data-office-worker="run:' + sid + '"]');
        return row ? Boolean(row.querySelector('[data-office-boss]')) : false;
      },
      sessionId,
    );
    check(bossChip, 'the active session is drawn as the boss row (your own agent)');

    // 5b. REQ-204 slice 4 — the worker detail panel. The selected worker's
    // panel reads the REAL transcript: the task is the prompt the socket sent,
    // the tool rows are the persisted read_file call, and the output is
    // EXACTLY what the run has produced so far (the stub's marker — the final
    // answer has not arrived yet, so an invented one would be a wrong string).
    const detailRoot = await page.waitForSelector('[data-office-detail]', { timeout: 10_000 }).catch(() => null);
    check(detailRoot !== null, 'selecting a worker opens the detail panel');
    check(
      detailRoot !== null && (await detailRoot.getAttribute('data-office-detail')) === selected,
      'the panel belongs to the SELECTED worker',
    );
    check(
      detailRoot !== null && (await detailRoot.getAttribute('data-office-detail-type')) === 'run',
      'the panel is typed like its worker',
    );
    let panel = null;
    for (let i = 0; i < 20; i++) {
      panel = await page.evaluate(() => {
        const pick = (sel) => {
          const el = document.querySelector(sel);
          return el ? (el.textContent || '').trim() : '';
        };
        return {
          task: pick('[data-office-detail-task]'),
          tool: pick('[data-office-detail-tool]'),
          output: pick('[data-office-detail-output]'),
          rows: [...document.querySelectorAll('[data-office-detail-tool-row]')].map((r) => (r.textContent || '').trim()),
          loading: Boolean(document.querySelector('[data-office-detail-loading]')),
          error: pick('[data-office-detail-error]'),
        };
      });
      if (panel.task === TASK_MARKER && panel.rows.length > 0 && panel.output === OUTPUT_MARKER) break;
      await sleep(1000);
    }
    check(panel !== null && panel.task === TASK_MARKER, 'the panel task is the REAL prompt from the transcript (' + (panel ? panel.task : '?') + ')');
    check(panel !== null && panel.tool === 'read_file', 'the panel current tool is the live-fold tool (' + (panel ? panel.tool : '?') + ')');
    check(
      panel !== null && panel.rows.length > 0,
      'the panel tool list comes from the persisted transcript (' + (panel ? panel.rows.length : 0) + ' rows)',
    );
    check(
      panel !== null && panel.rows.some((r) => r.indexOf('Read ' + TOOL_FILE) !== -1),
      'the tool row names the REAL file the run read (' + TOOL_FILE + ')',
    );
    check(
      panel !== null && panel.output === OUTPUT_MARKER,
      'the panel output is what the run has produced SO FAR (' + (panel ? JSON.stringify(panel.output).slice(0, 60) : '?') + ')',
    );
    check(panel !== null && panel.error === '' && panel.loading === false, 'no error/loading line once the transcript is read');

    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: join(SHOTS, 'REQ-204-slice3-canvas.png') });
      await page.screenshot({ path: join(SHOTS, 'REQ-204-slice4-panel.png') });
    }

    // 6. run end -> the worker leaves
    const end = await runDone.catch((e) => ({ type: 'error', message: String(e && e.message) }));
    check(end && end.type === 'done', 'the run ended (' + (end && end.type) + ')');
    let left = office;
    for (let i = 0; i < 20; i++) {
      left = await readOffice();
      if (!left.mine) break;
      await sleep(1000);
    }
    check(left.mine === false, 'the finished run leaves the floor (worker row gone)');
    // Slice 4: the panel belongs to a WORKER — when the worker leaves, the
    // panel leaves with it instead of freezing a stale read on screen.
    const panelGone = await page.evaluate(() => !document.querySelector('[data-office-detail]'));
    check(panelGone, 'the detail panel left with the worker (no panel for a gone worker)');
    if (left.rows === 0) {
      check(left.emptyVisible === true, 'no workers -> the honest empty state is what remains');
    } else {
      check(left.emptyVisible === false, 'other workers still running -> no empty state (rows=' + left.rows + ')');
    }
    const after = await readCanvas();
    check(after !== null && after.distinct >= 12, 'the canvas still draws after the run left (idle office)');

    // 7. sub-600px pane -> the list fallback (split layout, same viewport)
    await page.evaluate((payload) => {
      localStorage.setItem('lokma:layout:v1', JSON.stringify(payload.NARROW.layout));
      localStorage.setItem('lokma:tiling-tabs:v1', JSON.stringify(payload.NARROW.tabs));
    }, { NARROW });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-office-pane]', { timeout: 25_000 });
    await sleep(2000);
    const narrow = await page.evaluate(() => {
      const pane = document.querySelector('[data-office-pane]');
      const paneBox = pane ? pane.getBoundingClientRect() : null;
      return {
        canvas: Boolean(document.querySelector('[data-office-canvas]')),
        pane: Boolean(pane),
        paneW: paneBox ? Math.round(paneBox.width) : 0,
        panes: document.querySelectorAll('[data-pane]').length,
        tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => (t.textContent || '').trim()).slice(0, 8),
        workers: Boolean(document.querySelector('[data-office-workers]')),
        scrollW: document.documentElement.scrollWidth,
      };
    });
    check(narrow.pane && narrow.workers, 'the sub-600px pane keeps the working list (pane ' + narrow.paneW + 'px, panes ' + narrow.panes + ')');
    check(narrow.canvas === false, 'the sub-600px pane drops the canvas (narrow fallback; pane ' + narrow.paneW + 'px, tabs ' + narrow.tabs.join('/') + ')');
    check(narrow.scrollW <= 1620, 'no sideways overflow in the split layout (' + narrow.scrollW + ')');
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'REQ-204-slice3-narrow.png') });

    // 8. phone width: the shell has no tiling there, but nothing may overflow
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(1200);
    const phone = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      canvas: Boolean(document.querySelector('[data-office-canvas]')),
    }));
    check(phone.scrollW <= 400, 'no sideways overflow at 390px (' + phone.scrollW + ' <= 400)');
    check(phone.canvas === false, 'no canvas at phone width');

    const err = consoleErrors.slice(0, 3);
    const bad = http404.slice(0, 4);
    check(
      consoleErrors.length === 0,
      'zero console errors during the probe (' +
        consoleErrors.length +
        (err.length ? ': ' + err.join(' | ').slice(0, 200) : '') +
        (bad.length ? ' :: HTTP ' + bad.join(' | ').slice(0, 240) : '') +
        ')',
    );
  } finally {
    try {
      if (probeWs) probeWs.close();
    } catch {
      /* ignore */
    }
    try {
      if (browser) await browser.close();
    } catch {
      /* ignore */
    }
    for (const s of createdSessions) {
      try {
        await fetch(API + '/api/sessions/' + s.id + '?cwd=' + encodeURIComponent(s.cwd), {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + token },
        });
      } catch {
        /* ignore */
      }
    }
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    if (providerReady) {
      try {
        await fetch(API + '/api/providers/' + PROBE_ID, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
      } catch {
        /* ignore */
      }
    }
    stub.close();

    let sessionsGone = true;
    try {
      for (const s of createdSessions) {
        const res = await fetch(API + '/api/sessions/' + s.id + '?cwd=' + encodeURIComponent(s.cwd), {
          headers: { Authorization: 'Bearer ' + token },
        });
        if (res.status !== 404 && res.status !== 204) sessionsGone = false;
      }
    } catch {
      sessionsGone = false;
    }
    check(sessionsGone, 'probe sessions deleted and stay gone');
    check(
      dirs.every((d) => !existsSync(d)),
      'probe temp dirs removed',
    );
    let providerGone = false;
    try {
      const pf = await fetch(API + '/api/providers', { headers: { Authorization: 'Bearer ' + token } });
      const body = await pf.json();
      providerGone = !((body && body.providers) || []).some((p) => p && p.id === PROBE_ID);
    } catch {
      providerGone = false;
    }
    check(providerGone, 'ephemeral provider removed');
    let gate = 0;
    try {
      const res = await fetch(API + '/api/auth/me');
      gate = res.status;
    } catch {
      gate = -1;
    }
    check(gate === 401, 'tokenless /api/auth/me is still 401 (gate ON)');
  }

  console.log('---');
  console.log(passed + ' checks passed, ' + failures.length + ' failed');
  if (failures.length > 0) {
    console.log('FAILED: ' + failures.join(' | '));
    process.exit(1);
  }
  // Explicit exit: an open socket/stub handle would otherwise keep the
  // process (and xvfb-run with it) alive after a green run.
  process.exit(0);
})().catch((e) => {
  console.error('probe crashed: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
