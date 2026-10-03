import {
  DESIGN_CWD_MAX_LEN,
  DESIGN_SYSTEMS,
  DESIGN_TYPES,
  emptyGenerateForm,
  normalizeSkillIds,
  type GenerateForm,
} from './design';

/**
 * REQ-168 — the Design Studio is its own page, and its state must survive
 * leaving it: the selected artifact and the brief form are snapshotted into
 * `localStorage` (`lokma-design-page:v1`), so switching back to `lokma` and
 * re-opening Design (or a reload) restores exactly where the user left off.
 *
 * Pure helpers only — the page owns the React state, so probes can exercise
 * parse/read/write without a DOM framework (same pattern as `bots/mode.ts`).
 */

export const DESIGN_PAGE_STATE_KEY = 'lokma-design-page:v1';

export type DesignPageSnapshot = {
  /** Selected artifact id from the live list (null when nothing is selected). */
  selected: string | null;
  /** The brief form as it stood (type/system validated against the catalogs; the picked model is remembered — REQ-177). */
  form: GenerateForm;
  /** REQ-178 — the chosen project cwd; `''` = the global `~/.lokma/design` root. */
  project: string;
  /**
   * REQ-189 — is the right-hand Artifacts panel open? Default `false`: the
   * list is a SECONDARY surface, so the canvas owns the full width until the
   * user asks for the panel. Only a literal `true` restores it; every other
   * value (missing, corrupt, foreign) keeps the panel closed.
   */
  artifactsPanel: boolean;
};

export function defaultDesignPageSnapshot(): DesignPageSnapshot {
  return { selected: null, form: { ...emptyGenerateForm }, project: '', artifactsPanel: false };
}

/** Tolerant parse: any unknown, corrupt or foreign field falls back to default. */
export function parseDesignPageSnapshot(raw: string | null | undefined): DesignPageSnapshot {
  const out = defaultDesignPageSnapshot();
  if (typeof raw !== 'string' || raw.length === 0) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (typeof parsed !== 'object' || parsed === null) return out;
  const record = parsed as { selected?: unknown; form?: unknown; project?: unknown; artifactsPanel?: unknown };
  // REQ-189 — the panel is restored ONLY on an explicit `true`; a missing or
  // foreign value keeps it closed rather than guessing.
  out.artifactsPanel = record.artifactsPanel === true;
  if (
    typeof record.selected === 'string' &&
    record.selected.length > 0 &&
    record.selected.length <= 200
  ) {
    out.selected = record.selected;
  }
  // REQ-178 — the project cwd is restored with the same tolerance: a
  // non-string, blank or over-long value falls back to the global root.
  if (typeof record.project === 'string') {
    const project = record.project.trim();
    if (project.length > 0 && project.length <= DESIGN_CWD_MAX_LEN) out.project = project;
  }
  if (typeof record.form === 'object' && record.form !== null) {
    const form = record.form as {
      type?: unknown;
      brief?: unknown;
      system?: unknown;
      model?: unknown;
      skills?: unknown;
    };
    if (typeof form.type === 'string' && (DESIGN_TYPES as readonly string[]).includes(form.type)) {
      out.form.type = form.type;
    }
    // REQ-191 — a persisted system may be a bundled preset OR an installed
    // package id (the catalog is per-machine), so restore on shape, not on
    // membership in the frozen table.
    if (typeof form.system === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(form.system)) {
      out.form.system = form.system;
    }
    if (typeof form.brief === 'string' && form.brief.length <= 2000) {
      out.form.brief = form.brief;
    }
    if (typeof form.model === 'string' && form.model.length <= 200) {
      out.form.model = form.model;
    }
    // REQ-192 — the picked skill ids survive a reload. Restored on SHAPE only
    // (ids are valid, capped, deduped), never against catalog membership: the
    // installed catalog is per-machine and may no longer carry one of them, and
    // the server already answers an honest 404 for an id it cannot resolve.
    out.form.skills = normalizeSkillIds(form.skills);
  }
  return out;
}

export function readDesignPageSnapshot(): DesignPageSnapshot {
  try {
    return parseDesignPageSnapshot(localStorage.getItem(DESIGN_PAGE_STATE_KEY));
  } catch {
    // Storage-denied browsers keep the defaults; nothing to restore.
    return defaultDesignPageSnapshot();
  }
}

export function writeDesignPageSnapshot(snapshot: DesignPageSnapshot): void {
  try {
    localStorage.setItem(DESIGN_PAGE_STATE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage-denied browsers keep the in-memory state only.
  }
}
