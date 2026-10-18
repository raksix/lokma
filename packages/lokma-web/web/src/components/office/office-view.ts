/**
 * Pure rules for the Office surface (REQ-204 slice 1 — the data contract).
 *
 * The office draws WHO is working right now and WHAT just finished, all from
 * Lokma's own live sources. Nothing in this file fetches, subscribes or
 * renders — the pane owns I/O and the canvas — so every honesty rule is
 * unit-provable without a DOM (the REQ-203 `loop-view.ts` pattern).
 *
 * Field sources, measured (`file:line`) — a field with no source stays empty:
 *
 *  - Sessions: `SessionSummary` (`lib/api.ts`), `running`/`queued` ride from
 *    the server (`server/session-feed.ts` toSessionRow ->
 *    `server/session-runs.ts` runStatus). A session with `running:true` IS a
 *    live run; the office never invents a run row for an idle session.
 *  - Loops: `LoopView` (`lib/api.ts`); `status === 'running'` is a live loop
 *    turn, and `lastRunStartedAt` + `lastRunOutcome` are the only real
 *    run-window fields the product persists for a loop.
 *  - Tool rows: persisted transcript rows `role:'tool'` carry `toolName` plus
 *    a `{callId, ok, result, input}` JSON envelope in `content` (written by
 *    `server/agent-loop.ts` toolRecord calls; shape measured on a live
 *    session JSONL). The office reads `toolName` + `input` for its one-line
 *    detail — never the result body.
 *  - Live frames: `tool_start` / `tool_result` / `permission_request` /
 *    `ask_user_question` (`packages/lokma-shared/src/protocol/ws.ts`) — a gate
 *    observed pending is the only honest "waiting" signal.
 *  - Projects: `AuthProject` (`lib/api.ts`); desk mapping reuses the loop
 *    console's rules (`components/loops/loop-view.ts`: `projectIdForCwd`,
 *    `loopProjectState`, `projectBadgeLabel`), never a second cwd matcher.
 *
 * Deliberately null in v1 (no source exists; inventing them would put a
 * fabricated identity on the canvas):
 *  - `runId` — Lokma names a run by its session id (`session-runs.ts` `runs`
 *    Map is keyed by sessionId; there is no separate run record).
 *  - `agentId` — `SessionMeta` (`lokma-core/src/session/types.ts`) carries
 *    `botId` and `claudeSessionId`, no agent link.
 *  - a run's `startedAt` — no server field exists, so the pane stamps the
 *    window IT observed (`applySessionsSnapshot`); honest only while the pane
 *    kept watching, and null before the first observation.
 */
import type { AuthProject, LoopRunOutcome, LoopView, SessionSummary } from '@/lib/api';
import {
  findProject,
  loopProjectState,
  projectBadgeLabel,
  projectIdForCwd,
} from '@/components/loops/loop-view';

/** Cap on the live tool history — upstream keeps the last 20 (REQ-204 §2). */
export const OFFICE_TOOL_HISTORY_CAP = 20;

/** Cap on closed run windows kept per session (whiteboard depth). */
export const OFFICE_CLOSED_CAP = 5;

/** One-line detail cap (canvas badge; the full row lives in the chat). */
export const OFFICE_DETAIL_MAX = 80;

/** Task line cap on a worker card. */
export const OFFICE_TASK_MAX = 200;

// ─── Rows ────────────────────────────────────────────────────────────────────

/** Work kind of one worker (REQ-204 §6.2/§6.3 — run vs loop turn). */
export type OfficeWorkerType = 'run' | 'loop-turn';

/**
 * Honest worker status. Only states a source can prove:
 *  - `working`: a live run (`running:true`) or a running loop;
 *  - `waiting`: the run is blocked on a user gate observed pending — the
 *    REQ-204 §4.6 signal, never a guess from silence.
 */
export type OfficeWorkerStatus = 'working' | 'waiting';

/** One tool call row (upstream `ToolCall` mapping, REQ-204 §2.1). */
export type OfficeToolRow = {
  /** Wire call id — result matching + duplicate-start guard. */
  callId: string;
  /** Transcript timestamp when known (persisted rows), else observe time. */
  at: string | null;
  tool: string;
  /** Single-line input summary (the task, not the result). */
  detail: string;
  /** Envelope verdict; null while in flight or unverifiable. */
  ok: boolean | null;
  /** True between `tool_start` and `tool_result` (live badge source). */
  running: boolean;
};

