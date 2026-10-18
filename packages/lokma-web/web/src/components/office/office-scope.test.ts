/**
 * Office view scope + filters probe (REQ-204 slice 5) — run with:
 *   `bun src/components/office/office-scope.test.ts` from `packages/lokma-web/web`.
 *
 * Plain asserts, no framework, no DOM (matches `office-view.test.ts`).
 *
 * Subject: the REQ-203 mirror rules — adopt once, never widen, keep an
 * orphaned row in its own scope, warn about work elsewhere — plus the status
 * filter, the search box and the "stats follow the scope, not the filters"
 * rule. Each honesty rule gets a DISCRIMINATING pair: two cases that differ
 * ONLY in the rule under test, because the failure this file guards against
 * is a rule that looks covered while nothing depends on it.
 */
import {
  adoptOfficeActiveProject,
  DEFAULT_OFFICE_VIEW_PREFS,
  deliveryMatchesStatus,
  officeElsewhereLabel,
  OFFICE_FILTERED_DELIVERIES_EMPTY,
  OFFICE_FILTERED_EMPTY_COPY,
  OFFICE_NO_PROJECT_COPY,
  OFFICE_SCOPE_EMPTY_COPY,
  OFFICE_STATUS_FILTERS,
  OFFICE_UNSCOPED_COPY,
  OFFICE_VIEW_KEY,
  officeRowInScope,
  officeScopeLabel,
  officeStatusFilterLabel,
  readOfficeViewPrefs,
  selectOfficeView,
  workerMatchesStatus,
  writeOfficeViewPrefs,
  type OfficeViewPrefs,
} from './office-scope';
import type { OfficeDelivery, OfficeWorker } from './office-view';
import type { AuthProject } from '@/lib/api';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
  passed++;
  console.log('PASS: ' + label);
}

// ── fixtures ───────────────────────────────────────────────────────────────

function project(id: string, name: string, cwd: string): AuthProject {
  return { id, name, cwd, visibility: 'private', ownerId: 'u_owner', createdAt: '2026-09-01T00:00:00.000Z' };
}

const PROJECTS: AuthProject[] = [
  project('p_alpha', 'Alpha', '/mnt/apopic/lokma'),
  project('p_beta', 'Beta', '/mnt/apopic/other'),
  // A record with NO cwd is not a location: it must not claim everything.
  project('p_ghost', 'Ghost', ''),
];

function worker(over: Partial<OfficeWorker> & { id: string }): OfficeWorker {
  return {
    type: 'run',
    status: 'working',
    projectId: null,
    claimedProjectId: null,
    projectBadge: 'no project',
    cwd: null,
    sessionId: null,
    loopId: null,
    runId: null,
    botId: null,
    agentId: null,
    label: over.id,
    task: null,
    currentTool: null,
    lastTools: [],
    startedAt: null,
    endedAt: null,
    ok: null,
    isBoss: false,
    ...over,
  };
}

function delivery(over: Partial<OfficeDelivery> & { id: string }): OfficeDelivery {
  return {
    type: 'run',
    projectId: null,
    claimedProjectId: null,
    projectBadge: 'no project',
    label: over.id,
    startedAt: null,
    endedAt: null,
    ok: null,
    toolCount: null,
    ...over,
  };
}

function prefs(over: Partial<OfficeViewPrefs> = {}): OfficeViewPrefs {
  return { ...DEFAULT_OFFICE_VIEW_PREFS, ...over };
}

function reader(raw: string | null): Pick<Storage, 'getItem'> {
  return { getItem: (k: string) => (k === OFFICE_VIEW_KEY ? raw : null) };
}

// ── A. persistence: shape-validated, corrupt value falls back to defaults ──

const roundTrip: OfficeViewPrefs = { mode: 'project', projectId: 'p_alpha', status: 'waiting', query: 'docs' };
const written: Record<string, string> = {};
writeOfficeViewPrefs(roundTrip, { setItem: (k: string, v: string) => void (written[k] = v) });
assert(written[OFFICE_VIEW_KEY] === JSON.stringify(roundTrip), 'a write stores the whole snapshot under one key');
assert(
  JSON.stringify(readOfficeViewPrefs(reader(written[OFFICE_VIEW_KEY]))) === JSON.stringify(roundTrip),
  'a written snapshot reads back identical',
);

