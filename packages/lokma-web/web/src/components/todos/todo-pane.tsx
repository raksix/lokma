import * as React from 'react';
import { Check, ListTodo, Play, Plus, RefreshCw, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { INITIAL_PREFIX } from '@/components/chat';
import { ApiError, api, type AuthProject, type TodoView } from '@/lib/api';
import { groupLabel, groupTodos, holderLabel, leaseLabel, todoPrompt, validateTitle, type TodoGroup } from './todos';

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('lokma-toast', { detail: message }));
}

function errMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
}

/** Stable per-browser claim identity when the pane has no session of its own. */
function fallbackSessionId(): string {
  const key = 'lokma:todo-session';
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const fresh = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return `sess_${Date.now().toString(36)}`;
  }
}

const GROUP_ORDER: TodoGroup[] = ['open', 'mine', 'others', 'done'];

/**
 * TodoPane — the per-project todo board (REQ-062 Parça C, REQ-065,
 * Docs/36 §11). Open todos are claimed atomically (`claim_todo` behind
 * the button — a live чужой lease answers 409 + holder, never a silent
 * double-take); "Do with AI" mints a real session, claims the todo to
 * it, and stages the work prompt so the chat auto-sends on open
 * (REQ-057 `INITIAL_PREFIX` mechanism). Agents see the same board via
 * `list_todos` and keep their claims leased with per-turn heartbeats.
 */
