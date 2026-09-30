#!/usr/bin/env node
/**
 * REQ-176 live probe — a markdown table in an assistant answer must render as
 * a real <table>: header/body cells, per-column alignment from the delimiter
 * row, inline markup inside cells (bold/code), escaped pipes kept inside a
 * cell, while a pipe-bearing prose line stays prose. Streamed answers must
 * not crash while the table is half-arrived, and the table must survive a
 * reload (persisted transcript path). At 390px the page must not overflow.
 *
 * Run:
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node scripts/probe-markdown-table.cjs
 *
 * No billed upstream is touched: a loopback stub answers the run, the probe
 * session is pointed at it, and everything the probe creates is deleted and
 * re-checked before exit.
 */
const http = require('node:http');
const { chromium } = require('playwright-core');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { homedir, tmpdir } = require('node:os');
const { join } = require('node:path');

const BASE = 'http://127.0.0.1:3456';
const UI_BASE = 'http://127.0.0.1:3457';
const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const PROVIDER_ID = 'tableprobe';
const STUB_MODEL = 'stub-table';
const MODEL_REF = PROVIDER_ID + '/' + STUB_MODEL;
const BS = String.fromCharCode(92); // backslash byte, edit-layer safe
const BT = String.fromCharCode(96); // backtick byte, edit-layer safe

let passed = 0;
function check(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

const cleanupIssues = [];
function soft(cond, label) {
  if (cond) {
    console.log('CHECK: ' + label);
  } else {
    cleanupIssues.push(label);
    console.log('CLEANUP-WARN: ' + label);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The stub's assistant answer: a 4-column table (left/center/right/default
 * alignment), inline markup in cells, an escaped pipe, and a pipe-bearing
 * prose line that must NOT become a table.
 */
function stubAnswer() {
  return [
    '## Karşılaştırma',
    '',
    '| Katman | Ne çıktı | Sayı | Not |',
    '|:---|:---:|---:|---|',
    '| **UI** | ' + BT + 'renderInline' + BT + ' | 3 | hazır |',
    '| API | SSE akışı | 12 | a ' + BS + '| b |',
    '',
    'fiyat | fayda satırı delimiter olmadan prose kalır',
    '',
  ].join('\n');
}

/** Loopback stub: answers any POST with one SSE line per answer line. */
function listenStub() {
  const captured = [];
  const lines = stubAnswer().split('\n');
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', async () => {
      let body = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
      captured.push({ path: req.url || '', body });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      for (let i = 0; i < lines.length; i++) {
        const chunk = lines[i] + (i < lines.length - 1 ? '\n' : '');
        res.write(
          'data: ' + JSON.stringify({ id: 'stub-1', choices: [{ delta: { content: chunk }, finish_reason: null }] }) + '\n\n',
        );
        await sleep(90); // keep the stream window real so the live path renders mid-table
      }
      res.write(
        'data: ' +
          JSON.stringify({ id: 'stub-1', choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 40 } }) +
          '\n\n',
      );
      res.end('data: [DONE]\n\n');
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, captured, base: 'http://127.0.0.1:' + addr.port });
    });
  });
}

/** Small authed fetch helper (body-less calls avoid a JSON content-type). */
async function req(token, method, path, body) {
  const headers = { Authorization: 'Bearer ' + token };
  const init = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return fetch(BASE + path, init);
}

/** Mirror of lokma-core SessionStore project dir naming (cleanup target). */
function projectDirFor(cwd) {
  const h = createHash('sha1').update(cwd).digest('hex').slice(0, 8);
  const safe = cwd.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40);
  return join(homedir(), '.lokma', 'projects', safe + '-' + h);
}

/** One DOM snapshot per call (page.evaluate takes a single arg). */
async function readTable(page) {
  return page.evaluate(() => {
    const tables = Array.prototype.slice.call(document.querySelectorAll('table'));
    const t = tables[tables.length - 1];
    if (!t) return { found: false, tables: tables.length };
    const ths = Array.prototype.slice.call(t.querySelectorAll('thead th'));
    const trs = Array.prototype.slice.call(t.querySelectorAll('tbody tr'));
    const wrapper = t.parentElement;
    const cs = wrapper ? getComputedStyle(wrapper) : null;
    const rect = wrapper ? wrapper.getBoundingClientRect() : null;
    return {
      found: true,
      tables: tables.length,
      headers: ths.map((el) => (el.textContent || '').trim()),
      aligns: ths.map((el) => getComputedStyle(el).textAlign),
      rows: trs.length,
      cells: trs.map((tr) =>
        Array.prototype.slice.call(tr.querySelectorAll('td')).map((td) => (td.textContent || '').trim()),
      ),
      hasStrong: Boolean(t.querySelector('strong')),
      hasCode: Boolean(t.querySelector('code')),
      wrapperOverflowX: cs ? cs.overflowX : '',
      wrapperInViewport: rect ? rect.left >= -1 && rect.right <= window.innerWidth + 1 : false,
      pageOverflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      text: document.body.innerText || '',
    };
  });
}