assert(
  JSON.stringify(readOfficeViewPrefs(reader('{'))) === JSON.stringify(DEFAULT_OFFICE_VIEW_PREFS),
  'a half-written value reads back as the defaults (never throws)',
);
assert(
  JSON.stringify(readOfficeViewPrefs(reader(null))) === JSON.stringify(DEFAULT_OFFICE_VIEW_PREFS),
  'no stored value reads back as the defaults',
);
const sanitized = readOfficeViewPrefs(
  reader(JSON.stringify({ mode: 'nope', projectId: '', status: 'weird', query: 7 })),
);
assert(
  sanitized.mode === 'all' && sanitized.status === 'all' && sanitized.projectId === null && sanitized.query === '',
  'unknown fields are sanitized one by one, the rest of the snapshot survives',
);
const kept = readOfficeViewPrefs(
  reader(JSON.stringify({ mode: 'project', projectId: 'p_alpha', status: 'bad', query: 'x' })),
);
assert(
  kept.mode === 'project' && kept.projectId === 'p_alpha' && kept.query === 'x' && kept.status === 'all',
  'one bad field does not discard the good ones (discriminates the field-wise fallback)',
);

// ── B. adopt once, and only when honest (REQ-203's three refusals) ─────────

const adoptBase = prefs({ mode: 'project' });
const adopted = adoptOfficeActiveProject(adoptBase, '/mnt/apopic/lokma', PROJECTS);
assert(adopted.projectId === 'p_alpha', 'an unset project scope adopts the active session cwd');
assert(adoptOfficeActiveProject(adopted, '/mnt/apopic/other', PROJECTS) === adopted, 'a set project is never overridden');
const allPrefs = prefs({ mode: 'all' });
assert(adoptOfficeActiveProject(allPrefs, '/mnt/apopic/lokma', PROJECTS) === allPrefs, 'all mode returns the SAME object');
assert(
  adoptOfficeActiveProject(adoptBase, '/mnt/nowhere', PROJECTS) === adoptBase,
  'an unknown cwd invents no project (no opinion stays no opinion)',
);
assert(
  adoptOfficeActiveProject(adoptBase, '', PROJECTS) === adoptBase,
  'an empty cwd adopts nothing (the empty-record trap from loop-view)',
);

// ── C. membership: the claim decides, the scope never widens ───────────────

const alphaRun = worker({ id: 'run:a', claimedProjectId: 'p_alpha', projectId: 'p_alpha', projectBadge: 'Alpha' });
const strayRun = worker({ id: 'run:s' });
const orphanLoop = worker({
  id: 'loop:gone',
  type: 'loop-turn',
  claimedProjectId: 'p_gone',
  projectId: null,
  projectBadge: 'project missing',
});

assert(officeRowInScope(alphaRun, 'p_alpha'), 'a row claiming the scope belongs to it');
assert(!officeRowInScope(alphaRun, 'p_beta'), 'a row does not leak into another project');
assert(officeRowInScope(orphanLoop, 'p_gone'), 'a deleted project STILL holds its row (claim, not resolution)');
assert(!officeRowInScope(orphanLoop, null), 'an orphaned row does NOT slide into the no-project bucket');
assert(officeRowInScope(strayRun, null), 'a row with no claim IS the no-project bucket');

const scopedAlpha = selectOfficeView([alphaRun, strayRun, orphanLoop], [], prefs({ mode: 'project', projectId: 'p_alpha' }), PROJECTS);
assert(
  scopedAlpha.workers.length === 1 && scopedAlpha.workers[0].id === 'run:a',
  'project scope shows exactly its own rows',
);
const noProjectView = selectOfficeView([alphaRun, strayRun, orphanLoop], [], prefs({ mode: 'project', projectId: null }), PROJECTS);
assert(
  noProjectView.workers.length === 1 && noProjectView.workers[0].id === 'run:s',
  'the no-project bucket is a bucket, NOT "everything" (never widens)',
);
const allView = selectOfficeView([alphaRun, strayRun, orphanLoop], [], prefs({ mode: 'all' }), PROJECTS);
assert(allView.workers.length === 3, 'all mode shows every row');
assert(allView.scopedProject === null && !allView.unscoped, 'all mode is never "scoped"');