export function TodoPane({
  sessionId,
  onOpenSession,
}: {
  sessionId?: string | null;
  onOpenSession?: (id: string) => void;
}) {
  const [projects, setProjects] = React.useState<AuthProject[]>([]);
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [todos, setTodos] = React.useState<TodoView[]>([]);
  const [title, setTitle] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const mine = sessionId ?? fallbackSessionId();

  const loadBoard = React.useCallback(async (pid: string) => {
    try {
      const res = await api.listTodos(pid);
      setTodos(res.todos);
      setError(null);
    } catch (e) {
      setError(errMessage(e));
    }
  }, []);

  React.useEffect(() => {
    void (async () => {
      try {
        const res = await api.listProjects();
        setProjects(res.projects);
        setProjectId((prev) => {
          if (prev && res.projects.some((p) => p.id === prev)) return prev;
          return res.projects[0]?.id ?? null;
        });
      } catch (e) {
        setError(errMessage(e));
      }
    })();
  }, []);

  React.useEffect(() => {
    if (projectId) void loadBoard(projectId);
    else setTodos([]);
  }, [projectId, loadBoard]);

  const refresh = () => {
    if (projectId) void loadBoard(projectId);
  };

  const doCreate = async () => {
    const problem = validateTitle(title);
    if (problem) {
      setError(problem);
      return;
    }
    if (!projectId) return;
    setBusy(true);
    try {
      await api.createTodo(projectId, { title: title.trim() });
      setTitle('');
      await loadBoard(projectId);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doClaim = async (todo: TodoView) => {
    if (!projectId) return;
    try {
      await api.claimTodo(projectId, todo.id, { sessionId: mine });
      toast(`Claimed: ${todo.title}`);
      await loadBoard(projectId);
    } catch (e) {
      // 409 carries the holder — name the session so the user knows who
      // to nudge instead of staring at a bare error code.
      const details = e instanceof ApiError ? (e.details as { holder?: { sessionId?: string } } | undefined) : undefined;
      const holder = details?.holder?.sessionId;
      setError(holder ? `${errMessage(e)} (held by ${holder})` : errMessage(e));
      await loadBoard(projectId);
    }
  };

  const doWithAI = async (todo: TodoView) => {
    if (!projectId) return;
    const project = projects.find((p) => p.id === projectId);
    try {
      const created = await api.createSession({});
      try {
        await api.claimTodo(projectId, todo.id, { sessionId: created.id });
      } catch (e) {
        // Already claimed elsewhere — still open the session, the model
        // reads the RED from list_todos and picks other work.
        toast(errMessage(e));
      }
      try {
        sessionStorage.setItem(`${INITIAL_PREFIX}${created.id}`, todoPrompt(todo, project?.name ?? projectId));
      } catch {
        // Non-browser runtimes have no sessionStorage — session still opens.
      }
      await loadBoard(projectId);
      if (onOpenSession) onOpenSession(created.id);
      else toast(`Session ${created.id} ready`);
    } catch (e) {
      setError(errMessage(e));
    }
  };

  const doComplete = async (todo: TodoView) => {
    if (!projectId) return;
    try {
      await api.completeTodo(projectId, todo.id, { sessionId: mine });
      await loadBoard(projectId);
    } catch (e) {
      setError(errMessage(e));
    }
  };

  const doRelease = async (todo: TodoView) => {
    if (!projectId) return;
    try {
      await api.releaseTodo(projectId, todo.id, { sessionId: mine });
      await loadBoard(projectId);
    } catch (e) {
      setError(errMessage(e));
    }
  };

  const doDelete = async (todo: TodoView) => {
    if (!projectId) return;
    try {
      await api.deleteTodo(projectId, todo.id);
      await loadBoard(projectId);
    } catch (e) {
      setError(errMessage(e));
    }
  };

  const groups = groupTodos(todos, mine);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <ListTodo className="w-3 h-3 text-emerald-600" />
        <span className="text-xs font-semibold">Todos</span>
        <span className="ml-1 text-[11px] text-zinc-400">{todos.length} total</span>
        <Button variant="ghost" size="sm" className="ml-auto h-5 text-[11px] gap-1" onClick={refresh}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-2">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">{error}</div>
        )}

        <div className="flex gap-1">
          <select
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value || null)}
            className="h-7 rounded-md border border-line bg-white dark:bg-[#1E1E21] text-xs px-2 flex-1"
            aria-label="Todo project"
          >
            {projects.length === 0 && <option value="">No projects</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-1">
          <Input
            placeholder="New todo — e.g. Migrate auth tokens"
            aria-label="New todo title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void doCreate();
            }}
            className="h-7 text-xs flex-1"
          />
          <Button size="sm" className="h-7 text-xs gap-1" disabled={busy || !projectId} onClick={() => void doCreate()}>
            <Plus className="w-3 h-3" /> Add
          </Button>
        </div>

        {GROUP_ORDER.map((group) => (
          <div key={group} className="rounded-lg border border-line overflow-hidden">
            <div className="h-6 flex items-center px-2.5 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line text-[11px] font-medium text-zinc-500">
              {groupLabel(group)}
              <span className="ml-1 text-zinc-400">{groups[group].length}</span>
            </div>
            {groups[group].length === 0 ? (
              <p className="px-2.5 py-2 text-[11px] text-zinc-400">Nothing here.</p>
            ) : (
              <div className="divide-y divide-line/50">
                {groups[group].map((todo) => (
                  <div key={todo.id} className="flex items-center gap-2 px-2.5 py-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{todo.title}</div>
                      <div className="text-[11px] text-zinc-400">
                        {todo.status === 'claimed' ? `${holderLabel(todo)} · ${leaseLabel(todo)}` : todo.status}
                      </div>
                    </div>
                    {group === 'open' && (
                      <>
                        <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => void doClaim(todo)}>
                          Claim
                        </Button>
                        {onOpenSession && (
                          <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={() => void doWithAI(todo)}>
                            <Play className="w-3 h-3" /> Do with AI
                          </Button>
                        )}
                      </>
                    )}
                    {(group === 'mine' || group === 'others') && (
                      <>
                        <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={() => void doComplete(todo)}>
                          <Check className="w-3 h-3" /> Done
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={() => void doRelease(todo)}>
                          <Undo2 className="w-3 h-3" /> Release
                        </Button>
                      </>
                    )}
                    {group === 'done' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] text-red-600 gap-1"
                        onClick={() => void doDelete(todo)}
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
