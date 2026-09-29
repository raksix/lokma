import * as React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DESIGN_SYSTEMS,
  DESIGN_TYPES,
  formatUpdated,
  overallLabel,
  type DesignEvent,
  type NormalizedArtifact,
} from './design';
import type { DesignStudio } from './use-design-studio';

/**
 * DesignChat (REQ-172) — the left column of the Design Studio. What used to
 * be two stacked cards ("Brief" + "Artifacts") is now a single message flow:
 * every artifact reads as a user brief with its status chips, session events
 * ("Generated …", "HTML saved") land as narration chips, and the composer at
 * the bottom owns Type / System / brief — Generate is the send action.
 */

const selectClass =
  'h-7 w-full rounded-md border border-line bg-white px-1.5 text-[11px] focus:border-terracotta/30 focus:outline-none dark:bg-[#0F0F11]';

const EVENT_CLASS: Record<DesignEvent['kind'], string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  info: 'border-line bg-muted/40 text-zinc-500',
  error: 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300',
};

function ArtifactMessage({
  row,
  active,
  onSelect,
}: {
  row: NormalizedArtifact;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">You</p>
      <button
        data-design-msg={row.id}
        onClick={() => onSelect(row.id)}
        title={`${row.type} · ${row.system} · ${overallLabel(row.overall)}`}
        className={`block w-full rounded-xl border px-2.5 py-2 text-left text-[12px] leading-5 ${
          active
            ? 'border-terracotta/50 bg-terracotta/10'
            : 'border-line bg-white hover:bg-[#F7F5F1] dark:bg-[#1E1E21] dark:hover:bg-[#242427]'
        }`}
      >
        {row.brief}
      </button>
      <div className="flex flex-wrap items-center gap-1 pl-0.5">
        <span className="rounded-full border border-line bg-white px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-[#1E1E21]">
          {row.type}
        </span>
        <span className="rounded-full border border-line bg-white px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-[#1E1E21]">
          {row.system}
        </span>
        <span className="rounded-full border border-line bg-white px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-[#1E1E21]">
          {overallLabel(row.overall)}
        </span>
        <span className="text-[10px] text-zinc-400">{formatUpdated(row.updatedAt)}</span>
      </div>
    </div>
  );
}

export function DesignChat({ studio }: { studio: DesignStudio }) {
  const s = studio;
  const threadRef = React.useRef<HTMLDivElement>(null);
  // Keep the newest line in view as artifacts/events/generating land.
  React.useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.items.length, s.events.length, s.generating]);
  // The server list is newest-first; the thread reads oldest-first.
  const ordered = React.useMemo(() => [...s.items].reverse(), [s.items]);
  return (
    <aside
      data-design-chat
      className="flex max-h-[45vh] w-full shrink-0 flex-col border-b border-line bg-[#FDFCFB] md:h-full md:max-h-none md:w-[340px] md:border-b-0 md:border-r lg:w-[380px] dark:bg-[#1E1E21]"
    >
      <div ref={threadRef} data-design-thread className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {s.loading && s.items.length === 0 ? (
          <p className="text-[11px] text-zinc-400">Loading artifacts…</p>
        ) : null}
        {!s.loading && s.error ? (
          <p className="text-[11px] text-rose-600">
            {s.error}{' '}
            <button className="underline" onClick={s.reload}>
              Retry
            </button>
          </p>
        ) : null}
        {!s.loading && !s.error && ordered.length === 0 && s.events.length === 0 && !s.generating ? (
          <p className="text-[11px] text-zinc-400">No artifacts yet — write your first brief below.</p>
        ) : null}
        {ordered.map((row) => (
          <ArtifactMessage key={row.id} row={row} active={row.id === s.selected} onSelect={s.setSelected} />
        ))}
        {s.events.map((e) => (
          <div
            key={e.id}
            data-design-event
            className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px] ${EVENT_CLASS[e.kind]}`}
          >
            <span className="truncate">{e.text}</span>
          </div>
        ))}
        {s.generating ? (
          <div
            data-design-event
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${EVENT_CLASS.info}`}
          >
            <Loader2 className="h-3 w-3 animate-spin" /> Generating…
          </div>
        ) : null}
      </div>
      <div data-design-composer className="shrink-0 border-t border-line bg-[#FDFCFB] p-3 dark:bg-[#1E1E21]">
        <div className="grid grid-cols-2 gap-2">
          <label htmlFor="design-type" className="block text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            Type
            <select
              id="design-type"
              data-design-composer-type
              value={s.form.type}
              onChange={(e) => s.setForm((f) => ({ ...f, type: e.target.value }))}
              className={`${selectClass} mt-1`}
            >
              {DESIGN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="design-system" className="block text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            System
            <select
              id="design-system"
              data-design-composer-system
              value={s.form.system}
              onChange={(e) => s.setForm((f) => ({ ...f, system: e.target.value }))}
              className={`${selectClass} mt-1`}
            >
              {DESIGN_SYSTEMS.map((system) => (
                <option key={system} value={system}>
                  {system}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label htmlFor="design-brief" className="mt-2 block text-[10px] font-medium uppercase tracking-wide text-zinc-400">
          Brief
        </label>
        <textarea
          id="design-brief"
          data-design-brief
          value={s.form.brief}
          onChange={(e) => s.setForm((f) => ({ ...f, brief: e.target.value }))}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void s.runGenerate();
            }
          }}
          rows={3}
          placeholder="e.g. pricing page, 3 tiers, terracotta, Stripe polish…"
          className="mt-1 w-full resize-none rounded-lg border border-line bg-white p-2.5 text-[12px] leading-5 focus:border-terracotta/30 focus:outline-none dark:bg-[#0F0F11]"
        />
        {s.formError ? <p className="mt-1 text-[11px] text-rose-600">{s.formError}</p> : null}
        <Button
          data-design-generate
          size="sm"
          className="mt-2 h-8 w-full gap-1.5 text-xs"
          onClick={() => void s.runGenerate()}
          disabled={s.generating}
        >
          <Sparkles className="h-3.5 w-3.5" /> {s.generating ? 'Generating…' : 'Generate'}
        </Button>
      </div>
    </aside>
  );
}
