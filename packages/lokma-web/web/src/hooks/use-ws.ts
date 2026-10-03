import { useCallback, useEffect, useRef, useState } from 'react';
import { useAgentStore } from '@/stores/agent';
import { useSessionStore } from '@/stores/session';
import {
  MAX_RECONNECT_ATTEMPTS,
  abortMessage,
  applyServerFrame,
  dropLiveTrace,
  decodeServerFrame,
  directWsUrl,
  dropRequest,
  initialWsUiState,
  permissionAnswer,
  projectAckMessage,
  promptMessage,
  questionAnswer,
  reconnectDelay,
  sessionsListMessage,
  terminalInput,
  terminalKill,
  terminalResize,
  transcriptGetMessage,
  withAuthToken,
  wsUrl,
  type CostTotal,
  type PermissionRequest,
  type PromptFile,
  type PromptImage,
  type QuestionRequest,
  type ReasoningEffort,
  type ServerMessage,
  type ToolCallEntry,
  type UiActionRequest,
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
 * REQ-149: the same forwarding feeds the session store (list pushes +
 * transcript snapshots/appends) and every (re)connect asks for the session
 * list once, so sidebar/transcript liveness rides the socket instead of a poll.
 * The hook also publishes socket liveness (`noteWsOpen`/`noteWsClose`) — the
 * sidebar keeps its 4 s REST poll only as a socket-less fallback.
 */

export type SendOpts = {
  model?: string;
  contextPaths?: string[];
  reasoningEffort?: ReasoningEffort;
  /** REQ-186: attached images (downscaled base64) riding the prompt frame. */
  images?: PromptImage[];
  /** REQ-187: attached text files (capped content) riding the prompt frame. */
  files?: PromptFile[];
};

export type UseWs = {
  status: WsStatus;
  messages: ServerMessage[];
  stream: string;
  thinking: string;
  toolCalls: Record<string, ToolCallEntry>;
  /** REQ-111: live stream cuts in arrival order (view interleaves tool rows). */
  toolMarks: Array<{ callId: string; at: number }>;
  cost: CostTotal;
  /**
   * REQ-174: did the last reasoning run actually publish thinking? `false`
   * when it asked (level != off) and streamed none — the meta line then says
   * so; `null` when the last run did not ask.
   */
  reasoningPublished: boolean | null;
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
  /** Agent UI-control queue (REQ-057) — the shell opens panes per entry. */
  uiActions: UiActionRequest[];
  /** Latest auto-retry notice (REQ-077) — toast/badge only. */
  retry: { attempt: number; maxAttempts: number; waitMs: number; message: string } | null;
  done: boolean;
  lastError: string | null;
  /** REQ-136: code of the last error frame — the UI words the card from it. */
  lastErrorCode: string | null;
  /**
   * REQ-132: drop the live trace (stream + thinking + tool rows) after the
   * finished transcript has been refetched — otherwise the answer renders
   * twice (persisted row + still-populated live buffers).
   */
  clearLiveTrace: () => void;
  sendText: (prompt: string, opts?: SendOpts) => void;
  sendPrompt: (prompt: string, opts?: SendOpts) => void;
  answerPermission: (requestId: string, decision: 'allow' | 'deny' | 'always') => void;
  answerQuestion: (requestId: string, answer: string) => void;
  interrupt: () => void;
  /**
   * REQ-149: ask for one session's transcript over the socket (session open +
   * reconnect catch-up). The answer is a `transcript` frame; later growth
   * arrives as `transcript_append` — no REST reload needed.
   */
  requestTranscript: (sessionId: string) => void;
  /** Write stdin bytes to a live shell (answer arrives as `terminal/data`). */
  sendTerminal: (terminalId: string, data: string) => void;
  /** Record the pane size for a live shell. */
  resizeTerminal: (terminalId: string, cols: number, rows: number) => void;
  /** End a live shell (server confirms with `terminal/exit`). */
  killTerminal: (terminalId: string) => void;
  /** Drop one consumed agent UI action from the queue (REQ-057). */
  dismissUiAction: (actionId: string) => void;
  /**
   * REQ-182: answer an `open_project` confirmation frame — 'done' confirms
   * (or nobody was attached to confirm), 'cancelled' means the user
   * dismissed the modal. Resolves the server gate the tool waits on.
   */
  sendProjectAck: (actionId: string, outcome: 'done' | 'cancelled') => void;
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
  /**
   * REQ-149: last transcript this pane asked for. Kept across (re)connects so
   * the socket re-asks the moment it opens again — one request catches the
   * pane up instead of a REST reload or a poll.
   */
  const wantedTranscriptRef = useRef('');
  /**
   * REQ-149: socket liveness for the sidebar poll gate. Guarded by this ref so
   * a socket that closes twice (onclose + disconnect) never decrements twice.
   */
  const liveRef = useRef(false);

  const markLive = useCallback(() => {
    if (liveRef.current) return;
    liveRef.current = true;
    useSessionStore.getState().noteWsOpen();
  }, []);

  const markDead = useCallback(() => {
    if (!liveRef.current) return;
    liveRef.current = false;
    useSessionStore.getState().noteWsClose();
  }, []);

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

      /**
       * REQ-162 (found while probing the terminal): a superseded socket must
       * be INERT. `connect()` closes the previous socket and opens a new one,
       * and the old socket's `onclose` used to fire with `manualRef` false —
       * scheduling a spurious reconnect that left TWO live sockets feeding
       * the same state. Every delivered frame then arrived twice: typed
       * terminal characters painted twice ('aabbcc'), transcript rows
       * duplicated, and a stale close could release the poll gate under a
       * live socket. Guard every handler on "am I the current socket?".
       */
      const isCurrent = () => wsRef.current === ws;

      ws.onopen = () => {
        if (!isCurrent()) return;
        attemptRef.current = 0;
        setStatus('open');
        markLive();
        // REQ-149: every (re)connect asks for the session list once — the
        // socket becomes a list subscriber, so a reconnect catches up with a
        // single request and the sidebar can retire its REST poll.
        ws.send(sessionsListMessage());
        // REQ-149: and one transcript re-ask for the session this pane shows —
        // the same single catch-up request covers a dropped socket.
        const wanted = wantedTranscriptRef.current;
        if (wanted && wanted === sessionRef.current) ws.send(transcriptGetMessage(wanted));
      };
      ws.onmessage = (ev: MessageEvent) => {
        if (!isCurrent()) return;
        const msg = decodeServerFrame(ev.data);
        if (!msg) return;
        setMessages((prev) => [...prev, msg]);
        setUi((prev) => applyServerFrame(prev, msg));
        // Live agent presence for the Hub + Orchestration panes (W4-14).
        // The store ignores every non-`agent_state` frame, so this is safe
        // for chat/terminal traffic.
        useAgentStore.getState().applyWsEvent(msg);
        // REQ-149: session data (list pushes + transcript snapshots/appends)
        // folds into the session store — it ignores every other frame type.
        useSessionStore.getState().applyWsEvent(msg);
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
        // A superseded socket closing is not a disconnect — the live one
        // keeps the session (and must not be doubled by a stale reconnect).
        if (!isCurrent()) return;
        markDead();
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
    [clearTimer, markLive, markDead],
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
    markDead();
    setStatus('closed');
  }, [clearTimer, markDead]);

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
      // REQ-149: unmounting the last chat pane must release the poll gate.
      markDead();
    };
  }, [connect, sessionId, markDead]);

  const sendText = useCallback((prompt: string, opts: SendOpts = {}) => {
    const text = prompt.trim();
    // REQ-186/187: an attachment-only prompt (image or file, no text) is a
    // legitimate send — only a frame carrying nothing at all is dropped.
    if (!text && !(opts.images?.length || opts.files?.length)) return;
    // A new prompt starts a new run — clear the previous run's trace with it.
    setUi((prev) => ({ ...prev, stream: '', thinking: '', done: false, doneReason: null, lastError: null, lastErrorCode: null, toolCalls: {}, toolMarks: [], retry: null }));
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

  /**
   * REQ-149: transcript-by-socket. The chat asks when a pane opens; the
   * request is remembered, so a reconnect re-asks it (one catch-up request)
   * without the caller having to know the socket died.
   */
  const requestTranscript = useCallback((id: string) => {
    if (!id) return;
    wantedTranscriptRef.current = id;
    socketSend(wsRef.current, transcriptGetMessage(id));
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

  const dismissUiAction = useCallback((actionId: string) => {
    if (!actionId) return;
    setUi((prev) => ({ ...prev, uiActions: prev.uiActions.filter((a) => a.actionId !== actionId) }));
  }, []);

  /** REQ-182: resolve the agent's open_project wait (see UseWs above). */
  const sendProjectAck = useCallback((actionId: string, outcome: 'done' | 'cancelled') => {
    if (!actionId) return;
    socketSend(wsRef.current, projectAckMessage(actionId, outcome));
  }, []);

  /**
   * REQ-132: called by the chat shell right after a finished run's transcript
   * was refetched. Dropping the live buffers is what stops the reply (and its
   * thinking block) from painting a second time under the persisted rows.
   */
  const clearLiveTrace = useCallback(() => {
    setUi((prev) => dropLiveTrace(prev));
  }, []);

  return {
    status,
    messages,
    stream: ui.stream,
    thinking: ui.thinking,
    toolCalls: ui.toolCalls,
    toolMarks: ui.toolMarks,
    cost: ui.cost,
    /** REQ-174: honesty verdict of the last reasoning run (`false` = asked but silent). */
    reasoningPublished: ui.reasoningPublished,
    permissions: ui.permissions,
    questions: ui.questions,
    uiActions: ui.uiActions,
    retry: ui.retry,
    done: ui.done,
    lastError: ui.lastError,
    lastErrorCode: ui.lastErrorCode,
    clearLiveTrace,
    sendText,
    sendPrompt: sendText,
    answerPermission,
    answerQuestion,
    interrupt,
    requestTranscript,
    sendTerminal,
    resizeTerminal,
    killTerminal,
    dismissUiAction,
    sendProjectAck,
    reconnect: connect,
    disconnect,
    connect,
  };
}

export type { QuestionRequest };
