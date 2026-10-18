#!/usr/bin/env node
/**
 * REQ-205 slice 3 — LIVE proof that a client-side keyless run's rows persist
 * through the session socket (`transcript_record`) and read back marked with
 * `origin: 'client-free'`.
 *
 * Run (root, gate stays ON):
 *   HOME=/root bun scripts/mint-e2e-token.mjs > /tmp/tr-token.txt && chmod 600 /tmp/tr-token.txt
 *   LOKMA_TOKEN_FILE=/tmp/tr-token.txt node scripts/probe-transcript-record.cjs
 * Optional: LOKMA_BASE=http://127.0.0.1:3456 (default) — point it at the
 * deployed origin to prove the served build instead of a dev server.
 *
 * Exit codes: 0 = all checks pass · 1 = product defect · 2 = measurement
 * impossible (no token / no session). The probe creates its OWN throwaway
 * session and deletes it (re-checking the file stays gone) — the token file
 * is the caller's to remove.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');

const BASE = process.env.LOKMA_BASE || 'http://127.0.0.1:3456';
const WS_BASE = BASE.replace(/^http/, 'ws');
const TOKEN_FILE = process.env.LOKMA_TOKEN_FILE || '/tmp/req205-token.txt';

let token = '';
try {
  token = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
} catch {
  console.log('NO-MEASURE: token file unreadable: ' + TOKEN_FILE);
  process.exit(2);
}
if (!token) {
  console.log('NO-MEASURE: empty token file');
  process.exit(2);
}

let passed = 0;
const failures = [];
function check(cond, label) {
  if (cond) {
    passed += 1;
    console.log('PASS: ' + label);
  } else {
    failures.push(label);
    console.log('FAIL: ' + label);
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rest(method, url, body) {
  const headers = { authorization: 'Bearer ' + token };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(BASE + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body kept in text */
  }
  return { status: res.status, json, text };
}

