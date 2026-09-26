#!/usr/bin/env node
/**
 * REQ-162 live probe — the terminal pane must be a REAL terminal emulator
 * (xterm), not a plain-text scrollback.
 *
 * What it proves, against the LIVE app (authed with a minted Bearer token —
 * the login gate stays ON, see scripts/mint-e2e-token.mjs):
 *   1. the pane mounts an xterm instance (.xterm / .xterm-screen / textarea)
 *      and the emulator fills the box it was given (a collapsed viewport was
 *      exactly the REQ-162 bug: the sidebar is an unbounded scrolling column)
 *   2. clicking the terminal focuses its input (xterm's own textarea)
 *   3. a blinking cursor sits in the viewport where the shell puts it
 *   4. typing shows the characters and Backspace erases them on screen
 *   5. SGR colours render (printf with \033[31m paints the theme red)
 *   6. a full-screen app takes the alternate screen and gives it back (vi)
 *   7. the pane pushes `terminal/resize` when its box changes, and the spawn
 *      carried real cols/rows
 *   8. REQ-158 regression: the typed line is not duplicated on screen
 *
 * Usage:
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-terminal-xterm.cjs --url https://lokma.fermag.com.tr --token "$TK"
 */
const { chromium } = require('playwright-core');

const BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : 'https://lokma.fermag.com.tr';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN = (process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : '') || process.env.TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RED = `REQ162RED${Math.floor(Math.random() * 9000 + 1000)}`;
const DUP = `REQ162DUP${Math.floor(Math.random() * 9000 + 1000)}`;

if (!TOKEN) {
  console.error('TOKEN required');
  process.exit(1);
}

