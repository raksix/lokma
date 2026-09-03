import { useCallback, useEffect, useRef, useState } from 'react';
import { useAgentStore } from '@/stores/agent';
import {
  MAX_RECONNECT_ATTEMPTS,
  abortMessage,
  applyServerFrame,
  decodeServerFrame,
  directWsUrl,
  dropRequest,
  initialWsUiState,
  permissionAnswer,
  promptMessage,
  questionAnswer,
  reconnectDelay,
  terminalInput,
  terminalKill,
  terminalResize,
  withAuthToken,
  wsUrl,
  type CostTotal,
  type PermissionRequest,
  type QuestionRequest,
  type ServerMessage,
  type ToolCallEntry,
  type WsStatus,
  type WsUiState,
} from '@/lib/ws';

/**
 * useWs — typed WS hook for harness chat streaming.
 * Connects `/ws/:sessionId` (vite proxy first, direct `:3456` fallback),
 * auto-reconnects with capped backoff, and folds every validated server frame
 * into React state via the pure `applyServerFrame` reducer.
 * Single hook, reused by Chat and every future pane (no duplication).
 * Every decoded frame is also forwarded to the agent store — `agent_state`
 * frames keep the Hub + Orchestration panes live without polling (W4-14).
 */

export type SendOpts = { model?: string; contextPaths?: string[] };

export type UseWs = {
  status: WsStatus;
  messages: ServerMessage[];
  stream: string;
  toolCalls: Record<string, ToolCallEntry>;
  cost: CostTotal;
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
  done: boolean;
  lastError: string | null;
  sendText: (prompt: string, opts?: SendOpts) => void;
  sendPrompt: (prompt: string, opts?: SendOpts) => void;
  answerPermission: (requestId: string, decision: 'allow' | 'deny' | 'always') => void;
  answerQuestion: (requestId: string, answer: string) => void;
  interrupt: () => void;
  /** Write stdin bytes to a live shell (answer arrives as `terminal/data`). */
  sendTerminal: (terminalId: string, data: string) => void;
  /** Record the pane size for a live shell. */
  resizeTerminal: (terminalId: string, cols: number, rows: number) => void;
  /** End a live shell (server confirms with `terminal/exit`). */
  killTerminal: (terminalId: string) => void;
  reconnect: () => void;
  disconnect: () => void;
  connect: () => void;
};

function socketSend(ws: WebSocket | null, payload: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(payload);
}

export function useWs(sessionId: string): UseWs {
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualRef = useRef(false);
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  const [status, setStatus] = useState<WsStatus>('idle');
  const [messages, setMessages] = useState<ServerMessage[]>([]);
  const [ui, setUi] = useState<WsUiState>(() => initialWsUiState());

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const openSocket = useCallback(
    (url: string) => {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        setStatus('open');
      };
      ws.onmessage = (ev: MessageEvent) => {
        const msg = decodeServerFrame(ev.data);
        if (!msg) return;
        setMessages((prev) => [...prev, msg]);
        setUi((prev) => applyServerFrame(prev, msg));
        // Live agent presence for the Hub + Orchestration panes (W4-14).
        // The store ignores every non-`agent_state` frame, so this is safe
        // for chat/terminal traffic.
        useAgentStore.getState().applyWsEvent(msg);
      };
      ws.onerror = () => {
        // Error details arrive via onclose; just make sure a dead socket closes.
        if (ws.readyState !== WebSocket.CLOSED) {
          try {
            ws.close();
          } catch {
            // Already gone — onclose handles the rest.
          }
        }
      };
      ws.onclose = () => {
        if (manualRef.current) {
          setStatus('closed');
          return;
        }
        const attempt = attemptRef.current;
        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
          setStatus('error');
          return;
        }
        attemptRef.current = attempt + 1;
        setStatus('connecting');
        clearTimer();
        const proxied = attempt === 0;
        timerRef.current = setTimeout(() => {
          if (manualRef.current) return;
          // First retry keeps the proxy path; later retries try the direct port.
          const retryUrl = proxied
            ? wsUrl(sessionRef.current)
            : directWsUrl(sessionRef.current);
          openSocket(withAuthToken(retryUrl));
        }, reconnectDelay(attempt));
      };
    },
    [clearTimer],
  );

  const connect = useCallback(() => {
    if (!sessionRef.current || typeof WebSocket === 'undefined') return;
    manualRef.current = false;
    attemptRef.current = 0;
    clearTimer();
    try {
      wsRef.current?.close();
    } catch {
      // No live socket — opening a fresh one below.
    }
    setStatus('connecting');
    openSocket(withAuthToken(wsUrl(sessionRef.current)));
  }, [clearTimer, openSocket]);

  const disconnect = useCallback(() => {
    manualRef.current = true;
    clearTimer();
    try {
      wsRef.current?.close();
    } catch {
      // Socket already gone.
    }
    wsRef.current = null;
    setStatus('closed');
  }, [clearTimer]);

  useEffect(() => {
    manualRef.current = false;
    connect();
    return () => {
      manualRef.current = true;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      try {
        wsRef.current?.close();
      } catch {
        // Socket already gone.
      }
      wsRef.current = null;
    };
  }, [connect, sessionId]);

  const sendText = useCallback((prompt: string, opts: SendOpts = {}) => {
    const text = prompt.trim();
    if (!text) return;
    // A new prompt starts a new run — clear the previous run's trace with it.
    setUi((prev) => ({ ...prev, stream: '', done: false, doneReason: null, toolCalls: {} }));
    socketSend(wsRef.current, promptMessage(text, sessionRef.current, opts));
  }, []);

  const answerPermission = useCallback(
    (requestId: string, decision: 'allow' | 'deny' | 'always') => {
      socketSend(wsRef.current, permissionAnswer(requestId, decision));
      setUi((prev) => ({ ...prev, permissions: dropRequest(prev.permissions, requestId) }));
    },
    [],
  );

  const answerQuestion = useCallback((requestId: string, answer: string) => {
    socketSend(wsRef.current, questionAnswer(requestId, answer));
    setUi((prev) => ({ ...prev, questions: dropRequest(prev.questions, requestId) }));
  }, []);

  const interrupt = useCallback(() => {
    // Keep the partial stream visible — stopping preserves what arrived so far.
    socketSend(wsRef.current, abortMessage(sessionRef.current));
  }, []);

  const sendTerminal = useCallback((terminalId: string, data: string) => {
    if (!terminalId || !data) return;
    socketSend(wsRef.current, terminalInput(terminalId, data));
  }, []);

  const resizeTerminal = useCallback((terminalId: string, cols: number, rows: number) => {
    if (!terminalId) return;
    socketSend(wsRef.current, terminalResize(terminalId, cols, rows));
  }, []);

  const killTerminal = useCallback((terminalId: string) => {
    if (!terminalId) return;
    socketSend(wsRef.current, terminalKill(terminalId));
  }, []);

  return {
    status,
    messages,
    stream: ui.stream,
    toolCalls: ui.toolCalls,
    cost: ui.cost,
    permissions: ui.permissions,
    questions: ui.questions,
    done: ui.done,
    lastError: ui.lastError,
    sendText,
    sendPrompt: sendText,
    answerPermission,
    answerQuestion,
    interrupt,
    sendTerminal,
    resizeTerminal,
    killTerminal,
    reconnect: connect,
    disconnect,
    connect,
  };
}

export type { QuestionRequest };
