/**
 * WS client helpers — DRY URL builder and message types.
 * Reuses ServerMessage / ClientMessage from lokma-shared.
 */

export function wsUrl(sessionId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Vite dev :3457 proxies /api, WS goes direct to :3456 (same in prod via nginx)
  const host = window.location.hostname;
  const port = '3456';
  return `${proto}//${host}:${port}/ws/${sessionId}`;
}

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';
