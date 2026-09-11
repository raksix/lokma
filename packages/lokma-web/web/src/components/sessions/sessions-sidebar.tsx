import * as React from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Columns2,
  FolderPlus,
  GitFork,
  GitMerge,
  LayoutGrid,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { api, type AuthProject, type SessionSummary } from '@/lib/api';
import { usePaneStore, useSessionStore } from '@/stores';
import { SEEN_EVENT, isSessionUnread, markSessionSeen, readSeenMap, seedSeenMap } from '@/stores/session';
import { emitToast, isMobileViewport, useIsMobile } from '@/components/shell';
import { ProjectModal } from './project-modal';
import {
  activityBadge,
  displayTitle,
  filterSessions,
  groupSessions,
  relativeTime,
  sameCwd,
} from './grouping';

/**
 * SessionsSidebar — real session list for the left explorer.
 * Ported from `concept/.../layout/SidebarLeft.tsx` (sessions tab) and wired
 * to `GET /api/sessions` summaries via sessionStore: Today/Yesterday/Earlier
 * or by-project grouping, live search, create/rename/fork/merge/delete, and
 * click-to-resume. The concept's hardcoded SESSIONS array is gone — every
 * row below comes from the server (CLI + Web share the same JSONL files).
 *
 * Dragging a row carries the real session id
 * (`application/x-lokma-session`); drops land in the W7 tiling workspace
 * (open / side-by-side split / fork / merge chooser) — no fake tabs here.
 */

const RENDER_CAP = 120;

