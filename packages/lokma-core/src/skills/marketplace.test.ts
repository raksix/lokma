/**
 * Live probe for the skill marketplace + installer (`./marketplace`).
 * Run: `bun src/skills/marketplace.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Pure helpers + URL validation run with zero I/O; `searchSkillMarketplace`
 * runs against a stubbed `globalThis.fetch` (deterministic — no network),
 * plus one best-effort live GitHub hit that only reports (never fails).
 * `installSkillFromUrl` validation errors throw before any clone attempt —
 * no network, no disk writes on the failure paths below.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts` from
 * `tsc -p` output (same precedent as `marketplace.test.ts`).
 * See Docs/27 section install (REQ-028 skill market).
 */
import { MarketplaceError } from '../plugins/marketplace.js';
import { SkillError } from './registry.js';
import {
  buildSkillMarketQuery,
  installSkillFromUrl,
  searchSkillMarketplace,
  SKILL_MARKETPLACE_TOPIC,
  slugFromSkillUrl,
} from './marketplace.js';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

// --- search URL builder (pure) ---
const browse = buildSkillMarketQuery('');
assert(browse.startsWith('https://api.github.com/search/repositories?'), 'builder: fixed GitHub host');
assert(browse.includes('per_page=10'), 'builder: 10-result cap');
assert(browse.includes('sort=stars'), 'builder: stars-first sort');
assert(decodeURIComponent(browse).includes(`topic:${SKILL_MARKETPLACE_TOPIC}`), 'builder: skill topic filter always applies');
assert(!decodeURIComponent(browse).includes('topic:lokma-plugin'), 'builder: plugin topic never leaks in');
const narrowed = buildSkillMarketQuery('review helper');
const narrowedQ = decodeURIComponent(narrowed).replace(/\+/g, ' ');
assert(narrowedQ.includes('review helper'), 'builder: user query narrows the search');

// --- slug derivation + URL validation (pure, no clone) ---
assert(slugFromSkillUrl('https://github.com/acme/lokma-skill-review.git') === 'lokma-skill-review', 'slug: strips .git');
assert(slugFromSkillUrl('https://github.com/acme/Hello_World/') === 'hello-world', 'slug: lowercases + trailing slash');
assert(slugFromSkillUrl('https://github.com/acme/lokma-skill-hello.zip') === 'lokma-skill-hello', 'slug: strips archive suffix');

async function expectSkillError(label: string, url: unknown, code: string, status: number): Promise<void> {
  let gotCode = '';
  let gotStatus = 0;
  try {
    await installSkillFromUrl(url);
  } catch (e) {
    if (e instanceof SkillError) {
      gotCode = e.code;
      gotStatus = e.status;
    }
  }
  assert(gotCode === code && gotStatus === status, `${label} (got ${gotCode}/${gotStatus})`);
}

await expectSkillError('install: empty url is bad_url/400', '', 'bad_url', 400);
await expectSkillError('install: non-string url is bad_url/400', 42, 'bad_url', 400);
await expectSkillError('install: http is rejected', 'http://github.com/acme/x', 'bad_url', 400);
await expectSkillError('install: credentials rejected', 'https://user:pass@github.com/acme/x', 'bad_url', 400);
await expectSkillError('install: localhost rejected', 'https://localhost/acme/x', 'bad_url', 400);
await expectSkillError('install: 127.x rejected', 'https://127.0.0.1/acme/x', 'bad_url', 400);
await expectSkillError('install: 10/8 rejected', 'https://10.0.0.5/acme/x', 'bad_url', 400);
await expectSkillError('install: 192.168 rejected', 'https://192.168.1.9/acme/x', 'bad_url', 400);
await expectSkillError('install: 172.16 rejected', 'https://172.16.0.2/acme/x', 'bad_url', 400);
await expectSkillError('install: bare host has no slug', 'https://github.com/', 'bad_url', 400);
await expectSkillError('install: overlong url is bad_url/400', `https://github.com/acme/${'x'.repeat(600)}`, 'bad_url', 400);

// --- searchSkillMarketplace against stubbed fetch (deterministic) ---
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

const goodRepo = {
  full_name: 'acme/lokma-skill-review',
  name: 'lokma-skill-review',
  owner: { login: 'acme' },
  description: 'Code review skill',
  stargazers_count: 7,
  html_url: 'https://github.com/acme/lokma-skill-review',
  updated_at: '2026-08-01T00:00:00Z',
};

const okRes = await withStubFetch(
  (async () => jsonResponse(200, { items: [goodRepo, { nope: true }] })) as typeof fetch,
  () => searchSkillMarketplace('review'),
);
assert(okRes.count === 1 && okRes.items[0]?.repo === 'acme/lokma-skill-review', 'search: 200 maps hits, skips malformed');
assert(okRes.source === `github-topic:${SKILL_MARKETPLACE_TOPIC}`, 'search: source names the skill remote');

let sawUrl = '';
await withStubFetch(
  (async (url: string | URL | Request) => {
    sawUrl = String(url);
    return jsonResponse(200, { items: [] });
  }) as typeof fetch,
  () => searchSkillMarketplace(''),
);
assert(sawUrl.includes('api.github.com'), 'search: hits the fixed host, never a user host');
assert(decodeURIComponent(sawUrl).includes(`topic:${SKILL_MARKETPLACE_TOPIC}`), 'search: request carries the skill topic');

async function expectMarketplace503(label: string, stub: typeof fetch): Promise<void> {
  let code = '';
  let status = 0;
  try {
    await withStubFetch(stub, () => searchSkillMarketplace(''));
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
  const live = await searchSkillMarketplace('');
  console.log(`LIVE: GitHub answered ${live.count} hit(s), source=${live.source}`);
} catch (e) {
  console.log(`LIVE: unreachable (${e instanceof MarketplaceError ? e.code : 'unknown'}) — stubbed checks above still pin the contract`);
}

console.log(`\nskill marketplace: ${passed} passed`);
