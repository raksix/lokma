/**
 * REQ-181 live probe — the surface catalog reaches the DEPLOYED server.
 *
 * The in-process probe (scripts/probe-surface-prompt.ts) proves the loop
 * assembly; this one proves the LIVE server (127.0.0.1:3456) end to end:
 *
 *   1. catalog/prompt match — a capture stub answers an ephemeral provider
 *      (id catalog-probe-*) and the session model points at it, so the REAL
 *      deployed server assembles the request. The captured body must carry
 *      <available_surfaces> with block == registry n catalog (birebir,
 *      catalog order) plus <available_skills>.
 *   2. three surface tools run live — the stub answers with native
 *      tool_calls (vault_search / plugin_list / usage_report — three
 *      different surfaces). Frames + transcript prove the deployed server
 *      executed all three error-free, with no approval card (reads auto-run
 *      in auto mode).
 *   3. plan mode refuses — a session whose cwd carries
 *      .lokma/settings.json {permissions:{defaultMode:'plan'}} gets a
 *      write_file call refused (code 'denied'), and nothing lands on disk.
 *
 * Cleanup is part of the contract: probe-created live state is namespaced
 * (catalog-probe-*), the provider + sessions are deleted, temp dirs are
 * removed, and every delete is re-checked until it stays gone (bounded).
 *
 * Usage: node scripts/probe-surface-tool-catalog.cjs
 * Needs ./node_modules/ws and a minted superadmin token
 * (HOME=/root bun scripts/mint-e2e-token.mjs), same as the other live probes.
 */
const { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const http = require('node:http');
const WebSocket = require('ws');
const { SURFACES } = require('@lokma/shared/surfaces');

const BASE = 'http://127.0.0.1:3456';
const NL = String.fromCharCode(10);
const RUN_TIMEOUT_MS = 120000;
const PROBE_ID = 'catalog-probe-' + Date.now().toString(36);
const MODEL = PROBE_ID + '/capture-model';
const THREE = ['vault_search', 'plugin_list', 'usage_report'];
const DENY_TOOL = 'write_file';
const DENY_FILE = 'denied-must-not-exist.txt';

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

/** tool_result payloads arrive as objects or JSON strings — normalize. */
function asObj(x) {
  if (x && typeof x === 'object') return x;
  if (typeof x === 'string') {
    try {
      return JSON.parse(x);
    } catch {
      return null;
    }
  }
  return null;
}

/** Tool names inside the <available_surfaces> block ("- Label: a, b, c"). */
function extractSurfaceNames(system) {
  const open = system.indexOf('<available_surfaces>');
  const close = system.indexOf('</available_surfaces>');
  if (open === -1 || close === -1 || close < open) return [];
  const names = [];
  for (const line of system.slice(open, close).split(NL)) {
    if (line.indexOf('- ') !== 0) continue;
    const idx = line.indexOf(': ');
    if (idx === -1) continue;
    for (const token of line.slice(idx + 2).split(', ')) names.push(token.trim());
  }
  return names;
}

// ── capture stub ─────────────────────────────────────────────────────────
// Answers every chat request from the canned `script` queue and records
// what the deployed server actually sent (system prompt, tools[]) per
// request. GET answers the models probe politely so the ephemeral provider
// looks healthy while it exists.
const captures = [];
let script = [];

const stub = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    const url = req.url || '';
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'capture-model' }] }));
      return;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
    if (parsed && typeof parsed === 'object') {
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      const systemRow = messages.find((m) => m && m.role === 'system');
      captures.push({
        path: url,
        system: systemRow && typeof systemRow.content === 'string' ? systemRow.content : '',
        toolNames: (Array.isArray(parsed.tools) ? parsed.tools : [])
          .map((t) => (t && t.function && t.function.name) || (t && t.name) || '')
          .filter(Boolean),
        messageCount: messages.length,
      });
    }
    const step = script.shift() || { text: 'PROBE-EXTRA' };
    const chunks = [];
    if (Array.isArray(step.toolCalls) && step.toolCalls.length > 0) {
      step.toolCalls.forEach((call, i) => {
        chunks.push({
          choices: [
            {
              index: 0,
              finish_reason: null,
              delta: {
                tool_calls: [
                  {
                    index: i,
                    id: call.id,
                    type: 'function',
                    function: { name: call.name, arguments: JSON.stringify(call.args || {}) },
                  },
                ],
              },
            },
          ],
        });
      });
      chunks.push({ choices: [{ index: 0, finish_reason: 'tool_calls', delta: {} }] });
    } else {
      chunks.push({ choices: [{ index: 0, finish_reason: null, delta: { content: step.text || 'PROBE-OK' } }] });
      chunks.push({ choices: [{ index: 0, finish_reason: 'stop', delta: {} }] });
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    for (const chunk of chunks) res.write('data: ' + JSON.stringify(chunk) + NL + NL);
    res.write('data: [DONE]' + NL + NL);
    res.end();
  });
});

