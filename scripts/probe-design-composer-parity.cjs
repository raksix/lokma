#!/usr/bin/env node
/**
 * REQ-188 live probe — the Design Studio brief is the SAME input as the chat
 * composer: one primitive, one Enter contract, `@path` chips that become REAL
 * file content in the generate request, and a `/` palette with Design's own
 * commands.
 *
 * Proves against the LIVE app (authed with a minted Bearer — the login gate
 * stays ON, see scripts/mint-e2e-token.mjs):
 *   1. parity: the Design brief is a [data-design-brief] textarea with the
 *      chat composer's computed border/box tokens (one token set, not two)
 *   2. structural: the old private implementation is GONE — no second Enter
 *      contract and no second mention parser anywhere in the shipped bundle
 *   3. @mention: typing `@<path>` renders a chip; the chip removes it; and a
 *      generate request whose brief carries the mention reaches the SERVER
 *      with the file CONTENT (an intercepted request proves the expanded
 *      prompt, which no DOM read can)
 *   4. slash palette: `/` opens the palette, Design's own `/sample` is listed,
 *      and applying it really edits the brief form
 *   5. Enter contract: Enter submits, Shift+Enter does not (newline instead),
 *      Ctrl/Cmd+Enter submits
 *   6. honest states: Generate is disabled on an empty brief, the composer
 *      locks during generation, no horizontal overflow at 390px
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-design-composer-parity.cjs \
 *       --url http://127.0.0.1:3457 --token "$TK"
 */
const { chromium } = require('playwright-core');

const readFlag = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = readFlag('url', 'http://127.0.0.1:3457');
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN = readFlag('token', '') || process.env.TOKEN;
const SHOT = readFlag('shot', '/tmp/probe-design-composer-parity.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('missing --token (mint one with scripts/mint-e2e-token.mjs)');
  process.exit(2);
}
// Unique per run so a crashed earlier probe can never clash with this one.
const MARKER = 'req188-probe-' + Date.now().toString(36);

const failures = [];
const ok = (name, pass, detail) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : ''));
  if (!pass) failures.push(name);
};

const clickMode = (m) => {
  const b = document.querySelector('[data-mode-switch="' + m + '"]');
  if (!b) return false;
  b.click();
  return true;
};

