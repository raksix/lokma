#!/usr/bin/env node
'use strict';
/**
 * REQ-187 live acceptance probe — an attached file's CONTENT reaches the model.
 *
 * Layer A (deployed server 127.0.0.1:3456 + capture stub, zero model cost):
 *   T1  single .md — token rides as one <file> block on the wire, prompt once
 *   T2  three files + one PNG in one prompt — 3 blocks + image_url part;
 *       the REST row carries files[] + images[] (the reload card source)
 *   T3  oversize frame — clean 'Invalid message shape' error, server alive
 *   T4  PDF — /api/attachments/extract returns the sentence and cleans its dir
 *   T5  cleanup — provider + sessions gone (stays-gone re-checks), gate ON
 * Layer B (real browser composer against the live app):
 *   B1  the app opens the probe session, composer ready
 *   B2  four attachments chipped (300KB txt + md + json + png)
 *   B3  run completes; the assistant reply renders; composer idle again
 *   B4  wire: cap marker rides exactly once, truncated tail is absent,
 *       the three <file> blocks + the image part are in the same request
 *   B5  DOM: 3 file cards under the message, big card flags [truncated],
 *       the image renders as an image (not a text card)
 *
 * Run from the repo root:
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a \
 *     node scripts/probe-file-attachment-context.cjs
 * Flags: --no-browser, --url <origin> (default https://lokma.fermag.com.tr)
 */
const { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const http = require('node:http');
const WebSocket = require('ws');

let chromium = null;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  chromium = null;
}

const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const NL = String.fromCharCode(10);
const BASE = 'http://127.0.0.1:3456';
const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf('--' + n);
  return i === -1 ? d : args[i + 1];
};
const LIVE = arg('url', 'https://lokma.fermag.com.tr');
const NO_BROWSER = args.includes('--no-browser');

const PROBE_NS = 'probe187-';
const PROBE_ID = PROBE_NS + Date.now().toString(36);
const MODEL = PROBE_ID + '/capture-model';
/** Real 1x1 PNG (signature-verified) — the image half of the acceptance. */
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const BIG_START = 'BIG187-START';
const BIG_TAIL = 'TAIL-TOKEN-187-NEVER';
const PDF_SENTENCE = 'PROBE187-PDF-SENTENCE-OK';

let passed = 0;
const fails = [];
const check = (cond, label) => {
  if (cond) {
    passed += 1;
    console.log('PASS: ' + label);
  } else {
    fails.push(label);
    console.log('FAIL: ' + label);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── capture stub: records provider requests, answers a canned SSE reply ─────
const captures = [];
const stub = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => {
    raw += c;
  });
  req.on('end', () => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'capture-model' }] }));
      return;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.messages)) {
      captures.push({ path: req.url, messages: parsed.messages });
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    const chunks = [
      { choices: [{ index: 0, finish_reason: null, delta: { content: 'CAPTURE-OK' } }] },
      { choices: [{ index: 0, finish_reason: 'stop', delta: {} }] },
    ];
    for (const chunk of chunks) res.write('data: ' + JSON.stringify(chunk) + NL + NL);
    res.write('data: [DONE]' + NL + NL);
    res.end();
  });
});

const wireText = (cap) =>
  cap.messages
    .map((m) => {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content
          .map((p) => {
            if (p && typeof p.text === 'string') return p.text;
            if (p && p.type === 'image_url') return 'IMAGE-PART';
            return '';
          })
          .join(NL);
      }
      return '';
    })
    .join(NL);
const countOf = (hay, needle) => hay.split(needle).length - 1;
const listParts = (cap) => {
  const out = [];
  for (const m of cap.messages) {
    if (Array.isArray(m.content)) for (const p of m.content) out.push(p);
  }
  return out;
};
const lastUserFilesRow = (detail) => {
  const rows = detail.messages || [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const r = rows[i];
    if (r.role === 'user' && Array.isArray(r.files) && r.files.length > 0) return r;
  }
  return null;
};
const providerList = async (auth) => {
  const res = await fetch(BASE + '/api/providers', { headers: auth });
  const body = await res.json();
  const arr = Array.isArray(body) ? body : body.providers || [];
  return arr.map((p) => String(p.id || ''));
};

