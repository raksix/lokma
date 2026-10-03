/**
 * Unit probe for the browser proxy HTML rewriter (REQ-193).
 * Run: `bun src/browser-proxy/rewrite.test.ts` from `packages/lokma-web/server`.
 * Plain asserts, no framework, no network: the module is pure string work.
 * `*.test.ts` is excluded from this package's tsconfig, so the probe never
 * reaches the published build.
 */
import {
  PROXY_PATH,
  WS_PROXY_PATH,
  proxyUrlFor,
  rewriteHtml,
  rewriteRef,
  rewriteSrcset,
  wsProxyUrlFor,
} from './rewrite';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

const BASE = 'https://target.example/app/page';
const BASE_HREF = proxyUrlFor(BASE);

// --- url builders --------------------------------------------------------------
assert(PROXY_PATH === '/api/browser/proxy', 'proxy path is the documented route');
assert(WS_PROXY_PATH === '/api/browser/ws', 'websocket proxy path is separate');
assert(
  proxyUrlFor('http://127.0.0.1:3014/') === '/api/browser/proxy?url=' + encodeURIComponent('http://127.0.0.1:3014/'),
  'proxy url encodes the target',
);
assert(wsProxyUrlFor('wss://target.example/socket') === '/api/browser/ws?url=' + encodeURIComponent('wss://target.example/socket'), 'ws proxy url encodes the target');

// --- rewriteRef ----------------------------------------------------------------
const abs = rewriteRef('https://cdn.example/x.js', BASE);
assert(abs.absolute === true, 'an absolute http(s) src counts as absolute');
assert(abs.value.startsWith(PROXY_PATH + '?url='), 'an absolute src is routed through the proxy');
assert(abs.value.includes(encodeURIComponent('https://cdn.example/x.js')), 'the absolute target survives encoding');

// A relative ref IS rewritten, and this is not cosmetic: per the HTML spec a
// root-relative ref resolves against the <base> tag's ORIGIN and throws its
// query away, so `<base href="/api/browser/proxy?url=…">` alone would send
// `/static/app.css` to the Lokma app (a 200 SPA index.html), not the target.
const rel = rewriteRef('/static/app.css', BASE);
assert(rel.value.startsWith(PROXY_PATH + '?url='), 'a relative src is routed through the proxy, not left to the <base> origin');
assert(rel.value.includes(encodeURIComponent('https://target.example/static/app.css')), 'the relative ref resolves against the document url first');
assert(rel.absolute === false, 'a relative src stays relative in origin terms');

const protoRel = rewriteRef('//cdn.example/lib.js', BASE);
assert(protoRel.absolute === true, 'a protocol-relative src is absolute');
assert(protoRel.value.includes(encodeURIComponent('https://cdn.example/lib.js')), 'protocol-relative takes the DOCUMENT scheme (https)');

for (const keep of ['data:image/png;base64,AAAA', 'blob:https://x/y', 'about:blank', 'mailto:a@b.c', 'tel:+90', '#anchor', '', '   ']) {
  const got = rewriteRef(keep, BASE);
  assert(got.value === keep, 'left untouched: ' + JSON.stringify(keep));
}

const wsRef = rewriteRef('wss://live.example/room/1', BASE);
assert(wsRef.value.startsWith(WS_PROXY_PATH + '?url='), 'a wss: src goes to the websocket proxy, not the http proxy');
assert(!wsRef.value.startsWith(PROXY_PATH), 'ws never falls into the http proxy path');

// --- rewriteSrcset -------------------------------------------------------------
const srcset = rewriteSrcset('a.png 1x, https://cdn.example/b.png 2x, /c.png 3x', BASE);
assert(srcset.includes(encodeURIComponent('https://cdn.example/b.png') + ' 2x'), 'an absolute candidate is proxied and keeps its descriptor');
assert(srcset.includes('a.png 1x'), 'a relative candidate keeps its bytes');
assert(srcset.split(',').length === 3, 'the candidate list does not lose or merge entries');
assert(rewriteSrcset('  ', BASE) === '', 'an empty srcset stays empty');

// --- rewriteHtml ---------------------------------------------------------------
const doc = rewriteHtml(
  [
    '<!doctype html><html><head><title>T</title>',
    '<link rel="stylesheet" href="/css/site.css">',
    '<script src="https://cdn.example/app.js"></script>',
    '<meta http-equiv="refresh" content="0; url=/next">',
    '<meta http-equiv="refresh" content="3; URL=https://redirect.example/target">',
    '</head><body>',
    '<img src="/img/a.png" srcset="/img/a.png 1x, https://cdn.example/a2.png 2x">',
    '<a href="https://other.example/page">link</a>',
    '<img src="data:image/png;base64,AAAA">',
    '<form action="/submit" method="post"><button formaction="/submit2">go</button></form>',
    '<video poster="/poster.jpg"><source src="/v/movie.mp4"></video>',
    '</body></html>',
  ].join(''),
  BASE,
  { baseHref: BASE_HREF },
);

