/**
 * Provider namespacing in the merged model catalog (REQ-130).
 * Run: `bun src/routes/models.test.ts` from `packages/lokma-web/server`.
 * No test framework — plain asserts so the package stays dependency-free.
 *
 * Regression guard: upstream ids that already contain a slash (CommandCode
 * serves `deepseek/deepseek-v4.1-flash`, `Qwen/Qwen3.8-Max`, MiniMax ids…)
 * used to be stored WITHOUT a provider prefix. The configured default
 * `commandcode/deepseek/deepseek-v4.1-flash` therefore never appeared in the
 * catalog, and the Default-model picker rendered it as "(unavailable)" even
 * though the model answered tool calls fine.
 */
import type { CatalogModel } from '@lokma/ai';
import { MAX_BULK_KEYS, mergeLiveIds, type LiveProbeOutcome } from './models';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

function ok(viewId: string, ids: string[]): LiveProbeOutcome {
  return { viewId, status: 'ok', ids, count: ids.length, latencyMs: 1 };
}

const base: CatalogModel[] = [{ id: 'anthropic/claude-sonnet-4-5', label: 'claude-sonnet-4-5', provider: 'anthropic', enabled: true }];

// 1. A slashed upstream id still gets the provider that served it.
{
  const merged = mergeLiveIds([], [ok('commandcode', ['deepseek/deepseek-v4.1-flash'])]);
  const hit = merged.find((m) => m.id === 'commandcode/deepseek/deepseek-v4.1-flash');
  assert(hit !== undefined, 'slashed upstream id is namespaced by provider commandcode');
  assert(hit?.label === 'deepseek-v4.1-flash', 'label is the last id segment');
  assert(!merged.some((m) => m.id === 'deepseek/deepseek-v4.1-flash'), 'no bare slashed id leaks into the catalog');
}

// 2. Two providers serving the SAME upstream id no longer collide on one key.
{
  const merged = mergeLiveIds(
    [],
    [ok('commandcode', ['deepseek/deepseek-v4.1-flash']), ok('cmd', ['deepseek/deepseek-v4.1-flash'])],
  );
  assert(merged.length === 2, 'same upstream id from two providers yields two distinct entries');
  assert(
    merged.some((m) => m.id === 'commandcode/deepseek/deepseek-v4.1-flash') &&
      merged.some((m) => m.id === 'cmd/deepseek/deepseek-v4.1-flash'),
    'both provider-prefixed variants survive',
  );
}

// 3. Slash-free ids keep working (the previous behaviour).
{
  const merged = mergeLiveIds([], [ok('opencode-go', ['mimo-v2.5'])]);
  assert(merged[0].id === 'opencode-go/mimo-v2.5', 'slash-free id is prefixed as before');
}

// 4. The configured default now resolves inside the catalog (the actual bug).
{
  const configured = 'commandcode/deepseek/deepseek-v4.1-flash';
  const merged = mergeLiveIds([], [ok('commandcode', ['deepseek/deepseek-v4.1-flash', 'claude-sonnet-5', 'Qwen/Qwen3.8-Max'])]);
  assert(
    merged.some((m) => m.id === configured),
    'the default-model picker can find the configured default (no "(unavailable)" badge)',
  );
  assert(merged.some((m) => m.id === 'commandcode/Qwen/Qwen3.8-Max'), 'vendor-prefixed Qwen id is namespaced too');
}

// 5. The static base survives and live hits still win on a real id collision.
{
  const merged = mergeLiveIds(base, [ok('anthropic', ['claude-sonnet-4-5'])]);
  const hit = merged.find((m) => m.id === 'anthropic/claude-sonnet-4-5');
  assert(merged.filter((m) => m.id === 'anthropic/claude-sonnet-4-5').length === 1, 'an exact id collision stays a single entry');
  assert(hit?.enabled === true, 'live hit overwrites the static row');
}

// 6. Failed/skipped probes never touch the catalog.
{
  const outcomes: LiveProbeOutcome[] = [
    { viewId: 'commandcode', status: 'error', error: 'boom', latencyMs: 3 },
    { viewId: 'ollama', status: 'skipped', reason: 'No API key stored' },
  ];
  const merged = mergeLiveIds(base, outcomes);
  assert(merged.length === 1 && merged[0].id === 'anthropic/claude-sonnet-4-5', 'error/skipped outcomes leave the catalog untouched');
}

// 7. Bulk cap must clear a real catalog (REQ-131).
// The live catalog reached 613 ids; the old 500 cap made "Allow All" answer
// `too_many_models` and silently change nothing. The cap is a DoS guard only.
{
  assert(MAX_BULK_KEYS >= 1000, 'bulk cap clears real-world catalogs (>= 1000 ids)');
}

console.log(`\nmodels catalog probe: ${passed} checks passed`);
