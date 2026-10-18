/**
 * Office canvas model (REQ-204 slice 3) — pure mapping from Lokma's row
 * contract (`office-view.ts`) to the vendored renderer's data shape.
 *
 * No DOM, no I/O, no React: the honesty rules live here as testable functions
 * (same discipline as `office-view.ts` / `loop-view.ts`).
 *
 * The mapping NEVER invents a field:
 *  - `spawnAt` is the moment THIS pane first observed the worker (there is no
 *    server-side run-start stamp — the slice-1 rule; a worker we have not seen
 *    yet simply has no seat yet, it never gets a made-up start time);
 *  - `doneAt`/`isOk` stay null: the worker is live, and live work has no
 *    verdict;
 *  - `project` is only set when the worker resolved to a real project row, so
 *    the badge text `no project` never becomes a fake desk on the board.
 */
import type { OfficeDelivery, OfficeWorker, OfficeWorkerType } from './office-view';
import type { AgentOfficeData, AgentOfficeProject, AgentOfficeWorker } from './vendor/agent-office-core.mjs';

/**
 * Minimum canvas box width (px) — the width the room READS at. This is NOT a
 * visibility switch: the office is drawn at every pane width (REQ-204 slice 6,
 * the 2026-10-18 user correction), and a narrower pane scrolls this box
 * sideways instead of hiding the office. The number is the renderer's own
 * floor, not a taste call: `setGeometry` clamps the pixel scale at S>=2 and
 * the office is designed at 330x200 logical, so 660 px is exactly the 2x
 * office — the first width that yields the renderer's minimum 330 logical
 * columns.
 */
export const OFFICE_CANVAS_MIN_WIDTH = 660;

/**
 * Phone width (px). Below this the pane falls back to the row list: a 660 px
 * office behind a phone viewport is not readable, so the list is the honest
 * narrow fallback (REQ-204 §4.8) — and the pane states that the canvas is
 * live, because the fallback is about the pane's width, never about the
 * office being empty.
 */
export const OFFICE_PHONE_WIDTH = 390;

/**
 * The line shown where the canvas would sit when the pane is phone-narrow —
 * honest about what is happening: the office is live, this view just cannot
 * read it.
 */
export const OFFICE_PHONE_CANVAS_COPY =
  'The pixel office is live — it needs 660 px to read, so this narrow view shows the list.';

/** How the pane presents the office at a given pane width. */
export type OfficeCanvasPresentation = 'canvas' | 'list';

/**
 * `canvas` at every width at or above the phone floor — ALWAYS, an empty
 * office included (the renderer draws the empty room; a status card must
 * never take the office's place). `list` only below `OFFICE_PHONE_WIDTH`.
 */
export function officeCanvasPresentation(paneWidth: number): OfficeCanvasPresentation {
  return paneWidth >= OFFICE_PHONE_WIDTH ? 'canvas' : 'list';
}

/** True when the fixed-width canvas box is wider than its pane (it scrolls). */
export function officeCanvasScrolls(paneWidth: number): boolean {
  return paneWidth < OFFICE_CANVAS_MIN_WIDTH;
}

/** Chest tag text — short enough for the renderer's 8-char badge. */
export function canvasTypeTag(type: OfficeWorkerType): string {
  return type === 'run' ? 'run' : 'loop';
}

export type CanvasDataInput = {
  workers: readonly OfficeWorker[];
  deliveries: readonly OfficeDelivery[];
  /** First observation time (epoch ms) per worker id — the walk-in anchor. */
  seenAt: ReadonlyMap<string, number>;
  /** Fallback anchor when a worker id has no observation stamp (unexpected). */
  nowMs: number;
};

function spawnAtOf(worker: OfficeWorker, seenAt: ReadonlyMap<string, number>, nowMs: number): number {
  const seen = seenAt.get(worker.id);
  return typeof seen === 'number' && Number.isFinite(seen) ? seen : nowMs;
}

/** One crew worker for the canvas — live, unverdict-ed, desk only when real. */
export function toCanvasWorker(
  worker: OfficeWorker,
  seenAt: ReadonlyMap<string, number>,
  nowMs: number,
): AgentOfficeWorker {
  return {
    id: worker.id,
    type: canvasTypeTag(worker.type),
    project: worker.projectId ? worker.projectBadge : null,
    spawnAt: spawnAtOf(worker, seenAt, nowMs),
    doneAt: null,
    isOk: null,
    tool: worker.currentTool,
  };
}

/**
 * Per-project board rows, counted from the SAME rows the pane draws (never a
 * stored counter). Only projects that resolved from a real row appear; a
 * desk-less worker contributes no column.
 */
export function canvasProjects(input: CanvasDataInput): AgentOfficeProject[] {
  const boss = input.workers.find((w) => w.isBoss) ?? null;
  const bossProject = boss && boss.projectId ? boss.projectBadge : null;
  const byName = new Map<string, AgentOfficeProject>();
  const ensure = (name: string): AgentOfficeProject => {
    const existing = byName.get(name);
    if (existing) return existing;
    const row: AgentOfficeProject = {
      name,
      working: 0,
      waiting: 0,
      delivered: 0,
      isBossBusy: name === bossProject,
    };
    byName.set(name, row);
    return row;
  };
  for (const w of input.workers) {
    if (!w.projectId || !w.projectBadge) continue;
    const row = ensure(w.projectBadge);
    row.working = (row.working ?? 0) + 1;
    if (w.status === 'waiting') row.waiting = (row.waiting ?? 0) + 1;
  }
  for (const d of input.deliveries) {
    if (!d.projectId || !d.projectBadge) continue;
    const row = ensure(d.projectBadge);
    row.delivered = (row.delivered ?? 0) + 1;
  }
  return [...byName.values()];
}

/**
 * The full renderer payload. `project` stays '' so the classic office theme
 * applies (theme token mapping is slice 7 — no second theme system here).
 */
export function buildCanvasData(input: CanvasDataInput): AgentOfficeData {
  const boss = input.workers.find((w) => w.isBoss) ?? null;
  const crew = input.workers.filter((w) => !w.isBoss);
  const projects = canvasProjects(input);
  return {
    workers: crew.map((w) => toCanvasWorker(w, input.seenAt, input.nowMs)),
    delivered: input.deliveries.length,
    isBossBusy: boss?.status === 'working',
    isBossAsking: boss?.status === 'waiting',
    project: '',
    projects: projects.length > 1 ? projects : [],
    shells: [],
    sessionId: '',
  };
}

/**
 * Canvas hit id → Lokma worker id. The renderer answers with a worker id, the
 * boss sentinel or the board sentinel; only real workers select.
 */
export function resolveCanvasSelection(
  hitId: string | null,
  bossId: string | null,
  bossSentinel: string,
  boardSentinel: string,
): string | null {
  if (!hitId || hitId === boardSentinel) return null;
  if (hitId === bossSentinel) return bossId;
  return hitId;
}
