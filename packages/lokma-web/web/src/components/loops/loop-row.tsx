import * as React from 'react';
import { FolderOpen, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRunAgo } from '@/components/testing';
import type { LoopView } from '@/lib/api';
import {
  activityLabel,
  bestScoreLabel,
  budgetBars,
  hoursLabel,
  iterLabel,
  nextHintLabel,
  statusLabel,
  statusTone,
  stopReasonLabel,
  turnInFlight,
  usdLabel,
} from './loop';

/**
 * LoopRow — kapsam 2 (the readable one-line-per-loop row) + kapsam 6 (honest
 * states).
 *
 * Every field comes from a measured helper in `loop.ts`; this file adds layout
 * only. The two rules that shape the markup:
 *
 *  - the live dot rides `turnInFlight` (a dispatched-and-unbooked turn), NOT
 *    `status === 'running'`, which only means the loop is ARMED;
 *  - anything the loop did not measure is OMITTED (no "— next run soon", no
 *    `0` for a score, no full bar for an uncapped budget).
 */

const TONE_CLASS: Record<ReturnType<typeof statusTone>, string> = {
  live: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  info: 'bg-terracotta/10 text-terracotta',
  warn: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  bad: 'bg-red-500/15 text-red-600 dark:text-red-400',
  muted: 'bg-muted text-zinc-500 dark:text-zinc-400',
};

const BAR_CLASS: Record<'iters' | 'hours' | 'usd', string> = {
  iters: 'bg-terracotta',
  hours: 'bg-sky-500',
  usd: 'bg-violet-500',
};

function BudgetBar({ id, ratio, capped, label }: { id: 'iters' | 'hours' | 'usd'; ratio: number; capped: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-14 overflow-hidden rounded-full bg-muted" role="presentation">
        <div
          className={cn('h-full rounded-full', capped ? 'bg-red-500' : BAR_CLASS[id])}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{label}</span>
    </div>
  );
}

export function LoopRow({
  loop,
  selected,
  fresh,
  nowMs,
  onSelect,
}: {
  loop: LoopView;
  selected: boolean;
  /** A turn landed since the last paint (kapsam 5's "new" mark). */
  fresh: boolean;
  nowMs: number;
  onSelect: (id: string) => void;
}) {
  const bars = budgetBars(loop);
  const tone = statusTone(loop.status);
  const live = turnInFlight(loop);
  const hint = nextHintLabel(loop);
  const best = bestScoreLabel(loop);
  const reason = stopReasonLabel(loop.stopReason);
  const agoSource = loop.lastRunStartedAt ?? loop.updatedAt;

  return (
    <button
      type="button"
      data-loop-row={loop.id}
      data-loop-status={loop.status}
      aria-pressed={selected}
      aria-label={`Loop ${loop.name}`}
      onClick={() => onSelect(loop.id)}
      className={cn(
        'block w-full rounded-lg border px-3 py-2 text-left transition',
        selected
          ? 'border-terracotta bg-terracotta/5'
          : 'border-line bg-paper hover:bg-muted dark:hover:bg-[#1E1E21]',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', live ? 'animate-pulse bg-emerald-500' : 'bg-transparent')}
          aria-hidden="true"
        />
        <span className="truncate text-[13px] font-medium text-ink dark:text-zinc-100">{loop.name}</span>
        <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium', TONE_CLASS[tone])}>
          {statusLabel(loop.status)}
        </span>
        {fresh ? (
          <span className="shrink-0 rounded-full bg-terracotta px-1.5 py-0.5 text-[10px] text-white">new turn</span>
        ) : null}
        <span className="ml-auto shrink-0 text-[10px] text-zinc-500 dark:text-zinc-400">{formatRunAgo(agoSource, nowMs)}</span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-600 dark:text-zinc-300">
        <span className="tabular-nums">{iterLabel(loop)}</span>
        <BudgetBar id="hours" ratio={bars.hours} capped={bars.capped} label={hoursLabel(loop)} />
        <BudgetBar id="usd" ratio={bars.usd} capped={bars.capped} label={usdLabel(loop)} />
      </div>

      <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        <Repeat className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{activityLabel(loop)}</span>
        {loop.origin === 'agent' ? (
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px]">by agent</span>
        ) : null}
        {reason ? <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px]">{reason}</span> : null}
        {best ? <span className="shrink-0 tabular-nums">best {best}</span> : null}
        {loop.projectId ? (
          <span className="ml-auto flex shrink-0 items-center gap-1 truncate">
            <FolderOpen className="h-3 w-3" aria-hidden="true" />
            {loop.projectId}
          </span>
        ) : (
          <span className="ml-auto shrink-0 rounded bg-muted px-1 py-0.5 text-[10px]">no project</span>
        )}
      </div>

      {hint ? (
        <div className="mt-1 truncate text-[11px] text-zinc-600 dark:text-zinc-300" data-loop-next-hint>
          Next: {hint}
        </div>
      ) : null}
    </button>
  );
}