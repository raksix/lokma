import type { ReasoningEffort } from '@lokma/shared/protocol/ws';
import type { SessionFile } from '@lokma/core';
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
  /** REQ-133: composer thinking budget, forwarded to the provider adapter. */
  reasoningEffort?: ReasoningEffort;
  /** REQ-187: user-attached files for THIS prompt (content already capped). */
  files?: SessionFile[];
  /** Resolved at enqueue time (the socket may be gone when the turn runs). */
  userId?: string;
  enqueuedAt: string;
  /**
   * REQ-201: correlation tag for a caller that is not the socket — the loop
   * executor mints one per turn and matches it back on the finished report.
   * Matching on prompt TEXT would be guesswork (a user can type the same
   * sentence), so the tag travels with the queued item instead.
   */
  tag?: string;
};

export type PendingGate =
  | { kind: 'approval'; tool: string; resolve: (d: ApprovalDecision) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  | { kind: 'answer'; resolve: (a: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  // REQ-182: the open_project modal's answer ('done' | 'cancelled').
  | { kind: 'project_ack'; resolve: (o: 'done' | 'cancelled') => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export type SessionRunState = {
  queue: QueuedPrompt[];
  running: boolean;
  abort: AbortController | null;
  gates: Map<string, PendingGate>;
  sockets: Set<RunSocket>;
};

const runs = new Map<string, SessionRunState>();

/**
 * REQ-201: what a finished turn actually cost and did. The pump resolves the
 * waiting caller's promise with this instead of the caller polling a queue it
 * cannot see drain — a loop must MEASURE its own iteration, and the measurement
 * only exists where the run happened.
 *
 * `didWork` is the empty-turn guard's evidence, and it is deliberately NOT
 * "the assistant said something": a turn can answer in prose forever and never
 * touch the workspace. A turn counts as work when it ran a tool or wrote a
 * file; only the caller decides what that means for its own bookkeeping.
 */
export type TurnReport = {
  outcome: 'complete' | 'aborted' | 'error';
  /** Measured wall time of the turn in seconds. */
  seconds: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** True when the loop paused/aborted this turn — no usage is billed. */
  billed: boolean;
  /** Real progress: a tool ran or a file was written. */
  didWork: boolean;
  /** Transcript row count after the turn (progress proxy for callers). */
  rows: number;
  /** Failure reason when `outcome === 'error'` (never a raw stack). */
  error?: string;
};

/** REQ-201: tag → the caller waiting on that turn. */
const turnReports = new Map<string, (report: TurnReport) => void>();

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
  turnReports.clear();
}

/**
 * REQ-201: register a waiter for the turn carrying `tag`. MUST be called
 * BEFORE the prompt is enqueued, otherwise a fast pump can finish the turn
 * first and the report would be delivered to nobody (the classic
 * default-matcher trap: bind the collaborator first).
 *
 * A timeout is mandatory. A turn that never reports — provider hang, queue
 * pruned, pump crashed — must resolve as an honest `error`, never leave the
 * loop waiting forever with its budget frozen.
 */
export function awaitTurnReport(tag: string, timeoutMs: number): Promise<TurnReport> {
  return new Promise<TurnReport>((resolve) => {
    let settled = false;
    const finish = (report: TurnReport): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      turnReports.delete(tag);
      resolve(report);
    };
    const timer = setTimeout(() => {
      finish({
        outcome: 'error',
        seconds: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        billed: false,
        didWork: false,
        rows: 0,
        error: 'turn_timeout',
      });
    }, timeoutMs);
    // A pending waiter must never hold the process open (loop turns are
    // fire-and-forget from the ticker's perspective).
    (timer as unknown as { unref?: () => void }).unref?.();
    turnReports.set(tag, finish);
  });
}

/**
 * REQ-201: hand a finished turn's report to whoever registered its tag.
 * Returns false when nobody is waiting (an ordinary socket turn, or a waiter
 * that already timed out) — a missing waiter is never an error.
 */
export function settleTurnReport(tag: string | undefined, report: TurnReport): boolean {
  if (!tag) return false;
  const waiter = turnReports.get(tag);
  if (!waiter) return false;
  waiter(report);
  return true;
}

/** REQ-201: is a waiter registered for this tag? (probe seam) */
export function hasTurnWaiter(tag: string): boolean {
  return turnReports.has(tag);
}
