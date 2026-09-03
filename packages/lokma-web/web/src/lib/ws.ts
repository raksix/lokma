/**
 * WS client for the Lokma harness server (Fastify `/ws/:sessionId`).
 * Single WebSocket entry point for the web app — all panes go through here (DRY).
 *
 * Source of truth for frame shapes is `lokma-shared` (Zod schemas) — this file
 * never hand-duplicates frame names, it only adds browser conveniences:
 * URL building (vite `/ws` proxy first, direct fallback), auth attach,
 * reconnect backoff, safe decode, and a pure UI reducer over server frames.
 */
import {
  ClientMessageSchema,
  ServerMessageSchema,
  type ClientMessage,
  type ServerMessage,
} from 'lokma-shared/protocol/ws';

export type { ClientMessage, ServerMessage };

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

/** Server frames the permission flow produces (narrowed for UI queues). */
export type PermissionRequest = Extract<ServerMessage, { type: 'permission_request' }>;
export type QuestionRequest = Extract<ServerMessage, { type: 'ask_user_question' }>;
/** Live shell output + exit frames behind the TerminalPane (W3-10). */
export type TerminalDataFrame = Extract<ServerMessage, { type: 'terminal/data' }>;
export type TerminalExitFrame = Extract<ServerMessage, { type: 'terminal/exit' }>;
export type ToolCallEntry = {
  tool: string;
  input: unknown;
  result?: unknown;
  isError?: boolean;
};
export type CostTotal = { inputTokens: number; outputTokens: number; costUsd: number; model: string };

/** Reducer state derived from the append-only server frame log. */
export type WsUiState = {
  stream: string;
  toolCalls: Record<string, ToolCallEntry>;
  cost: CostTotal;
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
  done: boolean;
  doneReason: string | null;
  lastError: string | null;
};

/** Max auto-reconnect attempts before the hook gives up with status `error`. */
export const MAX_RECONNECT_ATTEMPTS = 10;

/** Harness server port for non-proxied environments (dev direct, debugging). */
const DIRECT_PORT = '3456';
const TOKEN_KEY = 'lokma-token';

function readToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Primary WS URL — relative to the serving origin so it rides the vite `/ws`
 * proxy in dev (`:3457` → `:3456`) and nginx in prod. Never hardcode `:3456`
 * here: a hardcoded port bypasses the proxy and breaks behind HTTPS/nginx.
 */
export function wsUrl(sessionId: string): string {
  if (typeof window === 'undefined' || !window.location) {
    return `ws://127.0.0.1:${DIRECT_PORT}/ws/${encodeURIComponent(sessionId)}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/${encodeURIComponent(sessionId)}`;
}

/** Direct-to-server URL — fallback for environments without an `/ws` proxy. */
export function directWsUrl(sessionId: string): string {
  if (typeof window === 'undefined' || !window.location) {
    return `ws://127.0.0.1:${DIRECT_PORT}/ws/${encodeURIComponent(sessionId)}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.hostname}:${DIRECT_PORT}/ws/${encodeURIComponent(sessionId)}`;
}

/** Attach the Bearer token as `?token=` when the user logged in via `lokma auth`. */
export function withAuthToken(url: string): string {
  const token = readToken();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

/** Capped exponential backoff between reconnect attempts (deterministic, testable). */
export function reconnectDelay(attempt: number): number {
  const step = Math.max(0, Math.floor(attempt));
  return Math.min(500 * 2 ** step, 10_000);
}

/** Safely parse one incoming socket payload into a typed server frame. */
export function decodeServerFrame(data: unknown): ServerMessage | null {
  try {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    const parsed: unknown = JSON.parse(text);
    const result = ServerMessageSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// ─── Client message builders (validated by construction, no drift) ───────────

function checked(msg: ClientMessage): string {
  return JSON.stringify(ClientMessageSchema.parse(msg));
}

/** Start/continue the transcript with a user prompt. */
export function promptMessage(
  prompt: string,
  sessionId?: string,
  opts: { model?: string; contextPaths?: string[] } = {},
): string {
  return checked({ type: 'prompt', prompt, sessionId, model: opts.model, contextPaths: opts.contextPaths });
}

/** Stop the running stream (server answers with `done/aborted`). */
export function abortMessage(sessionId: string): string {
  return checked({ type: 'abort', sessionId });
}

/** Answer a `permission_request` frame (`always` persists a rule server-side). */
export function permissionAnswer(
  requestId: string,
  decision: 'allow' | 'deny' | 'always',
): string {
  return checked({ type: 'permission_response', requestId, decision });
}

/** Answer an `ask_user_question` frame (unblocks the stream). */
export function questionAnswer(requestId: string, answer: string): string {
  return checked({ type: 'ask_response', requestId, answer });
}

/** Write stdin bytes to a live shell (server answers with `terminal/data`). */
export function terminalInput(terminalId: string, data: string): string {
  return checked({ type: 'terminal/input', terminalId, data });
}

/** Record the pane size for a live shell (stored server-side). */
export function terminalResize(terminalId: string, cols: number, rows: number): string {
  return checked({ type: 'terminal/resize', terminalId, cols, rows });
}

/** End a live shell (server confirms with `terminal/exit`). */
export function terminalKill(terminalId: string): string {
  return checked({ type: 'terminal/kill', terminalId });
}

// ─── Pure UI reducer (React state derives from this, unit-tested) ────────────

export function initialWsUiState(): WsUiState {
  return {
    stream: '',
    toolCalls: {},
    cost: { inputTokens: 0, outputTokens: 0, costUsd: 0, model: '' },
    permissions: [],
    questions: [],
    done: false,
    doneReason: null,
    lastError: null,
  };
}

function addCost(total: CostTotal, msg: Extract<ServerMessage, { type: 'cost' }>): CostTotal {
  return {
    inputTokens: total.inputTokens + msg.inputTokens,
    outputTokens: total.outputTokens + msg.outputTokens,
    costUsd: total.costUsd + msg.costUsd,
    model: msg.model || total.model,
  };
}

/**
 * Fold one validated server frame into UI state.
 * Append-only: frames are never mutated, history lives in the hook's log.
 */
export function applyServerFrame(state: WsUiState, msg: ServerMessage): WsUiState {
  switch (msg.type) {
    case 'text_delta':
      return { ...state, stream: state.stream + msg.delta, done: false };
    case 'tool_start':
      return {
        ...state,
        toolCalls: { ...state.toolCalls, [msg.callId]: { tool: msg.tool, input: msg.input } },
      };
    case 'tool_result': {
      const prev = state.toolCalls[msg.callId];
      if (!prev) return state;
      return {
        ...state,
        toolCalls: {
          ...state.toolCalls,
          [msg.callId]: { ...prev, result: msg.result, isError: msg.isError },
        },
      };
    }
    case 'permission_request':
      return { ...state, permissions: [...state.permissions, msg] };
    case 'ask_user_question':
      return { ...state, questions: [...state.questions, msg] };
    case 'cost':
      return { ...state, cost: addCost(state.cost, msg) };
    case 'agent_state':
      return state;
    case 'terminal/data':
    case 'terminal/exit':
      // Terminal traffic belongs to the TerminalPane (it reads the same
      // frame log) — chat state never changes on shell output.
      return state;
    case 'done':
      return { ...state, done: true, doneReason: msg.reason };
    case 'error':
      return { ...state, lastError: msg.message };
  }
}

/** Remove an answered request from its queue (by requestId). */
export function dropRequest<T extends { requestId: string }>(queue: T[], requestId: string): T[] {
  return queue.filter((item) => item.requestId !== requestId);
}
