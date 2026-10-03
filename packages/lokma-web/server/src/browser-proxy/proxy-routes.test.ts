/**
 * Browser proxy route wiring (REQ-193 slice 4).
 * Run: `bun src/browser-proxy/proxy-routes.test.ts` from `packages/lokma-web/server`.
 * No test framework — plain asserts so the package stays dependency-free.
 *
 * Slices 1-3 unit-tested the policy, the rewriter and the fetch. What they
 * CANNOT cover is the seam this file measures: a route that never gets mounted,
 * that answers a blocked target with 200, or that hands Fastify a Uint8Array
 * (serialized as a JSON object, so every proxied image would arrive corrupt).
 *
 * Upstream is a LOCAL http server, never the real internet: a probe that reaches
 * out is both slow and flaky, and an SSRF test that talks to the internet proves
 * nothing the policy unit test does not.
 */
import { createServer, type Server } from 'node:http';
import Fastify, { type FastifyInstance } from 'fastify';
import { BrowserError } from '@lokma/core';
import { browserProxyRoutes } from './proxy-routes';
import { fetchThroughProxy } from './fetch';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

// 1. Fake upstream: a document that references a subresource + an XFO header,
//    plus a binary endpoint whose bytes must survive intact.
const upstream: Server = createServer((req, res) => {
  if (req.url?.startsWith('/bin')) {
    res.writeHead(200, { 'content-type': 'image/png' });
    // latin-1 range: a naive utf-8 round-trip corrupts these bytes.
    res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x80]));
    return;
  }
  if (req.url?.startsWith('/redirect')) {
    res.writeHead(302, { location: '/landing' });
    res.end();
    return;
  }
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'x-frame-options': 'DENY',
    'content-security-policy': "frame-ancestors 'none'",
    'set-cookie': 'sid=leak; Path=/',
  });
  res.end('<html><head><title>up</title></head><body><img src="/bin"><a href="/next">n</a></body></html>');
});

await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
const upAddr = upstream.address();
if (!upAddr || typeof upAddr === 'string') throw new Error('no upstream port');
const upstreamBase = 'http://127.0.0.1:' + upAddr.port;
const origin = process.env['LOKMA_TEST_LOCAL_HOSTS'] ?? '';

const app: FastifyInstance = Fastify({ logger: false });
await browserProxyRoutes(app);

// The route resolves the local allowlist from the environment at REQUEST time
// (the default parameter of `isAllowedLocalHost`), so setting it here is
// enough — no dependency injection, no production-only branch.
process.env['LOKMA_BROWSER_LOCAL_HOSTS'] = '127.0.0.1';

// 2. The route EXISTS and answers. Before this slice the path 404'd, which is
//    exactly the "deploy did nothing" shape a stale proc also produces.
{
  const res = await app.inject({
    method: 'GET',
    url: '/api/browser/proxy?url=' + encodeURIComponent(upstreamBase + '/'),
  });
  assert(res.statusCode === 200, 'proxy route mounted and answers 200');
  const body = res.body;
  assert(body.includes('<base href="/api/browser/proxy'), 'document carries a proxy base href');
  assert(body.includes('/api/browser/proxy?url='), 'subresource rewritten to ride the proxy');
}

// 3. XFO/CSP/set-cookie from the target must NOT reach the pane — the whole
//    point of the proxy is that framing refusals die at the proxy's origin.
{
  const res = await app.inject({
    method: 'GET',
    url: '/api/browser/proxy?url=' + encodeURIComponent(upstreamBase + '/'),
  });
  assert(!res.headers['x-frame-options'], 'x-frame-options stripped from the response');
  assert(!res.headers['content-security-policy'], 'csp stripped from the response');
  assert(!res.headers['set-cookie'], 'target set-cookie not relayed to the browser');
  assert(String(res.headers['x-lokma-proxy-url'] ?? '').startsWith(upstreamBase), 'final url reported to the pane');
}

