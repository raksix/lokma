import * as React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { DESIGN_TYPES, artifactBadge, overallLabel, type NormalizedArtifact } from './design';
import type { DesignStudio } from './use-design-studio';

/**
 * DesignArtboards (REQ-172) — the Stitch-style variant strip under the canvas:
 * every filtered artifact is a small live preview, one click swaps the big
 * canvas. Search + type filter moved here from the retired Artifacts card;
 * the counter stays visible so filtering is never a mystery.
 *
 * Previews are real sandboxed viewers (`/api/design/:id/view`) scaled down —
 * nothing is faked. Only the first `PREVIEW_CAP` thumbnails mount an iframe
 * (each one is a full render); the rest show a labeled placeholder card so a
 * long list cannot melt the tab.
 */

const PREVIEW_CAP = 24;

const selectClass =
  'h-7 rounded-md border border-line bg-white px-1.5 text-[11px] focus:border-terracotta/30 focus:outline-none dark:bg-[#0F0F11]';

function Artboard({
  row,
  active,
  onSelect,
  withFrame,
}: {
  row: NormalizedArtifact;
  active: boolean;
  onSelect: (id: string) => void;
  withFrame: boolean;
}) {
  return (
    <button
      data-design-artboard={row.id}
      onClick={() => onSelect(row.id)}
      title={`${row.brief} · ${row.system} · ${overallLabel(row.overall)}`}
      className={`w-[180px] shrink-0 overflow-hidden rounded-lg border bg-white text-left dark:bg-[#141416] ${
        active ? 'border-terracotta ring-1 ring-terracotta/40' : 'border-line hover:border-zinc-300 dark:hover:border-zinc-600'
      }`}
    >
      <span className="block h-[104px] w-full overflow-hidden bg-[#FAF9F5] dark:bg-[#0F0F11]">
        {withFrame ? (
          <iframe
            data-design-artboard-frame={row.id}
            src={api.designViewUrl(row.id)}
            sandbox="allow-scripts allow-same-origin"
            loading="lazy"
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none border-0"
            style={{ width: '720px', height: '416px', transform: 'scale(0.25)', transformOrigin: 'top left' }}
            title={`${row.brief} preview`}
          />
        ) : (
          <span className="grid h-full w-full place-items-center font-mono text-[11px] text-zinc-400">
            {artifactBadge(row.type)}
          </span>
        )}
      </span>
      <span className="flex items-center gap-1 px-2 py-1">
        <span className="min-w-0 flex-1 truncate text-[10px]">{row.brief}</span>
        <span className="shrink-0 text-[10px] text-zinc-400">{overallLabel(row.overall)}</span>
      </span>
    </button>
  );
}

export function DesignArtboards({ studio }: { studio: DesignStudio }) {
  const s = studio;
  return (
    <div data-design-strip className="shrink-0 border-t border-line bg-[#FDFCFB] dark:bg-[#1E1E21]">
      <div className="flex items-center gap-2 px-2.5 pt-2">
        <div className="relative min-w-0 flex-1 sm:max-w-[260px]">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400" />
          <Input
            value={s.q}
            onChange={(e) => s.setQ(e.target.value)}
            placeholder="Search artifacts..."
            aria-label="Search artifacts"
            className="h-7 pl-7 text-[11px]"
          />
        </div>
        <select
          aria-label="Filter by type"
          value={s.typeFilter}
          onChange={(e) => s.setTypeFilter(e.target.value)}
          className={selectClass}
        >
          <option value="all">all types</option>
          {DESIGN_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {s.loading ? (
          <span className="text-[10px] text-zinc-400">Loading…</span>
        ) : s.error ? (
          <span className="min-w-0 flex-1 truncate text-[10px] text-rose-600">
            {s.error}{' '}
            <button className="underline" onClick={s.reload}>
              Retry
            </button>
          </span>
        ) : null}
        <span className="ml-auto text-[10px] text-zinc-400">
          {s.filtered.length}/{s.items.length}
        </span>
      </div>
      {s.items.length === 0 && !s.loading && !s.error ? (
        <p className="px-2.5 pb-2 pt-1 text-[11px] text-zinc-400">
          No artifacts yet — write a brief and Generate your first one.
        </p>
      ) : s.filtered.length === 0 ? (
        <p className="px-2.5 pb-2 pt-1 text-[11px] text-zinc-400">No artifacts match.</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto px-2.5 py-2">
          {s.filtered.map((row, i) => (
            <Artboard
              key={row.id}
              row={row}
              active={row.id === s.selected}
              onSelect={s.setSelected}
              withFrame={i < PREVIEW_CAP}
            />
          ))}
        </div>
      )}
    </div>
  );
}