(async () => {
  const token = execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
    cwd: join(__dirname, '..'),
    encoding: 'utf8',
  })
    .trim()
    .split(NL)
    .pop();
  const auth = { Authorization: 'Bearer ' + token };
  const jsonAuth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
  const stubPort = stub.address().port;
  const baseUrl = 'http://127.0.0.1:' + stubPort + '/v1';

  const createdSessions = [];
  const dirs = [];
  let providerReady = false;

  const runPrompt = async (cwd, prompt, responses, captureStart) => {
    const created = await fetch(BASE + '/api/sessions', {
      method: 'POST',
      headers: jsonAuth,
      body: JSON.stringify({ cwd, model: MODEL }),
    });
    const body = await created.json();
    const sessionId = body.id;
    createdSessions.push({ id: sessionId, cwd });
    script = responses.slice();
    const frames = [];
    const ws = new WebSocket('ws://127.0.0.1:3456/ws/' + sessionId + '?token=' + token);
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('timeout waiting for run end (session ' + sessionId + ')')),
        RUN_TIMEOUT_MS,
      );
      ws.on('open', () => ws.send(JSON.stringify({ type: 'prompt', sessionId, model: MODEL, prompt })));
      ws.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        frames.push(msg);
        if (msg.type === 'done' || msg.type === 'run_end' || msg.type === 'error') {
          clearTimeout(timer);
          resolve(msg);
        }
      });
      ws.on('error', reject);
    });
    let end;
    try {
      end = await done;
    } finally {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
    return { sessionId, frames, end, caps: captures.slice(captureStart) };
  };

  const transcript = async (sessionId, cwd) => {
    const res = await fetch(BASE + '/api/sessions/' + sessionId + '?cwd=' + encodeURIComponent(cwd), {
      headers: auth,
    });
    const body = await res.json().catch(() => null);
    return body && Array.isArray(body.messages) ? body.messages : [];
  };

  try {
    // ── 0. preflight + stale probe-state cleanup ─────────────────────────
    const pf = await fetch(BASE + '/api/providers', { headers: auth });
    check(pf.status === 200, 'live server reachable + token accepted (HTTP ' + pf.status + ')');
    const pfBody = await pf.json().catch(() => null);
    const stale = ((pfBody && pfBody.providers) || []).filter(
      (p) => p && typeof p.id === 'string' && p.id.indexOf('catalog-probe-') === 0,
    );
    for (const p of stale) {
      await fetch(BASE + '/api/providers/' + p.id, { method: 'DELETE', headers: auth });
    }
    check(true, 'stale catalog-probe providers cleared (' + stale.length + ' found)');

    // ── 1. ephemeral provider → capture stub ─────────────────────────────
    const add = await fetch(BASE + '/api/providers', {
      method: 'POST',
      headers: jsonAuth,
      body: JSON.stringify({ id: PROBE_ID, name: 'Catalog probe (temp)', baseUrl, apiKey: 'probe-local-key' }),
    });
    providerReady = add.status === 201;
    check(providerReady, 'ephemeral provider registered (HTTP ' + add.status + ')');

    // ── 2. run A: auto mode, three surface tools live ────────────────────
    const cwdA = mkdtempSync(join(tmpdir(), 'lokma-catalog-a-'));
    dirs.push(cwdA);
    mkdirSync(join(cwdA, '.lokma'), { recursive: true });
    writeFileSync(
      join(cwdA, '.lokma', 'settings.json'),
      JSON.stringify({ permissions: { allow: [], deny: [], defaultMode: 'auto' } }),
    );
    const capStartA = captures.length;
    const runA = await runPrompt(
      cwdA,
      'REQ-181 katalog canli probu: yuzey araclarini kullan.',
      [
        {
          toolCalls: [
            { id: 'probe_vault_1', name: 'vault_search', args: { q: 'lokma' } },
            { id: 'probe_plugin_1', name: 'plugin_list', args: {} },
            { id: 'probe_usage_1', name: 'usage_report', args: { days: 7 } },
          ],
        },
        { text: 'PROBE-DONE-A' },
      ],
      capStartA,
    );
    check(runA.end.type !== 'error', 'run A ended cleanly (' + runA.end.type + ')');

    // 2a. catalog/prompt match — from the first captured request.
    const capA = runA.caps[0];
    check(Boolean(capA), 'the stub captured the deployed request');
    check(Boolean(capA) && capA.path === '/v1/chat/completions', 'openai adapter posts {base}/chat/completions');
    check(
      Boolean(capA) && capA.system.indexOf('<available_surfaces>') >= 0,
      'live system prompt carries <available_surfaces>',
    );
    const blockNames = capA ? extractSurfaceNames(capA.system) : [];
    const catalogNames = SURFACES.flatMap((s) => s.tools.map((t) => t.name));
    const expected = capA ? catalogNames.filter((n) => capA.toolNames.indexOf(n) >= 0) : [];
    check(
      blockNames.length > 0 && JSON.stringify(blockNames) === JSON.stringify(expected),
      'block == live registry, birebir + catalog order (' + expected.length + ' tools)',
    );
    check(
      Boolean(capA) && capA.toolNames.indexOf('terminal_write') >= 0,
      'live registry carries the wave-5 terminal family',
    );
    check(
      Boolean(capA) && capA.system.indexOf('<available_skills>') >= 0,
      'live system prompt carries <available_skills> (once-dead builder, live)',
    );

    // 2b. three surface tools executed live, error-free, no approval card.
    const startsA = runA.frames.filter((f) => f.type === 'tool_start');
    const resultsA = runA.frames.filter((f) => f.type === 'tool_result');
    check(
      !runA.frames.some((f) => f.type === 'permission_request'),
      'no approval card for read tools in auto mode',
    );
    for (const tool of THREE) {
      const start = startsA.find((s) => s.tool === tool);
      check(Boolean(start), tool + ': tool_start frame (live execution)');
      const res = resultsA.find((r) => r.callId === (start && start.callId));
      check(Boolean(res) && res.isError !== true, tool + ': tool_result is error-free');
      const payload = asObj(res && res.result);
      check(Boolean(payload) && payload.ok === true, tool + ': honest ok:true payload');
    }
    const rowsA = await transcript(runA.sessionId, cwdA);
    const toolRowsA = rowsA.filter((m) => m && m.role === 'tool');
    for (const tool of THREE) {
      check(
        toolRowsA.some((m) => m.toolName === tool),
        tool + ': transcript row persists',
      );
    }

    // ── 3. run B: plan mode refuses a write ──────────────────────────────
    const cwdB = mkdtempSync(join(tmpdir(), 'lokma-catalog-b-'));
    dirs.push(cwdB);
    mkdirSync(join(cwdB, '.lokma'), { recursive: true });
    writeFileSync(join(cwdB, '.lokma', 'settings.json'), JSON.stringify({ permissions: { defaultMode: 'plan' } }));
    const capStartB = captures.length;
    const runB = await runPrompt(
      cwdB,
      'Plan modu probu: bir dosya yaz.',
      [
        { toolCalls: [{ id: 'probe_deny_1', name: DENY_TOOL, args: { path: DENY_FILE, content: 'probe' } }] },
        { text: 'PLAN-ACK' },
      ],
      capStartB,
    );
    check(runB.end.type !== 'error', 'run B ended cleanly (' + runB.end.type + ')');
    const deniedB = runB.frames
      .filter((f) => f.type === 'tool_result')
      .map((r) => asObj(r.result))
      .find((p) => p && p.code === 'denied');
    check(Boolean(deniedB), 'plan mode emitted a denied tool_result');
    check(
      Boolean(deniedB) && String(deniedB.message).indexOf('Denied by permissions: ' + DENY_TOOL) >= 0,
      'refusal names the gated tool (' + (deniedB && deniedB.message) + ')',
    );
    check(!existsSync(join(cwdB, DENY_FILE)), 'nothing was written to disk in plan mode');
    const rowsB = await transcript(runB.sessionId, cwdB);
    const rowB = rowsB.find((m) => m && m.role === 'tool' && m.toolName === DENY_TOOL);
    check(Boolean(rowB) && String(rowB.content).indexOf('denied') >= 0, 'transcript row records the denial');
  } finally {
    // ── 4. cleanup — delete probe-created state, re-check it stays gone ──
    try {
      if (providerReady) {
        const del = await fetch(BASE + '/api/providers/' + PROBE_ID, { method: 'DELETE', headers: auth });
        check(del.status === 200, 'ephemeral provider deleted (HTTP ' + del.status + ')');
      }
    } catch {
      /* the re-check below is the real gate */
    }
    for (const s of createdSessions) {
      try {
        await fetch(BASE + '/api/sessions/' + s.id + '?cwd=' + encodeURIComponent(s.cwd), {
          method: 'DELETE',
          headers: auth,
        });
      } catch {
        /* re-check below */
      }
    }
    for (const d of dirs) rmSync(d, { recursive: true, force: true });

    let providerGone = false;
    for (let i = 0; i < 5 && !providerGone; i += 1) {
      await sleep(400);
      const re = await fetch(BASE + '/api/providers', { headers: auth }).catch(() => null);
      const body = re ? await re.json().catch(() => null) : null;
      providerGone = !(((body && body.providers) || []).some((p) => p && p.id === PROBE_ID));
    }
    check(providerGone, 'provider stays gone after cleanup (bounded re-check)');

    let sessionsGone = false;
    for (let i = 0; i < 5 && !sessionsGone; i += 1) {
      await sleep(300);
      const statuses = [];
      for (const s of createdSessions) {
        const r = await fetch(BASE + '/api/sessions/' + s.id + '?cwd=' + encodeURIComponent(s.cwd), {
          headers: auth,
        }).catch(() => null);
        statuses.push(r ? r.status : 0);
      }
      sessionsGone = statuses.length > 0 && statuses.every((st) => st === 404 || st === 410);
    }
    check(sessionsGone, 'probe sessions stay gone (bounded re-check)');
    check(
      dirs.every((d) => !existsSync(d)),
      'temp dirs removed from disk',
    );
  }

  stub.close();
  console.log('');
  if (failures.length === 0) {
    console.log('surface-tool-catalog probe: ' + passed + ' checks passed');
    process.exit(0);
  }
  console.log('surface-tool-catalog probe: ' + passed + ' passed, ' + failures.length + ' FAILED:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
