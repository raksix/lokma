/**
 * Browser proxy URL policy (REQ-193).
 *
 * ONE policy, two callers: the server-side iframe proxy
 * (`GET /api/browser/proxy?url=...`) and the headless browser engine both
 * validate a target URL through the predicates here, so a host blocked for
 * the pane is blocked for the agent's engine too.
 *
 * Why this exists at all: the browser pane hands the raw target URL straight to
 * the user's iframe, so a remote install asks the CLIENT to reach
 * `127.0.0.1:<port>` — the client's own machine, not the server's. The proxy
 * route fetches from the server's network instead, which means the server is
 * now the one making outbound requests: the guard is mandatory, and it is
 * deliberately the same shape the engine already used (RFC1918 / loopback /
 * link-local / CGNAT refusal), with ONE documented exception.
 *
 * The exception: a remote install legitimately wants to preview the server's
 * OWN services (the classic case in the REQ screenshots is `127.0.0.1:3014`).
 * That is opt-in per host through `LOKMA_BROWSER_LOCAL_HOSTS` (comma/space
 * separated `host` or `host:port` entries); without it the literal loopback
 * refusal stands, so the guard never silently opens a private-network pivot.
 */

import { BrowserError } from './browser.js';

/** Max URL chars accepted before `bad_url` (mirrors `BROWSER_URL_CAP`). */
export const PROXY_URL_CAP = 2048;

/** Env var naming the private hosts the proxy may reach on purpose. */
export const LOCAL_HOSTS_ENV = 'LOKMA_BROWSER_LOCAL_HOSTS';

/** Host suffix forms that are never public even without a DNS answer. */
const PRIVATE_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];
const PRIVATE_HOST_NAMES = ['localhost', 'metadata.google.internal', 'instance-data'];

/**
 * True when the host LITERALLY names a private/loopback/link-local target
 * (no DNS involved). Sync + pure on purpose: the route layer can reject
 * `169.254.169.254` without a resolver round-trip, and tests assert it
 * without any network.
 */
export function isPrivateHostLiteral(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return true;
  if (PRIVATE_HOST_NAMES.includes(host)) return true;
  if (PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (host === '::1' || host === '::' || host === '0.0.0.0') return true;
  // IPv4 literals.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local (cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  // IPv6 unique-local (fc/fd) and link-local (fe8..feb).
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
  // IPv4-mapped IPv6 (`::ffff:127.0.0.1`) must not slip past the v4 branch.
  const mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateHostLiteral(mapped[1]);
  // A host that is not an IP at all is not decidable here — the DNS layer
  // answers that (an attacker-controlled name resolving to 127.0.0.1 is the
  // case this module delegates on purpose).
  return false;
}

/** Parse the `LOKMA_BROWSER_LOCAL_HOSTS` allowlist into comparable entries. */
export function localHostAllowlist(env?: Record<string, string | undefined>): string[] {
  const source = env ?? (typeof process !== 'undefined' ? process.env : ({} as Record<string, string | undefined>));
  const raw = source[LOCAL_HOSTS_ENV];
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase().replace(/^\[|\]$/g, ''))
    .filter(Boolean);
}

/**
 * Is this host explicitly allowed to be a private/local target? Entries match
 * a bare host (`127.0.0.1`, `*.internal` is NOT implied — write the exact
 * name) or a `host:port` pair, which then only opens that port.
 */
export function isAllowedLocalHost(host: string, port: string | null, allowlist = localHostAllowlist()): boolean {
  if (allowlist.length === 0) return false;
  const clean = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  return allowlist.some((entry) => {
    const idx = entry.lastIndexOf(':');
    const hasPort = idx > 0 && /^\d+$/.test(entry.slice(idx + 1));
    if (hasPort) {
      const entryHost = entry.slice(0, idx);
      const entryPort = entry.slice(idx + 1);
      return entryHost === clean && (port === null || entryPort === port);
    }
    return entry === clean;
  });
}

export type ProxyTarget = {
  /** Normalized absolute URL the proxy will fetch. */
  url: URL;
  /** True when the host matched `LOKMA_BROWSER_LOCAL_HOSTS` (private allowed). */
  localAllowed: boolean;
};

export type AssertProxyTargetOptions = {
  /** Allow private hosts listed in the allowlist (default true). */
  allowLocal?: boolean;
  /** Pre-split allowlist (tests pass one in instead of touching env). */
  allowlist?: string[];
};

/**
 * Validate a proxy target. Throws `BrowserError`:
 * - `bad_url` — not a string / empty / too long / unparseable / non-http(s) /
 *   carries credentials;
 * - `blocked_url` — a private/loopback/link-local literal that is not on the
 *   local allowlist.
 *
 * Deliberately sync: the route layer can answer an obvious SSRF attempt
 * (metadata IP, `localhost`) without ever touching the network.
 */
export function assertProxyTarget(raw: unknown, options: AssertProxyTargetOptions = {}): ProxyTarget {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new BrowserError('bad_url', 'url must be a non-empty string', 400);
  }
  const trimmed = raw.trim();
  if (trimmed.length > PROXY_URL_CAP) {
    throw new BrowserError('bad_url', 'url must be under ' + PROXY_URL_CAP + ' chars', 400);
  }
  // A bare host/authority gets https; anything already schemed is parsed as-is.
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : 'https://' + trimmed;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new BrowserError('bad_url', 'url is not a valid web address', 400);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BrowserError('bad_url', 'Only http(s) urls can be proxied (got ' + url.protocol + ')', 400);
  }
  if (url.username || url.password) {
    throw new BrowserError('bad_url', 'Proxied urls must not carry credentials', 400);
  }
  if (!url.hostname) {
    throw new BrowserError('bad_url', 'url is not a valid web address', 400);
  }
  const allowlist = options.allowlist ?? localHostAllowlist();
  const localAllowed = options.allowLocal !== false && isAllowedLocalHost(url.hostname, url.port || null, allowlist);
  if (!localAllowed && isPrivateHostLiteral(url.hostname)) {
    throw new BrowserError(
      'blocked_url',
      'Refusing a private/loopback host (' + url.hostname + '). Add it to ' + LOCAL_HOSTS_ENV + ' to allow it on purpose.',
      400,
    );
  }
  return { url, localAllowed };
}