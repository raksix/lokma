/**
 * Project-scoped loop view probe (REQ-203) — run with:
 *   `bun src/components/loops/loop-view.test.ts` from `packages/lokma-web/web`.
 *
 * Plain asserts, no framework, no DOM (matches `loop.test.ts`'s shape so the
 * package's own probes stay dependency-free).
 *
 * The subject is every honesty rule in kapsam 1/3/4/5. Each rule gets a
 * DISCRIMINATING pair — cases that differ ONLY in the rule under test — because
 * the failure this file guards against is a rule that looks covered while
 * nothing actually depends on it (see REQ-201's cooldown lesson): a filter that
 * is never the only thing standing between "found" and "not found" measures
 * nothing.
 */
import {
  DEFAULT_LOOP_VIEW_PREFS,
  elsewhereWarningLabel,
  findProject,
  LOOP_NO_PROJECT_COPY,
  LOOP_STATUS_FILTERS,
  LOOP_UNSCOPED_COPY,
  LOOP_VIEW_KEY,
  loopInProject,
  loopProjectState,
  projectBadgeLabel,
  projectIdForCwd,
  readLoopViewPrefs,
  selectLoopView,
  sortLoops,
  statusFilterLabel,
  viewScopeLabel,
  writeLoopViewPrefs,
  type LoopProjectState,
  type LoopViewPrefs,
} from './loop-view';
import type { AuthProject, LoopView } from '@/lib/api';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  passed++;
  console.log(`PASS: ${label}`);
}

// ── fixtures ───────────────────────────────────────────────────────────────

function project(id: string, name: string, cwd: string): AuthProject {
  return { id, name, cwd, visibility: 'private', ownerId: 'u_owner', createdAt: '2026-09-01T00:00:00.000Z' };
}

function loop(over: Partial<LoopView> & { id: string }): LoopView {
  return {
    name: 'loop ' + over.id,
    projectId: null,
    cwd: '/tmp/probe',
    prompt: 'do the thing',
    origin: 'user',
    status: 'running',
    stopReason: null,
    budget: { maxIters: 400, maxHours: 1440, maxUsd: 100 },
    spent: { iters: 24, hours: 19.6, usd: 0, tokens: 1234 },
    score: { best: null, last: null, target: null },
    nextHint: null,
    trigger: { kind: 'manual' },
    cooldownSeconds: 0,
    maxEmptyIters: 3,
    lastRunOutcome: null,
    emptyIters: 0,
    lastRunStartedAt: null,
    stopRequested: false,
    inFlightSince: null,
    model: 'cmd-sexgoat/deepseek/deepseek-v4.1-flash',
    reasoningEffort: 'off',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    ...over,
  };
}

const PROJECTS: AuthProject[] = [
  project('p_alpha', 'Alpha', '/mnt/apopic/lokma'),
  project('p_beta', 'Beta', '/mnt/apopic/other'),
  // A record with NO cwd is not a location: it must not claim everything.
  project('p_ghost', 'Ghost', ''),
];

const prefs = (over: Partial<LoopViewPrefs> = {}): LoopViewPrefs => ({
  ...DEFAULT_LOOP_VIEW_PREFS,
  ...over,
});

// ── kapsam 1: the project view filters by BOTH signals ─────────────────────

assert(projectIdForCwd('/mnt/apopic/lokma', PROJECTS) === 'p_alpha', 'a cwd resolves to its project');
assert(projectIdForCwd('/mnt/apopic/lokma/', PROJECTS) === 'p_alpha', 'a trailing slash is the same cwd');
assert(projectIdForCwd('/mnt/apopic/nowhere', PROJECTS) === null, 'an unknown cwd belongs to no project');
assert(projectIdForCwd('', PROJECTS) === null, 'an empty cwd matches no project record');
assert(projectIdForCwd(null, PROJECTS) === null, 'a null cwd matches no project record');
// The Ghost record has an empty cwd; `sameCwd('','')` is true by design, so a
// naive filter would hand EVERY project-less loop to Ghost.
assert(
  loopProjectState(loop({ id: 'l_1', cwd: '/tmp/probe', projectId: null }), PROJECTS).kind === 'none',
  'a cwd-less project record does not claim a project-less loop',
);
assert(findProject('p_gone', PROJECTS) === null, 'an unknown project id resolves to nothing');
assert(findProject(null, PROJECTS) === null, 'a null project id resolves to nothing');

