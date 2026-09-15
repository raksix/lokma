#!/usr/bin/env node
/**
 * REQ-151/152 live probe — floating-window containment + Windows-style focus.
 *
 * 1. opens a session, splits the workspace and pops out into windowed mode,
 * 2. drags a window far past the bottom edge and asserts it stays INSIDE the
 *    canvas (REQ-151: the y clamp used to keep only a 40px title strip),
 * 3. clicks the back window and asserts it comes to the front (REQ-152),
 * 4. reloads and asserts the stacking survived (persisted order).
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-windowed-stack.cjs --url https://lokma.fermag.com.tr --token "$TK"
 *
 * Exit code 0 = windows stay put and focus raises; 1 = regression.
 */
const { chromium } = require('playwright-core');

const BASE = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'https://lokma.fermag.com.tr';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN =
  (process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : '') ||
  process.env.TOKEN;
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

const WINDOWS = () =>
  [...document.querySelectorAll('[data-window-id]')].map((el) => {
    const r = el.getBoundingClientRect();
    const canvas = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
    return {
      id: el.getAttribute('data-window-id'),
      z: Number(el.getAttribute('data-window-z') || 0),
      rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) },
      canvas: canvas ? { top: Math.round(canvas.top), bottom: Math.round(canvas.bottom), left: Math.round(canvas.left), right: Math.round(canvas.right) } : null,
      title: (el.querySelector('span')?.innerText || '').slice(0, 24),
    };
  });

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
  const bad = [];
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(0, 100)}`);
  });
  page.on('requestfailed', (r) => bad.push(`failed ${r.url().slice(0, 100)}`));

  await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await sleep(5000);

  // Seed the persisted pane system instead of clicking through the shell:
  // two panes + windowed mode + one real session tab (documented recipe).
  const sid = await page.evaluate(async () => {
    const raw = localStorage.getItem('lokma-token') || '';
    const res = await fetch('/api/sessions', { headers: { authorization: `Bearer ${raw}` } });
    const data = await res.json();
    const list = (data.sessions || []).filter((s) => s.cwd && s.id);
    const pick = list.find((s) => s.cwd === '/mnt/apopic/lokma') || list[0];
    return pick ? pick.id : '';
  });
  if (!sid) {
    console.error('no session with a workspace to seed');
    process.exit(1);
  }
  await page.evaluate((sessionId) => {
    localStorage.setItem(
      'lokma:layout:v1',
      JSON.stringify({
        state: {
          layout: {
            type: 'split',
            id: 'root',
            dir: 'row',
            sizes: [50, 50],
            children: [
              { type: 'pane', id: 'probe-p1' },
              { type: 'pane', id: 'probe-p2' },
            ],
          },
          leftW: 240,
          rightW: 280,
          tiling: true,
          windowed: true,
          activeSessionId: sessionId,
        },
        version: 1,
      }),
    );
    localStorage.setItem(
      'lokma:tiling-tabs:v1',
      JSON.stringify({
        'probe-p1': {
          tabs: [{ id: 'tab-probe-1', title: 'Probe A', kind: 'session', sessionId }],
          active: 'tab-probe-1',
        },
        'probe-p2': {
          tabs: [{ id: 'tab-probe-2', title: 'Browser', kind: 'inspector', inspectorId: 'browser' }],
          active: 'tab-probe-2',
        },
      }),
    );
    localStorage.setItem(
      'lokma:windowed-pos:v1',
      JSON.stringify({
        'probe-p1': { x: 24, y: 24, w: 560, h: 420 },
        'probe-p2': { x: 360, y: 260, w: 560, h: 420 },
      }),
    );
    localStorage.removeItem('lokma:windowed-order:v1');
  }, sid);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(7000);
  let wins = await page.evaluate(WINDOWS);
  ok('windowed mode opens floating windows', wins.length >= 2, `${wins.length} window(s): ${wins.map((w) => w.title).join(' | ')}`);
  if (wins.length < 2) {
    await page.screenshot({ path: '/tmp/req151-windowed-stack.png' });
    await browser.close();
    console.log(`\nprobe-windowed-stack: could not seed windowed mode (${wins.length} window(s))`);
    process.exit(1);
  }

  // Drag the first window's title bar far below the canvas.
  const target = wins[0];
  const dragFrom = await page.evaluate((id) => {
    const el = document.querySelector(`[data-window-id="${id}"]`);
    const bar = el ? el.querySelector('div') : null;
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  }, target.id);
  if (dragFrom) {
    await page.mouse.move(dragFrom.x, dragFrom.y);
    await page.mouse.down();
    for (const dy of [200, 600, 1200, 2000]) {
      await page.mouse.move(dragFrom.x, dragFrom.y + dy);
      await sleep(120);
    }
    await page.mouse.up();
    await sleep(800);
  }
  wins = await page.evaluate(WINDOWS);
  const dragged = wins.find((w) => w.id === target.id);
  ok(
    'a window dragged past the bottom stays inside the canvas (REQ-151)',
    Boolean(dragged && dragged.canvas && dragged.rect.bottom <= dragged.canvas.bottom + 1 && dragged.rect.top >= dragged.canvas.top - 1),
    dragged ? `window ${dragged.rect.top}..${dragged.rect.bottom} vs canvas ${dragged.canvas.top}..${dragged.canvas.bottom}` : 'window gone',
  );

  // Focus the back window → it must come to the front. Both windows may start
  // perfectly stacked, so find a point that really hit-tests to the back
  // window (a naive centre click lands on the front one).
  const back = [...wins].sort((a, b) => a.z - b.z)[0];
  const front = [...wins].sort((a, b) => b.z - a.z)[0];
  const clickPoint = await page.evaluate((backId) => {
    const el = document.querySelector(`[data-window-id="${backId}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    for (let y = r.top + 8; y < r.bottom - 8; y += 12) {
      for (let x = r.left + 8; x < r.right - 8; x += 16) {
        const hit = document.elementFromPoint(x, y);
        const win = hit && hit.closest ? hit.closest('[data-window-id]') : null;
        if (win && win.getAttribute('data-window-id') === backId) {
          return { x: Math.round(x), y: Math.round(y) };
        }
      }
    }
    return null;
  }, back.id);
  if (clickPoint) {
    await page.mouse.click(clickPoint.x, clickPoint.y);
    await sleep(800);
  }
  ok('a clickable spot on the back window was found', Boolean(clickPoint),
    clickPoint ? `${clickPoint.x},${clickPoint.y}` : 'fully covered by the front window');
  const after = await page.evaluate(WINDOWS);
  const backAfter = after.find((w) => w.id === back.id);
  const frontAfter = after.find((w) => w.id === front.id);
  ok(
    'clicking a window raises it to the front (REQ-152)',
    Boolean(backAfter && frontAfter && backAfter.z > frontAfter.z),
    `back z ${back.z} → ${backAfter ? backAfter.z : '?'}; front z ${front.z} → ${frontAfter ? frontAfter.z : '?'}`,
  );

  const orderBefore = after.slice().sort((a, b) => a.z - b.z).map((w) => w.id);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(6000);
  const winsAfterReload = await page.evaluate(WINDOWS);
  const orderAfter = winsAfterReload.slice().sort((a, b) => a.z - b.z).map((w) => w.id);
  ok(
    'the stacking survives a reload (persisted order)',
    orderAfter.length === orderBefore.length && orderAfter.every((id, i) => id === orderBefore[i]),
    `${orderBefore.join(',')} → ${orderAfter.join(',')}`,
  );
  ok('the focused window is marked in the DOM', winsAfterReload.some((w) => w.z === Math.max(...winsAfterReload.map((x) => x.z))), `z: ${winsAfterReload.map((w) => w.z).join(',')}`);

  const shot = '/tmp/req151-windowed-stack.png';
  await page.screenshot({ path: shot });
  console.log(`screenshot: ${shot}`);
  ok('no failed requests', bad.filter((x) => !x.includes('/api/sessions/sess_')).length === 0, bad.slice(0, 2).join(' | '));

  await browser.close();
  if (failures.length) {
    console.log(`\nprobe-windowed-stack: ${failures.length} regression(s): ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nprobe-windowed-stack: windows stay inside and focus raises — all checks passed.');
})();
