import * as React from 'react';
import {
  Code2,
  Copy,
  Download,
  FolderKanban,
  Gauge,
  LayoutTemplate,
  MoreHorizontal,
  Paintbrush,
  Palette,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContextMenu, type ContextMenuEntry } from '@/components/ui/context-menu';
import { DESIGN_SAMPLES, formatUpdated, projectLabel, scoreTone, type DesignExportFormat } from './design';
import { DesignArtboards } from './design-artboards';
import { DesignChat } from './design-chat';
import { useDesignStudio, type DesignStudio } from './use-design-studio';

/**
 * DesignPage — REQ-168: the Design Studio as its OWN full page (the third
 * entry of the `lokma` · `Bots` · `Design` top switch). REQ-172 rebuilt the
 * layout after Google Stitch / Claude Design: two columns only — the left is
 * the brief/iteration CHAT (composer with Type/System chips, Generate as the
 * send action) and the right is the CANVAS (big sandboxed viewer, a Stitch
 * artboard strip of variants, a compact toolbar carrying Code / Critique /
 * Export / ⋯ actions). The old Brief card, Artifacts card, tab stack and
 * info cards are gone; every function still talks to the real endpoints.
 */

const TONE_CLASS: Record<'good' | 'warn' | 'bad', string> = {
  good: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-100 text-amber-700 border-amber-200',
  bad: 'bg-rose-100 text-rose-700 border-rose-200',
};

/** Export menu rows — every stored format stays one click away. */
const EXPORT_MENU: { format: DesignExportFormat; label: string; scale?: 1 | 2 }[] = [
  { format: 'html', label: 'HTML' },
  { format: 'zip', label: 'ZIP (raw + viewer)' },
  { format: 'json', label: 'JSON manifest' },
  { format: 'png', label: 'PNG · 1x', scale: 1 },
  { format: 'png', label: 'PNG · 2x', scale: 2 },
  { format: 'webm', label: 'WebM · 2s clip' },
];

