/**
 * Live probe — does a REAL upstream drive the harness natively? (REQ-128)
 *
 * Run: `bun scripts/probe-live-tools.ts [provider/model]`
 * Default model: opencode-go/mimo-v2.5
 *
 * Two phases, both against the real network:
 *   1. adapter  — the Chat-Completions path must carry `tools` and the model
 *                 must call one natively (a `native_tool_call` chunk, never
 *                 `<tool>` markup).
 *   2. loop     — the full agent loop must run a two-turn job: call the tool,
 *                 feed the result back as a native `role:tool` row, and answer
 *                 from the REAL file contents. A wiring break shows up as a
 *                 400 from the upstream on turn 2 or as text `<tool_result>`
 *                 leaking into the visible stream.
 *
 * Not part of the build; touches the network and the local credential store.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveApiKey, resolveProviderUpstream, SessionStore, buildBuiltinTools, buildToolSystemPrompt, ToolRegistry } from '@lokma/core';
import { stream as aiStream, zodToJsonSchema } from '@lokma/ai';
import { runAgentLoop } from '../packages/lokma-web/server/src/agent-loop';
import type { ServerMessage } from '@lokma/shared';

const MODEL = process.argv[2] ?? process.env.PROBE_MODEL ?? 'opencode-go/mimo-v2.5';
const PROVIDER = MODEL.split('/')[0] as string;

let passed = 0;
function check(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

const apiKey = await resolveApiKey(PROVIDER);
const upstream = await resolveProviderUpstream(PROVIDER);
if (!apiKey) throw new Error(`no stored key for ${PROVIDER} — add one in Settings → Providers`);
console.log(`\n== ${MODEL} @ ${upstream.baseUrl} (${upstream.provider} adapter)\n`);

// ── Phase 1: adapter-level native call ─────────────────────────────────────
const registry = new ToolRegistry();
for (const tool of buildBuiltinTools(process.cwd())) registry.register(tool);
const toolSchemas = registry.list().map((t) => ({
  name: t.name,
  description: t.description,
  parameters: zodToJsonSchema(t.inputSchema),
}));

const visibleText: string[] = [];
const native: { tool: string; input: unknown; callId: string; args?: string }[] = [];
for await (const chunk of aiStream({
  provider: upstream.provider,
  model: MODEL,
  apiKey,
  baseUrl: upstream.baseUrl,
  messages: [
    { role: 'user', content: 'Call the glob tool with the pattern "**/*.json" — do not explain, just call it.' },
  ],
  tools: toolSchemas,
  extraHeaders: { 'x-opencode-session': 'lokma-probe-live' },
})) {
  if (chunk.type === 'text_delta') visibleText.push(chunk.delta);
  else if (chunk.type === 'native_tool_call') {
    native.push({ tool: chunk.tool, input: chunk.input, callId: chunk.callId, args: chunk.argumentsJson });
  }
}

console.log(`phase 1 text: ${visibleText.join('').slice(0, 200).replace(/\n/g, ' ')}`);
console.log(`phase 1 native calls: ${JSON.stringify(native)}`);
check(native.length >= 1, 'turn 1: the model emitted a NATIVE tool call (function calling, not markup)');
check(!!native[0]?.tool, 'turn 1: the native call carries a tool name');
check(typeof native[0]?.input === 'object' && native[0]?.input !== null, 'turn 1: the native call carries parsed JSON input');
check(!visibleText.join('').includes('<tool'), 'turn 1: no <tool> markup leaked into the visible text');

// ── Phase 2: full loop, two turns, real files ──────────────────────────────
const cwd = await mkdtemp(join(tmpdir(), 'lokma-live-'));
const SECRET = 'BANANA-42';
const frames: ServerMessage[] = [];
const toolStarts: { tool: string; input: unknown }[] = [];
const toolResults: { isError: boolean; result: unknown }[] = [];

try {
  await writeFile(join(cwd, 'hello.txt'), `the secret word is ${SECRET}\n`, 'utf8');
  const store = new SessionStore(cwd);
  const sessionId = 'live-probe';

  const result = await runAgentLoop({
    cwd,
    sessionId,
    model: MODEL,
    upstream: { provider: upstream.provider, baseUrl: upstream.baseUrl, apiKey },
    history: [],
    prompt:
      'Use your read_file tool to read hello.txt, then reply with ONLY the secret word it contains. Do not guess — read the file.',
    permissions: { allow: [], deny: [], defaultMode: 'bypass' },
    store,
    send: (msg) => {
      frames.push(msg);
      if (msg.type === 'tool_start') toolStarts.push({ tool: msg.tool, input: msg.input });
      if (msg.type === 'tool_result') toolResults.push({ isError: msg.isError, result: msg.result });
    },
    waitApproval: async () => 'allow',
    waitAnswer: async () => '',
    signal: new AbortController().signal,
    maxTurns: 6,
  });

  const transcript = await store.read(sessionId);
  const answerText = frames
    .filter((m) => m.type === 'text_delta')
    .map((m) => (m as { delta: string }).delta)
    .join('');
  const toolRows = transcript.filter((m) => m.role === 'tool');

  console.log(`\nloop outcome: ${result.outcome} turns=${result.turns}`);
  console.log(`tools called: ${toolStarts.map((t) => t.tool).join(', ') || '(none)'}`);
  console.log(`answer: ${answerText.slice(0, 300).replace(/\n/g, ' ')}`);

  check(result.outcome === 'complete', 'loop finished with outcome=complete');
  check(toolStarts.some((t) => t.tool === 'read_file'), 'the model actually called read_file');
  check(toolRows.length >= 1, 'the call landed in the transcript as a tool row');
  check(toolResults.some((r) => !r.isError), 'the tool ran without error');
  check(result.turns >= 2, `the loop took a second turn to feed the result back (turns=${result.turns})`);
  check(answerText.includes(SECRET), `the answer contains the REAL file content (${SECRET})`);
  check(!answerText.includes('<tool_result'), 'no tool markup leaked into the visible answer');
  check(
    !JSON.stringify(frames.filter((m) => m.type === 'text_delta')).includes('<persisted-output>'),
    'no spill envelope for a tiny result',
  );
} finally {
  await rm(cwd, { recursive: true, force: true });
}

console.log(`\nlive probe: ${passed} checks passed on ${MODEL}`);
