/**
 * Pure rules for the project-scoped loop view (REQ-203).
 *
 * Two views over ONE dataset: `all` and `project`. Nothing here fetches or
 * renders — the console owns I/O and the JSX — so every honesty rule in kapsam
 * 1/3/4/5 is unit-provable without a DOM.
 *
 * The rules that shape this module:
 *
 *  - **A loop belongs to a project by EITHER signal** (explicit `projectId` OR
 *    the loop's `cwd` matching the project record's `cwd`). Filtering on
 *    `projectId` alone would silently drop a loop whose `cwd` sits inside the
 *    project but was created before the project existed — the user would read
 *    that as "my loop disappeared". kapsam 3 asks for one source of truth for
 *    the cwd; this module never WRITES a second one, it only reads both.
 *  - **A deleted project never deletes a loop** (kapsam 4): the loop stays
 *    listed with a `project missing` badge. Silence would read as data loss.
 *  - **A project view never widens into "everything"** (kapsam 1): with no
 *    matching project the view shows the no-project bucket and says so, rather
 *    than falling back to the full catalog under a "This project" label.
 *  - **The cross-view warning counts only OTHER projects' running loops**
 *    (kapsam 5) — that is the whole point of the line: work the user would
 *    otherwise not see.
 */
import type { AuthProject, LoopStatus, LoopView } from '@/lib/api';
import { sameCwd } from '@/components/sessions/grouping';

export type LoopViewMode = 'all' | 'project';

/** Status filter: `all` plus every real status, so nothing is unrepresentable. */
export type LoopStatusFilter = 'all' | LoopStatus;

export const LOOP_STATUS_FILTERS: LoopStatusFilter[] = [
  'all',
  'running',
  'paused',
  'draft',
  'done',
  'error',
];

/** Filter label for the picker (English UI copy; chat/report stays Turkish). */
export function statusFilterLabel(filter: LoopStatusFilter): string {
  return filter === 'all' ? 'all statuses' : filter;
}

/** What the persisted snapshot holds (kapsam: toggle + filters survive reload). */
export type LoopViewPrefs = {
  mode: LoopViewMode;
  /** Selected project in `project` mode; `null` = the no-project bucket. */
  projectId: string | null;
  status: LoopStatusFilter;
  query: string;
};

export const LOOP_VIEW_KEY = 'lokma-loops-view:v1';

export const DEFAULT_LOOP_VIEW_PREFS: LoopViewPrefs = {
  mode: 'all',
  projectId: null,
  status: 'all',
  query: '',
};

const MODES: LoopViewMode[] = ['all', 'project'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Read the persisted snapshot. Shape-validated, never trusted: a corrupt or
 * half-written value reads back as the defaults instead of throwing, because a
 * bad preference must never take the console down with it.
 */
export function readLoopViewPrefs(storage?: Pick<Storage, 'getItem'>): LoopViewPrefs {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return { ...DEFAULT_LOOP_VIEW_PREFS };
  try {
    const raw = store.getItem(LOOP_VIEW_KEY);
    if (!raw) return { ...DEFAULT_LOOP_VIEW_PREFS };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_LOOP_VIEW_PREFS };
    const mode = MODES.includes(parsed['mode'] as LoopViewMode)
      ? (parsed['mode'] as LoopViewMode)
      : DEFAULT_LOOP_VIEW_PREFS.mode;
    const status = LOOP_STATUS_FILTERS.includes(parsed['status'] as LoopStatusFilter)
      ? (parsed['status'] as LoopStatusFilter)
      : DEFAULT_LOOP_VIEW_PREFS.status;
    const projectId =
      typeof parsed['projectId'] === 'string' && parsed['projectId'].length > 0
        ? parsed['projectId']
        : null;
    const query = typeof parsed['query'] === 'string' ? parsed['query'] : '';
    return { mode, projectId, status, query };
  } catch {
    return { ...DEFAULT_LOOP_VIEW_PREFS };
  }
}