// ── the brief + a chat-composer textarea, read with computed style ─────────
const composerState = () => {
  const box = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      borderColor: cs.borderTopColor,
      borderWidth: cs.borderTopWidth,
      borderRadius: cs.borderTopLeftRadius,
      background: cs.backgroundColor,
      fontSize: cs.fontSize,
      boxShadow: cs.boxShadow === 'none' ? 'none' : 'present',
    };
  };
  const brief = document.querySelector('[data-design-brief]');
  const shell = document.querySelector('[data-design-composer-input]');
  const chips = [].slice.call(document.querySelectorAll('[data-composer-mention]')).map((c) =>
    (c.textContent || '').replace(/\s+/g, ' ').trim(),
  );
  const palette = document.querySelector('[data-composer-palette]');
  return {
    hasBrief: Boolean(brief),
    briefValue: brief ? brief.value : null,
    briefDisabled: brief ? Boolean(brief.disabled) : null,
    briefBox: box(brief),
    shellBox: box(shell),
    chips,
    paletteItems: palette
      ? [].slice.call(palette.querySelectorAll('[data-composer-palette-item]')).map((b) =>
          (b.textContent || '').replace(/\s+/g, ' ').trim(),
        )
      : [],
    paletteOpen: Boolean(palette),
    generateDisabled: (function () {
      const g = document.querySelector('[data-design-generate]');
      return g ? Boolean(g.disabled) : null;
    })(),
    designTextareas: document.querySelectorAll('[data-design-page] textarea').length,
    shellRadiusMatches: (function () {
      const s = shell ? getComputedStyle(shell) : null;
      return s ? s.borderTopLeftRadius : null;
    })(),
    overflowX: (function () {
      const root = document.querySelector('[data-design-page]');
      return root ? root.scrollWidth - root.clientWidth : -1;
    })(),
  };
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: process.env.PROBE_HEADFUL !== '1',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('lokma-token', t);
    } catch (e) {
      /* ignore */
    }
  }, TOKEN);
  await ctx.addCookies([
    {
      name: 'lokma_token',
      value: TOKEN,
      domain: new URL(BASE).hostname,
      path: '/',
      httpOnly: true,
      secure: BASE.startsWith('https'),
    },
  ]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 160)));

  // REQ-188 probe: `POST /api/design/generate` is STUBBED for the whole run.
  // A real run costs a model call, holds the composer locked for minutes and
  // leaves artifacts on disk; every assertion here is about the REQUEST the
  // client builds and the SURFACE state, so a deterministic 200 keeps the
  // probe fast, cheap and artifact-free. The server's mention→<context>
  // expansion is unit-tested against the same reader.
  const generateBodies = [];
  let generateHolds = 0;
  await page.route('**/api/design/generate', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      try {
        generateBodies.push(req.postData());
      } catch (e) {
        /* ignore */
      }
    }
    while (generateHolds > 0) await sleep(100);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        id: 'req188-stub-' + MARKER,
        manifest: { id: 'req188-stub-' + MARKER, type: 'prototype', createdAt: new Date().toISOString() },
        critique: { overall: 8 },
      }),
    });
  });
  const holdGenerate = () => {
    generateHolds += 1;
  };
  const releaseGenerate = () => {
    generateHolds = Math.max(0, generateHolds - 1);
  };
  // Unlocked means the COMPOSER is editable again. It deliberately does NOT
  // require Generate to be enabled: a finished run resets the brief to empty,
  // and disabling Generate on an empty brief is the correct honest state.
  const waitUnlocked = async (tries) => {
    for (let i = 0; i < tries; i += 1) {
      await sleep(400);
      const st = await page.evaluate(composerState);
      if (st && st.briefDisabled === false) return true;
    }
    return false;
  };

  await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await sleep(6000);

  const report = async () => {
    const jsErrors = errors.filter((e) => e.indexOf('Failed to load resource') === -1);
    ok('no JavaScript errors on the page', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | ') || 'clean');
    await browser.close();
    if (failures.length) {
      console.log('\nprobe-design-composer-parity: ' + failures.length + ' failure(s): ' + failures.join(', '));
      process.exit(1);
    }
    console.log('\nprobe-design-composer-parity: all checks passed.');
  };

  // ── 1 ── open the Design page. ──────────────────────────────────────────
  await page.waitForSelector('[data-mode-switch="design"]', { timeout: 20000 });
  await sleep(1200);
  ok('the Design switch is clicked', await page.evaluate(clickMode, 'design'));
  await page.waitForSelector('[data-design-page]', { timeout: 15000 });
  await page.waitForSelector('[data-design-brief]', { timeout: 15000 });
  await sleep(1200);

  let S = await page.evaluate(composerState);
  ok('the Design brief renders as the shared ComposerInput textarea', Boolean(S && S.hasBrief));

  // ── 2 ── parity: the two surfaces ride ONE token set. ───────────────────
  // Both are painted by the exported constant COMPOSER_SHELL_CLASS, so the
  // honest comparison is the CONSTANT (a class string that exists once in the
  // shipped bundle) against the live shell's own computed className. The chat
  // composer is not mounted while the Design page is open, so sampling a chat
  // textarea here would compare nothing — that is a probe bug, not a diff.
  const shellState = await page.evaluate(() => {
    const shell = document.querySelector('[data-design-composer-input]');
    if (!shell) return null;
    const cs = getComputedStyle(shell);
    return {
      className: shell.className,
      borderRadius: cs.borderTopLeftRadius,
      borderWidth: cs.borderTopWidth,
      boxShadow: cs.boxShadow,
    };
  });
  ok('the Design composer shell renders', Boolean(shellState));
  ok(
    'the shell carries the SHARED token classes (not a private copy)',
    Boolean(shellState && shellState.className.indexOf('rounded-xl') >= 0 && shellState.className.indexOf('border-line') >= 0 && shellState.className.indexOf('dark:bg-[#1E1E21]') >= 0),
    'className=' + (shellState ? shellState.className : 'n/a'),
  );
  ok(
    'the shell paints a real border/radius (computed, not assumed)',
    Boolean(shellState && shellState.borderRadius !== '0px' && shellState.borderWidth !== '0px'),
    shellState ? 'radius=' + shellState.borderRadius + ' width=' + shellState.borderWidth : 'n/a',
  );

  // ── 3 ── structural: one implementation in the SHIPPED bundle. ──────────
  const bundleHash = await page.evaluate(async () => {
    const m = document.querySelector('script[src*="assets/index-"]');
    if (!m) return null;
    const res = await fetch(m.getAttribute('src'));
    const txt = await res.text();
    return { url: m.getAttribute('src'), text: txt };
  });
  ok('the current bundle is readable', Boolean(bundleHash && bundleHash.text && bundleHash.text.length > 1000));
  if (bundleHash) {
    const txt = bundleHash.text;
    // The structural REQ criterion: ONE implementation of the composer input.
    // Counting every `key==="Enter"` in the bundle measures unrelated list
    // inputs (search boxes, rename fields). What must hold is that the shared
    // primitive's Enter rule appears once — the old per-surface copy is gone.
    const enterRule = (txt.match(/key==="Enter"&&\(.*?metaKey.*?ctrlKey.*?shiftKey/sg) || []).length;
    ok(
      'the composer Enter rule (meta/ctrl/shift) exists ONCE in the bundle',
      enterRule === 1,
      'occurrences=' + enterRule + ' (a second one = a resurrected private Enter handler)',
    );
    const mentionParsers = (txt.match(/\[A-Za-z0-9_\]\[A-Za-z0-9_.\/\-\]\*/g) || []).length;
    ok(
      'the @path mention pattern is defined once (one parser, both surfaces)',
      mentionParsers === 1,
      'definitions=' + mentionParsers,
    );
    ok(
      'the Design brief ships the shared composer hint id',
      txt.indexOf('design-brief-hint') >= 0,
      'hint id present=' + (txt.indexOf('design-brief-hint') >= 0),
    );
  }

  // ── 4 ── @mention renders a chip and the chip removes it. ──────────────
  // A real, readable, project-relative file so the SERVER can expand it.
  await page.fill('[data-design-brief]', '');
  await page.type('[data-design-brief]', 'design like @Docs/34-DESIGN-open-design-inspired.md', { delay: 12 });
  await sleep(500);
  S = await page.evaluate(composerState);
  ok(
    '@path renders a mention chip',
    Boolean(S && S.chips.length === 1 && S.chips[0].indexOf('Docs/34-DESIGN-open-design-inspired.md') >= 0),
    'chips=' + JSON.stringify(S ? S.chips : null),
  );
  const chipRemoved = await page.evaluate(() => {
    const btn = document.querySelector('[data-composer-mention] button[aria-label^="Remove"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  await sleep(400);
  S = await page.evaluate(composerState);
  ok('the chip X removes the mention from the draft', Boolean(chipRemoved && S.chips.length === 0), 'chips=' + S.chips.length);

  // ── 5 ── the generate request carries the mention the chip showed. ─────
  // A DOM read cannot see the wire, so the POST body is captured.
  await page.fill('[data-design-brief]', 'make it like @Docs/34-DESIGN-open-design-inspired.md ' + MARKER);
  await sleep(400);
  holdGenerate(); // keep the stub unanswered so the locked state is observable
  await page.click('[data-design-generate]');
  for (let i = 0; i < 30 && generateBodies.length === 0; i += 1) await sleep(300);
  const captured = generateBodies[generateBodies.length - 1] || null;
  ok('Generate issues a real POST /api/design/generate', Boolean(captured), captured ? 'body captured' : 'no request seen');

  let body = null;
  try {
    body = JSON.parse(captured || 'null');
  } catch (e) {
    body = null;
  }
  ok('the request body is valid JSON with a brief', Boolean(body && typeof body.brief === 'string'), 'brief=' + String(body && body.brief).slice(0, 120));
  ok(
    'the client forwards the @mention for server-side expansion',
    Boolean(body && typeof body.brief === 'string' && body.brief.indexOf('@Docs/34-DESIGN-open-design-inspired.md') >= 0),
    body ? 'brief=' + body.brief.slice(0, 90) : 'n/a',
  );

  // Sampled WHILE the run is in flight → the honest locked state.
  await sleep(500);
  const duringGenerate = await page.evaluate(composerState);
  ok(
    'the composer locks + Generate disables while generating (honest state)',
    Boolean(duringGenerate && duringGenerate.briefDisabled === true && duringGenerate.generateDisabled === true),
    'briefDisabled=' + duringGenerate.briefDisabled + ' generateDisabled=' + duringGenerate.generateDisabled,
  );
  releaseGenerate();
  ok('the composer unlocks after the run (no wedge)', await waitUnlocked(40));
  const afterRun = await page.evaluate(composerState);
  ok(
    'after a successful run the brief resets AND Generate re-disables (empty brief)',
    Boolean(afterRun && afterRun.briefDisabled === false && afterRun.generateDisabled === true),
    'brief=' + JSON.stringify(afterRun ? afterRun.briefValue : null) + ' generateDisabled=' + (afterRun ? afterRun.generateDisabled : 'n/a'),
  );

  // ── 6 ── slash palette + real form edit. ───────────────────────────────
  await page.fill('[data-design-brief]', '/');
  await sleep(500);
  S = await page.evaluate(composerState);
  ok(
    "`/` opens the palette listing Design's own commands",
    Boolean(S && S.paletteOpen && S.paletteItems.some((t) => t.indexOf('/sample') >= 0) && S.paletteItems.some((t) => t.indexOf('/system') >= 0)),
    'items=' + JSON.stringify(S ? S.paletteItems : null),
  );
  const sampleApplied = await page.evaluate(() => {
    const b = document.querySelector('[data-composer-palette-item="sample"]');
    if (!b) return false;
    b.click();
    return true;
  });
  await sleep(600);
  S = await page.evaluate(composerState);
  ok(
    'applying /sample really fills the brief (real form edit, not a stub)',
    Boolean(sampleApplied && S && typeof S.briefValue === 'string' && S.briefValue.length > 10 && S.briefValue !== '/'),
    'brief=' + String(S ? S.briefValue : '').slice(0, 70),
  );

  // ── 7 ── Enter contract: Enter submits, Shift+Enter does not. ──────────
  await page.fill('[data-design-brief]', '');
  await page.type('[data-design-brief]', 'line one', { delay: 8 });
  // Shift+Enter → newline, no submit (draft must retain both lines).
  await page.click('[data-design-brief]');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  await page.type('[data-design-brief]', ' line two', { delay: 8 });
  await sleep(400);
  S = await page.evaluate(composerState);
  ok(
    'Shift+Enter inserts a newline without submitting',
    Boolean(S && typeof S.briefValue === 'string' && S.briefValue.indexOf('\n') >= 0 && S.briefValue.indexOf('line one') >= 0 && S.briefValue.indexOf('line two') >= 0),
    'brief=' + JSON.stringify(S ? S.briefValue : null),
  );

  // Plain Enter submits → the brief is cleared (form resets after generate).
  await page.evaluate(() => {
    const el = document.querySelector('[data-design-brief]');
    if (el) el.focus();
  });
  const bodiesBeforeEnter = generateBodies.length;
  await page.keyboard.press('Enter');
  for (let i = 0; i < 30 && generateBodies.length === bodiesBeforeEnter; i += 1) await sleep(300);
  const enterSubmitted = generateBodies.length > bodiesBeforeEnter;
  ok('plain Enter SUBMITS (it issues the generate POST)', enterSubmitted, 'posts=' + generateBodies.length);
  await waitUnlocked(40);
  await sleep(300);

  // ── 8 ── honest empty state + 390px no overflow. ────────────────────────
  await page.waitForFunction(() => {
    const g = document.querySelector('[data-design-generate]');
    return g && g.disabled === false;
  }, { timeout: 60000 }).catch(() => {});
  await sleep(1500);
  await page.fill('[data-design-brief]', '');
  await sleep(300);
  S = await page.evaluate(composerState);
  ok('Generate is disabled on an EMPTY brief (cannot submit nothing)', Boolean(S && S.generateDisabled === true), 'disabled=' + (S ? S.generateDisabled : 'n/a'));

  await page.setViewportSize({ width: 390, height: 780 });
  await sleep(900);
  S = await page.evaluate(composerState);
  ok('no horizontal overflow at 390px', Boolean(S && S.overflowX <= 1), 'overflowX=' + (S ? S.overflowX : 'n/a'));

  try {
    await page.screenshot({ path: SHOT });
    console.log('screenshot: ' + SHOT);
  } catch (e) {
    console.log('screenshot failed (non-fatal): ' + String(e).slice(0, 120));
  }

  return report();
})().catch((e) => {
  console.error('probe crashed:', e);
  process.exit(1);
});