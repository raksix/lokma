/**
 * REQ-193 slice 9 — the login-wall signal on the DEPLOYED route.
 *
 * The unit probe proves the detector classifies documents. What it cannot
 * measure is the seam that made slices 4-8 each find a real defect: a signal
 * computed correctly and then never reaching the pane because the header is
 * never set, or set with the wrong shape. This probe drives the real
 * `browserProxyRoutes` against a LOCAL stub upstream (never the internet) and
 * asserts the header the client actually reads.
 *
 * The negative control is load-bearing in BOTH directions:
 * - a readable page must carry NO header at all (a `0`/`false` value would let
 *   a pane distinguish nothing, and would let a client treat "not a wall" and
 *   "header missing" as the same thing they are not);
 * - a gate MUST carry it.
 * Without both, a route that set the header unconditionally would pass every
 * positive check and hide a readable page behind a login warning.
 *
 * Run: bun scripts/probe-browser-login-wall.ts (from packages/lokma-web/server
 * so ../dist resolves).
 */
import Fastify from 'fastify';
import { browserProxyRoutes } from '../dist/browser-proxy/proxy-routes.js';
import { LOGIN_WALL_HEADER } from '@lokma/core';

const STUB_PORT = 34597;
const APP_PORT = 34596;
const STUB_ORIGIN = 'http://127.0.0.1:' + String(STUB_PORT);
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

const LOGIN_PAGE =
  '<!doctype html><html><head><title>Sign in</title></head><body>' +
  '<form action="/session" method="post">' +
  '<input type="email" name="email"><input type="password" name="password">' +
  '<button>Log in</button></form></body></html>';

const DOCS_PAGE =
  '<!doctype html><html><head><title>Docs</title></head><body><nav><a href="/">Home</a></nav><main><article>' +
  '<h1>Documentation</h1><p>' +
  'This page is entirely readable and must never be reported as a login wall. '.repeat(8) +
  '</p></article></main><form action="/search"><input name="q"></form></body></html>';

const stub = Fastify({ logger: false });
stub.get('/login', async (_req, reply) => reply.type('text/html; charset=utf-8').send(LOGIN_PAGE));
stub.get('/docs', async (_req, reply) => reply.type('text/html; charset=utf-8').send(DOCS_PAGE));
stub.get('/private', async (_req, reply) => reply.status(403).type('text/html').send('<html><body>nope</body></html>'));
stub.get('/secret.png', async (_req, reply) => reply.status(401).type('image/png').send(Buffer.from([0x89, 0x50])));
stub.get('/gated', async (_req, reply) => reply.redirect('/login'));
await stub.listen({ port: STUB_PORT, host: '127.0.0.1' });

process.env.LOKMA_BROWSER_LOCAL_HOSTS = '127.0.0.1:' + String(STUB_PORT);

const app = Fastify({ logger: false });
await browserProxyRoutes(app);
await app.listen({ port: APP_PORT, host: '127.0.0.1' });

const get = async (path: string, init?: RequestInit) =>
  fetch(PROXY + encodeURIComponent(STUB_ORIGIN + path), init);

console.log('== a login gate is REPORTED as one ==');
const loginRes = await get('/login');
check('login page still renders (status 200)', loginRes.status === 200);
check('login wall header is set', loginRes.headers.get(LOGIN_WALL_HEADER) === '1');

const gatedRes = await get('/gated');
check('a redirect chain landing on /login is a wall', gatedRes.headers.get(LOGIN_WALL_HEADER) === '1');
check('the redirect still resolved to 200', gatedRes.status === 200);

const privateRes = await get('/private');
check('a 403 document is a wall', privateRes.headers.get(LOGIN_WALL_HEADER) === '1');

console.log('== the false-positive side: a readable page carries NO header ==');
const docsRes = await get('/docs');
check('docs page renders', docsRes.status === 200);
check(
  'NO login-wall header on a readable page (absent, not "0")',
  docsRes.headers.get(LOGIN_WALL_HEADER) === null,
);
const docsBody = await docsRes.text();
check('the readable body is really there', docsBody.includes('Documentation'));

console.log('== non-document responses speak only through the status ==');
const binRes = await get('/secret.png');
check('a binary 401 is still a wall', binRes.headers.get(LOGIN_WALL_HEADER) === '1');
const pngRes = await get('/docs');
check('a 200 document is not a wall', pngRes.headers.get(LOGIN_WALL_HEADER) === null);

console.log('== the bodyless probe the pane actually issues ==');
// The client asks with `range: bytes=0-0` so a multi-megabyte document is not
// re-shipped. Fastify answers a range it cannot satisfy with the full body, so
// the check here is that the verdict header survives that request shape — the
// pane's real call, not an idealised one.
const ranged = await get('/login', { headers: { range: 'bytes=0-0' } });
check('the pane\'s ranged probe still reports the wall', ranged.headers.get(LOGIN_WALL_HEADER) === '1');
const rangedDocs = await get('/docs', { headers: { range: 'bytes=0-0' } });
check('the pane\'s ranged probe reports no wall for a readable page', rangedDocs.headers.get(LOGIN_WALL_HEADER) === null);

console.log('== negative control: the whole policy ==');
delete process.env.LOKMA_BROWSER_LOCAL_HOSTS;
const denied = await get('/login');
check('loopback is refused once the allowlist is gone', denied.status === 400);
check('a refused target reports no wall', denied.headers.get(LOGIN_WALL_HEADER) === null);

await app.close();
await stub.close();
console.log('login-wall route probe: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