/** One live worker on the canvas (upstream `Worker` mapping, REQ-204 §4.1). */
export type OfficeWorker = {
  /** Stable canvas identity — `run:<sessionId>` | `loop:<loopId>`. */
  id: string;
  type: OfficeWorkerType;
  status: OfficeWorkerStatus;
  /** Desk (project) resolved by the loop console's rules; null = no desk. */
  projectId: string | null;
  /** Desk-cell badge text (`no project` stays visible, REQ-203 §4 style). */
  projectBadge: string | null;
  cwd: string | null;
  sessionId: string | null;
  loopId: string | null;
  /** Always null in v1 — see header (no run identity exists). */
  runId: string | null;
  botId: string | null;
  /** Always null in v1 — sessions carry no agent link. */
  agentId: string | null;
  /** Display name: session title / loop name; falls back to the raw id. */
  label: string;
  /** Task line: session title / loop prompt first line, capped. */
  task: string | null;
  /** The tool running right now (falls back to the latest completed one). */
  currentTool: string | null;
  /** Newest-first tool rows, capped (REQ-204 §2: last 20). */
  lastTools: OfficeToolRow[];
  /** Observed window / loop run stamp; null when unknown. */
  startedAt: string | null;
  /** Always null while working — carried for the row shape. */
  endedAt: string | null;
  /** Verdict the source has; null = no verdict observed (honest). */
  ok: boolean | null;
  /** The user's own conversation agent (REQ-204 §6.2) — same session id. */
  isBoss: boolean;
};

/** One finished run for the whiteboard (upstream `Delivery` mapping). */
export type OfficeDelivery = {
  /** `run:<sessionId>@<endedAt>` | `loop:<loopId>` — unique per window. */
  id: string;
  type: OfficeWorkerType;
  projectId: string | null;
  projectBadge: string | null;
  label: string;
  startedAt: string | null;
  /** ISO end time — observed for runs, absent for loops (no source). */
  endedAt: string | null;
  /** Verdict from a real source; null = the source has no verdict. */
  ok: boolean | null;
  /** Tool calls observed for this run; null = not observable (loops). */
  toolCount: number | null;
};

// ─── Live folds (frames -> per-session state) ───────────────────────────────

/** One closed run window the pane observed end to end. */
export type OfficeClosedWindow = {
  startedAt: string;
  endedAt: string;
  ok: boolean | null;
  toolCount: number;
};

/** Per-session live knowledge the pane accumulated from frames/snapshots. */
export type OfficeSessionLive = {
  /** Current window's tool rows, newest first, capped. */
  tools: OfficeToolRow[];
  /** Current window's total tool calls seen (never capped). */
  toolCount: number;
  /** Pending user gates (approval/question) observed and unanswered. */
  waiting: number;
  /** The first observation that showed this session running — opens a window. */
  seenRunningAt: string | null;
  /** Verdict observed for the CURRENT window (`done`/`error` frame). */
  lastRunOk: boolean | null;
  /** Finished windows, newest first, cap OFFICE_CLOSED_CAP. */
  closed: OfficeClosedWindow[];
};

export type OfficeLiveMap = Readonly<Record<string, OfficeSessionLive>>;

/** Structural slice of one `sessions` snapshot row (session-feed row shape). */
export type OfficeSnapshotRow = {
  id: string;
  running?: boolean;
};

export function emptyOfficeLive(): OfficeSessionLive {
  return { tools: [], toolCount: 0, waiting: 0, seenRunningAt: null, lastRunOk: null, closed: [] };
}

/** Live state for one session, or a fresh empty one (never undefined). */
export function officeLiveFor(live: OfficeLiveMap, sessionId: string): OfficeSessionLive {
  return live[sessionId] ?? emptyOfficeLive();
}

function put(live: OfficeLiveMap, sessionId: string, next: OfficeSessionLive): OfficeLiveMap {
  return { ...live, [sessionId]: next };
}

/** Input keys in priority order — first hit wins the one-line detail. */
const DETAIL_KEYS = [
  'command',
  'url',
  'path',
  'file',
  'pattern',
  'query',
  'q',
  'name',
  'prompt',
  'text',
  'terminalId',
] as const;

