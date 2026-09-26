import { DESIGN_SYSTEMS, DESIGN_TYPES, emptyGenerateForm, type GenerateForm } from './design';

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
  /** The brief form as it stood (type/system validated against the catalogs). */
  form: GenerateForm;
};

export function defaultDesignPageSnapshot(): DesignPageSnapshot {
  return { selected: null, form: { ...emptyGenerateForm } };
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
  const record = parsed as { selected?: unknown; form?: unknown };
  if (
    typeof record.selected === 'string' &&
    record.selected.length > 0 &&
    record.selected.length <= 200
  ) {
    out.selected = record.selected;
  }
  if (typeof record.form === 'object' && record.form !== null) {
    const form = record.form as { type?: unknown; brief?: unknown; system?: unknown };
    if (typeof form.type === 'string' && (DESIGN_TYPES as readonly string[]).includes(form.type)) {
      out.form.type = form.type;
    }
    if (typeof form.system === 'string' && (DESIGN_SYSTEMS as readonly string[]).includes(form.system)) {
      out.form.system = form.system;
    }
    if (typeof form.brief === 'string' && form.brief.length <= 2000) {
      out.form.brief = form.brief;
    }
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
