/**
 * Office frame bridge — the client half of REQ-204 slice 3 (the live canvas).
 *
 * Lives in `lib/` for the same reason as `loop-frame.ts`: the socket layer
 * (`hooks/use-ws.ts`) dispatches and the office pane listens, so neither side
 * imports the other — a component import here would drag the office pane (and
 * the vendored renderer) into the chat's initial chunk.
 *
 * Frames are the SAME wire events the chat already receives (`tool_start`,
 * `tool_result`, `permission_request`, `ask_user_question`, `done`, `error`).
 * The office adds no second feed; it folds what the socket already carries.
 */
import type { ServerMessage } from '@lokma/shared/protocol/ws';

/** Frame -> office pane bridge. */
export const OFFICE_FRAME_EVENT = 'lokma:office-frame';

export type OfficeFrame =
  | { kind: 'tool_start'; sessionId: string; callId: string; tool: string; input: unknown }
  | { kind: 'tool_result'; sessionId: string; callId: string; result: unknown; isError: boolean }
  /** A user gate (approval or question) arrived unanswered. */
  | { kind: 'gate'; sessionId: string }
  | { kind: 'run_end'; sessionId: string; ok: boolean | null };

/**
 * `done` carries a reason, not a verdict: only `complete`/`error` are
 * verdicts. `aborted` stays null — a cancelled run is neither ok nor failed
 * (slice-1 rule: no invented ticks or crosses).
 */
export function runEndOkFromDone(reason: 'complete' | 'aborted' | 'error'): boolean | null {
  if (reason === 'complete') return true;
  if (reason === 'error') return false;
  return null;
}

/**
 * Translate one wire frame into the office's frame shape, or null when the
 * frame is not office-relevant (the caller then dispatches nothing).
 *
 * `gate_settled` does not exist on the wire: the server answers a gate by
 * simply moving on, and the NEXT observable event for that session (a tool
 * starting/returning, or the run ending) is the honest proof — the fold
 * settles one pending gate on those events instead of guessing.
 */
export function officeFrameOf(msg: ServerMessage): OfficeFrame | null {
  switch (msg.type) {
    case 'tool_start':
      return { kind: 'tool_start', sessionId: msg.sessionId, callId: msg.callId, tool: msg.tool, input: msg.input };
    case 'tool_result':
      return { kind: 'tool_result', sessionId: msg.sessionId, callId: msg.callId, result: msg.result, isError: msg.isError };
    case 'permission_request':
    case 'ask_user_question':
      return { kind: 'gate', sessionId: msg.sessionId };
    case 'done':
      return { kind: 'run_end', sessionId: msg.sessionId, ok: runEndOkFromDone(msg.reason) };
    case 'error':
      // An error frame without a session cannot be attributed — skip it
      // rather than filing a failure against every worker.
      return msg.sessionId ? { kind: 'run_end', sessionId: msg.sessionId, ok: false } : null;
    default:
      return null;
  }
}

/** Announce one office-relevant frame to every mounted office pane. */
export function announceOfficeFrame(frame: OfficeFrame): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent<OfficeFrame>(OFFICE_FRAME_EVENT, { detail: frame }));
  } catch {
    // Non-browser runtimes have no office to refresh.
  }
}
