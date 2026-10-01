#!/usr/bin/env node
/**
 * REQ-182 live probe — "open project" is a real UI action, not just a tool.
 *
 * Drives the DEPLOYED web bundle (default http://127.0.0.1:3457) in a real
 * browser while a real agent run happens over the socket (server
 * http://127.0.0.1:3456). Two rounds, one per answer path:
 *
 *   Round A (cancel): the agent calls open_project -> the confirmation modal
 *     opens with the agent's locked values -> the probe dismisses it -> the
 *     tool result reads status 'cancelled', the record stays whole (it was
 *     created server-side before the frame), and NO session switch happens.
 *   Round B (done): same flow, but the probe presses "Open project" -> the
 *     tool result reads 'done', the modal closes, the sidebar reveals the
 *     project group, and the fresh session lands as the open one (REQ-145
 *     immediacy: the user clicks nothing extra).
 *
 * Also asserts the toast ("Agent opened project ..."), the transcript row
 * label ('Open project "<name>" at <cwd>'), the persisted record over the
 * API (name + cwd + the cwd really on disk), and cleans up after itself:
 * every record, session and temp dir is deleted and re-checked (bounded
 * re-check plus a second delete attempt) so the live state stays clean.
 *
 * Usage:
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node scripts/probe-open-project-ui.cjs
 *
 * Flags: --url <web-base> --server <api-base> --token <bearer> --model <id>
 * The token can also be minted on the fly (HOME=/root bun scripts/mint-e2e-token.mjs).
 */
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright-core');
const WebSocket = require('ws');

const NL = String.fromCharCode(10);

const readFlag = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const WEB = readFlag('url', 'http://127.0.0.1:3457');
const SERVER = readFlag('server', 'http://127.0.0.1:3456');
const MODEL = readFlag('model', 'commandcode/deepseek/deepseek-v4.1-flash');
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const RUN = Date.now().toString(36);
const NAME_A = 'req182-ui-cancel-' + RUN;
const NAME_B = 'req182-ui-done-' + RUN;

let TOKEN = readFlag('token', '');
let passed = 0;
const failures = [];

function check(cond, label, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS: ' + label);
  } else {
    failures.push(label);
    console.log('FAIL: ' + label + (detail ? '  - ' + detail : ''));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Structural search: does any node in the tree carry ALL needles? */
function deepHas(node, needles, depth) {
  const d = depth || 0;
  if (d > 14) return false;
  if (typeof node === 'string') return needles.every((n) => node.indexOf(n) !== -1);
  if (Array.isArray(node)) return node.some((x) => deepHas(x, needles, d + 1));
  if (node && typeof node === 'object') {
    return Object.keys(node).some((k) => deepHas(node[k], needles, d + 1));
  }
  return false;
}

function mintToken() {
  return execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
  })
    .trim()
    .split(NL)
    .pop();
}

