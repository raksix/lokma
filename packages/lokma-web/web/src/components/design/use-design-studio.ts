import * as React from 'react';
import {
  ApiError,
  api,
  type CritiqueResult,
  type DesignGuard,
  type DesignManifest,
  type DesignSkillRow,
  type DesignSkillsRes,
  type DesignSystemCatalogRow,
  type DesignSystemsRes,
  type DesignTemplateRow,
  type DesignVersion,
} from '@/lib/api';
import { useProviderStore, useSessionStore } from '@/stores';
import {
  DESIGN_TYPES,
  appendDesignEvent,
  clearSkills,
  emptyGenerateForm,
  filterArtifacts,
  groupTemplateRows,
  parseHtmlEdit,
  pickTemplate,
  projectLabel,
  toRow,
  toggleSkill,
  validateGenerateForm,
  validateTweakNote,
  type DesignEvent,
  type DesignExportFormat,
  type DesignSample,
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
export type DesignDrawer = 'code' | 'critique' | 'versions';

export type DesignStudio = {
  items: NormalizedArtifact[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  /**
   * REQ-178 — the selected project cwd (`''` = the global
   * `~/.lokma/design/artifacts` root). Switching projects re-scopes the
   * list + guard and clears the canvas (artifacts belong to a project).
   */
  projectCwd: string;
  changeProject: (cwd: string) => void;
  typeFilter: string;
  setTypeFilter: (value: string) => void;
  q: string;
  setQ: (value: string) => void;
  filtered: NormalizedArtifact[];
  /**
   * REQ-189 — the right-hand Artifacts panel is closed by default (the canvas
   * keeps the full width) and its open state is part of the page snapshot.
   * `toggleArtifactsPanel()` is the ONLY way it flips — selecting an artifact
   * never closes it, so the list stays reusable.
   */
  artifactsPanel: boolean;
  toggleArtifactsPanel: () => void;
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
  /** REQ-179 — a sample brief chip (canvas empty state) fills the composer. */
  applySample: (sample: DesignSample) => void;
  systems: DesignSystemCatalogRow[];
  /** REQ-191 — `catalog` (read from disk) vs `bundled` (the fallback table). */
  systemsSource: DesignSystemsRes['source'];
  /**
   * REQ-192 — the design-SKILL catalog (`GET /api/design/skills`: installed
   * `scope: design` SKILL.md files, grouped). A SECOND axis beside systems, and
   * the selection itself lives in `form.skills` so it rides the snapshot.
   */
  skills: DesignSkillRow[];
  /** REQ-192 — the group taxonomy the server answers, in display order. */
  skillGroups: string[];
  /** REQ-192 — how many scanned skills were excluded for lacking `scope: design`. */
  skillsUnscoped: number;
  /** REQ-192 — toggle one skill id in/out of the selection (the only writer). */
  toggleSkill: (id: string) => void;
  /** REQ-192 — drop every selected skill (the picker's Reset). */
  resetSkills: () => void;
  /**
   * REQ-192 — the SKILL.md preview of the LAST toggled selection, read through
   * the shared `/api/skills/:id` endpoint (no second reader). `null` while
   * loading or when nothing is being previewed.
   */
  skillPreview: { id: string; name: string; content: string } | null;
  skillPreviewLoading: boolean;
  skillPreviewError: string | null;
  /** REQ-192 — open the preview for one selected id (null closes it). */
  previewSkill: (id: string | null) => void;
  /**
   * REQ-192 slice 5 — the design-TEMPLATE catalog (`GET /api/design/templates`):
   * the THIRD axis. A system is a palette, a skill is a style, a template is
   * the output skeleton. Kept in its own state, never merged into either.
   */
  templates: DesignTemplateRow[];
  /** REQ-192 slice 5 — picker rows grouped by artifact kind, display order. */
  templateGroups: { label: string; rows: DesignTemplateRow[] }[];
  /** REQ-192 slice 5 — how many catalog rows have no readable body. */
  templatesInvalid: number;
  /** REQ-192 slice 5 — pick/clear the template (the ONLY writer of form.template). */
  selectTemplate: (id: string) => void;
  /** REQ-192 slice 5 — drop the template selection (the picker's Reset). */
  resetTemplate: () => void;
  /**
   * REQ-192 slice 5 — the selected template's SKILL.md on screen. Its OWN
   * request sequence guard, separate from the skill preview: two panels share
   * one hook and must not cancel each other's reads.
   */
  templatePreview: { id: string; label: string; content: string } | null;
  templatePreviewLoading: boolean;
  templatePreviewError: string | null;
  /** REQ-192 slice 5 — open the template preview for one id (null closes it). */
  previewTemplate: (id: string | null) => void;
  guard: DesignGuard | null;
  systemMeta: DesignSystemCatalogRow | undefined;
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
  /**
   * REQ-190 — the artifact's version ledger (oldest first) and which entry is
   * current. `versions: []` is the honest state for a pre-REQ-190 artifact, so
   * the picker renders "no history yet" instead of faking a v1.
   */
  versions: DesignVersion[];
  currentVersion: number;
  versionsLoading: boolean;
  versionsError: string | null;
  /**
   * REQ-190 — the tweak sentence that lands as the NEXT version of THIS
   * artifact (the list never grows; the old body stays recoverable).
   */
  tweakNote: string;
  setTweakNote: (value: string) => void;
  tweakError: string | null;
  tweaking: boolean;
  runTweak: () => Promise<void>;
  /**
   * REQ-190 §3 — the shared metered write path. A field pick builds its tweak
   * sentence with `buildFieldTweakNote` and calls this, so the free-text box
   * and the field controls share ONE implementation (and one re-entry guard).
   */
  runTweakNote: (note: string) => Promise<void>;
  /** Revert to an earlier ledger entry (the server appends it as a new current). */
  reverting: number | null;
  runRevert: (version: number) => Promise<void>;
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
  // REQ-178 — the project the studio is scoped to ('' = global root).
  const [projectCwd, setProjectCwd] = React.useState<string>(snapshot.project);
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [q, setQ] = React.useState('');
  // REQ-189 — the artifacts panel is a secondary surface, closed on arrival.
  const [artifactsPanel, setArtifactsPanel] = React.useState<boolean>(snapshot.artifactsPanel);
  const [selected, setSelected] = React.useState<string | null>(snapshot.selected);
  const [detail, setDetail] = React.useState<{ manifest: DesignManifest; critique: CritiqueResult | null } | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<GenerateForm>(snapshot.form);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [systems, setSystems] = React.useState<DesignSystemCatalogRow[]>([]);
  // REQ-191 — which list the picker is showing; a bundled fallback must not
  // be rendered as if it were the installed catalog.
  const [systemsSource, setSystemsSource] = React.useState<DesignSystemsRes['source']>('bundled');
  // REQ-192 — the design-SKILL catalog + its taxonomy. `skillsUnscoped` is the
  // honesty counter: it tells the UI WHY a skill the user installed is absent
  // (it lacked `scope: design`), instead of an empty picker with no reason.
  const [skills, setSkills] = React.useState<DesignSkillRow[]>([]);
  const [skillGroups, setSkillGroups] = React.useState<string[]>([]);
  const [skillsUnscoped, setSkillsUnscoped] = React.useState(0);
  // REQ-192 — which selected skill's SKILL.md is on screen. Its own request
  // sequence guard: two quick previews must not let the slower answer win.
  const [skillPreview, setSkillPreview] = React.useState<{
    id: string;
    name: string;
    content: string;
  } | null>(null);
  const [skillPreviewLoading, setSkillPreviewLoading] = React.useState(false);
  const [skillPreviewError, setSkillPreviewError] = React.useState<string | null>(null);
  // REQ-192 slice 5 — the TEMPLATE catalog in its own state (a third list, not
  // a merge) plus the picked template's SKILL.md preview with its own sequence
  // guard, so a template read can never cancel a skill read.
  const [templates, setTemplates] = React.useState<DesignTemplateRow[]>([]);
  const [templatesInvalid, setTemplatesInvalid] = React.useState(0);
  const [templatePreview, setTemplatePreview] = React.useState<{
    id: string;
    label: string;
    content: string;
  } | null>(null);
  const [templatePreviewLoading, setTemplatePreviewLoading] = React.useState(false);
  const [templatePreviewError, setTemplatePreviewError] = React.useState<string | null>(null);
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
  // REQ-190 — version ledger + tweak sentence for the selected artifact.
  const [versions, setVersions] = React.useState<DesignVersion[]>([]);
  const [currentVersion, setCurrentVersion] = React.useState(0);
  const [versionsLoading, setVersionsLoading] = React.useState(false);
  const [versionsError, setVersionsError] = React.useState<string | null>(null);
  const [tweakNote, setTweakNote] = React.useState('');
  const [tweakError, setTweakError] = React.useState<string | null>(null);
  const [tweaking, setTweaking] = React.useState(false);
  const [reverting, setReverting] = React.useState<number | null>(null);

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
  /** REQ-190 — sha256 of the currently loaded body; the `expectedSha` lock token. */
  const detailShaRef = React.useRef('');

  // Persist the remembered pieces on every change (cheap, serialized JSON).
  React.useEffect(() => {
    writeDesignPageSnapshot({ selected, form, project: projectCwd, artifactsPanel });
  }, [selected, form, projectCwd, artifactsPanel]);

  const loadList = React.useCallback(async (cwd: string, selectId?: string) => {
    const run = (listRunRef.current += 1);
    setLoading(true);
    try {
      const res = await api.listDesigns(cwd || undefined);
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

  const loadMeta = React.useCallback(async (cwd: string) => {
    try {
      const res = await api.getDesignSystems();
      setSystems(res.systems);
      setSystemsSource(res.source);
    } catch {
      setSystems([]);
      setSystemsSource('bundled');
    }
    // REQ-192 — the SKILL catalog is loaded beside the system catalog (both
    // are picker data), but kept in its own state: merging them would defeat
    // the whole point of the second axis. A failed load leaves an empty
    // picker, never the system list standing in for skills.
    try {
      const res = await api.getDesignSkills();
      setSkills(res.skills);
      setSkillGroups(res.groups);
      setSkillsUnscoped(res.unscoped);
    } catch {
      setSkills([]);
      setSkillGroups([]);
      setSkillsUnscoped(0);
    }
    // REQ-192 slice 5 — the TEMPLATE catalog loads beside the other two and
    // fails to an empty picker, never to the skill or system list standing in
    // for it (a wrong-but-full picker is worse than an honest empty one).
    try {
      const res = await api.getDesignTemplates();
      setTemplates(res.templates);
      setTemplatesInvalid(res.invalid);
    } catch {
      setTemplates([]);
      setTemplatesInvalid(0);
    }
    try {
      const res = await api.getDesignGuard(cwd || undefined);
      setGuard(res.guard);
    } catch {
      setGuard(null);
    }
  }, []);

  React.useEffect(() => {
    // REQ-177 — the composer's model picker reads the shared provider
    // catalog; load it even when Design is the first page opened.
    void useProviderStore.getState().refresh();
    // REQ-178 — the project picker lists the saved projects; refresh them
    // even when Design is the first page opened (the sidebar usually did it).
    void useSessionStore.getState().refreshProjects();
  }, []);

  // REQ-178 — a project switch re-scopes both the artifact list and the
  // DESIGN.md guard to the new root.
  React.useEffect(() => {
    void loadList(projectCwd);
    void loadMeta(projectCwd);
  }, [loadList, loadMeta, projectCwd]);

  const loadDetail = React.useCallback(async (id: string, cwd: string) => {
    const run = (detailRunRef.current += 1);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    detailShaRef.current = '';
    try {
      const res = await api.getDesign(id, cwd || undefined);
      if (detailRunRef.current !== run) return;
      // REQ-190 — remember the sha of the body we just loaded. Both mutating
      // writes (Code-tab save, tweak) send it back as `expectedSha`, so a
      // write against a body the server has since changed is refused with 409
      // instead of silently overwriting a version the user never saw.
      detailShaRef.current = res.sha ?? '';
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
    if (selected) void loadDetail(selected, projectCwd);
  }, [selected, projectCwd, loadDetail]);

  // REQ-190 — the ledger rides alongside the detail load. Its own sequence
  // guard: the detail and the history are separate requests and a slow history
  // answer must never cancel the body (or vice versa), which is exactly what a
  // shared counter did to the list/detail pair earlier.
  const versionsRunRef = React.useRef(0);
  const loadVersions = React.useCallback(async (id: string, cwd: string) => {
    const run = (versionsRunRef.current += 1);
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      const res = await api.getDesignVersions(id, cwd || undefined);
      if (versionsRunRef.current !== run) return;
      setVersions(res.versions);
      setCurrentVersion(res.currentVersion);
    } catch (e) {
      if (versionsRunRef.current !== run) return;
      setVersions([]);
      setCurrentVersion(0);
      setVersionsError(e instanceof Error ? e.message : 'version history failed');
    } finally {
      if (versionsRunRef.current === run) setVersionsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (selected) void loadVersions(selected, projectCwd);
    else {
      setVersions([]);
      setCurrentVersion(0);
    }
  }, [selected, projectCwd, loadVersions]);

  // REQ-192 — the ONE SKILL.md reader. Both entry points (toggling a row in
  // and pressing "read" on a chip) call it, so there is a single request path
  // with a single sequence guard: two quick previews must not let the slower
  // answer overwrite the newer one.
  const skillPreviewRunRef = React.useRef(0);
  const loadSkillPreview = React.useCallback((id: string) => {
    setSkillPreviewLoading(true);
    setSkillPreviewError(null);
    const run = (skillPreviewRunRef.current += 1);
    void api
      .getSkill(id)
      .then((res) => {
        if (skillPreviewRunRef.current !== run) return;
        setSkillPreview({ id, name: res.skill.name, content: res.content });
      })
      .catch((e: unknown) => {
        if (skillPreviewRunRef.current !== run) return;
        // Honest failure: the user is told the body could not be read rather
        // than seeing an empty panel that reads like an empty skill.
        setSkillPreview(null);
        setSkillPreviewError(e instanceof Error ? e.message : 'skill preview failed');
      })
      .finally(() => {
        if (skillPreviewRunRef.current === run) setSkillPreviewLoading(false);
      });
  }, []);

  // The picker's only selection writer. The set semantics (cap, order, dedupe)
  // live in the pure `toggleSkill`, so the multi SelectMenu stays a dumb
  // per-click `onChange(value)`. Toggling a row also OPENS that skill's preview:
  // picking a skill without being able to read what it says is exactly how
  // "the skill was ignored" starts.
  const selectSkill = React.useCallback(
    (id: string) => {
      setFormError(null);
      setForm((f) => ({ ...f, skills: toggleSkill(f.skills, id) }));
      loadSkillPreview(id);
    },
    [loadSkillPreview],
  );

  const resetSkills = React.useCallback(() => {
    setFormError(null);
    setForm((f) => ({ ...f, skills: clearSkills() }));
    setSkillPreview(null);
    setSkillPreviewError(null);
  }, []);

  /** Open the preview for one selected id; `null` closes the panel. */
  const previewSkill = React.useCallback(
    (id: string | null) => {
      if (!id) {
        setSkillPreview(null);
        setSkillPreviewError(null);
        return;
      }
      loadSkillPreview(id);
    },
    [loadSkillPreview],
  );

  // REQ-192 slice 5 — the ONE template-body reader, with its OWN sequence
  // guard (`templatePreviewRunRef`, separate from the skill one): two panels
  // share this hook, and a shared guard would let a slow skill read cancel a
  // newer template read (or the reverse) with no visible error.
  const templatePreviewRunRef = React.useRef(0);
  const loadTemplatePreview = React.useCallback((id: string) => {
    setTemplatePreviewLoading(true);
    setTemplatePreviewError(null);
    const run = (templatePreviewRunRef.current += 1);
    void api
      .getDesignTemplate(id)
      .then((res) => {
        if (templatePreviewRunRef.current !== run) return;
        setTemplatePreview({ id, label: res.template.label, content: res.template.content });
      })
      .catch((e: unknown) => {
        if (templatePreviewRunRef.current !== run) return;
        // Honest failure, same rule as the skill preview: say the body could
        // not be read instead of showing an empty panel that reads as an empty
        // template.
        setTemplatePreview(null);
        setTemplatePreviewError(e instanceof Error ? e.message : 'template preview failed');
      })
      .finally(() => {
        if (templatePreviewRunRef.current === run) setTemplatePreviewLoading(false);
      });
  }, []);

  // The template picker's ONLY writer of `form.template`. Re-picking the
  // current row clears it (`pickTemplate`), and picking a row OPENS its body —
  // same reasoning as skills: choosing a skeleton you cannot read is how
  // "the template did nothing" starts.
  const selectTemplate = React.useCallback(
    (id: string) => {
      setFormError(null);
      setForm((f) => ({ ...f, template: pickTemplate(f.template, id) }));
      const next = id.trim();
      // Clearing (re-picking the current row) closes the panel instead of
      // re-reading the row the user just deselected.
      if (next === '' || next === form.template) {
        setTemplatePreview(null);
        setTemplatePreviewError(null);
        return;
      }
      loadTemplatePreview(next);
    },
    [form.template, loadTemplatePreview],
  );

  const resetTemplate = React.useCallback(() => {
    setFormError(null);
    setForm((f) => ({ ...f, template: '' }));
    setTemplatePreview(null);
    setTemplatePreviewError(null);
  }, []);

  const previewTemplate = React.useCallback(
    (id: string | null) => {
      if (!id) {
        setTemplatePreview(null);
        setTemplatePreviewError(null);
        return;
      }
      loadTemplatePreview(id);
    },
    [loadTemplatePreview],
  );

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
        cwd: projectCwd || undefined,
        // REQ-192 — the ids travel as ids; the server resolves each to its
        // SKILL.md body. Omitted when empty so a no-skill generation is the
        // exact same request it was before this axis existed.
        ...(form.skills.length > 0 ? { skills: form.skills } : {}),
        // REQ-192 slice 5 — the template axis rides the SAME request beside
        // skills (never merged): one id, resolved server-side to its SKILL.md
        // body. Omitted when empty so a no-template generation stays the exact
        // request it was before this axis existed.
        ...(form.template ? { template: form.template } : {}),
      });
      // REQ-178 scope 6 — the narration names the project the artifact
      // actually landed in.
      // REQ-192 — the manifest echoes WHICH skills were really sent (with the
      // characters that reached the model), so the chat names them from the
      // server's own answer instead of claiming "applied" from the selection.
      const applied = res.manifest.skills ?? [];
      const appliedText =
        form.skills.length === 0
          ? ''
          : applied.length === form.skills.length
            ? ` · skills: ${applied.map((sk) => sk.name).join(', ')}`
            : ` · ${applied.length}/${form.skills.length} skills reached the model (rest unusable)`;
      // REQ-192 slice 5 — the SAME honesty channel for the template: the chat
      // names what the SERVER recorded (with `sentChars`), never what the
      // selection claimed. `manifest.template` is absent when nothing was sent.
      const usedTemplate = res.manifest.template;
      const templateText = form.template
        ? usedTemplate
          ? ` · template: ${usedTemplate.label}`
          : ' · template did not reach the model (unusable)'
        : '';
      pushEvent(
        'ok',
        `Generated ${res.id} — overall ${res.critique.overall}/10 → proje: ${projectLabel(projectCwd)}${appliedText}${templateText}`,
      );
      toast(`Generated ${res.id} — overall ${res.critique.overall}/10`);
      // The brief clears after the server accepted it; the SKILL + TEMPLATE
      // selections are deliberately KEPT (a standing choice for this project,
      // not part of the one-off prompt), like Type/System/Model.
      setForm((f) => ({
        ...emptyGenerateForm,
        type: f.type,
        system: f.system,
        model: f.model,
        skills: f.skills,
        template: f.template,
      }));
      await loadList(projectCwd, res.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'generate failed';
      setFormError(message);
      pushEvent('error', `Generate failed — ${message}`);
    } finally {
      generatingRef.current = false;
      setGenerating(false);
    }
  }, [form, loadList, pushEvent, projectCwd]);

  // REQ-179 — a sample chip fills the brief (and its natural type), clears a
  // stale validation error and parks the caret in the composer textarea so
  // Generate is one keystroke away. The composer owns the `design-brief` id.
  const applySample = React.useCallback((sample: DesignSample) => {
    setFormError(null);
    setForm((f) => ({ ...f, brief: sample.brief, type: sample.type }));
    if (typeof document === 'undefined') return;
    const el = document.getElementById('design-brief');
    if (el instanceof HTMLTextAreaElement) el.focus();
  }, []);

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
      const saved = await api.saveDesignHtml(
        selected,
        parsed.html,
        projectCwd || undefined,
        detailShaRef.current || undefined,
      );
      // The write moved the body on: adopt the new sha so a second save in the
      // same pane is not immediately refused by its own first save.
      detailShaRef.current = saved.sha ?? detailShaRef.current;
      setDetail({ manifest: saved.manifest, critique: saved.critique });
      pushEvent('ok', `HTML saved — viewer rebuilt, overall ${saved.critique.overall}/10`);
      toast(`Saved ${selected} — viewer rebuilt, overall ${saved.critique.overall}/10`);
      void loadList(projectCwd, selected);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'save failed';
      setHtmlError(message);
      pushEvent('error', `Save failed — ${message}`);
    } finally {
      setSaving(false);
    }
  }, [selected, htmlEdit, loadList, pushEvent, projectCwd]);

  const runCritique = React.useCallback(async () => {
    if (!selected || critiquing) return;
    setCritiquing(true);
    try {
      const res = await api.critiqueDesign(selected, projectCwd || undefined);
      setDetail((d) => (d ? { ...d, critique: res.critique } : d));
      pushEvent('ok', `Critique done — ${res.critique.overall}/10`);
      toast(`Critique ${res.critique.overall}/10`);
      void loadList(projectCwd, selected);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'critique failed';
      pushEvent('error', `Critique failed — ${message}`);
      toast(message);
    } finally {
      setCritiquing(false);
    }
  }, [selected, critiquing, loadList, pushEvent, projectCwd]);

  const runExport = React.useCallback(
    async (format: DesignExportFormat, scaleOverride?: 1 | 2) => {
      if (!selected || exporting) return;
      setExporting(format);
      try {
        const { filename, blob } = await api.downloadDesignExport(
          selected,
          format,
          format === 'png' ? (scaleOverride ?? 2) : undefined,
          projectCwd || undefined,
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
    [selected, exporting, pushEvent, projectCwd],
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
      await api.deleteDesign(target, projectCwd || undefined);
      pushEvent('ok', `Deleted ${target}`);
      toast(`Deleted ${target}`);
      setSelected(null);
      setDetail(null);
      // The deleted artifact's lock token goes with it.
      detailShaRef.current = '';
      setDetailError(null);
      setHtmlEdit('');
      setDrawer(null);
      // REQ-190 — a deleted artifact's ledger must not linger in the picker.
      setVersions([]);
      setCurrentVersion(0);
      setTweakNote('');
      setTweakError(null);
      await loadList(projectCwd);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'delete failed';
      pushEvent('error', `Delete failed — ${message}`);
      toast(message);
    } finally {
      setDeleting(false);
    }
  }, [selected, deleting, confirmDelete, loadList, pushEvent, projectCwd]);

  const toggleDrawer = React.useCallback((next: DesignDrawer) => {
    setDrawer((current) => (current === next ? null : next));
  }, []);

  // REQ-190 — tweak the artifact in place. The re-entry guard is a ref (the
  // same reason generate has one): a double click behind a disabled button can
  // still fire twice, and every call here costs a metered model run.
  const tweakingRef = React.useRef(false);
  // REQ-190 §3 — the ONE metered write path. Both the free-text composer and a
  // field pick (type/system/palette/density/model/content) call this with a
  // sentence; there is no second tweak implementation to drift.
  const runTweakNote = React.useCallback(
    async (note: string) => {
      if (!selected || tweakingRef.current) return;
      const local = validateTweakNote(note);
      if (local) {
        setTweakError(local);
        return;
      }
      tweakingRef.current = true;
      setTweaking(true);
      setTweakError(null);
      try {
        const res = await api.tweakDesign(selected, {
          note: note.trim(),
          ...(projectCwd ? { cwd: projectCwd } : {}),
          ...(detailShaRef.current ? { expectedSha: detailShaRef.current } : {}),
        });
        pushEvent(
          'ok',
          `Tweaked ${selected} — v${res.currentVersion}${res.replaced.length > 0 ? ` · ${res.replaced.length} section(s)` : ''}`,
        );
        toast(`Tweaked — v${res.currentVersion}`);
        // The composer empties only after the server accepted it, so a failed
        // tweak leaves the user's sentence in place to retry.
        setTweakNote('');
        // Reload the body AND the ledger: the viewer iframe is keyed on the
        // manifest's updatedAt, and the picker on the newest entry.
        await loadDetail(selected, projectCwd);
        await loadVersions(selected, projectCwd);
        void loadList(projectCwd, selected);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'tweak failed';
        setTweakError(message);
        pushEvent('error', `Tweak failed — ${message}`);
        toast(message);
        // A 409 `stale_version` means the ledger moved under us — re-read it so
        // the picker stops offering the version the user can no longer target.
        if (e instanceof ApiError && e.status === 409) {
          await loadVersions(selected, projectCwd);
          await loadDetail(selected, projectCwd);
        }
      } finally {
        tweakingRef.current = false;
        setTweaking(false);
      }
    },
    [selected, projectCwd, loadDetail, loadVersions, loadList, pushEvent],
  );

  const runTweak = React.useCallback(async () => {
    await runTweakNote(tweakNote);
  }, [runTweakNote, tweakNote]);

  const runRevert = React.useCallback(
    async (version: number) => {
      if (!selected || reverting !== null) return;
      setReverting(version);
      try {
        const res = await api.revertDesign(selected, version, projectCwd || undefined);
        pushEvent('ok', `Reverted ${selected} to v${version} — now v${res.currentVersion}`);
        toast(`Reverted to v${version} — now v${res.currentVersion}`);
        setDetail({ manifest: res.manifest, critique: res.critique });
        await loadDetail(selected, projectCwd);
        await loadVersions(selected, projectCwd);
        void loadList(projectCwd, selected);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'revert failed';
        pushEvent('error', `Revert failed — ${message}`);
        toast(message);
      } finally {
        setReverting(null);
      }
    },
    [selected, reverting, projectCwd, loadDetail, loadVersions, loadList, pushEvent],
  );

  // REQ-189 — the toggle is a functional update so the panel never depends on a
  // stale closure, and it is the ONLY writer: `selectArtifact` deliberately
  // leaves the panel alone (picking an artifact must not hide the list).
  const toggleArtifactsPanel = React.useCallback(() => {
    setArtifactsPanel((current) => !current);
  }, []);

  // REQ-178 — switching projects re-scopes the studio: the previous list
  // belongs to the old root (its artifacts are unreadable from the new
  // one), so the canvas clears and the reload effect fetches the new root.
  const changeProject = React.useCallback((next: string) => {
    const value = next.trim();
    setProjectCwd((current) => (current === value ? current : value));
    setSelected(null);
    setDetail(null);
    // The lock token dies with the body it described — carrying it into the
    // next artifact would make the first write there a guaranteed 409.
    detailShaRef.current = '';
    setDetailError(null);
    setHtmlEdit('');
    setDrawer(null);
    setConfirmDelete(null);
    // REQ-190 — the ledger belongs to the OLD root's artifact; carrying it over
    // would label another project's design with this one's history.
    setVersions([]);
    setCurrentVersion(0);
    setTweakNote('');
    setTweakError(null);
  }, []);

  const reload = React.useCallback(() => {
    void loadList(projectCwd);
  }, [loadList, projectCwd]);

  const filtered = React.useMemo(
    () => filterArtifacts(items, typeFilter as 'all' | (typeof DESIGN_TYPES)[number], q),
    [items, typeFilter, q],
  );
  const sel = selected ? (items.find((d) => d.id === selected) ?? null) : null;
  const viewerSrc = selected ? api.designViewUrl(selected, projectCwd || undefined) : null;
  const systemMeta = systems.find((s) => s.id === (detail?.manifest.system ?? form.system));

  return {
    items,
    loading,
    error,
    reload,
    projectCwd,
    changeProject,
    typeFilter,
    setTypeFilter,
    q,
    setQ,
    filtered,
    artifactsPanel,
    toggleArtifactsPanel,
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
    applySample,
    systems,
    systemsSource,
    skills,
    skillGroups,
    skillsUnscoped,
    toggleSkill: selectSkill,
    resetSkills,
    skillPreview,
    skillPreviewLoading,
    skillPreviewError,
    previewSkill,
    // REQ-192 slice 5 — the template axis: its own catalog, its own grouped
    // rows (memoized so the SelectMenu does not get a fresh array identity on
    // every render, which would re-open/re-measure the menu), and its own
    // selection writers.
    templates,
    templateGroups: React.useMemo(
      () => groupTemplateRows(templates, DESIGN_TYPES),
      [templates],
    ),
    templatesInvalid,
    selectTemplate,
    resetTemplate,
    templatePreview,
    templatePreviewLoading,
    templatePreviewError,
    previewTemplate,
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
    versions,
    currentVersion,
    versionsLoading,
    versionsError,
    tweakNote,
    setTweakNote,
    tweakError,
    tweaking,
    runTweak,
    runTweakNote,
    reverting,
    runRevert,
  };
}
