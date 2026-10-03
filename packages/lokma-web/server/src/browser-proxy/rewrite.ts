/**
 * HTML rewriter for the server-side browser proxy (REQ-193).
 *
 * ONE rewriter. The pane iframe loads `/api/browser/proxy?url=...`, so every
 * subresource the page asks for has to come back through the same route —
 * otherwise the document renders from the server's network while its scripts
 * load from the CLIENT's network, which is exactly the split that breaks on a
 * remote install (the classic symptom: `127.0.0.1:<port>` is the client's own
 * machine). This module turns a fetched document into one whose references all
 * point back at the proxy.
 *
 * How references get fixed:
 * - `<base href>` is injected so the BROWSER resolves every relative
 *   reference (links, form actions, plain `src="/x.js"`) through the proxy
 *   without us touching the attribute at all. That is why the attribute
 *   rewriter below is not the only line of defence.
 * - Attributes that already hold an ABSOLUTE url are rewritten to the proxy.
 * - `srcset`/`imagesrcset` hold comma-separated candidate lists, so each
 *   candidate is rewritten independently (a naive single-value rewrite
 *   corrupts them).
 * - `ws:`/`wss:` references become the websocket proxy path.
 * - `data:`, `blob:`, `about:`, `mailto:`, `tel:`, fragment-only (`#x`) and
 *   empty values are left byte-identical: they are not fetches and rewriting
 *   them breaks the page.
 *
 * Deliberately NOT rewritten: content inside `<script>`, `<style>`, comments
 * and `<textarea>`. Inline script string concatenation and CSS `url()` are a
 * separate problem with their own escaping rules; pretending to handle them
 * here would corrupt working pages. Those segments are protected by
 * `PROTECTED_RE` so an attribute-looking string inside them is never touched.
 */

/** HTTP proxy path the pane loads and subresources are rewritten to. */
export const PROXY_PATH = '/api/browser/proxy';

/** Websocket proxy path for `ws:`/`wss:` references. */
export const WS_PROXY_PATH = '/api/browser/ws';

/** Build a proxy url for an already-resolved absolute target. */
export function proxyUrlFor(absolute: string): string {
  return PROXY_PATH + '?url=' + encodeURIComponent(absolute);
}

/** Build a websocket proxy url for an absolute ws/wss target. */
export function wsProxyUrlFor(absolute: string): string {
  return WS_PROXY_PATH + '?url=' + encodeURIComponent(absolute);
}

/** Schemes that are never fetched over the network — leave them alone. */
const PASSTHROUGH_SCHEMES = ['data:', 'blob:', 'about:', 'mailto:', 'tel:', 'javascript:', 'filesystem:'];

function isPassthrough(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (!lower) return true;
  if (lower.startsWith('#')) return true;
  return PASSTHROUGH_SCHEMES.some((scheme) => lower.startsWith(scheme));
}

export type ResolvedRef = {
  /** Value the document should carry after rewriting. */
  value: string;
  /** True when the source value was already absolute (`http(s)`/`ws(s)`/`//`). */
  absolute: boolean;
};

/**
 * Rewrite ONE attribute value relative to the document's own url.
 *
 * `absolute` is reported because the caller wants absolute references to go
 * through the proxy even when `<base>` would technically cover them: a page
 * that hard-codes `https://cdn.example/x.js` would otherwise load that asset
 * from the client network and break (or leak the client's IP to the CDN).
 */
export function rewriteRef(raw: string, baseUrl: string): ResolvedRef {
  const value = raw.trim();
  if (isPassthrough(value)) return { value: raw, absolute: false };
  const base = new URL(baseUrl);
  let absoluteTarget: string;
  let absoluteSource: boolean;
  if (/^wss?:/i.test(value)) {
    absoluteTarget = value;
    absoluteSource = true;
  } else if (/^\/\//.test(value)) {
    // Protocol-relative: the scheme comes from the DOCUMENT, not the page.
    absoluteTarget = base.protocol + value;
    absoluteSource = true;
  } else if (/^https?:\/\//i.test(value)) {
    absoluteTarget = value;
    absoluteSource = true;
  } else {
    let resolved: URL;
    try {
      resolved = new URL(value, base);
    } catch {
      return { value: raw, absolute: false };
    }
    absoluteTarget = resolved.toString();
    absoluteSource = false;
  }
  const proxied = /^wss?:/i.test(absoluteTarget) ? wsProxyUrlFor(absoluteTarget) : proxyUrlFor(absoluteTarget);
  // `<base>` already makes relative refs hit the proxy, so a relative source
  // keeps its original bytes: rewriting it would double-encode the query.
  if (!absoluteSource && !proxied.startsWith(WS_PROXY_PATH)) {
    return { value: raw, absolute: false };
  }
  return { value: proxied, absolute: true };
}

