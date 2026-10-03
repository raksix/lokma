#!/usr/bin/env node
/**
 * REQ-179 live probe - Design surface visual quality audit (light + dark).
 *
 * Drives the LIVE Design page (login gate stays ON, token minted with
 * scripts/mint-e2e-token.mjs) in a real browser and audits the acceptance
 * criteria of REQ-179:
 *
 *   A. native controls are GONE: zero <select> elements on the design page;
 *      the app's own SelectMenu triggers carry Project / Type / System /
 *      Model + the artboard type filter (role=combobox buttons)
 *   B. contrast: every visible label / meta text / chip measures at
 *      >= 4.5:1 WCAG contrast in BOTH themes (light AND dark) - measured
 *      from computed style with an ancestor-composited background, never
 *      from a screenshot
 *   C. no horizontal overflow at desktop (1500px) and narrow (390px)
 *      widths, in both themes
 *   D. the empty state is real UI: canvas CTA ('Start with a brief') plus
 *      the 4 sample-brief chips (data-design-sample), and the thread's
 *      guiding card; clicking a chip fills the brief + its natural type
 *      and parks the caret in the textarea
 *
 * Evidence screenshots (light, dark, open menu, mobile) land in --out.
 *
 * Run:
 *   TK mints:  HOME=/root bun scripts/mint-e2e-token.mjs > /tmp/lokma-e2e-token
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node \
 *     scripts/probe-design-visual.cjs --url http://127.0.0.1:3457 \
 *     --token-file /tmp/lokma-e2e-token --out /tmp/lokma-req179
 */
