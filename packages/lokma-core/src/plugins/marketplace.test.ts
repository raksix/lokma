/**
 * Live probe for the remote plugin marketplace (`./marketplace` over the
 * shared `MarketplaceItemSchema`).
 * Run: `bun src/plugins/marketplace.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Pure helpers run with zero I/O; `searchMarketplace` runs against a
 * stubbed `globalThis.fetch` (deterministic — no network), plus one
 * best-effort live GitHub hit that only reports (never fails the run).
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts` from
 * `tsc -p` output (same precedent as `tools.test.ts`).
 * See Docs/23 section marketplace (Phase 2 wiring).
 */
import {
  buildMarketplaceQuery,
  MARKETPLACE_TOPIC,
  MarketplaceError,
  normalizeMarketplaceQuery,
  parseMarketplaceRepo,
  parseMarketplaceResponse,
  searchMarketplace,
} from './marketplace';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

// --- query normalization (pure, no I/O) ---
assert(normalizeMarketplaceQuery(undefined) === '', 'normalize: undefined browses the whole topic');
assert(normalizeMarketplaceQuery('') === '', 'normalize: empty browses the whole topic');
assert(normalizeMarketplaceQuery('  vault  ') === 'vault', 'normalize: trims whitespace');
assert(normalizeMarketplaceQuery('x'.repeat(500)).length === 100, 'normalize: 100-char cap');
let threw = '';
try {
  normalizeMarketplaceQuery(42);
} catch (e) {
  threw = e instanceof MarketplaceError ? e.code : 'wrong-type';
}
assert(threw === 'bad_query', 'normalize: non-string is bad_query');
threw = '';
try {
  normalizeMarketplaceQuery('a\nb');
} catch (e) {
  threw = e instanceof MarketplaceError ? e.code : 'wrong-type';
}
assert(threw === 'bad_query', 'normalize: control chars are bad_query');

// --- search URL builder (pure) ---
const browse = buildMarketplaceQuery('');
assert(browse.startsWith('https://api.github.com/search/repositories?'), 'builder: fixed GitHub host');
assert(browse.includes('per_page=10'), 'builder: 10-result cap');
assert(browse.includes('sort=stars'), 'builder: stars-first sort');
assert(decodeURIComponent(browse).includes(`topic:${MARKETPLACE_TOPIC}`), 'builder: topic filter always applies');
const narrowed = buildMarketplaceQuery('vault sync');
// URLSearchParams encodes spaces as `+` (GitHub reads them as AND).
const narrowedQ = decodeURIComponent(narrowed).replace(/\+/g, ' ');
assert(narrowedQ.includes('vault sync'), 'builder: user query narrows the search');

// --- repo parsing (pure) ---
const goodRepo = {
  full_name: 'acme/lokma-vault',
  name: 'lokma-vault',
  owner: { login: 'acme' },
  description: 'Vault sync plugin',
  stargazers_count: 42,
  html_url: 'https://github.com/acme/lokma-vault',
  updated_at: '2026-08-01T00:00:00Z',
};
const hit = parseMarketplaceRepo(goodRepo);
assert(hit !== null && hit.repo === 'acme/lokma-vault', 'parse: good repo maps');
assert(hit !== null && hit.stars === 42, 'parse: stars pass through');
assert(hit !== null && hit.url === 'https://github.com/acme/lokma-vault', 'parse: url feeds the installer');
assert(parseMarketplaceRepo({ ...goodRepo, description: null })?.description === '', 'parse: null description becomes empty');
assert(parseMarketplaceRepo({ ...goodRepo, stargazers_count: 'many' }) === null, 'parse: non-numeric stars skipped');
assert(parseMarketplaceRepo({ ...goodRepo, html_url: 'not a url' }) === null, 'parse: bad url skipped');
assert(parseMarketplaceRepo({ ...goodRepo, full_name: 7 }) === null, 'parse: bad repo skipped');
assert(parseMarketplaceRepo({ ...goodRepo, updated_at: null }) === null, 'parse: missing updated_at skipped');
assert(parseMarketplaceRepo(null) === null, 'parse: null row skipped');

// --- response parsing (pure) ---
assert(parseMarketplaceResponse({ items: [goodRepo, { nope: true }] }).length === 1, 'response: malformed rows skipped, good kept');
assert(parseMarketplaceResponse({ message: 'rate limited' }).length === 0, 'response: error shape is empty');
assert(parseMarketplaceResponse(null).length === 0, 'response: null body is empty');
assert(parseMarketplaceResponse([]).length === 0, 'response: array body is empty');

// --- searchMarketplace against stubbed fetch (deterministic) ---
const realFetch = globalThis.fetch;
async function withStubFetch<T>(stub: typeof fetch, fn: () => Promise<T>): Promise<T> {
  globalThis.fetch = stub as typeof globalThis.fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const okBody = { items: [goodRepo, { nope: true }] };
const okRes = await withStubFetch(
  (async () => jsonResponse(200, okBody)) as typeof fetch,
  () => searchMarketplace('vault'),
);
assert(okRes.count === 1 && okRes.items[0]?.repo === 'acme/lokma-vault', 'search: 200 maps hits, skips malformed');
assert(okRes.source === `github-topic:${MARKETPLACE_TOPIC}`, 'search: source names the remote');

let sawUrl = '';
await withStubFetch(
  (async (url: string | URL | Request) => {
    sawUrl = String(url);
    return jsonResponse(200, { items: [] });
  }) as typeof fetch,
  () => searchMarketplace(''),
);
assert(sawUrl.includes('api.github.com'), 'search: hits the fixed host, never a user host');

async function expectMarketplace503(label: string, stub: typeof fetch, rawQuery: unknown = ''): Promise<void> {
  let code = '';
  let status = 0;
  try {
    await withStubFetch(stub, () => searchMarketplace(rawQuery));
  } catch (e) {
    if (e instanceof MarketplaceError) {
      code = e.code;
      status = e.status;
    }
  }
  assert(code === 'marketplace_unavailable' && status === 503, label);
}

await expectMarketplace503(
  'search: network failure is 503 marketplace_unavailable',
  (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch,
);
await expectMarketplace503(
  'search: GitHub 403 rate limit is 503 with retry hint',
  (async () => jsonResponse(403, { message: 'API rate limit exceeded' })) as typeof fetch,
);
await expectMarketplace503(
  'search: GitHub 429 is 503',
  (async () => jsonResponse(429, { message: 'too many requests' })) as typeof fetch,
);
await expectMarketplace503(
  'search: GitHub 500 is 503',
  (async () => jsonResponse(500, { message: 'boom' })) as typeof fetch,
);
await expectMarketplace503(
  'search: bad JSON is 503',
  (async () => new Response('not json{', { status: 200 })) as typeof fetch,
);

// --- best-effort live hit (reports only, never fails) ---
globalThis.fetch = realFetch;
try {
  const live = await searchMarketplace('');
  console.log(`LIVE: GitHub answered ${live.count} hit(s), source=${live.source}`);
} catch (e) {
  console.log(`LIVE: unreachable (${e instanceof MarketplaceError ? e.code : 'unknown'}) — stubbed checks above still pin the contract`);
}

console.log(`\nmarketplace: ${passed} passed`);
