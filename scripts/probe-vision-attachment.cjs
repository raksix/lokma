#!/usr/bin/env node
/**
 * REQ-186 live probe — attached images reach the model AND survive reload.
 *
 * Drives the DEPLOYED lokma server over its real HTTP + WS API with a real
 * model (the configured default unless one is passed). Proves four layers:
 *
 *   1. NEGATIVE caps — a frame with more than PROMPT_MAX_IMAGES images and a
 *      frame with an over-cap image are rejected ("Invalid message shape"),
 *      never half-accepted.
 *   2. POSITIVE read — one test card (red 42, blue 7) rides the prompt; the
 *      answer carries BOTH numbers AND both colours (vision, not OCR).
 *   3. MULTI — two cards (42/7 + green 88) in one prompt; every number comes
 *      back, so each image really reached the model.
 *   4. PERSISTENCE — the user rows carry their images on the REST read-back
 *      (what a reload renders) and on the live transcript_append feed.
 *
 * Cleanup: session DELETE with bounded stays-gone re-check (REST + disk),
 * temp cwd removed, login gate re-asserted (tokenless /api/auth/me = 401).
 *
 * Usage (repo root, needs ./node_modules/ws):
 *   node scripts/probe-vision-attachment.cjs [provider/model]
 */
const { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const WebSocket = require('ws');

const NL = String.fromCharCode(10);
const BASE = 'http://127.0.0.1:3456';
const MODEL = process.argv[2] ?? 'commandcode/stealth/space-bunny-alpha';
const IMG_A = process.env.VISION_IMG_A || '/tmp/vision_test.png'; // red 42 + blue 7
const IMG_B = process.env.VISION_IMG_B || '/tmp/vision_test_b.png'; // green 88

let passed = 0;
const failures = [];
function check(cond, label, detail) {
  if (cond) {
    passed += 1;
    console.log('PASS: ' + label);
  } else {
    failures.push(label);
    console.log('FAIL: ' + label + (detail ? '  - ' + detail : ''));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mintToken() {
  return execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
  })
    .trim()
    .split(NL)
    .pop();
}

let TOKEN = '';
async function api(path, opts) {
  const o = opts || {};
  const headers = { Authorization: 'Bearer ' + TOKEN };
  if (o.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method: o.method || 'GET',
    headers: headers,
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = null;
  }
  return { status: res.status, json: json, text: text };
}

/** Does the on-disk transcript for this id still exist under ~/.lokma? */
function diskHasSession(id) {
  const base = join(process.env.HOME || '/root', '.lokma', 'projects');
  let dirs = [];
  try {
    dirs = readdirSync(base);
  } catch (e) {
    return false;
  }
  for (const d of dirs) {
    const file = join(base, d, 'sessions', id + '.jsonl');
    if (existsSync(file)) return true;
  }
  return false;
}

(async () => {
  TOKEN = mintToken();
  check(typeof TOKEN === 'string' && TOKEN.length > 20, 'minted E2E bearer (login gate stays ON)');
  check(existsSync(IMG_A), 'test card A present (' + IMG_A + ')');
  check(existsSync(IMG_B), 'test card B present (' + IMG_B + ')');

  const b64a = readFileSync(IMG_A).toString('base64');
  const b64b = readFileSync(IMG_B).toString('base64');

  // 1) fresh session (temp cwd so nothing of ours lingers in a real project)
  const cwd = mkdtempSync(join(tmpdir(), 'lokma-vision-probe-'));
  const created = await api('/api/sessions', { method: 'POST', body: { cwd: cwd, model: MODEL } });
  check(created.status === 200 || created.status === 201, 'session created over REST (HTTP ' + created.status + ')');
  const sessionId = (created.json && (created.json.id || created.json.sessionId)) || '';
  check(typeof sessionId === 'string' && sessionId.length > 0, 'session id returned');

  // 2) socket + frame log
  const frames = [];
  const ws = new WebSocket('ws://127.0.0.1:3456/ws/' + sessionId + '?token=' + TOKEN);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  check(ws.readyState === WebSocket.OPEN, 'websocket attached to the session');
  ws.on('message', (raw) => {
    let msg = null;
    try {
      msg = JSON.parse(String(raw));
    } catch (e) {
      return;
    }
    frames.push(msg);
    if (msg.type === 'permission_request') {
      ws.send(JSON.stringify({ type: 'permission_response', requestId: msg.requestId, decision: 'allow' }));
    }
  });

  let cursor = 0;
  /** Wait until a frame at-or-after the cursor matches pred; consumes up to it. */
  function waitFor(pred, ms) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        while (cursor < frames.length) {
          const f = frames[cursor];
          cursor += 1;
          if (pred(f)) {
            clearInterval(iv);
            resolve(f);
            return;
          }
        }
        if (Date.now() - t0 > ms) {
          clearInterval(iv);
          resolve(null);
        }
      }, 50);
    });
  }
  const isInvalidShape = (f) => f.type === 'error' && String(f.message || '').includes('Invalid message shape');
  const isTerminal = (f) => f.type === 'done' || f.type === 'run_end' || f.type === 'error';

  // 3) negative — protocol caps reject instead of half-accepting
  const tiny = (n) => ({ name: 'tiny-' + n + '.png', mime: 'image/png', dataBase64: 'AAAA' });
  const seven = [];
  for (let i = 0; i < 7; i += 1) seven.push(tiny(i));
  ws.send(JSON.stringify({ type: 'prompt', sessionId: sessionId, model: MODEL, prompt: 'cap probe', images: seven }));
  const tooMany = await waitFor(isInvalidShape, 8000);
  check(!!tooMany, 'more than PROMPT_MAX_IMAGES is rejected (Invalid message shape)');

  ws.send(
    JSON.stringify({
      type: 'prompt',
      sessionId: sessionId,
      model: MODEL,
      prompt: 'cap probe',
      images: [{ name: 'huge.png', mime: 'image/png', dataBase64: 'A'.repeat(2000001) }],
    }),
  );
  const tooBig = await waitFor(isInvalidShape, 15000);
  check(!!tooBig, 'an over-cap image is rejected (Invalid message shape)');

  // 4) positive — the 42/7 card must come back with numbers AND colours
  ws.send(
    JSON.stringify({
      type: 'prompt',
      sessionId: sessionId,
      model: MODEL,
      prompt:
        'The attached image is a test card. Reply with ONLY the two numbers you can see and the colour of each, on one line, like: 12 red, 34 blue.',
      images: [{ name: 'vision_test.png', mime: 'image/png', dataBase64: b64a }],
    }),
  );
  const endA = await waitFor(isTerminal, 240000);
  check(!!endA, 'run A finished (terminal frame arrived)');
  if (endA && endA.type === 'error') console.log('    run A error frame: ' + String(endA.message || ''));
  const textA = frames.filter((f) => f.type === 'text_delta' && f.delta).map((f) => f.delta).join('');
  const lowA = textA.toLowerCase();
  check(textA.includes('42') && textA.includes('7'), 'model read both numbers (42, 7)', 'got: ' + textA.slice(0, 160));
  const redOk = lowA.includes('red') || lowA.includes('kirmizi') || lowA.includes('kırmızı');
  const blueOk = lowA.includes('blue') || lowA.includes('mavi') || lowA.includes('mavı');
  check(redOk && blueOk, 'model named both colours (vision, not OCR)', 'got: ' + textA.slice(0, 160));
  check(endA && endA.type !== 'error', 'run A ended cleanly (' + (endA ? endA.type : 'none') + ')');

  // 5) multi — both cards must reach the model in one prompt
  ws.send(
    JSON.stringify({
      type: 'prompt',
      sessionId: sessionId,
      model: MODEL,
      prompt: 'Two test cards are attached. Reply with ONLY every number you can see across both cards, comma-separated.',
      images: [
        { name: 'vision_test.png', mime: 'image/png', dataBase64: b64a },
        { name: 'vision_test_b.png', mime: 'image/png', dataBase64: b64b },
      ],
    }),
  );
  const endB = await waitFor(isTerminal, 240000);
  check(!!endB, 'run B finished (terminal frame arrived)');
  if (endB && endB.type === 'error') console.log('    run B error frame: ' + String(endB.message || ''));
  const textB = frames.filter((f) => f.type === 'text_delta' && f.delta).map((f) => f.delta).join('');
  check(
    textB.includes('42') && textB.includes('7') && textB.includes('88'),
    'both images reached the model (42, 7, 88 all present)',
    'got: ' + textB.slice(0, 200),
  );
  check(endB && endB.type !== 'error', 'run B ended cleanly (' + (endB ? endB.type : 'none') + ')');

  // 6) live feed — transcript_append frames carry the images (reload trap)
  const feedWithImages = frames.filter(
    (f) => f.type === 'transcript_append' && f.message && f.message.role === 'user' && Array.isArray(f.message.images) && f.message.images.length > 0,
  );
  check(feedWithImages.length >= 2, 'live feed carried user images (' + feedWithImages.length + ' rows)');

  // 7) persistence — REST read-back carries the images a reload renders
  await sleep(500);
  const readBack = await api('/api/sessions/' + sessionId);
  check(readBack.status === 200, 'REST transcript read-back (HTTP ' + readBack.status + ')');
  const msgs = (readBack.json && readBack.json.messages) || [];
  const withImages = msgs.filter((m) => m.role === 'user' && Array.isArray(m.images) && m.images.length > 0);
  check(withImages.length === 2, 'both user prompts persisted with images (' + withImages.length + '/2)');
  if (withImages.length === 2) {
    check(withImages[0].images.length === 1, 'first prompt kept exactly its 1 image');
    check(withImages[1].images.length === 2, 'second prompt kept both its 2 images');
    const img = withImages[0].images[0];
    check(
      img && typeof img.name === 'string' && typeof img.mime === 'string' && typeof img.dataBase64 === 'string' && img.dataBase64.length > 1000,
      'persisted image carries name/mime/bytes (' + (img ? img.dataBase64.length + ' b64 chars' : 'none') + ')',
    );
  }

  // 8) cleanup — DELETE with bounded stays-gone re-check (REST + disk)
  ws.close();
  await api('/api/sessions/' + sessionId, { method: 'DELETE' }).catch(() => null);
  let gone = false;
  for (let i = 0; i < 6; i += 1) {
    await sleep(400);
    const g = await api('/api/sessions/' + sessionId).catch(() => ({ status: 0 }));
    if (g.status === 404 && !diskHasSession(sessionId)) {
      gone = true;
      break;
    }
    await api('/api/sessions/' + sessionId, { method: 'DELETE' }).catch(() => null);
  }
  check(gone, 'probe session deleted and stays gone (REST 404 + no disk file)');
  rmSync(cwd, { recursive: true, force: true });
  check(!existsSync(cwd), 'temp cwd removed');

  // The server auto-creates a cwd-scoped store (~/.lokma/projects/<encoded>)
  // for every session cwd; DELETE removes the session rows, not the store
  // dir. Sweep it so the probe leaves ZERO leftovers (sessions/, usage.jsonl,
  // the dir itself) — same zero-leftover rule as every REQ probe.
  const projectsRoot = join(process.env.HOME || '/root', '.lokma', 'projects');
  const tag = cwd.slice(cwd.lastIndexOf('/') + 1);
  let swept = 0;
  try {
    for (const d of readdirSync(projectsRoot)) {
      if (d.includes(tag)) {
        rmSync(join(projectsRoot, d), { recursive: true, force: true });
        swept += 1;
      }
    }
  } catch (e) {}
  let left = [];
  try {
    left = readdirSync(projectsRoot).filter((d) => d.includes(tag));
  } catch (e) {}
  check(swept >= 1 && left.length === 0, 'probe project dir swept (' + swept + ' removed)');

  // 9) gate re-assert — tokenless call must still be refused
  const anon = await fetch(BASE + '/api/auth/me');
  check(anon.status === 401, 'login gate still ON (tokenless /api/auth/me = ' + anon.status + ')');

  console.log('');
  console.log('vision-attachment probe: ' + passed + ' passed, ' + failures.length + ' failed on ' + MODEL);
  if (failures.length) {
    console.log('failed checks: ' + failures.join(' | '));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
