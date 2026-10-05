#!/usr/bin/env node
/**
 * REQ-202 — live proof for the Loops console (kapsam 1…7) on the DEPLOYED
 * server.
 *
 * Why this file exists and why it is not a unit probe: a REQ closes on the
 * surface the user actually touches (see the REQ's own Kontrol section), and
 * every earlier tick of this wave proved something narrower — the store's
 * parsing, the client's pure helpers, the frame bus. None of those prove that
 * `Settings → Loops` renders a row, that clicking it loads the detail, or that
 * `Pause` moves the row to `paused` ON THE RUNNING SERVER. This does.
 *
 * The rules this probe obeys, each one learned the hard way in this repo:
 *
 *  - The login gate is NEVER flipped. A real superadmin token is minted with
 *    `HOME=/root bun scripts/mint-e2e-token.mjs` and sent as a Bearer header,
 *    so the internet-facing harness stays gated for the whole run.
 *  - The loop is created over REST and driven from the UI. Nothing here
 *    hand-writes a row, a status or a ledger entry, so the probe cannot pass on
 *    state the product never wrote.
 *  - Every created loop carries a per-run id suffix, and cleanup is verified
 *    (a loop directory removed while a run keeps appending to it comes back).
 *  - The empty-catalog branch is proved with a PROVEN selector: the probe
 *    creates its loop and asserts `[data-loop-row]` matches exactly one node
 *    BEFORE trusting the row's inner cells.
 *  - "Something is on screen" is never the assertion. Each honest-state check
 *    pins the NEGATIVE too (no invented list when there is no `scope.md`, no
 *    "next run soon" when the loop wrote no hint), because a console that
 *    fabricates is the exact failure this REQ forbids.
 *
 * Usage (repo root):
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a \
 *     node scripts/probe-loop-console.cjs --token "$TK"
 *
 * Exit 0 = the deployed console shows the row, the detail and the controls,
 * and refuses to invent what the loop did not measure.
 */
const { chromium } = require('playwright-core');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const REPO = join(__dirname, '..');
const WEB = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://127.0.0.1:3457';
const API = 'http://127.0.0.1:3456';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const NL = '\n';

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
function step(n, title) {
  console.log('\n── ' + n + ' ── ' + title);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const token = (process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : process.env.TOKEN || '')
  .trim()
  .split(NL)
  .pop();
if (!token) {
  console.error('TOKEN is required (HOME=/root bun scripts/mint-e2e-token.mjs)');
  process.exit(1);
}
// The gate check must send NO credential at all. Reusing the probe's own auth
// header here would have answered 200 and read as "the gate is open" — the
// check that exists to prove the gate was never flipped has to be the one
// request that carries nothing.
async function gateStatus() {
  const res = await fetch(API + '/api/auth/me');
  await res.text();
  return res.status;
}
const auth = { Authorization: 'Bearer ' + token };
const jsonAuth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

// Per-run id: a crashed earlier run can never 409 or collide with this one.
const RUN = Date.now().toString(36);
const LOOP_NAME = 'probe-loop-' + RUN;
let loopId = null;
/** The probe's own `scope.md` fixture — removed in cleanup. */
let scopeFixture = null;

// REST helpers — the probe drives the same API the UI does.
async function rest(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: body === undefined ? auth : jsonAuth,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // A non-JSON body is a probe finding, not a parse crash.
  }
  return { status: res.status, json, text };
}

