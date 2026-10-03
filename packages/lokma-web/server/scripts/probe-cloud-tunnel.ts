/**
 * Live probe for the tunnel routes (REQ-193 Kapsam 4).
 * Run: `bun server/scripts/probe-cloud-tunnel.ts` from `packages/lokma-web`
 * (after `bun run build` in the server package).
 *
 * What it measures, against the REAL Fastify app the harness ships:
 *  1. the three routes are MOUNTED (the slice-4/5 lesson: a module that nobody
 *     routes still compiles, typechecks and answers 404 forever);
 *  0. the routes are GATED (REQ-076) — starting a public tunnel must require a
 *     signed-in user, so a stranger holding the url cannot re-point it;
 *  2. `GET /api/cloud/tunnel` is honest when nothing runs — stopped, url null;
 *  3. `POST /api/cloud/tunnel/start` with nothing installed answers a truthful
 *     501 + install sentence, NOT a url;
 *  4. `POST /api/cloud/tunnel/stop` is idempotent and leaves url null;
 *  5. a junk port is a 400 naming the valid range.
 *
 * The negative control is the load-bearing one: point the same probe at a box
 * where the start route silently "succeeded" with a fabricated url, and every
 * other check would still pass. So check 3 asserts the ABSENCE of a url key.
 *
 * Zero-network: no provider is installed in the probe environment and
 * `LOKMA_RELAY_URL` is cleared, so nothing is ever spawned. The probe binds an
 * ephemeral port on loopback only.
 *
 * THE LOGIN GATE STAYS ON. This probe mints a REAL superadmin bearer
 * (`signToken`, same path the login route uses) instead of flipping
 * `requireLogin` off — hand-editing `/root/.lokma/auth/settings.json` for a test
 * is how the internet-facing harness gets left open. The token lives only in
 * this process; nothing prints it and nothing writes it to disk.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * ISOLATE THE STATE FILE BEFORE THE MODULE IS LOADED.
 *
 * `stopTunnel()` persists to `~/.lokma/tunnel.json`, so a probe that calls it
 * rewrites the LIVE install's tunnel status. Measured: with no override, the
 * probe's `stop` call left the real file rewritten by a fake provider — which
 * then made the NEXT assertion (status reads `stopped`) fail for a reason that
 * had nothing to do with the code under test.
 *
 * `LOKMA_TUNNEL_STATE` must be set before `@lokma/core` is imported, because
 * the resolver reads it at CALL time but the module-level import order still
 * decides nothing here — the env is read per call, so setting it before the
 * first `stopTunnel()` is what actually matters. Set it first regardless: an
 * import-order regression would silently restore the leak.
 */
const STATE_DIR = mkdtempSync(join(tmpdir(), 'lokma-tunnel-route-probe-'));
process.env.LOKMA_TUNNEL_STATE = join(STATE_DIR, 'tunnel.json');

import { signToken } from '@lokma/core';

import { createApp } from '../src/app.js';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

// Make the "nothing is installed" precondition EXPLICIT rather than hoping the
// probe box has no cloudflared: an empty PATH kills every binary lookup, and
// the relay env vars are blanked so the fallback cannot answer either.
const savedPath = process.env.PATH;
const savedProvider = process.env.LOKMA_TUNNEL_PROVIDER;
const savedRelayUrl = process.env.LOKMA_RELAY_URL;
const savedRelayToken = process.env.LOKMA_RELAY_TOKEN;
process.env.PATH = '/nonexistent-probe-bin';
delete process.env.LOKMA_TUNNEL_PROVIDER;
delete process.env.LOKMA_RELAY_URL;
delete process.env.LOKMA_RELAY_TOKEN;

// Mint a real superadmin token (root-only, in-process, never logged).
const { listUsers } = await import('@lokma/core');
const probeUser = (await listUsers())
  .filter((u) => u.status === 'active')
  .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
if (!probeUser) throw new Error('no active user to mint a probe token for');
// Two header sets on purpose: a body-less POST must NOT claim a json
// content-type, or Fastify rejects it with FST_ERR_CTP_EMPTY_JSON_BODY before
// the handler runs and the route looks broken when it is not.
const token = await signToken(probeUser.id);
const auth = { authorization: `Bearer ${token}` };
const authJson = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

const app = await createApp();
const listen = await app.listen({ port: 0, host: '127.0.0.1' });
const base = typeof listen === 'string' ? listen : (listen as { url: string }).url;

