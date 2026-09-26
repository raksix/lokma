import * as React from 'react';
import {
  Code2,
  Download,
  FileText,
  Film,
  Gauge,
  Image as ImageIcon,
  LayoutTemplate,
  Palette,
  Paintbrush,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DESIGN_SYSTEMS, DESIGN_TYPES, artifactBadge, formatUpdated, overallLabel, scoreTone } from './design';
import { useDesignStudio } from './use-design-studio';

/**
 * DesignPage — REQ-168: the Design Studio as its OWN full page (the third
 * entry of the `lokma` · `Bots` · `Design` top switch), not a pane, not a
 * modal and not a Settings section. Claude-Design-style layout: the brief
 * (type + system + brief + Generate) and the artifact list live in the left
 * column, the live canvas (sandboxed viewer + Code/Critique/Export tabs)
 * takes the right. Every action stays on the real endpoints — generate,
 * viewer build, save, critique, exports, guard, two-click delete (ported 1:1
 * from the retired DesignPane; the logic lives in `useDesignStudio`).
 */

const TYPE_ICONS: Record<string, typeof LayoutTemplate> = {
  prototype: LayoutTemplate,
  deck: FileText,
  mobile: Smartphone,
  image: ImageIcon,
  document: FileText,
  hyperframe: Film,
};

const inputClass =
  'h-7 rounded-md border border-line bg-white px-2 text-xs focus:outline-none focus:border-terracotta/30 dark:bg-[#1E1E21]';

const TONE_CLASS: Record<'good' | 'warn' | 'bad', string> = {
  good: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-100 text-amber-700 border-amber-200',
  bad: 'bg-rose-100 text-rose-700 border-rose-200',
};

