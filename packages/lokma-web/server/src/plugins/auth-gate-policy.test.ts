/**
 * Auth-gate policy matrix (REQ-076).
 * Run: `bun src/plugins/auth-gate-policy.test.ts` from `packages/lokma-web/server`.
 * No test framework — plain asserts so the package stays dependency-free.
 */
import { isAuthGateJudged, isAuthGatePublic, normalizeGatePath } from './auth-gate-policy';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

// ─── Normalization ───
assert(normalizeGatePath('/api/files?cwd=/tmp&path=a') === '/api/files', 'strips query');
assert(normalizeGatePath('/api/files/') === '/api/files', 'drops trailing slash');
assert(normalizeGatePath('/') === '/', 'keeps root');
assert(normalizeGatePath('/api/auth/settings?x=1') === '/api/auth/settings', 'strips query on settings');

// ─── Always-public (even gate-on) ───
assert(isAuthGatePublic('GET', '/health') === true, 'liveness /health public');
assert(isAuthGatePublic('GET', '/api/health') === true, 'liveness /api/health public');
assert(isAuthGatePublic('GET', '/api/auth/settings') === true, 'boot gate settings read public');
assert(isAuthGatePublic('POST', '/api/auth/login') === true, 'login public');
assert(isAuthGatePublic('POST', '/api/auth/register') === true, 'first-admin register public');
assert(isAuthGatePublic('POST', '/api/auth/accept-invite') === true, 'invite accept public');
assert(isAuthGatePublic('POST', '/api/auth/onboarding') === true, 'onboarding public');
assert(isAuthGatePublic('GET', '/api/share/abc123') === true, 'frozen share GET public');
assert(isAuthGatePublic('GET', '/share/abc123') === true, 'share page public');
assert(isAuthGatePublic('GET', '/share/session/abc123') === true, 'typed share page public');
assert(isAuthGatePublic('get', '/api/health') === true, 'method case-insensitive');

// ─── Gated (must need a token when gate is on) ───
const gated: Array<[string, string]> = [
  ['GET', '/api/files'],
  ['GET', '/api/files/raw'],
  ['POST', '/api/terminal'],
  ['GET', '/api/sessions'],
  ['POST', '/api/sessions'],
  ['GET', '/api/auth/me'],
  ['GET', '/api/config'],
  ['POST', '/api/config'],
  ['GET', '/api/providers'],
  ['GET', '/api/models'],
  ['GET', '/api/agents'],
  ['POST', '/api/agents'],
  ['GET', '/api/skills'],
  ['GET', '/api/memory'],
  ['GET', '/api/vault'],
  ['GET', '/api/cron'],
  ['POST', '/api/cron'],
  ['GET', '/api/git/status'],
  ['GET', '/api/bots'],
  ['GET', '/api/commands'],
  ['GET', '/api/browser/state'],
  ['GET', '/api/tests'],
  ['GET', '/api/themes'],
  ['GET', '/api/usage'],
  ['GET', '/api/todos'],
  ['GET', '/api/metrics'],
  ['GET', '/api/users'],
  ['PATCH', '/api/auth/settings'],
  ['GET', '/api/share'],
  ['POST', '/api/share/agent'],
  ['POST', '/api/share/session'],
  ['DELETE', '/api/share/abc123'],
  ['POST', '/api/auth/logout'],
];
for (const [m, p] of gated) assert(isAuthGatePublic(m, p) === false, `gated: ${m} ${p}`);

// ─── Hook scope ───
assert(isAuthGateJudged('/api/files') === true, '/api judged');
assert(isAuthGateJudged('/api/files?cwd=/x') === true, '/api with query judged');
assert(isAuthGateJudged('/health') === false, '/health not judged');
assert(isAuthGateJudged('/ws/sess_1') === false, 'ws not judged by hook');
assert(isAuthGateJudged('/') === false, 'spa root not judged');

console.log(`\nOK: ${passed} auth-gate policy asserts passed`);
