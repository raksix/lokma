/**
 * settings.test.ts — probe for the pure Settings-tab helpers.
 * Run: `bun src/components/settings/settings.test.ts` (no DOM, no server).
 */
import {
  buildHooksPatch,
  buildMcpPatch,
  buildPermissionsPatch,
  flattenHooks,
  isMcpTransport,
  isPermissionMode,
  isServerTheme,
  isValidMcpName,
  isValidRule,
  normalizeConfig,
  normalizeMcpEntry,
  normalizeMcpServers,
  serverThemeToMode,
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
    agents: { maxAgents: 20, maxConcurrent: 5, maxQueue: 20 },
  },
  credentials: { anthropic: { keySet: true, last4: 'abcd' } },
});
check('reads defaultModel', cfg.defaultModel === 'anthropic::x');
check('reads theme', cfg.theme === 'omp');
check('reads allow rules', cfg.permissions.allow.length === 1);
check('reads defaultMode', cfg.permissions.defaultMode === 'plan');
check('reads mcp servers', cfg.mcpServers.length === 1 && cfg.mcpServers[0].name === 'fs');
check('reads caps', cfg.maxAgents === 20 && cfg.maxQueue === 20);
check('reads credentials', cfg.credentials.anthropic.keySet === true);
const empty = normalizeConfig(null);
check('null payload keeps defaults', empty.defaultModel === '' && empty.theme === null && empty.permissions.defaultMode === 'auto');
check('null payload has no servers', empty.mcpServers.length === 0);

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

console.log(`settings.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
