import * as React from 'react';
import {
  Check,
  Code2,
  Download,
  Eye,
  GitCompare,
  Monitor,
  Search,
  Share2,
  Trash2,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, type ArchifyIR, type DiagramDiff } from '@/lib/api';
import {
  ARCHIFY_PRESETS,
  ARCHIFY_TYPES,
  emptyGenerateForm,
  filterDiagrams,
  focusHash,
  formatUpdated,
  lensHash,
  parseIrEdit,
  receiptCounts,
  routeHash,
  typeBadge,
  validateGenerateForm,
  type ArchifyExportFormat,
  type GenerateForm,
  type NormalizedDiagram,
} from './archify';

/**
 * ArchifyPane — typed JSON IR → validated HTML/SVG over the real store (W5-17).
 * Concept layout 1:1 (list + viewer + IR/receipt/export tabs), but every
 * pixel is live: rows come from `GET /api/archify/list`, generate posts a
 * prompt (`POST /api/archify/generate`), the viewer iframes the real
 * `GET /api/archify/:id/view` build, IR edits validate + save through the
 * server (which rebuilds every artifact under `~/.lokma/archify/<id>/`),
 * delta compares two real diagrams, exports download real files.
 * NOT ported: the concept's hardcoded ITEMS rows + mock IR preview, the
 * toast-only Validate/Build/Guide/Delta/Card/Export buttons, the mock
 * receipt table (the real 5-gate receipt renders instead); exports download
 * real files (SVG/HTML/IR/card/PNG/WebM — the pane only offers what the
 * server actually serves, so there are no dead buttons).
 * Delete removes the real dir (`DELETE /api/archify/:id`, two-click arm).
 */

const inputClass =
  'h-7 rounded-md border border-line bg-white px-2 text-xs focus:outline-none focus:border-terracotta/30 dark:bg-[#1E1E21]';

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

