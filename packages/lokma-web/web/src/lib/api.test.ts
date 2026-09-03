/**
 * 401-path probe for the F1 API client (`./api`).
 * Run: `bun src/lib/api.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain asserts so `tsc -b` stays dependency-free.
 * Not imported by app code, so the Vite bundle ignores it.
 */
import { ApiError, fetchJson } from './api';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

// Minimal browser stub: location capture for the login redirect.
const fakeLocation = { pathname: '/', href: '/' };
(globalThis as unknown as Record<string, unknown>).window = { location: fakeLocation };

const realFetch = globalThis.fetch;

// 1. HTTP 401 with `{ code, message }` → ApiError(unauthorized) + login redirect.
globalThis.fetch = (async () =>
  new Response(JSON.stringify({ code: 'unauthorized', message: 'Missing token' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })) as unknown as typeof fetch;

let caught: unknown = null;
try {
  await fetchJson('/api/sessions');
} catch (e) {
  caught = e;
}
assert(caught instanceof ApiError, '401 throws ApiError');
assert((caught as ApiError).code === 'unauthorized', '401 maps code=unauthorized');
assert((caught as ApiError).status === 401, '401 keeps status=401');
assert(fakeLocation.href === '/login', '401 redirects to /login');

// 2. No redirect loop when already on the login page.
fakeLocation.href = '/';
fakeLocation.pathname = '/login';
caught = null;
try {
  await fetchJson('/api/sessions');
} catch (e) {
  caught = e;
}
assert(caught instanceof ApiError, '401 on /login still throws ApiError');
assert(fakeLocation.href === '/', 'no redirect loop on /login');
fakeLocation.pathname = '/';

// 3. Legacy server shape `{ ok: false, error }` maps into `{ code, message }`.
globalThis.fetch = (async () =>
  new Response(JSON.stringify({ ok: false, error: 'Unknown provider: foo' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })) as unknown as typeof fetch;
caught = null;
try {
  await fetchJson('/api/providers/foo/test');
} catch (e) {
  caught = e;
}
assert(caught instanceof ApiError, 'legacy error shape throws ApiError');
assert((caught as ApiError).message === 'Unknown provider: foo', 'legacy error text preserved');
assert((caught as ApiError).status === 400, 'legacy error keeps status=400');

// 4. Happy path still returns parsed JSON.
globalThis.fetch = (async () =>
  new Response(JSON.stringify({ ok: true, service: 'lokma', version: '0.0.1' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as unknown as typeof fetch;
const health = await fetchJson<{ ok: boolean }>('/api/health');
assert(health.ok === true, '200 returns parsed JSON');

globalThis.fetch = realFetch;
console.log('api.test.ts: all 401-path checks passed');