assert(doc.includes('<base href="' + BASE_HREF + '">'), 'a <base href> pointing at the proxy is injected');
assert(doc.indexOf('<base') < doc.indexOf('<link'), 'the <base> precedes the first referencing tag');
// Relative refs are rewritten rather than left to <base>: a root-relative path
// resolves against the base's ORIGIN and drops its query, so leaving it alone
// would request the Lokma app (`/css/site.css` → the SPA index.html, 200 OK).
const proxiedAbs = (target: string) => PROXY_PATH + '?url=' + encodeURIComponent(target);
assert(doc.includes('href="' + proxiedAbs('https://target.example/css/site.css') + '"'), 'a relative stylesheet is routed through the proxy');
assert(doc.includes(proxiedAbs('https://cdn.example/app.js')), 'an absolute script src is proxied');
assert(doc.includes(proxiedAbs('https://other.example/page')), 'an absolute anchor href is proxied');
assert(doc.includes('content="0; url=' + proxiedAbs('https://target.example/next') + '"'), 'a RELATIVE meta refresh is routed through the proxy too');
assert(doc.includes('content="3; URL=' + proxiedAbs('https://redirect.example/target') + '"'), 'an ABSOLUTE meta refresh is redirected through the proxy');
assert(doc.includes('src="data:image/png;base64,AAAA"'), 'a data: image survives byte-identical');
assert(doc.includes('action="' + proxiedAbs('https://target.example/submit') + '"') && doc.includes('formaction="' + proxiedAbs('https://target.example/submit2') + '"'), 'form actions are routed through the proxy');
assert(doc.includes('poster="' + proxiedAbs('https://target.example/poster.jpg') + '"') && doc.includes('src="' + proxiedAbs('https://target.example/v/movie.mp4') + '"'), 'poster and source src are routed through the proxy');
assert(doc.includes(encodeURIComponent('https://cdn.example/a2.png') + ' 2x'), 'an absolute srcset candidate is proxied with its descriptor');

// A page that already has a <base> must not get a second one, and its OWN base
// href is absolute — so it IS rewritten: leaving it alone would make the client
// browser resolve relative refs against the real origin, which is the leak the
// proxy exists to prevent.
const withBase = rewriteHtml('<html><head><base href="https://target.example/other"><link href="/x.css"></head></html>', BASE, { baseHref: BASE_HREF });
assert(withBase.match(/<base\b/gi)?.length === 1, 'an existing <base> is respected (no second injection)');
assert(
  withBase.includes('<base href="' + PROXY_PATH + '?url=' + encodeURIComponent('https://target.example/other') + '">'),
  "the document's own base href is routed through the proxy",
);

// injectBase:false is a supported opt-out.
const noInject = rewriteHtml('<html><head><link href="/x.css"></head></html>', BASE, { baseHref: BASE_HREF, injectBase: false });
assert(!/<base\b/i.test(noInject), 'injectBase:false adds no <base>');

// A document with no <head> still gets a usable one.
const noHead = rewriteHtml('<html><body><script src="https://cdn.example/a.js"></script></body></html>', BASE, { baseHref: BASE_HREF });
assert(noHead.includes('<head><base'), 'a headless document gets a <head> with the <base>');

// --- protected segments --------------------------------------------------------
const guarded = rewriteHtml(
  [
    '<html><head><script>',
    'var cfg = { url: "<img src=\'/not-rewritten.png\'>" };',
    'var s = \'<a href="https://never.example/">\';',
    '</script>',
    '<style>body{background:url(/img/bg.png)}</style>',
    '<!-- <img src="https://comment.example/c.png"> -->',
    '<textarea><img src="https://textarea.example/t.png"></textarea>',
    '<img src="/img/real.png">',
    '</html>',
  ].join(''),
  BASE,
  { baseHref: BASE_HREF },
);

assert(!guarded.includes(encodeURIComponent('https://never.example/')), 'a link inside inline script is NOT rewritten');
assert(!guarded.includes(encodeURIComponent('https://comment.example/c.png')), 'a link inside a comment is NOT rewritten');
assert(!guarded.includes(encodeURIComponent('https://textarea.example/t.png')), 'a link inside a textarea is NOT rewritten');
assert(!/<style>body\{background:url\(\/api/.test(guarded), 'CSS url() inside <style> is left to the server (documented limit)');
assert(guarded.includes('src="' + proxiedAbs('https://target.example/img/real.png') + '"'), 'a real img AFTER the protected block is still processed (the scanner resumes)');
assert(guarded.includes('<style>body{background:url(/img/bg.png)}</style>'), 'the protected style block is byte-identical');

// --- quoting -------------------------------------------------------------------
// A rewritten attribute must never carry a RAW `&` or `"`: the first would let
// an entity (`&quot;`) terminate the attribute, the second would do it outright.
// encodeURIComponent already encodes both in a normal target — assert the
// invariant on the output, not on one particular escaping style.
const ampersand = rewriteHtml(String.raw`<html><head><a href="https://x.example/a?b=1&c=2"></a><a href="/rel?x=1&y=2"></a></head></html>`, BASE, { baseHref: BASE_HREF });
const rewrittenHref = /<a href="([^"]*)"/.exec(ampersand.replace(/<base[^>]*>/, ''))?.[1] ?? '';
assert(rewrittenHref.startsWith(PROXY_PATH), 'the absolute href went through the proxy');
assert(!/[&"]/.test(rewrittenHref), 'a rewritten href carries no raw ampersand or quote');
assert(rewrittenHref.includes('%26'), 'the target query separator is encoded inside the proxy url');
assert(ampersand.includes('href="' + proxiedAbs('https://target.example/rel?x=1&y=2') + '"'), 'a relative href is proxied with its query encoded, not passed through raw');

console.log('\nbrowser proxy rewrite: ' + passed + '/' + passed + ' passed');
