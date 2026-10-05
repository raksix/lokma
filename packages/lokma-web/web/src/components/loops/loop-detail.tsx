import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { emitToast } from '@/components/shell';
import { api, type LoopDetailRes, type LoopPauseRes, type LoopView } from '@/lib/api';
import {
  activityLabel,
  bestScoreLabel,
  hoursLabel,
  iterLabel,
  LOOP_EMPTY_COPY,
  outcomeLabel,
  remainingLabel,
  statusLabel,
  statusTone,
  stopReasonLabel,
  targetScoreLabel,
  triggerLabel,
  usdLabel,
} from './loop';

/**
 * LoopDetail — kapsam 3 (raw `state.json`, last ledger turns, the FULL prompt
 * and the honest "what is left" answer) + kapsam 4 (the controls).
 *
 * Two honesty rules are structural here, not cosmetic:
 *  - `state.json` is rendered as the RAW bytes the server read (never a
 *    re-serialized object) and `statePath` is shown with it, because the
 *    user asked to SEE the file;
 *  - "Neler kaldı?" branches on `remaining === null` (no `scope.md` at all) vs
 *    `[]` (a scope file whose items are all checked). Collapsing the two makes
 *    a loop with no checklist claim "0 items left" as if someone wrote one.
 */

export type LoopAction = 'pause' | 'resume' | 'abort' | 'run' | 'delete';

const TONE_CLASS: Record<ReturnType<typeof statusTone>, string> = {
  live: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  info: 'bg-terracotta/10 text-terracotta',
  warn: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  bad: 'bg-red-500/15 text-red-600 dark:text-red-400',
  muted: 'bg-muted text-zinc-500 dark:text-zinc-400',
};

