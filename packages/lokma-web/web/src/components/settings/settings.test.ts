/**
 * settings.test.ts — probe for the pure Settings-tab helpers.
 * Run: `bun src/components/settings/settings.test.ts` (no DOM, no server).
 */
import {
  buildAgentsPatch,
  buildHooksPatch,
  buildMcpPatch,
  buildPermissionsPatch,
  buildSessionsPatch,
  flattenHooks,
  isMcpTransport,
  isPermissionMode,
  isServerTheme,
  isValidAgentDefaultModel,
  isValidMcpName,
  isValidRule,
  isValidSessionDefaultCwd,
  normalizeConfig,
  normalizeMcpEntry,
  normalizeMcpServers,
  serverThemeToMode,
  summarizeDoctor,
  themeCardFromView,
  validateAgentsCaps,
  validateAgentsBudgets,
  validateMcpForm,
  THEME_CARDS,
} from './settings';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${name}`);
  }
}

// Theme mapping (concept Appearance tab: claude/paper light, omp/midnight dark)
check('four theme cards', THEME_CARDS.length === 4);
check('claude is light', serverThemeToMode('claude') === 'light');
check('paper is light', serverThemeToMode('paper') === 'light');
check('omp is dark', serverThemeToMode('omp') === 'dark');
check('midnight is dark', serverThemeToMode('midnight') === 'dark');
check('unknown theme falls back to light', serverThemeToMode('neon') === 'light');
check('isServerTheme accepts omp', isServerTheme('omp'));
check('isServerTheme rejects neon', !isServerTheme('neon'));

// themeCardFromView maps a live server view onto a render card.
const midnightCard = themeCardFromView({
  id: 'midnight',
  name: 'Midnight',
  description: 'Deep navy #0f172a + cyan #06b6d4 + slate — IDE dark, calm',
  mode: 'dark',
  cssVars: { background: '222 47% 11%' },
  chalk: { primary: '#06b6d4', background: '#0f172a' },
  preview: { bg: '#0f172a', accent: '#06b6d4' },
});
check('card keeps server description (navy+cyan)', midnightCard.desc.includes('navy'));
check('card keeps server preview swatches', midnightCard.bg === '#0f172a' && midnightCard.accent === '#06b6d4');
check('card keeps dark mode', midnightCard.mode === 'dark');
check('card carries cssVars for apply', midnightCard.cssVars.background === '222 47% 11%');
check('unknown mode falls back to light', themeCardFromView({ id: 'x', name: 'X', description: 'd', mode: 'neon', cssVars: {}, chalk: {}, preview: { bg: '', accent: '' } }).mode === 'light');
check('isPermissionMode accepts plan', isPermissionMode('plan'));
check('isPermissionMode rejects yes', !isPermissionMode('yes'));
check('isMcpTransport accepts ws', isMcpTransport('ws'));
check('isMcpTransport rejects grpc', !isMcpTransport('grpc'));

// Rule + name validation
check('accepts bash pattern', isValidRule('Bash: npm *'));
check('rejects empty', !isValidRule('  '));
check('rejects overlong', !isValidRule('x'.repeat(201)));
check('rejects non-string', !isValidRule(null));
check('accepts mcp slug', isValidMcpName('vault'));
check('rejects uppercase slug', !isValidMcpName('Vault'));
check('rejects single char', !isValidMcpName('v'));

// MCP form validation (mirrors the server McpServerSchema)
check('valid stdio form', Object.keys(validateMcpForm({ name: 'fs', transport: 'stdio', command: 'npx x', url: '' })).length === 0);
check('valid ws form', Object.keys(validateMcpForm({ name: 'br', transport: 'ws', command: '', url: 'ws://localhost:9222' })).length === 0);
const badMcp = validateMcpForm({ name: 'BAD', transport: 'grpc', command: '', url: '' });
check('bad form flags name', typeof badMcp.name === 'string');
check('bad form flags transport', typeof badMcp.transport === 'string');
check('stdio without command flagged', typeof validateMcpForm({ name: 'fs', transport: 'stdio', command: '  ', url: '' }).command === 'string');
check('ws without url flagged', typeof validateMcpForm({ name: 'br', transport: 'ws', command: '', url: 'nope' }).url === 'string');

// normalizeMcpEntry (tolerant reads, never crashes)
const stdio = normalizeMcpEntry('fs', { transport: 'stdio', command: 'npx x', enabled: false });
check('keeps transport', stdio.transport === 'stdio');
check('keeps disabled', stdio.enabled === false);
const odd = normalizeMcpEntry('odd', { transport: 'grpc', enabled: 'yes' });
check('unknown transport falls back to stdio', odd.transport === 'stdio');
check('non-boolean enabled falls back to true', odd.enabled === true);
check('non-object entry normalizes', normalizeMcpEntry('x', null).command === '');
check('servers list keeps names', normalizeMcpServers({ a: {}, b: { transport: 'ws', url: 'ws://h' } }).map((s) => s.name).join(',') === 'a,b');
check('non-object servers map is empty', normalizeMcpServers(null).length === 0);

// Hooks flatten/build roundtrip
const rows = flattenHooks({ PostToolUse: [{ matcher: 'Edit|Write', command: 'bun run lint' }], PreToolUse: 'nope' });
check('flattens one hook row', rows.length === 1 && rows[0].event === 'PostToolUse' && rows[0].command === 'bun run lint');
check('legacy cmd key read', flattenHooks({ E: [{ matcher: 'Bash', cmd: 'echo hi' }] })[0].command === 'echo hi');
check('non-object hooks is empty', flattenHooks(null).length === 0);
const rebuilt = buildHooksPatch([{ event: 'PostToolUse', matcher: 'Edit', command: 'lint' }, { event: '  ', matcher: 'x', command: 'y' }]);
check('rebuild keeps event', Array.isArray(rebuilt.PostToolUse) && rebuilt.PostToolUse[0].matcher === 'Edit');
check('blank events dropped', !('  ' in rebuilt));

// normalizeConfig (tolerant GET /api/config reads)
const cfg = normalizeConfig({
  config: {
    defaultModel: 'anthropic::x',
    theme: 'omp',
    permissions: { allow: ['Bash: npm *'], deny: [], defaultMode: 'plan' },
    mcp: { servers: { fs: { transport: 'stdio', command: 'npx x' } } },
    hooks: {},
    agents: { maxAgents: 20, maxConcurrent: 5, maxQueue: 20, budgets: { tokens: 500000, usd: 10 } },
  },
  credentials: { anthropic: { keySet: true, last4: 'abcd' } },
});
check('reads defaultModel', cfg.defaultModel === 'anthropic::x');
check('reads theme', cfg.theme === 'omp');
check('reads allow rules', cfg.permissions.allow.length === 1);
check('reads defaultMode', cfg.permissions.defaultMode === 'plan');
check('reads mcp servers', cfg.mcpServers.length === 1 && cfg.mcpServers[0].name === 'fs');
check('reads caps', cfg.maxAgents === 20 && cfg.maxQueue === 20);
check('reads agent budgets', cfg.agentBudgets.tokens === 500000 && cfg.agentBudgets.usd === 10);
check('reads credentials', cfg.credentials.anthropic.keySet === true);
const empty = normalizeConfig(null);
check('null payload keeps defaults', empty.defaultModel === '' && empty.theme === null && empty.permissions.defaultMode === 'auto');
check('null payload has no servers', empty.mcpServers.length === 0);
check('null payload has null budgets', empty.agentBudgets.tokens === null && empty.agentBudgets.usd === null);

// PATCH builders (full objects — saveGlobal shallow-merges)
const permPatch = buildPermissionsPatch(['a'], ['b'], 'manual') as { permissions: { allow: string[]; deny: string[]; defaultMode: string } };
check('permissions patch keeps all three keys', permPatch.permissions.allow[0] === 'a' && permPatch.permissions.deny[0] === 'b' && permPatch.permissions.defaultMode === 'manual');
const mcpPatch = buildMcpPatch([
  { name: 'fs', transport: 'stdio', command: 'npx x', url: '', enabled: true },
  { name: 'br', transport: 'ws', command: '', url: 'ws://h:9222', enabled: false },
]) as { mcp: { servers: Record<string, { transport: string; command?: string; url?: string; enabled: boolean }> } };
check('stdio entry keeps command, drops url', mcpPatch.mcp.servers.fs.command === 'npx x' && mcpPatch.mcp.servers.fs.url === undefined);
check('ws entry keeps url, drops command', mcpPatch.mcp.servers.br.url === 'ws://h:9222' && mcpPatch.mcp.servers.br.command === undefined);
check('disabled flag survives', mcpPatch.mcp.servers.br.enabled === false);

// summarizeDoctor (REQ-009 doctor strip — structural input, DoctorCheckView assignable)
const allOk = summarizeDoctor([
  { name: 'provider', ok: true },
  { name: 'browser', ok: true },
]);
check('all pass counts 2/2', allOk.passed === 2 && allOk.total === 2);
check('all pass has no failing names', allOk.failing.length === 0);
const mixed = summarizeDoctor([
  { name: 'provider', ok: true, latencyMs: 12, detail: 'key set' },
  { name: 'browser', ok: false, latencyMs: 3, detail: 'no chromium' },
  { name: 'vault', ok: false, latencyMs: 0, detail: 'unreachable' },
]);
check('mixed counts 1/3', mixed.passed === 1 && mixed.total === 3);
check('mixed names the failing probes', mixed.failing.join(',') === 'browser,vault');
const none = summarizeDoctor([]);
check('empty list is 0/0 with no failing', none.passed === 0 && none.total === 0 && none.failing.length === 0);

// validateAgentsCaps + buildAgentsPatch (REQ-009 caps card — mirror AgentsConfigSchema)
check('valid caps pass', Object.keys(validateAgentsCaps({ maxAgents: '20', maxConcurrent: 5, maxQueue: '20' })).length === 0);
check('zero agents flagged', typeof validateAgentsCaps({ maxAgents: '0', maxConcurrent: '5', maxQueue: '20' }).maxAgents === 'string');
check('concurrent over 20 flagged', typeof validateAgentsCaps({ maxAgents: '20', maxConcurrent: '21', maxQueue: '20' }).maxConcurrent === 'string');
check('fractional queue flagged', typeof validateAgentsCaps({ maxAgents: '20', maxConcurrent: '5', maxQueue: '2.5' }).maxQueue === 'string');
check('blank queue flagged', typeof validateAgentsCaps({ maxAgents: '20', maxConcurrent: '5', maxQueue: '' }).maxQueue === 'string');
const agentsPatch = buildAgentsPatch(20, 5, 20, 'anthropic/claude-4-sonnet', 500000, 10) as { agents: { maxAgents: number; maxConcurrent: number; maxQueue: number; defaultModel: string; budgets: { tokens: number; usd: number } } };
check('caps patch keeps all three caps', agentsPatch.agents.maxAgents === 20 && agentsPatch.agents.maxConcurrent === 5 && agentsPatch.agents.maxQueue === 20);
check('caps patch carries defaultModel (no shallow-merge wipe)', agentsPatch.agents.defaultModel === 'anthropic/claude-4-sonnet');
check('caps patch carries budgets (no shallow-merge wipe)', agentsPatch.agents.budgets.tokens === 500000 && agentsPatch.agents.budgets.usd === 10);

// isValidAgentDefaultModel (REQ-009 session-defaults piece — agents.defaultModel editable)
check('non-empty model id passes', isValidAgentDefaultModel('anthropic/claude-4-sonnet') === true);
check('empty string fails', isValidAgentDefaultModel('') === false);
check('whitespace-only fails', isValidAgentDefaultModel('   ') === false);
check('non-string fails', isValidAgentDefaultModel(null) === false);
check('overlong model id fails', isValidAgentDefaultModel(`x:${'a'.repeat(200)}`) === false);

// validateAgentsBudgets (REQ-009 budgets piece — agents.budgets.tokens/usd editable)
check('valid budgets pass', Object.keys(validateAgentsBudgets({ tokens: '500000', usd: '10' })).length === 0);
check('numeric budgets pass', Object.keys(validateAgentsBudgets({ tokens: 500000, usd: 10 })).length === 0);
check('zero usd passes (free cap)', Object.keys(validateAgentsBudgets({ tokens: '1000', usd: '0' })).length === 0);
check('fractional tokens flagged', typeof validateAgentsBudgets({ tokens: '2.5', usd: '10' }).tokens === 'string');
check('blank tokens flagged', typeof validateAgentsBudgets({ tokens: '', usd: '10' }).tokens === 'string');
check('negative usd flagged', typeof validateAgentsBudgets({ tokens: '500000', usd: '-1' }).usd === 'string');
check('non-numeric usd flagged', typeof validateAgentsBudgets({ tokens: '500000', usd: 'abc' }).usd === 'string');

// isValidSessionDefaultCwd + buildSessionsPatch (REQ-009 session-cwd piece — sessions.defaultCwd editable)
check('empty cwd means server default', isValidSessionDefaultCwd('') === true);
check('posix absolute passes', isValidSessionDefaultCwd('/mnt/apopic/lokma') === true);
check('home-relative passes', isValidSessionDefaultCwd('~/work') === true);
check('relative path fails', isValidSessionDefaultCwd('rel/path') === false);
check('bare name fails', isValidSessionDefaultCwd('lokma') === false);
check('non-string fails', isValidSessionDefaultCwd(null) === false);
check('overlong cwd fails', isValidSessionDefaultCwd(`/${'a'.repeat(500)}`) === false);
const sessionsPatch = buildSessionsPatch('/mnt/apopic/lokma') as { sessions: { defaultCwd: string } };
check('sessions patch carries defaultCwd', sessionsPatch.sessions.defaultCwd === '/mnt/apopic/lokma');
check('sessions payload reads back', normalizeConfig({ config: { sessions: { defaultCwd: '/tmp/x' } } }).sessionDefaultCwd === '/tmp/x');
check('missing sessions reads empty', normalizeConfig(null).sessionDefaultCwd === '');

console.log(`settings.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