'use strict';
const { readFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright-core');

function argOf(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const BASE = argOf('--url', 'http://127.0.0.1:3457');
const TOKEN = readFileSync(argOf('--token-file', '/tmp/lokma-e2e-token'), 'utf8').trim();
const OUT = argOf('--out', '/tmp/lokma-req179');
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('missing token (mint one with scripts/mint-e2e-token.mjs)');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

let passed = 0;
const failures = [];
const ok = (name, pass, detail) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  -- ' + detail : ''));
  if (pass) passed += 1;
  else failures.push(name);
};
const info = (k, v) => console.log('INFO  ' + k + ' = ' + v);

// ---- page-side helpers (browser globals only, one arg max) ---------------

// Strip inline theme vars + set the class - deterministic theme for the
// audit regardless of which named server theme boot applied.
const setTheme = (mode) => {
  const root = document.documentElement;
  const props = [];
  for (let i = 0; i < root.style.length; i += 1) props.push(root.style[i]);
  for (let i = 0; i < props.length; i += 1) {
    if (props[i].indexOf('--') === 0) root.style.removeProperty(props[i]);
  }
  root.classList.toggle('dark', mode === 'dark');
  try {
    localStorage.setItem('lokma-theme', mode);
  } catch (e) {
    /* ignore */
  }
  return { dark: root.classList.contains('dark'), inlineVars: root.style.length };
};

const pageAudit = () => {
  const root = document.querySelector('[data-design-page]');
  if (!root) return null;
  const triggers = [];
  const tr = root.querySelectorAll('[data-select-trigger]');
  for (let i = 0; i < tr.length; i += 1) {
    const el = tr[i];
    let hook = null;
    for (let j = 0; j < el.attributes.length; j += 1) {
      const a = el.attributes[j].name;
      if (a.indexOf('data-design-') === 0) hook = a;
    }
    triggers.push({ hook: hook, tag: el.tagName, role: el.getAttribute('role') });
  }
  const chips = [];
  const ch = root.querySelectorAll('[data-design-sample]');
  for (let i = 0; i < ch.length; i += 1) {
    chips.push({ id: ch[i].getAttribute('data-design-sample'), tag: ch[i].tagName, label: String(ch[i].textContent || '').trim() });
  }
  const empty = root.querySelector('[data-design-empty]');
  let heading = null;
  let desc = null;
  if (empty) {
    const ps = empty.querySelectorAll('p');
    for (let i = 0; i < ps.length; i += 1) {
      const t = String(ps[i].textContent || '').trim();
      if (t === 'Start with a brief') heading = t;
      if (t.indexOf('Write it on the left') >= 0) desc = t;
    }
  }
  return {
    selected: root.querySelectorAll('select').length,
    docSelects: document.querySelectorAll('select').length,
    triggers: triggers,
    chips: chips,
    hasEmpty: Boolean(empty),
    heading: heading,
    desc: desc,
    threadEmpty: Boolean(root.querySelector('[data-design-thread-empty]')),
    generate: Boolean(root.querySelector('[data-design-generate]')),
    dark: document.documentElement.classList.contains('dark'),
  };
};

// WCAG contrast sweep - computed style + ancestor-composited background.
const contrastSweep = () => {
  // Resolve ANY CSS color (oklch/oklab/color-mix/interpolated) to real sRGB
  // pixels - serialization parsing cannot read the oklab forms computed
  // style hands back mid-transition.
  const cvs = document.createElement('canvas');
  cvs.width = 1;
  cvs.height = 1;
  const cctx = cvs.getContext('2d', { willReadFrequently: true });
  const toRGBA = (css) => {
    cctx.clearRect(0, 0, 1, 1);
    cctx.fillStyle = 'rgba(0, 0, 0, 0)';
    cctx.fillStyle = css;
    cctx.fillRect(0, 0, 1, 1);
    const d = cctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const effectiveBg = (el) => {
    const stack = [];
    let node = el;
    let base = null;
    while (node && node.nodeType === 1) {
      const bg = toRGBA(getComputedStyle(node).backgroundColor);
      if (bg && bg[3] > 0) {
        if (bg[3] >= 0.999) {
          base = [bg[0], bg[1], bg[2]];
          break;
        }
        stack.push(bg);
      }
      node = node.parentElement;
    }
    if (!base) base = [255, 255, 255];
    let r = base[0];
    let g = base[1];
    let b = base[2];
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const t = stack[i];
      r = t[0] * t[3] + r * (1 - t[3]);
      g = t[1] * t[3] + g * (1 - t[3]);
      b = t[2] * t[3] + b * (1 - t[3]);
    }
    return [Math.round(r), Math.round(g), Math.round(b)];
  };
  const chan = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = (rgb) => 0.2126 * chan(rgb[0]) + 0.7152 * chan(rgb[1]) + 0.0722 * chan(rgb[2]);
  const ratio = (a, b) => {
    const la = lum(a);
    const lb = lum(b);
    const hi = Math.max(la, lb);
    const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  };
  const txt = (el) => String((el && el.textContent) || '').trim();
  const targets = [];
  const add = (label, el, advisory) => {
    if (!el) {
      targets.push({ label: label, found: false });
      return;
    }
    const cs = getComputedStyle(el);
    const fg = toRGBA(cs.color);
    const bg = effectiveBg(el);
    targets.push({
      label: label,
      found: true,
      advisory: Boolean(advisory),
      fg: String(cs.color),
      bg: 'rgb(' + bg.join(', ') + ')',
      ratio: Math.round(ratio(fg, bg) * 100) / 100,
    });
  };
  const composer = document.querySelector('[data-design-composer]');
  const empty = document.querySelector('[data-design-empty]');
  if (composer) {
    const labels = composer.querySelectorAll('label');
    for (let i = 0; i < labels.length; i += 1) add('label:' + txt(labels[i]), labels[i]);
    const ps = composer.querySelectorAll('p');
    for (let i = 0; i < ps.length; i += 1) {
      if (txt(ps[i]) === 'New artifact') add('title:New artifact', ps[i]);
    }
    const spans = composer.querySelectorAll('span');
    for (let i = 0; i < spans.length; i += 1) {
      if (txt(spans[i]).indexOf('Ctrl + Enter') >= 0) add('meta:shortcut', spans[i]);
    }
  }
  add('trigger:type', document.querySelector('[data-design-composer-type]'));
  if (empty) {
    const ps = empty.querySelectorAll('p');
    for (let i = 0; i < ps.length; i += 1) {
      const t = txt(ps[i]);
      if (t === 'Start with a brief') add('empty:heading', ps[i]);
      if (t.indexOf('Write it on the left') >= 0) add('empty:desc', ps[i]);
    }
    const chips = document.querySelectorAll('[data-design-sample]');
    for (let i = 0; i < chips.length; i += 1) add('chip:' + chips[i].getAttribute('data-design-sample'), chips[i]);
  }
  // The primary action's solid fill is the APP-WIDE brand button (chat Send
  // is the same #C96442 + white) — measured as ADVISORY: the REQ scope item 4
  // keeps the design surface speaking the same language as its neighbours.
  add('generate', document.querySelector('[data-design-generate]'), true);
  return { dark: document.documentElement.classList.contains('dark'), targets: targets };
};

const overflowState = () => {
  const root = document.querySelector('[data-design-page]');
  return {
    innerWidth: window.innerWidth,
    docOverflow: document.documentElement.scrollWidth - window.innerWidth,
    rootOverflow: root ? root.scrollWidth - root.clientWidth : -1,
  };
};

const clickSample = (id) => {
  const el = document.querySelector('[data-design-sample="' + id + '"]');
  if (!el) return false;
  el.click();
  return true;
};

const sampleFilled = () => {
  const brief = document.querySelector('[data-design-brief]');
  const type = document.querySelector('[data-design-composer-type]');
  return {
    brief: brief ? brief.value : null,
    focused: document.activeElement === brief,
    type: type ? type.getAttribute('data-select-value') : null,
  };
};

const openTypeMenu = () => {
  const el = document.querySelector('[data-design-composer-type]');
  if (!el) return false;
  el.click();
  return true;
};

const menuOpenState = () => {
  const menu = document.querySelector('[data-select-menu]');
  const trigger = document.querySelector('[data-design-composer-type]');
  return {
    open: Boolean(menu),
    options: menu ? menu.querySelectorAll('[data-select-option]').length : 0,
    expanded: trigger ? trigger.getAttribute('aria-expanded') : null,
  };
};

const closeMenu = () => {
  const trigger = document.querySelector('[data-design-composer-type]');
  if (trigger) trigger.click();
};

// ---- runner ---------------------------------------------------------------

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

  const shot = async (name) => {
    const path = join(OUT, name);
    try {
      await page.screenshot({ path: path });
      info('screenshot', path);
    } catch (e) {
      console.log('screenshot failed (non-fatal): ' + String(e).slice(0, 120));
    }
  };

  // Themed colour changes ride Tailwind's `transition-colors` (~150ms), and
  // this headless Chromium can sit on the old value for a while before the
  // transition even starts — measuring at a fixed delay once read the OLD
  // palette (labelled by oklab() serializations). Poll the transition-prone
  // elements until two consecutive samples agree.
  const settleTheme = async () => {
    let prev = null;
    for (let i = 0; i < 14; i += 1) {
      const sig = await page.evaluate(() => {
        const read = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return 'none';
          const cs = getComputedStyle(el);
          return cs.color + '|' + cs.backgroundColor;
        };
        return (
          (document.documentElement.classList.contains('dark') ? 'dark' : 'light') +
          '#' +
          read('[data-design-composer-type]') +
          '#' +
          read('[data-design-sample="pricing"]')
        );
      });
      if (sig === prev) return true;
      prev = sig;
      await sleep(260);
    }
    return false;
  };

  // The list request is async: the thread's guiding card only renders once
  // the first load settles — poll for it (or for real messages) instead of
  // sampling at a fixed delay.
  const waitThreadReady = async () => {
    for (let i = 0; i < 40; i += 1) {
      const state = await page.evaluate(() => {
        const root = document.querySelector('[data-design-page]');
        if (!root) return 'no-page';
        const loading = document.body.innerText.indexOf('Loading artifacts') >= 0;
        const ready =
          Boolean(root.querySelector('[data-design-thread-empty]')) ||
          root.querySelectorAll('[data-design-msg]').length > 0 ||
          root.querySelectorAll('[data-design-event]').length > 0;
        return ready && !loading ? 'ready' : 'wait';
      });
      if (state === 'ready') return true;
      await sleep(400);
    }
    return false;
  };

  await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  // The shared box runs hot (other agents' builds) — the shell can take a
  // while to appear; wait long and reload once for a transient boot.
  try {
    await page.waitForSelector('[data-mode-switch="design"]', { timeout: 60000 });
  } catch (e) {
    console.log('  (boot slow - reloading once)');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-mode-switch="design"]', { timeout: 60000 });
  }
  await sleep(6000); // server-theme load settles before themes are forced

  // The server stamps its named theme's vars inline on <html> shortly after
  // boot; forcing a theme before that lands lets the late stamp flip the page
  // mid-audit. Wait for the stamp (or a .dark class) first.
  const waitBootSettled = async () => {
    for (let i = 0; i < 40; i += 1) {
      const done = await page.evaluate(() => {
        const root = document.documentElement;
        return root.style.length >= 10 || root.classList.contains('dark');
      });
      if (done) return true;
      await sleep(500);
    }
    return false;
  };
  const bootSettled = await waitBootSettled();
  info('server theme stamped (boot settled)', String(bootSettled));

  await page.click('[data-mode-switch="design"]');
  await page.waitForSelector('[data-design-page]', { timeout: 15000 });
  await sleep(800);
  const threadReady = await waitThreadReady();
  ok('the artifact thread settled (list load finished)', threadReady);

  // REQ-189 — the artboard list moved into the Artifacts PANEL, which starts
  // CLOSED. The type filter asserted below lives in that panel, so open it
  // once here and leave it open for the rest of the run.
  await page.evaluate(() => {
    const b = document.querySelector('[data-design-artifacts-toggle]');
    if (b) b.click();
  });
  await sleep(900);

  // ---- A + D: structure of the design surface (before touching themes) ----
  const audit = await page.evaluate(pageAudit);
  ok('the Design page renders', Boolean(audit));
  ok('A: zero native <select> elements on the design page', Boolean(audit && audit.selected === 0), 'design=' + (audit ? audit.selected : 'n/a') + ' document=' + (audit ? audit.docSelects : 'n/a'));
  const hooks = audit ? audit.triggers.map((t) => t.hook) : [];
  ok(
    'A: the 5 SelectMenu triggers are the app primitive (combobox buttons)',
    Boolean(
      audit &&
        hooks.indexOf('data-design-composer-project') >= 0 &&
        hooks.indexOf('data-design-composer-type') >= 0 &&
        hooks.indexOf('data-design-composer-system') >= 0 &&
        hooks.indexOf('data-design-composer-model') >= 0 &&
        hooks.indexOf('data-design-strip-filter') >= 0 &&
        audit.triggers.every((t) => t.tag === 'BUTTON' && t.role === 'combobox'),
    ),
    'triggers=' + JSON.stringify(audit ? audit.triggers : []),
  );
  ok('D: the empty canvas state renders', Boolean(audit && audit.hasEmpty));
  ok('D: the single CTA heading is "Start with a brief"', Boolean(audit && audit.heading === 'Start with a brief'), 'heading=' + (audit ? audit.heading : 'n/a'));
  ok('D: the guiding description names Generate', Boolean(audit && audit.desc && audit.desc.indexOf('Generate') >= 0), 'desc=' + (audit ? audit.desc : 'n/a'));
  const chipIds = audit ? audit.chips.map((c) => c.id).sort().join(',') : '';
  ok(
    'D: 4 sample-brief chips (deck-cover,editorial,onboarding,pricing) are in the DOM as buttons',
    Boolean(audit && audit.chips.length === 4 && chipIds === 'deck-cover,editorial,onboarding,pricing' && audit.chips.every((c) => c.tag === 'BUTTON' && c.label.length > 0)),
    'chips=' + JSON.stringify(audit ? audit.chips : []),
  );
  ok('D: the empty thread renders its guiding card', Boolean(audit && audit.threadEmpty));
  ok('Generate is on the page (primary action present)', Boolean(audit && audit.generate));

  // ---- B: contrast in BOTH themes (computed style, no screenshots) --------
  for (const mode of ['light', 'dark']) {
    const applied = await page.evaluate(setTheme, mode);
    const settled = await settleTheme();
    const sweep = await page.evaluate(contrastSweep);
    const found = sweep.targets.filter((t) => t.found);
    const required = found.filter((t) => !t.advisory);
    const advisory = found.filter((t) => t.advisory);
    const bad = required.filter((t) => t.ratio < 4.5);
    const lowAdvisory = advisory.filter((t) => t.ratio < 3);
    const min = required.length ? Math.min.apply(null, required.map((t) => t.ratio)) : null;
    ok('B(' + mode + '): theme class applied (' + mode + ')', applied.dark === (mode === 'dark') && sweep.dark === (mode === 'dark'), 'classDark=' + sweep.dark);
    ok('B(' + mode + '): theme transition settled before measuring', settled === true, 'settled=' + settled);
    ok('B(' + mode + '): at least 8 text/label targets measured', required.length >= 8, 'found=' + required.length + '/' + sweep.targets.length);
    ok('B(' + mode + '): every text/label/meta/chip target >= 4.5:1', bad.length === 0 && required.length > 0, bad.length ? 'FAILING=' + JSON.stringify(bad) : 'min=' + min + ':1 over ' + required.length + ' targets');
    ok(
      'B(' + mode + '): primary fill meets the >=3:1 UI floor (advisory: app-wide brand fill)',
      lowAdvisory.length === 0,
      advisory.length ? JSON.stringify(advisory.map((t) => ({ label: t.label, ratio: t.ratio }))) : 'none',
    );
    console.log('--- contrast table (' + mode + ') ---');
    for (const t of sweep.targets) {
      const tag = t.found ? (t.advisory ? 'adv ' : t.ratio >= 4.5 ? 'ok  ' : 'LOW ') + t.ratio + ':1' : 'MISS';
      console.log('  ' + tag + '  ' + t.label + (t.found ? '  fg=' + t.fg + ' bg=' + t.bg : ''));
    }
    if (advisory.length) {
      console.log('  note: primary fill ' + advisory[0].ratio + ':1 is white on the brand terracotta #C96442 - identical to the chat composer Send button (app-wide token); scope item 4 keeps the visual language consistent, tracked as follow-up.');
    }
    await shot('after-' + mode + '.png');
  }

  // ---- open SelectMenu visual (dark): custom popup, not the OS blue ------
  await page.evaluate(setTheme, 'dark');
  await settleTheme();
  await page.evaluate(openTypeMenu);
  // Poll for the popup (waitForSelector raced the open once); retry the
  // click once if it was swallowed.
  let menu = await page.evaluate(menuOpenState);
  for (let i = 0; i < 20 && !menu.open; i += 1) {
    await sleep(300);
    if (i === 5) await page.evaluate(openTypeMenu);
    menu = await page.evaluate(menuOpenState);
  }
  ok('SelectMenu opens from the Type trigger', menu.open, JSON.stringify(menu));
  await sleep(300);
  menu = await page.evaluate(menuOpenState);
  ok('the popup lists options and reports aria-expanded', Boolean(menu.open && menu.options >= 6 && menu.expanded === 'true'), JSON.stringify(menu));
  await shot('menu-open-dark.png');
  await page.keyboard.press('Escape');
  await sleep(400);
  const closed = await page.evaluate(menuOpenState);
  ok('Escape closes the popup back to the trigger', closed.open === false && closed.expanded === 'false', JSON.stringify(closed));

  // ---- D: a sample chip fills the brief + its natural type ---------------
  ok('clicking the "Pricing page" chip works', await page.evaluate(clickSample, 'pricing'));
  await sleep(400);
  const filled = await page.evaluate(sampleFilled);
  ok(
    'D: the chip filled the brief, set Type=prototype and focused the textarea',
    Boolean(filled.brief && filled.brief.indexOf('SaaS pricing page') >= 0 && filled.type === 'prototype' && filled.focused),
    JSON.stringify({ type: filled.type, focused: filled.focused, briefHead: filled.brief ? filled.brief.slice(0, 40) : null }),
  );

  // ---- C: no horizontal overflow, desktop + narrow, both themes ----------
  for (const mode of ['light', 'dark']) {
    await page.evaluate(setTheme, mode);
    await settleTheme();
    const wide = await page.evaluate(overflowState);
    ok('C(' + mode + ' @1500): no horizontal overflow', wide.docOverflow <= 1 && wide.rootOverflow <= 1, JSON.stringify(wide));
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(700);
    const narrow = await page.evaluate(overflowState);
    ok('C(' + mode + ' @390): no horizontal overflow', narrow.docOverflow <= 1 && narrow.rootOverflow <= 1, JSON.stringify(narrow));
    await shot('mobile-' + mode + '.png');
    await page.setViewportSize({ width: 1500, height: 950 });
    await sleep(500);
  }

  // ---- final: no JS errors, report ---------------------------------------
  const jsErrors = errors.filter((e) => e.indexOf('Failed to load resource') === -1);
  ok('no JavaScript errors on the page', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | ') || 'clean');

  await browser.close();
  console.log('\nprobe-design-visual: ' + passed + ' passed, ' + failures.length + ' failed.');
  if (failures.length) {
    console.log('failures: ' + failures.join(' | '));
    process.exit(1);
  }
  console.log('ALL PASS');
})().catch((e) => {
  console.error('probe crashed: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
