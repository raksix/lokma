/**
 * REQ-183 live probe — space-bunny-alpha tool calls work end to end.
 *
 * The user's screen showed `commandcode/stealth/space-bunny-alpha` (thinking
 * max) leaking a raw bodyless `<tool name="list_files">` into chat with no
 * executed call and no transcript tool row. REQ-183 ticks 1-3 tightened the
 * capability probes (a model/key refusal is never a tools/pairing rejection),
 * salvaged a trailing bodyless `<tool>` opener into a real call (input {}),
 * and wired `haveNativeCalls` through the loop/TUI finish calls.
 *
 * This probe drives the DEPLOYED server (127.0.0.1:3456) with the REAL model:
 *
 *   A. three consecutive runs in one session (list, read, read) using the
 *      viewId'd id from the user's screen — every run must execute a tool
 *      (tool_start + ok tool_result + a real transcript tool row), the real
 *      file content must reach the transcript, and NO `<tool` markup may
 *      leak into the stream or the transcript;
 *   B. plan mode via a temp-cwd `.lokma/settings.json` — a write tool call is
 *      refused by the gate (denied tool result, no file on disk);
 *   C. auto mode — the same write asks once (permission_request), the probe
 *      approves, and the file lands on disk.
 *
 * Cleanup deletes sessions, temp dirs and project dirs, then re-checks that
 * everything stays gone. The login gate is never touched.
 *
 * Usage:
 *   node scripts/probe-space-bunny-tools.cjs [provider/model]
 *
 * Needs ./node_modules/ws and a minted superadmin token
 * (HOME=/root bun scripts/mint-e2e-token.mjs — read at runtime, never logged).
 */
'use strict';
const { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, readdirSync } = require('node:fs');
const { tmpdir, homedir } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const WebSocket = require('ws');

const ROOT = resolve(__dirname, '..');
const BASE = 'http://127.0.0.1:3456';
const WS_BASE = 'ws://127.0.0.1:3456';
const ARGS = process.argv.slice(2);
const MODEL = ARGS.find((a) => !a.startsWith('--')) || 'commandcode/stealth/space-bunny-alpha';
const SECTION_ARG = (ARGS.find((a) => a.startsWith('--section=')) || '').split('=')[1] || 'abc';
const PROJECTS_ROOT = join(homedir(), '.lokma', 'projects');
const NL = String.fromCharCode(10);
const RUN_TIMEOUT_MS = 150000;

let TOKEN = '';
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, opts) {
  const o = opts || {};
  const headers = { Authorization: 'Bearer ' + TOKEN };
  // Fastify 400s a body-less DELETE that declares a JSON content type.
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(BASE + path, {
    method: o.method || 'GET',
    headers,
    body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
    // A wedged server must never hang the probe's own cleanup forever.
    signal: AbortSignal.timeout(20000),
  });
}

async function readMessages(sessionId, cwd) {
  const res = await api('/api/sessions/' + sessionId + '?cwd=' + encodeURIComponent(cwd));
  if (res.status !== 200) throw new Error('transcript read failed HTTP ' + res.status + ' for ' + sessionId);
  const body = await res.json();
  return Array.isArray(body.messages) ? body.messages : [];
}

/** Locate the project dir that holds one session's JSONL (naming-agnostic). */
function findProjectDir(sessionId) {
  let names = [];
  try {
    names = readdirSync(PROJECTS_ROOT);
  } catch {
    return null;
  }
  for (const name of names) {
    if (existsSync(join(PROJECTS_ROOT, name, 'sessions', sessionId + '.jsonl'))) {
      return join(PROJECTS_ROOT, name);
    }
  }
  return null;
}

function openSocket(sessionId, cwd) {
  const url = WS_BASE + '/ws/' + sessionId + '?token=' + encodeURIComponent(TOKEN) + '&cwd=' + encodeURIComponent(cwd);
  return new WebSocket(url);
}

function awaitOpen(ws, label) {
  return new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', (e) => rej(new Error(label + ' socket failed: ' + String(e && e.message))));
  });
}

/**
 * Send one prompt, settle on the run's terminal frame (+1.5s grace so the
 * trailing cost frame lands). Permission requests are answered 'allow' — the
 * probe IS the client here.
 */