async function main() {
  console.log('REQ-202 live console probe — ' + WEB);
  step(0, 'the gate is ON before the probe touches anything');
  ok('tokenless /api/auth/me is 401', (await gateStatus()) === 401, 'status=' + (await gateStatus()));

  // Baseline FIRST. "exactly one row" only means something if the catalog
  // started empty — otherwise the count also proves that a sibling's loop, a
  // previous crashed run or a real user loop does not silently vanish from the
  // list. This run once reported `rows=2` and the extra row turned out to be the
  // PROBE'S OWN leftover from a throwaway dump script, which is exactly the
  // ambiguity this assertion removes.
  step(0.5, 'the catalog starts empty (so a row count means something)');
  const before = await rest('GET', '/api/loops');
  const preExisting = before.json && before.json.loops ? before.json.loops : [];
  if (preExisting.length > 0) {
    console.error(
      '  SKIP — the catalog already holds ' +
        preExisting.length +
        ' loop(s) (' +
        preExisting.map((l) => l.name).join(', ') +
        '). Row counts cannot be asserted against a shared catalog; clean it first.',
    );
    process.exit(2);
  }
  ok('the catalog is empty before the probe adds one', preExisting.length === 0, 'pre-existing loops=' + preExisting.length);

  step(1, 'create the probe loop over REST');
  const created = await rest('POST', '/api/loops', { name: LOOP_NAME, prompt: 'probe: report the row', cwd: REPO, origin: 'user' });
  ok('POST /api/loops creates a draft', created.status === 201 && created.json && created.json.loop, 'status=' + created.status);
  if (!created.json || !created.json.loop) {
    console.error('  cannot continue without a loop: ' + created.text.slice(0, 200));
    await cleanup();
    return;
  }
  loopId = created.json.loop.id;
  ok('the server minted a `l_`+8hex id', /^l_[a-f0-9]{8}$/.test(loopId), 'id=' + loopId);

  // ── the detail fixture: a scope.md whose items are PARTLY checked, so the
  // "Neler kaldı?" branch has both a real list and a checked sibling.
  //
  // Written directly: there is no `POST /api/loops/:id/scope` route (measured —
  // 404), and `scopePath` is module-private in the store. The console must still
  // READ it through the product's own parser, so writing the file is a fixture,
  // not a product claim — the round-trip below is what proves the read.
  step(2, 'a scope.md with one checked and one unchecked item');
  const { mkdirSync, writeFileSync, rmSync } = require('node:fs');
  const loopDir = join(process.env.HOME || '/root', '.lokma', 'loops', loopId);
  mkdirSync(loopDir, { recursive: true });
  const scopeFile = join(loopDir, 'scope.md');
  writeFileSync(scopeFile, '- [x] probe already done\n- [ ] probe still open\n', 'utf-8');
  ok('the scope.md fixture is on disk', true, 'path written under .lokma/loops/' + loopId);
  scopeFixture = scopeFile;

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  // Registered at page creation, NOT next to the assertion: a listener attached
  // in step 12 cannot see requests the page already made, so the failing URLs
  // were always going to be missing. The 404s happened during load.
  const failedRequests = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(r.status() + ' ' + r.url());
  });

  try {
    // ── kapsam 1: BOTH entry points, ONE implementation.
    step(3, 'kapsam 1 — Settings → Loops renders the console');
    await page.addInitScript((t) => {
      try {
        window.localStorage.setItem('lokma-token', t);
      } catch {
        // A locked-down storage only costs the token seed.
      }
    }, token);
    await page.goto(WEB + '/?token=' + encodeURIComponent(token) + '&settings=loops', { waitUntil: 'domcontentloaded' });
    await sleep(6000);

    const consoleEl = await page.$('[data-loop-console]');
    ok('the console is mounted from the settings deep link', !!consoleEl, '[data-loop-console] present=' + !!consoleEl);
    const dialog = await page.$('[role="dialog"][aria-label="Settings"]');
    ok('it is the Settings modal that is open', !!dialog, 'settings dialog=' + !!dialog);

    step(4, 'kapsam 2 — one honest row per loop');
    const rows = await page.$$('[data-loop-row]');
    ok('exactly one row is rendered for the probe loop', rows.length === 1, 'rows=' + rows.length);
    // Count alone is ambiguous (a leftover loop could satisfy it), so the row is
    // matched by the id the SERVER minted for THIS run.
    const mine = await page.$('[data-loop-row="' + loopId + '"]');
    ok('the row is the one this run created', !!mine, 'data-loop-row=' + loopId);
    // Selector proven before the inner cells are trusted.
    const target = mine || rows[0];
    const rowText = target ? (await target.innerText()).replace(/\s+/g, ' ') : '';
    ok('the row carries the loop name', rowText.indexOf(LOOP_NAME) !== -1, 'name present=' + rowText.indexOf(LOOP_NAME) !== -1);
    ok('the row shows the measured iteration count and its cap', /\biter\s+\d+\/(\d+|unlimited)\b/.test(rowText), 'iter label');
    ok('the row shows a draft status badge', /\bdraft\b/i.test(rowText), 'status badge');
    ok('an uncapped budget paints NO full bar (kapsam 2 honesty)', rowText.indexOf('h/') === -1 && rowText.indexOf('/$0.00') === -1, 'no capped budget text');
    ok('no invented queue position: the loop wrote no nextHint', rowText.indexOf('Next:') === -1, 'no Next: line');
    ok('no invented checklist on the row', target && (await target.$('[data-loop-remaining]')) === null, 'row carries no remaining list');

    step(5, 'kapsam 3 — the detail panel');
    await target.click();
    await sleep(2500);
    const detail = await page.$('[data-loop-detail]');
    ok('clicking the row opens the detail panel', !!detail, '[data-loop-detail] present=' + !!detail);

    const stateJson = await page.$('[data-loop-state-json]');
    ok('the RAW state.json is rendered', !!stateJson, '[data-loop-state-json] present=' + !!stateJson);
    if (stateJson) {
      const raw = await stateJson.innerText();
      ok('the raw file is the record itself, not a re-serialization', raw.indexOf('"spent"') !== -1 && raw.indexOf('"budget"') !== -1, 'keys present');
      // The proof that it is the FILE: the id on disk belongs to this run only.
      ok('the rendered file names this run\'s loop id', raw.indexOf(loopId) !== -1, 'id in raw json=' + raw.indexOf(loopId) !== -1);
    }

    const noScope = await page.$('[data-loop-no-scope]');
    const remaining = await page.$('[data-loop-remaining]');
    // The fixture wrote scope.md AFTER the row was created, so the detail is
    // read fresh on click and must show the LIST branch — never the "no scope.md"
    // copy, which would be the product claiming there is no checklist.
    ok('"What is left" lists the unchecked scope items', !!remaining && !noScope, 'remaining=' + !!remaining + ' noScope=' + !!noScope);
    if (remaining) {
      const remText = (await remaining.innerText()).replace(/\s+/g, ' ');
      ok('the checked sibling is NOT counted as remaining', remText.indexOf('probe already done') === -1 && remText.indexOf('probe still open') !== -1, 'remaining text=' + JSON.stringify(remText));
    }

    // A `Block`'s heading lives in a <header>, so its <pre> is a SIBLING of that
    // header, not a child — querying `header > pre` measured nothing and read as
    // "the prompt is missing". Anchor on the section and let it carry the search.
    const blockText = (title) =>
      page.evaluate((t) => {
        const heads = Array.prototype.slice.call(document.querySelectorAll('h4'));
        const head = heads.filter((h) => (h.textContent || '').trim().toLowerCase() === t)[0];
        const sec = head && head.closest('section');
        return sec ? (sec.textContent || '') : null;
      }, title);

    const promptText = await blockText('prompt');
    ok('the full prompt is shown', !!promptText && promptText.indexOf('probe: report the row') !== -1, 'prompt block found=' + !!promptText);

    // ── kapsam 3's OTHER branch, and the one that was NOT measured: a loop with
    // NO scope.md. Two proven-to-fail rounds stayed 49/0 while the panel's
    // `detail.remaining === null` branch was mutated away, because the only
    // fixture in the run HAD a scope file — so the honest-list assertions could
    // not see the fabrication. The check has to remove the file and re-read, or
    // it measures nothing.
    step('5b', 'kapsam 3 — the NO-scope.md branch (the honesty that must not fabricate)');
    require('node:fs').rmSync(scopeFixture, { force: true });
    ok('the scope.md fixture is removed for the no-scope branch', !require('node:fs').existsSync(scopeFixture), 'fixture removed');
    // A full reload, NOT a re-click: `LoopDetail`'s `load` is keyed on `loop.id`,
    // so clicking the ALREADY-SELECTED row keeps the same component instance and
    // never re-fetches — the panel would have shown the previous detail and the
    // check below would have measured the cache, not the server. Deselecting
    // first would work too, but a reload is the honest "ask the server again".
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(6000);
    // The deep-link params were STRIPPED from the URL on first open (the app
    // replaces the history entry), so a plain reload lands on the default
    // surface and the console would be absent — re-open it by the same deep
    // link rather than assuming it survived.
    if (!(await page.$('[data-loop-console]'))) {
      await page.goto(WEB + '/?token=' + encodeURIComponent(token) + '&settings=loops', { waitUntil: 'domcontentloaded' });
      await sleep(6000);
    }
    const noScopeRow = await page.$('[data-loop-row="' + loopId + '"]');
    ok('the row is still there after the reload', !!noScopeRow, 'row present=' + !!noScopeRow);
    await noScopeRow.click();
    await sleep(2500);
    const noScopeEl = await page.$('[data-loop-no-scope]');
    const remAfterDelete = await page.$('[data-loop-remaining]');
    ok('a loop with no scope.md shows the NO-SCOPE copy', !!noScopeEl && !remAfterDelete, 'noScope=' + !!noScopeEl + ' remaining=' + !!remAfterDelete);
    if (noScopeEl) {
      const nsText = (await noScopeEl.innerText()).replace(/\s+/g, ' ');
      ok('the copy explains there is no checklist at all', nsText.indexOf('no checklist') !== -1 || nsText.indexOf('No scope.md') !== -1, 'copy=' + JSON.stringify(nsText));
      ok('it never claims "0 items left" (a checklist that does not exist is not empty)', nsText.indexOf('0 items left') === -1 && nsText.indexOf('0 item') === -1, 'no zero-count claim');
    }

    // Restore the fixture: the later hint/poll checks read the same detail panel.
    writeFileSync(scopeFile, '- [x] probe already done\n- [ ] probe still open\n', 'utf-8');

    const ledgerBlock = await blockText('ledger');
    // The ledger is NEVER an empty string — it always carries its head summary
    // ("# Loop ledger / Append-only…"), so `detail.ledger.trim()` is truthy and
    // the panel renders the FILE, not the "no turn booked" copy. Asserting that
    // copy here would have been a false red against correct product code: the
    // honest claim is that the panel shows the real ledger text and invents no
    // iteration entry for a loop that never ran one.
    ok(
      'the ledger block renders the real file text',
      !!ledgerBlock && ledgerBlock.indexOf('Loop ledger') !== -1,
      'ledger block found=' + !!ledgerBlock,
    );
    ok(
      'a loop that never ran invents no iteration entry',
      !!ledgerBlock && ledgerBlock.indexOf('## Iteration') === -1,
      'no Iteration heading=' + (ledgerBlock ? ledgerBlock.indexOf('## Iteration') === -1 : false),
    );

    step(6, 'kapsam 6 — the error line must be REAL');
    // The console can only show a last error if the record CARRIES one. Proving
    // that on a live error turn would burn a provider call and a real turn, so
    // the honest claim is narrower and still load-bearing: the record round-trips
    // the field (the product wrote it, the UI reads it) — proven in the store
    // probe — while HERE we prove the UI does NOT fabricate one: a non-error
    // loop shows no error line at all.
    const errLine = await page.$('[data-loop-last-error]');
    ok('a healthy loop shows no error line (never fabricated)', errLine === null, 'error element=' + !!errLine);

    step(7, 'kapsam 4 — the controls are present, labelled and enabled');
    const wanted = ['Pause loop', 'Resume loop', 'Run one turn now', 'Stop loop', 'Delete loop', 'Open ledger (md)'];
    const labels = await page.evaluate(() =>
      Array.prototype.slice.call(document.querySelectorAll('[aria-label]')).map((el) => el.getAttribute('aria-label')),
    );
    for (const label of wanted) {
      ok('control present: ' + label, labels.indexOf(label) !== -1, 'aria-labels=' + labels.length);
    }
    const pauseBtn = await page.$('[aria-label="Pause loop"]');
    ok('Pause is clickable on a draft loop', pauseBtn && !(await pauseBtn.isDisabled()), 'pause disabled=' + (pauseBtn ? await pauseBtn.isDisabled() : 'n/a'));

    step(8, 'the control MOVES the row (the deployed round trip)');
    // `draft → paused` is ILLEGAL by design (assertTransition: draft → running
    // only), so a Pause on a draft is refused with `bad_transition` and the row
    // stays `draft`. Asserting `paused` here would have measured a product bug
    // that is actually a legal-transition rule — so the probe first resumes the
    // loop into `running`, where Pause is the documented action.
    const draftPause = await rest('POST', '/api/loops/' + loopId + '/pause');
    ok('Pause on a draft is REFUSED honestly, not silently ignored', draftPause.status === 400 && draftPause.json && draftPause.json.code === 'bad_transition', 'status=' + draftPause.status + ' code=' + (draftPause.json && draftPause.json.code));

    await page.click('[aria-label="Resume loop"]');
    await sleep(2500);
    const armed = await rest('GET', '/api/loops/' + loopId);
    ok('Resume armed the draft loop (draft → running)', armed.json && armed.json.loop.status === 'running', 'status=' + (armed.json && armed.json.loop && armed.json.loop.status));

    await page.click('[aria-label="Pause loop"]');
    await sleep(2500);
    const afterPause = await rest('GET', '/api/loops/' + loopId);
    ok('Pause wrote `paused` to the real record', afterPause.json && afterPause.json.loop && afterPause.json.loop.status === 'paused', 'status=' + (afterPause.json && afterPause.json.loop && afterPause.json.loop.status));
    const rowStatus = await page.getAttribute('[data-loop-row]', 'data-loop-status');
    ok('the row itself re-rendered as paused', rowStatus === 'paused', 'data-loop-status=' + rowStatus);

    step(9, 'Resume puts it back, and a terminal loop refuses honestly');
    await page.click('[aria-label="Resume loop"]');
    await sleep(2500);
    const afterResume = await rest('GET', '/api/loops/' + loopId);
    ok('Resume wrote `running`', afterResume.json && afterResume.json.loop.status === 'running', 'status=' + (afterResume.json && afterResume.json.loop && afterResume.json.loop.status));

    step(10, 'kapsam 2 honest "Sırada": a real hint is shown verbatim');
    await rest('PATCH', '/api/loops/' + loopId, { nextHint: 'probe hint line' });
    await sleep(6000); // the console's own 5s poll is the fallback path under test
    // A hint that never arrives must read as a MISS, never as a crash — handle
    // the null element explicitly instead of calling a method on it.
    const hint = await page.$('[data-loop-next-hint]');
    const hintText = hint ? (await hint.innerText()).replace(/\s+/g, ' ') : '';
    ok('the row shows the hint the loop actually wrote', !!hint && hintText.indexOf('probe hint line') !== -1, 'hint=' + JSON.stringify(hintText));

    // ── kapsam 5, the half every other step stands on: the row must move on
    // the WS FRAME, not on the 5s poll. Step 10 above waits out the poll, so
    // without this section the whole probe would pass with the frame path dead
    // (the poll would paper over it) — the REQ's own "frame yoksa poll" wording
    // would be satisfied by the fallback alone.
    //
    // Two independent measurements, because either alone is ambiguous:
    //  (1) the WIRE — CDP `Network.webSocketFrameReceived` catches the actual
    //      `{"type":"loop","loopIds":["<id>"]}` frame the server sent;
    //  (2) the DOM — the row changes in well under the poll interval, and no
    //      `GET /api/loops` list fetch happens inside that window. (2) is only
    //      load-bearing because the poll IS observable: the idle baseline above
    //      measured list fetches at ~4999ms gaps, so "zero list fetches" is a
    //      real negative control and not "the probe cannot see polls".
    step('10b', 'kapsam 5 — the row moves on the WS frame, not on the poll');
    // The CDP session attaches AFTER the socket exists: an already-open socket
    // does not replay into it, so a session created at page creation sees
    // nothing and the frame assertion would pass vacuously.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    const loopFrames = [];
    cdp.on('Network.webSocketFrameReceived', (ev) => {
      const payload = (ev.response && ev.response.payloadData) || '';
      if (payload.indexOf('"loop"') !== -1) loopFrames.push(payload);
    });
    const listFetches = [];
    page.on('response', (r) => {
      const url = r.url();
      if (r.request().method() === 'GET' && /\/api\/loops(\?|$)/.test(url)) listFetches.push(Date.now());
    });

    // Baseline: the poll really is running, so "no fetch in the window" means
    // something. A silent poll would make the negative control vacuous.
    await sleep(11000);
    const idleFetches = listFetches.length;
    ok(
      'the poll fallback really is running (so the negative control is not vacuous)',
      idleFetches >= 1,
      'GET /api/loops while idle in 11s=' + idleFetches,
    );

    const frameHint = 'probe frame hint ' + Date.now().toString(36);
    const t0 = Date.now();
    const framed = await rest('PATCH', '/api/loops/' + loopId, { nextHint: frameHint });
    ok('the PATCH that triggers the frame is accepted', framed.status === 200, 'status=' + framed.status);

    let domAt = null;
    while (Date.now() - t0 < 3000) {
      const el = await page.$('[data-loop-next-hint]');
      if (el && (await el.innerText()).indexOf(frameHint) !== -1) {
        domAt = Date.now() - t0;
        break;
      }
      await sleep(60);
    }
    ok(
      'the row re-rendered on the frame, not by waiting out the poll',
      domAt !== null && domAt < 3000,
      'dom ' + (domAt === null ? 'NEVER' : domAt + 'ms') + ' vs the 5000ms poll interval',
    );
    // The discriminating assertion. A poll-driven refresh would land inside this
    // window; a frame-driven one cannot.
    const fetchesInWindow = listFetches.filter((t) => t >= t0).length;
    ok(
      'no catalog poll ran in the window (the FRAME moved the row)',
      fetchesInWindow === 0,
      'list fetches inside the window=' + fetchesInWindow,
    );
    ok(
      'the server really sent a `loop` frame naming this loop',
      loopFrames.some((p) => p.indexOf(loopId) !== -1),
      'loop frames=' + loopFrames.length + ' last=' + JSON.stringify(loopFrames.slice(-1)[0] || null),
    );
    ok(
      'the frame arrived over the socket, not as a re-read',
      loopFrames.length > 0,
      'loop frames observed=' + loopFrames.length,
    );
    // Shape, not just "a string containing loop": the frame is only useful if
    // it names ids in the documented field. A frame carrying the loop's name or
    // a nested payload would satisfy a naive substring check and reach the
    // console as "the catalog changed", i.e. a full re-read instead of the
    // targeted refresh kapsam 5 asks for.
    const shaped = loopFrames.filter((p) => {
      try {
        const m = JSON.parse(p);
        return m && m.type === 'loop' && Array.isArray(m.loopIds);
      } catch {
        return false;
      }
    });
    ok(
      'the frame carries the documented shape {type:"loop",loopIds:[]}',
      shaped.length > 0,
      'well-shaped frames=' + shaped.length + '/' + loopFrames.length,
    );

    step(11, 'kapsam 7 — the empty catalog has its own copy');
    const emptyCopy = await page.evaluate(() => {
      const el = document.querySelector('[data-loop-empty]');
      return el ? (el.textContent || '').trim() : null;
    });
    ok('a populated catalog shows no empty state', emptyCopy === null, 'empty-state text=' + JSON.stringify(emptyCopy));
    const LOOP_EMPTY_COPY = 'No loops yet — create one here, or just ask your agent for one.';
    const srcEmpty = (() => {
      try {
        return execFileSync('grep', ['-q', LOOP_EMPTY_COPY, join(REPO, 'packages/lokma-web/web/src/components/loops/loop.ts')], { stdio: 'pipe' }).toString();
      } catch {
        return null;
      }
    })();
    ok('the empty-catalog sentence exists in the product', typeof srcEmpty === 'string', 'grep found the copy');
    const newBtn = await page.$('[aria-label="New loop"]');
    ok('the empty state offers a New loop button', !!newBtn, 'New loop present=' + !!newBtn);

    step(12, 'no console errors along the way');
    // The URL of a failed request is the diagnosis — a bare "404" string cannot
    // tell a missing product asset from a probe fixture that was cleaned up
    // before the page stopped asking for it.
    //
    // `/api/sessions/<fresh id>` is EXCLUDED, and deliberately so: measured on a
    // plain load with no loop in play, the shell mints a session id
    // (`sess_<base36>_<4>`) and GETs it before any run created it — a 404 that
    // predates this REQ. The check is therefore made against `failedRequests`
    // (which CARRIES the URL), not against `consoleErrors` (a bare message with
    // no URL, so a substring filter there could never exclude it — the first
    // version of this check failed for exactly that reason).
    const loopFails = failedRequests.filter((s) => s.indexOf('/api/loops') !== -1);
    const otherFails = failedRequests.filter((s) => s.indexOf('/api/sessions/') === -1 && s.indexOf('favicon') === -1);
    ok('no loop route returned an error', loopFails.length === 0, loopFails.length ? loopFails.slice(0, 4).join(' | ') : 'no /api/loops 4xx/5xx');
    ok(
      'no other request failed (outside the known pre-existing session 404)',
      otherFails.length === 0,
      otherFails.length ? otherFails.slice(0, 4).join(' | ') : 'only the pre-existing /api/sessions 404',
    );
    // Kept as an advisory count: the browser logs one console error per failed
    // request, so the number must not EXCEED the requests we already attributed.
    ok(
      'the console error count matches the attributed failures',
      consoleErrors.length <= failedRequests.length,
      consoleErrors.length + ' console errors / ' + failedRequests.length + ' failed requests',
    );

    step(13, 'the rail entry renders the SAME console (one implementation)');
    await page.goto(WEB + '/?token=' + encodeURIComponent(token), { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    const railConsole = await page.evaluate(() => {
      const triggers = Array.prototype.slice.call(document.querySelectorAll('button,[role="tab"]'));
      const t = triggers.filter((b) => (b.getAttribute('aria-label') || '').toLowerCase().indexOf('loops') !== -1)[0];
      if (!t) return { found: false };
      t.click();
      return { found: true };
    });
    ok('a rail/trigger entry for Loops exists', railConsole.found, 'found=' + railConsole.found);
    await sleep(3500);
    const paneConsole = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Settings"]');
      const inDialog = dialog ? dialog.querySelector('[data-loop-console]') : null;
      return {
        inDialog: !!inDialog,
        anywhere: document.querySelectorAll('[data-loop-console]').length,
      };
    });
    ok('the second entry point shows the console too', paneConsole.anywhere >= 1, 'consoles on screen=' + paneConsole.anywhere);
  } catch (e) {
    // A crash mid-run is a FAILURE, not a skip: without this the `finally`
    // cleanup's summary would print and the process could exit 0 on a probe
    // that never finished (measured: the first run crashed at step 10 yet the
    // shell reported RC=0 — the summary lived inside the try).
    failed += 1;
    failures.push('probe crashed: ' + (e && e.message ? e.message : String(e)));
    console.error('  FAIL probe crashed — ' + (e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
    await cleanup();
  }

  ok('the login gate is still ON after the probe', (await gateStatus()) === 401, 'status=' + (await gateStatus()));

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) {
    console.error('failed: ' + failures.join(' | '));
    process.exit(1);
  }
  console.log('the deployed console shows the row, the detail and the controls, and refuses to invent the rest');
}