// ── D. a vanished scope is REPORTED, not silently widened ──────────────────

const goneScope = selectOfficeView([alphaRun, orphanLoop], [], prefs({ mode: 'project', projectId: 'p_gone' }), PROJECTS);
assert(goneScope.unscoped === true, 'a scope with no live record reports unscoped');
assert(
  goneScope.workers.length === 1 && goneScope.workers[0].id === 'loop:gone',
  'its orphaned rows stay listed (nothing disappears with the project)',
);
const liveScope = selectOfficeView([alphaRun], [], prefs({ mode: 'project', projectId: 'p_alpha' }), PROJECTS);
assert(liveScope.unscoped === false, 'a live scope is not unscoped (discriminates the flag)');
assert(typeof OFFICE_UNSCOPED_COPY === 'string' && OFFICE_UNSCOPED_COPY.length > 0, 'the unscoped copy exists');

// ── E. status filter: one value per real row status ────────────────────────

const workingA = worker({ id: 'run:wa' });
const waitingB = worker({ id: 'run:wb', status: 'waiting' });
const deliv = delivery({ id: 'run:wa@T' });

assert(workerMatchesStatus(workingA, 'all') && workerMatchesStatus(waitingB, 'all'), 'all passes every worker');
assert(workerMatchesStatus(workingA, 'working') && !workerMatchesStatus(waitingB, 'working'), 'working narrows to working workers');
assert(workerMatchesStatus(waitingB, 'waiting') && !workerMatchesStatus(workingA, 'waiting'), 'waiting narrows to waiting workers');
assert(!workerMatchesStatus(workingA, 'delivered'), 'a live worker never passes delivered');
assert(deliveryMatchesStatus(deliv, 'delivered') && deliveryMatchesStatus(deliv, 'all'), 'a delivery passes delivered/all');
assert(!deliveryMatchesStatus(deliv, 'working') && !deliveryMatchesStatus(deliv, 'waiting'), 'a delivery passes no worker status');

const rowsW = [workingA, waitingB];
const rowsD = [deliv];
const waitView = selectOfficeView(rowsW, rowsD, prefs({ status: 'waiting' }), PROJECTS);
assert(
  waitView.workers.length === 1 && waitView.workers[0].id === 'run:wb' && waitView.deliveries.length === 0,
  'status waiting: one worker, deliveries stand down',
);
const delivView = selectOfficeView(rowsW, rowsD, prefs({ status: 'delivered' }), PROJECTS);
assert(
  delivView.workers.length === 0 && delivView.deliveries.length === 1,
  'status delivered: the mirror image (deliveries only)',
);
assert(OFFICE_STATUS_FILTERS.length === 4, 'the filter list covers all/working/waiting/delivered');
assert(
  officeStatusFilterLabel('all') === 'all statuses' && officeStatusFilterLabel('working') === 'working',
  'filter labels: all is spelled out, others name their status',
);

// ── F. search: label, task, badge — trimmed and case-insensitive ───────────

const docsWorker = worker({ id: 'run:d', label: 'Docs sweep', task: 'Ship the docs to main' });
const otherWorker = worker({ id: 'run:o', label: 'Fix parser', projectBadge: 'Beta' });
assert(
  selectOfficeView([docsWorker, otherWorker], [], prefs({ query: 'sweep' }), PROJECTS).workers.length === 1,
  'search matches the label',
);
assert(
  selectOfficeView([docsWorker, otherWorker], [], prefs({ query: 'DOCS' }), PROJECTS).workers.length === 1,
  'search matches the task line, case-insensitively',
);
assert(
  selectOfficeView([docsWorker, otherWorker], [], prefs({ query: '  beta  ' }), PROJECTS).workers.length === 1,
  'search trims and matches the project badge',
);
assert(
  selectOfficeView([docsWorker, otherWorker], [], prefs({ query: 'nomatch' }), PROJECTS).workers.length === 0,
  'an unmatched query shows nothing (the empty state explains why)',
);
const delivSearch = selectOfficeView([], [delivery({ id: 'run:x@T', label: 'Deploy finished' })], prefs({ query: 'deploy' }), PROJECTS);
assert(delivSearch.deliveries.length === 1, 'search matches delivery labels too');