function Block({ title, path, children }: { title: string; path?: string | null; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-line p-2">
      <header className="mb-1 flex items-center gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</h4>
        {path ? (
          <span className="truncate text-[10px] text-zinc-400" title={path}>
            {path}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

const preClass =
  'max-h-56 overflow-auto rounded bg-[#FAF9F5] p-2 font-mono text-[11px] leading-relaxed text-zinc-700 dark:bg-[#0F0F11] dark:text-zinc-300';

function LoopControls({
  loop,
  busy,
  confirmDelete,
  onAction,
  onConfirmDelete,
}: {
  loop: LoopView;
  busy: LoopAction | null;
  confirmDelete: boolean;
  onAction: (a: LoopAction) => void;
  onConfirmDelete: (next: boolean) => void;
}) {
  const terminal = loop.status === 'done' || loop.status === 'error';
  const disabled = (a: LoopAction) => busy !== null || (terminal && a !== 'resume' && a !== 'delete');
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        aria-label="Pause loop"
        disabled={disabled('pause')}
        onClick={() => onAction('pause')}
      >
        Pause
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-label="Resume loop"
        disabled={disabled('resume')}
        onClick={() => onAction('resume')}
      >
        Resume
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-label="Run one turn now"
        disabled={disabled('run')}
        onClick={() => onAction('run')}
      >
        Run now
      </Button>
      <Button
        variant="destructive"
        size="sm"
        aria-label="Stop loop"
        disabled={disabled('abort')}
        onClick={() => onAction('abort')}
      >
        Stop
      </Button>
      {confirmDelete ? (
        <>
          <Button variant="destructive" size="sm" aria-label="Confirm delete loop" onClick={() => onAction('delete')}>
            Confirm delete
          </Button>
          <Button variant="ghost" size="sm" aria-label="Cancel delete" onClick={() => onConfirmDelete(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="sm" aria-label="Delete loop" onClick={() => onConfirmDelete(true)}>
          Delete
        </Button>
      )}
      {busy ? <Loader2 className="h-3 w-3 animate-spin text-zinc-400" aria-hidden="true" /> : null}
    </div>
  );
}

export function LoopDetail({
  loop,
  onLoopUpdated,
  onDeleted,
}: {
  loop: LoopView;
  onLoopUpdated: (loop: LoopView) => void;
  onDeleted: (id: string) => void;
}) {
  const [detail, setDetail] = React.useState<LoopDetailRes | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<LoopAction | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await api.getLoopDetail(loop.id);
      setDetail(res);
      setError(null);
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : 'Could not load loop detail');
    }
  }, [loop.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function act(action: LoopAction): Promise<void> {
    setBusy(action);
    try {
      if (action === 'pause') {
        const res: LoopPauseRes = await api.pauseLoop(loop.id);
        onLoopUpdated(res.loop);
        // `deferred` is the honest wording: the turn in flight still finishes.
        if (res.deferred) emitToast('Stopping after the current turn finishes.');
      } else if (action === 'resume') {
        const res = await api.resumeLoop(loop.id);
        onLoopUpdated(res.loop);
      } else if (action === 'run') {
        const res = await api.runLoop(loop.id);
        onLoopUpdated(res.loop);
        // 202: queued, not finished — never claim the turn already ran.
        emitToast(res.accepted ? 'Turn queued in the background.' : 'Turn not accepted.');
      } else if (action === 'abort') {
        const res = await api.abortLoop(loop.id);
        onLoopUpdated(res.loop);
        if (!res.cutTurn) emitToast('No turn in flight — nothing was cut.');
      } else {
        await api.deleteLoop(loop.id);
        onDeleted(loop.id);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setBusy(null);
    }
  }

  const remaining = detail ? remainingLabel(detail.remaining) : null;
  const reason = stopReasonLabel(loop.stopReason);
  const outcome = outcomeLabel(loop.lastRunOutcome);
  const tone = statusTone(loop.status);

  return (
    <div className="flex min-h-0 flex-col gap-2" data-loop-detail={loop.id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TONE_CLASS[tone])}>{statusLabel(loop.status)}</span>
        <span className="text-[12px] text-zinc-600 dark:text-zinc-300">{activityLabel(loop)}</span>
        {reason ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]" data-loop-stop-reason>
            {reason}
          </span>
        ) : null}
        {outcome ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]" data-loop-outcome>
            {outcome}
          </span>
        ) : null}
      </div>

      <LoopControls
        loop={loop}
        busy={busy}
        confirmDelete={confirmDelete}
        onAction={(a) => void act(a)}
        onConfirmDelete={setConfirmDelete}
      />

      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-300">
        <dt className="text-zinc-400">trigger</dt>
        <dd className="truncate">{triggerLabel(loop)}</dd>
        <dt className="text-zinc-400">iterations</dt>
        <dd className="tabular-nums">{iterLabel(loop)}</dd>
        <dt className="text-zinc-400">hours</dt>
        <dd className="tabular-nums">{hoursLabel(loop)}</dd>
        <dt className="text-zinc-400">usd</dt>
        <dd className="tabular-nums">{usdLabel(loop)}</dd>
        <dt className="text-zinc-400">best</dt>
        <dd>{bestScoreLabel(loop) ?? '—'}</dd>
        <dt className="text-zinc-400">target</dt>
        <dd>{targetScoreLabel(loop) ?? '—'}</dd>
        <dt className="text-zinc-400">model</dt>
        <dd className="truncate">{loop.model}</dd>
        <dt className="text-zinc-400">cwd</dt>
        <dd className="truncate" title={loop.cwd}>
          {loop.cwd}
        </dd>
      </dl>

      <Block title="What is left">
        {detail === null ? (
          <p className="text-[11px] text-zinc-400">{error ?? 'Loading…'}</p>
        ) : detail.remaining === null ? (
          // No scope.md: no list at all. Showing an empty one would read as
          // "a checklist exists and it is empty".
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400" data-loop-no-scope>
            {LOOP_NO_SCOPE}
          </p>
        ) : (
          <div data-loop-remaining>
            <p className="mb-1 text-[11px] text-zinc-500 dark:text-zinc-400">{remaining}</p>
            <ul className="list-inside list-disc text-[11px] text-zinc-700 dark:text-zinc-200">
              {detail.remaining.map((item, i) => (
                <li key={`${i}-${item.slice(0, 24)}`}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </Block>

      <Block title="Prompt">
        <pre className={preClass}>{loop.prompt}</pre>
      </Block>

      <Block title="Ledger" path={detail?.ledgerPath}>
        {detail === null ? (
          <p className="text-[11px] text-zinc-400">Loading…</p>
        ) : detail.ledger.trim() ? (
          <pre className={preClass} data-loop-ledger>
            {detail.ledger}
          </pre>
        ) : (
          <p className="text-[11px] text-zinc-400">Ledger is empty — no turn has been booked yet.</p>
        )}
      </Block>

      <Block title="state.json" path={detail?.statePath}>
        {detail === null ? (
          <p className="text-[11px] text-zinc-400">{error ?? 'Loading…'}</p>
        ) : (
          <pre className={preClass} data-loop-state-json>
            {detail.stateJson}
          </pre>
        )}
      </Block>

      {error && detail !== null ? (
        <p className="text-[11px] text-red-500" data-loop-detail-error>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Kapsam 3: with no `scope.md` the panel says so and shows nothing else. */
export const LOOP_NO_SCOPE = 'No scope.md — this loop has no checklist, so nothing is listed here.';
export const LOOP_EMPTY_TITLE = 'No loop selected';