function firstScalarValue(input: Record<string, unknown>): string | null {
  for (const value of Object.values(input)) {
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return null;
}

/**
 * One-line summary of a tool call's INPUT (never the result): the first
 * present key from `DETAIL_KEYS`, else the first scalar value, whitespace
 * collapsed and capped. Returns '' when the input holds nothing readable —
 * the row then shows the bare tool name instead of a fabricated detail.
 */
export function toolDetail(input: unknown): string {
  const record =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : null;
  if (!record) return '';
  let value: string | null = null;
  for (const key of DETAIL_KEYS) {
    const v = record[key];
    if (typeof v === 'string' && v.trim()) {
      value = v.trim();
      break;
    }
    if (typeof v === 'number' || typeof v === 'boolean') {
      value = String(v);
      break;
    }
  }
  if (value === null) value = firstScalarValue(record);
  if (value === null) return '';
  const oneLine = value.split(/[\s]+/).filter((part) => part.length > 0).join(' ');
  return oneLine.length > OFFICE_DETAIL_MAX
    ? oneLine.slice(0, OFFICE_DETAIL_MAX - 3) + '...'
    : oneLine;
}

/**
 * Fold a `tool_start` frame. Idempotent per callId — a resent start (wire
 * replay after a reconnect) never doubles the row.
 */
export function applyToolStart(
  live: OfficeLiveMap,
  msg: { sessionId: string; callId: string; tool: string; input: unknown },
  at: string,
): OfficeLiveMap {
  const cur = officeLiveFor(live, msg.sessionId);
  if (cur.tools.some((t) => t.callId === msg.callId)) return live;
  const row: OfficeToolRow = {
    callId: msg.callId,
    at,
    tool: msg.tool,
    detail: toolDetail(msg.input),
    ok: null,
    running: true,
  };
  return put(live, msg.sessionId, {
    ...cur,
    tools: [row, ...cur.tools].slice(0, OFFICE_TOOL_HISTORY_CAP),
    toolCount: cur.toolCount + 1,
  });
}

/**
 * Fold a `tool_result` frame — completes the matching row. A result for a
 * call this pane never saw start is dropped: there is no row to complete and
 * inventing one would fabricate a start time.
 */
export function applyToolResult(
  live: OfficeLiveMap,
  msg: { sessionId: string; callId: string; result: unknown; isError: boolean },
): OfficeLiveMap {
  const cur = live[msg.sessionId];
  if (!cur) return live;
  const idx = cur.tools.findIndex((t) => t.callId === msg.callId);
  if (idx < 0) return live;
  const tools = cur.tools.slice();
  tools[idx] = { ...tools[idx], running: false, ok: !msg.isError };
  return put(live, msg.sessionId, { ...cur, tools });
}

/** A permission/ask gate arrived unanswered — the run now waits on the user. */
export function applyGatePending(live: OfficeLiveMap, sessionId: string): OfficeLiveMap {
  const cur = officeLiveFor(live, sessionId);
  return put(live, sessionId, { ...cur, waiting: cur.waiting + 1 });
}

/** The user answered a gate (allow/deny/answer/ack) — one fewer pending. */
export function applyGateSettled(live: OfficeLiveMap, sessionId: string): OfficeLiveMap {
  const cur = live[sessionId];
  if (!cur || cur.waiting <= 0) return live;
  return put(live, sessionId, { ...cur, waiting: cur.waiting - 1 });
}

/** A `done`/`error` frame — the current window's verdict, as observed. */
export function applyRunEnd(
  live: OfficeLiveMap,
  sessionId: string,
  ok: boolean | null,
): OfficeLiveMap {
  const cur = officeLiveFor(live, sessionId);
  return put(live, sessionId, { ...cur, lastRunOk: ok, waiting: 0 });
}

/** Move the open window into `closed` (newest first, capped) and open fresh. */
function closeWindow(cur: OfficeSessionLive, at: string): OfficeSessionLive {
  if (!cur.seenRunningAt) return cur;
  const window: OfficeClosedWindow = {
    startedAt: cur.seenRunningAt,
    endedAt: at,
    ok: cur.lastRunOk,
    toolCount: cur.toolCount,
  };
  const closed = [window, ...cur.closed].slice(0, OFFICE_CLOSED_CAP);
  return { ...emptyOfficeLive(), closed };
}

/**
 * Fold one `sessions` snapshot into observed windows (REQ-204 §4.3 "delivery
 * = a finished run"). The pane diffs successive snapshots instead of
 * inventing run history:
 *
 *  - the first snapshot showing `running:true` opens a window;
 *  - the first showing it stopped after that closes the window (its tool
 *    count + last observed verdict become a delivery row) and resets the
 *    open fields, so a later run reports its OWN tools;
 *  - snapshots for sessions this pane never saw running are left alone —
 *    no fabricated windows for idle sessions.
 */
export function applySessionsSnapshot(
  live: OfficeLiveMap,
  rows: readonly OfficeSnapshotRow[],
  at: string,
): OfficeLiveMap {
  let next = live;
  for (const row of rows) {
    const cur = next[row.id];
    if (row.running) {
      if (!cur?.seenRunningAt) {
        next = put(next, row.id, {
          ...(cur ?? emptyOfficeLive()),
          seenRunningAt: at,
          tools: [],
          toolCount: 0,
          waiting: 0,
          lastRunOk: null,
        });
      }
    } else if (cur?.seenRunningAt) {
      next = put(next, row.id, closeWindow(cur, at));
    }
  }
  return next;
}

// ─── Derivations (sources -> canvas rows) ───────────────────────────────────

/** What the office reads from one session row (`SessionSummary` slice). */
export type OfficeSessionRow = Pick<SessionSummary, 'id' | 'cwd' | 'title' | 'botId' | 'running'>;

/** What the office reads from one loop (`LoopView` slice). */
export type OfficeLoopRow = Pick<
  LoopView,
  'id' | 'name' | 'prompt' | 'cwd' | 'projectId' | 'status' | 'lastRunStartedAt' | 'lastRunOutcome'
>;

/** Everything a derivation may read — the pane wires these once. */
export type OfficeSources = {
  sessions: readonly OfficeSessionRow[];
  loops: readonly OfficeLoopRow[];
  projects: readonly AuthProject[];
  live: OfficeLiveMap;
  /** The session the user is talking to right now (the boss, REQ-204 §6.2). */
  activeSessionId?: string | null;
};

/** Stable canvas identity for one work unit. */
export function officeWorkerId(type: OfficeWorkerType, id: string): string {
  return type === 'run' ? 'run:' + id : 'loop:' + id;
}

/** The chest badge: the in-flight tool, else the latest completed one. */
export function currentToolOf(live: OfficeSessionLive): string | null {
  const inFlight = live.tools.find((t) => t.running);
  if (inFlight) return inFlight.tool;
  const first = live.tools[0];
  return first ? first.tool : null;
}

/** First non-empty line of a prompt, capped; null when there is none. */
export function promptFirstLine(prompt: string): string | null {
  const line = prompt
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  return line.length > OFFICE_TASK_MAX ? line.slice(0, OFFICE_TASK_MAX - 3) + '...' : line;
}

/**
 * Live workers: sessions whose run flag is on, plus loops whose status is
 * `running`. Idle sessions and armed-but-idle loops are NOT workers — an
 * empty office is drawn with the honest empty state, never with placeholders.
 */
export function deriveOfficeWorkers(src: OfficeSources): OfficeWorker[] {
  const rows: OfficeWorker[] = [];

  for (const s of src.sessions) {
    if (!s.running) continue;
    const live = officeLiveFor(src.live, s.id);
    const projectId = projectIdForCwd(s.cwd, src.projects);
    const project = findProject(projectId, src.projects);
    const title = (s.title ?? '').trim();
    rows.push({
      id: officeWorkerId('run', s.id),
      type: 'run',
      status: live.waiting > 0 ? 'waiting' : 'working',
      projectId,
      projectBadge: project ? project.name : 'no project',
      cwd: s.cwd ?? null,
      sessionId: s.id,
      loopId: null,
      runId: null,
      botId: s.botId ?? null,
      agentId: null,
      label: title || s.id,
      task: title || null,
      currentTool: currentToolOf(live),
      lastTools: live.tools,
      startedAt: live.seenRunningAt,
      endedAt: null,
      ok: null,
      isBoss: src.activeSessionId != null && src.activeSessionId === s.id,
    });
  }

  for (const l of src.loops) {
    if (l.status !== 'running') continue;
    const state = loopProjectState(l, src.projects);
    const matched = state.kind === 'match' ? state.project : null;
    rows.push({
      id: officeWorkerId('loop-turn', l.id),
      type: 'loop-turn',
      // Loops publish no gate frames to the pane; `working` here is the
      // absence of a waiting signal, not a claim that nothing waits.
      status: 'working',
      projectId: matched ? matched.id : null,
      projectBadge: projectBadgeLabel(state),
      cwd: l.cwd ?? null,
      sessionId: null,
      loopId: l.id,
      runId: null,
      botId: null,
      agentId: null,
      label: l.name,
      task: promptFirstLine(l.prompt),
      // Loop turns run inside the server loop pump — they emit no chat tool
      // frames, so tool fields stay empty rather than guessed.
      currentTool: null,
      lastTools: [],
      startedAt: l.lastRunStartedAt,
      endedAt: null,
      ok: null,
      isBoss: false,
    });
  }

  return sortOfficeWorkers(rows);
}

/** Loop run outcome -> honest verdict (`empty`/`aborted` carry no ok/fail). */
export function loopOutcomeOk(outcome: LoopRunOutcome | null): boolean | null {
  if (outcome === 'ok') return true;
  if (outcome === 'error') return false;
  return null;
}

/**
 * Finished work for the whiteboard:
 *  - RUNS: only windows THIS pane observed both ends of (no server run-end
 *    feed exists — claiming more would be invention).
 *  - LOOPS: loops that finished (`done`/`error`) and carry a last-run
 *    outcome; `paused` is not a delivery.
 */
export function deriveOfficeDeliveries(src: OfficeSources): OfficeDelivery[] {
  const rows: OfficeDelivery[] = [];

  for (const s of src.sessions) {
    const live = src.live[s.id];
    if (!live || live.closed.length === 0) continue;
    const projectId = projectIdForCwd(s.cwd, src.projects);
    const project = findProject(projectId, src.projects);
    const title = (s.title ?? '').trim();
    for (const w of live.closed) {
      rows.push({
        id: officeWorkerId('run', s.id) + '@' + w.endedAt,
        type: 'run',
        projectId,
        projectBadge: project ? project.name : 'no project',
        label: title || s.id,
        startedAt: w.startedAt,
        endedAt: w.endedAt,
        ok: w.ok,
        toolCount: w.toolCount,
      });
    }
  }

  for (const l of src.loops) {
    if (l.status !== 'done' && l.status !== 'error') continue;
    if (l.lastRunOutcome === null) continue;
    const state = loopProjectState(l, src.projects);
    const matched = state.kind === 'match' ? state.project : null;
    rows.push({
      id: officeWorkerId('loop-turn', l.id),
      type: 'loop-turn',
      projectId: matched ? matched.id : null,
      projectBadge: projectBadgeLabel(state),
      label: l.name,
      startedAt: l.lastRunStartedAt,
      endedAt: null,
      ok: loopOutcomeOk(l.lastRunOutcome),
      toolCount: null,
    });
  }

  return sortOfficeDeliveries(rows);
}

/** Waiting workers first, then oldest windows first, then by label. */
export function sortOfficeWorkers(workers: readonly OfficeWorker[]): OfficeWorker[] {
  return [...workers].sort((a, b) => {
    const aw = a.status === 'waiting' ? 0 : 1;
    const bw = b.status === 'waiting' ? 0 : 1;
    if (aw !== bw) return aw - bw;
    const at = a.startedAt ? Date.parse(a.startedAt) : Number.NaN;
    const bt = b.startedAt ? Date.parse(b.startedAt) : Number.NaN;
    const av = Number.isNaN(at) ? Infinity : at;
    const bv = Number.isNaN(bt) ? Infinity : bt;
    if (av !== bv) return av - bv;
    return a.label.localeCompare(b.label);
  });
}

/** Newest finished first; windows with no end stamp sort last. */
export function sortOfficeDeliveries(list: readonly OfficeDelivery[]): OfficeDelivery[] {
  return [...list].sort((a, b) => {
    const at = a.endedAt ? Date.parse(a.endedAt) : Number.NaN;
    const bt = b.endedAt ? Date.parse(b.endedAt) : Number.NaN;
    const av = Number.isNaN(at) ? -Infinity : at;
    const bv = Number.isNaN(bt) ? -Infinity : bt;
    return bv - av;
  });
}

/** Counts MEASURED from the rows — never a stored counter (upstream stats). */
export type OfficeStats = {
  working: number;
  waiting: number;
  delivered: number;
};

export function officeStats(
  workers: readonly OfficeWorker[],
  deliveries: readonly OfficeDelivery[],
): OfficeStats {
  return {
    working: workers.length,
    waiting: workers.filter((w) => w.status === 'waiting').length,
    delivered: deliveries.length,
  };
}

/** Honest empty state — shown when the sources have no live work at all. */
export const OFFICE_EMPTY_COPY = 'Nothing is running right now.';