async function api(path, opts) {
  const o = opts || {};
  const headers = { Authorization: 'Bearer ' + TOKEN };
  if (o.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(SERVER + path, {
    method: o.method || 'GET',
    headers: headers,
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = null;
  }
  return { status: res.status, json: json, text: text };
}

(async () => {
  if (!TOKEN) TOKEN = mintToken();

  const sessionCwd = mkdtempSync(join(tmpdir(), 'lokma-req182-sess-'));
  const projectRoot = mkdtempSync(join(tmpdir(), 'lokma-req182-root-'));
  const cwdA = join(projectRoot, 'nested-a', NAME_A);
  const cwdB = join(projectRoot, 'nested-b', NAME_B);
  console.log('session cwd: ' + sessionCwd);
  console.log('project cwd A: ' + cwdA);
  console.log('project cwd B: ' + cwdB);

  const created = await api('/api/sessions', { method: 'POST', body: { cwd: sessionCwd, model: MODEL } });
  check(created.status === 200 || created.status === 201, 'probe session created over REST (HTTP ' + created.status + ')');
  const SESSION = (created.json || {}).id || (created.json || {}).sessionId;
  if (!SESSION) {
    console.log('cannot proceed without a session id');
    process.exit(1);
  }
  console.log('sessionId: ' + SESSION);

  const frames = [];
  let runEnded = null;
  let endWaiter = null;
  const ws = new WebSocket('ws://127.0.0.1:3456/ws/' + SESSION + '?token=' + TOKEN);
  ws.on('message', (raw) => {
    let msg = null;
    try {
      msg = JSON.parse(String(raw));
    } catch (e) {
      return;
    }
    frames.push(msg);
    if (msg.type === 'permission_request') {
      ws.send(JSON.stringify({ type: 'permission_response', requestId: msg.requestId, decision: 'allow' }));
    }
    if (msg.type === 'done' || msg.type === 'run_end' || msg.type === 'error') {
      runEnded = msg;
      if (endWaiter) endWaiter(msg);
    }
  });
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
    setTimeout(() => reject(new Error('ws connect timeout')), 10000);
  });

  function waitEnd(timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        endWaiter = null;
        reject(new Error('timeout waiting for the run to end'));
      }, timeoutMs);
      endWaiter = (msg) => {
        clearTimeout(timer);
        endWaiter = null;
        resolve(msg);
      };
    });
  }

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((arg) => {
    try {
      localStorage.setItem('lokma-token', arg.token);
      localStorage.setItem('lokma:sessionId', arg.sessionId);
    } catch (e) {
      /* ignore */
    }
  }, { token: TOKEN, sessionId: SESSION });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push('console: ' + m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => pageErrors.push('pageerror: ' + String(e).slice(0, 160)));
  // REQ-182: the modal must NEVER re-POST the project — the single write
  // path is the server-side tool. Count any POST /api/projects on the wire,
  // plus the REST GETs that carry a transcript fetch (diagnostics for the
  // landing check).
  const projectPosts = [];
  const sessionGets = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().indexOf('/api/projects') !== -1) projectPosts.push(req.url());
    if (req.method() === 'GET' && req.url().indexOf('/api/sessions/') !== -1) sessionGets.push(req.url());
  });

  // ---- page-side readers (one arg per evaluate — closure does not cross) ----
  const sampleUi = (arg) =>
    page.evaluate((a) => {
      const txt = document.body.innerText || '';
      const d = document.querySelector('div[role="dialog"][aria-label="Open project"]');
      let snap = null;
      if (d) {
        const nameEl = d.querySelector('#project-name');
        const cwdEl = d.querySelector('#project-cwd');
        const banner = d.querySelector('[data-agent-open-banner]');
        const closeBtn = d.querySelector('button[aria-label="Dismiss the agent-opened project"]');
        const btnLabels = [];
        Array.prototype.forEach.call(d.querySelectorAll('button'), (b) => {
          const t = (b.textContent || '').trim();
          if (t) btnLabels.push(t);
        });
        snap = {
          open: true,
          name: nameEl ? nameEl.value : null,
          nameReadOnly: nameEl ? nameEl.readOnly === true : null,
          cwd: cwdEl ? cwdEl.value : null,
          cwdReadOnly: cwdEl ? cwdEl.readOnly === true : null,
          banner: banner ? (banner.textContent || '').trim() : null,
          closeLabel: closeBtn ? closeBtn.getAttribute('aria-label') : null,
          btnLabels: btnLabels,
        };
      }
      return {
        toast: txt.indexOf('Agent opened project') !== -1,
        toolRow: txt.indexOf('Open project "' + a.name + '" at ' + a.cwd) !== -1,
        toolRowName: txt.indexOf('Open project "' + a.name + '"') !== -1,
        modal: snap,
      };
    }, arg);

  const modalOpen = () =>
    page.evaluate(() => Boolean(document.querySelector('div[role="dialog"][aria-label="Open project"]')));

  const clickModalButton = (label) =>
    page.evaluate((wanted) => {
      const d = document.querySelector('div[role="dialog"][aria-label="Open project"]');
      if (!d) return false;
      const btns = Array.prototype.slice.call(d.querySelectorAll('button'));
      for (let i = 0; i < btns.length; i += 1) {
        if ((btns[i].textContent || '').trim() === wanted) {
          btns[i].click();
          return true;
        }
      }
      return false;
    }, label);

  const clickDismiss = () =>
    page.evaluate(() => {
      const b = document.querySelector('button[aria-label="Dismiss the agent-opened project"]');
      if (!b) return false;
      b.click();
      return true;
    });

  const sampleLanding = (arg) =>
    page.evaluate((a) => {
      const txt = document.body.innerText || '';
      // The chat pane header renders the ACTIVE session id in a mono span —
      // the single most direct "which session is open" signal.
      const mono = Array.prototype.slice
        .call(document.querySelectorAll('span.font-mono'))
        .map((s) => (s.textContent || '').trim())
        .filter((t) => t.indexOf('sess_') === 0);
      const expanded = Array.prototype.slice.call(document.querySelectorAll('button[aria-expanded="true"]'));
      const groupExpanded = expanded.some((b) => (b.textContent || '').indexOf(a.name) !== -1);
      const titled = Array.prototype.slice.call(document.querySelectorAll('[title]'));
      const rowEl = titled.find((el) => (el.getAttribute('title') || '').indexOf(a.id) !== -1) || null;
      const dot = rowEl ? rowEl.querySelector('span[title]') : null;
      // The marker row renders through the inline markdown pass, which
      // currently consumes intraword underscore pairs (sess_x_y -> sessxy).
      // Accept either form so the check survives a future CommonMark fix.
      const flatId = a.id.split('_').join('');
      const chatMarker =
        txt.indexOf('Session ' + a.id + ' created') !== -1 || txt.indexOf('Session ' + flatId + ' created') !== -1;
      return {
        chatHeader: mono,
        switched: mono.indexOf(a.id) !== -1,
        groupExpanded: groupExpanded,
        rowSeen: Boolean(rowEl),
        dotTitle: dot ? dot.getAttribute('title') : null,
        chatMarker: chatMarker,
      };
    }, arg);

  const promptFor = (name, cwd) =>
    'Bir workspace projesi aç. open_project aracını kullan. ' +
    'Parametreler: name="' + name + '", cwd="' + cwd + '". ' +
    'Başka HİÇBİR araç kullanma (glob, grep, read_file, write_file YOK). ' +
    'Son yanıtında dönen projectId değerini yaz.';

  /** One full agent round: prompt -> modal -> answer -> run end. */
  async function round(arg, answer) {
    const sliceStart = frames.length;
    runEnded = null;
    const endP = waitEnd(300000);
    ws.send(JSON.stringify({ type: 'prompt', sessionId: SESSION, model: MODEL, prompt: promptFor(arg.name, arg.cwd) }));
    const acc = { toast: false, toolRow: false, toolRowName: false, snap: null, timedOut: true };
    const start = Date.now();
    while (Date.now() - start < 200000) {
      if (runEnded) break;
      const s = await sampleUi({ name: arg.name, cwd: arg.cwd });
      if (s.toast) acc.toast = true;
      if (s.toolRow) acc.toolRow = true;
      if (s.toolRowName) acc.toolRowName = true;
      if (s.modal) {
        acc.snap = s.modal;
        acc.timedOut = false;
        break;
      }
      await sleep(350);
    }
    let clicked = false;
    let closed = false;
    if (acc.snap) {
      try {
        await page.screenshot({ path: arg.shot });
        console.log('screenshot: ' + arg.shot);
      } catch (e) {
        console.log('screenshot failed: ' + String(e).slice(0, 120));
      }
      clicked = answer === 'done' ? await clickModalButton('Open project') : await clickDismiss();
      const closedStart = Date.now();
      while (Date.now() - closedStart < 15000) {
        if (!(await modalOpen())) {
          closed = true;
          break;
        }
        await sleep(250);
      }
    }
    let endMsg = runEnded;
    if (!endMsg) {
      try {
        endMsg = await endP;
      } catch (e) {
        endMsg = null;
      }
    }
    const slice = frames.slice(sliceStart);
    const uiFrame = slice.find((m) => m && m.type === 'ui_action' && m.action === 'open_project') || null;
    return { acc: acc, clicked: clicked, closed: closed, endMsg: endMsg, slice: slice, uiFrame: uiFrame };
  }

  // ---- cleanup bookkeeping -------------------------------------------------
  const cleanupState = { projectIds: [], sessionIds: [SESSION], cwdDirs: [sessionCwd, projectRoot] };

  async function listHas(list, key, id) {
    return (list || []).some((x) => x.id === id);
  }
  async function projectsGone(id) {
    const r = await api('/api/projects');
    return !(await listHas((r.json || {}).projects, 'id', id));
  }
  async function sessionGone(id) {
    const r = await api('/api/sessions');
    return !(await listHas((r.json || {}).sessions, 'id', id));
  }

  async function cleanup() {
    for (const id of cleanupState.projectIds) {
      if (!id) continue;
      await api('/api/projects/' + id, { method: 'DELETE' }).catch(() => null);
      let gone = false;
      for (let i = 0; i < 15; i += 1) {
        gone = await projectsGone(id).catch(() => false);
        if (gone) break;
        await sleep(300);
      }
      // Second delete attempt: the re-check must survive it (idempotent).
      await api('/api/projects/' + id, { method: 'DELETE' }).catch(() => null);
      const stillGone = await projectsGone(id).catch(() => false);
      check(gone && stillGone, 'cleanup: project ' + id + ' stays gone', gone ? '' : 'still listed');
    }
    for (const id of cleanupState.sessionIds) {
      if (!id) continue;
      await api('/api/sessions/' + id, { method: 'DELETE' }).catch(() => null);
      let gone = false;
      for (let i = 0; i < 15; i += 1) {
        gone = await sessionGone(id).catch(() => false);
        if (gone) break;
        await sleep(300);
      }
      await api('/api/sessions/' + id, { method: 'DELETE' }).catch(() => null);
      const stillGone = await sessionGone(id).catch(() => false);
      check(gone && stillGone, 'cleanup: session ' + id + ' stays gone', gone ? '' : 'still listed');
    }
    for (const dir of cleanupState.cwdDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch (e) {
        /* ignore */
      }
    }
    check(!existsSync(projectRoot) && !existsSync(sessionCwd), 'cleanup: temp dirs removed');
  }

  try {
    // ---- boot the web app on the probe session --------------------------
    await page.goto(WEB + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('nav[aria-label="Inspector rail"]', { timeout: 25000 });
    check(true, 'web app boots with the shell (minted token accepted)');
    const composer = await page
      .waitForSelector('textarea[aria-label="Message Lokma"]', { timeout: 20000 })
      .catch(() => null);
    check(Boolean(composer), 'chat composer is present on the probe session');
    // Group the sidebar by project first: the Projects section — and with it
    // any project group's expansion (REQ-142) — renders in this mode only.
    // The landing phase asserts the revealed group here.
    const toggled = await page.evaluate(() => {
      const b = document.querySelector('button[aria-label="Group by project"]');
      if (!b) return false;
      b.click();
      return true;
    });
    check(toggled, 'sidebar project-group mode toggle found');
    const byProject = await page
      .waitForSelector('button[aria-label="Group by day"]', { timeout: 8000 })
      .catch(() => null);
    check(Boolean(byProject), 'sidebar renders project groups (By project mode on)');
    await sleep(2500); // let the WS attach before the run starts

    // ---- Round A: the CANCELLED answer -----------------------------------
    const A = await round({ name: NAME_A, cwd: cwdA, shot: '/tmp/req182-modal-cancel.png' }, 'cancelled');
    check(Boolean(A.uiFrame), 'round A: ui_action open_project frame arrives');
    const aProjectId = A.uiFrame ? A.uiFrame.projectId : null;
    const aTargetId = A.uiFrame ? A.uiFrame.targetSessionId : null;
    if (aProjectId) cleanupState.projectIds.push(aProjectId);
    if (aTargetId) cleanupState.sessionIds.push(aTargetId);
    check(Boolean(A.acc.snap), 'round A: confirmation modal opens on the agent frame', A.acc.timedOut ? 'modal never appeared' : '');
    if (A.acc.snap) {
      const s = A.acc.snap;
      check(s.name === NAME_A && s.nameReadOnly === true, 'round A: name seeded + locked', 'name=' + s.name + ' readOnly=' + s.nameReadOnly);
      check(s.cwd === cwdA && s.cwdReadOnly === true, 'round A: cwd seeded + locked', 'cwd=' + s.cwd + ' readOnly=' + s.cwdReadOnly);
      check(Boolean(s.banner && s.banner.indexOf('Agent is opening this project') !== -1), 'round A: banner says who is opening', s.banner || 'no banner');
      check(s.closeLabel === 'Dismiss the agent-opened project', 'round A: dismissal button is named', String(s.closeLabel));
      check(s.btnLabels.indexOf('Open project') !== -1, 'round A: footer confirms with "Open project"', s.btnLabels.join(' | '));
    }
    check(A.acc.toast, 'round A: toast "Agent opened project" seen');
    check(A.acc.toolRow || A.acc.toolRowName, 'round A: transcript row "Open project \\"<name>\\" at <cwd>" seen', 'toolRow=' + A.acc.toolRow);
    check(A.clicked, 'round A: dismiss click lands');
    check(A.closed, 'round A: modal closes after the answer');
    check(Boolean(A.endMsg), 'round A: run ends after the answer', A.endMsg ? String(A.endMsg.type) : 'run end timeout');
    check(
      aProjectId ? deepHas(A.slice, [aProjectId, 'cancelled']) : false,
      'round A: tool result carries status cancelled for the record',
    );
    let recA = null;
    if (aProjectId) {
      const r = await api('/api/projects/' + aProjectId);
      recA = (r.json || {}).project || r.json || null;
      const okRec = Boolean(recA && recA.cwd === cwdA && recA.name === NAME_A);
      check(okRec, 'round A: record whole after cancel (name+cwd over the API)', recA ? 'name=' + recA.name : 'not found');
    }
    check(existsSync(cwdA), 'round A: the cwd exists on disk (created before the frame)');
    // Cancel only acks (planProjectAnswer): the chat must NOT switch to the
    // project's session — nothing about a dismissal reveals or navigates.
    let switchedOnCancel = false;
    if (aTargetId) {
      for (let i = 0; i < 4; i += 1) {
        const s = await sampleLanding({ name: NAME_A, id: aTargetId });
        if (s.switched) switchedOnCancel = true;
        await sleep(400);
      }
    }
    check(Boolean(aTargetId) && !switchedOnCancel, 'round A: cancelled answer does not switch sessions');

    // ---- Round B: the CONFIRMED answer -----------------------------------
    const B = await round({ name: NAME_B, cwd: cwdB, shot: '/tmp/req182-modal-done.png' }, 'done');
    check(Boolean(B.uiFrame), 'round B: ui_action open_project frame arrives');
    const bProjectId = B.uiFrame ? B.uiFrame.projectId : null;
    const bTargetId = B.uiFrame ? B.uiFrame.targetSessionId : null;
    if (bProjectId) cleanupState.projectIds.push(bProjectId);
    if (bTargetId) cleanupState.sessionIds.push(bTargetId);
    check(Boolean(B.acc.snap), 'round B: confirmation modal opens', B.acc.timedOut ? 'modal never appeared' : '');
    if (B.acc.snap) {
      const s = B.acc.snap;
      check(s.name === NAME_B && s.nameReadOnly === true && s.cwd === cwdB, 'round B: values seeded + locked');
    }
    check(B.acc.toast, 'round B: toast "Agent opened project" seen');
    check(B.clicked, 'round B: "Open project" click lands');
    check(B.closed, 'round B: modal closes after Open');
    check(Boolean(B.endMsg), 'round B: run ends', B.endMsg ? String(B.endMsg.type) : 'run end timeout');
    check(
      bProjectId ? deepHas(B.slice, [bProjectId, 'done']) : false,
      'round B: tool result carries status done for the record',
    );
    if (bProjectId) {
      const r = await api('/api/projects/' + bProjectId);
      const recB = (r.json || {}).project || r.json || null;
      check(Boolean(recB && recB.cwd === cwdB && recB.name === NAME_B), 'round B: record persisted (name+cwd over the API)');
    }
    check(existsSync(cwdB), 'round B: the cwd exists on disk');

    // REQ-145 immediacy: reveal the group, land in the fresh session.
    const landing = { switched: false, groupExpanded: false, rowSeen: false, chatMarker: false, dotOpen: false, last: null };
    if (bTargetId) {
      const start = Date.now();
      while (Date.now() - start < 30000) {
        const s = await sampleLanding({ name: NAME_B, id: bTargetId });
        landing.last = s;
        landing.switched = landing.switched || s.switched;
        landing.groupExpanded = landing.groupExpanded || s.groupExpanded;
        landing.rowSeen = landing.rowSeen || s.rowSeen;
        landing.chatMarker = landing.chatMarker || s.chatMarker;
        landing.dotOpen = landing.dotOpen || s.dotTitle === 'Open session';
        if (landing.switched && landing.groupExpanded && landing.chatMarker) break;
        await sleep(400);
      }
    }
    console.log('landing sample: ' + JSON.stringify(landing.last));
    console.log(
      'transcript GETs: ' +
        sessionGets.filter((u) => u.indexOf(bTargetId || 'no-target') !== -1).length +
        ' for the target / ' +
        sessionGets.length +
        ' total',
    );
    check(landing.switched, 'landing: the chat switches to the fresh session (header id)', landing.last ? JSON.stringify(landing.last.chatHeader) : 'no sample');
    check(landing.groupExpanded, 'landing: the project group is revealed (expanded) in the sidebar');
    check(landing.rowSeen, 'landing: the fresh session row is visible');
    check(landing.chatMarker, 'landing: the chat shows the fresh session ("Session <id> created")');
    console.log('landing dot title: ' + String(landing.last ? landing.last.dotTitle : null));
    check(projectPosts.length === 0, 'the modal never re-POSTs the project (single write path)', projectPosts.join(' | '));

    // ---- cleanup ----------------------------------------------------------
    await cleanup();
    const jsErrors = pageErrors.filter((e) => e.indexOf('Failed to load resource') === -1);
    check(jsErrors.length === 0, 'no JavaScript errors on the page', jsErrors.slice(0, 2).join(' | ') || 'clean');
  } catch (e) {
    console.error('probe crashed: ' + String(e));
    failures.push('probe crash');
    try {
      await cleanup();
    } catch (e2) {
      console.error('cleanup also failed: ' + String(e2));
    }
  } finally {
    try {
      ws.close();
    } catch (e) {
      /* ignore */
    }
    await browser.close().catch(() => null);
  }

  console.log('');
  if (failures.length) {
    console.log('probe-open-project-ui: ' + failures.length + ' failure(s) / ' + passed + ' passed');
    failures.forEach((f) => console.log('  FAIL: ' + f));
    process.exit(1);
  }
  console.log('probe-open-project-ui: all ' + passed + ' checks passed.');
  process.exit(0);
})();
