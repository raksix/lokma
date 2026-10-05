import * as React from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectMenu } from '@/components/ui/select-menu';
import { emitToast } from '@/components/shell';
import { api, type AuthProject, type LoopView } from '@/lib/api';
import { LOOP_CHANGED_EVENT } from '@/lib/loop-frame';
import { useKnownCwd, useSessionStore } from '@/stores/session';
import { LOOP_EMPTY_COPY } from './loop';
import {
  adoptActiveProject,
  DEFAULT_LOOP_VIEW_PREFS,
  elsewhereWarningLabel,
  hasActiveFilters,
  LOOP_FILTERED_EMPTY_COPY,
  LOOP_NO_PROJECT_COPY,
  LOOP_STATUS_FILTERS,
  LOOP_UNSCOPED_COPY,
  readLoopViewPrefs,
  loopProjectState,
  selectLoopView,
  statusFilterLabel,
  viewScopeLabel,
  writeLoopViewPrefs,
  type LoopStatusFilter,
  type LoopViewMode,
  type LoopViewPrefs,
} from './loop-view';
import { LoopDetail } from './loop-detail';
import { LoopRow } from './loop-row';

/**
 * LoopConsole — kapsam 1 (the ONE implementation behind both the Settings →
 * Loops section and the rail's Loops pane), kapsam 5 (live rows) and kapsam 7
 * (empty state).
 *
 * Live update order matters (kapsam 5): the WS `loop` frame is the FAST path and
 * the 5s poll is the FALLBACK that only matters while no frame arrived for
 * LOOP_POLL_MS. A poll that ran unconditionally would race the frame and pull
 * a live row back to a stale record, so both paths funnel through ONE merge and
 * the poll pauses while frames are arriving.
 *
 * Frames reach the console as a window event, not a prop: the Settings modal
 * has no chat socket of its own while the Loops pane does, so a prop would
 * force this component to know which host it sits in. One event, both hosts.
 */

export const LOOP_POLL_MS = 5_000;

/**
 * The project picker's sentinel for the no-project bucket.
 *
 * A real project id can never collide with it: ids are server-minted, so a
 * literal that cannot be a plausible id keeps the menu value honest without
 * teaching `SelectMenu` a "null means bucket" convention.
 */
const NO_PROJECT_VALUE = '__no_project__';

