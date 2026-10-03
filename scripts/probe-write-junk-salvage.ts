/**
 * Live probe — REQ-196 acceptance: a model that emits the junk-wrapped
 * `<tool name="write_file">]<]minimax[>[<path>…` shape must still write the
 * file. The markup is INJECTED as the model's turn, so the probe measures the
 * parser path, not whether the upstream happened to be sloppy.
 *
 * Run: bun scripts/probe-write-junk-salvage.ts [provider/model]
 */
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveApiKey, resolveProviderUpstream, SessionStore } from '@lokma/core';
import { parseToolBlocks } from '@lokma/core';
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

const HTML = `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"><title>Duman Tarifi</title></head>
<body><h1>Merhaba</h1><p>Karisim &amp; notalar</p></body>
</html>`;
const TARGET = 'kruger.html';

// The exact broken shape, byte-for-byte from the live transcript.
const MARKUP =
  `<tool name="write_file">]<]minimax[>[<path>${TARGET}]<]minimax[>[</path>]<]minimax[>[<content>` +
  HTML +
  `]<]minimax[>[</content>]<]minimax[>[</tool>`;

console.log(`\n== REQ-196 parser acceptance (model-agnostic, markup injected)\n`);
console.log(`injected shape: ${MARKUP.slice(0, 110)}…\n`);

// 1) The parser contract, checked directly.
{
  const calls = parseToolBlocks(MARKUP);
  check(calls.length === 1, 'the junk-wrapped block yields exactly one call');
  const input = (calls[0]?.input ?? {}) as { path?: string; content?: string };
  check(calls[0]?.tool === 'write_file', 'tool name is write_file');
  check(calls[0]?.parseError === undefined, 'no parseError');
  check(input.path === TARGET, `path is exactly ${TARGET} (got ${JSON.stringify(input.path)})`);
  check(input.content === HTML, 'content is byte-identical to the html the model sent');
}

// 2) The same markup through the REAL registry — the call must EXECUTE and
//    write the file. Model is pinned to a cheap real one; the markup is ours.
const apiKey = await resolveApiKey(PROVIDER);
const upstream = await resolveProviderUpstream(PROVIDER);
if (apiKey) {
  const { buildBuiltinTools, ToolRegistry, executeToolCall } = await import('@lokma/core');
  const cwd = await mkdtemp(join(tmpdir(), 'lokma-salvage-'));
  try {
    const registry = new ToolRegistry();
    for (const t of buildBuiltinTools(cwd)) registry.register(t);
    const calls = parseToolBlocks(MARKUP);
    const frames: ServerMessage[] = [];
    const store = new SessionStore(cwd);
    void store;
    const outcome = await executeToolCall(registry, {
      tool: calls[0]!.tool,
      input: calls[0]!.input,
      callId: 'salvage-1',
      sessionId: 'salvage-probe',
      cwd,
      permissions: { allow: [], deny: [], defaultMode: 'bypass' },
      send: (m: ServerMessage) => frames.push(m),
      waitApproval: async () => 'allow',
      waitAnswer: async () => '',
      signal: new AbortController().signal,
      registry,
    } as never);
    check(outcome.outcome === 'ok', `write_file executed without error (${outcome.outcome})`);
    let bytes = 0;
    let body = '';
    try {
      bytes = (await stat(join(cwd, TARGET))).size;
      body = await readFile(join(cwd, TARGET), 'utf8');
    } catch {
      bytes = 0;
    }
    console.log(`\nfile on disk: ${bytes} bytes`);
    check(bytes > 0, 'the file exists on disk');
    check(body === HTML, 'the file content matches the html the model sent, byte for byte');
    void upstream;
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
} else {
  console.log(`\n(no stored key for ${PROVIDER} — skipped the live registry leg)`);
}

console.log(`\nREQ-196 acceptance: ${passed} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log(` - ${f}`);
  process.exit(1);
}