/**
 * REQ-116 FAZ B probe — headless `claude -p` engine translator + spawn path.
 * Run: `bun src/engines/claude-print.test.ts` from `packages/lokma-web/server`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Not imported by server code, so `tsc -p` output ignores it.
 */
import { spawn } from 'node:child_process';
import { buildClaudeArgs, CLAUDE_BINARY_NOT_FOUND, CLAUDE_ENGINE_DEFAULT_ALLOWED_TOOLS, CLAUDE_ENGINE_DEFAULT_DISALLOWED_TOOLS, CLAUDE_ENGINE_DEFAULT_MAX_BUDGET_USD, CLAUDE_MUTATION_SURFACE, claudeToolsForLokmaTool, describeClaudeAskCard, parseClaudeEngineModel, resolveClaudePermissions, runClaudePrint, translateClaudeLine } from './claude-print';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

const SID = 'test-session';

// 1. Partial token stream becomes a text frame.
const partial = translateClaudeLine(
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } } }),
  SID,
);
assert(partial.frames.length === 1 && partial.frames[0].type === 'text_delta', 'stream_event text_delta -> text frame');

// 2. Assistant turn: text streams, tool_use becomes a start frame.
const assist = translateClaudeLine(
  JSON.stringify({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'Looking' },
        { type: 'tool_use', id: 'toolu_01', name: 'Read', input: { file_path: '/repo/src/auth.ts' } },
      ],
    },
  }),
  SID,
);
assert(assist.frames.length === 2, 'assistant turn yields two frames');
assert(assist.frames[0].type === 'text_delta', 'assistant text streams');
const start = assist.frames[1];
assert(start.type === 'tool_start' && start.tool === 'Read' && start.callId === 'toolu_01', 'tool_use -> tool_start');

// 3. User turn carrying a tool_result becomes a result frame.
const user = translateClaudeLine(
  JSON.stringify({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: 'file bytes here' }] },
  }),
  SID,
);
assert(user.frames.length === 1 && user.frames[0].type === 'tool_result', 'tool_result -> result frame');
assert(user.frames[0].type === 'tool_result' && user.frames[0].callId === 'toolu_01', 'result keeps the tool_use id');

// 4. system/init is log-only — zero frames, never throws.
const sys = translateClaudeLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'abc', model: 'sonnet' }), SID);
assert(sys.frames.length === 0 && sys.summary === undefined, 'system init is log-only');

// 5. Garbage lines are ignored, never throw.
assert(translateClaudeLine('not json at all', SID).frames.length === 0, 'garbage line ignored');
assert(translateClaudeLine('{"type":', SID).frames.length === 0, 'truncated json ignored');

// 6. Terminal result: cost frame + machine summary.
const done = translateClaudeLine(
  JSON.stringify({ type: 'result', subtype: 'success', result: 'done text', total_cost_usd: 0.12, num_turns: 4, session_id: 's-1' }),
  SID,
);
assert(done.frames.length === 1 && done.frames[0].type === 'cost', 'result emits a cost frame');
assert(done.summary !== undefined && done.summary.subtype === 'success', 'result summary keeps success');
assert(done.summary !== undefined && done.summary.costUsd === 0.12 && done.summary.numTurns === 4, 'cost and turns carried');
assert(done.summary !== undefined && done.summary.claudeSessionId === 's-1', 'claude session id carried for --resume');

// 7. max-turns / budget subtypes survive (FAZ A transcript markers read these).
const capped = translateClaudeLine(JSON.stringify({ type: 'result', subtype: 'error_max_turns' }), SID);
assert(capped.summary !== undefined && capped.summary.subtype === 'error_max_turns', 'error_max_turns subtype kept');
const broke = translateClaudeLine(JSON.stringify({ type: 'result', subtype: 'error_max_budget_usd' }), SID);
assert(broke.summary !== undefined && broke.summary.subtype === 'error_max_budget_usd', 'error_max_budget_usd kept');

// 8. Argv uses only real v2.1.x flags (verified against `claude --help`).
const argv = buildClaudeArgs({ prompt: 'hi', model: 'sonnet', allowedTools: ['Read', 'Bash'], maxBudgetUsd: 2 });
for (const invented of ['--max-turns', '--json-schema']) assert(!argv.includes(invented), 'no invented flag ' + invented);
for (const real of ['-p', '--output-format', 'stream-json', '--permission-mode', 'dontAsk', '--max-budget-usd', '2']) {
  assert(argv.includes(real), 'argv carries ' + real);
}
assert(argv.includes('--model') && argv.includes('sonnet'), 'model flag carried');
const bare = buildClaudeArgs({ prompt: 'hi', allowedTools: [], maxBudgetUsd: 1 });
assert(!bare.includes('--allowedTools'), 'empty allowlist omits the flag');

// 9. Missing binary rejects honestly — never a mock, never hangs.
const t0 = Date.now();
let missingErr = '';
try {
  await runClaudePrint({
    prompt: 'hi',
    cwd: '/tmp',
    allowedTools: [],
    maxTurns: 5,
    maxBudgetUsd: 1,
    sessionId: SID,
    signal: new AbortController().signal,
    send: () => undefined,
    claudeBin: '/nonexistent-bin-req116/claude',
  });
} catch (e) {
  missingErr = String(e);
}
assert(missingErr.includes(CLAUDE_BINARY_NOT_FOUND), 'missing binary is an honest rejection');
assert(Date.now() - t0 < 10_000, 'missing binary fails fast');

