import * as React from 'react';
import { api, type CritiqueResult, type DesignGuard, type DesignManifest, type DesignSystemMeta } from '@/lib/api';
import {
  DESIGN_TYPES,
  emptyGenerateForm,
  filterArtifacts,
  parseHtmlEdit,
  toRow,
  validateGenerateForm,
  type DesignExportFormat,
  type GenerateForm,
  type NormalizedArtifact,
} from './design';
import { readDesignPageSnapshot, writeDesignPageSnapshot, type DesignPageSnapshot } from './design-page-state';

/**
 * REQ-168 — the Design Studio logic (ported 1:1 from the retired DesignPane)
 * behind a hook, so the standalone page stays presentation-only. Every action
 * still talks to the real endpoints — list (`GET /api/design/list`), generate
 * (`POST /api/design/generate`), detail (`GET /api/design/:id`), save
 * (`PUT /api/design/:id`), critique (`POST /api/design/:id/critique`),
 * exports (`/api/design/:id/export/:format`) and delete
 * (`DELETE /api/design/:id`). Nothing is faked here.
 *
 * The page's own state (selected artifact + brief form) is snapshotted to
 * `localStorage` on every change, so leaving the Design page and coming back
 * (or a reload) restores exactly where the user left off.
 */

/** Toast channel shared with the shell (`ToastHost` listens for the event). */
function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('lokma-toast', { detail: message }));
}

/** Trigger a browser download for a fetched blob (real export files). */
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

export type DesignStudioTab = 'code' | 'critique' | 'export';

export type DesignStudio = {
  items: NormalizedArtifact[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  typeFilter: string;
  setTypeFilter: (value: string) => void;
  q: string;
  setQ: (value: string) => void;
  filtered: NormalizedArtifact[];
  selected: string | null;
  setSelected: (id: string) => void;
  sel: NormalizedArtifact | null;
  detail: { manifest: DesignManifest; critique: CritiqueResult | null } | null;
  detailLoading: boolean;
  detailError: string | null;
  viewerSrc: string | null;
  form: GenerateForm;
  setForm: React.Dispatch<React.SetStateAction<GenerateForm>>;
  formError: string | null;
  generating: boolean;
  runGenerate: () => Promise<void>;
  systems: DesignSystemMeta[];
  guard: DesignGuard | null;
  systemMeta: DesignSystemMeta | undefined;
  tab: DesignStudioTab;
  setTab: (tab: DesignStudioTab) => void;
  htmlEdit: string;
  setHtmlEdit: (value: string) => void;
  htmlError: string | null;
  saving: boolean;
  runSave: () => Promise<void>;
  critiquing: boolean;
  runCritique: () => Promise<void>;
  exporting: string | null;
  runExport: (format: DesignExportFormat) => Promise<void>;
  pngScale: 1 | 2;
  setPngScale: (scale: 1 | 2) => void;
  confirmDelete: string | null;
  deleting: boolean;
  runDelete: () => Promise<void>;
};

export function useDesignStudio(): DesignStudio {
  // Read the remembered snapshot once per mount: the selected artifact and
  // the brief form come back when the page is re-opened (REQ-168 scope 5).
  const snapshotRef = React.useRef<DesignPageSnapshot | null>(null);
  if (snapshotRef.current === null) snapshotRef.current = readDesignPageSnapshot();
  const snapshot = snapshotRef.current;

  const [items, setItems] = React.useState<NormalizedArtifact[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [q, setQ] = React.useState('');
  const [selected, setSelected] = React.useState<string | null>(snapshot.selected);
  const [detail, setDetail] = React.useState<{ manifest: DesignManifest; critique: CritiqueResult | null } | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<GenerateForm>(snapshot.form);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [systems, setSystems] = React.useState<DesignSystemMeta[]>([]);
  const [guard, setGuard] = React.useState<DesignGuard | null>(null);
  const [tab, setTab] = React.useState<DesignStudioTab>('code');
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
  // Independent request-sequence guards: the list and the detail load run in
  // PARALLEL on a boot with a restored selection — a single shared counter
  // made the detail call cancel the list call (and the list's `loading` flag
  // then never cleared, so the page sat on "Loading artifacts…" forever).
  const listRunRef = React.useRef(0);
  const detailRunRef = React.useRef(0);

  // Persist the remembered pieces on every change (cheap, serialized JSON).
  React.useEffect(() => {
    writeDesignPageSnapshot({ selected, form });
  }, [selected, form]);

  const loadList = React.useCallback(async (selectId?: string) => {
    const run = (listRunRef.current += 1);
    setLoading(true);
    try {
      const res = await api.listDesigns();
      if (listRunRef.current !== run) return;
      setItems(res.items.map((m) => toRow(m, m.bytes, m.overall)));
      setError(null);
      if (selectId && res.items.some((d) => d.id === selectId)) setSelected(selectId);
    } catch (e) {
      if (listRunRef.current !== run) return;
      setItems([]);
      setError(e instanceof Error ? e.message : 'design list failed');
    } finally {
      if (listRunRef.current === run) setLoading(false);
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
    const run = (detailRunRef.current += 1);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const res = await api.getDesign(id);
      if (detailRunRef.current !== run) return;
      setDetail({ manifest: res.manifest, critique: res.critique });
      setHtmlEdit(res.html);
      setHtmlError(null);
    } catch (e) {
      if (detailRunRef.current !== run) return;
      setDetailError(e instanceof Error ? e.message : 'design load failed');
    } finally {
      if (detailRunRef.current === run) setDetailLoading(false);
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

  // Selecting a row always cancels a pending delete-arm (pane parity).
  const selectArtifact = React.useCallback((id: string) => {
    setConfirmDelete(null);
    setSelected(id);
  }, []);

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

  const reload = React.useCallback(() => {
    void loadList();
  }, [loadList]);

  const filtered = React.useMemo(
    () => filterArtifacts(items, typeFilter as 'all' | (typeof DESIGN_TYPES)[number], q),
    [items, typeFilter, q],
  );
  const sel = selected ? (items.find((d) => d.id === selected) ?? null) : null;
  const viewerSrc = selected ? api.designViewUrl(selected) : null;
  const systemMeta = systems.find((s) => s.id === (detail?.manifest.system ?? form.system));

  return {
    items,
    loading,
    error,
    reload,
    typeFilter,
    setTypeFilter,
    q,
    setQ,
    filtered,
    selected,
    setSelected: selectArtifact,
    sel,
    detail,
    detailLoading,
    detailError,
    viewerSrc,
    form,
    setForm,
    formError,
    generating,
    runGenerate,
    systems,
    guard,
    systemMeta,
    tab,
    setTab,
    htmlEdit,
    setHtmlEdit,
    htmlError,
    saving,
    runSave,
    critiquing,
    runCritique,
    exporting,
    runExport,
    pngScale,
    setPngScale,
    confirmDelete,
    deleting,
    runDelete,
  };
}