// 4. Binary bodies must arrive as bytes, not as a JSON object of indices.
{
  const res = await app.inject({
    method: 'GET',
    url: '/api/browser/proxy?url=' + encodeURIComponent(upstreamBase + '/bin'),
  });
  assert(res.statusCode === 200, 'binary subresource served');
  assert(res.rawPayload.length === 8, 'binary body length preserved (got ' + res.rawPayload.length + ')');
  assert(Buffer.compare(Buffer.from(res.rawPayload), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x80])) === 0,
    'binary bytes are byte-identical, not utf-8 mangled');
}

// 5. Redirects are followed and REPORTED (the pane needs the landing url).
{
  const res = await app.inject({
    method: 'GET',
    url: '/api/browser/proxy?url=' + encodeURIComponent(upstreamBase + '/redirect'),
  });
  assert(res.statusCode === 200, 'redirect chain followed');
  assert(res.headers['x-lokma-proxy-redirects'] === '1', 'redirect count reported');
  assert(String(res.headers['x-lokma-proxy-url'] ?? '').endsWith('/landing'), 'final url is the landing page');
}

// 6. SSRF: a loopback target is refused with an honest 400 unless the local
//    allowlist names it. This is the acceptance criterion in the REQ. The
//    allowlist above names 127.0.0.1, so the metadata IP is the control: an
//    allowlist that opened everything would pass this by accident, and the
//    next check below removes the allowlist entirely.
{
  const res = await app.inject({
    method: 'GET',
    url: '/api/browser/proxy?url=' + encodeURIComponent('http://169.254.169.254/latest/meta-data/'),
  });
  assert(res.statusCode === 400, 'metadata IP refused with 400 (got ' + res.statusCode + ')');
  assert(JSON.parse(res.body).code === 'blocked_url', 'refusal names blocked_url');
}

// 6b. Negative control for 6: with the allowlist EMPTY, even loopback dies.
//     Without this, check 6 would pass on a policy that blocks nothing.
{
  const saved = process.env['LOKMA_BROWSER_LOCAL_HOSTS'];
  delete process.env['LOKMA_BROWSER_LOCAL_HOSTS'];
  const res = await app.inject({
    method: 'GET',
    url: '/api/browser/proxy?url=' + encodeURIComponent(upstreamBase + '/'),
  });
  process.env['LOKMA_BROWSER_LOCAL_HOSTS'] = saved;
  assert(res.statusCode === 400, 'loopback refused without the allowlist (got ' + res.statusCode + ')');
}

// 7. Malformed input is a 400, never a 500 or a silent empty frame.
for (const [raw, label] of [['ftp://x/', 'non-http scheme'], ['not a url', 'unparseable'], ['', 'empty']] as const) {
  const res = await app.inject({
    method: 'GET',
    url: '/api/browser/proxy?url=' + encodeURIComponent(raw),
  });
  assert(res.statusCode === 400, label + ' refused with 400 (got ' + res.statusCode + ')');
}

// 8. A missing url param entirely must not be treated as "fetch the server".
{
  const res = await app.inject({ method: 'GET', url: '/api/browser/proxy' });
  assert(res.statusCode === 400, 'missing url param refused with 400');
}

// 9. The allowlist exception: naming the loopback host opens exactly that host.
{
  const res = await fetchThroughProxy(upstreamBase + '/', { allowlist: ['127.0.0.1'] });
  assert(res.rewritten, 'allowlisted loopback host is proxied');
  assert(String(res.body).includes('proxy'), 'allowlisted document is rewritten');
}

// 10. A non-allowlisted loopback host still dies — the exception is per-host.
//     `await` is load-bearing here: `fetchThroughProxy` is async, so an un-awaited
//     call rejects into an unhandled rejection and `threw` stays false.
{
  let threw = false;
  try {
    await fetchThroughProxy(upstreamBase + '/', { allowlist: ['example.com'] });
  } catch (e) {
    threw = e instanceof BrowserError && e.code === 'blocked_url';
  }
  assert(threw, 'allowlist does not leak to other hosts');
}

await app.close();
upstream.close();
console.log('\n' + passed + '/' + passed + ' PASS');
if (process.env['LOKMA_TEST_LOCAL_HOSTS']) console.log('origin=' + origin);