/** Live read of the seen-map; re-renders dots on `markSessionSeen`. */
function useSeenMap(): Record<string, string> {
  const [version, setVersion] = React.useState(0);
  React.useEffect(() => {
    const bump = () => setVersion((x) => x + 1);
    window.addEventListener(SEEN_EVENT, bump);
    return () => window.removeEventListener(SEEN_EVENT, bump);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return React.useMemo(() => readSeenMap(), [version]);
}

/** Collapsed project groups show the 5 most recent sessions (REQ-078). */
const PROJECT_COLLAPSED_COUNT = 5;

type RowAction = 'rename' | 'merge' | 'delete-confirm' | null;

function SessionRow({
  session,
  active,
  running,
  unread,
  action,
  onAction,
  onResume,
  onOpenAsPane,
  onFork,
  onSubmitRename,
  onCancelAction,
  mergeTargets,
  onSubmitMerge,
}: {
  session: SessionSummary;
  active: boolean;
  /** REQ-121: live agent run — the ONLY "active-looking" state. */
  running: boolean;
  /** REQ-121: activity newer than the last open. */
  unread: boolean;
  action: RowAction;
  onAction: (a: Exclude<RowAction, null>) => void;
  onResume: () => void;
  onOpenAsPane: () => void;
  onFork: () => void;
  onSubmitRename: (title: string) => void;
  onCancelAction: () => void;
  mergeTargets: SessionSummary[];
  onSubmitMerge: (intoId: string) => void;
}) {
  const [draft, setDraft] = React.useState(displayTitle(session));
  const [mergeInto, setMergeInto] = React.useState(mergeTargets[0]?.id ?? '');
  // REQ-024 — mobile single-view has no pane system: rows are not
  // draggable and the "open as pane" affordance below stays hidden.
  const isMobile = useIsMobile();
  React.useEffect(() => {
    setDraft(displayTitle(session));
    setMergeInto(mergeTargets[0]?.id ?? '');
  }, [session, mergeTargets]);

  const title = displayTitle(session);
  // REQ-055 — the inline `5m` badge is gone from the row; the duration
  // (full relative string + compact token) lives inside the kebab menu.
  const badge = activityBadge(session.updatedAt);
  const [menuOpen, setMenuOpen] = React.useState(false);
  // REQ-056 — right-click opens the same kebab menu at the cursor
  // (fixed position); the ... button keeps the anchored dropdown.
  const [menuAt, setMenuAt] = React.useState<{ x: number; y: number } | null>(null);
  const rowRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);
  React.useEffect(() => {
    if (!menuOpen) setMenuAt(null);
  }, [menuOpen]);
  const closeMenu = React.useCallback(() => setMenuOpen(false), []);

  return (
    <div
      ref={rowRef}
      draggable={!isMobile}
      onDragStart={(e) => {
        if (isMobileViewport()) return;
        e.dataTransfer.setData('application/x-lokma-session', session.id);
        e.dataTransfer.setData('text/plain', title);
        e.dataTransfer.effectAllowed = 'copy';
        // REQ-005: the drop target only exists in tiling mode — enable it so
        // the drag always has somewhere to land.
        const pane = usePaneStore.getState();
        if (!pane.tiling) {
          pane.setTiling(true);
          emitToast('Tiling workspace enabled — drop the session into a pane');
        }
      }}
      title={`Drag into a tiling pane (open, split, fork, merge) — ${session.id}`}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuAt({ x: e.clientX, y: e.clientY });
        setMenuOpen(true);
      }}
      // REQ-106 — plain rows, no boxes: hover tint + active tint only.
      // REQ-121 — fully transparent idle rows (hover barely tints); the
      // terracotta wash + top sweep bar render ONLY while running. An open
      // but idle session looks like any other row (no fake "active").
      // REQ-127 — the row paints NOTHING of its own, so it sits flush on the
      // sidebar in every theme. The hover tint is spelled per-theme (ink 5%
      // on light, warm white 6% on dark) instead of `hover:bg-muted/40`,
      // whose dark value resolved to a 40% near-white flash.
      className={cn(
        'group relative transition cursor-grab active:cursor-grabbing',
        running
          ? 'bg-terracotta/10'
          : 'bg-transparent hover:bg-[rgba(38,38,36,0.05)] dark:hover:bg-[rgba(237,233,226,0.06)]',
      )}
    >
      {running ? (
        <span className="absolute inset-x-1 top-0 h-[2px] overflow-hidden rounded-full" aria-hidden="true">
          <span className="lokma-scanbar block h-full w-1/5 bg-gradient-to-r from-transparent via-[#C96442] to-transparent" />
        </span>
      ) : null}
      {/* REQ-051 — compact single-line row: tighter padding, the title
          flexes and truncates to whatever width is left, and the m/h/d
          badge pins to the right of it. */}
      <div className="flex items-center gap-1.5 px-2 py-1">
        <span
          title={running ? 'Agent working' : unread ? 'New activity' : active ? 'Open session' : 'Idle'}
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            running
              ? 'bg-terracotta animate-pulse'
              : unread
                ? 'bg-green-500'
                : 'bg-zinc-300 dark:bg-zinc-600',
          )}
        />
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onResume}>
          <div
            className={cn('text-xs truncate pr-1', unread && !running ? 'font-semibold' : 'font-medium')}
            title={title}
          >
            {title}
          </div>
        </div>
        {/* REQ-055 — kebab menu: the inline badge is gone; duration info
            (full relative string + compact token) lives in the menu header,
            row actions move into the menu. Always visible (no hover-only). */}
        <div className="relative shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Session actions"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Session actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="w-3 h-3" />
          </Button>
          {menuOpen ? (
            <div
              role="menu"
              aria-label="Session actions menu"
              style={
                menuAt
                  ? {
                      left: Math.max(4, Math.min(menuAt.x, window.innerWidth - 224)),
                      top: Math.max(4, Math.min(menuAt.y, window.innerHeight - 220)),
                    }
                  : undefined
              }
              className={
                menuAt
                  ? 'fixed z-[100] min-w-52 overflow-hidden rounded-md border border-line bg-white shadow-lg dark:bg-[#1E1E21]'
                  : 'absolute right-0 top-7 z-50 min-w-52 overflow-hidden rounded-md border border-line bg-white shadow-lg dark:bg-[#1E1E21]'
              }
            >
              <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-line/60 text-[11px] text-zinc-500 dark:text-zinc-400">
                <Clock className="w-3 h-3 shrink-0" />
                <span className="truncate" title={session.id}>
                  {relativeTime(session.updatedAt) || 'No activity yet'}
                </span>
                {badge ? (
                  <span className="ml-auto shrink-0 rounded bg-zinc-100 px-1 py-px text-[10px] tabular-nums text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {badge}
                  </span>
                ) : null}
              </div>
              {isMobile ? null : (
                <button
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  onClick={() => {
                    closeMenu();
                    onOpenAsPane();
                  }}
                >
                  <Columns2 className="w-3 h-3 shrink-0" /> Open as pane tab
                </button>
              )}
              <button
                role="menuitem"
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => {
                  closeMenu();
                  onAction('rename');
                }}
              >
                <Pencil className="w-3 h-3 shrink-0" /> Rename
              </button>
              <button
                role="menuitem"
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => {
                  closeMenu();
                  onAction('merge');
                }}
              >
                <GitMerge className="w-3 h-3 shrink-0" /> Merge into another session
              </button>
              <button
                role="menuitem"
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => {
                  closeMenu();
                  onFork();
                }}
              >
                <GitFork className="w-3 h-3 shrink-0" /> Fork session
              </button>
              <button
                role="menuitem"
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                onClick={() => {
                  closeMenu();
                  onAction('delete-confirm');
                }}
              >
                <Trash2 className="w-3 h-3 shrink-0" /> Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {action === 'rename' ? (
        <form
          className="flex items-center gap-1 px-2 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitRename(draft);
          }}
        >
          <Input
            autoFocus
            value={draft}
            maxLength={120}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCancelAction();
            }}
            className="h-7 text-xs"
            aria-label="Session title"
          />
          <Button variant="default" size="icon" className="h-7 w-7 shrink-0" title="Save" aria-label="Save">
            <Check className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="Cancel"
            onClick={onCancelAction}
            type="button"
           aria-label="Cancel">
            <X className="w-3 h-3" />
          </Button>
        </form>
      ) : null}

      {action === 'merge' ? (
        <form
          className="space-y-1.5 px-2 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (mergeInto) onSubmitMerge(mergeInto);
          }}
        >
          <div className="text-[11px] text-zinc-500">
            Append this transcript into… (source is kept)
          </div>
          {mergeTargets.length === 0 ? (
            <div className="text-[11px] text-zinc-400">No other session to merge into.</div>
          ) : (
            <div className="flex items-center gap-1">
              <select
                value={mergeInto}
                onChange={(e) => setMergeInto(e.target.value)}
                className="h-7 flex-1 min-w-0 rounded-md border border-line bg-white dark:bg-[#1E1E21] px-2 text-xs"
                aria-label="Merge target session"
              >
                {mergeTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {displayTitle(t)}
                  </option>
                ))}
              </select>
              <Button
                variant="default"
                size="sm"
                className="h-7 text-xs shrink-0"
                disabled={!mergeInto}
              >
                Merge
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                title="Cancel"
                type="button"
                onClick={onCancelAction}
               aria-label="Cancel">
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}
        </form>
      ) : null}

      {action === 'delete-confirm' ? (
        <div className="flex items-center gap-1 px-2 pb-2">
          <span className="text-[11px] text-red-600 flex-1">Delete this session?</span>
          <DeleteConfirmButtons sessionId={session.id} onDone={onCancelAction} />
        </div>
      ) : null}
    </div>
  );
}

