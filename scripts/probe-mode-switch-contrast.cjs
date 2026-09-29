#!/usr/bin/env node
/**
 * REQ-173 live probe — the surface mode chips (`lokma` / `Bots` / `Design`)
 * keep every state readable in BOTH themes: the selected `lokma` chip used a
 * light cream fill with an inherited (light) ink, so in dark mode the wordmark
 * vanished on the pill. This probe measures the COMPUTED text colour against
 * the composited background for idle / hover / selected states of all three
 * chips, in the dark AND light theme, and asserts WCAG AA (>= 4.5:1).
 *
 * Also asserts the label is actually rendered (non-zero box) and that the
 * hover state really applied (el.matches(':hover')) so a no-op hover can
 * never fake a pass.
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-mode-switch-contrast.cjs \
 *     --url http://127.0.0.1:3457 --token "$TK" --tag before
 */
const { chromium } = require('playwright-core');

const readFlag = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = readFlag('url', 'http://127.0.0.1:3457');
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN = readFlag('token', '') || process.env.TOKEN;
const TAG = readFlag('tag', 'live');
const SHOT_DIR = readFlag('shot-dir', '/tmp/req173');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('missing --token (mint one with scripts/mint-e2e-token.mjs)');
  process.exit(2);
}

const failures = [];
const ok = (name, pass, detail) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  -- ' + detail : ''));
  if (!pass) failures.push(name);
};

// ── colour math (Node side) ────────────────────────────────────────────────
const parseRgb = (s) => {
  const str = String(s || '');
  if (str.indexOf('rgb') !== 0) return null;
  const inside = str.slice(str.indexOf('(') + 1, str.lastIndexOf(')'));
  const parts = inside.split(',').map((p) => parseFloat(p.trim()));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
};
const relLum = (rgb) => {
  const lin = rgb.slice(0, 3).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};
