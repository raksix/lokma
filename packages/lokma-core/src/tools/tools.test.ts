/**
 * Live probe for the agent tool foundation (`./gate`, `./builtins`,
 * `./executor` over `./registry`).
 * Run: `bun src/tools/tools.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Real temp workspace on disk (no HOME involved — mkdtemp under os.tmpdir),
 * real child process for `run_command` (process.execPath, no shell).
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts` from
 * `tsc -p` output (same precedent as `lokma-ai`'s `adapters.test.ts`).
 * See Docs/30 section agent tools + Docs/22 section permissions.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBuiltinTools } from './builtins';
import { capToolResult, executeToolCall, mintCallId, runApprovedCall, type ToolEvent } from './executor';
import { decideToolCall, describeToolCall, READ_TOOLS, WRITE_TOOLS } from './gate';
import { ToolRegistry } from './registry';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

const AUTO = { allow: [] as string[], deny: [] as string[], defaultMode: 'auto' as const };

function registryWith(cwd: string): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of buildBuiltinTools(cwd)) registry.register(tool);
  return registry;
}

async function main(): Promise<void> {
  // --- gate decisions (pure, no disk) ---
  assert(decideToolCall(AUTO, 'read_file') === 'allow', 'gate auto: read_file allowed');
  assert(decideToolCall(AUTO, 'list_files') === 'allow', 'gate auto: list_files allowed');
  assert(decideToolCall(AUTO, 'search_files') === 'allow', 'gate auto: search_files allowed');
  assert(decideToolCall(AUTO, 'write_file') === 'ask', 'gate auto: write_file asks');
  assert(decideToolCall(AUTO, 'run_command') === 'ask', 'gate auto: run_command asks');
  assert(READ_TOOLS.has('read_file') && !READ_TOOLS.has('write_file'), 'gate READ_TOOLS split');
  assert(WRITE_TOOLS.has('write_file') && WRITE_TOOLS.has('run_command'), 'gate WRITE_TOOLS split');
  assert(
    decideToolCall({ allow: [], deny: ['run_command'], defaultMode: 'bypass' }, 'run_command') === 'deny',
    'gate deny wins over bypass mode',
  );
  assert(
    decideToolCall({ allow: ['write_file'], deny: [], defaultMode: 'plan' }, 'write_file') === 'allow',
    'gate allow wins over plan mode',
  );
  assert(
    decideToolCall({ allow: [], deny: [], defaultMode: 'manual' }, 'read_file') === 'ask',
    'gate manual: even reads ask',
  );
  assert(
    decideToolCall({ allow: [], deny: [], defaultMode: 'plan' }, 'run_command') === 'deny',
    'gate plan: mutations refused outright',
  );
  assert(
    decideToolCall({ allow: [], deny: [], defaultMode: 'bypass' }, 'run_command') === 'allow',
    'gate bypass: everything runs',
  );
  assert(
    decideToolCall({ allow: [], deny: ['write'], defaultMode: 'auto' }, 'write_file') === 'deny',
    'gate deny prefix blocks write_file',
  );
  assert(decideToolCall(undefined, 'read_file') === 'allow', 'gate undefined perms fall back to auto');
  assert(decideToolCall(null, 'run_command') === 'ask', 'gate null perms fall back to auto');
  assert(describeToolCall('read_file', { path: 'a.txt' }) === 'Read a.txt', 'gate describe read_file');
  assert(describeToolCall('run_command', { command: 'ls' }) === 'Run `ls`', 'gate describe run_command');
  assert(describeToolCall('mystery', null) === 'Run mystery', 'gate describe unknown tool');

  // --- builtins against a real temp workspace ---
  const cwd = await mkdtemp(join(tmpdir(), 'lokma-tools-'));
  try {
    await writeFile(join(cwd, 'hello.txt'), 'hello tool loop\n');
    const registry = registryWith(cwd);
    assert(registry.names().length === 5, 'builtins: five tools registered');
    assert(
      ['read_file', 'list_files', 'search_files', 'write_file', 'run_command'].every((n) => registry.names().includes(n)),
      'builtins: exact tool names',
    );

    const read = (await registry.call('read_file', { path: 'hello.txt' }, undefined)) as {
      content: string;
      sha: string;
    };
    assert(read.content === 'hello tool loop\n', 'builtins read_file returns real bytes');
    assert(typeof read.sha === 'string' && read.sha.length === 64, 'builtins read_file returns sha');

    const listed = (await registry.call('list_files', { path: '.' }, undefined)) as {
      entries: { name: string }[];
    };
    assert(listed.entries.some((e) => e.name === 'hello.txt'), 'builtins list_files sees the file');

    const found = (await registry.call('search_files', { query: 'hello' }, undefined)) as {
      hits: { path: string }[];
    };
    assert(found.hits.some((h) => h.path.includes('hello.txt')), 'builtins search_files finds it');

    const written = (await registry.call(
      'write_file',
      { path: 'new.md', content: '# fresh\n' },
      undefined,
    )) as { sha: string };
    assert(typeof written.sha === 'string', 'builtins write_file creates + returns sha');

    let stale: unknown = null;
    try {
      await registry.call('write_file', { path: 'new.md', content: 'x', expectedSha: '0'.repeat(64) }, undefined);
    } catch (e) {
      stale = e;
    }
    assert(
      stale !== null && (stale as { code?: string }).code === 'stale_file',
      'builtins write_file stale sha rejected',
    );

    let escape: unknown = null;
    try {
      await registry.call('read_file', { path: '../outside.txt' }, undefined);
    } catch (e) {
      escape = e;
    }
    assert(
      escape !== null && (escape as { code?: string }).code === 'outside_root',
      'builtins read_file jail blocks .. escape',
    );

    const ran = (await registry.call(
      'run_command',
      { command: process.execPath, args: ['-e', 'process.stdout.write("tool-ok")'] },
      undefined,
    )) as { exitCode: number; stdout: string };
    assert(ran.exitCode === 0 && ran.stdout === 'tool-ok', 'builtins run_command runs a real binary');

    let meta: unknown = null;
    try {
      await registry.call('run_command', { command: 'a|b', args: [] }, undefined);
    } catch (e) {
      meta = e;
    }
    assert(meta instanceof Error && /metacharacters/.test(meta.message), 'builtins run_command refuses shell metachars');

    // --- executor: gate -> emit -> run ---
    const events: ToolEvent[] = [];
    const ok = await executeToolCall(registry, {
      tool: 'read_file',
      input: { path: 'hello.txt' },
      permissions: AUTO,
      onEvent: (e) => events.push(e),
    });
    assert(ok.outcome === 'ok', 'executor auto: read runs');
    assert(
      events.length === 2 && events[0].type === 'tool_start' && events[1].type === 'tool_result',
      'executor emits tool_start then tool_result',
    );
    assert(
      events[0].type === 'tool_start' && events[1].type === 'tool_result' && events[0].callId === events[1].callId,
      'executor start/result share the call id',
    );

    const gated: ToolEvent[] = [];
    const pending = await executeToolCall(registry, {
      tool: 'write_file',
      input: { path: 'gated.md', content: 'nope\n' },
      permissions: AUTO,
      onEvent: (e) => gated.push(e),
    });
    assert(pending.outcome === 'needs_approval', 'executor auto: write needs approval');
    assert(gated.length === 0, 'executor approval path emits nothing yet');
    assert(
      pending.outcome === 'needs_approval' && pending.requestId.startsWith('perm_'),
      'executor approval carries a request id',
    );
    // Nothing was written before approval.
    let missing: unknown = null;
    try {
      await registry.call('read_file', { path: 'gated.md' }, undefined);
    } catch (e) {
      missing = e;
    }
    assert((missing as { code?: string })?.code === 'file_not_found', 'executor gated write left no file');
    // Resume after the user allows: the approved call runs + emits.
    if (pending.outcome !== 'needs_approval') throw new Error('FAIL: narrow needs_approval');
    const resumed: ToolEvent[] = [];
    const done = await runApprovedCall(registry, {
      tool: pending.tool,
      input: { path: 'gated.md', content: 'yes\n' },
      callId: pending.callId,
      onEvent: (e) => resumed.push(e),
    });
    assert(done.outcome === 'ok', 'executor approved resume writes');
    assert(resumed.length === 2 && resumed[0].type === 'tool_start', 'executor resume emits start/result');
    const after = (await registry.call('read_file', { path: 'gated.md' }, undefined)) as { content: string };
    assert(after.content === 'yes\n', 'executor resume wrote real bytes');

    const denied = await executeToolCall(registry, {
      tool: 'run_command',
      input: { command: 'x', args: [] },
      permissions: { allow: [], deny: ['run_command'], defaultMode: 'auto' },
    });
    assert(denied.outcome === 'denied', 'executor deny list blocks without events');

    const unknown = await executeToolCall(registry, { tool: 'nope', input: {}, permissions: AUTO });
    assert(unknown.outcome === 'error' && unknown.code === 'unknown_tool', 'executor unknown tool errors');

    const badEvents: ToolEvent[] = [];
    const bad = await executeToolCall(registry, {
      tool: 'write_file',
      input: { path: 'bad.md' },
      permissions: { allow: [], deny: [], defaultMode: 'bypass' },
      onEvent: (e) => badEvents.push(e),
    });
    assert(bad.outcome === 'error', 'executor zod-invalid input errors');
    assert(
      badEvents.length === 2 && badEvents[1].type === 'tool_result' && badEvents[1].isError === true,
      'executor validation failure still emits error tool_result',
    );

    // --- result capping ---
    const small = capToolResult({ a: 1 });
    assert(small.truncated === false, 'executor small result passes through');
    const big = capToolResult({ blob: 'x'.repeat(200 * 1024) });
    assert(big.truncated === true, 'executor huge result capped');
    assert(mintCallId() !== mintCallId(), 'executor call ids unique');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }

  console.log(`\ntools probe: ${passed} passed`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
