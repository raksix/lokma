/**
 * Live probe — can space-bunny-alpha actually WRITE a large file through the
 * real agent loop? (the bug report: write_file "doesn't work", the model
 * emits `<tool name="write_file">` markup instead of a native call)
 *
 * Run: bun scripts/probe-live-write.ts [provider/model]
 */
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveApiKey, resolveProviderUpstream, SessionStore, ToolRegistry, buildBuiltinTools } from '@lokma/core';
import { runAgentLoop } from '../packages/lokma-web/server/src/agent-loop';
import type { ServerMessage } from '@lokma/shared';

const MODEL = process.argv[2] ?? 'commandcode/stealth/space-bunny-alpha';
const PROVIDER = MODEL.split('/')[0] as string;

let passed = 0;
const fails: string[] = [];
function check(cond: boolean, label: string): void {
  if (!cond) {
    fails.push(label);
    console.log(`FAIL: ${label}`);
    return;
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

const apiKey = await resolveApiKey(PROVIDER);
const upstream = await resolveProviderUpstream(PROVIDER);
if (!apiKey) throw new Error(`no stored key for ${PROVIDER}`);
console.log(`\n== ${MODEL} @ ${upstream.baseUrl}\n`);

const cwd = await mkdtemp(join(tmpdir(), 'lokma-write-'));
const TARGET = 'page.html';

try {
  const store = new SessionStore(cwd);
  const registry = new ToolRegistry(buildBuiltinTools(cwd));
  const frames: ServerMessage[] = [];
  const toolStarts: { tool: string; input: unknown }[] = [];

  const result = await runAgentLoop({
    cwd,
    sessionId: 'write-probe',
    model: MODEL,
    upstream: { provider: upstream.provider, baseUrl: upstream.baseUrl, apiKey },
    history: [],
    prompt:
      'Design and write ONE self-contained html file named page.html: a minimal single-page site ' +
      'about coffee brewing methods, ~18 KB, inline <style>, 3 sections, no JS, no emoji. ' +
      'Write the whole file with write_file in one call. Then reply with the single word DONE.',
    permissions: { allow: [], deny: [], defaultMode: 'bypass' },
    store,
    send: (msg) => {
      frames.push(msg);
      if (msg.type === 'tool_start') toolStarts.push({ tool: msg.tool, input: msg.input });
    },
    waitApproval: async () => 'allow',
    waitAnswer: async () => '',
    signal: new AbortController().signal,
    maxTurns: 6,
  });

  const visible = frames
    .filter((m) => m.type === 'text_delta')
    .map((m) => (m as { delta: string }).delta)
    .join('');
  const writes = toolStarts.filter((t) => t.tool === 'write_file');

  console.log(`\noutcome=${result.outcome} turns=${result.turns} writes=${writes.length} visibleChars=${visible.length}`);
  console.log(`markup leaked into visible text: ${/<tool name=|<\/tool>|<Function|minimax/.test(visible)}`);

  check(writes.length >= 1, 'the model called write_file natively');

  let bytes = 0;
  let onDisk = false;
  try {
    const st = await stat(join(cwd, TARGET));
    bytes = st.size;
    onDisk = true;
  } catch {
    onDisk = false;
  }
  console.log(`file on disk: ${onDisk} bytes=${bytes}`);
  check(onDisk, 'the file exists on disk');
  check(bytes > 4000, `the file has real content (${bytes} bytes)`);
  if (onDisk) {
    const head = await readFile(join(cwd, TARGET), 'utf8');
    check(/<style|<html/i.test(head), 'the file is real html, not a stub');
  }
  check(!/<tool name=|minimax/.test(visible), 'no tool markup leaked into the visible answer');
} finally {
  await rm(cwd, { recursive: true, force: true });
}

console.log(`\nwrite probe: ${passed} passed, ${fails.length} failed`);
if (fails.length) {
  console.log('FAILURES:');
  for (const f of fails) console.log(` - ${f}`);
  process.exit(1);
}