function runPrompt(ws, sessionId, prompt, reasoningEffort) {
  return new Promise((resolveP, rejectP) => {
    const frames = [];
    let settled = false;
    let grace = null;
    const timer = setTimeout(() => finish(rejectP, new Error('run timeout after ' + RUN_TIMEOUT_MS + 'ms')), RUN_TIMEOUT_MS);
    function finish(fn, arg) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (grace) clearTimeout(grace);
      ws.removeListener('message', onMessage);
      fn(arg);
    }
    function settle() {
      if (grace) return;
      grace = setTimeout(() => finish(resolveP, { frames }), 1500);
    }
    function onMessage(raw) {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      frames.push(msg);
      if (msg.type === 'permission_request') {
        try {
          ws.send(JSON.stringify({ type: 'permission_response', requestId: msg.requestId, decision: 'allow' }));
        } catch {
          /* socket closing — the run will time out and report */
        }
      }
      if (msg.type === 'done') return settle();
      if (msg.type === 'error' && msg.code !== 'queued') return settle();
    }
    ws.on('message', onMessage);
    const payload = { type: 'prompt', sessionId, prompt, model: MODEL };
    if (reasoningEffort) payload.reasoningEffort = reasoningEffort;
    ws.send(JSON.stringify(payload));
  });
}

function analyze(res) {
  const frames = res.frames;
  return {
    frames,
    starts: frames.filter((f) => f.type === 'tool_start'),
    results: frames.filter((f) => f.type === 'tool_result'),
    text: frames.filter((f) => f.type === 'text_delta').map((f) => String(f.delta || '')).join(''),
    done: frames.find((f) => f.type === 'done'),
    errs: frames.filter((f) => f.type === 'error' && f.code !== 'queued'),
    perms: frames.filter((f) => f.type === 'permission_request'),
  };
}

