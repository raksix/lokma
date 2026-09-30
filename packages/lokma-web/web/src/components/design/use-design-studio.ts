import * as React from 'react';
import { api, type CritiqueResult, type DesignGuard, type DesignManifest, type DesignSystemMeta } from '@/lib/api';
import { useProviderStore } from '@/stores';
import {
  DESIGN_TYPES,
  appendDesignEvent,
  emptyGenerateForm,
  filterArtifacts,
  parseHtmlEdit,
  toRow,
  validateGenerateForm,
  type DesignEvent,
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
 *
 * REQ-172 — the page is now chat + canvas: the hook additionally narrates
 * what this visit did (`events`, capped chips for the thread) and owns the
 * canvas drawer (`code` / `critique`), which replaced the old tab stack.
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
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Canvas drawer id — one overlay at a time over the viewer. */
export type DesignDrawer = 'code' | 'critique';

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
  /** REQ-172 — session activity chips for the chat thread (newest last). */
  events: DesignEvent[];
  /** Which canvas drawer is open, if any. */
  drawer: DesignDrawer | null;
  toggleDrawer: (drawer: DesignDrawer) => void;
  htmlEdit: string;
  setHtmlEdit: (value: string) => void;
  htmlError: string | null;
  saving: boolean;
  runSave: () => Promise<void>;
  critiquing: boolean;
  runCritique: () => Promise<void>;
  exporting: string | null;
  runExport: (format: DesignExportFormat, scaleOverride?: 1 | 2) => Promise<void>;
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
  const [events, setEvents] = React.useState<DesignEvent[]>([]);
  const [drawer, setDrawer] = React.useState<DesignDrawer | null>(null);
  const [htmlEdit, setHtmlEdit] = React.useState('');
  const [htmlError, setHtmlError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [critiquing, setCritiquing] = React.useState(false);
  const [exporting, setExporting] = React.useState<string | null>(null);
  // Two-click delete arm (archify-pane pattern) + in-flight flag.
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Narration sequence: ids only need to be unique within one visit.
  const eventSeq = React.useRef(0);
  const pushEvent = React.useCallback((kind: DesignEvent['kind'], text: string) => {
    setEvents((list) =>
      appendDesignEvent(list, { id: (eventSeq.current += 1), kind, text, at: Date.now() }),
    );
  }, []);

  // Generate is an async POST behind a disabled button; a same-frame double
  // click could still fire twice, so the re-entry guard is a ref, not state.
  const generatingRef = React.useRef(false);

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
    // REQ-177 — the composer's model picker reads the shared provider
    // catalog; load it even when Design is the first page opened.
    void useProviderStore.getState().refresh();
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
    if (generatingRef.current) return;
    const local = validateGenerateForm(form);
    if (local) {
      setFormError(local);
      return;
    }
    generatingRef.current = true;
    setGenerating(true);
    setFormError(null);
    try {
      const res = await api.generateDesign({
        type: form.type,
        brief: form.brief.trim(),
        system: form.system,
        model: form.model || undefined,
      });
      pushEvent('ok', `Generated ${res.id} — overall ${res.critique.overall}/10`);
      toast(`Generated ${res.id} — overall ${res.critique.overall}/10`);
      setForm((f) => ({ ...emptyGenerateForm, type: f.type, system: f.system, model: f.model }));
      await loadList(res.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'generate failed';
      setFormError(message);
      pushEvent('error', `Generate failed — ${message}`);
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  }, [form, loadList, pushEvent]);

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
      pushEvent('ok', `HTML saved — viewer rebuilt, overall ${saved.critique.overall}/10`);
      toast(`Saved ${selected} — viewer rebuilt, overall ${saved.critique.overall}/10`);
      void loadList(selected);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'save failed';
      setHtmlError(message);
      pushEvent('error', `Save failed — ${message}`);
    } finally {
      setSaving(false);
    }
  }, [selected, htmlEdit, loadList, pushEvent]);

  const runCritique = React.useCallback(async () => {
    if (!selected || critiquing) return;
    setCritiquing(true);
    try {
      const res = await api.critiqueDesign(selected);
      setDetail((d) => (d ? { ...d, critique: res.critique } : d));
      pushEvent('ok', `Critique done — ${res.critique.overall}/10`);
      toast(`Critique ${res.critique.overall}/10`);
      void loadList(selected);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'critique failed';
      pushEvent('error', `Critique failed — ${message}`);
      toast(message);
    } finally {
      setCritiquing(false);
    }
  }, [selected, critiquing, loadList, pushEvent]);

  const runExport = React.useCallback(
    async (format: DesignExportFormat, scaleOverride?: 1 | 2) => {
      if (!selected || exporting) return;
      setExporting(format);
      try {
        const { filename, blob } = await api.downloadDesignExport(
          selected,
          format,
          format === 'png' ? (scaleOverride ?? 2) : undefined,
        );
        saveBlob(filename, blob);
        pushEvent('ok', `Exported ${filename}`);
        toast(`Exported ${filename}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'export failed';
        pushEvent('error', `Export failed — ${message}`);
        toast(message);
      } finally {
        setExporting(null);
      }
    },
    [selected, exporting, pushEvent],
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
    const target = selected;
    setConfirmDelete(null);
    setDeleting(true);
    try {
      await api.deleteDesign(target);
      pushEvent('ok', `Deleted ${target}`);
      toast(`Deleted ${target}`);
      setSelected(null);
      setDetail(null);
      setDetailError(null);
      setHtmlEdit('');
      setDrawer(null);
      await loadList();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'delete failed';
      pushEvent('error', `Delete failed — ${message}`);
      toast(message);
    } finally {
      setDeleting(false);
    }
  }, [selected, deleting, confirmDelete, loadList, pushEvent]);

  const toggleDrawer = React.useCallback((next: DesignDrawer) => {
    setDrawer((current) => (current === next ? null : next));
  }, []);

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
    events,
    drawer,
    toggleDrawer,
    htmlEdit,
    setHtmlEdit,
    htmlError,
    saving,
    runSave,
    critiquing,
    runCritique,
    exporting,
    runExport,
    confirmDelete,
    deleting,
    runDelete,
  };
}
