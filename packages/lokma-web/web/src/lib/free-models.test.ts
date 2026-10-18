/**
 * Unit probe for the REQ-205 free catalog (`./free-models`).
 * Run: `bun src/lib/free-models.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain asserts so `tsc -b` stays dependency-free.
 * Not imported by app code, so the Vite bundle ignores it.
 */
import {
  FREE_CATALOG_KEY,
  FREE_CATALOG_TTL_MS,
  fetchFreeCatalog,
  isFreeId,
  loadFreeCatalog,
  modelsUrl,
  normalizeFreeCatalog,
  type FreeCatalogStorage,
  type FreeModel,
} from './free-models';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

/** Real-shaped fixture: the measured alias families + standalone pool ids. */
const FIXTURE = {
  object: 'list',
  data: [
    // zen family — same model under 3 names (measured: identical upstream errors).
    { id: 'oc/mimo-v2.5-free', context_length: 1048576, capabilities: { vision: true, tool_calling: true, reasoning: true } },
    { id: 'opencode/mimo-v2.5-free', context_length: 1048576, capabilities: { vision: true, tool_calling: true, reasoning: true } },
    { id: 'opencode-zen/mimo-v2.5-free', context_length: 1048576, capabilities: { vision: true, tool_calling: true, reasoning: true } },
    // code family — cmd/ ≡ command-code/.
    { id: 'cmd/stealth/glyph-cluster:free', context_length: 256000, capabilities: { tool_calling: true, reasoning: true } },
    { id: 'command-code/stealth/glyph-cluster:free', context_length: 256000, capabilities: { tool_calling: true, reasoning: true } },
    // veo family.
    { id: 'veo-free/veo', capabilities: { tool_calling: false, reasoning: false } },
    { id: 'veoaifree-web/veo', capabilities: { tool_calling: false, reasoning: false } },
    // standalone routers + oddballs.
    { id: 'free-opencode' },
    { id: 'auto/best-free', context_length: 1048576, capabilities: { reasoning: true, thinking: true } },
    { id: 'cmd-free' },
    // same base, DIFFERENT family → must stay two entries (different routes).
    { id: 'cmd/laguna-s-2.1-free', context_length: 200000, capabilities: { reasoning: true } },
    { id: 'opencode-zen/laguna-s-2.1-free', context_length: 200000, capabilities: { reasoning: true } },
    // non-free — must be excluded.
    { id: 'anthropic/claude-opus-5', capabilities: { reasoning: true } },
    { id: 'deepseek/deepseek-v4.1-flash', capabilities: { reasoning: true } },
  ],
};

// 1. Free-id filter.
assert(isFreeId('free-opencode'), 'isFreeId: free-opencode');
assert(isFreeId('auto/best-free'), 'isFreeId: auto/best-free');
assert(isFreeId('auto/coding:free'), 'isFreeId: auto/coding:free');
assert(isFreeId('opencode-zen/deepseek-v4-flash-free'), 'isFreeId: -free suffix');
assert(isFreeId('cmd/stealth/glyph-cluster:free'), 'isFreeId: :free suffix');
assert(isFreeId('FREE-MODEL-X'), 'isFreeId: case-insensitive');
assert(!isFreeId('anthropic/claude-opus-5'), 'isFreeId: non-free excluded');
assert(!isFreeId('deepseek/deepseek-v4.1-flash'), 'isFreeId: plain model excluded');

// 2. Normalizer — dedupe + canonical pick + ordering.
const models = normalizeFreeCatalog(FIXTURE);
const byId = new Map(models.map((m) => [m.id, m]));
assert(models.length === 8, 'normalize: 12 free rows collapse to 8 canonical models (' + models.length + ')');
assert(models[0].id === 'auto/best-free', 'normalize: deterministic alphabetical order');

const mimo = byId.get('opencode-zen/mimo-v2.5-free') as FreeModel;
assert(Boolean(mimo), 'zen family: explicit prefix wins as canonical');
assert(
  mimo.aliases.join(',') === 'opencode/mimo-v2.5-free,oc/mimo-v2.5-free',
  'zen family: aliases carry the other names in canonical-preference order (got ' + mimo.aliases.join(',') + ')',
);
assert(mimo.vision === true && mimo.reasoning === true, 'zen family: capabilities mapped');
assert(mimo.contextLength === 1048576, 'zen family: context length mapped');

const glyph = byId.get('command-code/stealth/glyph-cluster:free') as FreeModel;
assert(Boolean(glyph), 'code family: command-code/ wins over cmd/');
assert(glyph.aliases.join(',') === 'cmd/stealth/glyph-cluster:free', 'code family: cmd/ alias recorded');

const veo = byId.get('veo-free/veo') as FreeModel;
assert(Boolean(veo), 'veo family: veo-free/ wins over veoaifree-web/');
assert(veo.aliases.join(',') === 'veoaifree-web/veo', 'veo family: web alias recorded');
assert(veo.reasoning === false && veo.vision === false, 'veo family: non-reasoning capabilities kept honest');

const laguna = models.filter((m) => m.id.indexOf('laguna-s-2.1-free') >= 0);
assert(laguna.length === 2, 'cross-family same base stays two entries (different routes)');
assert(Boolean(byId.get('free-opencode')) && Boolean(byId.get('cmd-free')), 'standalone routers kept');
assert(byId.get('free-opencode')?.contextLength === null, 'missing fields stay null, never invented');
assert(!byId.has('anthropic/claude-opus-5'), 'non-free id never listed');
assert((byId.get('auto/best-free') as FreeModel).reasoning === true, 'thinking:true counts as reasoning');