/** `srcset`/`imagesrcset`: rewrite every candidate, keep descriptors intact. */
export function rewriteSrcset(raw: string, baseUrl: string): string {
  return raw
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return trimmed;
      const parts = trimmed.split(/\s+/);
      const rewritten = rewriteRef(parts[0], baseUrl);
      if (rewritten.value === parts[0]) return trimmed;
      return [rewritten.value].concat(parts.slice(1)).join(' ');
    })
    .filter((c) => c.length > 0)
    .join(', ');
}

/** Attributes whose value is a single url. */
const URL_ATTRS = new Set([
  'src',
  'href',
  'poster',
  'action',
  'formaction',
  'cite',
  'longdesc',
  'background',
  'manifest',
  'data-src',
  'data-href',
  'data-original',
  'lowsrc',
  'xlink:href',
]);

/** Attributes whose value is a candidate list. */
const SRCSET_ATTRS = new Set(['srcset', 'imagesrcset']);

/** `<meta http-equiv="refresh" content="0; url=/next">`. */
const META_REFRESH_URL_RE = /(url\s*=\s*)(['"]?)([^'"\s;]+)\2/i;

/** `<tag attr="value">` — value quoted or bare. */
const ATTR_RE = /(\s)([a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'<>]+)/g;

/**
 * Segments whose text is not markup we may rewrite.
 *
 * The OPENING TAG is captured separately from the content on purpose: its
 * attributes are ordinary markup (`<script src="/app.js">` really does have to
 * be rewritten), while only the text between the tags is off limits. Matching
 * `<script\b[\s\S]*?<\/script>` in one go protected the opening tag too, so a
 * script's own `src` never reached the proxy and the page loaded it from the
 * client network.
 */
const PROTECTED_RE = /(<!--[\s\S]*?-->)|(<(script|style|textarea)\b[^>]*>)([\s\S]*?)(<\/\3\s*>)/gi;

function unquote(value: string): { inner: string; quote: string } {
  const first = value.charAt(0);
  if ((first === '"' || first === "'") && value.charAt(value.length - 1) === first) {
    return { inner: value.slice(1, -1), quote: first };
  }
  return { inner: value, quote: '' };
}

/** Rewrite url attributes inside one markup segment. */
function rewriteSegment(segment: string, baseUrl: string): string {
  return segment.replace(ATTR_RE, (whole, lead: string, name: string, eq: string, rawValue: string) => {
    const attr = name.toLowerCase();
    const { inner, quote } = unquote(rawValue);
    let next: string | null = null;
    if (SRCSET_ATTRS.has(attr)) {
      const rewritten = rewriteSrcset(inner, baseUrl);
      if (rewritten !== inner) next = rewritten;
    } else if (URL_ATTRS.has(attr)) {
      const rewritten = rewriteRef(inner, baseUrl).value;
      if (rewritten !== inner) next = rewritten;
    } else if (attr === 'content') {
      const match = META_REFRESH_URL_RE.exec(inner);
      if (match) {
        const rewritten = rewriteRef(match[3], baseUrl).value;
        if (rewritten !== match[3]) next = inner.slice(0, match.index) + match[1] + match[2] + rewritten + match[2] + inner.slice(match.index + match[0].length);
      }
    }
    if (next === null) return whole;
    const out = next.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const quoted = quote ? quote + out + quote : out;
    return lead + name + eq + quoted;
  });
}

export type RewriteOptions = {
  /** Already-proxied base url to inject as `<base href>`. */
  baseHref: string;
  /** Insert `<base>` after `<head>`/`<html>` even when the page has none. */
  injectBase?: boolean;
};

/**
 * Rewrite a fetched HTML document so every reference rides the proxy.
 * Non-HTML input is returned untouched — the caller decides by content-type,
 * and a blind rewrite of a JS file corrupts it.
 */
export function rewriteHtml(html: string, baseUrl: string, options: RewriteOptions): string {
  const baseTag = '<base href="' + options.baseHref.replace(/"/g, '&quot;') + '">';
  let out = '';
  let cursor = 0;
  PROTECTED_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PROTECTED_RE.exec(html)) !== null) {
    // Group 2 is the opening tag (rewritable); group 4 is the content, which is
    // copied byte-identical. `match[0]` covers a comment, which is copied whole.
    out += rewriteSegment(html.slice(cursor, match.index), baseUrl);
    out += match[2] !== undefined ? rewriteSegment(match[2], baseUrl) + match[4] + match[5] : match[0];
    cursor = match.index + match[0].length;
  }
  out += rewriteSegment(html.slice(cursor), baseUrl);
  if (!/<base\b/i.test(out)) {
    if (options.injectBase !== false) {
      const head = /<head[^>]*>/i.exec(out);
      if (head) {
        out = out.slice(0, head.index + head[0].length) + baseTag + out.slice(head.index + head[0].length);
      } else {
        const htmlTag = /<html[^>]*>/i.exec(out);
        if (htmlTag) {
          out = out.slice(0, htmlTag.index + htmlTag[0].length) + '<head>' + baseTag + '</head>' + out.slice(htmlTag.index + htmlTag[0].length);
        }
      }
    }
  }
  return out;
}
