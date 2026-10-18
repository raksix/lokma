/**
 * REQ-205 slice 4 — the CLIENT-FREE run's UI state (browser-side keyless run).
 *
 * The free runner (slice 2) streams straight from the browser to OmniRoute;
 * this hook owns everything the chat surface needs around that call:
 *
 *  - the live view (`text` + `reasoning` deltas) the chat feeds into the same
 *    renderer the server-side stream uses — never a second render path;
 *  - the record hand-off (slice 3): when a run settles, its rows go to the
 *    server through `transcript_record` (the socket is the only writer) and
 *    the persisted transcript is reloaded before the local copy is dropped
 *    (the REQ-132 double-paint rule: persisted row + live buffer = twice);
 *  - honesty: the local copy is cleared ONLY after the server acked the
 *    record (`transcript_recorded`); a dead socket, a refused record or a
 *    session switch keeps the text on screen and says it was not saved —
 *    never a silent claim that it was. An identical batch is replay-safe by
 *    design (slice 3 answers `count 0`), so a reconnect resends it;
 *  - cancellation (REQ §4.6): one in-flight run per session; `abort()` kills
 *    the fetch via AbortController and the partial text keeps its value
 *    (persisted like the server path persists partial aborts).
 */
import * as React from 'react';
import { useSessionStore } from '@/stores';
import type { UseWs } from '@/hooks/use-ws';
import type { ClientFreeRecordRow, ServerMessage } from '@lokma/shared/protocol/ws';
import { freeHistoryMessages, freeRunRecordRows, runFreeChat } from '@/lib/free-runner';

export type FreeRunPhase = 'idle' | 'running' | 'settled';

/** What the chat surface shows for the client-free path. */
export type FreeRunView = {
  /**
   * `idle` — nothing local (the transcript is the source of truth);
   * `running` — streaming, Stop is armed;
   * `settled` — the call is over; text stays until the record lands, and a
   * failure message stays until the next prompt.
   */
  phase: FreeRunPhase;
  text: string;
  reasoning: string;
  /** Verbatim upstream failure (REQ §5: no rephrasing, no silent fallback). */
  error: string | null;
};

export type UseFreeRun = {
  view: FreeRunView;
  /** Begin one keyless run; `false` = a run is already in flight. */
  start: (prompt: string, modelId: string) => boolean;
  /** Abort the in-flight fetch (partial text survives). No-op when idle. */
  abort: () => void;
  /** Forget the current view (new prompt / session switch). */
  reset: () => void;
};

const IDLE_VIEW: FreeRunView = { phase: 'idle', text: '', reasoning: '', error: null };

/** Append a second reason without losing the first (both must stay visible). */
function joinError(prev: string | null, next: string | null): string | null {
  if (!prev) return next;
  if (!next) return prev;
  return prev + ' · ' + next;
}

/** How many record acks this session already produced in the frame log. */
function ackCountFor(messages: ServerMessage[], sessionId: string): number {
  let n = 0;
  for (const m of messages) {
    if (m.type === 'transcript_recorded' && m.sessionId === sessionId) n += 1;
  }
  return n;
}

function failCountFor(messages: ServerMessage[], sessionId: string): number {
  let n = 0;
  for (const m of messages) {
    if (m.type === 'error' && m.code === 'transcript_record_failed' && m.sessionId === sessionId) n += 1;
  }
  return n;
}

