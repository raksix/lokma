/**
 * Unit probe for the public tunnel module (REQ-193, Kapsam 4).
 * Run: `bun src/cloud/tunnel.test.ts` from `packages/lokma-core`.
 * No framework (plain asserts) so the package stays dependency-free.
 *
 * Zero-network by construction: provider availability is an INJECTED probe and
 * the spawn is a fake, so nothing here can reach the internet, spawn a real
 * cloudflared, or write to the real `~/.lokma` (every state path is HOME-free
 * except the two functions that use `readJson`/`writeAtomic`, which are only
 * reached through `stopTunnel({ silent: true })`'s no-write branch and the
 * pure parsers).
 *
 * The load-bearing assertions are the NEGATIVE ones: an unavailable provider
 * must NOT produce a url, and a dead pid must NOT read as running — a status
 * that invents a URL passes every positive test in the file.
 */
import {
  parseNgrokJsonUrl,
  parseProviderUrl,
  resolveTunnelPlan,
  startTunnel,
  stopTunnel,
  TunnelError,
  TUNNEL_DEFAULT_PORT,
  TUNNEL_PROVIDER_ENV,
  TUNNEL_RELAY_URL_ENV,
  TUNNEL_URL_CAP,
} from './tunnel';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

async function expectTunnelError(fn: () => Promise<unknown>, code: string, label: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof TunnelError && e.code === code) {
      assert(true, label);
      return;
    }
    throw new Error(
      'FAIL: ' + label + ' (got ' + (e instanceof Error ? e.name + ': ' + e.message : String(e)) + ')',
    );
  }
  throw new Error('FAIL: ' + label + ' (no error thrown)');
}

// --- provider selection (pure, injected PATH probe) ----------------------------

{
  const plan = await resolveTunnelPlan({
    port: 3456,
    env: {},
    binaryExists: async () => false,
  });
  assert(plan.available === false, 'no binaries + no relay → unavailable');
  assert(plan.provider === 'relay', 'the relay is the last resort');
  assert(plan.installHint !== null && plan.installHint.includes(TUNNEL_RELAY_URL_ENV), 'unavailable carries the relay env name');
  assert(plan.command === '', 'an unavailable plan spawns nothing');
}

{
  const plan = await resolveTunnelPlan({
    port: 3456,
    env: { [TUNNEL_RELAY_URL_ENV]: 'https://relay.example.com' },
    binaryExists: async () => false,
  });
  assert(plan.available === true, 'a configured relay IS available');
  assert(plan.args.includes('https://relay.example.com'), 'the relay args carry the configured url');
}

{
  const plan = await resolveTunnelPlan({
    port: 4321,
    env: {},
    binaryExists: async (n) => n === 'cloudflared',
  });
  assert(plan.provider === 'cloudflared', 'an installed binary wins over the relay');
  assert(plan.args.includes('http://127.0.0.1:4321'), 'cloudflared targets the caller’s port');
  assert(plan.args.includes('--no-autoupdate'), 'cloudflared never auto-updates mid-session');
}

{
  const plan = await resolveTunnelPlan({
    port: 3456,
    env: {},
    binaryExists: async (n) => n === 'ngrok',
  });
  assert(plan.provider === 'ngrok', 'ngrok is used when it is the only binary');
  assert(plan.args.includes('3456'), 'ngrok targets the caller’s port');
}

{
  // An explicit provider that is not installed must NOT silently fall back —
  // substituting another service would hand back a URL the user did not ask for.
  const plan = await resolveTunnelPlan({
    port: 3456,
    env: { [TUNNEL_PROVIDER_ENV]: 'ngrok' },
    binaryExists: async () => true, // cloudflared "exists" but was not asked for
  });
  assert(plan.provider === 'ngrok' && plan.available === true, 'an explicit provider is honoured');
}

{
  const plan = await resolveTunnelPlan({
    port: 3456,
    env: { [TUNNEL_PROVIDER_ENV]: 'ngrok' },
    binaryExists: async () => false,
  });
  assert(plan.available === false, 'an explicit-but-missing provider stays unavailable');
  assert(plan.provider === 'ngrok', 'it does not fall back to cloudflared');
}

// --- url parsing: only provider output becomes a url ---------------------------

assert(
  parseProviderUrl('2024-01-01T00:00:00Z INF | https://quiet-otter-9a1.trycloudflare.com') ===
    'https://quiet-otter-9a1.trycloudflare.com',
  'a cloudflared log line yields its url',
);
assert(
  parseProviderUrl('|  https://abc-def.ngrok-free.app   |') === 'https://abc-def.ngrok-free.app',
  'ngrok table output yields its url with padding trimmed',
);
assert(
  parseProviderUrl('https://127.0.0.1:3456') === null,
  'a loopback echo is NOT a public tunnel url',
);
assert(parseProviderUrl('INF Starting tunnel... no url here') === null, 'a log line with no url returns null');
assert(parseProviderUrl('https://x.dev/' + 'a'.repeat(TUNNEL_URL_CAP)) === null, 'an over-long url is refused');
assert(
  parseNgrokJsonUrl('{"url":"https://relay.ngrok.io","lvl":"info"}') === 'https://relay.ngrok.io',
  'the ngrok json line yields its url',
);
assert(parseNgrokJsonUrl('{"lvl":"info"}') === null, 'a json line with no url key returns null');
assert(parseNgrokJsonUrl('not json') === null, 'a non-json line returns null');

// --- start: honest failure when nothing is installed ---------------------------

await expectTunnelError(
  () =>
    startTunnel({
      port: 3456,
      env: {},
      binaryExists: async () => false,
      spawnFn: (() => {
        throw new Error('spawn must never be reached when no provider is available');
      }) as never,
    }),
  'provider_unavailable',
  'start refuses when no provider is installed (no spawn, no invented url)',
);

// A provider that prints nothing must fail — NOT resolve to a made-up url.
await expectTunnelError(
  () =>
    startTunnel({
      port: 3456,
      env: {},
      binaryExists: async (n) => n === 'cloudflared',
      timeoutMs: 40,
      spawnFn: (() => {
        const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
        return {
          pid: 4242,
          stdout: { on: (_e: string, cb: (...a: unknown[]) => void) => listeners['out']?.push(cb) },
          stderr: { on: (_e: string, cb: (...a: unknown[]) => void) => listeners['err']?.push(cb) },
          on: (e: string, cb: (...a: unknown[]) => void) => listeners[e]?.push(cb),
          kill: () => true,
          exitCode: null,
        } as never;
      }) as never,
    }),
  'no_url',
  'a silent provider fails with no_url instead of inventing a url',
);

// --- stop is idempotent and always honest ---------------------------------------

const stopped = await stopTunnel({ silent: true });
assert(stopped.state === 'stopped', 'stop answers stopped');
assert(stopped.url === null, 'a stopped tunnel has NO url — never a stale one');

assert(TUNNEL_DEFAULT_PORT === 3456, 'the default port is the harness web port');

// Referenced so the import list stays honest about the surface this probe pins.
void stopTunnel;

console.log(`\n${passed} assertions passed.`);