// 3. Malformed payloads degrade to an empty list (callers treat empty as failure).
assert(normalizeFreeCatalog(null).length === 0, 'malformed: null');
assert(normalizeFreeCatalog({ data: 'nope' }).length === 0, 'malformed: non-array data');
assert(normalizeFreeCatalog({ data: [{ id: 5 }, { nope: 1 }, null] }).length === 0, 'malformed: bad rows skipped');
assert(normalizeFreeCatalog({ models: [{ id: 'x-free' }] }).length === 1, 'defensive: {models:[]} shape accepted');

// 4. Duplicate ids inside one bucket collapse to a single member.
assert(
  normalizeFreeCatalog({ data: [{ id: 'oc/dup-free' }, { id: 'oc/dup-free' }] })[0].aliases.length === 0,
  'duplicate id rows do not duplicate aliases',
);

// 5. URL helper.
assert(modelsUrl('https://x.test/v1/') === 'https://x.test/v1/models', 'modelsUrl strips trailing slash');
assert(modelsUrl(' https://x.test/v1 ') === 'https://x.test/v1/models', 'modelsUrl trims whitespace');

// 6. Cache + fetch behaviour with stubs.
function makeStorage(initial?: string) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set(FREE_CATALOG_KEY, initial);
  const state = { writes: 0 };
  const storage: FreeCatalogStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
      state.writes += 1;
    },
  };
  return { storage, store, state };
}

function makeFetch(payload: unknown, status = 200) {
  const state = { calls: 0 };
  const fetchFn = (async () => {
    state.calls += 1;
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchFn, state };
}

const throwingFetch = (async () => {
  throw new Error('boom');
}) as unknown as typeof fetch;

const CACHED_MODEL: FreeModel = { id: 'free-opencode', label: 'free-opencode', aliases: [], contextLength: null, reasoning: false, vision: false };

// 6a. Fresh cache answers without any network call.
{
  const fresh = JSON.stringify({ fetchedAt: Date.now() - (FREE_CATALOG_TTL_MS - 5000), models: [CACHED_MODEL] });
  const { storage } = makeStorage(fresh);
  const { fetchFn, state } = makeFetch(FIXTURE);
  const res = await loadFreeCatalog({ storage, fetchFn });
  assert(res.ok && res.cached === true, 'cache: fresh TTL entry answers cached');
  assert(state.calls === 0, 'cache: fresh entry performs no fetch');
}

// 6b. Stale cache refetches and rewrites the cache.
{
  const stale = JSON.stringify({ fetchedAt: Date.now() - (FREE_CATALOG_TTL_MS + 5000), models: [CACHED_MODEL] });
  const { storage, store, state } = makeStorage(stale);
  const { fetchFn, state: net } = makeFetch(FIXTURE);
  const res = await loadFreeCatalog({ storage, fetchFn });
  assert(res.ok && res.cached === false, 'cache: stale entry refetches');
  assert(net.calls === 1, 'cache: exactly one refetch');
  assert(state.writes === 1, 'cache: refetched catalog written back');
  const written = JSON.parse(store.get(FREE_CATALOG_KEY) as string) as { fetchedAt: number; models: FreeModel[] };
  assert(written.models.length === 8, 'cache: written catalog holds the normalized models');
  assert(Date.now() - written.fetchedAt < FREE_CATALOG_TTL_MS, 'cache: written fetchedAt is fresh');
}

// 6c. NEGATIVE CONTROL — failed refetch with a stale cache answers an error,
//     never the stale list as if fresh, and leaves the old cache untouched.
{
  const staleModels = JSON.stringify({ fetchedAt: Date.now() - (FREE_CATALOG_TTL_MS + 5000), models: [CACHED_MODEL] });
  const { storage, store, state } = makeStorage(staleModels);
  const res = await loadFreeCatalog({ storage, fetchFn: throwingFetch });
  assert(!res.ok, 'honesty: broken endpoint answers ok:false');
  assert(!res.ok && res.error.indexOf('unavailable') >= 0, 'honesty: error names the catalog failure');
  assert(state.writes === 0, 'honesty: stale cache is not rewritten');
  assert(store.get(FREE_CATALOG_KEY) === staleModels, 'honesty: stale cache bytes untouched (not served as fresh)');
}

// 6d. force bypasses a fresh cache.
{
  const fresh = JSON.stringify({ fetchedAt: Date.now(), models: [CACHED_MODEL] });
  const { storage } = makeStorage(fresh);
  const { fetchFn, state } = makeFetch(FIXTURE);
  const res = await loadFreeCatalog({ storage, fetchFn, force: true });
  assert(res.ok && state.calls === 1, 'force: bypasses the fresh cache (1 fetch)');
}

// 6e. HTTP failure and empty payload are errors, not empty catalogs.
{
  const { fetchFn } = makeFetch({ error: 'nope' }, 502);
  const res = await fetchFreeCatalog('https://x.test/v1', fetchFn);
  assert(!res.ok && res.error.indexOf('HTTP 502') >= 0, 'fetch: HTTP 502 surfaces as an error');
}
{
  const { fetchFn } = makeFetch({ data: [] });
  const res = await fetchFreeCatalog('https://x.test/v1', fetchFn);
  assert(!res.ok, 'fetch: a catalog with zero free models is a failure, not an empty picker');
}
{
  const res = await fetchFreeCatalog('https://x.test/v1', throwingFetch);
  assert(!res.ok && res.error.indexOf('boom') >= 0, 'fetch: network rejection surfaces its message');
}

console.log('\n' + passed + ' assertions passed');
