import * as React from 'react';
import {
  Check,
  Clock,
  GitFork,
  GitMerge,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { SessionSummary } from '@/lib/api';
import { useSessionStore } from '@/stores';
import { emitToast } from '@/components/shell';
import {
  displayTitle,
  filterSessions,
  groupSessions,
  messageCountLabel,
  relativeTime,
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

type RowAction = 'rename' | 'merge' | 'delete-confirm' | null;

function SessionRow({
  session,
  active,
  action,
  onAction,
  onResume,
  onSubmitRename,
  onCancelAction,
  mergeTargets,
  onSubmitMerge,
}: {
  session: SessionSummary;
  active: boolean;
  action: RowAction;
  onAction: (a: Exclude<RowAction, null>) => void;
  onResume: () => void;
  onSubmitRename: (title: string) => void;
  onCancelAction: () => void;
  mergeTargets: SessionSummary[];
  onSubmitMerge: (intoId: string) => void;
}) {
  const [draft, setDraft] = React.useState(displayTitle(session));
  const [mergeInto, setMergeInto] = React.useState(mergeTargets[0]?.id ?? '');
  React.useEffect(() => {
    setDraft(displayTitle(session));
    setMergeInto(mergeTargets[0]?.id ?? '');
  }, [session, mergeTargets]);

  const title = displayTitle(session);
  const model = (session.model ?? '').trim();

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-lokma-session', session.id);
        e.dataTransfer.setData('text/plain', title);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      title={`Drag into a tiling pane (open, split, fork, merge) — ${session.id}`}
      className={cn(
        'group rounded-md border bg-white dark:bg-[#1E1E21] transition cursor-grab active:cursor-grabbing',
        active
          ? 'border-terracotta/50 shadow-sm'
          : 'border-line hover:border-terracotta/30 hover:shadow-sm',
      )}
    >
      <div className="flex items-center gap-2 p-2">
        <span
          title={active ? 'Open session' : 'Idle'}
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            active ? 'bg-terracotta animate-pulse' : 'bg-zinc-300 dark:bg-zinc-600',
          )}
        />
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onResume}>
          <div className="text-xs font-medium truncate pr-1">{title}</div>
          <div className="flex items-center gap-1 mt-0.5">
            {model ? (
              <span className="px-1 py-0.5 rounded bg-muted border border-line text-[10px] truncate max-w-[140px]">
                {model}
              </span>
            ) : null}
            {typeof session.messageCount === 'number' ? (
              <span className="text-[11px] text-zinc-400">{messageCountLabel(session.messageCount)}</span>
            ) : null}
            {session.updatedAt ? (
              <span className="text-[11px] text-zinc-400">· {relativeTime(session.updatedAt)}</span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Rename"
            onClick={() => onAction('rename')}
           aria-label="Rename">
            <Pencil className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Merge into another session…"
            onClick={() => onAction('merge')}
           aria-label="Merge into another session…">
            <GitMerge className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:text-red-600"
            title="Delete"
            onClick={() => onAction('delete-confirm')}
           aria-label="Delete">
            <Trash2 className="w-3 h-3" />
          </Button>
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
  const createSession = useSessionStore((s) => s.createSession);
  const forkSession = useSessionStore((s) => s.forkSession);
  const renameSession = useSessionStore((s) => s.renameSession);
  const mergeSessions = useSessionStore((s) => s.mergeSessions);

  const [query, setQuery] = React.useState('');
  const [groupBy, setGroupBy] = React.useState<'time' | 'project'>('time');
  const [openAction, setOpenAction] = React.useState<{ id: string; action: RowAction } | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    setShowAll(false);
    setOpenAction(null);
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

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="px-2 py-2 border-b border-line/50 space-y-2">
        <Button
          variant="default"
          size="sm"
          className="w-full h-7 text-xs gap-1.5 justify-center"
          onClick={handleCreate}
          disabled={creating}
        >
          <Plus className="w-3 h-3" /> {creating ? 'Creating…' : 'New Session'}
        </Button>
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
        {groups.map(({ key, label, items }) => (
          <div key={key}>
            <div className="px-1 py-1 text-[10px] font-semibold tracking-widest uppercase text-zinc-400 flex items-center gap-1">
              {label}
              <span className="ml-auto text-[10px] font-normal normal-case tracking-normal">
                {items.length}
              </span>
            </div>
            <div className="space-y-1">
              {items.slice(0, showAll ? items.length : RENDER_CAP).map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  active={s.id === activeId}
                  action={openAction?.id === s.id ? openAction.action : null}
                  onAction={(a) => setOpenAction({ id: s.id, action: a })}
                  onResume={() => onSelect(s.id)}
                  onSubmitRename={(title) => {
                    const trimmed = title.trim();
                    if (!trimmed || trimmed === displayTitle(s)) {
                      setOpenAction(null);
                      return;
                    }
                    void renameSession(s.id, trimmed).then((ok) => {
                      emitToast(ok ? 'Session renamed' : 'Rename failed');
                      setOpenAction(null);
                    });
                  }}
                  onCancelAction={() => setOpenAction(null)}
                  mergeTargets={sessions.filter((t) => t.id !== s.id)}
                  onSubmitMerge={(intoId) => {
                    void mergeSessions(intoId, s.id).then((appended) => {
                      emitToast(
                        appended !== null
                          ? `Merged ${appended} message${appended === 1 ? '' : 's'}`
                          : 'Merge failed',
                      );
                      setOpenAction(null);
                      if (appended !== null) onSelect(intoId);
                    });
                  }}
                />
              ))}
            </div>
          </div>
        ))}
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
