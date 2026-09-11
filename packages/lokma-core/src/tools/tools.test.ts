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
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBuiltinTools, BUILTIN_TOOL_NAMES } from './builtins';
import { capToolResult, executeToolCall, mintCallId, runApprovedCall, type ToolEvent } from './executor';
import { globToRegExp, WorkspaceFiles } from '../files/files';
import { decideToolCall, describeToolCall, READ_TOOLS, WRITE_TOOLS } from './gate';
import {
  emptyResultPlaceholder,
  isEmptyResultText,
  persistedOutputEnvelope,
  previewCut,
  resultBudget,
  resultOverBudget,
  spillPathFor,
} from './result-budget';
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
    assert(registry.names().length === BUILTIN_TOOL_NAMES.length, 'builtins: every declared tool is registered');
    assert(
      BUILTIN_TOOL_NAMES.every((n) => registry.names().includes(n)),
      'builtins: the declared name list matches the registry',
    );
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

  // --- REQ-128: glob / grep / edit tooling ---
  assert(globToRegExp('src/**/*.tsx').test('src/x/y.tsx'), 'glob: ** crosses directories');
  assert(globToRegExp('**/*.ts').test('a.ts'), 'glob: **/ also matches zero segments');
  assert(!globToRegExp('*.ts').test('src/a.ts'), 'glob: a single star does not cross /');
  assert(globToRegExp('a?c.ts').test('abc.ts'), 'glob: ? is exactly one char');

  const ws = await mkdtemp(join(tmpdir(), 'lokma-edit-'));
  try {
    await mkdir(join(ws, 'src'), { recursive: true });
    await writeFile(join(ws, 'src', 'a.ts'), 'export const a = 1;\nexport const b = 2;\n');
    await writeFile(join(ws, 'src', 'b.ts'), 'export const a = 1;\n');
    await writeFile(join(ws, 'README.md'), '# hi\n');
    const files = new WorkspaceFiles(ws);

    const g = await files.glob('**/*.ts');
    assert(
      g.files.length === 2 && g.files.includes('src/a.ts') && g.files.includes('src/b.ts'),
      `glob finds nested sources, got ${JSON.stringify(g.files)}`,
    );
    const g2 = await files.glob('*.md');
    assert(g2.files.length === 1 && g2.files[0] === 'README.md', 'glob stays at the root for a flat pattern');

    const hit = await files.grep('export const (a|b)');
    assert(
      hit.total === 3 && hit.hits.length === 2,
      `grep groups matches per file, got total=${hit.total} files=${hit.hits.length}`,
    );
    assert(hit.hits[0]?.matches[0]?.line === 1, 'grep reports 1-based line numbers');
    const lit = await files.grep('.', { literal: true });
    assert(lit.total === 0, 'grep literal mode escapes regex metacharacters');

    const before = await files.read('src/a.ts');
    const edited = await files.edit('src/a.ts', 'export const b = 2;', 'export const b = 3;');
    assert(edited.replacements === 1 && edited.sha !== before.sha, 'edit replaces once and re-hashes');
    const after = await files.read('src/a.ts');
    assert(after.content.includes('export const b = 3;'), 'edit wrote the new text to disk');

    let dupCode = '';
    try {
      await files.edit('src/a.ts', 'export const', 'x');
    } catch (e) {
      dupCode = (e as { code?: string }).code ?? '';
    }
    assert(dupCode === 'edit_not_unique', 'edit refuses an ambiguous match');

    let missingCode = '';
    try {
      await files.edit('src/a.ts', 'not-in-this-file', 'x');
    } catch (e) {
      missingCode = (e as { code?: string }).code ?? '';
    }
    assert(missingCode === 'edit_not_found', 'edit refuses a missing match');

    let staleCode = '';
    try {
      await files.edit('src/a.ts', 'export const b = 3;', 'y', { expectedSha: before.sha });
    } catch (e) {
      staleCode = (e as { code?: string }).code ?? '';
    }
    assert(staleCode === 'sha_mismatch', 'edit refuses a stale expectedSha');

    const all = await files.edit('src/b.ts', 'export const a = 1;', 'export const a = 9;', { replaceAll: true });
    assert(all.replacements === 1, 'replaceAll reports its replacement count');
  } finally {
    await rm(ws, { recursive: true, force: true });
  }

  // --- REQ-128: result budget + spill envelope (pure) ---
  assert(resultBudget(undefined) === 50_000, 'resultBudget defaults to 50k');
  assert(resultBudget(1_000) === 1_000 && resultBudget(1e9) === 50_000, 'resultBudget honours a smaller budget and clamps a bigger one');
  assert(!resultOverBudget('abc', 3) && resultOverBudget('abcd', 3), 'over-budget detection is inclusive-safe');
  const cut = previewCut('line one\nline two\nline three', 12);
  assert(cut.hasMore && cut.preview.length <= 12 && !cut.preview.endsWith('\n'), 'previewCut backs up to a newline');
  assert(!previewCut('short', 40).hasMore, 'short text needs no preview marker');
  assert(emptyResultPlaceholder('grep') === '(grep completed with no output)', 'empty results get a placeholder');
  assert(isEmptyResultText('{}') && isEmptyResultText('   ') && !isEmptyResultText('{"a":1}'), 'empty-result detection');
  const env = persistedOutputEnvelope({
    originalChars: 123_456,
    path: '.lokma/tool-results/t_1.txt',
    preview: 'abc',
    hasMore: true,
  });
  assert(
    env.startsWith('<persisted-output>') &&
      env.includes('.lokma/tool-results/t_1.txt') &&
      env.includes('KB') &&
      env.endsWith('</persisted-output>'),
    'spill envelope carries size, path and preview',
  );
  assert(spillPathFor('t_abc-1') === '.lokma/tool-results/t_abc-1.txt', 'spill path is namespaced under .lokma');

  // --- REQ-128: read-only markers drive the gate ---
  const markers = registryWith(ws);
  assert(markers.get('glob')?.readOnly === true && markers.get('grep')?.readOnly === true, 'search tools declare readOnly');
  assert(markers.get('read_file')?.readOnly === true, 'read_file declares readOnly');
  assert(markers.get('edit_file')?.readOnly !== true, 'edit_file is NOT read-only');
  assert(decideToolCall(AUTO, 'glob') === 'allow' && decideToolCall(AUTO, 'grep') === 'allow', 'gate auto allows the new search tools');
  assert(decideToolCall(AUTO, 'edit_file') === 'ask', 'gate auto asks before edit_file');
  assert(markers.get('read_file')?.maxResultSizeChars === 50_000, 'read_file declares its output budget');
  assert(markers.get('grep')?.maxResultSizeChars === 20_000, 'grep declares its output budget');

  console.log(`\ntools probe: ${passed} passed`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
