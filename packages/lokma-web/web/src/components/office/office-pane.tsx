import * as React from 'react';
import { Building2, CheckCircle2, Crown, RefreshCw, Wrench, XCircle } from 'lucide-react';
import { api, type LoopView, type SessionSummary } from '@/lib/api';
import { LOOP_CHANGED_EVENT } from '@/lib/loop-frame';
import { useSessionStore } from '@/stores/session';
import { formatRunAgo } from '@/components/testing';
import { cn } from '@/lib/utils';
import {
  applySessionsSnapshot,
  deriveOfficeDeliveries,
  deriveOfficeWorkers,
  foldOfficeFrame,
  OFFICE_EMPTY_COPY,
  officeStats,
  type OfficeDelivery,
  type OfficeLiveMap,
  type OfficeSources,
  type OfficeWorker,
} from './office-view';
import { OFFICE_FRAME_EVENT, type OfficeFrame } from '@/lib/office-frame';
import { OfficeCanvas } from './office-canvas';
import { OFFICE_CANVAS_MIN_WIDTH } from './office-canvas-model';

/**
 * OfficePane — REQ-204 slice 2: the Office surface (rail icon + pane).
 *
 * This slice renders the honest ROW view of the office: who is working right
 * now (live runs + loop turns) and what finished recently, all derived from
 * the slice-1 contract (`office-view.ts`). The pixel-art canvas (the vendored
 * upstream renderer) lands in slice 3 behind this same data — and this list
 * doubles as the narrow-screen fallback the REQ asks for (a canvas does not
 * read on a phone), so it is not throwaway UI.
 *
 * Sources, all real — nothing is invented:
 *  - sessions: `useSessionStore.sessions` (the `running` flag rides from the
 *    server feed; the sidebar keeps the list warm);
 *  - loops: `GET /api/loops` + the LOOP_CHANGED_EVENT frame bridge, with a
 *    quiet poll fallback that stays out of the way while frames arrive;
 *  - projects: `useSessionStore.projects` (the desk mapping);
 *  - run windows: this pane's own observation of running -> stopped
 *    transitions (`applySessionsSnapshot`), the only honest run-end source
 *    that exists (no server run-end feed).
 *
 * An empty office renders the honest empty state — no demo office, no
 * placeholder desks (REQ-204 §5).
 */
export const OFFICE_POLL_MS = 5_000;

