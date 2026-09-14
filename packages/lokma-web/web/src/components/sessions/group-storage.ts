/**
 * REQ-141 — the sidebar's folded/unfolded groups survive a reload.
 *
 * `null` means "nothing stored yet", so the sidebar keeps its built-in default
 * (Home open). An empty list is a real choice — the user folded everything —
 * and must not be confused with a missing record, otherwise F5 would silently
 * re-open a group the user closed.
 */

export const GROUP_STORAGE_KEY = 'lokma-sidebar-groups';

/** Group keys as last written, or `null` when there is no usable record. */
export function parseGroupKeys(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0);
  } catch {
    // Corrupt entry (hand-edited, other tab mid-write): fall back to the
    // default layout instead of throwing on boot.
    return null;
  }
}

/** Stable serialisation — sorted, so equal layouts compare equal in tests. */
export function serializeGroupKeys(keys: Iterable<string>): string {
  return JSON.stringify([...keys].sort());
}

/** localStorage access that survives private mode / no-window environments. */
function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readExpandedGroups(storage?: Storage | null, fallback: string[] = []): Set<string> {
  const store = storage === undefined ? safeStorage() : storage;
  let raw: string | null = null;
  try {
    raw = store ? store.getItem(GROUP_STORAGE_KEY) : null;
  } catch {
    // Blocked storage (policy/private mode) throws on read, not just on access.
    raw = null;
  }
  return new Set(parseGroupKeys(raw) ?? fallback);
}

export function writeExpandedGroups(keys: Iterable<string>, storage?: Storage | null): void {
  const store = storage === undefined ? safeStorage() : storage;
  try {
    store?.setItem(GROUP_STORAGE_KEY, serializeGroupKeys(keys));
  } catch {
    /* quota / disabled storage — the layout just will not persist */
  }
}

/**
 * REQ-142 — the grouping *mode* is part of the same preference: a user who
 * switched to "by project" should not land back in the day list after F5.
 * `time` (the normal, date-grouped list) is the default.
 */
export const GROUP_MODE_KEY = 'lokma-sidebar-groupby';

export type GroupByMode = 'time' | 'project';

export function readGroupBy(storage?: Storage | null): GroupByMode {
  const store = storage === undefined ? safeStorage() : storage;
  let raw: string | null = null;
  try {
    raw = store ? store.getItem(GROUP_MODE_KEY) : null;
  } catch {
    return 'time';
  }
  return raw === 'project' ? 'project' : 'time';
}

export function writeGroupBy(mode: GroupByMode, storage?: Storage | null): void {
  const store = storage === undefined ? safeStorage() : storage;
  try {
    store?.setItem(GROUP_MODE_KEY, mode);
  } catch {
    /* quota / disabled storage — the mode just will not persist */
  }
}