try {
  // 0. CONTROL — the login gate covers the tunnel family. Checked FIRST and
  // tokenless, so a route that answered 200 here would be reported as a PASS
  // for every later check and hide the real hole.
  const anon = await fetch(`${base}/api/cloud/tunnel`);
  assert(anon.status === 401, `the tunnel family is gated (got ${anon.status})`);
  const anonStart = await fetch(`${base}/api/cloud/tunnel/start`, { method: 'POST' });
  assert(anonStart.status === 401, `starting a tunnel requires auth (got ${anonStart.status})`);

  // 1. status when nothing has ever been started
  const status = (await (await fetch(`${base}/api/cloud/tunnel`, { headers: auth })).json()) as {
    state?: string;
    url?: string | null;
    message?: string;
  };
  assert(typeof status.state === 'string', 'GET /api/cloud/tunnel is mounted (not a Fastify 404)');
  assert(status.state === 'stopped', 'a never-started tunnel reads stopped');
  assert(status.url === null || status.url === undefined, 'a stopped tunnel carries NO url');
  assert(typeof status.message === 'string' && status.message.length > 0, 'the status carries a human message');

  // 2. start with nothing installed → honest failure, never a url
  const startRes = await fetch(`${base}/api/cloud/tunnel/start`, {
    method: 'POST',
    headers: authJson,
    body: JSON.stringify({}),
  });
  const startBody = (await startRes.json()) as Record<string, unknown>;
  assert(startRes.status === 501, `start without a provider answers 501 (got ${startRes.status})`);
  assert(typeof startBody['code'] === 'string', 'the failure carries a machine code');
  assert(
    typeof startBody['message'] === 'string' && String(startBody['message']).length > 0,
    'the failure carries an install/configure sentence',
  );
  // NEGATIVE CONTROL: the whole point — a url must NOT appear anywhere here.
  assert(!('url' in startBody), 'the failure carries NO url key — nothing is fabricated');
  assert(startBody['url'] === undefined, 'the fabricated url is undefined, not a placeholder host');

  // 3. stop is idempotent and honest
  const stop1 = await fetch(`${base}/api/cloud/tunnel/stop`, { method: 'POST', headers: auth });
  const stop1Body = (await stop1.json()) as { state?: string; url?: string | null };
  assert(stop1.status === 200, 'stop answers 200');
  assert(stop1Body.state === 'stopped', 'stop reports stopped');
  assert(stop1Body.url === null || stop1Body.url === undefined, 'stop leaves NO stale url in the panel');

  const stop2 = await fetch(`${base}/api/cloud/tunnel/stop`, { method: 'POST', headers: auth });
  const stop2Body = (await stop2.json()) as { state?: string };
  assert(stop2.status === 200 && stop2Body.state === 'stopped', 'stopping twice is still stopped, not an error');

  // 4. status after stop is still stopped (the panel must not resurrect a url)
  const after = (await (await fetch(`${base}/api/cloud/tunnel`, { headers: auth })).json()) as { state?: string; url?: string | null };
  assert(after.state === 'stopped' && !after.url, 'status after stop is stopped with no url');

  // 4b. CONTROL — a body-less POST that still claims application/json is
  // refused by Fastify's own content-type parser (FST_ERR_CTP_EMPTY_JSON_BODY),
  // never by our handler. The panel client must send either a real body or no
  // content-type at all; this assertion keeps that distinction measured instead
  // of assumed, because a client that gets it wrong reads as "the tunnel API is
  // broken" rather than "my fetch sent an empty json body".
  const emptyJson = await fetch(`${base}/api/cloud/tunnel/start`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  const emptyJsonBody = (await emptyJson.json().catch(() => ({}))) as { code?: string };
  assert(
    emptyJson.status === 400 && emptyJsonBody.code === 'FST_ERR_CTP_EMPTY_JSON_BODY',
    `an empty json body is refused by Fastify, not silently run (got ${emptyJson.status})`,
  );

  // 5. a junk port is a 400 that names the valid range
  const junk = await fetch(`${base}/api/cloud/tunnel/start`, {
    method: 'POST',
    headers: authJson,
    body: JSON.stringify({ port: 'abc' }),
  });
  const junkBody = (await junk.json()) as { code?: string; message?: string };
  assert(junk.status === 400, `a non-numeric port answers 400 (got ${junk.status})`);
  assert(junkBody.code === 'bad_port', 'the port failure is machine-readable');
  assert(
    typeof junkBody.message === 'string' && junkBody.message.includes('65535'),
    'the port failure names the valid range',
  );
} finally {
  await app.close();
  rmSync(STATE_DIR, { recursive: true, force: true });
  process.env.PATH = savedPath;
  if (savedProvider !== undefined) process.env.LOKMA_TUNNEL_PROVIDER = savedProvider;
  if (savedRelayUrl !== undefined) process.env.LOKMA_RELAY_URL = savedRelayUrl;
  if (savedRelayToken !== undefined) process.env.LOKMA_RELAY_TOKEN = savedRelayToken;
}

console.log(`\n${passed} assertions passed.`);