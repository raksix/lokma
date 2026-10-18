/**
 * Office worker detail (REQ-204 slice 4) — pure rules for the panel that
 * opens when a worker is selected.
 *
 * The panel answers four questions (REQ kapsam 4): the TASK, the CURRENT
 * tool, the LAST N TOOL CALLS and the RESULT-so-far. Nothing here fetches or
 * renders — the pane owns I/O (it reads the session transcript through the
 * EXISTING `GET /api/sessions/:id`, the route the chat already uses) and
 * rendering (it reuses the chat's own `ToolCallRow`). This module only turns
 * rows into an honest model:
 *
 *  - the tool list comes from PERSISTED transcript rows (`role:'tool'`,
 *    parsed by the chat's own `transcriptToolEntry` — no second reader), with
 *    the live fold's in-flight call merged in front so a running call is
 *    visible before its row is written;
 *  - the task is the LATEST user prompt in the transcript (what is driving
 *    the current run), never a stored default;
 *  - the output only counts assistant rows BELOW the latest user prompt: a
 *    previous turn's answer is not this run's result;
 *  - missing pieces stay null / empty — the panel says "no output yet"
 *    instead of inventing one.
 */
import { transcriptToolEntry } from '@/components/chat/lokma-message';
import type { ToolCallEntry } from '@/lib/ws';
import { OFFICE_TOOL_HISTORY_CAP, promptFirstLine, type OfficeToolRow } from './office-view';

/** Cap on the result-so-far text (the full answer lives in the chat). */
export const OFFICE_RESULT_MAX = 1200;

/** Structural read of one transcript row (the fields the panel consumes). */
export type OfficeTranscriptRow = {
  role: string;
  content: string;
  timestamp: string | null;
  toolName?: string;
  toolCallId?: string;
};

/**
 * Read typed rows out of the raw `messages` array of `GET /api/sessions/:id`
 * (`SessionDetail.messages` is `unknown[]`). A malformed row is dropped — a
 * row the panel cannot read is never rendered as a guess.
 */
export function readTranscriptRows(messages: readonly unknown[]): OfficeTranscriptRow[] {
  const rows: OfficeTranscriptRow[] = [];
  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Record<string, unknown>;
    if (typeof rec['role'] !== 'string' || typeof rec['content'] !== 'string') continue;
    const row: OfficeTranscriptRow = {
      role: rec['role'],
      content: rec['content'],
      timestamp: typeof rec['timestamp'] === 'string' ? rec['timestamp'] : null,
    };
    if (typeof rec['toolName'] === 'string') row.toolName = rec['toolName'];
    if (typeof rec['toolCallId'] === 'string') row.toolCallId = rec['toolCallId'];
    rows.push(row);
  }
  return rows;
}

/** One tool row for the panel — a parsed entry plus its call identity. */
export type OfficeDetailToolRow = {
  /** Wire call id; null only for legacy rows that carry none. */
  callId: string | null;
  /** Transcript timestamp when known, else the live observation time. */
  at: string | null;
  entry: ToolCallEntry;
};

/**
 * Persisted `role:'tool'` rows, newest first (the transcript file order is
 * oldest first, so the list is reversed once). Non-tool rows return null
 * from `transcriptToolEntry` and are skipped — including `thinking` rows.
 */
export function transcriptToolRows(rows: readonly OfficeTranscriptRow[]): OfficeDetailToolRow[] {
  const out: OfficeDetailToolRow[] = [];
  for (const row of rows) {
    const entry = transcriptToolEntry(row);
    if (!entry) continue;
    out.push({ callId: row.toolCallId ?? null, at: row.timestamp, entry });
  }
  out.reverse();
  return out;
}

/** The latest user prompt — the task driving the current run; null when none. */
export function latestUserTask(rows: readonly OfficeTranscriptRow[]): string | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.role !== 'user') continue;
    const line = promptFirstLine(row.content);
    if (line) return line;
  }
  return null;
}

/**
 * Latest assistant output OF THE CURRENT RUN — rows after the newest user
 * prompt only. No prompt in the transcript means there is no run to report
 * on: null, never the previous turn's answer wearing this run's badge.
 */
export function latestRunOutput(rows: readonly OfficeTranscriptRow[]): string | null {
  let promptIndex = -1;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].role === 'user') {
      promptIndex = i;
      break;
    }
  }
  if (promptIndex < 0) return null;
  for (let i = rows.length - 1; i > promptIndex; i -= 1) {
    const row = rows[i];
    if (row.role !== 'assistant') continue;
    const text = row.content.trim();
    if (!text) continue;
    return text.length > OFFICE_RESULT_MAX ? text.slice(0, OFFICE_RESULT_MAX - 3) + '...' : text;
  }
  return null;
}

/**
 * Merge persisted tool rows with the live fold's in-flight call:
 *  - a call that already has a persisted row is dropped from the live side
 *    (the persisted row carries the full input AND result — the better row);
 *  - a live call with no persisted row yet is in flight: it goes in front as
 *    a running entry (the transcript writes a row only when the call ends);
 *  - the merged list keeps the live fold's cap (last N, newest first).
 */
export function mergeDetailTools(
  persisted: readonly OfficeDetailToolRow[],
  live: readonly OfficeToolRow[],
  cap: number = OFFICE_TOOL_HISTORY_CAP,
): OfficeDetailToolRow[] {
  const known = new Set<string>();
  for (const row of persisted) {
    if (row.callId) known.add(row.callId);
  }
  const running: OfficeDetailToolRow[] = [];
  for (const row of live) {
    if (!row.running) continue;
    if (known.has(row.callId)) continue;
    running.push({ callId: row.callId, at: row.at, entry: { tool: row.tool, input: undefined } });
  }
  return [...running, ...persisted].slice(0, cap);
}

/**
 * The panel's model. `task`/`output` null = the transcript has none (the
 * pane then falls back to the worker's own task line and says "no output
 * yet" — it never fills the gap itself).
 */
export type OfficeWorkerDetail = {
  sessionId: string;
  task: string | null;
  tools: OfficeDetailToolRow[];
  output: string | null;
};

export function buildOfficeWorkerDetail(
  sessionId: string,
  messages: readonly unknown[],
  liveRows: readonly OfficeToolRow[],
): OfficeWorkerDetail {
  const rows = readTranscriptRows(messages);
  return {
    sessionId,
    task: latestUserTask(rows),
    tools: mergeDetailTools(transcriptToolRows(rows), liveRows),
    output: latestRunOutput(rows),
  };
}