// ── G. stats follow the SCOPE, not the filters ─────────────────────────────

const scopedRows = [worker({ id: 'run:1', claimedProjectId: 'p_alpha' }), worker({ id: 'run:2', claimedProjectId: 'p_alpha', status: 'waiting' }), worker({ id: 'run:3', claimedProjectId: 'p_beta' })];
const scopedDeliv = [delivery({ id: 'run:1@T', claimedProjectId: 'p_alpha' })];
const statsView = selectOfficeView(scopedRows, scopedDeliv, prefs({ mode: 'project', projectId: 'p_alpha' }), PROJECTS);
assert(
  statsView.stats.working === 2 && statsView.stats.waiting === 1 && statsView.stats.delivered === 1,
  'stats measure the scoped rows',
);
const filteredStats = selectOfficeView(
  scopedRows,
  scopedDeliv,
  prefs({ mode: 'project', projectId: 'p_alpha', status: 'delivered' }),
  PROJECTS,
);
assert(
  filteredStats.workers.length === 0 && filteredStats.stats.working === 2,
  'a filter that hides every worker does NOT report 0 working (stats are pre-filter)',
);
assert(filteredStats.filtered === true, 'an active filter is reported as such');
const unfiltered = selectOfficeView(scopedRows, scopedDeliv, prefs({ mode: 'all' }), PROJECTS);
assert(unfiltered.filtered === false, 'no filter is reported as such (discriminates the flag)');

// ── H. work elsewhere is counted BEFORE the filters narrow anything ────────

const elsewhereRows = [worker({ id: 'run:a', claimedProjectId: 'p_alpha' }), worker({ id: 'run:b', claimedProjectId: 'p_beta' })];
const elsewhereView = selectOfficeView(elsewhereRows, [], prefs({ mode: 'project', projectId: 'p_alpha' }), PROJECTS);
assert(elsewhereView.elsewhereBusy === 1, 'a worker in another project is counted');
const elsewhereFiltered = selectOfficeView(
  elsewhereRows,
  [],
  prefs({ mode: 'project', projectId: 'p_alpha', status: 'waiting' }),
  PROJECTS,
);
assert(elsewhereFiltered.elsewhereBusy === 1, 'a filter that hides it still reports it (pre-filter count)');
assert(selectOfficeView(elsewhereRows, [], prefs({ mode: 'all' }), PROJECTS).elsewhereBusy === 0, 'all mode has no elsewhere');
assert(officeElsewhereLabel(0) === null, 'no elsewhere work, no warning line');
assert(officeElsewhereLabel(1) === '1 worker is busy in another project', 'the singular warning');
assert(officeElsewhereLabel(3) === '3 workers are busy in other projects', 'the plural warning');

// ── I. labels + empty-state copies ─────────────────────────────────────────

assert(officeScopeLabel(prefs({ mode: 'all' }), PROJECTS) === 'All projects', 'all scope label');
assert(
  officeScopeLabel(prefs({ mode: 'project', projectId: 'p_alpha' }), PROJECTS) === 'This project - Alpha',
  'a live scope names its project',
);
assert(
  officeScopeLabel(prefs({ mode: 'project', projectId: 'p_gone' }), PROJECTS) === 'This project',
  'a vanished project cannot be named (honest label)',
);
assert(
  officeScopeLabel(prefs({ mode: 'project', projectId: null }), PROJECTS) === 'This project - no project',
  'the no-project bucket says so',
);
assert(
  typeof OFFICE_SCOPE_EMPTY_COPY === 'string' &&
    typeof OFFICE_FILTERED_EMPTY_COPY === 'string' &&
    typeof OFFICE_FILTERED_DELIVERIES_EMPTY === 'string' &&
    typeof OFFICE_NO_PROJECT_COPY === 'string',
  'every empty-state copy the pane needs exists',
);

console.log('---');
console.log(passed + ' assertions passed');