export function useFreeRun(
  sessionId: string,
  ws: UseWs,
  history: () => Array<{ role?: unknown; content?: unknown }>,
  opts: { onSettled?: (info: { saved: boolean }) => void } = {},
): UseFreeRun {
  const [view, setView] = React.useState<FreeRunView>(IDLE_VIEW);
  const onSettled = opts.onSettled;
  /** In-flight marker — also the single-run-per-session guard. */
  const controllerRef = React.useRef<AbortController | null>(null);
  /** The run being settled (what the record rows must describe). */
  const runRef = React.useRef<{ session: string; prompt: string; promptAt: string } | null>(null);
  /**
   * A record batch awaiting its ack. Counters are ABSOLUTE frame-log totals
   * captured at send time (`expectAcks`/`baseFails`) — a relative "seen"
   * counter would leak across sessions and a new session's ack would never
   * settle (frame totals are per-session, the ref is per-hook).
   */
  const pendingBatchRef = React.useRef<{
    rows: ClientFreeRecordRow[];
    expectAcks: number;
    baseFails: number;
  } | null>(null);
  const sessionRef = React.useRef(sessionId);
  sessionRef.current = sessionId;
  const framesRef = React.useRef<ServerMessage[]>([]);
  framesRef.current = ws.messages;
  const onSettledRef = React.useRef(onSettled);
  onSettledRef.current = onSettled;

  /** Send the batch and pin the frame-log totals it must be measured against. */
  const sendBatch = React.useCallback(
    (rows: ClientFreeRecordRow[], session: string) => {
      if (!ws.recordTranscript(rows)) return null;
      return {
        rows,
        expectAcks: ackCountFor(framesRef.current, session) + 1,
        baseFails: failCountFor(framesRef.current, session),
      };
    },
    [ws],
  );

  /** The record landed: refetch the transcript, then drop the local copy. */
  const settleSaved = React.useCallback((session: string) => {
    void useSessionStore
      .getState()
      .loadTranscript(session, true)
      .finally(() => {
        // Session switched mid-record — the new session's view is untouched.
        if (sessionRef.current !== session) return;
        setView((prev) => ({ ...prev, text: '', reasoning: '' }));
        onSettledRef.current?.({ saved: true });
      });
  }, []);

  /** Forget the view (and kill any in-flight fetch) — new prompt / switch. */
  const reset = React.useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    runRef.current = null;
    pendingBatchRef.current = null;
    setView(IDLE_VIEW);
  }, []);

  /** One in-flight run per session; the id comes from the picked `free:` value. */
  const start = React.useCallback(
    (prompt: string, modelId: string) => {
      if (controllerRef.current) return false;
      const text = prompt.trim();
      if (!text) return false;
      const session = sessionRef.current;
      const promptAt = new Date().toISOString();
      const controller = new AbortController();
      controllerRef.current = controller;
      runRef.current = { session, prompt: text, promptAt };
      setView({ phase: 'running', text: '', reasoning: '', error: null });
      const messages = [...freeHistoryMessages(history()), { role: 'user' as const, content: text }];
      void runFreeChat({
        model: modelId,
        messages,
        signal: controller.signal,
        onText: (delta) => {
          if (sessionRef.current !== session) return;
          setView((prev) => (prev.phase === 'running' ? { ...prev, text: prev.text + delta } : prev));
        },
        onReasoning: (delta) => {
          if (sessionRef.current !== session) return;
          setView((prev) => (prev.phase === 'running' ? { ...prev, reasoning: prev.reasoning + delta } : prev));
        },
      }).then((result) => {
        controllerRef.current = null;
        if (sessionRef.current !== session) return;
        const run = runRef.current;
        const answerAt = new Date().toISOString();
        const rows = freeRunRecordRows({
          prompt: run && run.session === session ? run.prompt : text,
          promptAt: run && run.session === session ? run.promptAt : promptAt,
          answerAt,
          result: { text: result.text, reasoning: result.reasoning },
        });
        const saved = sendBatch(rows, session);
        setView((prev) => ({
          ...prev,
          phase: 'settled',
          error: result.ok ? null : result.error,
        }));
        if (saved) {
          pendingBatchRef.current = saved;
          return;
        }
        // No socket = nothing was persisted: keep the text and say so.
        setView((prev) => ({
          ...prev,
          error: joinError(prev.error, 'the run could not be saved (no server socket) — it will not survive a reload'),
        }));
        onSettledRef.current?.({ saved: false });
      });
      return true;
    },
    [history, sendBatch],
  );

  const abort = React.useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  // Ack tracking: settle the view when THIS session's record is confirmed.
  // Both counters are compared against the totals captured at send time, so
  // an older batch's outcome or another session's frames can never match.
  React.useEffect(() => {
    const batch = pendingBatchRef.current;
    if (!batch) return;
    const session = sessionRef.current;
    const fails = failCountFor(ws.messages, session);
    if (fails > batch.baseFails) {
      pendingBatchRef.current = null;
      setView((prev) => ({
        ...prev,
        error: joinError(prev.error, 'the run could not be saved (server refused the record)'),
      }));
      onSettledRef.current?.({ saved: false });
      return;
    }
    if (ackCountFor(ws.messages, session) >= batch.expectAcks) {
      pendingBatchRef.current = null;
      settleSaved(session);
    }
  }, [ws.messages, settleSaved]);

  // A reconnect makes the pending batch replayable: the identical rows answer
  // `count 0` when they already landed (slice 3), so resend once per reopen.
  React.useEffect(() => {
    if (ws.status !== 'open') return;
    const batch = pendingBatchRef.current;
    if (!batch || controllerRef.current) return;
    const resent = sendBatch(batch.rows, sessionRef.current);
    if (resent) pendingBatchRef.current = resent;
  }, [ws.status, ws, sendBatch]);

  // Session switch and unmount both end the local run (the fetch must not
  // outlive the surface that started it).
  React.useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [sessionId]);
  React.useEffect(() => {
    reset();
  }, [sessionId, reset]);

  return React.useMemo(() => ({ view, start, abort, reset }), [view, start, abort, reset]);
}
