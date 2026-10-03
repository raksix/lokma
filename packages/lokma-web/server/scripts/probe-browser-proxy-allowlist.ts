/**
 * REQ-193 slice 5 — positive proof of the remote-install case.
 *
 * A live probe of the deployed server showed a loopback target answering 400,
 * which is the DESIGNED behaviour: private hosts are refused unless
 * LOKMA_BROWSER_LOCAL_HOSTS opts them in (that refusal is the SSRF policy
 * working). This script proves the other half — with the allowlist set, the
 * REAL deployed route module really does serve a server-side loopback page and
 * rewrites it for the proxy origin.
 *
 * Local stub upstream only; never the internet, and the running server process
 * is never touched. Run: bun scripts/probe-browser-proxy-allowlist.ts
 * (from packages/lokma-web/server so ./dist resolves).
 */
import Fastify from 'fastify';
import { browserProxyRoutes } from '../dist/browser-proxy/proxy-routes.js';

const STUB_PORT = 34599;
const STUB_HOST = '127.0.0.1';
const STUB_ORIGIN = 'http://' + STUB_HOST + ':' + String(STUB_PORT);
const APP_PORT = 34598;
const PROXY = 'http://127.0.0.1:' + String(APP_PORT) + '/api/browser/proxy?url=';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
    console.log('  ok   ' + name);
  } else {
    failed += 1;
    console.error('  FAIL ' + name);
  }
}

// The stub is a server-side "page": it links same-origin assets, so the
// rewriter has real references to point back at the proxy.
const PAGE = [
  '<!doctype html><html><head><title>stub</title>',
  '<link rel="stylesheet" href="/app.css">',
  '</head><body><h1>Server port works</h1>',
  '<a href="/next">next</a><img src="/logo.png">',
  '<script src="/bundle.js"></script>',
  '</body></html>',
].join('');

const stub = Fastify({ logger: false });
stub.get('/app.css', async (_req, reply) => reply.type('text/css').send('body{color:red}'));
stub.get('/logo.png', async (_req, reply) => reply.type('image/png').send(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
stub.get('/bundle.js', async (_req, reply) => reply.type('text/javascript').send('window.x=1'));
stub.get('/', async (_req, reply) => {
  // The two headers the proxy must drop so the page can live in an iframe.
  reply.header('x-frame-options', 'SAMEORIGIN');
  reply.header('set-cookie', 'sid=secret; HttpOnly');
  return reply.type('text/html; charset=utf-8').send(PAGE);
});
await stub.listen({ port: STUB_PORT, host: STUB_HOST });

// The allowlist is parsed from process.env, so it must be set before the route
// reads it — this is the setting a remote operator turns on for their own box.
process.env.LOKMA_BROWSER_LOCAL_HOSTS = STUB_HOST + ':' + String(STUB_PORT);

const app = Fastify({ logger: false });
await browserProxyRoutes(app);
await app.listen({ port: APP_PORT, host: '127.0.0.1' });

const res = await fetch(PROXY + encodeURIComponent(STUB_ORIGIN + '/'), {
  headers: { cookie: 'lokma_token=probe' },
});
const body = await res.text();

console.log('== allowlisted loopback page through the deployed route ==');
check('status is 200', res.status === 200);
check('x-lokma-proxy-url reports the final target', (res.headers.get('x-lokma-proxy-url') || '').includes(STUB_HOST));
check('target X-Frame-Options is stripped (proxy serves its own origin)', res.headers.get('x-frame-options') === null);
check('target Set-Cookie is stripped', res.headers.get('set-cookie') === null);
check('document was rewritten into the proxy origin', body.includes('/api/browser/proxy?url='));
check('stylesheet reference was rewritten', /href="\/api\/browser\/proxy\?url=[^"]*app\.css/.test(body));
check('anchor href was rewritten', /href="\/api\/browser\/proxy\?url=[^"]*next/.test(body));
check('script src was rewritten', /src="\/api\/browser\/proxy\?url=[^"]*bundle\.js/.test(body));
check('image src was rewritten', /src="\/api\/browser\/proxy\?url=[^"]*logo\.png/.test(body));
check('content-type preserved', (res.headers.get('content-type') || '').includes('text/html'));

// A binary subresource must survive the proxy byte-for-byte: a Uint8Array would
// reach the browser as {"0":137,…} and every image would render broken.
const imgRes = await fetch(PROXY + encodeURIComponent(STUB_ORIGIN + '/logo.png'));
const imgBuf = Buffer.from(await imgRes.arrayBuffer());
check('binary subresource keeps its bytes', imgRes.status === 200 && imgBuf.length === 4 && imgBuf[0] === 0x89);

// Negative control: drop the allowlist and the very same host must be refused.
// Without this, a policy that refused EVERYTHING would pass every check above —
// this is what makes them mean something.
delete process.env.LOKMA_BROWSER_LOCAL_HOSTS;
const denied = await fetch(PROXY + encodeURIComponent(STUB_ORIGIN + '/'));
console.log('== negative control: same host, allowlist removed ==');
check('loopback is refused once the allowlist is gone', denied.status === 400);

await app.close();
await stub.close();
console.log('proxy allowlist probe: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);