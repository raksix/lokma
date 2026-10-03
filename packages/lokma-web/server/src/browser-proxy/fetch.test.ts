/**
 * Unit probe for the proxy upstream fetch (REQ-193, slice 3).
 * Run: `bun src/browser-proxy/fetch.test.ts` from `packages/lokma-web/server`.
 *
 * No network: a stub fetch stands in for the upstream and records what it was
 * asked for, so the redirect re-validation (the reason this module exists at
 * all) is provable without reaching `169.254.169.254` from a test.
 */
import { BrowserError } from '@lokma/core';
import {
  PROXY_HTML_CAP,
  PROXY_MAX_REDIRECTS,
  fetchThroughProxy,
  resolveProxyChain,
  resolveWsTarget,
} from './fetch';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

type Hop = { url: string };

/** Stub fetch: serve `steps` in order, recording every requested url. */
function stubFetch(steps: Response[] | ((url: string, init: RequestInit) => Response)) {
  const seen: Hop[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input);
    seen.push({ url });
    const res = typeof steps === 'function' ? steps(url, init ?? {}) : steps[seen.length - 1]!;
    return res;
  }) as unknown as typeof fetch;
  return { impl, seen };
}

function html(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
}

function redirect(location: string, status = 302): Response {
  return new Response('', { status, headers: { location, 'content-type': 'text/html' } });
}

// --- constants ----------------------------------------------------------------
assert(PROXY_MAX_REDIRECTS === 5, 'redirect hops are capped at 5');
assert(PROXY_HTML_CAP === 8 * 1024 * 1024, 'the document cap is 8 MB');

// --- resolveProxyChain: honest 400 before any socket ---------------------------
for (const bad of ['', '   ', undefined, 42, 'javascript:alert(1)', 'file:///etc/passwd', 'http://user:pw@x.example/']) {
  let code = '';
  try {
    resolveProxyChain(bad);
  } catch (e) {
    code = (e as BrowserError).code;
  }
  assert(code === 'bad_url', 'refused as bad_url: ' + JSON.stringify(bad));
}

let blockedCode = '';
let blockedStatus = 0;
try {
  resolveProxyChain('http://169.254.169.254/latest/meta-data/');
} catch (e) {
  blockedCode = (e as BrowserError).code;
  blockedStatus = (e as BrowserError).status;
}
assert(blockedCode === 'blocked_url', 'the cloud metadata IP is refused (SSRF)');
assert(blockedStatus === 400, 'an SSRF refusal is an honest 400, not a 500');

let loopCode = '';
try {
  resolveProxyChain('http://127.0.0.1:3014/');
} catch (e) {
  loopCode = (e as BrowserError).code;
}
assert(loopCode === 'blocked_url', 'loopback is refused when the allowlist is empty');

const allowed = resolveProxyChain('http://127.0.0.1:3014/', { allowlist: ['127.0.0.1:3014'] });
assert(allowed.target.localAllowed === true, 'the allowlisted local host is accepted');
assert(allowed.target.url.port === '3014', 'the allowlist keeps the port it named');

const publicHost = resolveProxyChain('https://example.com/x');
assert(publicHost.target.localAllowed === false, 'a public host is not flagged local');

// --- the redirect re-check (the reason this module exists) ---------------------
{
  const stub = stubFetch([redirect('http://169.254.169.254/latest/meta-data/')]);
  let code = '';
  try {
    await fetchThroughProxy('https://evil.example/start', { fetchImpl: stub.impl });
  } catch (e) {
    code = (e as BrowserError).code;
  }
  assert(code === 'blocked_url', 'a redirect INTO a private host is refused');
  assert(stub.seen.length === 1, 'the second hop is never fetched (refused on the Location header)');
}

{
  // A relative redirect resolves against the current url and is re-validated.
  const stub = stubFetch((url) =>
    url === 'https://ok.example/a' ? redirect('/b') : html('<html><head></head><body>ok</body></html>'),
  );
  const res = await fetchThroughProxy('https://ok.example/a', { fetchImpl: stub.impl });
  assert(res.redirects === 1, 'a relative redirect is followed');
  assert(stub.seen[1]?.url === 'https://ok.example/b', 'the relative Location resolved against the current url');
  assert(res.finalUrl === 'https://ok.example/b', 'finalUrl reports the document actually fetched');
  assert(res.rewritten === true, 'the followed document came back rewritten');
}

{
  // A redirect that LOOPED back to the private host the allowlist covers is
  // still fine (documented exception), but an unbounded loop must stop.
  let n = 0;
  const stub = stubFetch(() => {
    n += 1;
    return redirect('/hop' + n);
  });
  let code = '';
  try {
    await fetchThroughProxy('https://loop.example/', { fetchImpl: stub.impl });
  } catch (e) {
    code = (e as BrowserError).code;
  }
  assert(code === 'too_many_redirects', 'a redirect loop stops at the hop cap');
}