function mergeLoops(prev: LoopView[], rows: LoopView[]): LoopView[] {
  if (rows.length === 0) return prev;
  const byId = new Map(prev.map((l) => [l.id, l]));
  for (const row of rows) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function LoopConsole() {
  const [loops, setLoops] = React.useState<LoopView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const [fresh, setFresh] = React.useState<string[]>([]);
  const [lastFrameAt, setLastFrameAt] = React.useState<number | null>(null);
  const [showNew, setShowNew] = React.useState(false);
  const [formName, setFormName] = React.useState('');
  const [formPrompt, setFormPrompt] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  // REQ-203 — the view is ONE preference object persisted under
  // `lokma-loops-view:v1`: the mode toggle, the scoped project, the status
  // filter and the search box survive a reload together, and a corrupt value
  // reads back as the defaults instead of taking the pane down.
  const [prefs, setPrefs] = React.useState<LoopViewPrefs>(() =>
    typeof window === 'undefined'
      ? { ...DEFAULT_LOOP_VIEW_PREFS }
      : readLoopViewPrefs(window.localStorage),
  );
  const updatePrefs = React.useCallback((next: LoopViewPrefs) => {
    setPrefs(next);
    writeLoopViewPrefs(next, typeof window === 'undefined' ? undefined : window.localStorage);
  }, []);

  const projects = useSessionStore((s) => s.projects);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const activeCwd = useKnownCwd(activeSessionId);

  // Kapsam 1: an unset project scope adopts the active session's project — but
  // only once, and never in `all` mode (see `adoptActiveProject`'s contract).
  React.useEffect(() => {
    const next = adoptActiveProject(prefs, activeCwd === 'loading' ? null : activeCwd, projects);
    if (next !== prefs) updatePrefs(next);
  }, [prefs, activeCwd, projects, updatePrefs]);

  const load = React.useCallback(async () => {
    try {
      const res = await api.listLoops();
      setLoops(res.loops);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load loops');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // The relative "3m ago" cells need a clock, but only while the pane is open.
  React.useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // Kapsam 5 fallback: poll the catalog every 5s, but STAY OUT OF THE WAY while
  // frames are flowing — a poll that fires during a live run is what makes a
  // row jump back one iteration and read as a stutter.
  React.useEffect(() => {
    const t = window.setInterval(() => {
      const live = lastFrameAt !== null && Date.now() - lastFrameAt < LOOP_POLL_MS * 2;
      if (!live) void load();
    }, LOOP_POLL_MS);
    return () => window.clearInterval(t);
  }, [lastFrameAt, load]);

  React.useEffect(() => {
    let cancelled = false;
    function onChanged(e: Event): void {
      const detail = (e as CustomEvent<string[]>).detail;
      const list = Array.isArray(detail) ? detail : [];
      setLastFrameAt(Date.now());
      setFresh((prev) => [...new Set([...prev, ...list])]);
      if (list.length === 0) {
        void load();
        return;
      }
      void Promise.all(
        list.map((id) => api.getLoop(id).then((r) => r.loop).catch(() => null)),
      ).then((rows) => {
        if (cancelled) return;
        setLoops((prev) => mergeLoops(prev, rows.filter((r): r is LoopView => r !== null)));
      });
    }
    window.addEventListener(LOOP_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(LOOP_CHANGED_EVENT, onChanged);
    };
  }, [load]);

  // The "new turn" mark is a courtesy badge, not a state: it expires on its own
  // so a row cannot claim newness forever.
  React.useEffect(() => {
    if (fresh.length === 0) return;
    const t = window.setTimeout(() => setFresh([]), 30_000);
    return () => window.clearTimeout(t);
  }, [fresh]);

  const active = loops.find((l) => l.id === selected) ?? null;
  const live = lastFrameAt !== null;

  const view = React.useMemo(
    () => selectLoopView(loops, prefs, projects),
    [loops, prefs, projects],
  );
  const warnLabel = elsewhereWarningLabel(view.runningElsewhere);
  const filtered = hasActiveFilters(prefs);

  const setMode = (mode: LoopViewMode): void => updatePrefs({ ...prefs, mode });
  const setStatus = (status: string): void =>
    updatePrefs({ ...prefs, status: status as LoopStatusFilter });

  /** A view whose scope names nothing lists nothing — the toggle stays available. */
  function viewBlocked(): boolean {
    return view.unscoped;
  }

  async function create(): Promise<void> {
    const name = formName.trim();
    const prompt = formPrompt.trim();
    if (!name || !prompt) {
      emitToast('A loop needs a name and a prompt.');
      return;
    }
    setCreating(true);
    try {
      // Kapsam 3 — a loop created from the project view is BOUND to that
      // project (its cwd AND its id), so it lands in the view the user is
      // looking at instead of the no-project bucket. In `all` mode there is no
      // scope to honour and the loop is created against the server cwd.
      const scoped = prefs.mode === 'project' ? view.scopedProject : null;
      const res = await api.createLoop({
        name,
        prompt,
        cwd: scoped?.cwd ?? '.',
        projectId: scoped?.id ?? null,
        origin: 'user',
      });
      setFormName('');
      setFormPrompt('');
      setShowNew(false);
      setSelected(res.loop.id);
      await load();
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'Could not create the loop');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-loop-console>
      <header className="flex items-center gap-2">
        <h3 className="text-[13px] font-semibold text-ink dark:text-zinc-100">Loops</h3>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {loops.length} {loops.length === 1 ? 'loop' : 'loops'}
          {live ? ' · live' : ''}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" aria-label="Reload loops" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="New loop"
            aria-expanded={showNew}
            onClick={() => setShowNew((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" />
            New loop
          </Button>
        </div>
      </header>

      {showNew ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-line p-2">
          <Input
            aria-label="Loop name"
            placeholder="Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
          <Input
            aria-label="Loop prompt"
            placeholder="What should each turn do?"
            value={formPrompt}
            onChange={(e) => setFormPrompt(e.target.value)}
          />
          <div className="flex items-center gap-1.5">
            <Button size="sm" aria-label="Create loop" disabled={creating} onClick={() => void create()}>
              Create
            </Button>
            <Button variant="ghost" size="sm" aria-label="Cancel new loop" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-[11px] text-red-500" data-loop-error>
          {error}
        </p>
      ) : null}

      {/* REQ-203 kapsam 1/2 — the view controls: which catalog, which project,
          which status, and the search box. Every control writes the ONE persisted
          prefs object, so a reload restores the same view rather than a guess. */}
      <div className="flex flex-wrap items-center gap-1.5" data-loop-view-controls>
        <div
          className="flex shrink-0 overflow-hidden rounded-md border border-line"
          role="group"
          aria-label="Loop view"
          data-loop-view-toggle
        >
          {(['all', 'project'] as LoopViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={prefs.mode === m}
              data-loop-view={m}
              onClick={() => setMode(m)}
              className={
                prefs.mode === m
                  ? 'bg-terracotta px-2 py-1 text-[11px] font-medium text-white'
                  : 'bg-paper px-2 py-1 text-[11px] font-medium text-zinc-500 hover:bg-muted dark:text-zinc-400'
              }
            >
              {m === 'all' ? 'All loops' : 'This project'}
            </button>
          ))}
        </div>

        {prefs.mode === 'project' ? (
          <SelectMenu
            ariaLabel="Loop project"
            size="xs"
            value={prefs.projectId ?? NO_PROJECT_VALUE}
            onChange={(v) =>
              updatePrefs({ ...prefs, projectId: v === NO_PROJECT_VALUE ? null : v })
            }
            options={[
              { value: NO_PROJECT_VALUE, label: 'No project' },
              ...projects.map((p: AuthProject) => ({ value: p.id, label: p.name })),
            ]}
            triggerAttrs={{ 'data-loop-project': prefs.projectId ?? NO_PROJECT_VALUE }}
            className="min-w-[9rem]"
          />
        ) : null}

        <SelectMenu
          ariaLabel="Loop status filter"
          size="xs"
          value={prefs.status}
          onChange={setStatus}
          options={LOOP_STATUS_FILTERS.map((f: LoopStatusFilter) => ({
            value: f,
            label: statusFilterLabel(f),
          }))}
          triggerAttrs={{ 'data-loop-status-filter': prefs.status }}
        />

        <div className="relative min-w-[8rem] flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <Input
            aria-label="Search loops"
            placeholder="Search name or next step"
            className="h-7 pl-7 text-[11px]"
            value={prefs.query}
            onChange={(e) => updatePrefs({ ...prefs, query: e.target.value })}
          />
        </div>
      </div>

      <p className="text-[11px] text-zinc-500 dark:text-zinc-400" data-loop-view-scope>
        {viewScopeLabel(prefs, projects)}
        {prefs.mode === 'project' && prefs.projectId === null && !view.unscoped
          ? ` — ${LOOP_NO_PROJECT_COPY}`
          : ''}
      </p>

      {warnLabel ? (
        <button
          type="button"
          data-loop-running-elsewhere
          onClick={() => setMode('all')}
          className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-left text-[11px] text-amber-700 hover:bg-amber-500/15 dark:text-amber-400"
        >
          {warnLabel} — show all loops
        </button>
      ) : null}

      {view.unscoped ? (
        <p className="rounded-md border border-dashed border-line p-2 text-[11px] text-zinc-500 dark:text-zinc-400" data-loop-unscoped>
          {LOOP_UNSCOPED_COPY}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-h-0 overflow-y-auto pr-1">
          {loading ? (
            <p className="text-[11px] text-zinc-400">Loading loops…</p>
          ) : viewBlocked() ? null : loops.length === 0 ? (
            <div
              className="rounded-md border border-dashed border-line p-3 text-[11px] text-zinc-500 dark:text-zinc-400"
              data-loop-empty
            >
              {LOOP_EMPTY_COPY}
            </div>
          ) : view.visible.length === 0 ? (
            // "Nothing here" has TWO causes and they must not read the same: an
            // empty catalog vs. a filter that hides what exists. The second
            // branch is also the only place a "clear filters" action appears.
            <div
              className="flex flex-col items-start gap-2 rounded-md border border-dashed border-line p-3 text-[11px] text-zinc-500 dark:text-zinc-400"
              data-loop-filtered-empty
            >
              <span>{filtered ? LOOP_FILTERED_EMPTY_COPY : LOOP_EMPTY_COPY}</span>
              {filtered ? (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Clear loop filters"
                  onClick={() => updatePrefs({ ...prefs, status: 'all', query: '' })}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5" data-loop-list>
              {view.visible.map((loop: LoopView) => (
                <li key={loop.id}>
                  <LoopRow
                    loop={loop}
                    selected={loop.id === selected}
                    fresh={fresh.includes(loop.id)}
                    nowMs={nowMs}
                    projectState={loopProjectState(loop, projects)}
                    onSelect={setSelected}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-h-0 overflow-y-auto border-line pr-1 md:border-l md:pl-3">
          {active ? (
            <LoopDetail
              loop={active}
              onLoopUpdated={(updated) => setLoops((prev) => mergeLoops(prev, [updated]))}
              onDeleted={(id) => {
                setLoops((prev) => prev.filter((l) => l.id !== id));
                setSelected(null);
              }}
            />
          ) : (
            <p className="text-[11px] text-zinc-400">
              {loops.length === 0
                ? 'Create a loop or ask your agent for one.'
                : 'Select a loop to see its state, ledger and controls.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}