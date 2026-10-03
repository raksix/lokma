/**
 * Unit probe for the browser proxy URL policy (REQ-193).
 * Run: `bun src/browser/url-policy.test.ts` from `packages/lokma-core`.
 * No framework (plain asserts) so the package stays dependency-free; the
 * module is pure + sync, so nothing here touches the network or HOME.
 * `tsconfig.json` excludes `*.test.ts` from the build output.
 */
import { BrowserError } from './browser';
import {
  assertProxyTarget,
  isAllowedLocalHost,
  isPrivateHostLiteral,
  LOCAL_HOSTS_ENV,
  localHostAllowlist,
} from './url-policy';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

function expectError(fn: () => unknown, code: string, label: string): void {
  try {
    fn();
  } catch (e) {
    if (e instanceof BrowserError && e.code === code) {
      assert(true, label);
      return;
    }
    throw new Error('FAIL: ' + label + ' (got ' + (e instanceof Error ? e.name + ': ' + e.message : String(e)) + ')');
  }
  throw new Error('FAIL: ' + label + ' (no error thrown)');
}

// --- private literals (no DNS) -------------------------------------------------
for (const host of [
  '127.0.0.1',
  '127.9.9.9',
  'localhost',
  'app.localhost',
  'printer.local',
  'db.internal',
  'metadata.google.internal',
  '0.0.0.0',
  '10.1.2.3',
  '172.16.0.1',
  '172.31.255.255',
  '192.168.1.1',
  '169.254.169.254',
  '100.64.0.1',
  '224.0.0.1',
  '::1',
  'fd00::1',
  'fe80::1',
  '::ffff:127.0.0.1',
]) {
  assert(isPrivateHostLiteral(host), 'private literal refused: ' + host);
}
for (const host of ['example.com', '8.8.8.8', '172.32.0.1', '172.15.0.1', '100.63.0.1', '11.0.0.1', '2606:4700::1111']) {
  assert(!isPrivateHostLiteral(host), 'public host accepted: ' + host);
}
// Trailing dot + bracket forms must not sneak a loopback past the check.
assert(isPrivateHostLiteral('127.0.0.1.'), 'trailing-dot loopback refused');
assert(isPrivateHostLiteral('[::1]'), 'bracketed ::1 refused');

// --- allowlist parsing ---------------------------------------------------------
const env = { [LOCAL_HOSTS_ENV]: '127.0.0.1:3014,  10.0.0.5 ' };
const list = localHostAllowlist(env);
assert(list.length === 2 && list[0] === '127.0.0.1:3014' && list[1] === '10.0.0.5', 'allowlist parses both forms');
assert(localHostAllowlist({}).length === 0, 'empty env yields an empty allowlist');
assert(isAllowedLocalHost('127.0.0.1', '3014', list), 'host:port entry matches the same port');
assert(!isAllowedLocalHost('127.0.0.1', '4000', list), 'host:port entry does not open other ports');
assert(isAllowedLocalHost('10.0.0.5', '22', list), 'bare host entry matches any port');
assert(!isAllowedLocalHost('10.0.0.6', null, list), 'a different host is not allowed');
assert(!isAllowedLocalHost('127.0.0.1', '3014', []), 'no allowlist means no local hosts');

// --- assertProxyTarget ---------------------------------------------------------
const t = assertProxyTarget('https://example.com/page', { allowlist: [] });
assert(t.url.toString() === 'https://example.com/page', 'public https target accepted');
assert(t.localAllowed === false, 'a public host is not flagged as local-allowed');

const bare = assertProxyTarget('example.com', { allowlist: [] });
assert(bare.url.protocol === 'https:', 'a bare host gains https');
assert(bare.url.hostname === 'example.com', 'a bare host keeps its name');

const local = assertProxyTarget('http://127.0.0.1:3014/', { allowlist: ['127.0.0.1:3014'] });
assert(local.localAllowed === true, 'an allowlisted loopback is accepted');
assert(local.url.port === '3014', 'the allowlisted port survives normalization');

expectError(() => assertProxyTarget('http://169.254.169.254/latest/meta-data/', { allowlist: [] }), 'blocked_url', 'cloud metadata IP refused');
expectError(() => assertProxyTarget('http://127.0.0.1:3456/health', { allowlist: [] }), 'blocked_url', 'loopback refused without the allowlist');
expectError(() => assertProxyTarget('http://127.0.0.1:4000/', { allowlist: ['127.0.0.1:3014'] }), 'blocked_url', 'allowlisted host, wrong port refused');
expectError(() => assertProxyTarget('javascript:alert(1)', { allowlist: [] }), 'bad_url', 'javascript: scheme refused');
expectError(() => assertProxyTarget('file:///etc/passwd', { allowlist: [] }), 'bad_url', 'file: scheme refused');
expectError(() => assertProxyTarget('http://user:pw@example.com/', { allowlist: [] }), 'bad_url', 'credentials in the URL refused');
expectError(() => assertProxyTarget('', { allowlist: [] }), 'bad_url', 'empty url refused');
expectError(() => assertProxyTarget('x'.repeat(3000), { allowlist: [] }), 'bad_url', 'over-long url refused');
expectError(() => assertProxyTarget(42 as unknown, { allowlist: [] }), 'bad_url', 'non-string url refused');

// `allowLocal: false` must refuse even an allowlisted host (the engine path).
expectError(
  () => assertProxyTarget('http://127.0.0.1:3014/', { allowLocal: false, allowlist: ['127.0.0.1:3014'] }),
  'blocked_url',
  'allowLocal:false refuses an allowlisted host',
);

console.log('\nbrowser url-policy: ' + passed + '/' + passed + ' passed');