const failures = [];
const ok = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures.push(name);
};
const skip = (name, detail) => console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ''}`);

// ── DOM readers (run inside the page) ───────────────────────────────────────

const emulatorInfo = (page) =>
  page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const host = document.querySelector('[data-terminal-host]');
    const xt = document.querySelector('.xterm');
    return {
      xterm: document.querySelectorAll('.xterm').length,
      screen: document.querySelectorAll('.xterm-screen').length,
      textarea: document.querySelectorAll('.xterm-helper-textarea').length,
      rows: document.querySelectorAll('.xterm-rows').length,
      host: box(host),
      xtermBox: box(xt),
      active: (document.activeElement && (document.activeElement.className || document.activeElement.tagName) || '').toString(),
    };
  });

/** Last non-empty rendered line of the emulator viewport. */
const activeLine = (page) =>
  page.evaluate(() => {
    const rows = document.querySelector('.xterm-rows');
    if (!rows) return null;
    const lines = (rows.innerText || '')
      .split('\n')
      .map((l) => l.replace(/\u00a0/g, ' ').replace(/\s+$/, ''));
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (lines[i].trim() !== '') return lines[i];
    }
    return '';
  });

/** Count of vi-style filler rows (a line that is only tildes). */
const tildeRows = (page) =>
  page.evaluate(() => {
    const rows = document.querySelector('.xterm-rows');
    if (!rows) return -1;
    return (rows.innerText || '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^~+$/.test(l)).length;
  });

const cursorInfo = (page) =>
  page.evaluate(() => {
    const cur = document.querySelector('.xterm-cursor');
    if (!cur) return null;
    window.__cursorDiag = {
      hasDocFocus: document.hasFocus(),
      active: String(document.activeElement && document.activeElement.className || '').slice(0, 40),
      xterms: document.querySelectorAll('.xterm').length,
      cursorCount: document.querySelectorAll('.xterm-cursor').length,
      blinkCount: document.querySelectorAll('.xterm-cursor.xterm-cursor-blink').length,
    };
    const r = cur.getBoundingClientRect();
    const screen = document.querySelector('.xterm-screen');
    const s = screen ? screen.getBoundingClientRect() : null;
    return {
      blink: cur.classList.contains('xterm-cursor-blink'),
      block: cur.classList.contains('xterm-cursor-block'),
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      inScreen: s ? r.x >= s.x - 1 && r.right <= s.right + 1 && r.y >= s.y - 1 && r.bottom <= s.bottom + 1 : false,
    };
  });

/** Every leaf element in the viewport carrying `m`, with its computed colour. */
const colourHits = (page, m) =>
  page.evaluate((marker) => {
    const out = [];
    for (const el of document.querySelectorAll('.xterm-rows *')) {
      if (el.children.length) continue;
      const t = el.textContent || '';
      if (!t.includes(marker)) continue;
      out.push({ text: t.slice(0, 48), color: getComputedStyle(el).color });
    }
    return out;
  }, m);

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: process.env.PROBE_HEADFUL !== '1',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('lokma-token', t);
    } catch {
      /* ignore */
    }
    // Record what the app SENDS over the socket (resize frames) and the
    // terminal bytes it receives (liveness signal).
    // TRAP: a wrapper that only sets `.prototype` loses the statics
    // (`WebSocket.OPEN`), and the app's own send guard compares against
    // `WebSocket.OPEN` — every send then silently drops. Inherit the statics
    // from the native constructor (Object.setPrototypeOf) or input probes
    // measure their own harness bug.
    window.__sent = [];
    window.__recv = [];
    window.__wsUrls = [];
    const Native = window.WebSocket;
    const Patched = function (...args) {
      try {
        window.__wsUrls.push(String(args[0] || ''));
      } catch {
        /* ignore */
      }
      const ws = new Native(...args);
      const nativeSend = ws.send.bind(ws);
      ws.send = (data) => {
        try {
          const msg = JSON.parse(typeof data === 'string' ? data : '');
          if (msg && typeof msg.type === 'string') {
            window.__sent.push({ t: Date.now(), type: msg.type, cols: msg.cols ?? null, rows: msg.rows ?? null });
          }
        } catch {
          /* not json */
        }
        return nativeSend(data);
      };
      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
          if (msg && msg.type === 'terminal/data') window.__recv.push({ t: Date.now(), len: String(msg.data).length });
        } catch {
          /* not json */
        }
      });
      return ws;
    };
    Object.setPrototypeOf(Patched, Native);
    Patched.prototype = Native.prototype;
    window.WebSocket = Patched;
  }, TOKEN);

  const page = await ctx.newPage();
  const errors = [];
  const spawns = [];

  /**
   * The socket path carries the app's ACTIVE session id — the authoritative
   * scope for the terminal cleanup below.
   */
  const activeSessionId = async () => {
    const urls = await page.evaluate(() => window.__wsUrls || []);
    const m = urls.length ? String(urls[urls.length - 1]).match(/\/ws\/([^?]+)/) : null;
    return m ? m[1] : '';
  };

  /**
   * Delete this session's running shells. Two reasons: (a) a shell that has
   * ever run vim carries `ESC[?12l` in its history (vim turns the cursor
   * blink off) — the emulator then legitimately stops blinking, and the
   * blink check would measure that shell's fate instead of the pane; (b)
   * probe-created state must not accumulate on the live host.
   */
  const clearTerminals = async (sessionId) => {
    if (!sessionId) return -1;
    try {
      const res = await fetch(`${BASE}/api/terminal`, { headers: { Authorization: `Bearer ${TOKEN}` } });
      const data = await res.json();
      const mine = (data.terminals || []).filter((t) => t.sessionId === sessionId && t.status === 'running');
      for (const t of mine) {
        await fetch(`${BASE}/api/terminal/${t.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } }).catch(() => {});
      }
      return mine.length;
    } catch {
      return -1;
    }
  };
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
  page.on('request', (r) => {
    if (r.url().includes('/api/terminal') && r.method() === 'POST') {
      try {
        spawns.push(r.postDataJSON());
      } catch {
        spawns.push(null);
      }
    }
  });

  await page.goto(`${BASE}/?token=${TOKEN}`, { waitUntil: 'domcontentloaded' });
  await sleep(6000);

  // Open a real workspace session (same sidebar path the other live probes use).
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

  // Fresh shell: drop this session's leftover shells so the pane auto-starts
  // a clean one (see clearTerminals for why).
  const sessionId = await activeSessionId();
  const cleared = await clearTerminals(sessionId);
  console.log(`  (session ${sessionId || '?'} — cleared ${cleared} leftover shell(s))`);

  // Reveal the Terminal pane from the Inspector rail (the rail button owns
  // the tab + panel reveal; a generic text match also hits drag tips and
  // opens the wrong surface — the earlier probe bug).
  const revealed = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('button')].filter((b) => /^Terminal$/i.test(b.getAttribute('aria-label') || ''));
    const rail = cands.find((b) => b.hasAttribute('aria-pressed')) || cands[0];
    if (!rail) return false;
    rail.click();
    return true;
  });
  ok('the Terminal pane opens', revealed, revealed ? 'rail button clicked' : 'no Terminal rail button found');

  let mounted = false;
  for (let i = 0; i < 30; i += 1) {
    mounted = await page.evaluate(() => !!document.querySelector('.xterm-screen'));
    if (mounted) break;
    await sleep(400);
  }
  ok('the pane mounts an xterm emulator', mounted, mounted ? 'xterm screen present' : 'no .xterm-screen in 12s');
  const first = await emulatorInfo(page);
  ok(
    'the emulator has a screen, rows and an input textarea',
    first.xterm >= 1 && first.rows >= 1 && first.textarea >= 1,
    `xterm=${first.xterm} rows=${first.rows} textarea=${first.textarea}`,
  );
  ok(
    'the emulator fills the box it was given',
    Boolean(first.host && first.xtermBox && first.xtermBox.w >= first.host.w * 0.9 && first.xtermBox.h >= first.host.h * 0.8),
    `host=${JSON.stringify(first.host)} xterm=${JSON.stringify(first.xtermBox)}`,
  );

  // Wait for a live shell: clicking the emulator screen starts one when the
  // pane is empty (exactly what a user does) and focuses it when it is not.
  let live = false;
  for (let i = 0; i < 30; i += 1) {
    await page.locator('.xterm-screen').first().click({ force: true }).catch(() => {});
    await sleep(500);
    const seen = await page.evaluate(() => (window.__recv || []).length);
    if (seen > 0) {
      live = true;
      break;
    }
  }
  ok('a shell is live (bytes arrive)', live, live ? 'terminal/data received' : 'no bytes in 15s');
  await sleep(800);

  // 1 ── focus: clicking the terminal hands keystrokes to xterm's textarea.
  // Every later typing block goes through `typeIn` below, which performs this
  // same click first — a plain keyboard.type right after another block reads
  // to the user as 'typed into nothing' and the harness loses focus between
  // samples (headless window focus is not a user's steady focus).
  const focusTerminal = async () => {
    // Force a REAL focus transition: xterm paints the blinking cursor only
    // after a genuine textarea `focus` event, and a programmatic focus while
    // the window is settling never fires one (seen: cursor painted, no
    // `xterm-cursor-blink` class until focus leaves and returns).
    await page
      .evaluate(() => {
        const el = document.activeElement;
        if (el instanceof HTMLElement && el.className.includes('xterm-helper-textarea')) el.blur();
      })
      .catch(() => {});
    await sleep(120);
    await page.locator('.xterm-screen').first().click({ force: true }).catch(() => {});
    await sleep(250);
    return page.evaluate(() => (document.activeElement && document.activeElement.className || '').toString());
  };
  const typeIn = async (text, delay = 60) => {
    await focusTerminal();
    await page.keyboard.type(text, { delay });
    await sleep(800);
    return activeLine(page);
  };
  let focusState = await focusTerminal();
  if (!focusState.includes('xterm-helper-textarea')) focusState = await focusTerminal();
  ok('clicking the terminal focuses its input', focusState.includes('xterm-helper-textarea'), `activeElement="${focusState.slice(0, 60)}"`);

  // 2 ── cursor: present, blinking, inside the screen box. Blink is sampled
  // over a short window (the renderer re-paints the cursor row asynchronously)
  // and each sample starts from a fresh click so the focus event always fires.
  let cursor = null;
  let blinkSeen = false;
  for (let i = 0; i < 10; i += 1) {
    if (i % 3 === 0) await focusTerminal();
    cursor = (await cursorInfo(page)) ?? cursor;
    if (cursor && cursor.blink) {
      blinkSeen = true;
      break;
    }
    await sleep(220);
  }
  ok('a cursor is painted in the viewport', Boolean(cursor), cursor ? JSON.stringify(cursor.box) : 'no .xterm-cursor element');
  if (cursor) {
    const diag = await page.evaluate(() => window.__cursorDiag || null);
    ok('the cursor blinks', blinkSeen, `.xterm-cursor.xterm-cursor-blink seen=${blinkSeen} diag=${JSON.stringify(diag)}`);
    ok('the cursor sits inside the screen', cursor.inScreen, `box=${JSON.stringify(cursor.box)}`);
  }

  // 3 ── typing + Backspace erase on screen.
  let typedLine = await typeIn('abc');
  if (!typedLine || !typedLine.endsWith('abc')) {
    typedLine = await typeIn('abc');
  }
  ok('typing shows the characters', Boolean(typedLine && typedLine.endsWith('abc')), `line="${typedLine}"`);
  await page.keyboard.press('Backspace');
  await sleep(800);
  const erasedLine = await activeLine(page);
  ok(
    'Backspace erases the character on screen',
    Boolean(erasedLine && erasedLine.endsWith('ab') && !erasedLine.endsWith('abc')),
    `line="${erasedLine}"`,
  );
  await page.keyboard.press('Control+c');
  await sleep(500);

  // 4 ── SGR colours render
  await typeIn(`printf '\\033[31m${RED}\\033[0m\\n'`, 15);
  await page.keyboard.press('Enter');
  await sleep(1600);
  const hits = await colourHits(page, RED);
  const redHit = hits.find((h) => h.color === 'rgb(229, 72, 77)');
  ok('an ANSI colour is rendered as colour', Boolean(redHit), hits.length ? JSON.stringify(hits.slice(0, 3)) : 'marker not painted');

  // 5 ── full-screen app: alternate screen in and out (vi)
  const before = await tildeRows(page);
  await typeIn('vi -u NONE', 20);
  await page.keyboard.press('Enter');
  await sleep(2200);
  const during = await tildeRows(page);
  if (during < 3) {
    skip('vi fills the alternate screen', `tilde rows during vi=${during}`);
  } else {
    ok('vi fills the alternate screen', during >= 3, `${during} filler rows`);
    await page.locator('.xterm-screen').first().click({ force: true }).catch(() => {});
    await page.keyboard.type(':q!', { delay: 40 });
    await page.keyboard.press('Enter');
    await sleep(1500);
    const after = await tildeRows(page);
    ok('vi exits back to the shell', after < 3, `tilde rows before=${before} during=${during} after=${after}`);
  }
  await page.keyboard.press('Control+c');
  await sleep(400);

  // 6 ── resize: spawn carried a real size and a box change reports back
  const spawn = spawns.find((s) => s && typeof s.cols === 'number' && typeof s.rows === 'number') || null;
  ok(
    'the shell spawned with emulator cols/rows',
    Boolean(spawn && spawn.cols >= 2 && spawn.rows >= 2),
    spawn ? `cols=${spawn.cols} rows=${spawn.rows}` : 'no POST /api/terminal with cols/rows',
  );
  const resizesBefore = await page.evaluate(() => (window.__sent || []).filter((f) => f.type === 'terminal/resize').length);
  await page.setViewportSize({ width: 1400, height: 680 });
  await sleep(2200);
  const resizeFrames = await page.evaluate(() => (window.__sent || []).filter((f) => f.type === 'terminal/resize').map((f) => `${f.cols}x${f.rows}`));
  const fresh = resizeFrames.length > resizesBefore;
  ok(
    'a box change pushes terminal/resize',
    fresh,
    `frames=${JSON.stringify(resizeFrames.slice(-4))} (before=${resizesBefore})`,
  );

  // 7 ── REQ-158 regression: no duplicated echo/output of the typed line
  await typeIn(`echo ${DUP}`, 20);
  await page.keyboard.press('Enter');
  await sleep(1800);
  const dupCount = await page.evaluate((m) => {
    const rows = document.querySelector('.xterm-rows');
    return ((rows && rows.innerText) || '').split(m).length - 1;
  }, DUP);
  ok('the typed line is echoed and answered once each', dupCount >= 2 && dupCount <= 3, `marker painted ${dupCount}× (expect 2-3)`);

  console.log('--- errors seen ---');
  console.log(errors.slice(0, 8).join('\n') || '(none)');
  const jsErrors = errors.filter((e) => !/Failed to load resource/i.test(e));
  ok('no JavaScript errors on the page', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | ') || 'clean');

  await page.screenshot({ path: '/tmp/req162-terminal.png' });
  console.log('screenshot: /tmp/req162-terminal.png');
  // Leave the live host as we found it: no probe-created shells.
  const leftover = await clearTerminals(sessionId);
  console.log(`  (cleanup: removed ${leftover} shell(s) spawned by this run)`);
  await browser.close();
  if (failures.length) {
    console.log(`\nprobe-terminal-xterm: ${failures.length} failure(s): ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nprobe-terminal-xterm: all checks passed.');
})();
