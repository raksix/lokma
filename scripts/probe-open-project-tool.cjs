/**
 * REQ-180 live probe — "open project" is a real agent tool.
 *
 * Runs the DEPLOYED server's agent (127.0.0.1:3456) and asks it to open a
 * workspace project for a not-yet-existing directory. Proves the whole path
 * end to end:
 *   1. the agent calls `open_project` — NOT glob/grep/read_file/write_file
 *      (the exact regression the user hit: "proje aç" became file
 *      archaeology),
 *   2. the project record lands in `GET /api/projects` and its cwd really
 *      exists on disk (mkdir -p),
 *   3. the `ui_action` frame for `open_project` is published on the socket
 *      (projectId + cwd + the fresh session id) — WS acceptance,
 *   4. the run transcript persists the tool row,
 *   5. cleanup: the record, both sessions and the temp dirs are deleted and
 *      stay gone (bounded re-check).
 *
 * Usage:
 *   node scripts/probe-open-project-tool.cjs [model]
 *
 * Needs ./node_modules/ws (same as probe-live-server.cjs) and a minted
 * superadmin token (`HOME=/root bun scripts/mint-e2e-token.mjs`). The probe
 * talks to the local server directly (no basic auth involved).
 */
const { mkdtempSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const WebSocket = require('ws');

const BASE = 'http://127.0.0.1:3456';
const MODEL = process.argv[2] ?? 'commandcode/deepseek/deepseek-v4.1-flash';
const NAME = 'fermag-probe-' + Date.now().toString(36);
const NL = String.fromCharCode(10);

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const token = execFileSync('bash', ['-lc', 'HOME=/root bun scripts/mint-e2e-token.mjs'], {
    cwd: __dirname + '/..',
    encoding: 'utf8',
  })
    .trim()
    .split(NL)
    .pop();

  const sessionCwd = mkdtempSync(join(tmpdir(), 'lokma-openproj-sess-'));
  const projectRoot = mkdtempSync(join(tmpdir(), 'lokma-openproj-root-'));
  // Deliberately does not exist yet: the tool must mkdir -p the whole chain.
  const projectCwd = join(projectRoot, 'nested', 'deep', NAME);
  console.log('session cwd: ' + sessionCwd);
  console.log('project cwd: ' + projectCwd);

  const created = await fetch(BASE + '/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ cwd: sessionCwd, model: MODEL }),
  });
  check(created.status === 200 || created.status === 201, 'session created over REST (HTTP ' + created.status + ')');
  const session = await created.json();
  const sessionId = session.id ?? session.sessionId;
  console.log('sessionId: ' + sessionId);

  const frames = [];
  const ws = new WebSocket('ws://127.0.0.1:3456/ws/' + sessionId + '?token=' + token);
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for run end')), 240000);
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'prompt',
          sessionId,
          model: MODEL,
          prompt:
            'Bir workspace projesi aç. open_project aracını kullan. ' +
            'Parametreler: name="' + NAME + '", cwd="' + projectCwd + '". ' +
            'Başka HİÇBİR araç kullanma (glob, grep, read_file, write_file YOK). ' +
            'Son yanıtında dönen projectId değerini yaz.',
        }),
      );
    });
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      frames.push(msg);
      if (msg.type === 'permission_request') {
        ws.send(JSON.stringify({ type: 'permission_response', requestId: msg.requestId, decision: 'allow' }));
      }
      if (msg.type === 'done' || msg.type === 'run_end' || msg.type === 'error') {
        clearTimeout(timer);
        resolve(msg);
      }
    });
    ws.on('error', reject);
  });

  const end = await done;
  try {
    ws.close();
  } catch {
    /* already closed */
  }

  const toolStarts = frames.filter((f) => f.type === 'tool_start');
  const toolResults = frames.filter((f) => f.type === 'tool_result');
  const uiActions = frames.filter((f) => f.type === 'ui_action');
  const text = frames
    .filter((f) => f.type === 'text_delta')
    .map((f) => f.delta)
    .join('');
  const names = toolStarts.map((t) => t.tool);
  console.log('frames: ' + JSON.stringify([...new Set(frames.map((f) => f.type))]));
  console.log('tools: ' + (names.join(', ') || '(none)'));
  console.log('answer: ' + text.slice(0, 300).split(NL).join(' '));
  console.log('ui_actions: ' + JSON.stringify(uiActions.map((u) => u.action)));

  check(end.type !== 'error', 'run ended cleanly (' + end.type + ')');

  // 1. The agent chose the tool instead of file archaeology.
  const openStart = toolStarts.find((t) => t.tool === 'open_project');
  check(Boolean(openStart), 'agent called open_project');
  const FORBIDDEN = ['glob', 'grep', 'read_file', 'write_file', 'edit_file', 'run_command', 'list_files', 'search_files'];
  check(!names.some((n) => FORBIDDEN.includes(n)), 'no file-archeology tools were used (' + (names.join(',') || 'none') + ')');

  // 2. The tool result is a real success with the created record.
  const openCallId = openStart?.callId;
  const openResult = toolResults.find((r) => r.callId === openCallId);
  const payload = asObj(openResult?.result);
  check(Boolean(openResult) && openResult.isError !== true, 'open_project tool_result is error-free');
  check(Boolean(payload) && payload.ok === true, 'result says ok:true');
  check(Boolean(payload) && payload.created === true, 'result says created:true');
  check(Boolean(payload) && payload.cwd === projectCwd, 'result cwd matches the requested path');
  check(Boolean(payload) && typeof payload.projectId === 'string' && payload.projectId.length > 0, 'result carries a projectId');
  const projectId = payload?.projectId;

  // 3. WS acceptance — the ui_action frame was published.
  const frame = uiActions.find((u) => u.action === 'open_project');
  check(Boolean(frame), 'ui_action open_project frame published on the socket');
  check(Boolean(frame) && frame.projectId === projectId, 'frame projectId matches the record');
  check(Boolean(frame) && frame.cwd === projectCwd, 'frame carries the project cwd');
  check(Boolean(frame) && typeof frame.targetSessionId === 'string' && frame.targetSessionId.length > 0, 'frame carries the fresh session id');

  // 4. Disk + list + transcript.
  check(existsSync(projectCwd), 'project cwd exists on disk (mkdir -p)');

  const listRes = await fetch(BASE + '/api/projects', { headers: { Authorization: 'Bearer ' + token } });
  const listBody = await listRes.json();
  const rows = Array.isArray(listBody) ? listBody : listBody.projects ?? [];
  const record = rows.find((p) => p.id === projectId);
  check(Boolean(record), 'project record is in GET /api/projects');
  check(Boolean(record) && record.cwd === projectCwd, 'listed record has the requested cwd');
  check(Boolean(record) && record.name === NAME, 'listed record has the requested name');
  check(rows.filter((p) => p.cwd === projectCwd).length === 1, 'exactly one record for the cwd');

  const transcriptRes = await fetch(
    BASE + '/api/sessions/' + sessionId + '?cwd=' + encodeURIComponent(sessionCwd),
    { headers: { Authorization: 'Bearer ' + token } },
  );
  const transcript = await transcriptRes.json();
  const rowsT = transcript.messages ?? [];
  const toolRow = rowsT.find((m) => m.role === 'tool' && m.toolName === 'open_project');
  check(Boolean(toolRow), 'transcript persists the open_project tool row');
  check(Boolean(toolRow) && String(toolRow.content).includes(projectId ?? '__none__'), 'tool row carries the projectId');

  if (frame?.targetSessionId) {
    const projSession = await fetch(
      BASE + '/api/sessions/' + frame.targetSessionId + '?cwd=' + encodeURIComponent(projectCwd),
      { headers: { Authorization: 'Bearer ' + token } },
    );
    check(projSession.status === 200, 'a session was opened in the project cwd (HTTP ' + projSession.status + ')');
  }

  // 5. Cleanup — record, sessions, temp dirs; then a bounded re-check.
  if (projectId) {
    const del = await fetch(BASE + '/api/projects/' + projectId, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
    });
    check(del.status === 200 || del.status === 204, 'project record deleted (HTTP ' + del.status + ')');
  }
  if (frame?.targetSessionId) {
    await fetch(BASE + '/api/sessions/' + frame.targetSessionId + '?cwd=' + encodeURIComponent(projectCwd), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token },
    });
  }
  await fetch(BASE + '/api/sessions/' + sessionId + '?cwd=' + encodeURIComponent(sessionCwd), {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + token },
  });
  rmSync(sessionCwd, { recursive: true, force: true });
  rmSync(projectRoot, { recursive: true, force: true });

  let gone = false;
  for (let i = 0; i < 5 && !gone; i += 1) {
    await sleep(400);
    const re = await fetch(BASE + '/api/projects', { headers: { Authorization: 'Bearer ' + token } });
    const reBody = await re.json();
    const reRows = Array.isArray(reBody) ? reBody : reBody.projects ?? [];
    gone = !reRows.some((p) => p.id === projectId || p.cwd === projectCwd);
  }
  check(gone, 'record stays gone after cleanup (bounded re-check)');
  check(!existsSync(sessionCwd) && !existsSync(projectRoot), 'temp dirs removed from disk');

  console.log('');
  if (failures.length === 0) {
    console.log('open-project tool probe: ' + passed + ' checks passed on ' + MODEL);
    process.exit(0);
  }
  console.log('open-project tool probe: ' + passed + ' passed, ' + failures.length + ' FAILED:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
