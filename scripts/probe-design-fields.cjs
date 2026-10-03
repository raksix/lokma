#!/usr/bin/env node
/**
 * REQ-190 §3 - live BROWSER probe: the editable field surfaces (the
 * "Figma-ish" shortcut row) reduce to the ONE metered write path.
 *
 * Three slices landed with unit tests only, so nothing had ever measured the
 * DEPLOYED page. This probe drives the real SPA (authed with a minted Bearer
 * token - the login gate stays ON, see scripts/mint-e2e-token.mjs) and asserts
 * the claims §3 makes, at the DOM and on the wire:
 *
 *   A  the field strip mounts INSIDE the versions drawer (not as a second
 *      surface) and carries exactly the six §3 fields
 *   B  honesty: the chips read the value the manifest really records
 *      (type / system / model) and print "-" for the three that live only in
 *      the HTML (palette / density / content) instead of pretending
 *   C  a field pick produces EXACTLY ONE POST to /api/design/:id/tweak whose
 *      body carries the generated sentence, and ZERO POSTs to
 *      /api/design/generate - a field pick is not a second generation path
 *   D  it really is the same write path: the free-text composer is PRE-FILLED
 *      with that sentence (one implementation, two entries)
 *   E  the no-op guard is visible in the DOM: the row equal to the current
 *      value is not offered at all
 *   F  an EMPTY content block cannot fire (Apply disabled) and a non-empty one
 *      reaches the same tweak call
 *   G  a closed model catalog leaves the Model control DISABLED with the
 *      reason in its title (forced by stubbing the single /api/models read) -
 *      an empty dropdown is not offered
 *   H  the write refuses HONESTLY and for FREE: the page holds a sha lock, so
 *      the probe stales it and the server answers 409 `stale_version` BEFORE
 *      any model call (runTweak's fail-fast). The refusal must reach the panel
 *      and create NO version - a fake success would be worse than nothing
 *   I  cleanup: the artifact is deleted, 404s afterwards, and tokenless
 *      /api/auth/me is still 401
 *
 * Cost: ZERO model credits, by construction rather than by luck. A field pick
 * carries no `model`, so left alone it would resolve the LIVE default provider
 * and spend a minute of real tokens. Staling the lock the page holds turns the
 * same click into the pre-model refusal, so every check still drives the real
 * page path (sentence built, POSTed to /tweak, error rendered) for nothing.
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-design-fields.cjs --url http://127.0.0.1:3457 --token "$TK"
 */
const { chromium } = require('playwright-core');
const { mkdirSync, rmSync } = require('node:fs');
const { writeFileSync } = require('node:fs');

const readFlag = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = readFlag('url', 'http://127.0.0.1:3457');
const API = readFlag('api', 'http://127.0.0.1:3456');
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN = readFlag('token', '') || process.env.TOKEN;
const SHOT = readFlag('shot', '/tmp/probe-design-fields.png');
const OUT = readFlag('out', '/tmp/lokma-req190');
const PROJ = OUT + '/fields-proj';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DASH = String.fromCharCode(0x2014);

if (!TOKEN) {
  console.error('missing --token (mint one with scripts/mint-e2e-token.mjs)');
  process.exit(2);
}

let artifactId = null;
const failures = [];
let passed = 0;
const ok = (name, pass, detail) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  - ' + detail : ''));
  if (pass) passed += 1;
  else failures.push(name);
};

