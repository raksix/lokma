import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';

/**
 * WebSocket plugin — wraps @fastify/websocket.
 * Provides app.websocketServer and route-level { websocket: true }.
 */
export async function registerWebsocket(app: FastifyInstance): Promise<void> {
  await app.register(websocket, {
    options: { maxPayload: 1024 * 1024 },
  });
}
