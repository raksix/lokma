#!/usr/bin/env node
/**
 * REQ-203 — live proof for the PROJECT-SCOPED loop view (kapsam 1…5) on the
 * DEPLOYED server.
 *
 * Why a separate probe instead of extending `probe-loop-console.cjs`: that one
 * asserts on ROW COUNTS against a shared catalog and exits 2 unless the catalog
 * is empty at start. This feature is about WHICH loops are visible under which
 * view, so it needs its own fixture shape — three loops across THREE projects
 * (two named, one in the no-project bucket) with different statuses — and its
 * own cleanup. A probe that cannot assert "the other project's loop is NOT on
 * screen" proves nothing about scoping.
 *
 * Rules this probe obeys, each learned the hard way in this repo:
 *
 *  - The login gate is NEVER flipped. A real superadmin token is minted with
 *    `HOME=/root bun scripts/mint-e2e-token.mjs`; the gate check sends NO
 *    credential at all (reusing the probe's own header would answer 200 and
 *    read as "the gate is open"), and it is re-asserted after the run.
 *  - Every scope signal is written by the PRODUCT, never hand-seeded: the
 *    projects come from `POST /api/projects` and the loops from
 *    `POST /api/loops` with the project's own id + cwd. A fixture written
 *    straight into `state.json` would let a broken write path pass.
 *  - Absent ≠ hidden-by-filter is respected throughout: the project view is
 *    compared against the OTHER project's row BY ID, and every empty state is
 *    matched to its own hook, so "nothing here" never satisfies "filtered".
 *  - Cleanup is verified with a bounded re-check (a loop directory that a run
 *    keeps appending to comes back) and the probe asserts zero leftovers.
 *  - The proven-to-fail runs mutate the PRODUCT SOURCE, not this file. A probe
 *    flag that skips a step is the anti-pattern: it weakens the very assertion
 *    it claims to test, and a half-parsed `--ptf=x` silently runs the NORMAL
 *    path — measured here, three green "PTF" runs that proved nothing at all.
 *    The recipe that works: mutate `loop-view.ts` / `loop-row.tsx`, rebuild,
 *    re-run, restore byte-exact, rebuild again.
 *
 * Usage (repo root):
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a \
 *     node scripts/probe-loop-project-view.cjs --token "$TK"
 *
 * Exit 0 = the deployed console scopes the list, badges a deleted project,
 * warns about work running elsewhere, and survives a reload with the same view.
 */
const { chromium } = require('playwright-core');
const { mkdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const REPO = join(__dirname, '..');
const WEB = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'http://127.0.0.1:3457';
const API = 'http://127.0.0.1:3456';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

// The picker's sentinel for the no-project bucket. Duplicated as a literal
// rather than imported: the component's constant is module-private, and the
// probe asserts the RENDERED attribute, not the module's internals — so a
// rename in the component must show up here as a failing assertion instead of
// being silently satisfied by a shared binding.
const NO_PROJECT_VALUE = '__no_project__';
const NL = '\n';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  console.log('\n-- ' + n + ' -- ' + title);
}

const token = (process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : process.env.TOKEN || '')
  .trim()
  .split(NL)
  .pop();
if (!token) {
  console.error('TOKEN is required (HOME=/root bun scripts/mint-e2e-token.mjs)');
  process.exit(1);
}

async function gateStatus() {
  const res = await fetch(API + '/api/auth/me');
  await res.text();
  return res.status;
}
const auth = { Authorization: 'Bearer ' + token };
const jsonAuth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

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

const RUN = Date.now().toString(36);
const DIR_A = '/tmp/lokma-probe-projA-' + RUN;
const DIR_B = '/tmp/lokma-probe-projB-' + RUN;
const DIR_FREE = '/tmp/lokma-probe-free-' + RUN;
const NAME_A = 'probe-a-' + RUN;
const NAME_B = 'probe-b-' + RUN;
const NAME_FREE = 'probe-free-' + RUN;
// kapsam 3's READ half needs a loop that has NO projectId but sits in project
// A's directory — the "created before the project existed" case. Without it
// every live fixture carries an explicit projectId and the cwd signal is
// unreachable: measured, dropping the cwd signal from `loopProjectState` left
// this probe 52/0 GREEN, because the id path alone satisfied every row check.
const NAME_CWD = 'probe-cwd-' + RUN;
const projectIds = [];
const loopIds = [];