const api = async (path, method, body) => {
  const headers = { Authorization: 'Bearer ' + TOKEN };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, {
    method: method || 'GET',
    headers: headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  return { status: res.status, json: json };
};
const withCwd = (path) => path + (path.indexOf('?') >= 0 ? '&' : '?') + 'cwd=' + encodeURIComponent(PROJ);

// - page-side readers (browser globals only) --------------------------------

const stripState = () => {
  const strip = document.querySelector('[data-design-field-strip]');
  if (!strip) return null;
  const toggles = {};
  [].slice.call(strip.querySelectorAll('[data-design-field-toggle]')).forEach((b) => {
    toggles[b.getAttribute('data-design-field-toggle')] = {
      label: (b.textContent || '').replace(/\s+/g, ' ').trim(),
      disabled: Boolean(b.disabled),
      title: b.getAttribute('title'),
      expanded: b.getAttribute('aria-expanded'),
    };
  });
  const apply = [];
  [].slice.call(document.querySelectorAll('[data-design-field-apply]')).forEach((b) => {
    apply.push({ value: b.getAttribute('data-design-field-apply'), disabled: Boolean(b.disabled) });
  });
  const ta = document.querySelector('[data-design-field-content]');
  return {
    toggles: toggles,
    apply: apply,
    fieldOrder: [].slice.call(strip.querySelectorAll('[data-design-field-toggle]')).map((b) =>
      b.getAttribute('data-design-field-toggle'),
    ),
    contentOpen: Boolean(ta),
    contentDisabled: ta ? Boolean(ta.disabled) : null,
    // A tweak in flight disables every field control (busy = s.tweaking), and
    // a click on a disabled button is a SILENT no-op - so the probe must wait
    // for the settled state instead of sleeping a fixed interval and then
    // measuring mid-flight. (A field pick is never left to run here: see
    // staleTheLock - a real pick would spend metered model credits.)
    busy: (function () {
      const run = document.querySelector('[data-design-tweak-run]');
      return Boolean(run) && /Tweaking/.test(run.textContent || '');
    })(),
    tweakNote: (function () {
      const n = document.querySelector('[data-design-tweak-input]');
      return n ? n.value : null;
    })(),
    tweakError: (function () {
      const e = document.querySelector('[data-design-tweak-error]');
      return e ? (e.textContent || '').trim() : null;
    })(),
    versionsCount: (function () {
      const c = document.querySelector('[data-design-versions-count]');
      return c ? (c.textContent || '').replace(/\s+/g, ' ').trim() : null;
    })(),
  };
};

const clickSel = (sel) => {
  const b = document.querySelector(sel);
  if (!b) return false;
  b.click();
  return true;
};

const waitStudio = async (page) => {
  await page.waitForSelector('[data-design-page]', { timeout: 25000 });
  for (let i = 0; i < 40; i += 1) {
    const ready = await page.evaluate(() => {
      const root = document.querySelector('[data-design-page]');
      if (!root) return false;
      if ((root.textContent || '').indexOf('Loading artifacts') >= 0) return false;
      return Boolean(root.querySelector('[data-design-composer]'));
    });
    if (ready) return true;
    await sleep(400);
  }
  return false;
};

/**
 * Wait until the drawer's Tweak button is idle again.
 */
const waitSettled = async (page, ms = 60000) => {
  for (let i = 0; i * 500 < ms; i += 1) {
    const s = await page.evaluate(stripState);
    if (s && !s.busy) return s;
    await sleep(500);
  }
  return page.evaluate(stripState);
};

/**
 * Make the picker fire into the FAST refusal path instead of a real metered
 * run. A field pick carries no `model`, so the server would resolve the live
 * default provider and burn credits for a minute - not a probe's business.
 *
 * Staling the lock the page holds (`expectedSha`) turns the same click into
 * the 409 `stale_version` refusal, which the server raises BEFORE any model
 * call (runTweak's fail-fast), so the whole run stays free and settles in
 * under a second - while the PAGE path under test is untouched: the page
 * still builds the sentence, still POSTs to /tweak, still renders the error.
 */
const staleTheLock = async (page) => {
  await page.evaluate(() => {
    const w = window;
    w.__probeTweakBodies = [];
    const realFetch = w.fetch.bind(w);
    w.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input && input.url ? input.url : '';
      const method = (init && init.method) || (input && input.method) || 'GET';
      if (method === 'POST' && url.indexOf('/tweak') >= 0 && init && init.body) {
        try {
          const body = JSON.parse(init.body);
          // Snapshot BEFORE mutating: `push(body)` would store a live
          // reference, so the later assignment would rewrite the captured
          // "page-built" body too (the capture then proves nothing).
          w.__probeTweakBodies.push(Object.assign({}, body));
          if (typeof body.expectedSha === 'string') body.expectedSha = 'probe-stale-sha';
          return realFetch(input, Object.assign({}, init, { body: JSON.stringify(body) }));
        } catch (e) {
          /* fall through to the untouched call */
        }
      }
      return realFetch(input, init);
    };
  });
};

