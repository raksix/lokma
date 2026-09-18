#!/usr/bin/env node
/**
 * REQ-158 live probe — the terminal must not repeat what you type, and the
 * synthetic `$` + cursor prompt line must be gone.
 *
 * DOM-driven (the terminal list is served over WS, not REST): open a session,
 * open its Terminal pane, type `echo <MARKER>` and count how often the marker
 * is painted. A duplicated frame delivery repeats the typed line 2-3×; the
 * natural echo + result is what we expect to see once each.
 *
 * Usage: TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-terminal-dedupe.cjs --url https://lokma.fermag.com.tr --token "$TK"
 */
const { chromium } = require('playwright-core');

const BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'https://lokma.fermag.com.tr';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN = (process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : '') || process.env.TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MARKER = `lokma${Math.floor(Math.random() * 90000 + 10000)}`;

if (!TOKEN) {
  console.error('TOKEN required');
  process.exit(1);
}

const failures = [];
const ok = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures.push(name);
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: process.env.PROBE_HEADFUL !== '1', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  // Store the Bearer token before the app boots — the same pattern the other
  // live probes use; without it the app shows "Sign in to continue".
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('lokma-token', t);
    } catch {
      /* ignore */
    }
    // REQ-158 diagnosis: record every terminal/data frame the app receives.
    window.__frames = [];
    const Native = window.WebSocket;
    window.WebSocket = function (...args) {
      const ws = new Native(...args);
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
          if (msg && msg.type === 'terminal/data') {
            window.__frames.push({ t: Date.now(), terminalId: msg.terminalId, data: String(msg.data), seq: msg.seq ?? null, keys: Object.keys(msg).join(',') });
          }
        } catch {
          /* not json */
        }
      });
      return ws;
    };
    window.WebSocket.prototype = Native.prototype;
  }, TOKEN);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`);
  });
  page.on('requestfailed', (r) => errors.push(`reqfail: ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
  page.on('response', async (r) => {
    if (r.url().includes('/api/terminal') && r.status() >= 400) {
      errors.push(`http ${r.status()}: ${r.url().slice(0, 120)} ${(await r.text().catch(() => '')).slice(0, 160)}`);
    }
  });
  await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await sleep(6000);

  // Open a real workspace session (same path the submit-dedupe probe uses).
  await page.evaluate(() => {
    const b = document.querySelector('button[aria-label="Group by project"]');
    if (b) b.click();
  });
  await sleep(1200);
  await page.evaluate(() => {
    const isCount = (s) => /^\d+$/.test(s);
    const groups = [...document.querySelectorAll('button[aria-expanded]')]
      .map((b) => {
        const label = (b.innerText || '').trim().split('\n')[0].trim();
        const badge = b.parentElement ? [...b.parentElement.children].find((n) => isCount((n.innerText || '').trim())) : null;
        return badge ? { label, el: b, expanded: b.getAttribute('aria-expanded') === 'true' } : null;
      })
      .filter(Boolean);
    window.__g = groups;
    const g = groups.find((x) => x.label && x.label !== 'Home');
    if (g && !g.expanded) g.el.click();
  });
  await sleep(1200);
  const openedSession = await page.evaluate(() => {
    const g = (window.__g || []).find((x) => x.label && x.label !== 'Home');
    const block = g && g.el.parentElement ? g.el.parentElement.parentElement : document.body;
    const row = block.querySelector('div[draggable="true"]');
    if (!row) return null;
    (row.querySelector('.cursor-pointer') || row).click();
    return (row.innerText || '').trim().split('\n')[0].slice(0, 40);
  });
  ok('a session opens', Boolean(openedSession), openedSession || 'no sidebar row found');
  await sleep(4000);

  // Open the Terminal pane.
  const openedTerminal = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('button')].filter(
      (b) =>
        /terminal|shell/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')) ||
        b.querySelector('svg[class*="terminal"]'),
    );
    if (!cands.length) return false;
    cands[0].click();
    return true;
  });
  ok('the Terminal pane opens', openedTerminal, openedTerminal ? 'clicked' : 'no terminal button found');
  await sleep(5000);

  // The synthetic prompt line is a green "$" in the terminal viewport.
  const promptGlyphs = await page.evaluate(() => {
    return [...document.querySelectorAll('.text-emerald-400')].filter((el) => (el.textContent || '').trim() === '$').length;
  });
  ok('the synthetic "$" prompt line is gone', promptGlyphs === 0, `${promptGlyphs} on screen`);

  // Make sure a shell is really running before typing: click the viewport
  // (which starts one when the pane is empty) and wait for bytes to arrive.
  const shellUp = await page.evaluate(async () => {
    // The focusable viewport is the one carrying the "click and type" label —
    // a plain wrapper div takes the click but never sees the keystrokes.
    const scroller = () =>
      document.querySelector('[aria-label*="click and type"]') ||
      document.querySelector('[aria-label^="Terminal"]') ||
      [...document.querySelectorAll('div')].find((el) => /#\s*$/.test((el.innerText || '').trim()));
    let el = scroller();
    if (!el) return 'no-viewport';
    el.click();
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      const frames = (window.__frames || []).length;
      const now = scroller();
      if (frames > 0 && now) {
        // REQ-159: focus is what makes keystrokes land — click every time.
        now.click();
        now.focus?.();
        window.focus();
        return `live after ${(i + 1) * 500}ms`;
      }
    }
    return 'no-bytes-arrived';
  });
  // A missing pane would make the "$ is gone" check pass vacuously — dump it.
  const dump = await page.evaluate(() => ({
    labels: [...document.querySelectorAll('[aria-label]')]
      .map((el) => el.getAttribute('aria-label') || '')
      .filter((t) => /terminal|shell|scrollback/i.test(t))
      .slice(0, 4),
    body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 260),
  }));
  console.log('--- pane state ---');
  console.log('aria labels:', JSON.stringify(dump.labels));
  console.log('body:', dump.body);
  console.log('--- end pane state ---');
  console.log(`shell: ${shellUp}`);
  // Playwright focus (not el.focus() inside evaluate) is what lands keys
  // reliably once the shell is up; a wrapper click alone never does.
  const viewport = page.locator('[aria-label*="click and type"]').first();
  if (await viewport.count()) {
    await viewport.click().catch(() => {});
    await viewport.focus().catch(() => {});
  }
  await page.keyboard.type(`echo ${MARKER}`, { delay: 40 });
  await page.keyboard.press('Enter');
  await sleep(5000);

  const frames = await page.evaluate((m) => {
    const all = window.__frames || [];
    const withMarker = all.filter((f) => f.data.includes(m));
    return {
      total: all.length,
      withMarker: withMarker.map((f) => ({ data: f.data.replace(/\r/g, '\\r').slice(0, 80), seq: f.seq, keys: f.keys })),
      distinctMarkerChunks: new Set(withMarker.map((f) => f.data)).size,
    };
  }, MARKER);
  console.log(`frames: ${frames.total} terminal/data total, ${frames.withMarker.length} carrying the marker, ${frames.distinctMarkerChunks} distinct`);
  for (const f of frames.withMarker.slice(-6)) console.log(`  [seq=${f.seq}] keys=${f.keys} :: ${f.data.slice(0, 70)}`);

  const count = await page.evaluate((m) => {
    const text = document.body.innerText;
    return text.split(m).length - 1;
  }, MARKER);

  // Legit: the shell echoes the command, then prints the result → 2 (sometimes 3
  // if the scrollback redraws). A duplicated delivery lands at 4-6.
  ok('a live shell accepted the command', count >= 1, `shell state: ${shellUp}`);
  ok('the typed line is not repeated by duplicate deliveries', count <= 3, `marker painted ${count}× (expect 2-3)`);
  ok('the command actually ran', count >= 2, `${count}× — the shell echo and its output`);

  // Dump the scrollback around the marker so the duplicated copies are visible.
  const tailDump = await page.evaluate((m) => {
    const hosts = [...document.querySelectorAll('*')].filter(
      (el) => el.children.length === 0 || el.tagName === 'PRE' || el.className.toString().includes('font-mono'),
    );
    let best = '';
    for (const el of hosts) {
      const t = el.innerText || el.textContent || '';
      if (t.includes(m) && t.length > best.length) best = t;
    }
    return best;
  }, MARKER);
  console.log('--- scrollback around the marker ---');
  console.log(
    tailDump
      .split('\n')
      .filter((l) => l.includes(MARKER) || /echo|\$|#|>/.test(l))
      .slice(-14)
      .join('\n')
      .slice(0, 1800),
  );
  console.log('--- end ---');

  console.log('--- errors seen ---');
  console.log(errors.slice(0, 8).join('\n') || '(none)');

  await page.screenshot({ path: '/tmp/req158-terminal.png' });
  console.log('screenshot: /tmp/req158-terminal.png');
  await browser.close();
  if (failures.length) {
    console.log(`\nprobe-terminal-dedupe: ${failures.length} failure(s): ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nprobe-terminal-dedupe: all checks passed.');
})();