export function OfficePane() {
  const sessions = useSessionStore((s) => s.sessions);
  const projects = useSessionStore((s) => s.projects);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  const [loops, setLoops] = React.useState<LoopView[]>([]);
  const [loopsError, setLoopsError] = React.useState<string | null>(null);
  const [lastFrameAt, setLastFrameAt] = React.useState<number | null>(null);
  const [live, setLive] = React.useState<OfficeLiveMap>({});
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  // The pixel canvas only draws where it can be read; the pane measures itself
  // (the same component serves a wide tab and the narrow inspector).
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [paneWidth, setPaneWidth] = React.useState(0);

  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = (): void => setPaneWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The relative-age cells need a clock, but only while the pane is open.
  React.useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const loadLoops = React.useCallback(async (): Promise<void> => {
    try {
      const res = await api.listLoops();
      setLoops(res.loops);
      setLoopsError(null);
    } catch (e) {
      // Keep the last list (never blank a working office) but NAME the
      // failure: a stale office presented as live would be the lie.
      setLoopsError(e instanceof Error ? e.message : 'Could not read the loops');
    }
  }, []);

  React.useEffect(() => {
    void loadLoops();
  }, [loadLoops]);

  // Frame -> refresh is the FAST path; the poll below is the fallback and
  // stands down while frames are flowing (same rule as the loop console).
  React.useEffect(() => {
    function onChanged(): void {
      setLastFrameAt(Date.now());
      void loadLoops();
    }
    window.addEventListener(LOOP_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(LOOP_CHANGED_EVENT, onChanged);
  }, [loadLoops]);

  React.useEffect(() => {
    const t = window.setInterval(() => {
      const flowing = lastFrameAt !== null && Date.now() - lastFrameAt < OFFICE_POLL_MS * 2;
      if (!flowing) void loadLoops();
    }, OFFICE_POLL_MS);
    return () => window.clearInterval(t);
  }, [lastFrameAt, loadLoops]);

  // Live frames (REQ-204 slice 3): the socket bridges the tool/gate/run frames
  // it already carries; folding them here is what fills `currentTool`,
  // `waiting` and the tool history both the rows and the canvas render. No
  // second feed is opened — same one-way bridge as the loop console.
  React.useEffect(() => {
    function onFrame(ev: Event): void {
      const frame = (ev as CustomEvent<OfficeFrame>).detail;
      if (!frame || typeof frame !== 'object') return;
      setLive((prev) => foldOfficeFrame(prev, frame, new Date().toISOString()));
    }
    window.addEventListener(OFFICE_FRAME_EVENT, onFrame);
    return () => window.removeEventListener(OFFICE_FRAME_EVENT, onFrame);
  }, []);

  // Window observation: diff successive session snapshots and close the
  // window this pane actually saw go running -> stopped. Sessions it never
  // saw running are left alone (no fabricated deliveries).
  React.useEffect(() => {
    const fold = (rows: readonly SessionSummary[]): void => {
      setLive((prev) =>
        applySessionsSnapshot(
          prev,
          rows.map((row) => ({ id: row.id, running: Boolean(row.running) })),
          new Date().toISOString(),
        ),
      );
    };
    fold(useSessionStore.getState().sessions);
    return useSessionStore.subscribe((state, prev) => {
      if (state.sessions !== prev.sessions) fold(state.sessions);
    });
  }, []);

  const workers = React.useMemo(
    () => deriveOfficeWorkers({ sessions, loops, projects, live, activeSessionId }),
    [sessions, loops, projects, live, activeSessionId],
  );
  const deliveries = React.useMemo(
    () => deriveOfficeDeliveries({ sessions, loops, projects, live, activeSessionId }),
    [sessions, loops, projects, live, activeSessionId],
  );
  const stats = officeStats(workers, deliveries);

  const selectedWorker = selectedId !== null ? workers.find((w) => w.id === selectedId) ?? null : null;
  const canvasVisible = paneWidth >= OFFICE_CANVAS_MIN_WIDTH;

  return (
    <div
      ref={rootRef}
      className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line"
      data-office-pane
    >
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0 overflow-x-auto">
        <Building2 className="w-3 h-3 text-terracotta" aria-hidden="true" />
        <span className="text-xs font-semibold">Office</span>
        <span className="ml-1 text-[11px] text-zinc-400" data-office-stats>
          {stats.working} working · {stats.waiting} waiting · {stats.delivered} delivered
        </span>
        <span className="ml-auto flex shrink-0 gap-1">
          <button
            type="button"
            aria-label="Reload the office sources"
            onClick={() => void loadLoops()}
            className="rounded border border-line px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-muted dark:text-zinc-400 dark:hover:bg-[#232326]"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-3">
        {loopsError ? (
          <p className="rounded border border-dashed px-2 py-1 text-[11px] text-zinc-500 dark:text-zinc-400" data-office-loops-error>
            Loops could not be read — the office may be missing loop turns.
          </p>
        ) : null}

        {canvasVisible ? (
          <section data-office-canvas-section>
            <div className="h-[360px] overflow-hidden rounded-lg border border-line bg-[#FDFCFB] dark:bg-[#1E1E21]">
              <OfficeCanvas
                workers={workers}
                deliveries={deliveries}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400" data-office-canvas-hint>
              {selectedWorker
                ? selectedWorker.currentTool
                  ? `${selectedWorker.label} · ${selectedWorker.currentTool}`
                  : selectedWorker.label
                : 'Click a worker on the floor to select them.'}
            </p>
          </section>
        ) : null}

        <section data-office-workers>
          <h4 className="mb-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Right now</h4>
          {workers.length === 0 ? (
            <p className="rounded border border-dashed p-3 text-xs text-muted-foreground" data-office-empty>
              {OFFICE_EMPTY_COPY}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {workers.map((worker) => (
                <OfficeWorkerRow
                  key={worker.id}
                  worker={worker}
                  nowMs={nowMs}
                  selected={worker.id === selectedId}
                  onSelect={() => setSelectedId((prev) => (prev === worker.id ? null : worker.id))}
                />
              ))}
            </div>
          )}
        </section>

        <section data-office-deliveries>
          <h4 className="mb-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Recently finished</h4>
          {deliveries.length === 0 ? (
            <p className="rounded border border-dashed p-3 text-xs text-muted-foreground" data-office-deliveries-empty>
              No recent deliveries observed yet.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {deliveries.map((delivery) => (
                <OfficeDeliveryRow key={delivery.id} delivery={delivery} nowMs={nowMs} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** One live worker card: type, status, desk, the in-flight tool and the task. */
function OfficeWorkerRow({
  worker,
  nowMs,
  selected,
  onSelect,
}: {
  worker: OfficeWorker;
  nowMs: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const waiting = worker.status === 'waiting';
  return (
    <button
      type="button"
      onClick={onSelect}
      data-office-worker={worker.id}
      data-office-worker-type={worker.type}
      data-office-worker-status={worker.status}
      data-office-worker-selected={selected ? 'true' : 'false'}
      className={cn(
        'rounded-lg border px-3 py-2 text-left',
        waiting ? 'border-amber-400/60 bg-amber-400/5' : 'border-line bg-paper',
        selected ? 'ring-2 ring-terracotta/60' : null,
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', waiting ? 'bg-amber-500' : 'animate-pulse bg-emerald-500')}
          aria-hidden="true"
        />
        <span className="truncate text-[13px] font-medium text-ink dark:text-zinc-100" title={worker.label}>
          {worker.label}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
          {worker.type === 'run' ? 'run' : 'loop turn'}
        </span>
        {worker.isBoss ? (
          <span
            className="flex shrink-0 items-center gap-0.5 rounded-full bg-terracotta/10 px-1.5 py-0.5 text-[10px] font-medium text-terracotta"
            data-office-boss
          >
            <Crown className="h-2.5 w-2.5" aria-hidden="true" />
            your session
          </span>
        ) : null}
        {waiting ? (
          <span
            className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
            data-office-waiting
          >
            waiting for you
          </span>
        ) : null}
        <span className="ml-auto shrink-0 text-[10px] text-zinc-500 dark:text-zinc-400">
          {worker.startedAt ? formatRunAgo(worker.startedAt, nowMs) : ''}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-600 dark:text-zinc-300">
        <span className="truncate" data-office-desk>
          {worker.projectBadge ?? 'no project'}
        </span>
        {worker.currentTool ? (
          <span className="flex items-center gap-1" data-office-tool>
            <Wrench className="h-3 w-3" aria-hidden="true" />
            {worker.currentTool}
          </span>
        ) : null}
      </div>
      {worker.task ? (
        <span className="mt-1 line-clamp-2 block text-[11px] text-zinc-500 dark:text-zinc-400" title={worker.task}>
          {worker.task}
        </span>
      ) : null}
    </button>
  );
}

/** One finished run/loop row. A null verdict stays unclaimed (no tick, no cross). */
function OfficeDeliveryRow({ delivery, nowMs }: { delivery: OfficeDelivery; nowMs: number }) {
  const verdict = delivery.ok === null ? 'unknown' : String(delivery.ok);
  return (
    <div
      data-office-delivery={delivery.id}
      data-office-delivery-ok={verdict}
      className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-1.5"
    >
      {delivery.ok === true ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      ) : delivery.ok === false ? (
        <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
      ) : (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" aria-hidden="true" />
      )}
      <span className="truncate text-[12px] text-ink dark:text-zinc-100" title={delivery.label}>
        {delivery.label}
      </span>
      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-300">
        {delivery.type === 'run' ? 'run' : 'loop turn'}
      </span>
      {delivery.toolCount !== null ? (
        <span className="shrink-0 text-[10px] text-zinc-500 dark:text-zinc-400" data-office-tool-count>
          {delivery.toolCount} {delivery.toolCount === 1 ? 'tool call' : 'tool calls'}
        </span>
      ) : null}
      <span className="ml-auto shrink-0 text-[10px] text-zinc-500 dark:text-zinc-400">
        {delivery.endedAt
          ? formatRunAgo(delivery.endedAt, nowMs)
          : delivery.startedAt
            ? formatRunAgo(delivery.startedAt, nowMs)
            : ''}
      </span>
    </div>
  );
}