export function ArchifyPane() {
  const [items, setItems] = React.useState<NormalizedDiagram[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [q, setQ] = React.useState('');
  const [selected, setSelected] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<{ ir: ArchifyIR; receipt: { gate: string; status: 'pass' | 'fail'; msg: string }[] } | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<GenerateForm>(emptyGenerateForm);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [tab, setTab] = React.useState<'ir' | 'receipt' | 'export'>('ir');
  const [irEdit, setIrEdit] = React.useState('');
  const [irError, setIrError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [showDelta, setShowDelta] = React.useState(false);
  const [baseId, setBaseId] = React.useState('');
  const [diff, setDiff] = React.useState<DiagramDiff | null>(null);
  const [deltaHtml, setDeltaHtml] = React.useState<string | null>(null);
  const [comparing, setComparing] = React.useState(false);
  const [viewerHash, setViewerHash] = React.useState('');
  const [exporting, setExporting] = React.useState<string | null>(null);
  // PNG raster scale (1x/2x) — passed as `?scale=` to the export endpoint.
  const [pngScale, setPngScale] = React.useState<1 | 2>(2);
  // Two-click delete arm (bots-pane pattern) + in-flight flag.
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const runRef = React.useRef(0);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const loadList = React.useCallback(async (selectId?: string) => {
    const run = (runRef.current += 1);
    setLoading(true);
    try {
      const res = await api.listDiagrams();
      if (runRef.current !== run) return;
      setItems(res.items);
      setError(null);
      if (selectId && res.items.some((d) => d.id === selectId)) setSelected(selectId);
    } catch (e) {
      if (runRef.current !== run) return;
      setItems([]);
      setError(e instanceof Error ? e.message : 'diagram list failed');
    } finally {
      if (runRef.current === run) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = React.useCallback(async (id: string) => {
    const run = (runRef.current += 1);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setDiff(null);
    setDeltaHtml(null);
    setViewerHash('');
    try {
      const res = await api.getDiagram(id);
      if (runRef.current !== run) return;
      setDetail({ ir: res.ir, receipt: res.receipt });
      setIrEdit(JSON.stringify(res.ir, null, 2));
      setIrError(null);
    } catch (e) {
      if (runRef.current !== run) return;
      setDetailError(e instanceof Error ? e.message : 'diagram load failed');
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
      const res = await api.generateDiagram({
        type: form.type,
        prompt: form.prompt.trim(),
        preset: form.preset,
        theme: form.theme,
      });
      toast(`Generated ${res.id}`);
      setFormOpen(false);
      setForm((f) => ({ ...emptyGenerateForm, type: f.type, preset: f.preset, theme: f.theme }));
      await loadList(res.id);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'generate failed');
    } finally {
      setGenerating(false);
    }
  }, [form, loadList]);

  const runValidate = React.useCallback(async () => {
    if (!selected) return;
    const parsed = parseIrEdit(irEdit);
    if (!parsed.ir) {
      setIrError(parsed.error ?? 'Invalid JSON');
      return;
    }
    setSaving(true);
    setIrError(null);
    try {
      // Validate-only first so a broken edit never wipes the good build.
      const check = await api.validateDiagram(parsed.ir);
      setDetail((d) => (d ? { ...d, receipt: check.receipt } : d));
      if (!check.ok) {
        setIrError(check.errors[0]?.message ?? 'IR invalid');
        return;
      }
      const saved = await api.saveDiagram(selected, parsed.ir);
      setDetail((d) => (d ? { ...d, ir: parsed.ir as ArchifyIR, receipt: saved.receipt } : d));
      toast(`Saved ${selected} — viewer rebuilt`);
      void loadList(selected);
    } catch (e) {
      setIrError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }, [selected, irEdit, loadList]);

  const applyPresetTheme = React.useCallback(
    async (preset: string, theme: string) => {
      setForm((f) => ({ ...f, preset, theme }));
      // Live re-theme of the open diagram (PUT + rebuild), defaults otherwise.
      if (selected && detail && (preset !== detail.ir.preset || theme !== detail.ir.theme)) {
        const next = { ...detail.ir, preset, theme };
        try {
          const saved = await api.saveDiagram(selected, next);
          setDetail({ ir: next, receipt: saved.receipt });
          setIrEdit(JSON.stringify(next, null, 2));
          toast(`Applied ${preset} · ${theme}`);
        } catch (e) {
          toast(e instanceof Error ? e.message : 'apply failed');
        }
      }
    },
    [selected, detail],
  );

  const runGuide = React.useCallback(async () => {
    if (!selected) {
      setFormOpen(true);
      return;
    }
    try {
      const res = await api.getArchifyGuide(selected, q.trim() || undefined);
      setForm((f) => ({ ...f, prompt: res.starter }));
      setFormOpen(true);
      toast('Starter chain loaded — edit + Generate');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'guide failed');
    }
  }, [selected, q]);

  const runCompare = React.useCallback(async () => {
    if (!selected || !baseId) return;
    setComparing(true);
    try {
      const res = await api.compareDiagrams(selected, baseId);
      setDiff(res.diff);
      setDeltaHtml(res.deltaHtml);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'compare failed');
    } finally {
      setComparing(false);
    }
  }, [selected, baseId]);

  const runExport = React.useCallback(
    async (format: ArchifyExportFormat) => {
      if (!selected || exporting) return;
      setExporting(format);
      try {
        const { filename, blob } = await api.downloadArchifyExport(
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
      await api.deleteDiagram(selected);
      toast(`Deleted ${selected}`);
      setSelected(null);
      setDetail(null);
      setDetailError(null);
      setIrEdit('');
      await loadList();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setDeleting(false);
    }
  }, [selected, deleting, confirmDelete, loadList]);

  const filtered = React.useMemo(() => filterDiagrams(items, typeFilter as 'all' | (typeof ARCHIFY_TYPES)[number], q), [items, typeFilter, q]);
  const sel = selected ? (items.find((d) => d.id === selected) ?? null) : null;
  const counts = detail ? receiptCounts(detail.receipt) : null;
  const viewerSrc = selected ? `${api.archifyViewUrl(selected)}${viewerHash}` : null;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Workflow className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Archify</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">
          typed JSON IR → HTML/SVG · 5 types · 4 presets · viewer
        </span>
        {counts && counts.fail === 0 && (
          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
            5/5 gates
          </span>
        )}
        <span className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[11px] gap-1"
            onClick={() => setFormOpen((v) => !v)}
          >
            + New Diagram
          </Button>
          <Button
            variant={confirmDelete === selected ? 'destructive' : 'ghost'}
            size="sm"
            className="h-5 text-[11px] gap-1"
            aria-label={confirmDelete === selected ? 'Confirm diagram delete' : 'Delete diagram'}
            title={confirmDelete === selected ? 'Click again to confirm delete' : 'Delete this diagram'}
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
            <label htmlFor="archify-type" className="text-[11px] text-zinc-500">
              Type
            </label>
            <select
              id="archify-type"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className={`${inputClass} h-6`}
            >
              {ARCHIFY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <span className="ml-auto text-[11px] text-zinc-400">prompt → IR → validate → build</span>
          </div>
          <label htmlFor="archify-prompt" className="block text-[11px] text-zinc-500">
            Prompt — use <code className="px-1 rounded bg-white border border-line">a -&gt; b -&gt; c</code> chains for linked nodes
          </label>
          <textarea
            id="archify-prompt"
            value={form.prompt}
            onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
            rows={2}
            placeholder="web -> api -> db"
            className={`${inputClass} w-full h-auto py-1.5`}
          />
          {formError ? <div className="text-[11px] text-red-600 dark:text-red-400">{formError}</div> : null}
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-[11px]" disabled={generating} onClick={() => void runGenerate()}>
              {generating ? 'Generating…' : 'Generate'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px]"
              onClick={() => {
                setFormOpen(false);
                setFormError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Left: list */}
        <div className="w-[38%] min-w-[200px] border-r border-line flex flex-col overflow-hidden">
          <div className="p-2 border-b border-line/50 space-y-1.5 shrink-0">
            <div className="flex gap-1 flex-wrap">
              <Button
                variant={typeFilter === 'all' ? 'default' : 'ghost'}
                size="sm"
                className="h-5 text-[11px]"
                onClick={() => setTypeFilter('all')}
              >
                All
              </Button>
              {ARCHIFY_TYPES.map((t) => (
                <Button
                  key={t}
                  variant={typeFilter === t ? 'default' : 'ghost'}
                  size="sm"
                  className="h-5 text-[11px] capitalize"
                  onClick={() => setTypeFilter(t)}
                >
                  {t.slice(0, 4)}
                </Button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
              <label htmlFor="archify-search" className="sr-only">
                Search diagrams
              </label>
              <Input
                id="archify-search"
                ref={searchRef as React.Ref<HTMLInputElement>}
                placeholder="Search diagrams..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-7 h-7 text-xs"
              />
            </div>
            <div className="flex gap-1 flex-wrap items-center" title="Applies to the open diagram live, or the next one">
              {ARCHIFY_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => void applyPresetTheme(p, form.theme)}
                  className={`px-1.5 py-0.5 rounded-full border text-[10px] ${form.preset === p ? 'bg-terracotta text-white border-terracotta' : 'bg-white dark:bg-[#1E1E21] border-line text-zinc-500'}`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => void applyPresetTheme(form.preset, form.theme === 'dark' ? 'light' : 'dark')}
                className="ml-auto px-1.5 py-0.5 rounded-full bg-[#262624] text-white text-[10px]"
              >
                {form.theme}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-1.5 space-y-1">
            {loading ? (
              <div className="p-4 text-center text-xs text-zinc-400">Loading diagrams…</div>
            ) : error ? (
              <div className="p-3 text-xs text-red-600 dark:text-red-400">
                {error}{' '}
                <button className="underline" onClick={() => void loadList()}>
                  Retry
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-400">
                {items.length === 0 ? 'No diagrams — generate one' : 'No match'}
              </div>
            ) : (
              filtered.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    setConfirmDelete(null);
                    setSelected(d.id);
                  }}
                  className={`w-full text-left p-2 rounded-lg border flex gap-2 transition ${selected === d.id ? 'bg-[#FDF0E6] border-[#F2D5C2] dark:bg-[#2A1E15]' : 'bg-white dark:bg-[#1E1E21] border-line hover:border-terracotta/20'}`}
                >
                  <span
                    className={`w-7 h-7 rounded-md grid place-items-center text-[10px] font-bold shrink-0 ${d.theme === 'dark' ? 'bg-[#0F0F11] text-white border border-white/10' : 'bg-[#FAF9F5] text-[#262624] border border-line'}`}
                  >
                    {typeBadge(d.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{d.title}</div>
                    <div className="text-[11px] text-zinc-400 flex items-center gap-1">
                      <span className="px-1 py-0 rounded bg-muted border border-line text-[10px]">{d.type}</span>{' '}
                      {d.preset} · {d.theme} · {formatUpdated(d.updatedAt)}
                    </div>
                  </div>
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${selected === d.id ? 'bg-terracotta' : 'bg-zinc-300'}`} />
                </button>
              ))
            )}
          </div>
          <div className="p-1.5 border-t border-line/50 flex gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-6 text-[11px] gap-1"
              disabled={!selected}
              onClick={() => void runGuide()}
            >
              <Code2 className="w-3 h-3" /> Guide
            </Button>
            <Button
              variant={showDelta ? 'default' : 'ghost'}
              size="sm"
              className="flex-1 h-6 text-[11px] gap-1"
              disabled={!selected}
              onClick={() => setShowDelta((v) => !v)}
            >
              <GitCompare className="w-3 h-3" /> Delta
            </Button>
          </div>
        </div>

        {/* Center: viewer */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#FAF9F5] dark:bg-[#0F0F11]">
          <div className="h-7 flex items-center gap-1 px-2 border-b border-line/50 bg-white/80 dark:bg-[#1E1E21]/80 backdrop-blur text-[11px] shrink-0">
            <Eye className="w-3 h-3" /> Viewer — self-contained HTML
            {sel && (
              <span className="hidden sm:inline text-zinc-400">
                · {sel.id} · ? M F / R L + - 0
              </span>
            )}
            <span className="ml-auto flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px]"
                disabled={!detail}
                onClick={() => detail?.ir.nodes[0] && setViewerHash(focusHash(detail.ir.nodes[0].id))}
              >
                #focus
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px]"
                disabled={!detail || detail.ir.edges.length === 0}
                onClick={() => {
                  const e = detail?.ir.edges[0];
                  if (e) setViewerHash(routeHash(e.from, e.to));
                }}
              >
                #route
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px]"
                disabled={!detail}
                onClick={() => detail?.ir.nodes[0]?.kind && setViewerHash(lensHash(detail.ir.nodes[0].kind as string))}
              >
                #lens
              </Button>
            </span>
          </div>
          <div className="flex-1 relative p-2 overflow-hidden">
            {!selected ? (
              <div className="w-full h-full rounded-lg bg-white dark:bg-[#1E1E21] border border-dashed border-line grid place-items-center text-xs text-zinc-400 p-6 text-center">
                Select a diagram → live viewer
                <br />
                <span className="text-[11px]">IR → validate → build · ~/.lokma/archify/</span>
              </div>
            ) : detailLoading ? (
              <div className="w-full h-full grid place-items-center text-xs text-zinc-400">Building viewer…</div>
            ) : detailError ? (
              <div className="p-3 text-xs text-red-600 dark:text-red-400">
                {detailError}{' '}
                <button className="underline" onClick={() => selected && void loadDetail(selected)}>
                  Retry
                </button>
              </div>
            ) : showDelta ? (
              <div className="w-full h-full flex flex-col gap-1 overflow-hidden">
                <div className="flex gap-1 items-center shrink-0">
                  <label htmlFor="archify-base" className="text-[11px] text-zinc-500">
                    Base
                  </label>
                  <select
                    id="archify-base"
                    value={baseId}
                    onChange={(e) => setBaseId(e.target.value)}
                    className={`${inputClass} h-6 flex-1`}
                  >
                    <option value="">Pick a base diagram…</option>
                    {items
                      .filter((d) => d.id !== selected)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title} ({d.id})
                        </option>
                      ))}
                  </select>
                  <Button size="sm" className="h-6 text-[11px]" disabled={!baseId || comparing} onClick={() => void runCompare()}>
                    {comparing ? 'Comparing…' : 'Compare'}
                  </Button>
                </div>
                {diff && (
                  <div className="flex gap-1 flex-wrap text-[11px] shrink-0">
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">+{diff.added.length} added</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">−{diff.removed.length} removed</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">~{diff.changed.length} changed</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">⇄{diff.rerouted.length} rerouted</span>
                  </div>
                )}
                <div className="flex-1 min-h-0 rounded-lg bg-white dark:bg-[#1E1E21] border border-line overflow-hidden">
                  {deltaHtml ? (
                    <iframe title="delta" className="w-full h-full" sandbox="allow-scripts" srcDoc={deltaHtml} />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-[11px] text-zinc-400">
                      Pick a base → Compare for Before/Delta/After
                    </div>
                  )}
                </div>
              </div>
            ) : viewerSrc ? (
              <div className="w-full h-full rounded-lg bg-white dark:bg-[#1E1E21] border border-line overflow-hidden relative">
                <iframe
                  key={viewerSrc}
                  title="diagram viewer"
                  className="w-full h-full"
                  sandbox="allow-scripts"
                  src={viewerSrc}
                />
                <div className="absolute bottom-2 left-2 flex gap-1 text-[10px]">
                  <span className="px-1.5 py-0.5 rounded-full bg-[#262624] text-white">{form.preset}</span>
                  {sel && (
                    <span className="px-1.5 py-0.5 rounded-full bg-white border border-line hidden sm:inline">
                      {sel.type} · {sel.theme}
                    </span>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <div className="p-1.5 border-t border-line/50 bg-white/60 dark:bg-[#1E1E21]/60 flex gap-1 flex-wrap text-[11px] shrink-0">
            <Button
              variant={showDelta ? 'default' : 'outline'}
              size="sm"
              className="h-6 text-[11px] gap-1"
              disabled={!selected}
              onClick={() => setShowDelta((v) => !v)}
            >
              <GitCompare className="w-3 h-3" /> {showDelta ? 'Hide delta' : 'Compare'}
            </Button>
            <span className="hidden sm:inline-flex items-center gap-1 text-zinc-500">
              <Share2 className="w-3 h-3" /> 1200×630 share card — #route / #reach
            </span>
            {sel && <span className="ml-auto hidden lg:inline text-zinc-400">~/.lokma/archify/{sel.id}/ir.json → index.html</span>}
          </div>
        </div>

        {/* Right: IR / receipt / export */}
        <div className="w-[36%] min-w-[200px] border-l border-line flex flex-col overflow-hidden hidden lg:flex">
          <div className="flex gap-1 p-1.5 border-b border-line/50 bg-muted/20 shrink-0">
            {(['ir', 'receipt', 'export'] as const).map((t) => (
              <Button
                key={t}
                variant={tab === t ? 'default' : 'ghost'}
                size="sm"
                className="h-6 text-[11px] capitalize flex-1"
                onClick={() => setTab(t)}
              >
                {t}
              </Button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-2">
            {!selected || !detail ? (
              <div className="p-4 text-center text-xs text-zinc-400">
                {selected ? 'Loading…' : 'Select a diagram first'}
              </div>
            ) : (
              <>
                {tab === 'ir' && (
                  <>
                    <div className="rounded-lg border border-line bg-[#0F0F11] p-2">
                      <div className="flex items-center gap-1.5 text-xs text-white font-medium">
                        <Code2 className="w-3 h-3 text-emerald-400" /> JSON IR · validate before deliver
                      </div>
                      <label htmlFor="archify-ir-edit" className="sr-only">
                        Edit diagram IR
                      </label>
                      <textarea
                        id="archify-ir-edit"
                        value={irEdit}
                        onChange={(e) => setIrEdit(e.target.value)}
                        rows={14}
                        spellCheck={false}
                        className="mt-2 p-2 w-full rounded bg-white/5 border border-white/10 text-[11px] leading-5 font-mono text-white/90 overflow-auto"
                      />
                      {irError ? <div className="mt-1.5 text-[11px] text-red-400">{irError}</div> : null}
                      <div className="mt-2 flex gap-1">
                        <Button size="sm" className="flex-1 h-6 text-[11px] gap-1" disabled={saving} onClick={() => void runValidate()}>
                          <Check className="w-3 h-3" /> {saving ? 'Saving…' : 'Validate + Save'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-6 text-[11px] bg-white/5 border-white/10 text-white hover:bg-white/10"
                          onClick={() => setIrEdit(JSON.stringify(detail.ir, null, 2))}
                        >
                          Reset
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-md bg-muted/50 border border-dashed border-line p-2 text-[11px] text-zinc-500">
                      Validate runs the 5 gates — a failing edit never wipes the last-good build.
                    </div>
                  </>
                )}
                {tab === 'receipt' && (
                  <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                    <div className="text-xs font-medium flex items-center gap-1">
                      <Monitor className="w-3 h-3 text-terracotta" /> Validation receipt
                    </div>
                    <table className="mt-2 w-full text-[11px]">
                      <tbody className="divide-y divide-line/50">
                        {detail.receipt.map((r) => (
                          <tr key={r.gate}>
                            <td className="py-1 font-mono">{r.gate}</td>
                            <td className={`py-1 ${r.status === 'pass' ? 'text-emerald-600' : 'text-red-600'}`}>
                              {r.status}
                            </td>
                            <td className="py-1 text-zinc-500">{r.msg}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-2 text-[11px] text-zinc-500">
                      receipt.json · fails closed (no deliver if invalid)
                    </div>
                  </div>
                )}
                {tab === 'export' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { fmt: 'svg' as const, desc: 'deterministic' },
                        { fmt: 'html' as const, desc: 'self-contained' },
                        { fmt: 'json' as const, desc: 'typed IR' },
                        { fmt: 'card' as const, desc: '1200×630 OG' },
                        { fmt: 'png' as const, desc: 'raster via Chromium' },
                        { fmt: 'webm' as const, desc: '2s zoom via ffmpeg' },
                      ].map((x) => (
                        <Button
                          key={x.fmt}
                          variant="outline"
                          size="sm"
                          className="h-auto py-2 flex flex-col gap-0.5"
                          disabled={exporting !== null}
                          onClick={() => void runExport(x.fmt)}
                        >
                          <span className="text-xs font-semibold flex items-center gap-1">
                            <Download className="w-3 h-3" /> {x.fmt.toUpperCase()}
                          </span>
                          <span className="text-[11px] text-zinc-400">
                            {exporting === x.fmt ? 'Exporting…' : x.desc}
                          </span>
                        </Button>
                      ))}
                    </div>
                    <div className="rounded-md bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] p-2 text-[11px]">
                      Share card:{' '}
                      <code className="px-1 py-0 rounded bg-white border border-line">
                        GET /api/archify/{selected}/card?route=web~api
                      </code>{' '}
                      · reach &amp; route deep links
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                      <label htmlFor="archify-png-scale" className="font-medium">
                        PNG scale
                      </label>
                      <select
                        id="archify-png-scale"
                        value={pngScale}
                        onChange={(e) => setPngScale(e.target.value === '1' ? 1 : 2)}
                        disabled={exporting !== null}
                        className={inputClass}
                      >
                        <option value={1}>1x</option>
                        <option value={2}>2x</option>
                      </select>
                      <span>rasterizes the SVG with headless Chromium</span>
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      WebM is a 2s slow-zoom (12 frames at 6fps) — needs Chromium + ffmpeg on the server.
                    </div>
                  </div>
                )}
                <div className="rounded-md bg-muted/30 border border-dashed border-line p-2 text-[11px] text-zinc-500">
                  <span className="font-medium">Storage:</span>{' '}
                  <code className="px-1 py-0 rounded bg-white border border-line">~/.lokma/archify/{selected}/ir.json</code>{' '}
                  → <code className="px-1 py-0 rounded bg-white border border-line">index.html</code> · share.svg ·
                  receipt.json · delta.html
                </div>
              </>
            )}
          </div>
          <div className="p-1.5 border-t border-line flex gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-6 text-[11px] gap-1"
              disabled={!selected || exporting !== null}
              onClick={() => void runExport('card')}
            >
              <Share2 className="w-3 h-3" /> Card
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-6 text-[11px] gap-1"
              disabled={!selected || exporting !== null}
              onClick={() => void runExport('html')}
            >
              <Download className="w-3 h-3" /> Export
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
