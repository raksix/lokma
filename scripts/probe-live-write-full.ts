/**
 * Live probe — WHAT does the server actually send, and does the real registry
 * survive the round trip? A local recording proxy sits in front of the real
 * upstream: it logs the outgoing `tools[]` (count, bytes) and forwards
 * everything untouched, so the agent loop runs against the true registry.
 *
 * Run: bun scripts/probe-live-write-full.ts [provider/model]
 */
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveApiKey, resolveProviderUpstream, SessionStore } from '@lokma/core';
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
console.log(`\n== ${MODEL} @ ${upstream.baseUrl} (via recording proxy)\n`);

interface Seen {
  turns: number;
  toolCounts: number[];
  toolBytes: number[];
  statuses: number[];
  nonNativeTurns: number[];
  markupTurns: number[];
}
const seen: Seen = { turns: 0, toolCounts: [], toolBytes: [], statuses: [], nonNativeTurns: [], markupTurns: [] };

const proxy = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url);
    const body = await req.text();
    seen.turns += 1;
    const turn = seen.turns;
    try {
      const parsed = JSON.parse(body) as { tools?: unknown[]; messages?: unknown[] };
      const tools = Array.isArray(parsed.tools) ? parsed.tools : [];
      seen.toolCounts.push(tools.length);
      seen.toolBytes.push(body.length);
      const names = tools.map((t) => {
        const f = t as { function?: { name?: string } };
        return f.function?.name ?? '?';
      });
      console.log(`  turn ${turn}: tools=${tools.length} bodyBytes=${body.length} msgs=${parsed.messages?.length ?? 0}`);
      if (turn === 1) console.log(`  names: ${names.join(', ')}`);
    } catch {
      console.log(`  turn ${turn}: body not JSON (${body.length}b)`);
    }

    // The adapter builds `<base>/chat/completions` and our base already ends
    // in `/v1`, so the incoming path still carries it — forward only the tail.
    const upstreamRes = await fetch(`${upstream.baseUrl}${url.pathname.replace(/\/v1(?=\/|$)/, '')}${url.search}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body,
    });
    seen.statuses.push(upstreamRes.status);
    console.log(`  turn ${turn}: upstream ${upstreamRes.status}`);

    if (!upstreamRes.ok) {
      const txt = await upstreamRes.text();
      console.log(`  turn ${turn}: BODY ${txt.slice(0, 600)}`);
      seen.nonNativeTurns.push(turn);
      return new Response(txt, { status: upstreamRes.status, headers: { 'Content-Type': 'application/json' } });
    }

    // Inspect the SSE text stream for a native tool_calls vs emitted markup.
    const raw = await upstreamRes.text();
    let hasNative = false;
    let markup = false;
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const p = line.slice(6).trim();
      if (p === '[DONE]') continue;
      try {
        const d = JSON.parse(p) as { choices?: { delta?: { tool_calls?: unknown[]; content?: string } }[] };
        for (const ch of d.choices ?? []) {
          if (ch.delta?.tool_calls?.length) hasNative = true;
          if (typeof ch.delta?.content === 'string' && /<tool name=|<\/tool>|<Function|minimax/.test(ch.delta.content)) markup = true;
        }
      } catch {
        /* keep going */
      }
    }
    if (!hasNative) seen.nonNativeTurns.push(turn);
    if (markup) seen.markupTurns.push(turn);
    console.log(`  turn ${turn}: native=${hasNative} markup=${markup}`);
    return new Response(raw, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  },
});

const cwd = await mkdtemp(join(tmpdir(), 'lokma-fulltools-'));
try {
  const store = new SessionStore(cwd);
  const frames: ServerMessage[] = [];
  const starts: { tool: string; input: unknown }[] = [];

  const result = await runAgentLoop({
    cwd,
    sessionId: 'fulltools',
    model: MODEL,
    upstream: { provider: upstream.provider, baseUrl: `http://127.0.0.1:${proxy.port}/v1`, apiKey },
    history: [],
    prompt:
      'Write ONE self-contained html file named page.html: a minimal single-page site about tea, ' +
      '~20 KB, inline <style>, 4 sections, no JS, no emoji. One write_file call, then reply DONE.',
    permissions: { allow: [], deny: [], defaultMode: 'bypass' },
    store,
    send: (m) => {
      frames.push(m);
      if (m.type === 'tool_start') starts.push({ tool: m.tool, input: m.input });
    },
    waitApproval: async () => 'allow',
    waitAnswer: async () => '',
    signal: new AbortController().signal,
    maxTurns: 4,
  });

  const visible = frames
    .filter((m) => m.type === 'text_delta')
    .map((m) => (m as { delta: string }).delta)
    .join('');
  console.log(`\noutcome=${result.outcome} turns=${result.turns} visibleChars=${visible.length}`);
  console.log(`tools sent per turn: ${JSON.stringify(seen.toolCounts)}`);
  console.log(`body bytes per turn: ${JSON.stringify(seen.toolBytes)}`);
  console.log(`upstream statuses: ${JSON.stringify(seen.statuses)}`);
  console.log(`turns WITHOUT a native call: ${JSON.stringify(seen.nonNativeTurns)}`);
  console.log(`turns that emitted tool MARKUP: ${JSON.stringify(seen.markupTurns)}`);
  console.log(`tools called: ${starts.map((s) => s.tool).join(', ') || '(none)'}`);

  check(seen.turns >= 1, 'the proxy saw the upstream request(s)');
  check((seen.toolCounts[0] ?? 0) > 20, `the server sends the FULL registry, not just builtins (${seen.toolCounts[0]} tools)`);
  check(seen.statuses.every((s) => s === 200), 'every upstream turn returned 200 (no tools/pairing rejection)');
  check(starts.some((s) => s.tool === 'write_file'), 'the model called write_file');

  let bytes = 0;
  try {
    bytes = (await stat(join(cwd, 'page.html'))).size;
  } catch {
    bytes = 0;
  }
  console.log(`page.html bytes=${bytes}`);
  check(bytes > 5000, `the file has real content (${bytes} bytes)`);
  check(!/<tool name=|minimax/.test(visible), 'no tool markup leaked into the visible answer');
} finally {
  proxy.stop(true);
  await rm(cwd, { recursive: true, force: true });
}

console.log(`\nfull-registry probe: ${passed} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log(` - ${f}`);
  process.exit(1);
}