// The load-bearing case: a loop created before its project existed, scoped only
// by cwd. Filtering on projectId alone would drop it ("my loop disappeared").
const byCwdOnly = loop({ id: 'l_cwdonly', cwd: '/mnt/apopic/lokma', projectId: null });
assert(
  loopInProject(byCwdOnly, 'p_alpha', PROJECTS),
  'kapsam 3: a loop matches its project by cwd even without a projectId',
);
assert(
  loopInProject(byCwdOnly, 'p_beta', PROJECTS) === false,
  'kapsam 3: and it does NOT leak into the other project',
);
assert(
  selectLoopView([byCwdOnly], prefs({ mode: 'project', projectId: 'p_alpha' }), PROJECTS).visible.length === 1,
  'kapsam 1: the project view lists the cwd-only loop',
);

const byIdOnly = loop({ id: 'l_idonly', cwd: '/tmp/probe', projectId: 'p_beta' });
assert(
  loopInProject(byIdOnly, 'p_beta', PROJECTS),
  'kapsam 3: an explicit projectId wins even when the cwd says nothing',
);

// ── kapsam 4: a deleted project never deletes a loop ───────────────────────

const orphan = loop({ id: 'l_orphan', cwd: '/tmp/probe', projectId: 'p_deleted' });
const orphanState = loopProjectState(orphan, PROJECTS);
assert(orphanState.kind === 'missing', 'kapsam 4: a loop pointing at a deleted project reads missing');
assert(
  projectBadgeLabel(orphanState) === 'project missing',
  'kapsam 4: the badge says "project missing", not a bare id',
);
const orphanView = selectLoopView([orphan], prefs(), PROJECTS);
assert(orphanView.visible.length === 1, 'kapsam 4: the loop is still listed in all loops');
assert(
  orphanView.visible[0].id === 'l_orphan',
  'kapsam 4: the survivor IS the orphan row (no silent substitute)',
);
// And it stays reachable from the claimed project id, so selecting that id
// (persisted from before the deletion) still finds it.
assert(
  loopInProject(orphan, 'p_deleted', PROJECTS),
  'kapsam 4: the orphan still answers to its old project id',
);

// A cwd/projectId disagreement is reported, not silently resolved.
const conflictLoop = loop({ id: 'l_conflict', cwd: '/mnt/apopic/other', projectId: 'p_alpha' });
const conflictState: LoopProjectState = loopProjectState(conflictLoop, PROJECTS);
assert(conflictState.kind === 'conflict', 'kapsam 3: a cwd in another project is a visible conflict');
assert(
  projectBadgeLabel(conflictState) === 'project conflict · cwd is Beta',
  'kapsam 3: the conflict badge names the cwd project and never claims "project missing" (it exists)',
);
assert(
  projectBadgeLabel(orphanState) === 'project missing' &&
    projectBadgeLabel(orphanState) !== (projectBadgeLabel(conflictState) ?? ''),
  'kapsam 3+4: a deleted project and a cwd conflict read DIFFERENTLY',
);
assert(
  loopInProject(conflictLoop, 'p_alpha', PROJECTS),
  'kapsam 3: a conflicting loop counts as its CLAIMED project (never invisible)',
);

// ── kapsam 1: the view never widens into "everything" ─────────────────────

const alpha = loop({ id: 'l_alpha', cwd: '/mnt/apopic/lokma', projectId: 'p_alpha', status: 'paused' });
const free = loop({ id: 'l_free', cwd: '/tmp/probe', projectId: null, status: 'done' });

assert(loopInProject(free, null, PROJECTS), 'kapsam 1: a project-less loop is in the no-project bucket');
assert(
  loopInProject(alpha, null, PROJECTS) === false,
  'kapsam 1: the no-project bucket does NOT swallow a project loop',
);
const bucket = selectLoopView([alpha, free], prefs({ mode: 'project', projectId: null }), PROJECTS);
assert(bucket.visible.length === 1 && bucket.visible[0].id === 'l_free', 'kapsam 1: the bucket lists only free loops');
assert(bucket.unscoped === false, 'kapsam 1: the no-project bucket is a real scope, not "unscoped"');
assert(viewScopeLabel(prefs({ mode: 'project', projectId: null }), PROJECTS).includes('no project'),
  'kapsam 1: the header names the bucket instead of pretending there is a project');

