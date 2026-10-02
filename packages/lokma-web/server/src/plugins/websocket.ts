import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';

/**
 * WebSocket plugin — wraps @fastify/websocket.
 * Provides app.websocketServer and route-level { websocket: true }.
 */
export async function registerWebsocket(app: FastifyInstance): Promise<void> {
  await app.register(websocket, {
    // REQ-186: user-attached images ride `prompt` frames as base64 — the old
    // 1 MB cap would close the socket (1009) on the first real screenshot.
    // The protocol caps per-image size and count, so this only bounds it.
    options: { maxPayload: 16 * 1024 * 1024 },
  });
}