// 10. Real binary answers `--version` on the same spawn path (no API spend).
const ver = await new Promise<string>((resolve) => {
  let out = '';
  const c = spawn('claude', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
  c.stdout?.on('data', (d: Buffer) => {
    out += d.toString('utf8');
  });
  c.on('close', () => resolve(out.trim()));
  c.on('error', () => resolve(''));
});
assert(ver.length > 0, 'real claude binary spawns (got: ' + ver.slice(0, 40) + ')');

// 11. FAZ B-wiring: engine selection is prefix-exact, defaults match the plan.
const bareSel = parseClaudeEngineModel('claude-code');
assert(bareSel !== null && bareSel.claudeModel === undefined, 'bare claude-code selects binary default');
const sonnetSel = parseClaudeEngineModel('claude-code/sonnet');
assert(sonnetSel !== null && sonnetSel.claudeModel === 'sonnet', 'claude-code/sonnet selects sonnet');
assert(parseClaudeEngineModel('claude-code/') !== null, 'trailing-slash prefix selects default');
assert(parseClaudeEngineModel('  claude-code/opus  ')?.claudeModel === 'opus', 'selection trims whitespace');
assert(parseClaudeEngineModel('anthropic/claude-sonnet-4-5') === null, 'anthropic id keeps built-in loop');
assert(parseClaudeEngineModel('openai/gpt-5') === null, 'openai id keeps built-in loop');
assert(parseClaudeEngineModel('claude-codex') === null, 'claude-codex is not the engine prefix');
assert(JSON.stringify(CLAUDE_ENGINE_DEFAULT_ALLOWED_TOOLS) === JSON.stringify(['Read', 'Glob', 'Grep', 'Bash']), 'default allowlist is Read/Glob/Grep/Bash');
assert(CLAUDE_ENGINE_DEFAULT_DISALLOWED_TOOLS.includes('Bash(rm *)'), 'destructive bash denied by default');
assert(CLAUDE_ENGINE_DEFAULT_MAX_BUDGET_USD === 2, 'default budget matches REQ-116 section 2 example');
const full = buildClaudeArgs({ prompt: 'hi', allowedTools: ['Read'], disallowedTools: ['Bash(rm *)'], maxBudgetUsd: 2, resumeSessionId: 's-9' });
assert(full.includes('--disallowedTools') && full.includes('Bash(rm *)'), 'disallowlist flag carried');
assert(full.includes('--resume') && full.includes('s-9'), 'resume handle carried');

// 12. FAZ C: permission bridge — Lokma config allow/deny becomes Claude argv.
const defPerms = resolveClaudePermissions(null);
assert(JSON.stringify(defPerms.allowedTools) === JSON.stringify([...CLAUDE_ENGINE_DEFAULT_ALLOWED_TOOLS]), 'null perms keep default allowlist');
assert(defPerms.disallowedTools.includes('Bash(rm *)'), 'inviolable deny survives null perms');
const emptyPerms = resolveClaudePermissions({ allow: [], deny: [] });
assert(JSON.stringify(emptyPerms.allowedTools) === JSON.stringify([...CLAUDE_ENGINE_DEFAULT_ALLOWED_TOOLS]), 'empty perms keep default allowlist');
const wAllow = resolveClaudePermissions({ allow: ['write_file'], deny: [] });
assert(wAllow.allowedTools.includes('Edit') && wAllow.allowedTools.includes('Write'), 'write_file expands to Edit+Write');
const rAllow = resolveClaudePermissions({ allow: ['run_command'], deny: [] });
assert(rAllow.allowedTools.includes('Bash'), 'run_command expands to Bash');
const wDeny = resolveClaudePermissions({ allow: [], deny: ['write_file'] });
assert(wDeny.disallowedTools.includes('Edit') && wDeny.disallowedTools.includes('Write'), 'deny write_file denies Edit+Write');
assert(!wDeny.allowedTools.includes('Edit') && !wDeny.allowedTools.includes('Write'), 'deny wins over default allow');
const both = resolveClaudePermissions({ allow: ['run_command'], deny: ['run_command'] });
assert(both.disallowedTools.includes('Bash') && !both.allowedTools.includes('Bash'), 'deny beats allow on the same tool');
const native = resolveClaudePermissions({ allow: ['Bash(git:*)'], deny: [] });
assert(native.allowedTools.includes('Bash(git:*)'), 'Claude-native matcher passes through');
const prefix = resolveClaudePermissions({ allow: ['write'], deny: [] });
assert(prefix.allowedTools.includes('Edit') && prefix.allowedTools.includes('Write'), 'prefix allow mirrors gate prefix matching');
const dupe = resolveClaudePermissions({ allow: ['read_file', 'Read', 'read_file', '  '], deny: [] });
assert(dupe.allowedTools.filter((t) => t === 'Read').length === 1, 'allowlist deduped, blanks dropped');

// 13. FAZ C-ask-gate: pre-spawn mutation surface card helpers.
assert(JSON.stringify([...CLAUDE_MUTATION_SURFACE]) === JSON.stringify(['write_file', 'run_command']), 'mutation surface is write_file + run_command');
assert(JSON.stringify(claudeToolsForLokmaTool('write_file')) === JSON.stringify(['Edit', 'Write']), 'write_file covers Edit+Write');
assert(JSON.stringify(claudeToolsForLokmaTool('run_command')) === JSON.stringify(['Bash']), 'run_command covers Bash');
assert(claudeToolsForLokmaTool('no_such_tool').length === 0, 'unknown tool maps to empty surface');
const cardW = describeClaudeAskCard(['write_file']);
assert(cardW.includes('Edit') && cardW.includes('Write'), 'write card names Edit+Write');
const cardBoth = describeClaudeAskCard(['write_file', 'run_command']);
assert(cardBoth.includes('Bash') && cardBoth.includes('Edit'), 'combined card names Bash+Edit');
assert(describeClaudeAskCard([]).includes('mutation tools'), 'empty card falls back to generic surface');

console.log('\nclaude-print probe: ' + passed + ' passed');