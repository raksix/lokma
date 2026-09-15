/**
 * REQ-149 — session data over the websocket (server half).
 *
 * The sidebar list and the chat transcript used to arrive over REST, with a
 * 4 s poll for liveness. This module owns the socket counterpart:
 *
 *  - a socket can WATCH a session's transcript — every row
 *    `SessionStore.append` writes is pushed as a `transcript_append` frame,
 *    so the chat no longer needs a REST reload to show growth;
 *  - a socket can WATCH the session list — `sessions` frames are re-pushed
 *    (debounced: one recompute per append burst) so the sidebar can drop its
 *    REST poll entirely;
 *  - `listRowsFor` answers the one-shot `sessions_list` snapshot request.
 *
 * Both paths apply the same `canViewSession` ownership rule as the REST
 * routes (REQ-094), so a socket never receives a session its caller could
 * not read over HTTP. A null user is the gate-off legacy mode (sees all),
 * exactly like `GET /api/sessions` without a login gate.
 *
 * Wire shapes come from `lokma-shared`; this file only maps core store types
 * to wire rows and keeps the fan-out bookkeeping. The append subscription is
 * process-wide (attached on the first socket) because rows land through the
 * store from anywhere in the server: REST routes, the WS prompt path, the
 * session-delivery pump.
 */
import {
  canViewSession,
  listAllSummaries,
  onSessionAppend,
  type SessionMessage,
  type SessionSummary,
  type User,
} from '@lokma/core';
import { encodeServerMessage, type ServerMessage, type SessionRow, type TranscriptRow } from '@lokma/shared';
import { runStatus, SOCKET_OPEN, type RunSocket } from './session-runs.js';

/** One list recompute per append burst — not one per appended row. */
const LIST_PUSH_DEBOUNCE_MS = 750;

/** Minimal socket surface the feed needs (fastify-websocket `ws` satisfies it). */
export type FeedSocket = RunSocket;

const transcriptSubs = new Map<string, Set<FeedSocket>>();
const listSubs = new Map<FeedSocket, { user: User | null }>();
let listTimer: ReturnType<typeof setTimeout> | null = null;
let feedAttached = false;

/** Map one persisted transcript line to its wire row (no extra fields leak). */
export function toTranscriptRow(message: SessionMessage): TranscriptRow {
  const row: TranscriptRow = {
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
  };
  if (message.toolCallId) row.toolCallId = message.toolCallId;
  if (message.toolName) row.toolName = message.toolName;
  return row;
}

/**
 * Map one sidebar summary to its wire row. Run flags (REQ-121) ride along —
 * without them a socket-fed sidebar would lose the working-session badges
 * the REST list carries.
 */
export function toSessionRow(summary: SessionSummary): SessionRow {
  return { ...summary, ...runStatus(summary.id) };
}

/**
 * Sidebar rows for one caller: every project dir (REQ-087), ownership
 * filtered exactly like `GET /api/sessions` (REQ-094). `user` null is the
 * gate-off legacy mode and returns everything.
 */
export async function listRowsFor(user: User | null): Promise<SessionRow[]> {
  const sessions = await listAllSummaries();
  const visible = user ? sessions.filter((s) => canViewSession(user, s.ownerId)) : sessions;
  return visible.map(toSessionRow);
}

/** Send one frame, swallowing dead-socket errors (never fails a caller). */
function send(socket: FeedSocket, frame: ServerMessage): void {
  try {
    if (socket.readyState !== SOCKET_OPEN) return;
    socket.send(encodeServerMessage(frame));
  } catch {
    // Dead socket — pruned on close; a push never fails an append.
  }
}

/** Attach the process-wide append subscription once (first socket). */
function ensureFeed(): void {
  if (feedAttached) return;
  feedAttached = true;
  onSessionAppend((ev) => {
    const sockets = transcriptSubs.get(ev.sessionId);
    if (sockets && sockets.size > 0) {
      const frame: ServerMessage = {
        type: 'transcript_append',
        sessionId: ev.sessionId,
        message: toTranscriptRow(ev.message),
      };
      for (const socket of sockets) send(socket, frame);
    }
    // Any append can change a sidebar row (messageCount/order) — refresh watchers.
    scheduleListPush();
  });
}

/** Watch one session's transcript. Idempotent per socket. */
export function subscribeSessionTranscript(sessionId: string, socket: FeedSocket): void {
  ensureFeed();
  let set = transcriptSubs.get(sessionId);
  if (!set) {
    set = new Set();
    transcriptSubs.set(sessionId, set);
  }
  set.add(socket);
}

/**
 * Watch the session list. Idempotent: a repeat call swaps the stored user,
 * so a socket that asks twice never stacks duplicate subscriptions.
 */
export function subscribeSessionList(socket: FeedSocket, user: User | null): void {
  ensureFeed();
  listSubs.set(socket, { user });
}

/** Drop every subscription of one socket (called on socket close). */
export function unsubscribeSocket(socket: FeedSocket): void {
  for (const [sessionId, set] of transcriptSubs) {
    set.delete(socket);
    if (set.size === 0) transcriptSubs.delete(sessionId);
  }
  listSubs.delete(socket);
}

function scheduleListPush(): void {
  if (listSubs.size === 0 || listTimer) return;
  listTimer = setTimeout(() => {
    listTimer = null;
    void pushLists().catch(() => {
      // A transient read race is retried by the next append burst — never
      // throw back into the append caller.
    });
  }, LIST_PUSH_DEBOUNCE_MS);
}

/** Recompute the list once, then send each watcher its own filtered view. */
async function pushLists(): Promise<void> {
  if (listSubs.size === 0) return;
  const sessions = await listAllSummaries();
  for (const [socket, sub] of [...listSubs]) {
    // Bind to a local: a property access loses its narrowing inside the
    // callback, so `sub.user` would still carry `| null` there.
    const user = sub.user;
    const visible = user ? sessions.filter((s) => canViewSession(user, s.ownerId)) : sessions;
    send(socket, { type: 'sessions', sessions: visible.map(toSessionRow) });
  }
}

/** Test seam — clear subscriptions + pending timer (the append hook stays). */
export function __resetSessionFeed(): void {
  transcriptSubs.clear();
  listSubs.clear();
  if (listTimer) {
    clearTimeout(listTimer);
    listTimer = null;
  }
}