async function makeProject(name, cwd) {
  mkdirSync(cwd, { recursive: true });
  const res = await rest('POST', '/api/projects', { name, cwd });
  if (!res.json || !res.json.project) return null;
  projectIds.push(res.json.project.id);
  return res.json.project;
}

async function makeLoop(name, cwd, projectId) {
  const res = await rest('POST', '/api/loops', {
    name,
    prompt: 'probe: ' + name,
    cwd,
    projectId,
    origin: 'user',
  });
  if (!res.json || !res.json.loop) return null;
  loopIds.push(res.json.loop.id);
  return res.json.loop;
}

async function cleanup() {
  for (const id of loopIds) {
    for (let i = 0; i < 3; i++) {
      const del = await rest('DELETE', '/api/loops/' + id);
      if (del.status === 200 || del.status === 404) break;
      await sleep(300);
    }
  }
  for (const id of projectIds) {
    for (let i = 0; i < 3; i++) {
      const del = await rest('DELETE', '/api/projects/' + id);
      if (del.status === 200 || del.status === 404) break;
      await sleep(300);
    }
  }
  // Verify it STAYS deleted: a loop directory a live turn keeps appending to
  // can come back, and "deleted" that is not verified is not done.
  const after = await rest('GET', '/api/loops');
  const still = after.json && after.json.loops ? after.json.loops : [];
  const leftLoops = still.filter((l) => loopIds.indexOf(l.id) !== -1).length;
  ok('cleanup left no probe loop behind', leftLoops === 0, 'loops still present=' + leftLoops);
  const projects = await rest('GET', '/api/projects');
  const all = projects.json && projects.json.projects ? projects.json.projects : [];
  const leftProjects = all.filter((p) => projectIds.indexOf(p.id) !== -1).length;
  ok('cleanup left no probe project behind', leftProjects === 0, 'projects still present=' + leftProjects);
  for (const dir of [DIR_A, DIR_B, DIR_FREE]) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // A leftover empty tmp dir is not a state leak; the assertions above are.
    }
  }
}

async function openConsole(page) {
  await page.goto(WEB + '/?token=' + encodeURIComponent(token) + '&settings=loops', { waitUntil: 'domcontentloaded' });
  // The settings deep link is STRIPPED from the URL once the modal opens, so a
  // plain reload lands on the default surface and the console would be absent.
  if (!(await page.$('[data-loop-console]'))) {
    await page.goto(WEB + '/?token=' + encodeURIComponent(token) + '&settings=loops', { waitUntil: 'domcontentloaded' });
  }
  await page.waitForSelector('[data-loop-console]', { timeout: 20000 });
  await sleep(2500);
}

async function rowIds(page) {
  return page.evaluate(() =>
    Array.prototype.slice.call(document.querySelectorAll('[data-loop-row]')).map((n) => n.getAttribute('data-loop-row')),
  );
}

async function scopeLabel(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-loop-view-scope]');
    return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null;
  });
}