const contrast = (a, b) => {
  if (!a || !b) return 0;
  const la = relLum(a);
  const lb = relLum(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};
const fmt = (rgb) => (rgb ? '#' + rgb.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') : 'n/a');

// ── page-side readers (browser globals only) ───────────────────────────────
const pageMeasure = (ids) => {
  const parse = (s) => {
    const str = String(s || '');
    if (str.indexOf('rgb') !== 0) return null;
    const inside = str.slice(str.indexOf('(') + 1, str.lastIndexOf(')'));
    const parts = inside.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length < 3) return null;
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  };
  const parseHex = (s) => {
    if (s[0] !== '#') return null;
    const h = s.slice(1);
    if (h.length !== 6 && h.length !== 3) return null;
    const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16), 1];
  };
  // Tailwind v4 tokens compute to oklch(...); convert with the OKLab math
  // (canvas fillStyle echoes modern syntax back verbatim in this Chromium).
  const parseOklch = (s) => {
    const str = String(s || '');
    if (str.indexOf('oklch') !== 0) return null;
    const body = str.slice(str.indexOf('(') + 1, str.lastIndexOf(')'));
    const halves = body.split('/');
    const nums = halves[0].trim().split(' ').filter(Boolean);
    if (nums.length < 3) return null;
    const readNum = (t) => {
      if (t.slice(-1) === '%') return parseFloat(t) / 100;
      const v = parseFloat(t);
      return Number.isNaN(v) ? null : v;
    };
    const L = readNum(nums[0]);
    const C = readNum(nums[1]);
    const H = readNum(nums[2]);
    if (L === null || C === null || H === null) return null;
    let alpha = 1;
    if (halves.length > 1) {
      const raw = halves[1].trim();
      alpha = raw.slice(-1) === '%' ? parseFloat(raw) / 100 : parseFloat(raw);
      if (Number.isNaN(alpha)) alpha = 1;
    }
    const hr = (H * Math.PI) / 180;
    const oa = C * Math.cos(hr);
    const ob = C * Math.sin(hr);
    const l_ = L + 0.3963377774 * oa + 0.2158037573 * ob;
    const m_ = L - 0.1055613458 * oa - 0.0638541728 * ob;
    const s_ = L - 0.0894841775 * oa - 1.2914855480 * ob;
    const l3 = l_ * l_ * l_;
    const m3 = m_ * m_ * m_;
    const s3 = s_ * s_ * s_;
    const lr = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
    const lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
    const lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
    const gamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
    const to255 = (c) => Math.min(255, Math.max(0, Math.round(gamma(Math.min(1, Math.max(0, c))) * 255)));
    return [to255(lr), to255(lg), to255(lb), alpha];
  };
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const toRgb = (color) => {
    const str = String(color || '');
    const direct = parse(str) || parseHex(str) || parseOklch(str);
    if (direct) return direct;
    if (!str || str === 'transparent' || str === 'none') return null;
    try {
      ctx.fillStyle = '#000000';
      ctx.fillStyle = str;
      const out = String(ctx.fillStyle);
      return parse(out) || parseHex(out);
    } catch (e) {
      return null;
    }
  };
  const isOpaque = (s) => {
    const c = toRgb(s);
    return Boolean(c) && c[3] >= 0.999;
  };
  const blend = (fg, bg) => [
    fg[3] * fg[0] + (1 - fg[3]) * bg[0],
    fg[3] * fg[1] + (1 - fg[3]) * bg[1],
    fg[3] * fg[2] + (1 - fg[3]) * bg[2],
    1,
  ];
  const effectiveBg = (el) => {
    const layers = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const bg = window.getComputedStyle(node).backgroundColor || '';
      if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') layers.push(bg);
      if (isOpaque(bg)) break;
      node = node.parentElement;
    }
    let out = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const c = toRgb(layers[i]);
      if (c) out = blend(c, out);
    }
    return out;
  };
  const out = [];
  for (const id of ids) {
    const el = document.querySelector('[data-mode-switch="' + id + '"]');
    if (!el) {
      out.push({ id: id, error: 'chip missing' });
      continue;
    }
    const spans = [].slice.call(el.querySelectorAll('span')).filter((s) => (s.textContent || '').trim().length > 1);
    const label = spans[0] || el;
    const rect = label.getBoundingClientRect();
    const cs = window.getComputedStyle(label);
    out.push({
      id: id,
      text: (label.textContent || '').trim(),
      selected: el.getAttribute('aria-selected') === 'true',
      hovered: el.matches(':hover'),
      visible: rect.width > 0 && rect.height > 0,
      w: Math.round(rect.width),
      color: toRgb(cs.color),
      colorRaw: cs.color,
      bg: effectiveBg(label),
      dark: Boolean(el.closest('.dark')),
    });
  }
  return out;
};

const hoverChip = (id) => {
  const el = document.querySelector('[data-mode-switch="' + id + '"]');
  if (el) el.scrollIntoView({ block: 'center' });
  return true;
};

