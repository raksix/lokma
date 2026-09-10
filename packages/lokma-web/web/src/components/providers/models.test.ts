/**
 * models.test.ts — probe for the pure Models-tab helpers.
 * Run: `bun src/components/providers/models.test.ts` (no DOM, no server).
 */
import { buildBulkMap, countEnabled, enabledModels, filterModels, modelIdMatches, normalizeModelId, resolveDefaultModel } from './models';
import type { ModelInfo } from '@/lib/api';

const catalog: ModelInfo[] = [
  { id: 'anthropic/claude-sonnet', label: 'Claude Sonnet', provider: 'anthropic', enabled: true },
  { id: 'anthropic/claude-opus', label: 'Claude Opus', provider: 'anthropic', enabled: false },
  { id: 'openai/gpt-4o', label: 'GPT-4o', provider: 'openai', enabled: true },
];

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

// filterModels
check('empty query returns all', filterModels(catalog, '').length === 3);
check('matches by id fragment', filterModels(catalog, 'sonnet').length === 1);
check('matches by provider', filterModels(catalog, 'anthropic').length === 2);
check('case-insensitive', filterModels(catalog, 'GPT-4O').length === 1);
check('no match is empty', filterModels(catalog, 'llama').length === 0);
check('trims whitespace', filterModels(catalog, '  opus  ').length === 1);

// countEnabled
check('counts enabled', countEnabled(catalog) === 2);
check('empty catalog is zero', countEnabled([]) === 0);

// buildBulkMap (Allow All / Disable All → one PATCH)
const allowAll = buildBulkMap(catalog, true);
check('allow-all flags every id', Object.keys(allowAll).length === 3 && Object.values(allowAll).every((v) => v === true));
const disableAll = buildBulkMap(catalog, false);
check('disable-all flags every id', Object.keys(disableAll).length === 3 && Object.values(disableAll).every((v) => v === false));
check('empty catalog builds empty map', Object.keys(buildBulkMap([], true)).length === 0);

// enabledModels (single source for pickers)
const visible = enabledModels(catalog);
check('pickers see only enabled', visible.length === 2 && visible.every((m) => m.enabled));
check('disabled model hidden from pickers', !visible.some((m) => m.id === 'anthropic/claude-opus'));

// normalizeModelId + modelIdMatches (REQ-104 legacy separator tolerance)
check('trims ids', normalizeModelId('  a/b  ') === 'a/b');
check('non-string is empty', normalizeModelId(null) === '' && normalizeModelId(42) === '');
check('exact ids match', modelIdMatches('a/b', 'a/b') === true);
check('legacy double-colon matches slash', modelIdMatches('anthropic::x', 'anthropic/x') === true);
check('different ids do not match', modelIdMatches('a/b', 'a/c') === false);

// resolveDefaultModel — smart chain (REQ-104)
const chain = { models: catalog };
check(
  'configured enabled model wins',
  resolveDefaultModel({ ...chain, configured: 'openai/gpt-4o', usageTop: 'anthropic/claude-sonnet' }).model === 'openai/gpt-4o',
);
check(
  'configured source is labeled',
  resolveDefaultModel({ ...chain, configured: 'openai/gpt-4o', usageTop: 'anthropic/claude-sonnet' }).source === 'configured',
);
check(
  'legacy configured id resolves to canonical',
  resolveDefaultModel({ ...chain, configured: 'openai::gpt-4o', usageTop: null }).model === 'openai/gpt-4o',
);
check(
  'disabled configured falls through to most-used',
  resolveDefaultModel({ ...chain, configured: 'anthropic/claude-opus', usageTop: 'anthropic/claude-sonnet' }).model ===
    'anthropic/claude-sonnet',
);
check(
  'most-used source is labeled',
  resolveDefaultModel({ ...chain, configured: '', usageTop: 'anthropic/claude-sonnet' }).source === 'most-used',
);
check(
  'unknown configured falls through to most-used',
  resolveDefaultModel({ ...chain, configured: 'gone/model', usageTop: 'openai/gpt-4o' }).model === 'openai/gpt-4o',
);
check(
  'no configured and no usage takes first enabled',
  resolveDefaultModel({ ...chain, configured: '', usageTop: null }).model === 'anthropic/claude-sonnet',
);
check(
  'first-enabled source is labeled',
  resolveDefaultModel({ ...chain, configured: '  ', usageTop: '' }).source === 'first-enabled',
);
check(
  'disabled usage-top is skipped for first enabled',
  resolveDefaultModel({ ...chain, configured: '', usageTop: 'anthropic/claude-opus' }).model === 'anthropic/claude-sonnet',
);
check(
  'empty catalog keeps configured raw',
  resolveDefaultModel({ models: [], configured: 'custom/model', usageTop: null }).model === 'custom/model',
);
check(
  'empty catalog without configured uses usage top',
  resolveDefaultModel({ models: [], configured: '', usageTop: 'u/model' }).model === 'u/model',
);
check(
  'empty catalog without anything uses fallback',
  resolveDefaultModel({ models: [], configured: '', usageTop: null }).model === 'anthropic/claude-sonnet-4-5',
);
check(
  'fallback source is labeled',
  resolveDefaultModel({ models: [], configured: '', usageTop: null }).source === 'fallback',
);
check(
  'custom fallback wins when catalog empty',
  resolveDefaultModel({ models: [], configured: '', usageTop: null, fallback: 'x/y' }).model === 'x/y',
);

console.log(`models.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