/** Locate the session's JSONL across project dirs (hash(cwd) is not computed here). */
function transcriptPathFor(sessionId) {
  const root = path.join(os.homedir(), '.lokma', 'projects');
  let dirs = [];
  try {
    dirs = fs.readdirSync(root);
  } catch {
    return null;
  }
  for (const dir of dirs) {
    const p = path.join(root, dir, 'sessions', sessionId + '.jsonl');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function readRows(sessionId) {
  const p = transcriptPathFor(sessionId);
  if (!p) return null;
  return fs
    .readFileSync(p, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function main() {
  // 0. Throwaway session owned by the minted user.
  const created = await rest('POST', '/api/sessions', {});
  if (created.status !== 200 || !created.json || !created.json.id) {
    console.log('NO-MEASURE: session create failed status=' + created.status + ' body=' + created.text.slice(0, 140));
    process.exit(2);
  }
  const sessionId = created.json.id;
  console.log('session: ' + sessionId);

  const frames = [];
  const ws = new WebSocket(WS_BASE + '/ws/' + encodeURIComponent(sessionId) + '?token=' + encodeURIComponent(token));
  const opened = await new Promise((resolve) => {
    ws.on('open', () => resolve(true));
    ws.on('error', () => resolve(false));
    setTimeout(() => resolve(false), 8000);
  });
  if (!opened) {
    console.log('NO-MEASURE: ws handshake failed (' + WS_BASE + ')');
    process.exit(2);
  }
  ws.on('message', (buf) => {
    try {
      frames.push(JSON.parse(buf.toString()));
    } catch {
      /* non-JSON frame — never expected on this socket */
    }
  });
  /** Wait for a frame matching pred, scanning only frames from `start`. */
  const waitFrom = (start, pred, ms = 8000) =>
    new Promise((resolve) => {
      const deadline = Date.now() + ms;
      const tick = () => {
        for (let i = start; i < frames.length; i++) {
          if (pred(frames[i])) return resolve(frames[i]);
        }
        if (Date.now() > deadline) return resolve(null);
        setTimeout(tick, 40);
      };
      tick();
    });

  const T0 = '2026-10-18T20:00:00.000Z';
  const T1 = '2026-10-18T20:00:03.000Z';
  const rows = [
    { role: 'user', content: 'probe: selam (client-free)', timestamp: T0 },
    { role: 'thinking', content: 'probe: kısa gerekçe', timestamp: T1 },
    { role: 'assistant', content: 'probe: merhaba (client-free)', timestamp: T1 },
  ];
  const recordMsg = (rowsIn, extra) =>
    JSON.stringify(Object.assign({ type: 'transcript_record', sessionId, origin: 'client-free', rows: rowsIn }, extra || {}));

  // 1. Record the batch → ack + pushed appends (the socket is a subscriber).
  let start = frames.length;
  ws.send(recordMsg(rows));
  const ack1 = await waitFrom(start, (f) => f.type === 'transcript_recorded');
  check(Boolean(ack1), 'record answered with transcript_recorded');
  check(Boolean(ack1) && ack1.count === 3, 'ack reports 3 appended rows (got ' + (ack1 && ack1.count) + ')');
  const pushed = frames.slice(start).filter((f) => f.type === 'transcript_append');
  check(pushed.length === 3, 'three transcript_append frames pushed to the recording socket (got ' + pushed.length + ')');
  check(
    pushed.length === 3 && pushed.every((f) => f.message && f.message.origin === 'client-free'),
    'pushed rows carry origin client-free on the wire',
  );

  // 2. Disk: the JSONL itself carries the marker on the recorded rows only.
  const disk = readRows(sessionId);
  check(Boolean(disk) && disk.length === 4, 'transcript holds marker + 3 recorded rows (got ' + (disk ? disk.length : 'null') + ')');
  if (disk && disk.length === 4) {
    check(disk[0].origin === undefined, 'the server-written marker row carries no origin');
    check(
      disk[1].origin === 'client-free' && disk[2].origin === 'client-free' && disk[3].origin === 'client-free',
      'recorded rows persist origin client-free in the JSONL',
    );
    check(
      disk[1].content === rows[0].content && disk[2].content === rows[1].content && disk[3].content === rows[2].content,
      'row content survives verbatim, in stream order',
    );
    const rawPath = transcriptPathFor(sessionId);
    const raw = rawPath ? fs.readFileSync(rawPath, 'utf-8') : '';
    check(raw.includes('"origin":"client-free"'), 'the raw JSONL bytes carry the origin field');
  }

  // 3. Transcript snapshot: the mapper keeps origin on the wire rows.
  start = frames.length;
  ws.send(JSON.stringify({ type: 'transcript_get', sessionId }));
  const snap = await waitFrom(start, (f) => f.type === 'transcript');
  check(Boolean(snap) && snap.sessionId === sessionId, 'transcript snapshot arrived over the same socket');
  const originRows = snap && snap.messages ? snap.messages.filter((r) => r.origin === 'client-free') : [];
  check(originRows.length === 3, 'snapshot rows carry origin client-free (mapper keeps it, got ' + originRows.length + ')');

  // 4. Replay after a lost ack → count 0, no duplicate on disk.
  start = frames.length;
  ws.send(recordMsg(rows));
  const ack2 = await waitFrom(start, (f) => f.type === 'transcript_recorded');
  check(Boolean(ack2) && ack2.count === 0, 'a replayed identical batch answers count 0 (got ' + (ack2 && ack2.count) + ')');
  const disk2 = readRows(sessionId);
  check(Boolean(disk2) && disk2.length === 4, 'replay appended nothing (still 4 rows)');

  // 5. Negative: a tool row is never forgeable over this path.
  start = frames.length;
  ws.send(recordMsg([{ role: 'tool', content: '{"ok":true}', timestamp: T1 }]));
  const err1 = await waitFrom(start, (f) => f.type === 'error');
  check(Boolean(err1) && /invalid message shape/i.test(err1.message || ''), 'a tool row is refused as an invalid frame');
  const disk3 = readRows(sessionId);
  check(Boolean(disk3) && disk3.length === 4, 'the refused frame wrote nothing');

  // 6. Negative: a foreign origin literal is refused (only client-free recordable).
  start = frames.length;
  ws.send(recordMsg(rows, { origin: 'server-paid' }));
  const err2 = await waitFrom(start, (f) => f.type === 'error');
  check(Boolean(err2) && /invalid message shape/i.test(err2.message || ''), 'a foreign origin literal is refused');

  // 7. Negative: recording into a missing transcript answers session_not_found.
  start = frames.length;
  const missing = 'sess_probe_missing_' + Date.now();
  ws.send(JSON.stringify({ type: 'transcript_record', sessionId: missing, origin: 'client-free', rows }));
  const err3 = await waitFrom(start, (f) => f.type === 'error');
  check(Boolean(err3) && err3.code === 'session_not_found', 'a missing transcript answers session_not_found');

  try {
    ws.close();
  } catch {
    /* already closed */
  }

  // 8. Cleanup: delete the throwaway session and prove the file stays gone.
  const del = await rest('DELETE', '/api/sessions/' + encodeURIComponent(sessionId));
  check(del.status === 200, 'cleanup: throwaway session deleted (status ' + del.status + ')');
  let gone = false;
  for (let i = 0; i < 25; i++) {
    if (!transcriptPathFor(sessionId)) {
      gone = true;
      break;
    }
    await sleep(150);
  }
  check(gone, 'cleanup: transcript file stays gone');

  const total = passed + failures.length;
  console.log('\nREQ-205 slice 3 live probe: ' + passed + '/' + total + ' checks passed');
  if (failures.length > 0) {
    console.log('failures:');
    for (const f of failures) console.log('  - ' + f);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.log('PROBE-ERROR: ' + (e && e.stack ? e.stack : String(e)));
  process.exit(2);
});
