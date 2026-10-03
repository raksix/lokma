/**
 * Upstream fetch for the browser proxy (REQ-193), slice 3.
 *
 * `GET /api/browser/proxy?url=...` must answer from the SERVER's network, so
 * this module is where outbound requests happen and therefore where the SSRF
 * guard has to be re-checked — once for the requested url and AGAIN for every
 * redirect hop. The re-check is the whole reason this is a separate module
 * instead of an inline `fetch` in the route: a guarded first hop is worthless
 * if a `302` to `http://169.254.169.254/latest/meta-data/` walks straight
 * past it, and the second hop arrives with a Location header nobody inspected.
 *
 * The url policy itself is NOT re-implemented here — `assertProxyTarget` from
 * `@lokma/core` is the single policy shared with the headless engine, so a host
 * blocked for the pane is blocked for the agent's browser too. The local
 * allowlist (`LOKMA_BROWSER_LOCAL_HOSTS`) survives a redirect, which is the
 * documented exception, not an oversight: the server's own services are
 * exactly what a remote install wants to preview.
 *
 * Response body handling is content-type driven and NOT uniform, because a
 * blind rewrite corrupts non-HTML:
 * - `text/html` + `xhtml` → rewritten with `rewriteHtml`, so every subresource
 *   comes back through the proxy;
 * - everything else → bytes streamed through untouched, with hop-by-hop and
 *   framing headers stripped (a `Content-Encoding` header survives a
 *   decompressed body is exactly how a page renders as binary garbage);
 * - cookies are NOT forwarded and NOT stored: the proxy has its own origin, so
 *   an `httponly` session cookie could not be replayed anyway. The pane says so
 *   and offers an external tab for login-gated pages.
 */

import {
  assertProxyTarget,
  BrowserError,
  detectLoginWall,
  isPrivateHostLiteral,
  type ProxyTarget,
} from '@lokma/core';
import { proxyUrlFor, rewriteHtml, WS_PROXY_PATH } from './rewrite.js';

/** Wall-clock cap for the whole upstream request including redirects. */
export const PROXY_FETCH_TIMEOUT_MS = 20_000;

/** Redirect hops followed before giving up. */
export const PROXY_MAX_REDIRECTS = 5;

/** Hard cap on the document body we buffer for rewriting (bytes). */
export const PROXY_HTML_CAP = 8 * 1024 * 1024;

/** Request headers worth forwarding upstream; everything else is dropped. */
const FORWARD_REQUEST_HEADERS = ['accept', 'accept-language', 'user-agent'];

/** Response headers that must never pass through (hop-by-hop / framing). */
const STRIP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  // Hop-by-hop above; these leak the proxy's own origin/cookie jar decisions.
  'set-cookie',
  'set-cookie2',
  'content-encoding',
  'content-length',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'frame-options',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
]);

/** Content types whose body is a document we rewrite. */
const HTML_TYPES = ['text/html', 'application/xhtml+xml', 'application/xhtml'];

export type ProxyFetchOptions = {
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request cap override (tests use tiny values). */
  htmlCap?: number;
  /** Redirect cap override. */
  maxRedirects?: number;
  /** Total budget override. */
  timeoutMs?: number;
  /** Pre-split local allowlist (tests never touch env). */
  allowlist?: string[];
};

export type ProxyResponse = {
  /** Absolute url actually fetched (after redirects). */
  finalUrl: string;
  /** Status code to answer the pane with. */
  status: number;
  /** Response headers safe to hand to the browser. */
  headers: Record<string, string>;
  /** Rewritten HTML document, or the untouched body for other types. */
  body: string | Uint8Array;
  /** True when the body came back rewritten as a document. */
  rewritten: boolean;
  /** Number of redirects followed. */
  redirects: number;
  /**
   * REQ-193 slice 9 — whether this document is a login gate rather than the
   * page the user asked for. Reported as DATA (never inferred from prose) so
   * the pane can say so and offer an external tab instead of showing a login
   * form that can never authenticate through the proxy's own origin.
   */
  loginWall: boolean;
};

function isHtml(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const value = contentType.split(';')[0]!.trim().toLowerCase();
  return HTML_TYPES.some((t) => value === t || value.startsWith(t + '+'));
}

/**
 * Request headers we send upstream.
 *
 * Deliberately NOT forwarded: the pane's own `cookie`, `authorization` and
 * `origin`/`referer`. The pane and the target are different origins by
 * construction, so shipping the user's session headers to an arbitrary target
 * would be a credential leak, not a convenience. `accept-language` and
 * `user-agent` are safe because they carry no secrets and many sites serve a
 * broken page without them.
 */