// A project id nobody has (deleted while selected) must not silently show all.
const staleSel = selectLoopView([alpha, free], prefs({ mode: 'project', projectId: 'p_gone' }), PROJECTS);
assert(staleSel.unscoped === true, 'kapsam 4: a deleted project selection reports unscoped');
assert(staleSel.visible.length === 0, 'kapsam 4: an unscoped view lists nothing (never everything)');
assert(staleSel.scopedProject === null, 'kapsam 4: no project record for a deleted id');
assert(viewScopeLabel(prefs({ mode: 'project', projectId: 'p_gone' }), PROJECTS) === 'This project',
  'kapsam 4: the header falls back to the plain scope label');

// ── kapsam 5: the cross-view warning counts OTHER projects' running loops ──

const runningBeta = loop({ id: 'l_rbeta', cwd: '/mnt/apopic/other', projectId: 'p_beta', status: 'running' });
const pausedBeta = loop({ id: 'l_pbeta', cwd: '/mnt/apopic/other', projectId: 'p_beta', status: 'paused' });
const catalog = [alpha, runningBeta, pausedBeta];

const warn = selectLoopView(catalog, prefs({ mode: 'project', projectId: 'p_alpha' }), PROJECTS);
assert(warn.runningElsewhere.length === 1, 'kapsam 5: exactly the running loop of another project counts');
assert(warn.runningElsewhere[0].id === 'l_rbeta', 'kapsam 5: the counted loop is the running one (not the paused one)');
assert(
  elsewhereWarningLabel(warn.runningElsewhere) === '1 loop is running in another project',
  'kapsam 5: singular copy for one loop',
);
// The negative control: nothing running elsewhere => no line at all (never "0 loops").
assert(
  elsewhereWarningLabel([]) === null,
  'kapsam 5: no line when nothing runs elsewhere (no "0 loops" filler)',
);
// "Running" means running, not merely armed: a paused/errored/done loop must not
// be counted as work the user would otherwise miss.
for (const status of ['paused', 'done', 'error', 'draft'] as const) {
  const armedElsewhere = loop({ id: 'l_x', cwd: '/mnt/apopic/other', projectId: 'p_beta', status });
  assert(
    selectLoopView([armedElsewhere], prefs({ mode: 'project', projectId: 'p_alpha' }), PROJECTS)
      .runningElsewhere.length === 0,
    'kapsam 5: a non-running loop elsewhere raises no warning (' + status + ')',
  );
}
// The warning must survive a search box that hides the row: it is computed from
// the whole catalog BEFORE the query/status filters narrow the view.
const hidden = selectLoopView(
  catalog,
  prefs({ mode: 'project', projectId: 'p_alpha', query: 'alpha' }),
  PROJECTS,
);
assert(hidden.visible.length === 1, 'kapsam 2: the search box narrows the list');
assert(
  hidden.runningElsewhere.length === 1,
  'kapsam 5: the warning is NOT narrowed away by the search box',
);
// In "all" mode there is no "elsewhere" to warn about.
assert(
  selectLoopView(catalog, prefs({ mode: 'all' }), PROJECTS).runningElsewhere.length === 0,
  'kapsam 5: the all-loops view has nothing hidden, so no warning line',
);

// ── kapsam 2: status + search filters, and the honest ordering ─────────────

assert(LOOP_STATUS_FILTERS[0] === 'all' && LOOP_STATUS_FILTERS.length === 6, 'every status is representable');
assert(statusFilterLabel('all') === 'all statuses', 'the all filter reads as a label, not "all"');
assert(statusFilterLabel('running') === 'running', 'a concrete status filter keeps its name');
const draftLoop = loop({ id: 'l_draft', cwd: '/mnt/apopic/lokma', projectId: 'p_alpha', status: 'draft' });
const filtered = selectLoopView(
  [draftLoop, alpha],
  prefs({ mode: 'project', projectId: 'p_alpha', status: 'paused' }),
  PROJECTS,
);
assert(filtered.visible.length === 1 && filtered.visible[0].id === 'l_alpha',
  'kapsam 2: the status filter keeps only the matching loop');
const searched = selectLoopView(
  [alpha, draftLoop],
  prefs({ mode: 'project', projectId: 'p_alpha', query: 'l_draft' }),
  PROJECTS,
);
assert(searched.visible.length === 1 && searched.visible[0].id === 'l_draft',
  'kapsam 2: the search matches the loop name');
