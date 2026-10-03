/**
 * Browser proxy routes (REQ-193), slice 4 — the wiring.
 *
 * Slices 1-3 built the three halves of the path and NOTHING called them:
 * `url-policy.ts` validates, `rewrite.ts` rewrites, `fetch.ts` fetches. This
 * module is the single server-side surface the pane loads, so it is where the
 * two user-visible promises of the REQ are actually kept:
 *
 *   1. `http://127.0.0.1:3014/` in the pane means the SERVER's port, not the
 *      viewer's. The symptom in the attached screenshots ("127.0.0.1 bağlanmayı
 *      reddetti") is exactly a remote install asking the client browser for a
 *      loopback address that only exists on the box. The proxy answers from the
 *      server's network, so the pane gets a document either way.
 *   2. `X-Frame-Options` becomes meaningless — the response comes back from the
 *      proxy's own origin, so a site that refuses third-party framing renders
 *      here without any per-site special case.
 *
 * TWO deliberate non-goals, both stated in the REQ rather than silently
 * skipped:
 * - No fake tunnel. `lokma tunnel` is a later slice; this route never invents a
 *   public URL.
 * - No cookie jar. The proxy has its own origin, so an `httponly` session
 *   cookie cannot be replayed upstream — shipping the pane's own `cookie`/
 *   `authorization` headers to an arbitrary target would be a credential leak,
 *   not a convenience. Login-gated pages get the external-tab hint in the pane.
 *
 * Auth: this path is under `/api/`, so the global login gate (REQ-076) already
 * covers it with no per-route code. The pane's iframe is same-origin with the
 * app, so the `lokma_token` cookie rides along and `requestToken` reads it —
 * an iframe cannot set an Authorization header, and must not need to.
 */

import type { FastifyInstance } from 'fastify';
import { BrowserError } from '@lokma/core';
import { fetchThroughProxy, resolveWsTarget } from './fetch.js';
import { PROXY_PATH, WS_PROXY_PATH } from './rewrite.js';

export { PROXY_PATH, WS_PROXY_PATH };

/** Headers we set ourselves rather than copying from upstream. */
const OWN_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
};

/**
 * Answer a proxied document (or any subresource the rewriter points at).
 *
 * Bytes are handed over as a Buffer, not a bare Uint8Array: Fastify serializes
 * anything it does not recognise as a Buffer, and a Uint8Array would reach the
 * browser as `{"0":137,"1":80,…}` instead of an image.
 */
export async function browserProxyRoutes(app: FastifyInstance): Promise<void> {
  app.get(PROXY_PATH, async (req, reply) => {
    const query = req.query as { url?: unknown };
    try {
      // fetchThroughProxy re-validates the url AND every redirect hop with the
      // shared policy, so a blocked target (metadata IP, bare loopback) is
      // refused before a socket is opened — the BrowserError carries the 400.
      const result = await fetchThroughProxy(query.url);

      for (const [name, value] of Object.entries(result.headers)) reply.header(name, value);
      for (const [name, value] of Object.entries(OWN_HEADERS)) reply.header(name, value);
      // The final url is how the pane knows where a redirect chain landed.
      reply.header('x-lokma-proxy-url', result.finalUrl);
      if (result.redirects > 0) reply.header('x-lokma-proxy-redirects', String(result.redirects));

      reply.status(result.status);
      if (typeof result.body === 'string') {
        return reply.type('text/html; charset=utf-8').send(result.body);
      }
      return reply.send(Buffer.from(result.body));
    } catch (e) {
      if (e instanceof BrowserError) {
        return reply.status(e.status).send({ code: e.code, message: e.message });
      }
      // An unexpected failure must still be honest — a 500 the pane can show
      // beats an empty frame that reads as "the site is broken".
      req.log.warn({ err: e }, 'browser proxy failed');
      return reply.status(502).send({ code: 'proxy_failed', message: (e as Error).message });
    }
  });

  registerBrowserWsProxy(app);
}

/**
 * Websocket half of the proxy: `ws://`/`wss://` references are rewritten to
 * this path, so live pages (dev servers with HMR, dashboards, terminals) work
 * through the proxy instead of being silently dead.
 *
 * Registered only when @fastify/websocket is present. That keeps the HTTP half
 * of this module mountable in a bare Fastify (the unit probe builds one), and
 * it is the same condition the app already satisfies in `app.ts`.
 */
function registerBrowserWsProxy(app: FastifyInstance): void {
  if (!app.hasDecorator('websocketServer')) return;

  app.get(WS_PROXY_PATH, { websocket: true }, (socket, req) => {
    const query = req.query as { url?: unknown };
    let target: URL;
    try {
      // Same shared policy as HTTP: a ws:// target aimed at a private host is
      // refused with the same allowlist exception, so websockets cannot become
      // the hole the http path closed.
      target = resolveWsTarget(query.url);
    } catch (e) {
      const message = e instanceof BrowserError ? e.message : 'Invalid websocket target';
      socket.close(1008, message.slice(0, 120));
      return;
    }

    // Node 22 ships a global WebSocket client; no extra dependency needed.
    const upstream = new WebSocket(target.toString());
    upstream.binaryType = 'arraybuffer';

    upstream.addEventListener('open', () => socket.send(JSON.stringify({ type: 'lokma-ws-open' })));
    upstream.addEventListener('error', () => socket.close(1011, 'Upstream websocket failed'));
    upstream.addEventListener('close', (event: CloseEvent) => {
      if (socket.readyState === socket.OPEN) socket.close(1000, 'upstream closed');
      else socket.close(1011, 'upstream closed: ' + String(event.code));
    });
    upstream.addEventListener('message', (event) => {
      if (socket.readyState !== socket.OPEN) return;
      const data = event.data;
      if (typeof data === 'string') socket.send(data);
      else if (data instanceof ArrayBuffer) socket.send(Buffer.from(new Uint8Array(data)));
    });

    // The `ws` socket's addEventListener is untyped (its .on() overloads are not
    // listener-shaped), so the event is annotated rather than inferred.
    socket.addEventListener('message', (event: MessageEvent) => {
      if (upstream.readyState !== WebSocket.OPEN) return;
      const data = event.data;
      if (typeof data === 'string') upstream.send(data);
      else if (data instanceof ArrayBuffer) upstream.send(data);
    });
    socket.addEventListener('close', () => {
      try {
        upstream.close();
      } catch {
        /* already closing — nothing to do */
      }
    });
  });
}