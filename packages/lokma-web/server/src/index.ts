import { createApp } from './app.js';

/**
 * Lokma server entry — Fastify 5 + WS.
 * Run: bun --filter lokma-server run dev  (--port 3456)
 *      node packages/lokma-web/server/dist/index.js --port 3456
 */

export async function startServer(opts: { port?: number; host?: string } = {}): Promise<void> {
  const port = opts.port ?? 3456;
  const host = opts.host ?? '127.0.0.1';
  const app = await createApp();
  await app.listen({ port, host });
  console.log(`[lokma-server] listening on http://${host}:${port} — health at /health`);
}

// Direct run (node dist/index.js)
const isDirect = import.meta.url === `file://${process.argv[1]}`;
if (isDirect) {
  const portArg = process.argv.find((a) => a.startsWith('--port'))?.split('=')[1]
    ?? process.argv[process.argv.indexOf('--port') + 1]
    ?? '3456';
  const port = Number(portArg) || 3456;
  startServer({ port }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