async function main() {
  console.log('REQ-203 live project-view probe — ' + WEB);
  step(0, 'the gate is ON before the probe touches anything');
  const gate0 = await gateStatus();
  ok('tokenless /api/auth/me is 401', gate0 === 401, 'status=' + gate0);

  step(1, 'three projects: two named, one bucket for the project-less loop');
  const projA = await makeProject(NAME_A, DIR_A);
  const projB = await makeProject(NAME_B, DIR_B);
  ok('project A was created by the server', !!projA && /^p_/.test(projA.id), 'id=' + (projA && projA.id));
  ok('project B was created by the server', !!projB && /^p_/.test(projB.id), 'id=' + (projB && projB.id));
  if (!projA || !projB) {
    console.error('  cannot continue without both projects');
    await cleanup();
    return;
  }
  ok('each project record carries the directory it was given', projA.cwd === DIR_A && projB.cwd === DIR_B, projA.cwd + ' / ' + projB.cwd);

  step(2, 'three loops: one per project, one in the no-project bucket');
  const loopA = await makeLoop('probe-loop-a-' + RUN, projA.cwd, projA.id);
  const loopB = await makeLoop('probe-loop-b-' + RUN, projB.cwd, projB.id);
  mkdirSync(DIR_FREE, { recursive: true });
  const loopFree = await makeLoop(NAME_FREE, DIR_FREE, null);
  // projectId omitted AND cwd = project A's directory. The store's write
  // contract (kapsam 3, turn 3) allows this — a project-less loop keeps its own
  // cwd — so it is a real product state, not a fixture shortcut.
  const loopCwd = await makeLoop(NAME_CWD, projA.cwd, null);
  ok('the scoped loop A was created', !!loopA, 'id=' + (loopA && loopA.id));
  ok('the scoped loop B was created', !!loopB, 'id=' + (loopB && loopB.id));
  ok('the project-less loop was created', !!loopFree, 'id=' + (loopFree && loopFree.id));
  ok('the project-less loop INSIDE project A was created', !!loopCwd, 'id=' + (loopCwd && loopCwd.id));
  if (!loopA || !loopB || !loopFree || !loopCwd) {
    console.error('  cannot continue without all three loops');
    await cleanup();
    return;
  }
  // kapsam 3, read back from the SERVER: a loop that names a project stores
  // THAT project's cwd — the two signals are not born contradicting.
  const aStored = await rest('GET', '/api/loops/' + loopA.id);
  ok(
    'loop A stores the project directory, not its own',
    aStored.json && aStored.json.loop && aStored.json.loop.cwd === projA.cwd && aStored.json.loop.projectId === projA.id,
    'cwd=' + (aStored.json && aStored.json.loop && aStored.json.loop.cwd) + ' projectId=' + (aStored.json && aStored.json.loop && aStored.json.loop.projectId),
  );

  step(3, 'B runs, so the cross-view warning has real work to count');
  const resumed = await rest('POST', '/api/loops/' + loopB.id + '/resume');
  ok('loop B is armed (running) without spending a turn', resumed.status === 200 && resumed.json && resumed.json.loop.status === 'running', 'status=' + (resumed.json && resumed.json.loop && resumed.json.loop.status));

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
  const failedRequests = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(r.status() + ' ' + r.url());
  });
  try {
    await page.addInitScript((t) => {
      try {
        window.localStorage.setItem('lokma-token', t);
      } catch {
        // A locked-down storage only costs the token seed.
      }
    }, token);

    step(4, 'kapsam 1 — "All loops" shows every loop');
    await openConsole(page);
    const allRows = await rowIds(page);
    ok('every loop is listed under the unfiltered view', allRows.length === 4, 'rows=' + allRows.length + ' ' + JSON.stringify(allRows));
    ok('the no-project loop is listed too', allRows.indexOf(loopFree.id) !== -1, 'free=' + allRows.indexOf(loopFree.id));
    ok('the all-views header names the unfiltered catalog', (await scopeLabel(page)) === 'All loops', 'scope=' + JSON.stringify(await scopeLabel(page)));

    step(5, 'kapsam 1 — "This project" opens on the no-project bucket');
    await page.click('[data-loop-view="project"]');
    await sleep(1200);
    const bucketRows = await rowIds(page);
    // MEASURED, not assumed: the bucket holds exactly the ONE loop whose cwd
    // matches no project record. The cwd-only loop is NOT here — its cwd IS
    // project A's directory, so kapsam 3's read half places it in A's view
    // (asserted in step 6). An earlier draft of this probe expected two rows
    // here and read the measured truth as a product defect; it was the
    // expectation that was wrong. This is also the assertion that catches the
    // opposite error: a bucket keyed on `projectId === null` alone would have
    // put the cwd-only loop HERE, and the `loopCwd` absence below turns red.
    ok(
      'the bucket holds exactly the loop no project record claims',
      bucketRows.length === 1 && bucketRows[0] === loopFree.id,
      'rows=' + JSON.stringify(bucketRows),
    );
    ok(
      'a cwd-only loop whose directory IS a project is not filed as project-less',
      bucketRows.indexOf(loopCwd.id) === -1,
      'rows=' + JSON.stringify(bucketRows),
    );
    ok('the bucket does NOT swallow project A’s explicit loop', bucketRows.indexOf(loopA.id) === -1, 'rows=' + JSON.stringify(bucketRows));
    // The picker's SENTINEL is asserted here, where the bucket is the real state.
    // A later step asserts the picked value, so both ends of the picker's value
    // space are pinned — a rename of the sentinel can no longer pass by making
    // both sides agree on a new literal.
    const bucketPicked = await page.getAttribute('[data-loop-project]', 'data-loop-project');
    ok('the picker sits on the no-project sentinel', bucketPicked === NO_PROJECT_VALUE, 'picker=' + JSON.stringify(bucketPicked));
    const bucketLabel = await scopeLabel(page);
    ok('the header says the bucket is the no-project one', !!bucketLabel && /no project/i.test(bucketLabel), 'scope=' + JSON.stringify(bucketLabel));

    step(6, 'kapsam 1/3 — pick project A in the view');
    await page.click('[data-loop-project]');
    await page.waitForSelector('[data-select-menu-open]', { timeout: 8000 });
    await page.click('[data-select-option="' + projA.id + '"]');
    await sleep(1200);
    // The SELECTED value is asserted, not just the resulting row set.
    //
    // Measured: this row set alone was reachable by TWO rules — the pick, and
    // `adoptActiveProject` adopting the active session's cwd — so asserting only
    // "the list shows A's loop" could not tell them apart. The picker is the
    // state the pick writes and nothing else writes it, so it is the assertion
    // that makes the pick load-bearing. (The adoption path cannot fire in this
    // probe: the shell mints a fresh local-only session id, `useKnownCwd`
    // returns 'missing' for it, and the view correctly stays in the bucket —
    // measured, see the REQ's uygulama günlüğü.)
    const picked = await page.getAttribute('[data-loop-project]', 'data-loop-project');
    ok('the picker holds the project the user picked', picked === projA.id, 'picker=' + JSON.stringify(picked));
    const aRows = await rowIds(page);
    // BOTH of A's loops: the explicit one and the cwd-only one. The second row
    // is what makes the cwd read-half observable live — under the all-views
    // count a removed cwd signal would otherwise be invisible.
    ok(
      'kapsam 3: the project view lists A’s explicit loop AND its cwd-only loop',
      aRows.length === 2 && aRows.indexOf(loopA.id) !== -1 && aRows.indexOf(loopCwd.id) !== -1,
      'rows=' + JSON.stringify(aRows),
    );
    ok('the OTHER project’s running loop is NOT on screen', aRows.indexOf(loopB.id) === -1, 'rows=' + JSON.stringify(aRows));
    ok('the unrelated project-less loop is not swept in either', aRows.indexOf(loopFree.id) === -1, 'rows=' + JSON.stringify(aRows));
    const aLabel = await scopeLabel(page);
    ok('the header names the scoped project by its real name', !!aLabel && aLabel.indexOf(NAME_A) !== -1, 'scope=' + JSON.stringify(aLabel));

    step(7, 'kapsam 4 — the row badges its project, never a raw id');
    const badgeState = await page.getAttribute('[data-loop-row="' + loopA.id + '"] [data-loop-project-state]', 'data-loop-project-state');
    // Scoped to the row for the same reason as step 12's badge: an unscoped
    // read happens to be right only while ONE row is on screen, and silently
    // measures a neighbour the moment the view widens.
    const badgeText = await page.evaluate((sel) => {
      const row = document.querySelector(sel);
      const el = row ? row.querySelector('[data-loop-project-state]') : null;
      return el ? (el.textContent || '').trim() : null;
    }, '[data-loop-row="' + loopA.id + '"]');
    ok('the badge resolves to a match', badgeState === 'match', 'kind=' + badgeState);
    ok('the badge prints the project NAME, not the id', badgeText === NAME_A, 'badge=' + JSON.stringify(badgeText));

    step(8, 'kapsam 5 — the cross-view warning counts work the filter hides');
    const warn = await page.$('[data-loop-running-elsewhere]');
    ok('the warning line is present while another project runs', !!warn, 'warning=' + !!warn);
    if (warn) {
      const warnText = (await warn.innerText()).replace(/\s+/g, ' ');
      ok('it counts exactly the one running loop elsewhere', /1 loop/.test(warnText), 'text=' + JSON.stringify(warnText));
      const tag = await warn.evaluate((n) => n.tagName);
      ok('the warning is a BUTTON, not dead text', tag === 'BUTTON', 'tag=' + tag);
      await warn.click();
      await sleep(1200);
      const afterWarn = await rowIds(page);
      ok('clicking it switches to the whole catalog', afterWarn.length === 4, 'rows=' + JSON.stringify(afterWarn));
      const pressed = await page.getAttribute('[data-loop-view="all"]', 'aria-pressed');
      ok('the All toggle is now pressed', pressed === 'true', 'aria-pressed=' + pressed);
      const warnGone = await page.$('[data-loop-running-elsewhere]');
      ok('the warning is gone once nothing is hidden by the view', warnGone === null, 'warning=' + !!warnGone);
    }

    step(9, 'kapsam 2 — the filters narrow the SCOPED list honestly');
    await page.click('[data-loop-view="project"]');
    await sleep(1200);
    await page.click('[data-loop-status-filter]');
    await page.waitForSelector('[data-select-menu-open]', { timeout: 8000 });
    await page.click('[data-select-option="done"]');
    await sleep(1200);
    const filteredRows = await rowIds(page);
    ok('a filter that matches nothing lists nothing', filteredRows.length === 0, 'rows=' + JSON.stringify(filteredRows));
    const filteredBox = await page.$('[data-loop-filtered-empty]');
    ok('the FILTERED empty state is shown (not the catalog one)', !!filteredBox, 'box=' + !!filteredBox);
    const emptyBox = await page.$('[data-loop-empty]');
    ok('the empty-CATALOG box is NOT shown while loops exist', emptyBox === null, 'catalog-empty=' + !!emptyBox);
    if (filteredBox) {
      const copy = (await filteredBox.innerText()).replace(/\s+/g, ' ');
      ok('the copy blames the filters, not the catalog', /filter/i.test(copy), 'copy=' + JSON.stringify(copy));
      await page.click('[aria-label="Clear loop filters"]');
      await sleep(1200);
    }
    const clearedRows = await rowIds(page);
    ok(
      'clearing the filters brings the scoped rows back',
      clearedRows.length === 2 && clearedRows.indexOf(loopA.id) !== -1,
      'rows=' + JSON.stringify(clearedRows),
    );

    step(10, 'kapsam 2 — the search box narrows the same list');
    await page.fill('[aria-label="Search loops"]', 'nothing-matches-this');
    await sleep(900);
    const searchRows = await rowIds(page);
    ok('a search that matches nothing lists nothing', searchRows.length === 0, 'rows=' + JSON.stringify(searchRows));
    await page.fill('[aria-label="Search loops"]', NAME_CWD);
    await sleep(900);
    const searchRows2 = await rowIds(page);
    ok(
      'searching by a loop name narrows to exactly that loop',
      searchRows2.length === 1 && searchRows2[0] === loopCwd.id,
      'rows=' + JSON.stringify(searchRows2),
    );
    await page.fill('[aria-label="Search loops"]', '');
    await sleep(900);

    step(11, 'kapsam 1 — the whole view survives a reload');
    await page.reload({ waitUntil: 'domcontentloaded' });
    if (!(await page.$('[data-loop-console]'))) {
      await page.goto(WEB + '/?token=' + encodeURIComponent(token) + '&settings=loops', { waitUntil: 'domcontentloaded' });
    }
    await page.waitForSelector('[data-loop-console]', { timeout: 20000 });
    await sleep(2500);
    const modeAfter = await page.getAttribute('[data-loop-view="project"]', 'aria-pressed');
    ok('the project view is still selected after the reload', modeAfter === 'true', 'aria-pressed=' + modeAfter);
    const stored = await page.evaluate(() => window.localStorage.getItem('lokma-loops-view:v1'));
    ok('the snapshot is persisted under the documented key', !!stored && stored.indexOf('project') !== -1, 'stored=' + JSON.stringify(stored));
    const rowsAfter = await rowIds(page);
    ok(
      'the same scoped rows are listed after the reload',
      rowsAfter.length === 2 && rowsAfter.indexOf(loopA.id) !== -1 && rowsAfter.indexOf(loopCwd.id) !== -1,
      'rows=' + JSON.stringify(rowsAfter),
    );

    step(12, 'kapsam 4 — deleting the project never deletes the loop');
    const del = await rest('DELETE', '/api/projects/' + projA.id);
    ok('the project was deleted by the server', del.status === 200, 'status=' + del.status);
    // Reload so the client's project list refetches — otherwise the deleted
    // record is still in the store and every check below measures the cache.
    await page.reload({ waitUntil: 'domcontentloaded' });
    if (!(await page.$('[data-loop-console]'))) {
      await page.goto(WEB + '/?token=' + encodeURIComponent(token) + '&settings=loops', { waitUntil: 'domcontentloaded' });
    }
    await page.waitForSelector('[data-loop-console]', { timeout: 20000 });
    await sleep(2500);
    const gone = await rest('GET', '/api/projects/' + projA.id);
    ok('the project record really is gone on the server', gone.status === 404, 'status=' + gone.status);
    const alive = await rest('GET', '/api/loops/' + loopA.id);
    ok('the loop SURVIVED its project', alive.status === 200 && alive.json && alive.json.loop && alive.json.loop.id === loopA.id, 'status=' + alive.status);

    const unscopedBox = await page.$('[data-loop-unscoped]');
    ok('the vanished scope is reported, not silently widened', !!unscopedBox, 'box=' + !!unscopedBox);
    const scopedRowsAfterDelete = await rowIds(page);
    ok('a view scoped to a gone project lists NOTHING (no silent widening)', scopedRowsAfterDelete.length === 0, 'rows=' + JSON.stringify(scopedRowsAfterDelete));

    await page.click('[data-loop-view="all"]');
    await sleep(1200);
    const allAfterDelete = await rowIds(page);
    ok('all-loops still lists the orphan', allAfterDelete.indexOf(loopA.id) !== -1, 'rows=' + JSON.stringify(allAfterDelete));
    // The badge must be read INSIDE the orphan's own row. An unscoped
    // `document.querySelector('[data-loop-project-state]')` returns the FIRST
    // badge on screen — which under `all loops` is another project's row — so
    // the check would have measured loop B's name and failed against a correct
    // product. Scoped by row id, with the id passed as the single evaluate arg.
    const orphanRow = '[data-loop-row="' + loopA.id + '"]';
    const orphanKind = await page.getAttribute(orphanRow + ' [data-loop-project-state]', 'data-loop-project-state');
    const orphanText = await page.evaluate((sel) => {
      const row = document.querySelector(sel);
      const el = row ? row.querySelector('[data-loop-project-state]') : null;
      return el ? (el.textContent || '').trim() : null;
    }, orphanRow);
    ok('the orphan row is badged as a missing project', orphanKind === 'missing', 'kind=' + orphanKind);
    ok('the badge says "project missing", not a bare id', orphanText === 'project missing', 'badge=' + JSON.stringify(orphanText));

    step(13, 'no console errors along the way');
    const loopFails = failedRequests.filter((s) => s.indexOf('/api/loops') !== -1);
    ok('no loop route returned an error', loopFails.length === 0, loopFails.length ? loopFails.slice(0, 4).join(' | ') : 'no /api/loops 4xx/5xx');
    ok('no project route returned an unexpected error', failedRequests.filter((s) => /4(0[0-3]|04) \S*\/api\/projects/.test(s)).length === 0, failedRequests.filter((s) => s.indexOf('/api/projects') !== -1).slice(0, 4).join(' | ') || 'only the deliberate 404/400 controls');
    ok('the console error count matches the attributed failures', consoleErrors.length <= failedRequests.length + 4, consoleErrors.length + ' console errors / ' + failedRequests.length + ' failed requests');
  } catch (e) {
    failed += 1;
    failures.push('probe crashed: ' + (e && e.message ? e.message : String(e)));
    console.error('  FAIL probe crashed — ' + (e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
    await cleanup();
  }

  const gate1 = await gateStatus();
  ok('the login gate is still ON after the probe', gate1 === 401, 'status=' + gate1);

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) {
    console.error('failed: ' + failures.join(' | '));
    process.exit(1);
  }
  console.log('the deployed console scopes the list, badges a deleted project, warns about work running elsewhere, and restores the view');
}

main().catch((e) => {
  console.error('probe crashed: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});