const hinted = loop({ id: 'l_hint', cwd: '/mnt/apopic/lokma', projectId: 'p_alpha', nextHint: 'ship REQ-203 slice 2' });
assert(
  selectLoopView([alpha, hinted], prefs({ mode: 'project', projectId: 'p_alpha', query: 'slice 2' }), PROJECTS)
    .visible.length === 1,
  'kapsam 2: the search also matches nextHint',
);
assert(
  selectLoopView([alpha, hinted], prefs({ mode: 'project', projectId: 'p_alpha', query: 'nope' }), PROJECTS)
    .visible.length === 0,
  'kapsam 2: a query matching nothing empties the list rather than showing all',
);

// Default order: running first, then newest updatedAt; unparseable dates last.
const order = sortLoops([
  loop({ id: 'l_old', status: 'done', updatedAt: '2026-09-01T00:00:00.000Z' }),
  loop({ id: 'l_bad', status: 'done', updatedAt: 'not-a-date' }),
  loop({ id: 'l_new', status: 'paused', updatedAt: '2026-10-04T00:00:00.000Z' }),
  loop({ id: 'l_live', status: 'running', updatedAt: '2026-09-20T00:00:00.000Z' }),
]);
assert(order[0].id === 'l_live', 'kapsam 2: running loops sort first even when older');
assert(order[1].id === 'l_new', 'kapsam 2: then the most recently updated');
assert(order[3].id === 'l_bad', 'kapsam 2: an unparseable timestamp sorts last and never throws');
assert(sortLoops([]).length === 0, 'kapsam 2: sorting an empty catalog is empty, not a throw');

// ── persistence: the preference survives a reload (shape-validated) ────────

const mem = new Map<string, string>();
const store = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
};

const saved = prefs({ mode: 'project', projectId: 'p_alpha', status: 'running', query: 'abc' });
writeLoopViewPrefs(saved, store);
assert(mem.has(LOOP_VIEW_KEY), 'the snapshot is written under the documented key');
const readBack = readLoopViewPrefs(store);
assert(readBack.mode === 'project', 'reload: the mode survives');
assert(readBack.projectId === 'p_alpha', 'reload: the project survives');
assert(readBack.status === 'running', 'reload: the status filter survives');
assert(readBack.query === 'abc', 'reload: the search query survives');

// Shape validation: a corrupt/hostile value must read as the defaults, never
// put the console into an impossible state (e.g. mode "everything").
assert(readLoopViewPrefs({ getItem: () => null }).mode === 'all', 'no stored value reads as the default');
assert(readLoopViewPrefs({ getItem: () => '{not json' }).mode === 'all', 'broken JSON reads as the default');
assert(readLoopViewPrefs({ getItem: () => '"a string"' }).mode === 'all', 'a non-object reads as the default');
assert(readLoopViewPrefs({ getItem: () => '[1,2,3]' }).mode === 'all', 'an array reads as the default');
const hostile = readLoopViewPrefs({
  getItem: () => JSON.stringify({ mode: 'everything', projectId: 42, status: 'bogus', query: 7 }),
});
assert(hostile.mode === 'all', 'an unknown mode is refused (the view cannot widen itself)');
assert(hostile.projectId === null, 'a non-string projectId reads as no project');
assert(hostile.status === 'all', 'an unknown status is refused');
assert(hostile.query === '', 'a non-string query reads as empty');
// A prefs object is never handed out shared: mutating the result must not
// change the defaults the next reader sees.
const once = readLoopViewPrefs(store);
once.mode = 'all';
assert(readLoopViewPrefs(store).mode === 'project', 'the returned prefs are a fresh object each read');
// A storage that throws (private mode) is survivable.
assert(
  readLoopViewPrefs({
    getItem: () => {
      throw new Error('denied');
    },
  }).mode === 'all',
  'a storage that throws reads as the default',
);

// ── the copy helpers ────────────────────────────────────────────────────────

assert(
  viewScopeLabel(prefs({ mode: 'all' }), PROJECTS) === 'All loops',
  'the all-views header reads "All loops"',
);
assert(
  viewScopeLabel(prefs({ mode: 'project', projectId: 'p_alpha' }), PROJECTS) === 'This project — Alpha',
  'the project header names the project',
);
assert(LOOP_UNSCOPED_COPY.includes('no-project bucket'), 'the unscoped copy points at where the loops went');
assert(LOOP_NO_PROJECT_COPY.includes('no project'), 'the bucket copy describes the bucket');

console.log(`\n${passed} assertions passed`);