async function cleanupSession(sessionId, cwd) {
  // Capture the project dir BEFORE the session file is deleted — afterwards
  // the dir is unlocatable by session id (and a usage write can re-create it).
  const proj = findProjectDir(sessionId);
  try {
    const res = await api('/api/sessions/' + sessionId + '?cwd=' + encodeURIComponent(cwd), { method: 'DELETE' });
    check(res.status === 200 || res.status === 204, 'cleanup: session ' + sessionId + ' deleted (HTTP ' + res.status + ')');
  } catch (e) {
    check(false, 'cleanup: session ' + sessionId + ' delete threw: ' + String(e));
  }
  if (proj) rmSync(proj, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
  let gone = false;
  for (let i = 0; i < 6 && !gone; i += 1) {
    await sleep(400);
    if (proj && existsSync(proj)) rmSync(proj, { recursive: true, force: true });
    if (findProjectDir(sessionId)) {
      // A late append re-created the session file — re-delete, bounded.
      await api('/api/sessions/' + sessionId + '?cwd=' + encodeURIComponent(cwd), { method: 'DELETE' }).catch(() => {});
      const again = findProjectDir(sessionId);
      if (again) rmSync(again, { recursive: true, force: true });
    }
    gone = (!proj || !existsSync(proj)) && !findProjectDir(sessionId) && !existsSync(cwd);
  }
  check(gone, 'cleanup: ' + sessionId + ' stays gone (session + project dir + temp dir)');
}

async function makeSession(label, cwd) {
  const created = await api('/api/sessions', { method: 'POST', body: { cwd, model: MODEL } });
  check(created.status === 200 || created.status === 201, label + ': session created (HTTP ' + created.status + ')');
  const body = await created.json();
  const sid = body.id;
  const ws = openSocket(sid, cwd);
  await awaitOpen(ws, label);
  ws.on('error', (e) => console.log('ws error [' + label + ']: ' + String(e && e.message)));
  return { sid, ws };
}

// ── A: three consecutive runs, the user's exact model id + thinking max ────
async function sectionA() {
  console.log(NL + '== A: three consecutive runs on ' + MODEL + ' (thinking max) ==');
  const cwd = mkdtempSync(join(tmpdir(), 'lokma-req183-a-'));
  writeFileSync(join(cwd, 'hello.txt'), 'the secret word is BANANA-42' + NL);
  mkdirSync(join(cwd, 'data'));
  writeFileSync(join(cwd, 'data', 'notes.txt'), 'the code is PINEAPPLE-99' + NL);
  let sid = null;
  let ws = null;
  try {
    const s = await makeSession('A', cwd);
    sid = s.sid;
    ws = s.ws;
    const RUNS = [
      {
        prompt:
          'Use your list_files tool with path "." to list the files and folders in the workspace. ' +
          'Then reply in one short sentence naming what you found.',
      },
      {
        prompt: 'Call your read_file tool on "hello.txt" and reply with the exact secret it contains.',
        secret: 'BANANA-42',
      },
      {
        prompt: 'Call your read_file tool on "data/notes.txt" and reply with the exact code it contains.',
        secret: 'PINEAPPLE-99',
      },
    ];
    for (let i = 0; i < RUNS.length; i += 1) {
      const n = i + 1;
      const before = await readMessages(sid, cwd);
      const res = await runPrompt(ws, sid, RUNS[i].prompt, 'max');
      const a = analyze(res);
      const delta = (await readMessages(sid, cwd)).slice(before.length);
      const toolLabels = a.starts.map((t) => t.tool + ' ' + JSON.stringify(t.input || {}).slice(0, 120));
      console.log('-- A' + n + ' tools: ' + (toolLabels.join(' | ') || '(none)'));
      console.log('-- A' + n + ' answer: ' + a.text.slice(0, 200).split(NL).join(' '));
      check(Boolean(a.done) && a.done.reason === 'complete', 'A' + n + ': run ended complete (done frame)');
      check(
        !a.errs.some((e) => /unsupported_model|is not supported/i.test(String(e.message))),
        'A' + n + ': no upstream model refusal',
      );
      check(a.starts.length >= 1, 'A' + n + ': a tool call actually started');
      check(
        a.results.some((r) => r.isError !== true && a.starts.some((t) => t.callId === r.callId)),
        'A' + n + ': the tool call executed (ok result, matched callId)',
      );
      check(!a.text.includes('<tool'), 'A' + n + ': no <tool markup in the visible stream');
      const toolRows = delta.filter((m) => m.role === 'tool');
      check(
        toolRows.length >= 1,
        'A' + n + ': transcript gained a real tool row (' + (toolRows.map((m) => m.toolName).join(',') || 'none') + ')',
      );
      check(!delta.some((m) => String(m.content).includes('<tool')), 'A' + n + ': no <tool markup in the transcript delta');
      if (RUNS[i].secret) {
        check(
          delta.some((m) => String(m.content).includes(RUNS[i].secret)),
          'A' + n + ': REAL file content reached the transcript (' + RUNS[i].secret + ')',
        );
      }
    }
    const all = await readMessages(sid, cwd);
    const toolRows = all.filter((m) => m.role === 'tool');
    check(toolRows.length >= 3, 'A: three tool rows persisted in the transcript (' + toolRows.length + ')');
    check(
      toolRows.every((m) => {
        try {
          return typeof JSON.parse(String(m.content)).ok === 'boolean';
        } catch {
          return false;
        }
      }),
      'A: every tool row is a parseable record with an ok field',
    );
    check(!all.some((m) => String(m.content).includes('<tool')), 'A: NO <tool markup anywhere in the transcript');
  } finally {
    if (ws) {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
    await sleep(150);
    if (sid) await cleanupSession(sid, cwd);
    else rmSync(cwd, { recursive: true, force: true });
  }
}

// ── B: plan mode refuses a write (isolated temp-cwd project settings) ──────
async function sectionB() {
  console.log(NL + '== B: plan mode refuses a write (isolated temp cwd) ==');
  const cwd = mkdtempSync(join(tmpdir(), 'lokma-req183-b-'));
  mkdirSync(join(cwd, '.lokma'), { recursive: true });
  writeFileSync(
    join(cwd, '.lokma', 'settings.json'),
    JSON.stringify({ permissions: { defaultMode: 'plan' } }, null, 2) + NL,
  );
  let sid = null;
  let ws = null;
  try {
    const s = await makeSession('B', cwd);
    sid = s.sid;
    ws = s.ws;
    const before = await readMessages(sid, cwd);
    const res = await runPrompt(
      ws,
      sid,
      'Use your write_file tool to create a file named "plan-write.txt" containing exactly: HELLO-PLAN. Call the tool now.',
      'max',
    );
    const a = analyze(res);
    const delta = (await readMessages(sid, cwd)).slice(before.length);
    const denied = a.results.find(
      (r) =>
        r.isError === true &&
        (String(r.result && r.result.code) === 'denied' ||
          String(r.result && r.result.message).includes('Denied by permissions')),
    );
    console.log('-- B tools: ' + (a.starts.map((t) => t.tool).join(',') || '(none)') + ' denied=' + Boolean(denied));
    check(Boolean(a.done) && a.done.reason === 'complete', 'B: run ended complete');
    check(a.starts.length >= 1, 'B: the model attempted a tool call');
    check(Boolean(denied), 'B: the plan-mode gate refused the write (denied result)');
    check(!existsSync(join(cwd, 'plan-write.txt')), 'B: no file was created on disk');
    check(!a.text.includes('<tool'), 'B: no <tool markup leaked');
    check(
      delta.some((m) => m.role === 'tool' && String(m.content).includes('denied')),
      'B: transcript records the denial row',
    );
  } finally {
    if (ws) {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
    await sleep(150);
    if (sid) await cleanupSession(sid, cwd);
    else rmSync(cwd, { recursive: true, force: true });
  }
}

// ── C: auto mode asks once, the probe approves, the file lands ─────────────
async function sectionC() {
  console.log(NL + '== C: auto mode asks once, approve, file lands ==');
  const cwd = mkdtempSync(join(tmpdir(), 'lokma-req183-c-'));
  mkdirSync(join(cwd, '.lokma'), { recursive: true });
  writeFileSync(
    join(cwd, '.lokma', 'settings.json'),
    JSON.stringify({ permissions: { defaultMode: 'auto' } }, null, 2) + NL,
  );
  let sid = null;
  let ws = null;
  try {
    const s = await makeSession('C', cwd);
    sid = s.sid;
    ws = s.ws;
    const before = await readMessages(sid, cwd);
    const res = await runPrompt(
      ws,
      sid,
      'Use your write_file tool to create a file named "auto-write.txt" containing exactly: HELLO-AUTO. Call the tool now.',
      'max',
    );
    const a = analyze(res);
    const delta = (await readMessages(sid, cwd)).slice(before.length);
    console.log('-- C permission requests: ' + (a.perms.map((p) => p.tool).join(',') || '(none)'));
    check(Boolean(a.done) && a.done.reason === 'complete', 'C: run ended complete');
    check(a.perms.length >= 1, 'C: the gate asked once (permission_request)');
    check(a.results.some((r) => r.isError !== true), 'C: the approved call executed (ok result)');
    check(existsSync(join(cwd, 'auto-write.txt')), 'C: the file landed on disk');
    if (existsSync(join(cwd, 'auto-write.txt'))) {
      check(readFileSync(join(cwd, 'auto-write.txt'), 'utf8').includes('HELLO-AUTO'), 'C: file content is exact');
    }
    check(!a.text.includes('<tool'), 'C: no <tool markup leaked');
    check(
      delta.some((m) => m.role === 'tool' && String(m.content).includes('"ok":true')),
      'C: transcript tool row is ok:true',
    );
  } finally {
    if (ws) {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
    await sleep(150);
    if (sid) await cleanupSession(sid, cwd);
    else rmSync(cwd, { recursive: true, force: true });
  }
}

(async () => {
  console.log('space-bunny tools probe — model=' + MODEL + ' server=' + BASE);
  TOKEN = execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .trim()
    .split(NL)
    .pop();
  if (!TOKEN || TOKEN.length < 20) throw new Error('mint failed — no token');
  console.log('token minted (len ' + TOKEN.length + ', value never logged)');
  console.log('sections: ' + SECTION_ARG);
  if (SECTION_ARG.includes('a')) await sectionA();
  if (SECTION_ARG.includes('b')) await sectionB();
  if (SECTION_ARG.includes('c')) await sectionC();
  console.log('');
  if (failures.length === 0) {
    console.log('space-bunny tools probe: ' + passed + ' checks passed on ' + MODEL);
    process.exit(0);
  }
  console.log('space-bunny tools probe: ' + passed + ' passed, ' + failures.length + ' FAILED on ' + MODEL);
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
})().catch((e) => {
  console.error('PROBE CRASHED: ' + (e && e.stack ? e.stack : String(e)));
  console.log('space-bunny tools probe: ' + passed + ' passed, ' + failures.length + ' recorded failures before the crash');
  process.exit(1);
});