function buildForwardHeaders(): Record<string, string> {
  const out: Record<string, string> = {
    'user-agent': 'Lokma-Browser-Proxy/1.0 (+server-side fetch)',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
  };
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = process.env['LOKMA_BROWSER_PROXY_' + name.toUpperCase().replace(/-/g, '_')];
    if (value) out[name] = value;
  }
  return out;
}

function safeHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) out[key] = value;
  });
  return out;
}

/**
 * Validate the request url AND every redirect target.
 *
 * Split out so the route can refuse an obviously bad target with an honest
 * 400 before any socket is opened, and so the redirect re-check is visibly the
 * same function rather than a lookalike copy.
 */
export function resolveProxyChain(
  raw: unknown,
  options: { maxRedirects?: number; allowlist?: string[] } = {},
): { target: ProxyTarget; maxRedirects: number } {
  const target = assertProxyTarget(raw, { allowlist: options.allowlist });
  return { target, maxRedirects: options.maxRedirects ?? PROXY_MAX_REDIRECTS };
}

/**
 * Follow the chain, re-validating each hop, and return the final response with
 * a document body rewritten to ride the proxy.
 */
export async function fetchThroughProxy(
  raw: unknown,
  options: ProxyFetchOptions = {},
): Promise<ProxyResponse> {
  const doFetch = options.fetchImpl ?? fetch;
  const htmlCap = options.htmlCap ?? PROXY_HTML_CAP;
  const timeoutMs = options.timeoutMs ?? PROXY_FETCH_TIMEOUT_MS;
  const { target, maxRedirects } = resolveProxyChain(raw, options);

  const deadline = Date.now() + timeoutMs;
  let current = target;
  let redirects = 0;

  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new BrowserError('timeout', 'Proxy fetch timed out', 504);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    let res: Response;
    try {
      res = await doFetch(current.url.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: buildForwardHeaders(),
      });
    } catch (e) {
      clearTimeout(timer);
      throw new BrowserError('proxy_fetch_failed', 'Could not reach ' + current.url.host + ': ' + (e as Error).message, 502);
    }
    clearTimeout(timer);

    const status = res.status;
    const location = res.headers.get('location');
    if (status >= 300 && status < 400 && location) {
      // Drain the body so the socket is released, then validate the hop with
      // the SAME policy. A Location pointing at a private host dies here.
      void res.arrayBuffer().catch(() => undefined);
      if (redirects >= maxRedirects) {
        throw new BrowserError('too_many_redirects', 'Too many redirects while proxying', 502);
      }
      redirects += 1;
      const next = new URL(location, current.url).toString();
      const hop = assertProxyTarget(next, { allowlist: options.allowlist });
      current = hop;
      continue;
    }

    const headers = safeHeaders(res);
    const finalUrl = current.url.toString();

    if (!isHtml(res.headers.get('content-type'))) {
      const buf = new Uint8Array(await res.arrayBuffer());
      // No document to inspect, so only the STATUS can speak here — an image
      // endpoint that answers 401/403 is still a gate the pane should say so
      // about, and a 200 binary body is never a login wall.
      const loginWall = detectLoginWall({ status, finalUrl, redirects, html: null }).loginWall;
      return { finalUrl, status, headers, body: buf, rewritten: false, redirects, loginWall };
    }

    const rawText = await res.text();
    if (Buffer.byteLength(rawText, 'utf8') > htmlCap) {
      throw new BrowserError('proxy_too_large', 'Document exceeds the proxy size cap', 502);
    }
    // <base href> points at the proxy for THIS document so relative references
    // resolve through the proxy without us rewriting each one.
    const rewritten = rewriteHtml(rawText, finalUrl, { baseHref: proxyUrlFor(finalUrl) });
    // Detection runs on the ORIGINAL text, never the rewritten document: the
    // rewrite adds a <base> and proxy urls to every reference, which would make
    // every path look non-empty and mask the very signal being looked for.
    const loginWall = detectLoginWall({ status, finalUrl, redirects, html: rawText }).loginWall;
    return { finalUrl, status, headers, body: rewritten, rewritten: true, redirects, loginWall };
  }
}

/**
 * Upgrade a websocket request to the upstream ws target.
 *
 * Returns the connect options for the socket so the route can hand them to
 * `ws`; validation is the shared policy again (ws/ws urls only, private hosts
 * refused unless allowlisted).
 */
export function resolveWsTarget(raw: unknown, allowlist?: string[]): URL {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new BrowserError('bad_url', 'url must be a non-empty string', 400);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new BrowserError('bad_url', 'url is not a valid websocket address', 400);
  }
  const httpUrl = new URL(parsed.toString());
  httpUrl.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
  // assertProxyTarget owns every private-network decision; do not duplicate it.
  assertProxyTarget(httpUrl.toString(), { allowlist });
  return parsed;
}

/** Websocket proxy path (re-exported so the route imports one module). */
export { WS_PROXY_PATH, isPrivateHostLiteral };