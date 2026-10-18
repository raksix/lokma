/**
 * Pure rules for the Office view scope + filters (REQ-204 slice 5).
 *
 * The REQ asks for the loop console's toggle and its behaviour here
 * ("tum projeler <-> bu proje", REQ-203 semantics): the scope adopts the
 * active session's project once, never widens on its own, keeps rows whose
 * project record was deleted, and warns about live work in other projects
 * while scoped. The office keeps its OWN persisted snapshot
 * (`lokma-office-view:v1`) - the behaviour is shared, the storage is not.
 *
 * Two honesty rules shape this module:
 *
 *  - **Scope filters on the desk a row CLAIMS** (`claimedProjectId`), which
 *    `office-view.ts` keeps even when the project record is gone (its
 *    `projectId` stays the RESOLVED desk so the canvas never draws a column
 *    for a project that no longer exists). A worker whose project was deleted
 *    therefore stays listed under that project instead of silently sliding
 *    into the no-project bucket - REQ-203's `loopInProject` rule.
 *  - **The scope never widens.** `projectId === null` is the no-project
 *    bucket, not "everything"; when the scoped record is gone the view says
 *    so (`unscoped`) instead of quietly falling back to the full office.
 *
 * Nothing here fetches or renders - the pane owns I/O and the JSX - so every
 * rule is unit-provable without a DOM (the `office-view.ts` pattern).
 */
import type { AuthProject } from '@/lib/api';
import { findProject, projectIdForCwd } from '@/components/loops/loop-view';
import { officeStats, type OfficeDelivery, type OfficeStats, type OfficeWorker } from './office-view';
import { OFFICE_THEME_MODES, type OfficeThemeMode } from './office-theme';

export type OfficeScopeMode = 'all' | 'project';

/**
 * Status filter over the office's own vocabulary: `working`/`waiting` are
 * worker states, `delivered` is a finished row. Every value maps to a real
 * row status - nothing unrepresentable, nothing invented.
 */
export type OfficeStatusFilter = 'all' | 'working' | 'waiting' | 'delivered';

export const OFFICE_STATUS_FILTERS: OfficeStatusFilter[] = [
  'all',
  'working',
  'waiting',
  'delivered',
];

/** Filter label for the picker (English UI copy; chat/report stays Turkish). */
export function officeStatusFilterLabel(filter: OfficeStatusFilter): string {
  return filter === 'all' ? 'all statuses' : filter;
}

/** What the persisted snapshot holds (toggle + filters survive a reload). */
export type OfficeViewPrefs = {
  mode: OfficeScopeMode;
  /** Selected project in `project` mode; `null` = the no-project bucket. */
  projectId: string | null;
  status: OfficeStatusFilter;
  query: string;
  /**
   * Office palette source (REQ-204 slice 7): `app` = the app's active named
   * theme, `auto` = the renderer's own per-project theme.
   */
  theme: OfficeThemeMode;
};

export const OFFICE_VIEW_KEY = 'lokma-office-view:v1';

export const DEFAULT_OFFICE_VIEW_PREFS: OfficeViewPrefs = {
  mode: 'all',
  projectId: null,
  status: 'all',
  query: '',
  theme: 'app',
};

const MODES: OfficeScopeMode[] = ['all', 'project'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Read the persisted snapshot. Shape-validated, never trusted: a corrupt or
 * half-written value reads back as the defaults instead of throwing, because
 * a bad preference must never take the pane down with it.
 */
export function readOfficeViewPrefs(storage?: Pick<Storage, 'getItem'>): OfficeViewPrefs {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return { ...DEFAULT_OFFICE_VIEW_PREFS };
  try {
    const raw = store.getItem(OFFICE_VIEW_KEY);
    if (!raw) return { ...DEFAULT_OFFICE_VIEW_PREFS };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_OFFICE_VIEW_PREFS };
    const mode = MODES.includes(parsed['mode'] as OfficeScopeMode)
      ? (parsed['mode'] as OfficeScopeMode)
      : DEFAULT_OFFICE_VIEW_PREFS.mode;
    const status = OFFICE_STATUS_FILTERS.includes(parsed['status'] as OfficeStatusFilter)
      ? (parsed['status'] as OfficeStatusFilter)
      : DEFAULT_OFFICE_VIEW_PREFS.status;
    const projectId =
      typeof parsed['projectId'] === 'string' && parsed['projectId'].length > 0
        ? parsed['projectId']
        : null;
    const query = typeof parsed['query'] === 'string' ? parsed['query'] : '';
    const theme = OFFICE_THEME_MODES.includes(parsed['theme'] as OfficeThemeMode)
      ? (parsed['theme'] as OfficeThemeMode)
      : DEFAULT_OFFICE_VIEW_PREFS.theme;
    return { mode, projectId, status, query, theme };
  } catch {
    return { ...DEFAULT_OFFICE_VIEW_PREFS };
  }
}