(async () => {
  const token = execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .pop();
  check(typeof token === 'string' && token.length > 20, 'e2e token minted');

  const stub = await listenStub();
  let sessionId = '';
  let providerCreated = false;
  let cwd = '';
  const baseline = await (await req(token, 'GET', '/api/providers')).json();
  const beforeIds = (baseline.providers || [])
    .map((p) => p.id)
    .filter((id) => id !== PROVIDER_ID)
    .sort();

  try {
    // 0. Leftovers from a crashed earlier run never block this one.
    const leftover = (baseline.providers || []).find((p) => p.id === PROVIDER_ID);
    if (leftover) await req(token, 'DELETE', '/api/providers/' + PROVIDER_ID);

    const created = await req(token, 'POST', '/api/providers', {
      id: PROVIDER_ID,
      name: 'Table Probe (temp)',
      baseUrl: stub.base + '/v1',
    });
    const createdBody = await created.json();
    check(
      (created.status === 200 || created.status === 201) && createdBody.ok === true,
      'temp provider created (HTTP ' + created.status + ')',
    );
    providerCreated = true;

    cwd = mkdtempSync(join(tmpdir(), 'lokma-tableprobe-'));
    writeFileSync(join(cwd, 'note.txt'), 'probe workspace\n');
    const createdSession = await req(token, 'POST', '/api/sessions', { cwd });
    const session = await createdSession.json();
    sessionId = session.id || session.sessionId;
    check(typeof sessionId === 'string' && sessionId.length > 0, 'session created');
    const patched = await req(token, 'PATCH', '/api/sessions/' + sessionId, { model: MODEL_REF });
    check(patched.status === 200, 'session model pointed at the stub (HTTP ' + patched.status + ')');

    const browser = await chromium.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      // Seed the composer's model key TOO: with an empty key the client's
      // default-model chain (REQ-104) re-points the run at the configured
      // upstream, so the session PATCH alone is a race — this pin makes the
      // stub deterministic (learned the hard way: a first probe run answered
      // from a real, billed model).
      await context.addInitScript(
        ([t, sid, m]) => {
          localStorage.setItem('lokma-token', t);
          localStorage.setItem('lokma:sessionId', sid);
          localStorage.setItem('lokma-model', m);
        },
        [token, sessionId, MODEL_REF],
      );
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
      const composer = 'textarea[aria-label="Message Lokma"]';
      await page.goto(UI_BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(composer, { timeout: 30000 });
      await sleep(2000);

      // Drive the run like a user; the stub ignores the prompt text.
      await page.fill(composer, 'Tabloyu göster ' + Date.now());
      await page.press(composer, 'Enter');

      // Fail fast + diagnosable: the typed run must reach OUR stub before any
      // DOM assertion (a chain re-point or a dead socket would otherwise read
      // as a rendering bug).
      const stubDeadline = Date.now() + 45000;
      while (stub.captured.length < 1 && Date.now() < stubDeadline) await sleep(250);
      check(stub.captured.length >= 1, 'the typed run reached the loopback stub (' + stub.captured.length + ' request(s))');
      check(
        (stub.captured[0] || {}).path === '/v1/chat/completions',
        'answer came over the chat-completions path (got ' + ((stub.captured[0] || {}).path || '') + ')',
      );

      await page.waitForFunction(() => document.querySelectorAll('table').length >= 1, null, { timeout: 60000 });
      let sawUser = false;
      let rowTexts = [];
      const userDeadline = Date.now() + 15000;
      while (!sawUser && Date.now() < userDeadline) {
        rowTexts = await page.evaluate(() =>
          Array.prototype.slice.call(document.querySelectorAll('[id^="chat-msg-"]')).map((r) =>
            (r.innerText || '').slice(0, 90).replace(/\n/g, ' | '),
          ),
        );
        sawUser = rowTexts.some((t) => t.indexOf('Tabloyu') >= 0);
        if (!sawUser) await sleep(400);
      }
      if (!sawUser) console.log('ROWS: ' + JSON.stringify(rowTexts));
      check(sawUser, 'the prompt row renders in the chat');
      await page.waitForFunction(
        () => {
          const ts = document.querySelectorAll('table');
          if (!ts.length) return false;
          return ts[ts.length - 1].querySelectorAll('tbody tr').length >= 2;
        },
        null,
        { timeout: 30000 },
      );
      await sleep(1500); // let the run settle (cost frame + persistence)

      const read = await readTable(page);
      check(read.found && read.tables === 1, 'exactly one rendered table (got ' + read.tables + ')');
      check(
        JSON.stringify(read.headers) === JSON.stringify(['Katman', 'Ne çıktı', 'Sayı', 'Not']),
        'header cells render in order (got ' + read.headers.join(' / ') + ')',
      );
      check(
        JSON.stringify(read.aligns) === JSON.stringify(['left', 'center', 'right', 'left']),
        'per-column alignment from the delimiter row (got ' + read.aligns.join(',') + ')',
      );
      check(read.rows === 2, 'body rows rendered (got ' + read.rows + ')');
      check(read.cells[0][0] === 'UI' && read.hasStrong, 'bold cell renders as markup, not asterisks');
      check(read.cells[0][1] === 'renderInline' && read.hasCode, 'inline code cell renders as code');
      check(read.cells[1][3] === 'a | b', 'escaped pipe stays inside the cell (got "' + read.cells[1][3] + '")');
      check(
        read.text.indexOf('|---') < 0 && read.text.indexOf('|:--') < 0 && read.text.indexOf('---|') < 0,
        'no raw delimiter text on screen',
      );
      check(read.text.indexOf('fiyat | fayda') >= 0, 'pipe-bearing prose line stays prose');
      check(
        read.wrapperOverflowX === 'auto' || read.wrapperOverflowX === 'scroll',
        'table sits in an overflow-x wrapper (got ' + read.wrapperOverflowX + ')',
      );
      check(read.wrapperInViewport, 'table wrapper fits the 1280px viewport');
      check(pageErrors.length === 0, 'no uncaught page errors during the streamed table (got ' + pageErrors.length + ')');
      console.log('RAW headers: ' + read.headers.join(' | '));
      console.log('RAW row2: ' + JSON.stringify(read.cells[1]));

      // Evidence shot — best-effort only (this box's chromium occasionally
      // refuses CDP screenshots; the probe must never fail on it).
      try {
        await page.screenshot({ path: join(__dirname, '..', 'Docs', 'refactor', 'assets', 'REQ-176-ss2-after-table.png') });
        console.log('shot: REQ-176-ss2-after-table.png');
      } catch (shotErr) {
        console.log('shot skipped: ' + shotErr.message);
      }

      // Persisted path: reload → the table must come back from the transcript.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelectorAll('table').length >= 1, null, { timeout: 30000 });
      const read2 = await readTable(page);
      check(read2.found && read2.headers.length === 4 && read2.rows === 2, 'table survives a reload (persisted transcript path)');

      // Narrow viewport — the page must not overflow sideways.
      await page.setViewportSize({ width: 390, height: 844 });
      await sleep(700);
      const narrow = await readTable(page);
      check(narrow.pageOverflow <= 2, 'no horizontal page overflow at 390px (delta ' + narrow.pageOverflow + 'px)');
      check(narrow.wrapperInViewport, 'table wrapper stays inside the 390px viewport');
      try {
        await page.screenshot({ path: join(__dirname, '..', 'Docs', 'refactor', 'assets', 'REQ-176-ss3-mobile-390.png') });
        console.log('shot: REQ-176-ss3-mobile-390.png');
      } catch (shotErr) {
        console.log('shot skipped (narrow): ' + shotErr.message);
      }
    } finally {
      await browser.close();
    }
  } finally {
    try {
      if (sessionId) {
        const del = await req(token, 'DELETE', '/api/sessions/' + sessionId);
        soft(del.status === 200, 'probe session deleted (HTTP ' + del.status + ')');
      }
      if (providerCreated) {
        const delP = await req(token, 'DELETE', '/api/providers/' + PROVIDER_ID);
        soft(delP.status === 200, 'temp provider deleted (HTTP ' + delP.status + ')');
      }
      const after = await (await req(token, 'GET', '/api/providers')).json();
      const afterIds = (after.providers || []).map((p) => p.id).sort();
      soft(JSON.stringify(afterIds) === JSON.stringify(beforeIds), 'provider registry restored (' + afterIds.length + ' providers)');
      if (cwd) {
        if (sessionId) {
          const dir = projectDirFor(cwd);
          rmSync(dir, { recursive: true, force: true });
          soft(!existsSync(dir), 'probe project dir removed');
        }
        rmSync(cwd, { recursive: true, force: true });
        soft(!existsSync(cwd), 'probe temp cwd removed');
      }
    } catch (cleanupErr) {
      cleanupIssues.push('cleanup threw: ' + cleanupErr.message);
      console.log('CLEANUP-WARN: ' + cleanupErr.message);
    }
    stub.server.close();
  }

  if (cleanupIssues.length > 0) {
    console.error('PROBE FAILED: cleanup incomplete — ' + cleanupIssues.join('; '));
    process.exit(1);
  }
  console.log('markdown table probe: ' + passed + ' checks passed');
  process.exit(0);
})().catch((err) => {
  console.error('PROBE FAILED: ' + err.message);
  if (cleanupIssues.length > 0) console.error('cleanup issues: ' + cleanupIssues.join('; '));
  process.exit(1);
});