/** Delete confirm lives in its own component so it can use the store hook. */
function DeleteConfirmButtons({ sessionId, onDone }: { sessionId: string; onDone: () => void }) {
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const [busy, setBusy] = React.useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[11px]"
        disabled={busy}
        onClick={onDone}
      >
        Keep
      </Button>
      <Button
        variant="default"
        size="sm"
        className="h-6 text-[11px] bg-red-600 hover:bg-red-700"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void deleteSession(sessionId).then((ok) => {
            emitToast(ok ? 'Session deleted' : 'Delete failed — see sidebar error');
            onDone();
          });
        }}
      >
        Delete
      </Button>
    </>
  );
}

/**
 * ProjectGroup (REQ-078) — one cwd group in "By project" mode. Collapsed
 * shows the 5 most recent sessions; the name toggles expand (all sessions).
 * Far right `+` opens a new session in the project's cwd; `...` left of it
 * holds project actions (new session here, copy cwd, delete ALL sessions in
 * this project with confirm). NOTE: a group is a cwd grouping, NOT an
 * AuthProject entity — the menu never deletes project entities.
 */
function ProjectGroup({
  label,
  items,
  expanded,
  activeId,
  openAction,
  sessions,
  onToggle,
  onNewSession,
  onDeleteProject,
  onDeleteEntity,
  rowProps,
}: {
  label: string;
  items: SessionSummary[];
  expanded: boolean;
  activeId: string;
  openAction: { id: string; action: RowAction } | null;
  sessions: SessionSummary[];
  onToggle: () => void;
  onNewSession: () => void;
  onDeleteProject: () => void;
  /** REQ-080: entity delete (project records only — cwd groups pass nothing). */
  onDeleteEntity?: () => void;
  rowProps: (s: SessionSummary) => {
    onAction: (a: Exclude<RowAction, null>) => void;
    onResume: () => void;
    onOpenAsPane: () => void;
    onFork: () => void;
    onSubmitRename: (title: string) => void;
    onCancelAction: () => void;
    onSubmitMerge: (intoId: string) => void;
  };
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  // REQ-121: read/unread dots need the seen-map live in every group.
  const seen = useSeenMap();
  React.useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);
  const cwd = items[0]?.cwd || '';
  const visible = expanded ? items : items.slice(0, PROJECT_COLLAPSED_COUNT);
  return (
    <div>
      <div className="px-1 py-1 text-[10px] font-semibold tracking-widest uppercase text-zinc-400 flex items-center gap-1">
        <button
          className="min-w-0 flex-1 truncate text-left hover:text-terracotta flex items-center gap-0.5"
          onClick={onToggle}
          title={expanded ? 'Collapse — show recent 5' : `Show all ${items.length} sessions in ${label}`}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />} {label}
        </button>
        <span className="text-[10px] font-normal normal-case tracking-normal shrink-0">
          {items.length}
        </span>
        <div className="relative shrink-0" ref={menuRef}>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Project actions"
            onClick={() => {
              setConfirmingDelete(false);
              setMenuOpen((v) => !v);
            }}
            aria-label={`Project actions for ${label}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="w-3 h-3" />
          </Button>
          {menuOpen ? (
            <div
              role="menu"
              aria-label={`Project actions for ${label}`}
              className="absolute right-0 top-7 z-50 min-w-52 overflow-hidden rounded-md border border-line bg-white shadow-lg dark:bg-[#1E1E21]"
            >
              <button
                role="menuitem"
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => {
                  setMenuOpen(false);
                  onNewSession();
                }}
              >
                <Plus className="w-3 h-3 shrink-0" /> New session here
              </button>
              <button
                role="menuitem"
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
                onClick={() => {
                  setMenuOpen(false);
                  try {
                    void navigator.clipboard.writeText(cwd);
                    emitToast('Project path copied');
                  } catch {
                    emitToast('Copy failed');
                  }
                }}
              >
                <Check className="w-3 h-3 shrink-0" /> Copy project path
              </button>
              {confirmingDelete ? (
                <div className="flex items-center gap-1 px-2.5 py-1.5">
                  <span className="text-[11px] text-red-600 flex-1">Delete all {items.length}?</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px]"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Keep
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-6 text-[11px] bg-red-600 hover:bg-red-700"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmingDelete(false);
                      onDeleteProject();
                    }}
                  >
                    Delete
                  </Button>
                </div>
              ) : (
                <>
                  <button
                    role="menuitem"
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2 className="w-3 h-3 shrink-0" /> Delete all sessions…
                  </button>
                  {onDeleteEntity ? (
                    <button
                      role="menuitem"
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      onClick={() => {
                        setMenuOpen(false);
                        onDeleteEntity();
                      }}
                    >
                      <Trash2 className="w-3 h-3 shrink-0" /> Delete project
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          title={`New session in ${label}`}
          onClick={onNewSession}
          aria-label={`New session in ${label}`}
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>
      <div className="divide-y divide-line/50">
        {visible.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            active={s.id === activeId}
            running={!!s.running}
            unread={isSessionUnread(s.updatedAt, seen[s.id])}
            action={openAction?.id === s.id ? openAction.action : null}
            mergeTargets={sessions.filter((t) => t.id !== s.id)}
            {...rowProps(s)}
          />
        ))}
      </div>
      {!expanded && items.length > PROJECT_COLLAPSED_COUNT ? (
        <button
          className="mt-0.5 w-full text-center text-[11px] text-zinc-400 underline underline-offset-2 hover:text-terracotta"
          onClick={onToggle}
        >
          +{items.length - PROJECT_COLLAPSED_COUNT} more
        </button>
      ) : null}
    </div>
  );
}

export function SessionsSidebar({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const sessions = useSessionStore((s) => s.sessions);
  const loading = useSessionStore((s) => s.loading);
  const lastError = useSessionStore((s) => s.lastError);
  const refreshSessions = useSessionStore((s) => s.refreshSessions);
  const refreshSessionsQuiet = useSessionStore((s) => s.refreshSessionsQuiet);
  const createSession = useSessionStore((s) => s.createSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const forkSession = useSessionStore((s) => s.forkSession);
  const renameSession = useSessionStore((s) => s.renameSession);
  const mergeSessions = useSessionStore((s) => s.mergeSessions);

  const [query, setQuery] = React.useState('');
  const [groupBy, setGroupBy] = React.useState<'time' | 'project'>('time');
  const [openAction, setOpenAction] = React.useState<{ id: string; action: RowAction } | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  // REQ-121: read/unread dots + live run flags. Seed once per list (old
  // rows grandfather as read), then poll quietly for runs/ordering.
  const seen = useSeenMap();
  React.useEffect(() => {
    if (sessions.length) seedSeenMap(sessions.map((s) => s.id));
  }, [sessions.length]);
  React.useEffect(() => {
    const t = window.setInterval(() => void refreshSessionsQuiet(), 4000);
    return () => window.clearInterval(t);
  }, [refreshSessionsQuiet]);
  const [expandedProjects, setExpandedProjects] = React.useState<Set<string>>(new Set());
  const [creatingProjectCwd, setCreatingProjectCwd] = React.useState<string | null>(null);
  // REQ-080 — project records (visible even with zero sessions) + modal.
  // Replaces the REQ-058 inline form (its silent failures read as "does
  // nothing" — the modal surfaces the server error instead).
  const [showProjectModal, setShowProjectModal] = React.useState(false);
  // REQ-058 — visible "New Project" affordance in the Explorer header:
  // inline name + cwd + visibility form over POST /api/projects.
  // REQ-080: project records live in the session store (refreshed with the
  // session list) so they render even with zero sessions; the retired
  // inline form's loadProjects lives on the store as refreshProjects.
  const projects = useSessionStore((s) => s.projects);
  const refreshProjects = useSessionStore((s) => s.refreshProjects);

  // REQ-080 — the modal reports the new project: refresh the list, then
  // open its first session so it is usable at once. REQ-087: ALWAYS create
  // the session — the old `if (project.cwd)` guard skipped cwd-less
  // projects entirely (server projects may legally have an empty cwd),
  // and the server defaults those sessions to its working dir.
  const handleProjectCreated = React.useCallback((project: { id: string; name: string; cwd: string }) => {
    void refreshProjects();
    const cwd = project.cwd?.trim() ? project.cwd.trim() : undefined;
    void createSession(cwd ? { cwd } : {}).then((id) => {
      if (id) onSelect(id);
      else emitToast('Project created, but the session failed — is the server up?');
    });
  }, [createSession, refreshProjects, onSelect]);

  // REQ-080 — delete the project record (entity), then refresh the list.
  const handleDeleteEntity = React.useCallback((id: string, name: string) => {
    void api
      .deleteProject(id)
      .then(() => {
        emitToast(`Project "${name}" deleted`);
        void refreshProjects();
      })
      .catch((e: unknown) => {
        emitToast(e instanceof Error ? e.message : 'Project delete failed');
      });
  }, [refreshProjects]);

  React.useEffect(() => {
    setShowAll(false);
    setOpenAction(null);
    setExpandedProjects(new Set());
  }, [query, groupBy]);

  const filtered = React.useMemo(() => filterSessions(sessions, query), [sessions, query]);
  const groups = React.useMemo(() => groupSessions(filtered, groupBy), [filtered, groupBy]);
  const totalShown = showAll ? filtered.length : Math.min(filtered.length, RENDER_CAP);

  const handleCreate = React.useCallback(() => {
    setCreating(true);
    void createSession().then((id) => {
      setCreating(false);
      if (id) {
        onSelect(id);
        emitToast('New session created');
      } else {
        emitToast('Create failed — is the server up?');
      }
    });
  }, [createSession, onSelect]);

  const handleFork = React.useCallback(
    (id: string) => {
      void forkSession(id).then((newId) => {
        if (newId) {
          onSelect(newId);
          emitToast('Session forked');
        } else {
          emitToast('Fork failed — is the server up?');
        }
      });
    },
    [forkSession, onSelect],
  );

  // REQ-078 — new session inside a project group (same cwd as the group).
  const handleCreateInProject = React.useCallback((cwd: string) => {
    if (!cwd || creatingProjectCwd) return;
    setCreatingProjectCwd(cwd);
    void createSession({ cwd }).then((id) => {
      setCreatingProjectCwd(null);
      if (id) {
        onSelect(id);
        emitToast('New session created');
      } else {
        emitToast('Create failed — is the server up?');
      }
    });
  }, [createSession, creatingProjectCwd, onSelect]);

  // REQ-078 — delete every session in a project group (confirmed in the
  // group menu first). Sequential so the store refresh settles per row.
  const handleDeleteProject = React.useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    void (async () => {
      let ok = 0;
      for (const id of ids) {
        try {
          if (await deleteSession(id)) ok++;
        } catch {
          // Keep going — report the count at the end.
        }
      }
      emitToast(ok === ids.length ? `${ok} sessions deleted` : `${ok}/${ids.length} deleted`);
      void refreshSessions();
    })();
  }, [deleteSession, refreshSessions]);
  // Shared SessionRow props for both group modes (REQ-078 reuses them in
  // ProjectGroup so rows behave identically collapsed/expanded/by-time).
  const handleOpenAsPane = React.useCallback((s: SessionSummary) => {
    if (isMobileViewport()) return;
    const pane = usePaneStore.getState();
    if (!pane.tiling) {
      pane.setTiling(true);
      emitToast('Tiling workspace enabled — session opened as a pane tab');
    }
    pane.requestSessionTab(s.id, displayTitle(s));
  }, []);

  // Shared SessionRow props for both group modes (REQ-078 reuses them in
  // ProjectGroup so rows behave identically collapsed/expanded/by-time).
  const makeRowProps = React.useCallback((s: SessionSummary) => ({
    onAction: (a: Exclude<RowAction, null>) => setOpenAction({ id: s.id, action: a }),
    onResume: () => {
      markSessionSeen(s.id);
      onSelect(s.id);
    },
    onOpenAsPane: () => handleOpenAsPane(s),
    onFork: () => handleFork(s.id),
    onSubmitRename: (title: string) => {
      const trimmed = title.trim();
      if (!trimmed || trimmed === displayTitle(s)) {
        setOpenAction(null);
        return;
      }
      void renameSession(s.id, trimmed).then((ok) => {
        emitToast(ok ? 'Session renamed' : 'Rename failed');
        setOpenAction(null);
      });
    },
    onCancelAction: () => setOpenAction(null),
    onSubmitMerge: (intoId: string) => {
      void mergeSessions(intoId, s.id).then((appended) => {
        emitToast(
          appended !== null
            ? `Merged ${appended} message${appended === 1 ? '' : 's'}`
            : 'Merge failed',
        );
        setOpenAction(null);
        if (appended !== null) onSelect(intoId);
      });
    },
  }), [handleFork, handleOpenAsPane, mergeSessions, onSelect, renameSession]);

  const toggleProject = React.useCallback((key: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="px-2 py-2 border-b border-line/50 space-y-2">
        <Button
          variant="default"
          size="sm"
          className="w-full h-7 text-xs gap-1.5 justify-center bg-terracotta text-white hover:bg-terracotta-hover"
          onClick={handleCreate}
          disabled={creating}
        >
          <Plus className="w-3 h-3" /> {creating ? 'Creating…' : 'New Session'}
        </Button>
        {/* REQ-080 — New Project opens the Settings-style modal (the
            retired inline form's silent failures read as "does nothing"). */}
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs gap-1.5 justify-center"
          onClick={() => setShowProjectModal(true)}
          aria-label="New project"
          title="Create a new project (name + working directory)"
        >
          <FolderPlus className="w-3 h-3" /> New Project
        </Button>
        <ProjectModal
          open={showProjectModal}
          onClose={() => setShowProjectModal(false)}
          onCreated={handleProjectCreated}
        />
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
            <Input
              placeholder="Search sessions..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-7 h-7 text-xs"
              aria-label="Search sessions"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setGroupBy(groupBy === 'time' ? 'project' : 'time')}
            title={groupBy === 'time' ? 'Group by project' : 'Group by time'}
           aria-label={groupBy === 'time' ? 'Group by project' : 'Group by time'}>
            <LayoutGrid className="w-3 h-3" />
          </Button>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-zinc-500">
          <Clock className="w-3 h-3" />
          {groupBy === 'time' ? 'Today / Yesterday / Earlier' : 'By project'} · {filtered.length}{' '}
          session{filtered.length === 1 ? '' : 's'}
          <button
            className="ml-auto underline underline-offset-2 hover:text-terracotta"
            onClick={() => void refreshSessions()}
            title="Reload from server"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-3">
        {loading && sessions.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-400">Loading sessions…</div>
        ) : null}
        {lastError ? (
          <div className="p-2 rounded-md border border-red-200 bg-red-50 text-[11px] text-red-700">
            {lastError}
          </div>
        ) : null}
        {projects.length > 0 ? (
          <div>
            <div className="px-1 py-1 text-[10px] font-semibold tracking-widest uppercase text-zinc-400 flex items-center gap-1">
              Projects
              <span className="ml-auto text-[10px] font-normal normal-case tracking-normal">
                {projects.length}
              </span>
            </div>
            {projects.map((p) => {
              // REQ-087: tolerant cwd match — a session whose stored cwd has
              // a trailing slash still belongs to this project entity.
              const inProject = sessions.filter((s) => sameCwd(s.cwd, p.cwd));
              return (
                <ProjectGroup
                  key={p.id}
                  label={p.name}
                  items={inProject}
                  expanded={expandedProjects.has(`entity:${p.id}`)}
                  activeId={activeId}
                  openAction={openAction}
                  sessions={sessions}
                  onToggle={() => toggleProject(`entity:${p.id}`)}
                  onNewSession={() => {
                    if (p.cwd) handleCreateInProject(p.cwd);
                    else emitToast('Project has no working directory');
                  }}
                  onDeleteProject={() => handleDeleteProject(inProject.map((s) => s.id))}
                  onDeleteEntity={() => handleDeleteEntity(p.id, p.name)}
                  rowProps={makeRowProps}
                />
              );
            })}
          </div>
        ) : null}
        {groups.map(({ key, label, items }) =>
          groupBy === 'project' ? (
            <ProjectGroup
              key={key}
              label={label}
              items={items}
              expanded={expandedProjects.has(key)}
              activeId={activeId}
              openAction={openAction}
              sessions={sessions}
              onToggle={() => toggleProject(key)}
              onNewSession={() => {
                const cwd = items[0]?.cwd || '';
                if (cwd) handleCreateInProject(cwd);
                else emitToast('Project has no working directory');
              }}
              onDeleteProject={() => handleDeleteProject(items.map((s) => s.id))}
              rowProps={makeRowProps}
            />
          ) : (
          <div key={key}>
            <div className="px-1 py-1 text-[10px] font-semibold tracking-widest uppercase text-zinc-400 flex items-center gap-1">
              {label}
              <span className="ml-auto text-[10px] font-normal normal-case tracking-normal">
                {items.length}
              </span>
            </div>
            <div className="divide-y divide-line/50">
              {items.slice(0, showAll ? items.length : RENDER_CAP).map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  active={s.id === activeId}
                  running={!!s.running}
                  unread={isSessionUnread(s.updatedAt, seen[s.id])}
                  action={openAction?.id === s.id ? openAction.action : null}
                  mergeTargets={sessions.filter((t) => t.id !== s.id)}
                  {...makeRowProps(s)}
                />
              ))}
            </div>
          </div>
          ),
        )}
        {filtered.length === 0 && !(loading && sessions.length === 0) ? (
          <div className="p-4 text-center text-xs text-zinc-400">
            {query ? 'No matching sessions' : 'No sessions yet — create one above.'}
          </div>
        ) : null}
        {!showAll && filtered.length > RENDER_CAP ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() => setShowAll(true)}
          >
            Show all {filtered.length} ({totalShown} shown)
          </Button>
        ) : null}
        {/* Fork shortcut row: double-click a title forks; single click resumes. */}
        <ForkHint onFork={() => handleFork(activeId)} />
      </div>
    </div>
  );
}

/** Small footer hint exposing fork for the open session (real POST /fork). */
function ForkHint({ onFork }: { onFork: () => void }) {
  return (
    <div className="px-1 pb-1">
      <button
        onClick={onFork}
        className="w-full flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-terracotta transition"
        title="Fork the open session (copies transcript to a new session)"
      >
        <GitFork className="w-3 h-3" /> Fork open session
      </button>
    </div>
  );
}
