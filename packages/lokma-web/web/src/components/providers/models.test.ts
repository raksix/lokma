/**
 * models.test.ts — probe for the pure Models-tab helpers.
 * Run: `bun src/components/providers/models.test.ts` (no DOM, no server).
 */
import { buildBulkMap, countEnabled, enabledModels, filterModels } from './models';
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

console.log(`models.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
