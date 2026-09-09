/**
 * Auth-gate public-path policy (REQ-076) — PURE, zero imports, unit-tested.
 * The global gate (`auth-gate.ts`) denies every `/api/*` request without a
 * valid token while the login gate is active, EXCEPT the paths below:
 * - liveness probes (`/health`, `/api/health`) — no secrets, PM2/nginx need
 *   them without credentials;
 * - the login/bootstrap handshake itself (`POST /api/auth/login|register|
 *   accept-invite|onboarding` + `GET /api/auth/settings`, which returns only
 *   policy flags + the bootstrapped bit the boot gate needs);
 * - unguessable-token public share links (`GET /api/share/:token`,
 *   `GET /share/:token`, `GET /share/:kind/:token`) — the token IS the
 *   secret, shared externally by design (nginx proxies `/share/` openly).
 * Everything else under `/api/*` (including future routes) is gated by
 * default: allowlist, never denylist. Non-`/api` paths (`/`, `/ws/*`,
 * static) are NOT judged here — the hook skips them (WS has its own
 * handshake check, the SPA shell is public but data-free without a token).
 */

/** Normalize: strip query/hash, drop one trailing slash (except root). */
export function normalizeGatePath(rawUrl: string): string {
  const noQuery = rawUrl.split('?')[0].split('#')[0];
  if (noQuery.length > 1 && noQuery.endsWith('/')) return noQuery.slice(0, -1);
  return noQuery || '/';
}

/**
 * True when `method + rawUrl` is public even with the login gate active.
 * Unknown paths return false (closed by default).
 */
export function isAuthGatePublic(method: string, rawUrl: string): boolean {
  const m = method.toUpperCase();
  const path = normalizeGatePath(rawUrl);

  // Liveness — no secrets.
  if (m === 'GET' && (path === '/health' || path === '/api/health')) return true;

  // Login / bootstrap handshake.
  if (m === 'GET' && path === '/api/auth/settings') return true;
  if (m === 'POST' && path === '/api/auth/login') return true;
  if (m === 'POST' && path === '/api/auth/register') return true;
  if (m === 'POST' && path === '/api/auth/accept-invite') return true;
  if (m === 'POST' && path === '/api/auth/onboarding') return true;

  // Public share links — token in the path is the secret. Only frozen-copy
  // GETs are public; list/create/delete stay gated.
  if (m === 'GET' && path.startsWith('/api/share/') && path.length > '/api/share/'.length) return true;
  if (m === 'GET' && path.startsWith('/share/') && path.length > '/share/'.length) return true;

  return false;
}

/** True when the global hook judges this request at all (only `/api/*`). */
export function isAuthGateJudged(rawUrl: string): boolean {
  return normalizeGatePath(rawUrl).startsWith('/api/');
}