function CodeDrawer({ studio }: { studio: DesignStudio }) {
  const s = studio;
  return (
    <div
      data-design-code-panel
      className="absolute inset-x-0 bottom-0 z-10 max-h-[55%] overflow-y-auto border-t border-line bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.08)] dark:bg-[#1E1E21]"
    >
      <div className="flex items-center gap-2 px-3 pt-2">
        <Code2 className="h-3 w-3 text-terracotta" />
        <span className="text-[11px] font-medium">artifact.html</span>
        <span className="hidden text-[10px] text-zinc-400 sm:inline">edits rebuild the viewer above</span>
        <button
          data-design-panel-close
          className="ml-auto rounded p-0.5 text-zinc-400 hover:bg-muted"
          aria-label="Close code panel"
          onClick={() => s.toggleDrawer('code')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1.5 p-3 pt-2">
        <textarea
          data-design-code
          value={s.htmlEdit}
          onChange={(e) => s.setHtmlEdit(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder="<html>…"
          className="w-full rounded-md border border-line bg-white p-2 font-mono text-[11px] leading-4 focus:border-terracotta/30 focus:outline-none dark:bg-[#0F0F11]"
        />
        {s.htmlError ? <p className="text-[11px] text-rose-600">{s.htmlError}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            data-design-save
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={() => void s.runSave()}
            disabled={!s.selected || s.saving}
          >
            {s.saving ? 'Saving…' : 'Save HTML'}
          </Button>
          <span className="text-[10px] text-zinc-400">stored artifact is updated and the viewer rebuilt</span>
        </div>
      </div>
    </div>
  );
}

function CritiqueDrawer({ studio }: { studio: DesignStudio }) {
  const s = studio;
  return (
    <div
      data-design-critique-panel
      className="absolute inset-x-0 bottom-0 z-10 max-h-[55%] overflow-y-auto border-t border-line bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.08)] dark:bg-[#1E1E21]"
    >
      <div className="flex items-center gap-2 px-3 pt-2">
        <Gauge className="h-3 w-3 text-terracotta" />
        <span className="text-[11px] font-medium">Critique — structural signals</span>
        <Button
          data-design-critique-rerun
          variant="ghost"
          size="sm"
          className="ml-auto h-6 gap-1 px-2 text-[11px]"
          onClick={() => void s.runCritique()}
          disabled={!s.selected || s.critiquing}
        >
          <RefreshCw className="h-3 w-3" /> {s.critiquing ? 'Scoring…' : 'Re-run'}
        </Button>
        <button
          data-design-panel-close
          className="rounded p-0.5 text-zinc-400 hover:bg-muted"
          aria-label="Close critique panel"
          onClick={() => s.toggleDrawer('critique')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-3 pt-2">
        {!s.detail?.critique ? (
          <p className="text-[11px] text-zinc-400">No critique yet — select an artifact and Re-run.</p>
        ) : (
          <div className="space-y-1">
            {s.detail.critique.scores.map((score) => (
              <div key={score.dim} className="flex items-start gap-2 text-[11px]">
                <span className="w-20 shrink-0 capitalize text-zinc-500">{score.dim}</span>
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${TONE_CLASS[scoreTone(score.score)]}`}>
                  {score.score}/10
                </span>
                <span className="text-zinc-500">{score.fixes.length > 0 ? score.fixes.join(' ') : 'Holds the bar.'}</span>
              </div>
            ))}
            <p className="pt-1 text-[10px] text-zinc-400">
              Heuristic structural signals over the stored HTML — never an LLM grade.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function DesignPage() {
  const s = useDesignStudio();
  const [menu, setMenu] = React.useState<{ x: number; y: number; items: ContextMenuEntry[]; label: string } | null>(
    null,
  );

  const openAnchoredMenu = React.useCallback(
    (e: React.MouseEvent<HTMLElement>, label: string, items: ContextMenuEntry[]) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setMenu({ x: rect.left, y: rect.bottom + 4, items, label });
    },
    [],
  );

  const openExportMenu = (e: React.MouseEvent<HTMLElement>) => {
    const rows: ContextMenuEntry[] = [
      { type: 'header', label: s.selected ? `Export ${s.selected}` : 'Export — no artifact selected' },
    ];
    for (const item of EXPORT_MENU) {
      rows.push({
        type: 'item',
        label: item.label,
        icon: Download,
        hint: s.exporting === item.format ? '…' : undefined,
        disabled: !s.selected || s.exporting !== null,
        onSelect: () => void s.runExport(item.format, item.scale),
      });
    }
    openAnchoredMenu(e, 'Export artifact', rows);
  };

  const openArtifactMenu = (e: React.MouseEvent<HTMLElement>) => {
    const armed = Boolean(s.selected) && s.confirmDelete === s.selected;
    openAnchoredMenu(e, 'Artifact actions', [
      { type: 'header', label: s.selected ? `Artifact ${s.selected}` : 'No artifact selected' },
      {
        type: 'item',
        label: 'Copy artifact id',
        icon: Copy,
        disabled: !s.selected,
        onSelect: () => {
          if (!s.selected) return;
          void navigator.clipboard?.writeText(s.selected);
          window.dispatchEvent(new CustomEvent('lokma-toast', { detail: 'Artifact id copied' }));
        },
      },
      { type: 'separator' },
      {
        type: 'item',
        label: armed ? 'Confirm delete' : 'Delete artifact',
        icon: Trash2,
        danger: true,
        hint: armed ? 'click again' : undefined,
        disabled: !s.selected || s.deleting,
        onSelect: () => void s.runDelete(),
      },
    ]);
  };

  const guardChip = s.guard
    ? s.guard.present
      ? s.guard.ok
        ? {
            text: `DESIGN.md · ${s.guard.h2Count} sections`,
            cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
          }
        : {
            text: `DESIGN.md · ${s.guard.h2Count}/7 H2`,
            cls: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
          }
      : { text: 'No .lokma/DESIGN.md — bundled tokens', cls: 'border-line bg-muted/40 text-zinc-500' }
    : null;

  return (
    <div
      data-design-page
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-[#FDFCFB] px-3 py-2 dark:bg-[#1E1E21]">
        <Paintbrush className="h-4 w-4 text-terracotta" />
        <span className="font-serif text-[15px]">Design Studio</span>
        <span
          data-design-project-chip
          title={s.projectCwd || 'Global — ~/.lokma/design/artifacts'}
          className="inline-flex items-center gap-1 rounded-full border border-line bg-muted/40 px-1.5 py-0.5 text-[10px] text-zinc-500"
        >
          <FolderKanban className="h-2.5 w-2.5" /> {projectLabel(s.projectCwd)}
        </span>
        {guardChip ? (
          <span
            data-design-guard
            title="DESIGN.md guard status"
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${guardChip.cls}`}
          >
            <Palette className="h-2.5 w-2.5" /> {guardChip.text}
          </span>
        ) : null}
        <span className="hidden text-[11px] text-zinc-400 sm:inline">
          {s.items.length} artifacts · {s.systems.length > 0 ? s.systems.length : 4} systems
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {s.detail?.critique ? (
            <span
              data-design-score
              className={`rounded-full border px-1.5 py-0.5 text-[10px] ${TONE_CLASS[scoreTone(s.detail.critique.overall)]}`}
            >
              {s.detail.critique.overall}/10
            </span>
          ) : null}
          <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] text-zinc-500">BYOK</span>
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <DesignChat studio={s} />
        <section data-design-canvas className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            data-design-toolbar
            className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line bg-[#FDFCFB] px-2 text-[11px] dark:bg-[#1E1E21]"
          >
            <LayoutTemplate className="h-3 w-3 shrink-0 text-zinc-400" />
            <span className="min-w-0 truncate text-zinc-500">
              {s.sel ? `${s.sel.type} · ${s.sel.system} · ${formatUpdated(s.sel.updatedAt)}` : 'No artifact selected'}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1">
              <Button
                data-design-code-toggle
                variant={s.drawer === 'code' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                disabled={!s.selected}
                onClick={() => s.toggleDrawer('code')}
              >
                <Code2 className="h-3 w-3" /> Code
              </Button>
              <Button
                data-design-critique-toggle
                variant={s.drawer === 'critique' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                disabled={!s.selected}
                onClick={() => s.toggleDrawer('critique')}
              >
                <Gauge className="h-3 w-3" /> Critique
              </Button>
              <Button
                data-design-export-toggle
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                disabled={!s.selected}
                onClick={openExportMenu}
              >
                <Download className="h-3 w-3" /> Export
              </Button>
              <Button
                data-design-menu-toggle
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                aria-label="Artifact actions"
                onClick={openArtifactMenu}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </span>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden bg-white dark:bg-[#0F0F11]">
            <div data-design-viewer className="absolute inset-0 overflow-hidden">
              {s.viewerSrc ? (
                <iframe
                  key={s.viewerSrc + (s.detail?.manifest.updatedAt ?? '')}
                  data-design-viewer-frame
                  src={s.viewerSrc}
                  sandbox="allow-scripts allow-same-origin"
                  className="h-full w-full border-0 bg-white"
                  title="Design preview"
                />
              ) : (
                <div data-design-empty className="grid h-full place-items-center overflow-y-auto px-6 py-8">
                  <div className="w-full max-w-md text-center">
                    <Sparkles className="mx-auto h-5 w-5 text-terracotta" />
                    {s.detailLoading ? (
                      <p className="mt-2 font-serif text-[15px] text-ink dark:text-white">Loading…</p>
                    ) : s.detailError ? (
                      <p className="mt-2 text-[12px] leading-5 text-rose-600 dark:text-rose-300">{s.detailError}</p>
                    ) : (
                      <>
                        <p className="mt-2 font-serif text-[16px] text-ink dark:text-white">Start with a brief</p>
                        <p className="mx-auto mt-1 max-w-[42ch] text-[12px] leading-5 text-zinc-500 dark:text-zinc-400">
                          Write it on the left, then press{' '}
                          <span className="font-medium text-terracotta">Generate</span>. Or pick a sample — it fills
                          the brief for you:
                        </p>
                        <div data-design-samples className="mt-4 flex flex-wrap justify-center gap-1.5">
                          {DESIGN_SAMPLES.map((sample) => (
                            <button
                              key={sample.id}
                              type="button"
                              data-design-sample={sample.id}
                              title={sample.brief}
                              onClick={() => s.applySample(sample)}
                              className="rounded-full border border-line bg-white px-2.5 py-1 text-[11px] text-zinc-600 transition-colors hover:border-terracotta/50 hover:bg-[#F7F5F1] hover:text-ink dark:bg-[#1E1E21] dark:text-zinc-300 dark:hover:bg-[#242427] dark:hover:text-white"
                            >
                              {sample.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            {s.drawer === 'code' ? <CodeDrawer studio={s} /> : null}
            {s.drawer === 'critique' ? <CritiqueDrawer studio={s} /> : null}
          </div>
          <DesignArtboards studio={s} />
        </section>
      </div>
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} label={menu.label} items={menu.items} onClose={() => setMenu(null)} />
      ) : null}
    </div>
  );
}