{
  const stub = stubFetch([html('<html><head><base href="http://x/"><link href="/a.css"></head><body>b</body></html>')]);
  const res = await fetchThroughProxy('https://page.example/', { fetchImpl: stub.impl });
  assert(res.rewritten === true, 'an html body is rewritten');
  assert(typeof res.body === 'string' && res.body.includes('<base href="/api/browser/proxy'), 'a proxy <base> is injected');
  assert(typeof res.body === 'string' && !res.body.includes('<base href="http://x/"'), 'the page own absolute base is replaced by the proxy base');
}

// --- non-HTML is byte-identical ------------------------------------------------
{
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
  const stub = stubFetch([new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } })]);
  const res = await fetchThroughProxy('https://cdn.example/a.png', { fetchImpl: stub.impl });
  assert(res.rewritten === false, 'an image is not rewritten');
  assert(res.body instanceof Uint8Array && res.body.length === 6, 'binary bytes survive the proxy');
}

{
  const js = 'const a = "<base href=x>";';
  const stub = stubFetch([new Response(js, { headers: { 'content-type': 'application/javascript' } })]);
  const res = await fetchThroughProxy('https://cdn.example/a.js', { fetchImpl: stub.impl });
  // Non-HTML rides as BYTES on purpose: decoding it as text is where a latin-1
  // asset or a binary body would corrupt, and the route writes bytes verbatim.
  assert(res.body instanceof Uint8Array, 'a js body rides as bytes, never re-encoded');
  assert(new TextDecoder().decode(res.body as Uint8Array) === js, 'a js body is untouched');
}

// --- response headers ----------------------------------------------------------
{
  const stub = stubFetch([
    html('<html><head></head></html>', {
      'x-frame-options': 'DENY',
      'content-security-policy': "frame-ancestors 'none'",
      'set-cookie': 'session=secret; HttpOnly',
      'content-encoding': 'gzip',
      'content-length': '999',
      'transfer-encoding': 'chunked',
      'x-custom-keep': 'yes',
    }),
  ]);
  const res = await fetchThroughProxy('https://x.example/', { fetchImpl: stub.impl });
  assert(!('x-frame-options' in res.headers), 'X-Frame-Options is stripped so the pane can frame the proxy origin');
  assert(!('content-security-policy' in res.headers), 'CSP frame-ancestors is stripped (it would block the pane)');
  assert(!('set-cookie' in res.headers), 'Set-Cookie is not handed to the pane');
  assert(!('content-encoding' in res.headers), 'Content-Encoding is stripped (the body is already decoded)');
  assert(!('content-length' in res.headers), 'a stale Content-Length is stripped (the body changed size)');
  assert(!('transfer-encoding' in res.headers), 'hop-by-hop Transfer-Encoding is stripped');
  assert(res.headers['x-custom-keep'] === 'yes', 'an ordinary response header passes through');
}

{
  const stub = stubFetch([new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } })]);
  const res = await fetchThroughProxy('https://x.example/missing', { fetchImpl: stub.impl });
  assert(res.status === 404, 'an upstream 404 is passed through, not masked');
}

{
  const stub = stubFetch([new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })]);
  let code = '';
  try {
    await fetchThroughProxy('https://x.example/', { fetchImpl: stub.impl, htmlCap: 4 });
  } catch (e) {
    code = (e as BrowserError).code;
  }
  assert(code === 'proxy_too_large', 'a document over the cap is refused honestly');
}

{
  const boom = (async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;
  let code = '';
  let status = 0;
  try {
    await fetchThroughProxy('https://down.example/', { fetchImpl: boom });
  } catch (e) {
    code = (e as BrowserError).code;
    status = (e as BrowserError).status;
  }
  assert(code === 'proxy_fetch_failed', 'an unreachable upstream is an honest proxy_fetch_failed');
  assert(status === 502, 'an unreachable upstream answers 502');
}

// --- ws target validation ------------------------------------------------------
{
  const ws = resolveWsTarget('wss://live.example/room/1');
  assert(ws.protocol === 'wss:', 'a wss target resolves');
  let code = '';
  try {
    resolveWsTarget('ws://127.0.0.1:9222/devtools');
  } catch (e) {
    code = (e as BrowserError).code;
  }
  assert(code === 'blocked_url', 'a ws target into a private host is refused');
  const wsAllowed = resolveWsTarget('ws://127.0.0.1:9222/x', ['127.0.0.1:9222']);
  assert(wsAllowed.port === '9222', 'an allowlisted ws target passes');
}

console.log('browser proxy fetch: ' + passed + '/' + passed + ' passed');