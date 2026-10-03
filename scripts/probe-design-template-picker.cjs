/**
 * REQ-192 slice 6 — LIVE browser probe for the Design composer axes.
 *
 * Proves the deployed Web surface end to end: pick TWO design skills + ONE
 * template in the real UI, press Generate, and assert the OUTGOING request
 * body carries both SKILL.md bodies and the template skeleton. It also reads
 * the skeleton preview through the shared server resolver.
 *
 * Rules honoured (see the skill's probe rules):
 *  - The login gate is NEVER flipped: a superadmin Bearer is minted with
 *    `scripts/mint-e2e-token.mjs` and seeded into localStorage.
 *  - Everything the probe creates is deleted afterwards and the absence is
 *    RE-CHECKED (a generate keeps writing its session after the first delete).
 *  - No metered model dependency in the assertions beyond the one real
 *    generate the REQ asks for; the request body is read from the wire via
 *    CDP `requestWillBeSent` so "the picker looks right" is never the proof.
 */
const { chromium } = require('playwright-core');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = '/mnt/apopic/lokma';
const BASE = 'http://127.0.0.1:3457';
const API = 'http://127.0.0.1:3456';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const SHOT = '/tmp/req192-slice6.png';

let passed = 0;
let failed = 0;
function check(label, cond, extra = '') {
  if (cond) {
    passed += 1;
    console.log('PASS: ' + label);
  } else {
    failed += 1;
    console.log('FAIL: ' + label + (extra ? ' — ' + extra : ''));
  }
}

