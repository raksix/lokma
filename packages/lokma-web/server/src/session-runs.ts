import type { ApprovalDecision } from './agent-loop.js';

/**
 * Session-scoped run queue (REQ-070). One entry per sessionId — NOT per
 * socket — so a refresh (socket close) never kills the run: the loop keeps
 * going, frames fan out to whatever sockets are attached, and the
 * transcript (JSONL) stays the source of truth a reconnected client reads.
 *
 * Server restarts drop the map (in-memory by design): no phantom "running"
 * survives a reboot because status lives here, not on disk.
 */

/** Minimal socket surface the queue needs (fastify-websocket `ws` satisfies it). */
export type RunSocket = {
  readyState: number;
  send: (data: string) => void;
};

export const SOCKET_OPEN = 1;

export type QueuedPrompt = {
  prompt: string;
  model?: string;
  contextPaths?: string[];
  /** Resolved at enqueue time (the socket may be gone when the turn runs). */
  userId?: string;
  enqueuedAt: string;
};

export type PendingGate =
  | { kind: 'approval'; tool: string; resolve: (d: ApprovalDecision) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  | { kind: 'answer'; resolve: (a: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export type SessionRunState = {
  queue: QueuedPrompt[];
  running: boolean;
  abort: AbortController | null;
  gates: Map<string, PendingGate>;
  sockets: Set<RunSocket>;
};

const runs = new Map<string, SessionRunState>();

/** Get-or-create the run state for a session (pure map access — probe it). */
export function getRunState(sessionId: string): SessionRunState {
  let state = runs.get(sessionId);
  if (!state) {
    state = { queue: [], running: false, abort: null, gates: new Map(), sockets: new Set() };
    runs.set(sessionId, state);
  }
  return state;
}

/** Drop idle state so the map cannot grow with dead sessions (running runs keep theirs). */
export function pruneRunState(sessionId: string): boolean {
  const state = runs.get(sessionId);
  if (!state || state.running || state.queue.length > 0 || state.sockets.size > 0) return false;
  return runs.delete(sessionId);
}

/** Enqueue a prompt behind whatever is already running (FIFO). Returns queue depth after push. */
export function enqueuePrompt(sessionId: string, item: QueuedPrompt): number {
  const state = getRunState(sessionId);
  state.queue.push(item);
  return state.queue.length;
}

/** Live status for `GET /api/sessions/:id/run` (reconnect badge + polling). */
export function runStatus(sessionId: string): { running: boolean; queued: number } {
  const state = runs.get(sessionId);
  if (!state) return { running: false, queued: 0 };
  return { running: state.running, queued: state.queue.length };
}

/**
 * Fan a frame out to every attached OPEN socket. Closed/dead sockets are
 * dropped silently — a refresh mid-stream must never break the run.
 */
export function broadcast(state: SessionRunState, data: string): number {
  let delivered = 0;
  for (const socket of state.sockets) {
    try {
      if (socket.readyState !== SOCKET_OPEN) continue;
      socket.send(data);
      delivered += 1;
    } catch {
      // Dead socket — pruned on close; never fails the run.
    }
  }
  return delivered;
}

/** Test seam — reset the whole map between probe cases. */
export function __resetRunStates(): void {
  runs.clear();
}