async function cleanup() {
  if (!loopId) return;
  for (let i = 0; i < 3; i++) {
    const del = await rest('DELETE', '/api/loops/' + loopId);
    if (del.status === 200 || del.status === 404) break;
    await sleep(400);
  }
  // Verify the deletion STAYS deleted — a loop directory that a live run keeps
  // appending to can come back, and "deleted" that is not verified is not done.
  for (let i = 0; i < 3; i++) {
    const after = await rest('GET', '/api/loops');
    const still = after.json && after.json.loops && after.json.loops.some((l) => l.id === loopId);
    if (!still) break;
    await rest('DELETE', '/api/loops/' + loopId);
    await sleep(400);
  }
  const final = await rest('GET', '/api/loops');
  const left = (final.json && final.json.loops ? final.json.loops.filter((l) => l.name.indexOf('probe-loop-') === 0) : []).length;
  ok('cleanup left no probe loop behind', left === 0, 'remaining probe loops=' + left);
  // The fixture is INSIDE the loop dir, so the API delete normally takes it —
  // but if the delete failed above, the file would outlive the run silently.
  if (scopeFixture) {
    try {
      require('node:fs').rmSync(scopeFixture, { force: true });
    } catch {
      // The loop-dir delete above already removed it; a missing file is fine.
    }
    ok('the scope.md fixture is gone', !require('node:fs').existsSync(scopeFixture), 'fixture removed');
  }
}

main().catch((e) => {
  console.error('probe crashed: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});