/** Persist the snapshot. Best effort — private mode just loses the preference. */
export function writeLoopViewPrefs(prefs: LoopViewPrefs, storage?: Pick<Storage, 'setItem'>): void {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return;
  try {
    store.setItem(LOOP_VIEW_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode / quota — the console keeps working, unsaved.
  }
}

/**
 * Which project (if any) a cwd belongs to (kapsam 1: "the active session's cwd
 * selects the project").
 *
 * A project record with no cwd is not a location and must not claim anything —
 * `sameCwd('', '')` is true by design, so an empty record would swallow the
 * no-project bucket. Returns `null` when nothing matches.
 */
export function projectIdForCwd(
  cwd: string | null | undefined,
  projects: readonly AuthProject[],
): string | null {
  const target = (cwd ?? '').trim();
  if (!target) return null;
  for (const p of projects) {
    if ((p.cwd ?? '').trim() && sameCwd(p.cwd, target)) return p.id;
  }
  return null;
}

/** Project record for an id, or `null` (a loop may point at a deleted project). */
export function findProject(
  projectId: string | null | undefined,
  projects: readonly AuthProject[],
): AuthProject | null {
  if (!projectId) return null;
  return projects.find((p) => p.id === projectId) ?? null;
}

export type LoopProjectState =
  /** No project claims this loop: no `projectId`, and its cwd matches none. */
  | { kind: 'none' }
  /** Resolved to a live project record (by id or by cwd). */
  | { kind: 'match'; project: AuthProject }
  /** `projectId` points at a project that no longer exists (kapsam 4). */
  | { kind: 'missing'; projectId: string }
  /**
   * The loop's `cwd` belongs to a DIFFERENT project than its `projectId`.
   * Reported instead of silently picking a winner — kapsam 3's "one source of
   * truth for the cwd" is a contract, and a breach should be visible.
   */
  | { kind: 'conflict'; projectId: string; cwdProject: AuthProject };

/** Resolve a loop's project from both signals, honestly. */
export function loopProjectState(
  loop: Pick<LoopView, 'projectId' | 'cwd'>,
  projects: readonly AuthProject[],
): LoopProjectState {
  const claimed = findProject(loop.projectId, projects);
  if (loop.projectId && !claimed) return { kind: 'missing', projectId: loop.projectId };

  const byCwd = projectIdForCwd(loop.cwd, projects);
  const byCwdRecord = findProject(byCwd, projects);

  if (claimed && byCwdRecord && byCwdRecord.id !== claimed.id) {
    return { kind: 'conflict', projectId: claimed.id, cwdProject: byCwdRecord };
  }
  if (claimed) return { kind: 'match', project: claimed };
  if (byCwdRecord) return { kind: 'match', project: byCwdRecord };
  return { kind: 'none' };
}

/** Short badge text for the project cell; `null` when there is nothing to say. */
export function projectBadgeLabel(state: LoopProjectState): string | null {
  if (state.kind === 'match') return state.project.name;
  if (state.kind === 'missing') return 'project missing';
  // The claimed project EXISTS here, so "project missing" would be a lie: say
  // what is actually true — the two signals disagree, and here is the one the
  // cwd points at.
  if (state.kind === 'conflict') return `project conflict · cwd is ${state.cwdProject.name}`;
  return 'no project';
}

/**
 * Does this loop belong to the selected project (kapsam 1's filter)?
 *
 * `projectId === null` is the no-project bucket, not "everything" — widening it
 * would put unrelated loops under a "This project" label.
 *
 * A `conflict` loop counts as belonging to its CLAIMED project (the explicit
 * assignment wins over the cwd heuristic) and is badged `conflict` by
 * `projectBadgeLabel`. Dropping it from both projects instead would hide a loop
 * that really is running there — the exact "my loop disappeared" read this
 * module exists to prevent.
 */
export function loopInProject(
  loop: Pick<LoopView, 'projectId' | 'cwd'>,
  projectId: string | null,
  projects: readonly AuthProject[],
): boolean {
  const state = loopProjectState(loop, projects);
  if (projectId === null) return state.kind === 'none';
  switch (state.kind) {
    case 'match':
      return state.project.id === projectId;
    case 'missing':
    case 'conflict':
      return state.projectId === projectId;
    case 'none':
      return false;
  }
}

function matchesQuery(loop: LoopView, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (loop.name.toLowerCase().includes(q)) return true;
  return (loop.nextHint ?? '').toLowerCase().includes(q);
}

function matchesStatus(loop: LoopView, filter: LoopStatusFilter): boolean {
  return filter === 'all' || loop.status === filter;
}

/** Updated-at sort with an unparseable timestamp sorted last, never thrown on. */
function byRecency(a: LoopView, b: LoopView): number {
  const at = Date.parse(a.updatedAt);
  const bt = Date.parse(b.updatedAt);
  const av = Number.isNaN(at) ? -Infinity : at;
  const bv = Number.isNaN(bt) ? -Infinity : bt;
  return bv - av;
}

/**
 * Default order (kapsam 2): live loops first, then the most recently updated.
 * An armed-but-not-running loop is not "live", so `running` is the promoted
 * group and everything else falls back to recency.
 */
export function sortLoops(loops: readonly LoopView[]): LoopView[] {
  return [...loops].sort((a, b) => {
    const ar = a.status === 'running' ? 0 : 1;
    const br = b.status === 'running' ? 0 : 1;
    if (ar !== br) return ar - br;
    return byRecency(a, b);
  });
}

export type LoopViewResult = {
  /** The rows the list renders — already filtered and ordered. */
  visible: LoopView[];
  /** Loops of OTHER projects whose status is `running` (kapsam 5's count). */
  runningElsewhere: LoopView[];
  /** The project the current view is scoped to; `null` = no-project bucket. */
  scopedProject: AuthProject | null;
  /** True when the project view is scoped to nothing at all (nothing to show). */
  unscoped: boolean;
};

/**
 * Split the catalog for the current view (kapsam 1/2/5).
 *
 * `runningElsewhere` is computed from the WHOLE catalog, before the search box
 * and status filter narrow it: the point of the warning line is that work is
 * running somewhere the current filter cannot show, so a search that hides it
 * must not hide the fact that it exists.
 */
export function selectLoopView(
  loops: readonly LoopView[],
  prefs: LoopViewPrefs,
  projects: readonly AuthProject[],
): LoopViewResult {
  const runningElsewhere =
    prefs.mode === 'project'
      ? loops.filter(
          (l) =>
            l.status === 'running' && !loopInProject(l, prefs.projectId, projects),
        )
      : [];

  const scoped = prefs.mode === 'project' ? findProject(prefs.projectId, projects) : null;
  // `project` mode with an id nobody has (or an id with no cwd to match on) has
  // nothing to list. Report it instead of quietly widening to the whole catalog.
  const unscoped = prefs.mode === 'project' && prefs.projectId !== null && scoped === null;

  const inView =
    prefs.mode === 'all' ? loops : loops.filter((l) => loopInProject(l, prefs.projectId, projects));

  const visible = sortLoops(
    inView.filter((l) => matchesStatus(l, prefs.status) && matchesQuery(l, prefs.query)),
  );

  return { visible, runningElsewhere, scopedProject: scoped, unscoped };
}

/** The kapsam 5 warning line; `null` when there is nothing running elsewhere. */
export function elsewhereWarningLabel(runningElsewhere: readonly LoopView[]): string | null {
  const n = runningElsewhere.length;
  if (n === 0) return null;
  return n === 1 ? '1 loop is running in another project' : `${n} loops are running in other projects`;
}

/** The project-view header: which project (or bucket) the list is showing. */
export function viewScopeLabel(prefs: LoopViewPrefs, projects: readonly AuthProject[]): string {
  if (prefs.mode === 'all') return 'All loops';
  const project = findProject(prefs.projectId, projects);
  if (!project) return prefs.projectId === null ? 'This project — no project' : 'This project';
  return `This project — ${project.name}`;
}

/** Copy for an unscoped project view (the project record is gone, kapsam 4). */
export const LOOP_UNSCOPED_COPY =
  'That project is gone. Its loops are still listed under the no-project bucket — switch to all loops to see every loop.';

/** Copy for the no-project bucket (kapsam 1's separate group). */
export const LOOP_NO_PROJECT_COPY = 'Loops that belong to no project.';