(async () => {
  mkdirSync(OUT, { recursive: true });
  rmSync(PROJ, { recursive: true, force: true });
  mkdirSync(PROJ, { recursive: true });

  // - seed ONE artifact with the offline template (zero model cost) ---------
  const gen = await api('/api/design/generate', 'POST', {
    type: 'prototype',
    system: 'stripe-linear',
    brief: 'REQ-190 field probe landing',
    model: 'offline-template',
    cwd: PROJ,
  });
  ok('A: the seed generate answers 200', gen.status === 200 && gen.json && gen.json.ok === true, 'status=' + gen.status);
  artifactId = gen.json.id;
  console.log('INFO: artifact_id = ' + artifactId);

  const before = await api(withCwd('/api/design/' + artifactId + '/versions'));
  ok('A: the seeded artifact holds exactly one version', before.status === 200 && before.json.versions.length === 1, 'v' + before.json.currentVersion);

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: process.env.PROBE_HEADFUL !== '1',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });

  // Seed the token AND the page snapshot: the selected artifact + the probe
  // project, so the studio opens straight onto the right design (REQ-168's
  // documented restore path - clicking through the shell would be slower and
  // would depend on an unrelated list).
  await ctx.addInitScript(
    (args) => {
      try {
        localStorage.setItem('lokma-token', args.token);
        localStorage.setItem(
          'lokma-design-page:v1',
          JSON.stringify({
            selected: args.id,
            form: { type: 'prototype', system: 'stripe-linear', brief: '', model: '' },
            project: args.proj,
            artifactsPanel: false,
          }),
        );
      } catch (e) {
        /* ignore */
      }
    },
    { token: TOKEN, id: artifactId, proj: PROJ },
  );

  const page = await ctx.newPage();
  const errors = [];
  // THE wire proof: every POST the page makes to the design API, with its body.
  const wire = { tweak: [], generate: [], other: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 160)));
  page.on('request', (r) => {
    if (r.method() !== 'POST') return;
    const u = r.url();
    if (u.indexOf('/api/design/generate') >= 0) wire.generate.push(r.postData() || '');
    else if (u.indexOf('/tweak') >= 0) wire.tweak.push(r.postData() || '');
    else if (u.indexOf('/api/design/') >= 0) wire.other.push(u + ' ' + (r.postData() || ''));
  });

  const report = async () => {
    const jsErrors = errors.filter((e) => e.indexOf('Failed to load resource') === -1);
    ok('I: no JavaScript errors on the page', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | ') || 'clean');

    if (artifactId) {
      await api(withCwd('/api/design/' + artifactId), 'DELETE');
    }
    rmSync(PROJ, { recursive: true, force: true });
    let gone = false;
    if (artifactId) {
      for (let i = 0; i < 3 && !gone; i += 1) {
        await sleep(1000);
        const r = await api(withCwd('/api/design/' + artifactId));
        gone = r.status === 404;
      }
    }
    ok('I: the probe artifact is deleted and stays gone', gone, 'id=' + artifactId);
    const noAuth = await fetch(API + '/api/auth/me', { signal: AbortSignal.timeout(15000) });
    ok('I: tokenless /api/auth/me is still 401 (the login gate stayed ON)', noAuth.status === 401, 'status=' + noAuth.status);

    const summary = {
      probe: 'probe-design-fields',
      passed: passed,
      failures: failures,
      artifact_id: artifactId,
      wire_tweak_posts: wire.tweak.length,
      wire_generate_posts: wire.generate.length,
      cleanup: 'artifact deleted, temp tree removed, gate verified',
    };
    try {
      writeFileSync(OUT + '/fields-summary.json', JSON.stringify(summary, null, 2));
      console.log('EVIDENCE: ' + OUT + '/fields-summary.json');
    } catch (e) {
      console.log('evidence write failed (non-fatal): ' + String(e).slice(0, 100));
    }

    await browser.close();
    if (failures.length) {
      console.log('\nprobe-design-fields: ' + failures.length + ' failure(s): ' + failures.join(', '));
      process.exit(1);
    }
    console.log('\nprobe-design-fields: all checks passed.');
  };

  // - 1 - open the studio straight onto the seeded artifact -----------------
  await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-mode-switch="design"]', { timeout: 25000 });
  await sleep(900);
  ok('the Design switch is clicked', await page.evaluate(clickSel, '[data-mode-switch="design"]'));
  await waitStudio(page);
  await sleep(1200);

  const sel = await page.evaluate(() => {
    const m = document.querySelector('[data-design-msg]');
    return m ? m.getAttribute('data-design-msg') : null;
  });
  ok('A: the snapshot restored the probe artifact as the selection', sel === artifactId, 'selected=' + sel + ' expected=' + artifactId);

  // - A - the strip lives INSIDE the versions drawer, not beside it ---------
  ok('A: no field strip before the versions drawer opens', !(await page.evaluate(() => Boolean(document.querySelector('[data-design-field-strip]')))));
  ok('A: the Versions toolbar button is present', await page.evaluate(clickSel, '[data-design-versions-toggle]'));
  await sleep(700);
  let S = await page.evaluate(stripState);
  ok('A: the versions drawer is open', Boolean(S), S ? '' : 'no strip');
  ok(
    'A: the field strip carries exactly the six REQ-190 §3 fields',
    Boolean(S) && JSON.stringify(S.fieldOrder) === JSON.stringify(['type', 'system', 'palette', 'density', 'model', 'content']),
    S ? JSON.stringify(S.fieldOrder) : 'n/a',
  );
  ok('A: the free-text tweak composer is in the same drawer', Boolean(S && typeof S.tweakNote === 'string'), S ? 'tweakNote=' + JSON.stringify(S.tweakNote) : 'n/a');

  // - B - honest chips: recorded vs unknown ---------------------------------
  ok(
    'B: the Type chip shows the manifest value (prototype)',
    Boolean(S && S.toggles.type && S.toggles.type.label.indexOf('prototype') >= 0),
    S ? S.toggles.type.label : 'n/a',
  );
  ok(
    'B: the System chip shows the manifest value (stripe-linear)',
    Boolean(S && S.toggles.system && S.toggles.system.label.indexOf('stripe-linear') >= 0),
    S ? S.toggles.system.label : 'n/a',
  );
  ok(
    'B: the Model chip shows the manifest model (offline-template)',
    Boolean(S && S.toggles.model && S.toggles.model.label.indexOf('offline-template') >= 0),
    S ? S.toggles.model.label : 'n/a',
  );
  const dashFields = ['palette', 'density'];
  ok(
    'B: Palette/Density print ' + DASH + ' (the manifest does not record them) instead of guessing',
    Boolean(S) && dashFields.every((f) => S.toggles[f] && S.toggles[f].label.indexOf(DASH) >= 0),
    S ? dashFields.map((f) => f + '=' + (S.toggles[f] ? S.toggles[f].label : 'n/a')).join(' | ') : 'n/a',
  );

  // - E - the no-op row is not even offered ---------------------------------
  ok('E: the Type picker opens', await page.evaluate(clickSel, '[data-design-field-toggle="type"]'));
  await sleep(450);
  S = await page.evaluate(stripState);
  const typeRows = S ? S.apply.map((a) => a.value) : [];
  ok('E: the Type picker offers the other types', typeRows.indexOf('deck') >= 0, 'rows=' + JSON.stringify(typeRows));
  ok(
    'E: the current value is NOT offered (no metered no-op)',
    typeRows.indexOf('prototype') === -1,
    'rows=' + JSON.stringify(typeRows),
  );
  ok('E: the picker closes when re-clicked', await page.evaluate(clickSel, '[data-design-field-toggle="type"]'));
  await sleep(300);
  ok('E: re-clicking the toggle closes the picker', !(await page.evaluate(() => document.querySelectorAll('[data-design-field-apply]').length > 0)));

  // - C/D - one field pick = exactly one tweak call, with the note filled in
  await staleTheLock(page);
  const tweakPostsBefore = wire.tweak.length;
  const genPostsBefore = wire.generate.length;
  ok('C: the Type picker re-opens for the apply step', await page.evaluate(clickSel, '[data-design-field-toggle="type"]'));
  await sleep(400);
  ok('C: the deck option is clickable', await page.evaluate(clickSel, '[data-design-field-apply="deck"]'));
  let tweakBody = null;
  for (let i = 0; i < 40 && wire.tweak.length === tweakPostsBefore; i += 1) await sleep(300);
  // The page-built body comes from the shim (pre-stale); the wire capture
  // would show the probe's own sha and prove nothing about the page.
  tweakBody = await page.evaluate(() => (window.__probeTweakBodies || [])[0] || null);
  ok('C: the field pick sent EXACTLY ONE tweak POST', wire.tweak.length === tweakPostsBefore + 1, 'tweakPosts=' + wire.tweak.length);
  ok('C: it sent NO generate POST (a pick is not a second generation path)', wire.generate.length === genPostsBefore, 'generatePosts=' + wire.generate.length);
  ok('C: the body carries the generated tweak sentence', Boolean(tweakBody && typeof tweakBody.note === 'string' && tweakBody.note.indexOf('deck') >= 0), tweakBody ? JSON.stringify(tweakBody).slice(0, 200) : 'no body captured');
  ok(
    'C: the page sent its OWN sha lock (not the probe\'s staled copy)',
    Boolean(tweakBody && typeof tweakBody.expectedSha === 'string' && /^[0-9a-f]{16,}$/.test(tweakBody.expectedSha)),
    tweakBody ? 'expectedSha=' + String(tweakBody.expectedSha).slice(0, 16) : 'n/a',
  );
  ok('C: the body carries the scoped cwd', Boolean(tweakBody && tweakBody.cwd === PROJ), tweakBody ? 'cwd=' + String(tweakBody.cwd) : 'n/a');

  // The refusal settles in well under a second (the lock is checked before the
  // model call), but wait for the state rather than trusting a fixed interval.
  S = await waitSettled(page);
  ok('C: the drawer settled back to idle after the pick', Boolean(S && !S.busy), S ? 'busy=' + S.busy : 'n/a');
  ok(
    'D: the SAME sentence is visible in the free-text composer (one write path)',
    Boolean(S && tweakBody && S.tweakNote === tweakBody.note),
    S ? 'composer=' + JSON.stringify(String(S.tweakNote).slice(0, 80)) : 'n/a',
  );

  // - H - the metered path refuses HONESTLY here, before it can spend ------
    ok(
      'H: the refusal reaches the panel (no fake success)',
      Boolean(S && S.tweakError && S.tweakError.length > 0),
      S ? 'error=' + JSON.stringify(String(S.tweakError).slice(0, 120)) : 'n/a',
    );
    ok(
      'H: the refusal is the lock, so no model call was ever spent',
      Boolean(S && S.tweakError && /changed since you loaded|reload and re-apply/i.test(S.tweakError)),
      S ? 'error=' + JSON.stringify(String(S.tweakError).slice(0, 120)) : 'n/a',
    );
  const afterPick = await api(withCwd('/api/design/' + artifactId + '/versions'));
  ok(
    'H: the refused tweak created NO version',
    afterPick.status === 200 && afterPick.json.currentVersion === 1 && afterPick.json.versions.length === 1,
    'v' + (afterPick.json ? afterPick.json.currentVersion : 'n/a'),
  );
  ok(
    'H: the versions counter still reads one version',
    Boolean(S && S.versionsCount && S.versionsCount.indexOf('1 version') >= 0),
    S ? String(S.versionsCount) : 'n/a',
  );

  // - F - content: an empty block cannot fire, a filled one reuses the path --
  ok('F: the Content toggle opens the free-text block', await page.evaluate(clickSel, '[data-design-field-toggle="content"]'));
  await sleep(450);
  S = await page.evaluate(stripState);
  ok('F: the content textarea mounts', Boolean(S && S.contentOpen), S ? 'open=' + S.contentOpen : 'n/a');
  ok(
    'F: Apply is DISABLED while the block is empty',
    Boolean(S && S.apply.some((a) => a.value === 'content' && a.disabled === true)),
    S ? JSON.stringify(S.apply) : 'n/a',
  );
  const beforeContent = wire.tweak.length;
  await page.fill('[data-design-field-content]', 'Fresh replacement copy for the probe.');
  await sleep(350);
  ok(
    'F: Apply enables once the block has content',
    await page.evaluate(() => {
      const b = document.querySelector('[data-design-field-apply="content"]');
      return Boolean(b) && !b.disabled;
    }),
  );
  ok('F: the content Apply is clickable', await page.evaluate(clickSel, '[data-design-field-apply="content"]'));
  for (let i = 0; i < 40 && wire.tweak.length === beforeContent; i += 1) await sleep(300);
  let contentBody = null;
  if (wire.tweak.length > beforeContent) {
    try {
      contentBody = JSON.parse(wire.tweak[beforeContent]);
    } catch (e) {
      contentBody = null;
    }
  }
  ok('F: the content block sent its own single tweak POST', wire.tweak.length === beforeContent + 1, 'tweakPosts=' + wire.tweak.length);
  ok(
    'F: the content note carries the pasted copy',
    Boolean(contentBody && typeof contentBody.note === 'string' && contentBody.note.indexOf('Fresh replacement copy') >= 0),
    contentBody ? JSON.stringify(contentBody.note).slice(0, 160) : 'no body captured',
  );
  await waitSettled(page);

  // - G - an empty model catalog must not offer an empty picker -------------
  await page.route('**/api/models', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [], count: 0, enabledCount: 0, cached: true }) }),
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-mode-switch="design"]', { timeout: 25000 });
  await sleep(900);
  await page.evaluate(clickSel, '[data-mode-switch="design"]');
  await waitStudio(page);
  await sleep(1200);
  await page.evaluate(clickSel, '[data-design-versions-toggle]');
  await sleep(800);
  S = await page.evaluate(stripState);
  ok(
    'G: an empty model catalog leaves the Model control DISABLED',
    Boolean(S && S.toggles.model && S.toggles.model.disabled === true),
    S && S.toggles.model ? 'disabled=' + S.toggles.model.disabled : 'n/a',
  );
  ok(
    'G: the disabled control states the reason in its title',
    Boolean(S && S.toggles.model && typeof S.toggles.model.title === 'string' && S.toggles.model.title.indexOf('model options') >= 0),
    S && S.toggles.model ? 'title=' + JSON.stringify(S.toggles.model.title) : 'n/a',
  );
  ok(
    'G: the other fields stay enabled (the stub scoped ONE endpoint)',
    Boolean(S) && ['type', 'palette', 'density', 'content'].every((f) => S.toggles[f] && S.toggles[f].disabled === false),
    S ? ['type', 'palette', 'density', 'content'].map((f) => f + '=' + (S.toggles[f] ? S.toggles[f].disabled : 'n/a')).join(' | ') : 'n/a',
  );
  await page.unroute('**/api/models');
  await sleep(200);

  try {
    await page.screenshot({ path: SHOT });
    console.log('screenshot: ' + SHOT);
  } catch (e) {
    console.log('screenshot failed (non-fatal): ' + String(e).slice(0, 120));
  }

  console.log('WIRE: tweak POSTs=' + wire.tweak.length + ' generate POSTs=' + wire.generate.length + ' other design POSTs=' + wire.other.length);
  await report();
})().catch(async (e) => {
  console.error('probe crashed:', e && e.message ? e.message : e);
  if (artifactId) {
    try {
      await api(withCwd('/api/design/' + artifactId), 'DELETE');
      rmSync(PROJ, { recursive: true, force: true });
      console.log('CLEANUP: probe artifact + temp tree removed');
    } catch (e2) {
      console.log('CLEANUP failed (best effort)');
    }
  }
  process.exit(1);
});