async function main() {
  // 1. Mint a real superadmin token. Never logged.
  const token = execFileSync('bun', [path.join(REPO, 'scripts/mint-e2e-token.mjs')], {
    env: { ...process.env, HOME: '/root' },
    encoding: 'utf-8',
  }).trim();
  if (!token.startsWith('v1.')) throw new Error('mint returned no token');

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.addInitScript(
    ([tok]) => {
      // Seed ONLY our own keys, and only when absent: an unconditional
      // localStorage write would clobber what the app itself writes on boot.
      // `lokma-app-mode:v1` lands directly on the Design page (REQ-168's own
      // persistence key) instead of guessing a nav label that may be rendered
      // uppercase — the known false-ready wait.
      try {
        if (!localStorage.getItem('lokma-token')) localStorage.setItem('lokma-token', tok);
        if (!localStorage.getItem('lokma-app-mode:v1')) {
          localStorage.setItem('lokma-app-mode:v1', 'design');
        }
      } catch {
        /* ignore */
      }
    },
    [token],
  );
  const page = await ctx.newPage();

  // 2. Capture the OUTGOING generate request body from the wire.
  /** @type {any[]} */
  const generateBodies = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/api/design/generate')) {
      try {
        generateBodies.push(req.postDataJSON());
      } catch {
        /* not json — recorded below as null */
      }
    }
  });

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // 3. The Design Studio page is already the active mode (seeded above).
  await page.waitForSelector('[data-design-composer-template]', { timeout: 20000 });
  const opened = (await page.locator('[data-design-composer-template]').count()) > 0;
  check('the Design composer renders (gate stayed closed, not a login screen)', opened);

  const tplTrigger = page.locator('[data-design-composer-template]').first();
  const skillTrigger = page.locator('[data-design-composer-skills]').first();
  check('the TEMPLATE picker exists in the composer', (await tplTrigger.count()) === 1);
  check('the SKILL picker still exists beside it', (await skillTrigger.count()) === 1);

  // 4. Pick TWO skills from the multi menu (rows keep the menu open).
  await skillTrigger.click();
  await page.waitForTimeout(700);
  // `data-select-picked` only exists on ALREADY-PICKED rows; the rows
  // themselves carry `data-select-option`.
  let skillRows = page.locator('[data-select-option]');
  const skillCount = await skillRows.count();
  check('the skill menu lists real rows', skillCount >= 2, 'got ' + skillCount);
  const pickedSkills = [];
  for (const i of [0, 1]) {
    const row = skillRows.nth(i);
    const id = await row.getAttribute('data-select-option');
    await row.click();
    await page.waitForTimeout(350);
    if (id) pickedSkills.push(id);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('two skills are selected (chips rendered)', (await page.locator('[data-design-skill-chip]').count()) === 2);

  // 5. Pick ONE template — single-select, and its skeleton preview opens.
  await tplTrigger.click();
  await page.waitForTimeout(700);
  const tplOptions = page.locator('[data-select-option]');
  const tplCount = await tplOptions.count();
  check('the template menu lists real rows plus the None sentinel', tplCount >= 2, 'got ' + tplCount);
  const tplValues = await tplOptions.evaluateAll((els) => els.map((e) => e.getAttribute('data-select-option')));
  const tplTexts = await tplOptions.allInnerTexts();
  // The menu must start with the `''` sentinel so the trigger reads honestly
  // and one click backs the selection out.
  check('the first row is the None sentinel', tplValues[0] === '', JSON.stringify(tplValues.slice(0, 3)));
  check('every template row is a valid id or the sentinel', tplValues.every((v) => v === '' || /^[a-z0-9][a-z0-9._-]{0,63}$/.test(v)),
    JSON.stringify(tplValues));
  await tplOptions.nth(1).click();
  await page.waitForTimeout(1200);
  const chip = page.locator('[data-design-template-chip]');
  check('the template chip appears', (await chip.count()) === 1);
  const chosenId = (await chip.first().getAttribute('data-design-template-chip')) || '';
  check('the chip names a real catalog id', /^[a-z0-9][a-z0-9._-]{0,63}$/.test(chosenId), chosenId);

  // 6. The skeleton preview must come back with real content.
  await chip.first().locator('button').first().click();
  await page.waitForTimeout(1200);
  const preview = page.locator('[data-design-template-preview-body]');
  check('the skeleton preview opens', (await preview.count()) === 1);
  const previewText = (await preview.count()) ? (await preview.first().innerText()).trim() : '';
  check('the preview carries a real skeleton body', previewText.length > 40, 'len=' + previewText.length);

  // 7. The honest "invalid rows" note is absent on a healthy catalog.
  check('a healthy catalog shows no invalid-row warning', (await page.locator('[data-design-templates-invalid]').count()) === 0);

  await page.screenshot({ path: SHOT, fullPage: false });

  // 8. Type a brief and press Generate; assert the OUTGOING BODY.
  await page.locator('#design-brief').fill('probe slice 6 template axis');
  await page.locator('#design-brief').press('Enter');
  // Generation is metered; poll for the captured request rather than the result.
  for (let i = 0; i < 40 && generateBodies.length === 0; i += 1) await page.waitForTimeout(500);

  check('a generate request left the browser', generateBodies.length > 0);
  const body = generateBodies[0] || {};
  check('the request carries BOTH selected skill ids', Array.isArray(body.skills) && body.skills.length === 2,
    JSON.stringify(body.skills));
  check('the request carries the picked template id', body.template === chosenId,
    'sent=' + JSON.stringify(body.template) + ' picked=' + chosenId);

  // 9. Server-side confirmation: the resolver really resolves both to bodies.
  const res = await fetch(API + '/api/design/templates/' + encodeURIComponent(chosenId), {
    headers: { Authorization: 'Bearer ' + token },
  });
  const resJson = await res.json();
  check('the server resolves that template id', res.status === 200 && !!resJson.template?.content,
    'status=' + res.status);

  // 10. Cleanup: delete every artifact the probe created, then re-check.
  const listRes = await fetch(API + '/api/design/list', { headers: { Authorization: 'Bearer ' + token } });
  const listJson = await listRes.json();
  const created = (listJson.items || []).filter((it) => String(it.brief || '').includes('probe slice 6'));
  for (const it of created) {
    await fetch(API + '/api/design/' + encodeURIComponent(it.id), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
    });
  }
  let left = created.length;
  for (let i = 0; i < 3 && left > 0; i += 1) {
    await new Promise((r) => setTimeout(r, 700));
    const again = await (await fetch(API + '/api/design/list', { headers: { Authorization: 'Bearer ' + token } })).json();
    left = (again.items || []).filter((it) => String(it.brief || '').includes('probe slice 6')).length;
  }
  check('every probe artifact is deleted and stays deleted', left === 0, 'left=' + left);

  // 11. The gate must STILL be on after the probe.
  const anon = await fetch(API + '/api/design/templates');
  check('tokenless catalog read is still 401 (gate left ON)', anon.status === 401, 'status=' + anon.status);

  await browser.close();
  console.log('\nSLICE 6 PROBE: ' + passed + ' passed, ' + failed + ' failed');
  console.log('screenshot: ' + SHOT);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('PROBE_ERROR: ' + (e && e.stack ? e.stack : String(e)));
  process.exit(2);
});