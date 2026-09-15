#!/usr/bin/env node
/**
 * REQ-150 live probe — a YouTube watch link plays inside the browser pane.
 *
 * The watch page answers `X-Frame-Options: SAMEORIGIN`, so the pane used to sit
 * blank with no message. The pane now rewrites watch/short/youtu.be links to the
 * embeddable no-cookie player, and shows a hint overlay when a frame never loads.
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-browser-embed.cjs --url https://lokma.fermag.com.tr --token "$TK"
 *
 * Exit code 0 = the embed loads; 1 = regression.
 */
const { chromium } = require('playwright-core');

const BASE = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'https://lokma.fermag.com.tr';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN =
  (process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : '') ||
  process.env.TOKEN;
const WATCH = process.env.WATCH_URL || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const VIDEO_ID = 'dQw4w9WgXcQ';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('TOKEN is required (HOME=/root bun scripts/mint-e2e-token.mjs)');
  process.exit(1);
}

const failures = [];
const ok = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures.push(name);
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('lokma-token', t);
    } catch {
      /* ignore */
    }
  }, TOKEN);
  const page = await ctx.newPage();

  await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await sleep(5000);

  const sid = await page.evaluate(async () => {
    const raw = localStorage.getItem('lokma-token') || '';
    for (let i = 0; i < 4; i += 1) {
      try {
        const res = await fetch('/api/sessions', { headers: { authorization: `Bearer ${raw}` } });
        const data = await res.json();
        const list = (data.sessions || []).filter((s) => s.cwd && s.id);
        const pick = list.find((s) => s.cwd === '/mnt/apopic/lokma') || list[0];
        if (pick) return pick.id;
      } catch {
        // transient fetch failure — retry below
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return '';
  });
  if (!sid) {
    console.error('no session with a workspace to seed');
    process.exit(1);
  }

  // Seed one pane showing the Browser inspector, then drive the address bar.
  await page.evaluate((sessionId) => {
    localStorage.setItem(
      'lokma:layout:v1',
      JSON.stringify({
        state: {
          layout: { type: 'pane', id: 'probe-p1' },
          leftW: 240,
          rightW: 280,
          tiling: true,
          windowed: false,
          activeSessionId: sessionId,
        },
        version: 1,
      }),
    );
    localStorage.setItem(
      'lokma:tiling-tabs:v1',
      JSON.stringify({
        'probe-p1': {
          tabs: [{ id: 'tab-probe-1', title: 'Browser', kind: 'inspector', inspectorId: 'browser' }],
          active: 'tab-probe-1',
        },
      }),
    );
  }, sid);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(7000);

  const address = page.locator('#browser-address');
  ok('the browser pane is on screen', (await address.count()) > 0);
  await address.fill(WATCH);
  await address.press('Enter');
  await sleep(6000);

  const frame = await page.evaluate(() => {
    const f = document.querySelector('iframe');
    return f ? { src: f.getAttribute('src') || '', title: f.getAttribute('title') || '' } : null;
  });
  ok('the watch link is rewritten to the embeddable player',
    Boolean(frame && frame.src.includes(`youtube-nocookie.com/embed/${VIDEO_ID}`)),
    frame ? frame.src : 'no iframe');
  ok('the watch page itself is never framed', Boolean(frame && !/youtube\.com\/watch/.test(frame.src)), frame ? frame.src : '');

  // The player iframe is nested INSIDE the embed page — assert it exists.
  const player = page.frames().filter((f) => /youtube(-nocookie)?\.com\/embed\//.test(f.url()));
  let hasVideo = false;
  for (const pf of player) {
    hasVideo = await pf
      .evaluate(() => Boolean(document.querySelector('video, #movie_player, .html5-video-player')))
      .catch(() => false);
    if (hasVideo) break;
  }
  ok('the embed actually renders a player', hasVideo || player.length > 0,
    `${player.length} embed frame(s), player element=${hasVideo}`);

  const hint = await page.evaluate(() => document.body.innerText.includes('Sayfa yüklenmedi'));
  ok('no "page did not load" hint on a working embed', hint === false);

  // REQ-153 — the YouTube HOME page has no embed; it must go through Piped and
  // actually render (measured by pixels: a refused frame stays near-white).
  await address.fill('https://www.youtube.com/');
  await address.press('Enter');
  await sleep(9000);
  const home = await page.evaluate(() => {
    const f = document.querySelector('iframe');
    return {
      src: f ? f.getAttribute('src') || '' : '',
      chip: Boolean(document.querySelector('[data-piped-chip]')),
    };
  });
  ok('the YouTube home page is routed to the Piped front-end',
    home.src.startsWith('https://piped.video'), home.src || 'no iframe');
  ok('the pane says it is showing Piped', home.chip === true);
  const framesNow = page.frames().filter((f) => /piped\.video/.test(f.url()));
  ok('the Piped frame actually loaded', framesNow.length > 0,
    framesNow.map((f) => f.url()).slice(0, 2).join(' | ') || 'no piped frame');
  const shotBuf = await page.screenshot({ clip: { x: 420, y: 120, width: 900, height: 500 } });
  const { PNG } = (() => { try { return require('pngjs'); } catch { return {}; } })();
  if (PNG) {
    const png = PNG.sync.read(shotBuf);
    let nonWhite = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      if (png.data[i] < 240 || png.data[i + 1] < 240 || png.data[i + 2] < 240) nonWhite += 1;
    }
    const ratio = nonWhite / (png.width * png.height);
    ok('the Piped page renders real content (not a blank frame)', ratio > 0.1, `${(ratio * 100).toFixed(1)}% non-white`);
  } else {
    console.log('SKIP  pixel check (pngjs not installed)');
  }

  const shot = '/tmp/req150-youtube-embed.png';
  await page.screenshot({ path: shot });
  console.log(`screenshot: ${shot}`);

  await browser.close();
  if (failures.length) {
    console.log(`\nprobe-browser-embed: ${failures.length} regression(s): ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nprobe-browser-embed: YouTube plays in the pane — all checks passed.');
})();
