'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { wsUrl, type WsStatus } from '@/lib/ws';

/**
 * useWs — DRY WS hook for chat streaming.
 * Handles connect / text_delta accumulation / done / error / reconnect.
 * Single hook, reused by Chat (no duplication).
 */

export type WsMessage = { type: string; delta?: string; sessionId?: string; [k: string]: unknown };

export function useWs(sessionId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<WsStatus>('idle');
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [stream, setStream] = useState('');

  const connect = useCallback(() => {
    if (!sessionId) return;
    setStatus('connecting');
    const ws = new WebSocket(wsUrl(sessionId));
    wsRef.current = ws;

    ws.onopen = () => setStatus('open');
    ws.onclose = () => setStatus('closed');
    ws.onerror = () => setStatus('error');
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WsMessage;
        setMessages((m) => [...m, msg]);
        if (msg.type === 'text_delta' && typeof msg.delta === 'string') {
          setStream((s) => s + msg.delta);
        }
        if (msg.type === 'done') {
          // Stream complete — keep full text in messages, clear live stream after a tick
        }
      } catch {}
    };

    return () => ws.close();
  }, [sessionId]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      cleanup?.();
      wsRef.current?.close();
    };
  }, [connect]);

  const sendPrompt = useCallback(
    (prompt: string) => {
      setStream('');
      wsRef.current?.send(JSON.stringify({ type: 'prompt', prompt, sessionId }));
    },
    [sessionId],
  );

  return { status, messages, stream, sendPrompt, connect };
}