/** Persist the snapshot. Best effort - private mode just loses the preference. */
export function writeOfficeViewPrefs(prefs: OfficeViewPrefs, storage?: Pick<Storage, 'setItem'>): void {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return;
  try {
    store.setItem(OFFICE_VIEW_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode / quota - the pane keeps working, unsaved.
  }
}

/**
 * Adopt the active session's project ONCE (REQ-203's `adoptActiveProject`,
 * same three refusals):
 *
 *  - it must not override a project the user already picked (`projectId` set),
 *    otherwise every visit yanks the selection away;
 *  - it must not fire in `all` mode - the "all" view is not scoped, so having
 *    a project implied would leak the answer into the next toggle;
 *  - it must not invent a project when the cwd matches none: no session, an
 *    unknown cwd, or a list that has not loaded yet all mean "no opinion".
 *
 * One-step derivation (no feedback loop): once the id is set, the second call
 * is a no-op because the first condition already holds.
 */
export function adoptOfficeActiveProject(
  prefs: OfficeViewPrefs,
  cwd: string | null | undefined,
  projects: readonly AuthProject[],
): OfficeViewPrefs {
  if (prefs.mode !== 'project') return prefs;
  if (prefs.projectId !== null) return prefs;
  const matched = projectIdForCwd(cwd, projects);
  if (!matched) return prefs;
  return { ...prefs, projectId: matched };
}

/**
 * Does a row belong to the scoped project?
 *
 * Membership follows the row's CLAIM (`claimedProjectId`, kept even when the
 * project record is gone). `scopeProjectId === null` is the no-project bucket,
 * not "everything" - widening it would put unrelated workers under a
 * "This project" label.
 */
export function officeRowInScope(
  row: { claimedProjectId: string | null },
  scopeProjectId: string | null,
): boolean {
  return row.claimedProjectId === scopeProjectId;
}

/** Workers pass `all`, `working` or `waiting`; a finished row is `delivered`. */
export function workerMatchesStatus(worker: OfficeWorker, filter: OfficeStatusFilter): boolean {
  return filter === 'all' || filter === worker.status;
}

/** Deliveries are finished by construction: they pass `all` or `delivered`. */
export function deliveryMatchesStatus(delivery: OfficeDelivery, filter: OfficeStatusFilter): boolean {
  return filter === 'all' || filter === 'delivered';
}

function matchesText(haystack: string | null, needle: string): boolean {
  return haystack !== null && haystack.toLowerCase().includes(needle);
}

function workerMatchesQuery(worker: OfficeWorker, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (matchesText(worker.label, q)) return true;
  if (matchesText(worker.task, q)) return true;
  return matchesText(worker.projectBadge, q);
}

function deliveryMatchesQuery(delivery: OfficeDelivery, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (matchesText(delivery.label, q)) return true;
  return matchesText(delivery.projectBadge, q);
}

export type OfficeViewResult = {
  /** The rows the lists render - scope + status + query applied. */
  workers: OfficeWorker[];
  deliveries: OfficeDelivery[];
  /** Scope-only rows: the stats and the empty-state CAUSE read from these. */
  scopedWorkers: OfficeWorker[];
  scopedDeliveries: OfficeDelivery[];
  /** Counts measured from the scoped rows, BEFORE the status/search filters. */
  stats: OfficeStats;
  /** The project the view is scoped to; `null` = no-project bucket or all. */
  scopedProject: AuthProject | null;
  /** True when `project` mode points at an id with no live record (deleted). */
  unscoped: boolean;
  /** Live workers outside the scope (REQ-203's cross-view warning, pre-filter). */
  elsewhereBusy: number;
  /** True when status/query are narrowing the lists (empty-state copy select). */
  filtered: boolean;
};

/**
 * Split the office rows for the current view.
 *
 * `elsewhereBusy` is computed from the WHOLE worker list, before the search
 * box and status filter narrow it: the point of the warning line is that work
 * is happening where the current view cannot show it, so a filter that hides
 * it must not hide the fact that it exists (REQ-203's rule, same reason).
 *
 * Stats follow the SCOPE but not the filters: the header line describes the
 * office (or the scoped project), and a status filter must not answer "0
 * working" for an office that is plainly working.
 */
export function selectOfficeView(
  workers: readonly OfficeWorker[],
  deliveries: readonly OfficeDelivery[],
  prefs: OfficeViewPrefs,
  projects: readonly AuthProject[],
): OfficeViewResult {
  const scopeId = prefs.mode === 'project' ? prefs.projectId : null;
  const scopedWorkers =
    prefs.mode === 'all' ? [...workers] : workers.filter((w) => officeRowInScope(w, scopeId));
  const scopedDeliveries =
    prefs.mode === 'all'
      ? [...deliveries]
      : deliveries.filter((d) => officeRowInScope(d, scopeId));

  const filtered = prefs.status !== 'all' || prefs.query.trim().length > 0;
  const visibleWorkers = scopedWorkers.filter(
    (w) => workerMatchesStatus(w, prefs.status) && workerMatchesQuery(w, prefs.query),
  );
  const visibleDeliveries = scopedDeliveries.filter(
    (d) => deliveryMatchesStatus(d, prefs.status) && deliveryMatchesQuery(d, prefs.query),
  );

  const scopedProject = prefs.mode === 'project' ? findProject(prefs.projectId, projects) : null;
  // `project` mode with an id nobody has has nothing of its own to resolve.
  // Report it instead of quietly widening to the whole office.
  const unscoped = prefs.mode === 'project' && prefs.projectId !== null && scopedProject === null;
  const elsewhereBusy =
    prefs.mode === 'project' ? workers.filter((w) => !officeRowInScope(w, scopeId)).length : 0;

  return {
    workers: visibleWorkers,
    deliveries: visibleDeliveries,
    scopedWorkers,
    scopedDeliveries,
    stats: officeStats(scopedWorkers, scopedDeliveries),
    scopedProject,
    unscoped,
    elsewhereBusy,
    filtered,
  };
}

/** The cross-view warning line; `null` when nothing is running elsewhere. */
export function officeElsewhereLabel(elsewhereBusy: number): string | null {
  if (elsewhereBusy === 0) return null;
  return elsewhereBusy === 1
    ? '1 worker is busy in another project'
    : elsewhereBusy + ' workers are busy in other projects';
}

/** The project-view header: which project (or bucket) the lists are showing. */
export function officeScopeLabel(prefs: OfficeViewPrefs, projects: readonly AuthProject[]): string {
  if (prefs.mode === 'all') return 'All projects';
  const project = findProject(prefs.projectId, projects);
  if (!project) return prefs.projectId === null ? 'This project - no project' : 'This project';
  return 'This project - ' + project.name;
}

/** Copy for the no-project bucket (a separate group, REQ-203 style). */
export const OFFICE_NO_PROJECT_COPY = 'Workers that belong to no project.';

/** Copy for an unscoped project view (the project record is gone). */
export const OFFICE_UNSCOPED_COPY =
  'That project is gone. Workers that still point at it stay listed - switch to all projects to see everything.';

/** Empty state when the SCOPE has no live worker (the scope, not a filter). */
export const OFFICE_SCOPE_EMPTY_COPY = 'No live worker in this scope.';

/** Empty state when the FILTERS hide existing rows - never a fabricated absence. */
export const OFFICE_FILTERED_EMPTY_COPY =
  'No worker matches these filters. Clear them to see the whole office.';

/** Deliveries counterpart: the scope has none. */
export const OFFICE_SCOPE_DELIVERIES_EMPTY = 'No delivery in this scope.';

/** Deliveries counterpart: the filters hide the observed ones. */
export const OFFICE_FILTERED_DELIVERIES_EMPTY = 'No delivery matches these filters.';