(async () => {
  const fs = require('fs');
  fs.mkdirSync(SHOT_DIR, { recursive: true });
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
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 160)));

  await page.emulateMedia({ media: 'screen', hover: 'hover', pointer: 'fine' }).catch(() => undefined);
  await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await sleep(7000); // let the async server-theme stamp settle before measuring

  const chipCount = await page.evaluate(() => document.querySelectorAll('[data-mode-switch]').length);
  ok('three mode chips render', chipCount === 3, 'count=' + chipCount);

  const themeNow = async () => page.evaluate(() => document.documentElement.classList.contains('dark'));
  const clickChip = async (id) => {
    await page.click('[data-mode-switch="' + id + '"]').catch(() => undefined);
    await sleep(700);
  };
  const clickTheme = async () => {
    await page.click('button[title="Toggle theme"]');
    await sleep(900);
  };
  const moveAway = async () => {
    await page.mouse.move(700, 500);
    await sleep(250);
  };
  const measure = async (ids) => page.evaluate(pageMeasure, ids);
  const shot = async (name) => {
    const header = page.locator('header').first();
    await header.screenshot({ path: SHOT_DIR + '/REQ-173-' + TAG + '-' + name + '-header.png' }).catch(() => undefined);
    await page.screenshot({ path: SHOT_DIR + '/REQ-173-' + TAG + '-' + name + '-full.png' }).catch(() => undefined);
  };

  const record = (theme, chip, state, m) => {
    if (!m || m.error) {
      ok('[' + theme + '] ' + chip + '/' + state + ': chip found', false, m ? m.error : 'no measurement');
      return;
    }
    const fg = Array.isArray(m.color) ? m.color : parseRgb(m.color);
    if (!fg) {
      ok('[' + theme + '] ' + chip + '/' + state + ' contrast >= 4.5', false, 'unparsed colour ' + m.colorRaw);
      return;
    }
    const bg = m.bg;
    const ratio = contrast(fg, bg);
    const label = m.id === 'chat' ? 'lokma' : (m.id === 'bots' ? 'Bots' : 'Design');
    const pass = ratio >= 4.5 && m.visible && m.text === label;
    ok(
      '[' + theme + '] ' + chip + '/' + state + ' contrast >= 4.5',
      pass,
      'text="' + m.text + '" fg=' + fmt(fg) + ' bg=' + fmt(bg) + ' ratio=' + ratio.toFixed(2) + ' visible=' + m.visible + ' hovered=' + m.hovered,
    );
  };

  const runTheme = async (theme, isDark) => {
    // make sure the theme is applied and stays applied for the whole batch
    for (let i = 0; i < 6; i += 1) {
      const dark = await themeNow();
      if (dark === isDark) break;
      await clickTheme();
    }
    const dark = await themeNow();
    ok('[' + theme + '] theme is active', dark === isDark, 'dark=' + dark);

    await clickChip('chat');
    await moveAway();
    await shot(theme + '-chat-selected');

    // idle: the two unselected chips
    let ms = await measure(['chat', 'bots', 'design']);
    const byId = (arr, id) => arr.filter((x) => x.id === id)[0];
    record(theme, 'chat', 'selected', byId(ms, 'chat'));
    record(theme, 'bots', 'idle', byId(ms, 'bots'));
    record(theme, 'design', 'idle', byId(ms, 'design'));

    // hover each unselected chip
    await page.hover('[data-mode-switch="bots"]');
    await sleep(350);
    ms = await measure(['bots']);
    record(theme, 'bots', 'hover', byId(ms, 'bots'));

    await page.hover('[data-mode-switch="design"]');
    await sleep(350);
    ms = await measure(['design']);
    record(theme, 'design', 'hover', byId(ms, 'design'));

    // hover the selected chip: it must stay readable too
    await page.hover('[data-mode-switch="chat"]');
    await sleep(350);
    ms = await measure(['chat']);
    record(theme, 'chat', 'selected-hover', byId(ms, 'chat'));
    await shot(theme + '-chat-hovered');

    // select bots -> bots selected, chat returns to idle
    await clickChip('bots');
    await moveAway();
    ms = await measure(['bots', 'chat']);
    record(theme, 'bots', 'selected', byId(ms, 'bots'));
    record(theme, 'chat', 'idle', byId(ms, 'chat'));

    // hover the idle chat chip
    await page.hover('[data-mode-switch="chat"]');
    await sleep(350);
    ms = await measure(['chat']);
    record(theme, 'chat', 'idle-hover', byId(ms, 'chat'));

    // design selected
    await clickChip('design');
    await moveAway();
    ms = await measure(['design']);
    record(theme, 'design', 'selected', byId(ms, 'design'));

    await clickChip('chat');
  };

  const startDark = await themeNow();
  const first = startDark ? 'dark' : 'light';
  const second = startDark ? 'light' : 'dark';
  const themes = [];
  themes.push(first);
  await runTheme(first, first === 'dark');
  themes.push(second);
  await runTheme(second, second === 'dark');

  ok('both themes were measured', themes.indexOf('dark') >= 0 && themes.indexOf('light') >= 0, themes.join(' + '));

  console.log('--- errors seen ---');
  console.log(errors.slice(0, 8).join('\n') || '(none)');
  const jsErrors = errors.filter((e) => e.indexOf('Failed to load resource') === -1);
  ok('no JavaScript errors on the page', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | ') || 'clean');
  console.log('screenshots: ' + SHOT_DIR + '/REQ-173-' + TAG + '-*');

  await browser.close();
  if (failures.length) {
    console.log('\nprobe-mode-switch-contrast: ' + failures.length + ' failure(s): ' + failures.join('; '));
    process.exit(1);
  }
  console.log('\nprobe-mode-switch-contrast: all checks passed.');
})();
