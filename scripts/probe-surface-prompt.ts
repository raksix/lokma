/**
 * REQ-181 prompt-block probe — the agent loop's system prompt actually
 * carries the surface catalog to the model.
 *
 * Run: `bun scripts/probe-surface-prompt.ts` (from the repo root — the
 * skills scan resolves 'skills' against the cwd, same as the live server).
 *
 * Method: a local stub upstream captures the FIRST request the real
 * runAgentLoop sends; the assertions read the captured `messages[0].content`
 * (the system prompt) and the captured `tools[]` array — registry names ==
 * `<available_surfaces>` rows, birebir — plus the `<available_skills>` block.
 * No network, no model: the stub answers a one-delta SSE completion.
 */
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { surfaceToolNames, type ServerMessage } from '@lokma/shared';
import { SessionStore } from '@lokma/core';
import { runAgentLoop } from '../packages/lokma-web/server/src/agent-loop';

let passed = 0;
function check(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

type Captured = { path: string; system: string; toolNames: string[] };

let captured: Captured | null = null;

const stub = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body) as {
        messages?: { role: string; content: string }[];
        tools?: { name?: string; function?: { name?: string } }[];
      };
      captured = {
        path: req.url ?? '',
        system: parsed.messages?.find((m) => m.role === 'system')?.content ?? '',
        toolNames: (parsed.tools ?? [])
          .map((t) => t.function?.name ?? t.name ?? '')
          .filter((n) => n.length > 0),
      };
    } catch {
      // capture stays null — the check below fails honestly
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end('data: {"choices":[{"delta":{"content":"done"}}]}\n\ndata: [DONE]\n\n');
  });
});
await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
const port = (stub.address() as { port: number }).port;

/** Extract tool names from the `<available_surfaces>` block (`- L: a, b, c`). */
function extractSurfaceNames(system: string): string[] {
  const open = system.indexOf('<available_surfaces>');
  const close = system.indexOf('</available_surfaces>');
  if (open === -1 || close === -1 || close < open) return [];
  const names: string[] = [];
  for (const line of system.slice(open, close).split('\n')) {
    if (!line.startsWith('- ')) continue;
    const idx = line.indexOf(': ');
    if (idx === -1) continue;
    for (const token of line.slice(idx + 2).split(', ')) names.push(token.trim());
  }
  return names;
}

const cwd = await mkdtemp(join(tmpdir(), 'lokma-surface-prompt-'));
try {
  const frames: ServerMessage[] = [];
  const result = await runAgentLoop({
    cwd,
    sessionId: 'surface-prompt-probe',
    model: 'stub-model',
    upstream: { provider: 'openai', baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: 'stub-key' },
    history: [],
    prompt: 'hi',
    permissions: { allow: [], deny: [], defaultMode: 'bypass' },
    store: new SessionStore(cwd),
    send: (msg) => frames.push(msg),
    waitApproval: async () => 'allow',
    waitAnswer: async () => '',
    signal: new AbortController().signal,
    maxTurns: 1,
  });
  check(result.outcome === 'complete', 'stub run completes (one turn)');
  const cap = captured as Captured | null;
  if (cap === null) throw new Error('FAIL: the stub captured the upstream request');
  passed += 1;
  console.log('PASS: the stub captured the upstream request');
  check(cap.path === '/v1/chat/completions', 'openai adapter posts {base}/chat/completions');

  // ── <available_surfaces>: registry ∩ catalog, birebir ──────────────────
  check(cap.system.includes('<available_surfaces>'), 'system prompt carries <available_surfaces>');
  check(cap.system.includes('</available_surfaces>'), 'the surfaces block is closed');
  const blockNames = extractSurfaceNames(cap.system);
  const expected = surfaceToolNames().filter((n) => cap.toolNames.includes(n));
  check(
    JSON.stringify(blockNames) === JSON.stringify(expected),
    `block == registry ∩ catalog, in order (${expected.length} tools)`,
  );
  check(blockNames.includes('design_generate'), 'design_generate listed');
  check(blockNames.includes('archify_render'), 'archify_render listed');
  check(blockNames.includes('testing_run'), 'testing_run listed');
  check(blockNames.includes('open_browser'), 'open_browser listed');
  check(
    cap.toolNames.includes('skill_view') && cap.toolNames.includes('skill_patch'),
    'skills family registered on the wire (wave 2)',
  );
  check(
    blockNames.includes('vault_search') && blockNames.includes('memory_write'),
    'vault/memory family advertised (wave 2)',
  );
  check(
    cap.toolNames.includes('git_status') && cap.toolNames.includes('provider_add') && cap.toolNames.includes('usage_report'),
    'git/providers/usage families registered on the wire (wave 3)',
  );
  check(
    blockNames.includes('git_diff') && blockNames.includes('model_probe') && blockNames.includes('usage_report'),
    'git/providers/usage families advertised (wave 3)',
  );
  check(
    cap.toolNames.includes('cron_list') && cap.toolNames.includes('plugin_install') && cap.toolNames.includes('trace_get'),
    'cron/plugins/observability families registered on the wire (wave 4)',
  );
  check(
    blockNames.includes('cron_list') && blockNames.includes('plugin_list') && blockNames.includes('trace_list'),
    'cron/plugins/observability families advertised (wave 4)',
  );
  check(
    cap.toolNames.includes('open_terminal') && cap.toolNames.includes('terminal_write'),
    'terminal family registered on the wire (wave 5)',
  );
  check(
    blockNames.includes('terminal_write'),
    'terminal family advertised (wave 5)',
  );

  // ── <available_skills>: the once-dead builder now reaches the model ────
  check(cap.system.includes('<available_skills>'), 'system prompt carries <available_skills>');
  check(cap.system.includes('lokma-personas/planner'), 'the repo skill index is listed (planner persona)');

  console.log(`\nsystem prompt: ${cap.system.length} chars — surfaces block ${blockNames.length} tools, skills block present`);
  console.log(`registry tools on the wire: ${cap.toolNames.length}`);
} finally {
  stub.close();
  await rm(cwd, { recursive: true, force: true });
}

console.log(`\nsurface-prompt probe: ${passed} checks passed`);
