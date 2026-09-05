import * as React from 'react';
import {
  Code2,
  Download,
  FileText,
  Film,
  Gauge,
  Image as ImageIcon,
  LayoutTemplate,
  Paintbrush,
  Palette,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, type CritiqueResult, type DesignGuard, type DesignManifest, type DesignSystemMeta } from '@/lib/api';
import {
  DESIGN_SYSTEMS,
  DESIGN_TYPES,
  artifactBadge,
  emptyGenerateForm,
  filterArtifacts,
  formatUpdated,
  overallLabel,
  parseHtmlEdit,
  scoreTone,
  toRow,
  validateGenerateForm,
  type DesignExportFormat,
  type GenerateForm,
  type NormalizedArtifact,
} from './design';

/**
 * DesignPane — 6 artifact types over bundled systems + a real DESIGN.md
 * guard (W5-18, Docs/34). Concept layout 1:1 (type picker + brief +
 * system row + sandboxed viewer + export strip + footer cards), but every
 * pixel is live: rows come from `GET /api/design/list`, Generate posts a
 * brief (`POST /api/design/generate`), the viewer iframes the real
 * `GET /api/design/:id/view` build, the Code tab edits the stored
 * `artifact.html` (`PUT /api/design/:id`, validated + re-critiqued), the
 * Critique tab shows the real 5-dimension heuristic
 * (`POST /api/design/:id/critique`), exports download real files, and the
 * DESIGN.md strip parses the real `.lokma/DESIGN.md` (`GET /api/design/guard`).
 * Delete removes the real dir (`DELETE /api/design/:id`, two-click arm).
 * NOT ported: the concept's toast-only Generate/Preview/Export buttons and
 * its static preview copy — the viewer is always the live build, and the
 * pane only offers the export formats the server actually serves
 * (PDF/PPTX/MP4 need a binary toolchain — a follow-up, the footer says so).
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

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('lokma-toast', { detail: message }));
}

function saveBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function DesignPane() {
  const [items, setItems] = React.useState<NormalizedArtifact[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [q, setQ] = React.useState('');
  const [selected, setSelected] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<{ manifest: DesignManifest; critique: CritiqueResult | null } | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<GenerateForm>(emptyGenerateForm);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [systems, setSystems] = React.useState<DesignSystemMeta[]>([]);
  const [guard, setGuard] = React.useState<DesignGuard | null>(null);
  const [tab, setTab] = React.useState<'code' | 'critique' | 'export'>('code');
  const [htmlEdit, setHtmlEdit] = React.useState('');
  const [htmlError, setHtmlError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [critiquing, setCritiquing] = React.useState(false);
  const [exporting, setExporting] = React.useState<string | null>(null);
  // PNG raster scale (1x/2x) — passed as `?scale=` to the export endpoint.
  const [pngScale, setPngScale] = React.useState<1 | 2>(2);
  // Two-click delete arm (archify-pane pattern) + in-flight flag.
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const runRef = React.useRef(0);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const loadList = React.useCallback(async (selectId?: string) => {
    const run = (runRef.current += 1);
    setLoading(true);
    try {
      const res = await api.listDesigns();
      if (runRef.current !== run) return;
      setItems(res.items.map((m) => toRow(m, m.bytes, m.overall)));
      setError(null);
      if (selectId && res.items.some((d) => d.id === selectId)) setSelected(selectId);
    } catch (e) {
      if (runRef.current !== run) return;
      setItems([]);
      setError(e instanceof Error ? e.message : 'design list failed');
    } finally {
      if (runRef.current === run) setLoading(false);
    }
  }, []);

  const loadMeta = React.useCallback(async () => {
    try {
      const res = await api.getDesignSystems();
      setSystems(res.systems);
    } catch {
      setSystems([]);
    }
    try {
      const res = await api.getDesignGuard();
      setGuard(res.guard);
    } catch {
      setGuard(null);
    }
  }, []);

  React.useEffect(() => {
    void loadList();
    void loadMeta();
  }, [loadList, loadMeta]);

  const loadDetail = React.useCallback(async (id: string) => {
    const run = (runRef.current += 1);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const res = await api.getDesign(id);
      if (runRef.current !== run) return;
      setDetail({ manifest: res.manifest, critique: res.critique });
      setHtmlEdit(res.html);
      setHtmlError(null);
    } catch (e) {
      if (runRef.current !== run) return;
      setDetailError(e instanceof Error ? e.message : 'design load failed');
    } finally {
      if (runRef.current === run) setDetailLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (selected) void loadDetail(selected);
  }, [selected, loadDetail]);

  const runGenerate = React.useCallback(async () => {
    const local = validateGenerateForm(form);
    if (local) {
      setFormError(local);
      return;
    }
    setGenerating(true);
    setFormError(null);
    try {
      const res = await api.generateDesign({
        type: form.type,
        brief: form.brief.trim(),
        system: form.system,
      });
      toast(`Generated ${res.id} — overall ${res.critique.overall}/10`);
      setFormOpen(false);
      setForm((f) => ({ ...emptyGenerateForm, type: f.type, system: f.system }));
      await loadList(res.id);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'generate failed');
    } finally {
      setGenerating(false);
    }
  }, [form, loadList]);

  const runSave = React.useCallback(async () => {
    if (!selected) return;
    const parsed = parseHtmlEdit(htmlEdit);
    if (!parsed.html) {
      setHtmlError(parsed.error ?? 'Invalid HTML');
      return;
    }
    setSaving(true);
    setHtmlError(null);
    try {
      const saved = await api.saveDesignHtml(selected, parsed.html);
      setDetail({ manifest: saved.manifest, critique: saved.critique });
      toast(`Saved ${selected} — viewer rebuilt, overall ${saved.critique.overall}/10`);
      void loadList(selected);
    } catch (e) {
      setHtmlError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }, [selected, htmlEdit, loadList]);

  const runCritique = React.useCallback(async () => {
    if (!selected || critiquing) return;
    setCritiquing(true);
    try {
      const res = await api.critiqueDesign(selected);
      setDetail((d) => (d ? { ...d, critique: res.critique } : d));
      toast(`Critique ${res.critique.overall}/10`);
      void loadList(selected);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'critique failed');
    } finally {
      setCritiquing(false);
    }
  }, [selected, critiquing, loadList]);

  const runExport = React.useCallback(
    async (format: DesignExportFormat) => {
      if (!selected || exporting) return;
      setExporting(format);
      try {
        const { filename, blob } = await api.downloadDesignExport(
          selected,
          format,
          format === 'png' ? pngScale : undefined,
        );
        saveBlob(filename, blob);
        toast(`Exported ${filename}`);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'export failed');
      } finally {
        setExporting(null);
      }
    },
    [selected, exporting, pngScale],
  );

  const runDelete = React.useCallback(async () => {
    if (!selected || deleting) return;
    if (confirmDelete !== selected) {
      setConfirmDelete(selected);
      return;
    }
    setConfirmDelete(null);
    setDeleting(true);
    try {
      await api.deleteDesign(selected);
      toast(`Deleted ${selected}`);
      setSelected(null);
      setDetail(null);
      setDetailError(null);
      setHtmlEdit('');
      await loadList();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setDeleting(false);
    }
  }, [selected, deleting, confirmDelete, loadList]);

  const filtered = React.useMemo(
    () => filterArtifacts(items, typeFilter as 'all' | (typeof DESIGN_TYPES)[number], q),
    [items, typeFilter, q],
  );
  const sel = selected ? (items.find((d) => d.id === selected) ?? null) : null;
  const viewerSrc = selected ? api.designViewUrl(selected) : null;
  const systemMeta = systems.find((s) => s.id === (detail?.manifest.system ?? form.system));
  const guardBadge = guard
    ? guard.present
      ? guard.ok
        ? { text: `DESIGN.md · ${guard.h2Count} sections`, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
        : { text: `DESIGN.md · ${guard.h2Count}/7 H2`, cls: 'bg-amber-100 text-amber-700 border-amber-200' }
      : { text: 'No .lokma/DESIGN.md — bundled tokens', cls: 'bg-muted text-muted-foreground border-line' }
    : null;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Paintbrush className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Design Studio</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">
          .lokma/DESIGN.md · 6 types · design-systems/
        </span>
        <span className="ml-auto flex gap-1 items-center">
          {detail?.critique && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full border ${TONE_CLASS[scoreTone(detail.critique.overall)]}`}
            >
              {detail.critique.overall}/10
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded-full bg-terracotta text-white text-[10px]">BYOK</span>
          <Button variant="ghost" size="sm" className="h-5 text-[11px] gap-1" onClick={() => setFormOpen((v) => !v)}>
            + New
          </Button>
          <Button
            variant={confirmDelete === selected ? 'destructive' : 'ghost'}
            size="sm"
            className="h-5 text-[11px] gap-1"
            aria-label={confirmDelete === selected ? 'Confirm artifact delete' : 'Delete artifact'}
            title={confirmDelete === selected ? 'Click again to confirm delete' : 'Delete this artifact'}
            disabled={!selected || deleting}
            onClick={() => void runDelete()}
          >
            <Trash2 className="w-3 h-3" />
            {confirmDelete === selected ? 'Confirm?' : deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </span>
      </div>

      {formOpen && (
        <div className="p-2 border-b border-line bg-[#FAF9F5] dark:bg-[#0F0F11] space-y-1.5 shrink-0">
          <div className="flex gap-1 flex-wrap items-center">
            <label htmlFor="design-type" className="text-[11px] text-zinc-500">
              Type
            </label>
            <select
              id="design-type"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className={inputClass}
            >
              {DESIGN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <label htmlFor="design-system" className="text-[11px] text-zinc-500 ml-2">
              System
            </label>
            <select
              id="design-system"
              value={form.system}
              onChange={(e) => setForm((f) => ({ ...f, system: e.target.value }))}
              className={inputClass}
            >
              {DESIGN_SYSTEMS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Button size="sm" className="ml-auto h-6 text-xs gap-1" onClick={() => void runGenerate()} disabled={generating}>
              <Sparkles className="w-3 h-3" /> {generating ? 'Generating…' : 'Generate'}
            </Button>
          </div>
          <label htmlFor="design-brief" className="text-[11px] text-zinc-500 block">
            Brief
          </label>
          <textarea
            id="design-brief"
            value={form.brief}
            onChange={(e) => setForm((f) => ({ ...f, brief: e.target.value }))}
            rows={2}
            placeholder="Brief yaz — e.g. pricing page, 3 tiers, terracotta, Stripe polish..."
            className="w-full rounded-md border border-line bg-white dark:bg-[#1E1E21] p-2.5 text-xs leading-5 focus:outline-none focus:border-terracotta/30"
          />
          {formError && <p className="text-[11px] text-rose-600">{formError}</p>}
        </div>
      )}

      <div className="px-2 pt-2 shrink-0 space-y-1.5">
        <div className="flex gap-1 flex-wrap items-center">
          <span className="text-[11px] text-zinc-500 hidden sm:inline-flex items-center gap-1">
            <Palette className="w-3 h-3" /> DESIGN.md →
          </span>
          {guardBadge && (
            <span title={guard?.message ?? ''} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${guardBadge.cls}`}>
              {guardBadge.text}
            </span>
          )}
          <span className="text-[11px] text-zinc-400 hidden md:inline">
            · {(systems.find((s) => s.id === form.system)?.tokens ?? 'bundled tokens')}
          </span>
        </div>
        <div className="flex gap-1 items-center">
          <div className="relative flex-1 min-w-[120px]">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search artifacts..."
              aria-label="Search artifacts"
              className="h-6 pl-7 text-[11px]"
            />
          </div>
          <select
            aria-label="Filter by type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
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
        {loading ? (
          <p className="text-[11px] text-zinc-400">Loading artifacts…</p>
        ) : error ? (
          <p className="text-[11px] text-rose-600">
            {error} <button className="underline" onClick={() => void loadList()}>Retry</button>
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-[11px] text-zinc-400">
            {items.length === 0 ? 'No artifacts yet — press + New and Generate your first one.' : 'No artifacts match.'}
          </p>
        ) : (
          <div className="flex gap-1 flex-wrap max-h-20 overflow-y-auto">
            {filtered.map((d) => {
              const Icon = TYPE_ICONS[d.type] ?? LayoutTemplate;
              const active = d.id === selected;
              return (
                <button
                  key={d.id}
                  onClick={() => {
                    setConfirmDelete(null);
                    setSelected(d.id);
                  }}
                  title={`${d.brief} · ${d.system} · ${overallLabel(d.overall)}`}
                  className={`inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[11px] ${
                    active ? 'border-terracotta/50 bg-terracotta/10' : 'border-line bg-white dark:bg-[#1E1E21]'
                  }`}
                >
                  <span className="font-mono text-[10px] text-zinc-400">{artifactBadge(d.type)}</span>
                  <Icon className="w-3 h-3" />
                  <span className="max-w-[140px] truncate">{d.brief.slice(0, 32)}</span>
                  <span className="text-[10px] text-zinc-400">{overallLabel(d.overall)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 m-2 rounded-lg border border-line bg-[#FAF9F5] dark:bg-[#0F0F11] overflow-hidden relative flex flex-col min-h-[180px]">
          <div className="h-6 flex items-center gap-1 px-2 border-b border-line/50 bg-white/80 dark:bg-[#1E1E21]/80 text-[11px] shrink-0">
            <Code2 className="w-3 h-3" />{' '}
            {sel ? `${sel.type} · ${sel.system} · ${formatUpdated(sel.updatedAt)}` : 'No artifact selected'}
            <span className="ml-auto hidden sm:inline-flex items-center gap-1 text-zinc-400">
              sandbox iframe — stored HTML → live preview
            </span>
          </div>
          <div className="flex-1 relative overflow-hidden bg-white min-h-0">
            {viewerSrc ? (
              <iframe
                key={viewerSrc + (detail?.manifest.updatedAt ?? '')}
                src={viewerSrc}
                sandbox="allow-scripts allow-same-origin"
                className="w-full h-full border-0 bg-white"
                title="Design preview"
              />
            ) : (
              <p className="p-4 text-[11px] text-zinc-400">
                {detailLoading ? 'Loading…' : (detailError ?? 'Select an artifact above to preview it here.')}
              </p>
            )}
            <div className="absolute top-2 right-2 flex gap-1">
              <span className="px-2 py-1 rounded-full bg-[#262624] text-white text-[10px] font-mono">sandbox</span>
              {sel && <span className="hidden sm:inline px-2 py-1 rounded-full bg-white border border-line text-[10px]">{sel.type}</span>}
            </div>
          </div>
          <div className="shrink-0 border-t border-line bg-muted/20">
            <div className="flex gap-1 px-2 pt-1">
              {(['code', 'critique', 'export'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`h-6 px-2 text-[11px] rounded-t-md capitalize ${
                    tab === t ? 'bg-white dark:bg-[#1E1E21] font-medium' : 'text-zinc-400'
                  }`}
                >
                  {t}
                </button>
              ))}
              {tab === 'critique' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 text-[11px] gap-1"
                  onClick={() => void runCritique()}
                  disabled={!selected || critiquing}
                >
                  <RefreshCw className="w-3 h-3" /> {critiquing ? 'Scoring…' : 'Re-run'}
                </Button>
              )}
            </div>
            <div className="px-2 pb-2 bg-white dark:bg-[#1E1E21]">
              {tab === 'code' && (
                <div className="space-y-1 pt-1">
                  <label htmlFor="design-html" className="text-[11px] text-zinc-500 block">
                    artifact.html — edits rebuild the viewer above
                  </label>
                  <textarea
                    id="design-html"
                    value={htmlEdit}
                    onChange={(e) => setHtmlEdit(e.target.value)}
                    rows={5}
                    spellCheck={false}
                    placeholder="<html>…"
                    className="w-full rounded-md border border-line bg-white dark:bg-[#0F0F11] p-2 text-[11px] font-mono leading-4 focus:outline-none focus:border-terracotta/30"
                  />
                  {htmlError && <p className="text-[11px] text-rose-600">{htmlError}</p>}
                  <Button size="sm" className="h-6 text-[11px]" onClick={() => void runSave()} disabled={!selected || saving}>
                    {saving ? 'Saving…' : 'Save HTML'}
                  </Button>
                </div>
              )}
              {tab === 'critique' && (
                <div className="pt-1">
                  {!detail?.critique ? (
                    <p className="text-[11px] text-zinc-400">No critique yet — select an artifact to score it.</p>
                  ) : (
                    <div className="space-y-1">
                      {detail.critique.scores.map((s) => (
                        <div key={s.dim} className="flex items-start gap-2 text-[11px]">
                          <Gauge className="w-3 h-3 mt-0.5 text-zinc-400" />
                          <span className="w-20 capitalize shrink-0">{s.dim}</span>
                          <span className={`px-1.5 py-0.5 rounded-full border text-[10px] ${TONE_CLASS[scoreTone(s.score)]}`}>
                            {s.score}/10
                          </span>
                          <span className="text-zinc-500">
                            {s.fixes.length > 0 ? s.fixes.join(' ') : 'Holds the bar.'}
                          </span>
                        </div>
                      ))}
                      <p className="text-[10px] text-zinc-400 pt-1">
                        Heuristic structural signals over the stored HTML — never an LLM grade.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {tab === 'export' && (
                <div className="pt-1 space-y-1">
                  <div className="flex gap-1 flex-wrap items-center">
                    <span className="text-[11px] text-zinc-500">Export:</span>
                    {(['html', 'zip', 'json', 'png', 'webm'] as DesignExportFormat[]).map((f) => (
                      <Button
                        key={f}
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] px-2 gap-1"
                        onClick={() => void runExport(f)}
                        disabled={!selected || exporting !== null}
                      >
                        <Download className="w-3 h-3" /> {f.toUpperCase()}
                        {exporting === f ? '…' : ''}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                    <label htmlFor="design-png-scale" className="font-medium">
                      PNG scale
                    </label>
                    <select
                      id="design-png-scale"
                      value={pngScale}
                      onChange={(e) => setPngScale(e.target.value === '1' ? 1 : 2)}
                      disabled={exporting !== null}
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

        <div className="px-2 pb-2 flex gap-1.5 flex-wrap">
          <div className="flex-1 min-w-[160px] rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2">
            <div className="text-xs font-medium flex items-center gap-1">
              <Palette className="w-3 h-3 text-terracotta" /> DESIGN.md — guard
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">
              {guard
                ? guard.present
                  ? `${guard.h2Count} H2 sections (${guard.ok ? 'contract holds' : 'needs 7+'})`
                  : 'no project file — bundled system tokens apply'
                : 'checking guard…'}
            </div>
          </div>
          <div className="flex-1 min-w-[160px] rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2">
            <div className="text-xs font-medium flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> 6 artifacts · {systems.length > 0 ? systems.length : 4} systems
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">
              Prototype/Deck/Mobile/Image/Document/HyperFrame{systemMeta ? ` — ${systemMeta.name} ${systemMeta.preset}` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