export function DesignPage() {
  const s = useDesignStudio();
  const guardBadge = s.guard
    ? s.guard.present
      ? s.guard.ok
        ? { text: `DESIGN.md · ${s.guard.h2Count} sections`, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
        : { text: `DESIGN.md · ${s.guard.h2Count}/7 H2`, cls: 'bg-amber-100 text-amber-700 border-amber-200' }
      : { text: 'No .lokma/DESIGN.md — bundled tokens', cls: 'bg-muted text-muted-foreground border-line' }
    : null;
  return (
    <div
      data-design-page
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-[#FDFCFB] px-4 py-2 dark:bg-[#1E1E21]">
        <Paintbrush className="h-4 w-4 text-terracotta" />
        <span className="font-serif text-[15px]">Design Studio</span>
        <span className="hidden text-[11px] text-zinc-400 sm:inline">
          brief on the left · canvas on the right · .lokma/DESIGN.md guard
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {s.detail?.critique && (
            <span
              data-design-score
              className={`rounded-full border px-1.5 py-0.5 text-[10px] ${TONE_CLASS[scoreTone(s.detail.critique.overall)]}`}
            >
              {s.detail.critique.overall}/10
            </span>
          )}
          <span className="rounded-full bg-terracotta px-1.5 py-0.5 text-[10px] text-white">BYOK</span>
          <Button
            variant={s.confirmDelete === s.selected ? 'destructive' : 'ghost'}
            size="sm"
            data-design-delete
            className="h-6 gap-1 text-[11px]"
            aria-label={s.confirmDelete === s.selected ? 'Confirm artifact delete' : 'Delete artifact'}
            title={s.confirmDelete === s.selected ? 'Click again to confirm delete' : 'Delete this artifact'}
            disabled={!s.selected || s.deleting}
            onClick={() => void s.runDelete()}
          >
            <Trash2 className="h-3 w-3" />
            {s.confirmDelete === s.selected ? 'Confirm?' : s.deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-b border-line p-3 md:w-[360px] md:border-b-0 md:border-r lg:w-[400px]">
          <div className="rounded-lg border border-line bg-white p-2.5 dark:bg-[#1E1E21]">
            <div className="flex items-center gap-1 text-xs font-medium">
              <Sparkles className="h-3 w-3 text-terracotta" /> Brief
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label htmlFor="design-type" className="block text-[11px] text-zinc-500">
                Type
                <select
                  id="design-type"
                  value={s.form.type}
                  onChange={(e) => s.setForm((f) => ({ ...f, type: e.target.value }))}
                  className={`${inputClass} mt-1 w-full`}
                >
                  {DESIGN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="design-system" className="block text-[11px] text-zinc-500">
                System
                <select
                  id="design-system"
                  value={s.form.system}
                  onChange={(e) => s.setForm((f) => ({ ...f, system: e.target.value }))}
                  className={`${inputClass} mt-1 w-full`}
                >
                  {DESIGN_SYSTEMS.map((system) => (
                    <option key={system} value={system}>
                      {system}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label htmlFor="design-brief" className="mt-2 block text-[11px] text-zinc-500">
              Brief
            </label>
            <textarea
              id="design-brief"
              data-design-brief
              value={s.form.brief}
              onChange={(e) => s.setForm((f) => ({ ...f, brief: e.target.value }))}
              rows={3}
              placeholder="Brief yaz — e.g. pricing page, 3 tiers, terracotta, Stripe polish..."
              className="mt-1 w-full rounded-md border border-line bg-white p-2.5 text-xs leading-5 focus:border-terracotta/30 focus:outline-none dark:bg-[#0F0F11]"
            />
            {s.formError && <p className="text-[11px] text-rose-600">{s.formError}</p>}
            <Button
              data-design-generate
              size="sm"
              className="mt-2 h-7 w-full gap-1 text-xs"
              onClick={() => void s.runGenerate()}
              disabled={s.generating}
            >
              <Sparkles className="h-3 w-3" /> {s.generating ? 'Generating…' : 'Generate'}
            </Button>
            <div className="mt-2 flex items-center gap-1 text-[11px] text-zinc-400">
              <Palette className="h-3 w-3" />
              <span className={guardBadge ? `rounded-full border px-1.5 py-0.5 ${guardBadge.cls}` : ''}>
                {guardBadge ? guardBadge.text : 'checking guard…'}
              </span>
              {s.systemMeta ? <span className="truncate">· {s.systemMeta.tokens}</span> : null}
            </div>
          </div>
          <div className="rounded-lg border border-line bg-white p-2.5 dark:bg-[#1E1E21]">
            <div className="flex items-center gap-1 text-xs font-medium">
              <LayoutTemplate className="h-3 w-3 text-terracotta" /> Artifacts
              <span className="ml-auto text-[10px] font-normal text-zinc-400">
                {s.filtered.length}/{s.items.length}
              </span>
            </div>
            <div className="mt-2 flex gap-1.5">
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
              <select
                aria-label="Filter by type"
                value={s.typeFilter}
                onChange={(e) => s.setTypeFilter(e.target.value)}
                className={inputClass}
              >
                <option value="all">all types</option>
                {DESIGN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            {s.loading ? (
              <p className="mt-2 text-[11px] text-zinc-400">Loading artifacts…</p>
            ) : s.error ? (
              <p className="mt-2 text-[11px] text-rose-600">
                {s.error}{' '}
                <button className="underline" onClick={s.reload}>
                  Retry
                </button>
              </p>
            ) : s.filtered.length === 0 ? (
              <p className="mt-2 text-[11px] text-zinc-400">
                {s.items.length === 0
                  ? 'No artifacts yet — write a brief and Generate your first one.'
                  : 'No artifacts match.'}
              </p>
            ) : (
              <div data-design-list className="mt-2 flex max-h-[40vh] flex-col gap-1 overflow-y-auto md:max-h-none">
                {s.filtered.map((d) => {
                  const Icon = TYPE_ICONS[d.type] ?? LayoutTemplate;
                  const active = d.id === s.selected;
                  return (
                    <button
                      key={d.id}
                      data-design-row={d.id}
                      onClick={() => s.setSelected(d.id)}
                      title={`${d.brief} · ${d.system} · ${overallLabel(d.overall)}`}
                      className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left ${
                        active
                          ? 'border-terracotta/50 bg-terracotta/10'
                          : 'border-line bg-white hover:bg-[#F7F5F1] dark:bg-[#1E1E21] dark:hover:bg-[#242427]'
                      }`}
                    >
                      <span className="font-mono text-[10px] text-zinc-400">{artifactBadge(d.type)}</span>
                      <Icon className="h-3 w-3 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-[11px]">{d.brief}</span>
                      <span className="shrink-0 text-[10px] text-zinc-400">{overallLabel(d.overall)}</span>
                      <span className="hidden shrink-0 text-[10px] text-zinc-400 sm:inline">
                        {formatUpdated(d.updatedAt)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
        <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
          <div
            data-design-canvas
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-[#FAF9F5] dark:bg-[#0F0F11]"
          >
            <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-line/50 bg-white/80 px-2 text-[11px] dark:bg-[#1E1E21]/80">
              <Code2 className="h-3 w-3" />
              {s.sel
                ? `${s.sel.type} · ${s.sel.system} · ${formatUpdated(s.sel.updatedAt)}`
                : 'No artifact selected'}
              <span className="ml-auto hidden items-center gap-1 text-zinc-400 lg:inline-flex">
                sandbox iframe — stored HTML → live preview
              </span>
            </div>
            <div data-design-viewer className="relative min-h-0 flex-1 overflow-hidden bg-white">
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
                <p className="p-4 text-[11px] text-zinc-400">
                  {s.detailLoading
                    ? 'Loading…'
                    : (s.detailError ?? 'Select an artifact on the left to preview it here.')}
                </p>
              )}
              <div className="absolute right-2 top-2 flex gap-1">
                <span className="rounded-full bg-[#262624] px-2 py-1 font-mono text-[10px] text-white">sandbox</span>
                {s.sel && (
                  <span className="hidden rounded-full border border-line bg-white px-2 py-1 text-[10px] sm:inline">
                    {s.sel.type}
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0 border-t border-line bg-muted/20">
              <div className="flex gap-1 px-2 pt-1">
                {(['code', 'critique', 'export'] as const).map((t) => (
                  <button
                    key={t}
                    data-design-tab={t}
                    onClick={() => s.setTab(t)}
                    className={`h-6 rounded-t-md px-2 text-[11px] capitalize ${
                      s.tab === t ? 'bg-white font-medium dark:bg-[#1E1E21]' : 'text-zinc-400'
                    }`}
                  >
                    {t}
                  </button>
                ))}
                {s.tab === 'critique' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 gap-1 text-[11px]"
                    onClick={() => void s.runCritique()}
                    disabled={!s.selected || s.critiquing}
                  >
                    <RefreshCw className="h-3 w-3" /> {s.critiquing ? 'Scoring…' : 'Re-run'}
                  </Button>
                )}
              </div>
              <div className="max-h-[30vh] overflow-y-auto bg-white px-2 pb-2 dark:bg-[#1E1E21]">
              {s.tab === 'code' && (
                <div className="space-y-1 pt-1">
                  <label htmlFor="design-html" className="block text-[11px] text-zinc-500">
                    artifact.html — edits rebuild the viewer above
                  </label>
                  <textarea
                    id="design-html"
                    data-design-code
                    value={s.htmlEdit}
                    onChange={(e) => s.setHtmlEdit(e.target.value)}
                    rows={6}
                    spellCheck={false}
                    placeholder="<html>…"
                    className="w-full rounded-md border border-line bg-white p-2 font-mono text-[11px] leading-4 focus:border-terracotta/30 focus:outline-none dark:bg-[#0F0F11]"
                  />
                  {s.htmlError && <p className="text-[11px] text-rose-600">{s.htmlError}</p>}
                  <Button
                    size="sm"
                    className="h-6 text-[11px]"
                    onClick={() => void s.runSave()}
                    disabled={!s.selected || s.saving}
                  >
                    {s.saving ? 'Saving…' : 'Save HTML'}
                  </Button>
                </div>
              )}
              {s.tab === 'critique' && (
                <div className="pt-1">
                  {!s.detail?.critique ? (
                    <p className="text-[11px] text-zinc-400">No critique yet — select an artifact to score it.</p>
                  ) : (
                    <div className="space-y-1">
                      {s.detail.critique.scores.map((score) => (
                        <div key={score.dim} className="flex items-start gap-2 text-[11px]">
                          <Gauge className="mt-0.5 h-3 w-3 text-zinc-400" />
                          <span className="w-20 shrink-0 capitalize">{score.dim}</span>
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${TONE_CLASS[scoreTone(score.score)]}`}>
                            {score.score}/10
                          </span>
                          <span className="text-zinc-500">
                            {score.fixes.length > 0 ? score.fixes.join(' ') : 'Holds the bar.'}
                          </span>
                        </div>
                      ))}
                      <p className="pt-1 text-[10px] text-zinc-400">
                        Heuristic structural signals over the stored HTML — never an LLM grade.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {s.tab === 'export' && (
                <div className="space-y-1 pt-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[11px] text-zinc-500">Export:</span>
                    {(['html', 'zip', 'json', 'png', 'webm'] as const).map((f) => (
                      <Button
                        key={f}
                        data-design-export={f}
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 px-2 text-[11px]"
                        onClick={() => void s.runExport(f)}
                        disabled={!s.selected || s.exporting !== null}
                      >
                        <Download className="h-3 w-3" /> {f.toUpperCase()}
                        {s.exporting === f ? '…' : ''}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                    <label htmlFor="design-png-scale" className="font-medium">
                      PNG scale
                    </label>
                    <select
                      id="design-png-scale"
                      value={s.pngScale}
                      onChange={(e) => s.setPngScale(e.target.value === '1' ? 1 : 2)}
                      disabled={s.exporting !== null}
                      className={inputClass}
                    >
                      <option value={1}>1x</option>
                      <option value={2}>2x</option>
                    </select>
                    <span>rasterizes the page with headless Chromium</span>
                  </div>
                  <p className="text-[10px] text-zinc-400">
                    WebM is a 2s slow-zoom clip (Chromium + ffmpeg). PDF/PPTX/MP4 need a binary toolchain
                    (PptxGenJS / print-to-PDF / ffmpeg) — follow-up.
                  </p>
                </div>
              )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <div className="min-w-[200px] flex-1 rounded-lg border border-line bg-white p-2 dark:bg-[#1E1E21]">
              <div className="flex items-center gap-1 text-xs font-medium">
                <Palette className="h-3 w-3 text-terracotta" /> DESIGN.md — guard
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                {s.guard
                  ? s.guard.present
                    ? `${s.guard.h2Count} H2 sections (${s.guard.ok ? 'contract holds' : 'needs 7+'})`
                    : 'no project file — bundled system tokens apply'
                  : 'checking guard…'}
              </div>
            </div>
            <div className="min-w-[200px] flex-1 rounded-lg border border-line bg-white p-2 dark:bg-[#1E1E21]">
              <div className="flex items-center gap-1 text-xs font-medium">
                <Sparkles className="h-3 w-3" /> 6 artifacts · {s.systems.length > 0 ? s.systems.length : 4} systems
              </div>
              <div className="mt-1 break-words text-[11px] text-zinc-500">
                Prototype/Deck/Mobile/Image/Document/HyperFrame
                {s.systemMeta ? ` — ${s.systemMeta.name} ${s.systemMeta.preset}` : ''}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