function sendPrompt(sessionId, token, payload) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:3456/ws/' + sessionId + '?token=' + token);
    const frames = [];
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      reject(new Error('ws run timeout'));
    }, 90000);
    ws.on('open', () =>
      ws.send(JSON.stringify(Object.assign({ type: 'prompt', sessionId, model: MODEL }, payload))),
    );
    ws.on('message', (rawMsg) => {
      let msg;
      try {
        msg = JSON.parse(String(rawMsg));
      } catch {
        return;
      }
      frames.push(msg);
      if (msg.type === 'done' || msg.type === 'run_end' || msg.type === 'error') {
        clearTimeout(timer);
        try {
          ws.close();
        } catch {}
        resolve({ frames, end: msg });
      }
    });
    ws.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

(async () => {
  const token = execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
  })
    .trim()
    .split(NL)
    .pop();
  const jsonAuth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
  const auth = { Authorization: 'Bearer ' + token };

  const cwd = mkdtempSync(join(tmpdir(), 'probe187-cwd-'));
  const pdfDir = mkdtempSync(join(tmpdir(), 'probe187-pdf-'));
  let sessionA = null;
  let sessionB = null;
  let webDir = null;

  await new Promise((r) => stub.listen(0, '127.0.0.1', r));
  const baseUrl = 'http://127.0.0.1:' + stub.address().port + '/v1';

  try {
    // ── Stale sweep: crashed runs must not 409 the provider id ──────────────
    try {
      const before = await providerList(auth);
      for (const id of before) {
        if (id.startsWith(PROBE_NS) && id !== PROBE_ID) {
          await fetch(BASE + '/api/providers/' + id, { method: 'DELETE', headers: auth }).catch(
            () => {},
          );
        }
      }
    } catch {}

    const add = await fetch(BASE + '/api/providers', {
      method: 'POST',
      headers: jsonAuth,
      body: JSON.stringify({ id: PROBE_ID, name: 'Probe 187 (temp)', baseUrl, apiKey: 'probe-local-key' }),
    });
    check(add.status === 201, 'provider registered (HTTP ' + add.status + ')');

    const created = await fetch(BASE + '/api/sessions', {
      method: 'POST',
      headers: jsonAuth,
      body: JSON.stringify({ cwd, model: MODEL }),
    });
    sessionA = (await created.json()).id;
    check(Boolean(sessionA), 'session A created for the wire half');

    // ── T1: one .md — token on the wire, as ONE labeled block ───────────────
    const notesContent = '# Notes' + NL + 'SECRET-TOKEN-42' + NL + 'son satir';
    const t1 = await sendPrompt(sessionA, token, {
      prompt: 'Ekli notu kullan.',
      files: [{ name: 'notes.md', mime: 'text/markdown', size: notesContent.length, content: notesContent }],
    });
    check(t1.end.type !== 'error', 'T1 run ended without error (' + t1.end.type + ')');
    const capA = captures.find((c) => wireText(c).includes('SECRET-TOKEN-42'));
    if (!capA) {
      check(false, 'T1 wire captured');
    } else {
      const allA = wireText(capA);
      check(countOf(allA, '<file name="notes.md"') === 1, 'T1 one <file> block on the wire');
      check(countOf(allA, 'SECRET-TOKEN-42') === 1, 'T1 content token exactly once');
      check(
        capA.messages.some(
          (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('<file name="notes.md"'),
        ),
        'T1 block rides a user message',
      );
      check(countOf(allA, '<attachment ') === 0, 'T1 no legacy <attachment> dump');
      check(countOf(allA, 'Ekli notu kullan.') === 1, 'T1 prompt text stays single (dedupe)');
    }
    const detail1 = await (
      await fetch(BASE + '/api/sessions/' + sessionA + '?cwd=' + encodeURIComponent(cwd), {
        headers: auth,
      })
    ).json();
    const row1 = lastUserFilesRow(detail1);
    check(
      Boolean(row1) && row1.files[0].name === 'notes.md' && row1.files[0].content.includes('SECRET-TOKEN-42'),
      'T1 REST row keeps the file (card + replay source)',
    );
    check(Boolean(row1) && !String(row1.content).includes('<attachment'), 'T1 persisted text stays clean');

    // ── T2: three files + one PNG in ONE prompt ─────────────────────────────
    const files2 = [
      { name: 'alpha.json', mime: 'application/json', size: 24, content: '{"probe":"JSON-TOKEN-A"}' },
      { name: 'beta.csv', mime: 'text/csv', size: 25, content: 'x,y' + NL + 'CSV-TOKEN-B,2' },
      { name: 'gamma.txt', mime: 'text/plain', size: 13, content: 'GAMMA-TOKEN-C' },
    ];
    const t2 = await sendPrompt(sessionA, token, {
      prompt: 'Uc dosya ve bir gorsel.',
      files: files2,
      images: [{ name: 'dot.png', mime: 'image/png', dataBase64: PNG_1PX }],
    });
    check(t2.end.type !== 'error', 'T2 run ended without error (' + t2.end.type + ')');
    const capB = captures.find((c) => wireText(c).includes('GAMMA-TOKEN-C'));
    if (!capB) {
      check(false, 'T2 wire captured');
    } else {
      const allB = wireText(capB);
      check(countOf(allB, '<file name="alpha.json"') === 1, 'T2 alpha.json block once');
      check(countOf(allB, '<file name="beta.csv"') === 1, 'T2 beta.csv block once');
      check(countOf(allB, '<file name="gamma.txt"') === 1, 'T2 gamma.txt block once');
      check(
        countOf(allB, 'JSON-TOKEN-A') === 1 && countOf(allB, 'CSV-TOKEN-B') === 1 && countOf(allB, 'GAMMA-TOKEN-C') === 1,
        'T2 each content token exactly once',
      );
      const img2 = listParts(capB).find(
        (p) => p && p.type === 'image_url' && String(p.image_url && p.image_url.url).startsWith('data:image/png;base64,'),
      );
      check(Boolean(img2) && String(img2.image_url.url).includes(PNG_1PX), 'T2 PNG rides as an image_url part (not text)');
    }
    const detail2 = await (
      await fetch(BASE + '/api/sessions/' + sessionA + '?cwd=' + encodeURIComponent(cwd), {
        headers: auth,
      })
    ).json();
    const row2 = lastUserFilesRow(detail2);
    check(
      Boolean(row2) && row2.files.length === 3 && row2.files.map((f) => f.name).join(',') === 'alpha.json,beta.csv,gamma.txt',
      'T2 REST row carries all 3 files (cards after reload)',
    );
    check(
      Boolean(row2) && Array.isArray(row2.images) && row2.images.length === 1 && row2.images[0].name === 'dot.png',
      'T2 REST row carries the image (card after reload)',
    );

    // ── T3: an oversize frame is refused honestly; the server stays up ──────
    const t3 = await sendPrompt(sessionA, token, {
      prompt: 'Bu cok buyuk.',
      files: [{ name: 'huge.txt', mime: 'text/plain', size: 999999, content: 'x'.repeat(102500) }],
    });
    check(
      t3.end.type === 'error' && String(t3.end.message || '').includes('Invalid message shape'),
      'T3 oversize frame refused with a clean error',
    );
    const t3b = await sendPrompt(sessionA, token, { prompt: 'SERVER-ALIVE-CHECK' });
    check(t3b.end.type !== 'error', 'T3 server still serves after the refused frame');
    check(
      captures.some((c) => wireText(c).includes('SERVER-ALIVE-CHECK')),
      'T3 follow-up prompt reached the provider',
    );

    // ── T4: PDF extraction + temp-dir cleanup + honest refusal ──────────────
    const pdfPath = join(pdfDir, 'sample.pdf');
    const py = [
      'import sys, fitz',
      'doc = fitz.open()',
      'page = doc.new_page()',
      "page.insert_text((72, 72), 'PROBE187-PDF-SENTENCE-OK')",
      'doc.save(sys.argv[1])',
    ].join(NL);
    execFileSync('python3', ['-c', py, pdfPath], { stdio: ['ignore', 'ignore', 'ignore'] });
    const pdfB64 = readFileSync(pdfPath).toString('base64');
    const countPdfDirs = () => readdirSync(tmpdir()).filter((n) => n.startsWith('lokma-pdf-')).length;
    const before = countPdfDirs();
    const ex = await fetch(BASE + '/api/attachments/extract', {
      method: 'POST',
      headers: jsonAuth,
      body: JSON.stringify({ name: 'sample.pdf', dataBase64: pdfB64 }),
    });
    const exBody = await ex.json();
    check(ex.status === 200 && exBody.ok === true, 'T4 PDF extract answered ok');
    check(
      typeof exBody.text === 'string' && exBody.text.includes(PDF_SENTENCE),
      'T4 extracted text carries the sentence',
    );
    check(exBody.truncated === false, 'T4 small PDF is not truncated');
    let leftover = countPdfDirs();
    for (let i = 0; i < 10 && leftover !== before; i += 1) {
      await sleep(200);
      leftover = countPdfDirs();
    }
    check(leftover === before, 'T4 no lokma-pdf-* temp leftovers (cleanup ran)');
    const fake = await fetch(BASE + '/api/attachments/extract', {
      method: 'POST',
      headers: jsonAuth,
      body: JSON.stringify({ name: 'fake.pdf', dataBase64: Buffer.from('not a pdf').toString('base64') }),
    });
    check(fake.status === 400, 'T4 negative: a non-PDF refused honestly (' + fake.status + ')');

    // ── Layer B: the real composer must cap a 300KB file on the wire ────────
    if (NO_BROWSER || !chromium) {
      console.log('SKIP: layer B (browser) — ' + (NO_BROWSER ? '--no-browser' : 'playwright-core missing'));
    } else {
      webDir = mkdtempSync(join(tmpdir(), 'probe187-web-'));
      const bigPath = join(webDir, 'big.txt');
      writeFileSync(bigPath, BIG_START + NL + 'A'.repeat(300000) + NL + BIG_TAIL + NL);
      const mdPath = join(webDir, 'notes2.md');
      writeFileSync(mdPath, '# ikinci not' + NL + 'WEB-MD-TOKEN');
      const jsonPath = join(webDir, 'data2.json');
      writeFileSync(jsonPath, '{"web":"WEB-JSON-TOKEN"}');
      const pngPath = join(webDir, 'dot2.png');
      writeFileSync(pngPath, Buffer.from(PNG_1PX, 'base64'));

      const created2 = await fetch(BASE + '/api/sessions', {
        method: 'POST',
        headers: jsonAuth,
        body: JSON.stringify({ cwd, model: MODEL }),
      });
      sessionB = (await created2.json()).id;
      check(Boolean(sessionB), 'B0 session B created for the browser half');

      const browser = await chromium.launch({
        executablePath: CHROME,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      try {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.addInitScript(
          ([t, sid]) => {
            try {
              localStorage.setItem('lokma-token', t);
              localStorage.setItem('lokma:sessionId', sid);
            } catch {}
          },
          [token, sessionB],
        );
        const page = await ctx.newPage();
        const seenUrls = [];
        page.on('request', (r) => seenUrls.push(r.url()));
        await page.goto(LIVE + '/?token=' + encodeURIComponent(token), { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('textarea', { timeout: 45000 });
        await page.waitForFunction(
          () => {
            const t = document.querySelector('textarea');
            return Boolean(t) && !t.disabled;
          },
          { timeout: 45000 },
        );
        await sleep(2500);

        const opened = seenUrls.some((u) => u.includes('/api/sessions/' + sessionB));
        check(opened, 'B1 the app opened the probe session (send gated on this)');

        if (opened) {
          const input = page.locator('input[type="file"][accept*=".md"]');
          await input.setInputFiles([bigPath, mdPath, jsonPath, pngPath]);
          let chipped = false;
          for (let i = 0; i < 40 && !chipped; i += 1) {
            chipped = await page.evaluate(
              () =>
                document.body.innerText.includes('big.txt') &&
                document.body.innerText.includes('dot2.png'),
            );
            if (!chipped) await sleep(400);
          }
          check(chipped, 'B2 all four attachments chipped in the composer');

          const ta = page.locator('textarea').last();
          await ta.fill('Ekteki dosyalari ozetle');
          await ta.press('Enter');
          let replied = false;
          for (let i = 0; i < 120 && !replied; i += 1) {
            replied = await page.evaluate(() => document.body.innerText.includes('CAPTURE-OK'));
            if (!replied) await sleep(500);
          }
          check(replied, 'B3 run completed (assistant reply rendered)');
          await sleep(2000);

          const dom = await page.evaluate(() => {
            const groups = Array.from(document.querySelectorAll('[data-user-files="1"]'));
            const last = groups.length ? groups[groups.length - 1] : null;
            const cards = last ? Array.from(last.querySelectorAll('[data-chat-user-file="1"]')) : [];
            const iGroups = Array.from(document.querySelectorAll('[data-user-images="1"]'));
            const lastImgs = iGroups.length
              ? Array.from(iGroups[iGroups.length - 1].querySelectorAll('img'))
              : [];
            const bigCard = cards.find((c) => (c.textContent || '').includes('big.txt'));
            const ta = document.querySelector('textarea');
            return {
              cards: cards.length,
              images: lastImgs.length,
              bigCardText: bigCard ? bigCard.textContent || '' : '',
              taDisabled: ta ? ta.disabled : null,
              taValue: ta ? ta.value : null,
            };
          });
          check(dom.cards === 3, 'B4 three file cards under the sent message (got ' + dom.cards + ')');
          check(
            dom.bigCardText.includes('içerik kırpıldı') && dom.bigCardText.includes('[truncated]'),
            'B5 the big file card flags [truncated]',
          );
          check(dom.images >= 1, 'B6 the PNG rendered as an image (not a text card)');
          check(
            dom.taDisabled === false && (dom.taValue || '') === '',
            'B7 composer idle again (chat not locked)',
          );

          const capW = captures.find((c) => wireText(c).includes('BIG187-START'));
          if (!capW) {
            check(false, 'B8 browser request captured on the wire');
          } else {
            const allW = wireText(capW);
            check(
              countOf(allW, '[file truncated: ') === 1 && allW.includes('first 100000 shown'),
              'B8 composer cap marker on the wire exactly once',
            );
            check(countOf(allW, BIG_TAIL) === 0, 'B9 truncated tail never left the browser');
            check(
              countOf(allW, '<file name="big.txt"') === 1 &&
                countOf(allW, '<file name="notes2.md"') === 1 &&
                countOf(allW, '<file name="data2.json"') === 1,
              'B10 all three attached files ride as <file> blocks',
            );
            check(
              listParts(capW).some(
                (p) => p && p.type === 'image_url' && String(p.image_url && p.image_url.url).startsWith('data:image/'),
              ),
              'B11 the image part is in the same request',
            );
          }

          const detailW = await (
            await fetch(BASE + '/api/sessions/' + sessionB + '?cwd=' + encodeURIComponent(cwd), {
              headers: auth,
            })
          ).json();
          const rowW = lastUserFilesRow(detailW);
          check(
            Boolean(rowW) &&
              rowW.files.length === 3 &&
              String(rowW.files[0].content).includes('[file truncated') &&
              Array.isArray(rowW.images) &&
              rowW.images.length === 1,
            'B12 REST row keeps the capped big file + 2 files + 1 image',
          );

          try {
            await page.screenshot({ path: '/tmp/probe187-browser.png' });
            console.log('screenshot: /tmp/probe187-browser.png');
          } catch {}
        }
      } finally {
        await browser.close();
      }
    }
  } finally {
    // ── Cleanup + stays-gone re-checks ──────────────────────────────────────
    for (const sid of [sessionA, sessionB]) {
      if (sid) {
        await fetch(BASE + '/api/sessions/' + sid + '?cwd=' + encodeURIComponent(cwd), {
          method: 'DELETE',
          headers: auth,
        }).catch(() => {});
      }
    }
    await fetch(BASE + '/api/providers/' + PROBE_ID, { method: 'DELETE', headers: auth }).catch(() => {});
    rmSync(cwd, { recursive: true, force: true });
    rmSync(pdfDir, { recursive: true, force: true });
    if (webDir) rmSync(webDir, { recursive: true, force: true });

    let gone = false;
    for (let i = 0; i < 5 && !gone; i += 1) {
      gone = !(await providerList(auth).catch(() => [PROBE_ID])).some((id) => id.startsWith(PROBE_NS));
      if (!gone) await sleep(400);
    }
    check(gone, 'cleanup: ephemeral provider gone (stays-gone)');

    let sessionGone = false;
    if (sessionA) {
      for (let i = 0; i < 5 && !sessionGone; i += 1) {
        const r = await fetch(BASE + '/api/sessions/' + sessionA + '?cwd=' + encodeURIComponent(cwd), {
          headers: auth,
        }).catch(() => null);
        sessionGone = Boolean(r) && r.status === 404;
        if (!sessionGone) await sleep(400);
      }
    } else {
      sessionGone = true;
    }
    check(sessionGone, 'cleanup: session A gone (404)');

    let sessionBGone = false;
    if (sessionB) {
      for (let i = 0; i < 5 && !sessionBGone; i += 1) {
        const r = await fetch(BASE + '/api/sessions/' + sessionB + '?cwd=' + encodeURIComponent(cwd), {
          headers: auth,
        }).catch(() => null);
        sessionBGone = Boolean(r) && r.status === 404;
        if (!sessionBGone) await sleep(400);
      }
    } else {
      sessionBGone = true;
    }
    check(sessionBGone, 'cleanup: session B gone (404)');

    const me = await fetch(BASE + '/api/auth/me').catch(() => null);
    check(Boolean(me) && me.status === 401, 'login gate stays ON (tokenless /api/auth/me -> ' + (me ? me.status : 'n/a') + ')');

    stub.close();
  }

  console.log('probe-file-attachment-context: ' + passed + ' passed, ' + fails.length + ' failed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  console.error('PROBE CRASHED:', e && e.message ? e.message : e);
  process.exit(1);
});
