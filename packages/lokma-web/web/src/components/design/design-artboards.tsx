import * as React from 'react';
import { LayoutTemplate, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectMenu, type SelectMenuOption } from '@/components/ui/select-menu';
import { api } from '@/lib/api';
import { DESIGN_TYPES, artifactBadge, overallLabel, type NormalizedArtifact } from './design';
import type { DesignStudio } from './use-design-studio';

/**
 * DesignArtboards (REQ-189) — the ARTIFACTS PANEL: the right-hand, closable
 * column of the Design Studio. It carries exactly what the REQ-172 variant
 * strip carried (search, the SelectMenu type filter, every filtered artifact
 * as a live sandboxed preview) and nothing is lost by hiding it — the selected
 * artifact, the canvas and the composer stay where they are.
 *
 * The panel is a SECONDARY surface: it is closed by default (canvas gets the
 * full width), one toolbar button opens it, Esc or its own close button shuts
 * it, and picking an artifact leaves it open so the list stays reusable.
 *
 * No new panel primitive was invented for this — the app has no collapsible
 * panel in `components/ui/`, so the shell composes what already exists
 * (Button + Input + SelectMenu + the same line/muted tokens the studio uses).
 *
 * Previews are real sandboxed viewers (`/api/design/:id/view`) scaled down —
 * nothing is faked. Only the first `PREVIEW_CAP` thumbnails mount an iframe
 * (each one is a full render); the rest show a labeled placeholder card so a
 * long list cannot melt the tab.
 */

const PREVIEW_CAP = 24;

/** REQ-179 — the type filter is the app's SelectMenu, not a native select. */
const TYPE_FILTER_OPTIONS: SelectMenuOption[] = [
  { value: 'all', label: 'all types' },
  ...DESIGN_TYPES.map((t) => ({ value: t, label: t })),
];

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
      className={`w-full overflow-hidden rounded-lg border bg-white text-left dark:bg-[#141416] ${
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
          <span className="grid h-full w-full place-items-center font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
            {artifactBadge(row.type)}
          </span>
        )}
      </span>
      <span className="flex items-center gap-1 px-2 py-1">
        <span className="min-w-0 flex-1 truncate text-[10px]">{row.brief}</span>
        <span className="shrink-0 text-[10px] text-zinc-500 dark:text-zinc-400">{overallLabel(row.overall)}</span>
      </span>
    </button>
  );
}

export function DesignArtboards({ studio, panelRef }: { studio: DesignStudio; panelRef?: React.Ref<HTMLDivElement> }) {
  const s = studio;
  return (
    <div
      ref={panelRef}
      id="lokma-design-artifacts-panel"
      data-design-artifacts-panel
      tabIndex={-1}
      aria-label="Artifacts panel"
      className="flex max-h-[60vh] w-full shrink-0 flex-col overflow-hidden border-t border-line bg-[#FDFCFB] focus:outline-none md:max-h-none md:w-[380px] md:border-l md:border-t-0 lg:w-[420px] dark:bg-[#1E1E21]"
    >
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line px-2 text-[11px]">
        <LayoutTemplate className="h-3 w-3 shrink-0 text-zinc-400" />
        <span className="font-medium">Artifacts</span>
        <span
          data-design-artifacts-count
          className="rounded-full border border-line px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400"
        >
          {s.items.length}
        </span>
        <Button
          data-design-artifacts-close
          variant="ghost"
          size="sm"
          className="ml-auto h-6 w-6 p-0"
          aria-label="Close artifacts panel"
          onClick={() => s.toggleArtifactsPanel()}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div data-design-strip className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-2.5 py-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400" />
            <Input
              value={s.q}
              onChange={(e) => s.setQ(e.target.value)}
              placeholder="Search artifacts..."
              aria-label="Search artifacts"
              className="h-7 pl-7 text-[11px]"
            />
          </div>
          <SelectMenu
            ariaLabel="Filter by type"
            size="xs"
            align="end"
            value={s.typeFilter}
            onChange={s.setTypeFilter}
            options={TYPE_FILTER_OPTIONS}
            triggerClassName="w-[112px]"
            triggerAttrs={{ 'data-design-strip-filter': '' }}
          />
        </div>
        {s.loading ? (
          <p className="px-2.5 pb-2 text-[10px] text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : s.error ? (
          <p className="min-w-0 px-2.5 pb-2 text-[10px] text-rose-600 dark:text-rose-300">
            {s.error}{' '}
            <button className="underline" onClick={s.reload}>
              Retry
            </button>
          </p>
        ) : null}
        <span data-design-artifacts-counter className="px-2.5 pb-1 text-[10px] text-zinc-500 dark:text-zinc-400">
          {s.filtered.length}/{s.items.length}
        </span>
        {s.items.length === 0 && !s.loading && !s.error ? (
          <p data-design-artifacts-empty className="px-2.5 pb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            No artifacts yet — write a brief on the left and Generate your first one.
          </p>
        ) : s.filtered.length === 0 ? (
          <p className="px-2.5 pb-2 text-[11px] text-zinc-500 dark:text-zinc-400">No artifacts match.</p>
        ) : (
          <div
            data-design-artifacts-grid
            className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto px-2.5 pb-2 sm:grid-cols-2 lg:grid-cols-1"
          >
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
    </div>
  );
}