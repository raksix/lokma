import * as React from 'react';
import { Bot, ChevronUp, Folder, FolderOpen, FolderPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, type FsListRes, type ProjectVisibility } from '@/lib/api';
import { emitToast, useFocusTrap } from '@/components/shell';
import { emptyProjectForm, suggestProjectCwd, suggestProjectName, validateProjectForm } from '../auth/auth';

/**
 * ProjectModal (REQ-080) — Settings-style centered modal for creating a
 * project (name + working directory + visibility). Replaces the inline
 * Explorer form: same `POST /api/projects` call, but impossible to miss
 * and with the server error surfaced in the modal (the inline form's
 * failures looked like "nothing happens").
 *
 * REQ-182 adds `mode: 'agent-open'`: the agent already created the record
 * via the open_project tool, so the modal opens as a confirmation with the
 * locked values — its answer resolves the agent's wait ('done' on Open,
 * 'cancelled' on dismiss) and it NEVER re-POSTs (a second record would be
 * born). One component, two purposes (DRY).
 */
export type ProjectModalMode = 'create' | 'agent-open';

export function ProjectModal({
  open,
  onClose,
  onCreated,
  mode = 'create',
  agentValue = null,
  onResolve,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired with the new project so the caller refreshes + opens a session. */
  onCreated?: (project: { id: string; name: string; cwd: string }) => void;
  /** REQ-182: 'create' posts a new record; 'agent-open' confirms an existing one. */
  mode?: ProjectModalMode;
  /** REQ-182 (agent-open): the values the agent already created — locked. */
  agentValue?: { name: string; cwd: string } | null;
  /** REQ-182 (agent-open): the user's answer — fired exactly once per open. */
  onResolve?: (outcome: 'done' | 'cancelled') => void;
}) {
  const agentOpen = mode === 'agent-open';
  // REQ-182: agent-open seeds from PRIMITIVE fields, so a caller handing a
  // fresh object identity every render never re-seeds the form mid-open.
  const agentName = agentValue?.name ?? '';
  const agentCwd = agentValue?.cwd ?? '';
  // The seed is RENDER-time (a lazy initializer, not just the effect below),
  // so the first paint already carries the agent's values.
  const [form, setForm] = React.useState(() =>
    agentOpen ? { ...emptyProjectForm, name: agentName, cwd: agentCwd } : { ...emptyProjectForm },
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // REQ-084 folder picker — server directory browser (dirs only, dot-entries hidden).
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerData, setPickerData] = React.useState<FsListRes | null>(null);
  const [pickerBusy, setPickerBusy] = React.useState(false);
  const [pickerError, setPickerError] = React.useState<string | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef, { onEscape: onClose });

  React.useEffect(() => {
    if (!open) return;
    setForm(
      agentOpen
        ? { ...emptyProjectForm, name: agentName, cwd: agentCwd }
        : { ...emptyProjectForm },
    );
    setError(null);
    setPickerOpen(false);
    setPickerData(null);
    setPickerError(null);
  }, [open, agentOpen, agentName, agentCwd]);

  const loadDir = React.useCallback((path?: string) => {
    setPickerBusy(true);
    setPickerError(null);
    api
      .listDirs(path)
      .then((res) => setPickerData(res))
      .catch((e: unknown) => {
        setPickerError(e instanceof Error ? e.message : 'Could not list folders');
      })
      .finally(() => {
        setPickerBusy(false);
      });
  }, []);

  const openPicker = () => {
    // Start where the user already typed, fall back to the server home.
    const typed = form.cwd.trim();
    setPickerOpen(true);
    loadDir(typed ? typed : undefined);
  };

  if (!open) return null;

  const submit = async () => {
    // REQ-182: the record already exists (the agent created it before the
    // frame shipped) — the confirmation only answers its wait. Never POST
    // again: a second record would be born.
    if (agentOpen) {
      onResolve?.('done');
      return;
    }
    const problem = validateProjectForm(form);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const cwd = form.cwd.trim();
      const res = await api.createProject({
        name: form.name.trim(),
        ...(cwd ? { cwd } : {}),
        visibility: form.visibility as ProjectVisibility,
      });
      emitToast(`Project "${res.project.name}" created`);
      onCreated?.(res.project);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Project create failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={agentOpen ? 'Open project' : 'New project'}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md overflow-hidden rounded-xl border border-line bg-white shadow-2xl dark:bg-[#1E1E21]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5">
          {agentOpen ? (
            <FolderOpen className="h-4 w-4 text-terracotta" />
          ) : (
            <FolderPlus className="h-4 w-4 text-terracotta" />
          )}
          <span className="text-sm font-semibold">{agentOpen ? 'Open project' : 'New project'}</span>
          <button
            type="button"
            onClick={onClose}
            data-autofocus={agentOpen ? undefined : true}
            aria-label={agentOpen ? 'Dismiss the agent-opened project' : 'Close new project'}
            className="ml-auto grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-2.5 p-4">
          {/* REQ-182: WHO opened this is the first thing the modal says —
              the agent already created the record, the user only confirms
              (or dismisses) and never re-fills a form. */}
          {agentOpen ? (
            <div
              className="flex items-center gap-2 rounded-md border border-line bg-muted/40 px-2.5 py-1.5 text-[11px] text-zinc-500"
              data-agent-open-banner=""
            >
              <Bot className="h-3.5 w-3.5 shrink-0 text-terracotta" />
              <span>Agent is opening this project</span>
            </div>
          ) : null}
          <div>
            <label htmlFor="project-name" className="mb-1 block text-[11px] font-medium text-zinc-500">
              Project name
            </label>
            <Input
              id="project-name"
              value={form.name}
              maxLength={60}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => {
                  // REQ-088: name typed while cwd is empty -> propose a server path.
                  // A filled cwd is never overwritten.
                  if (f.cwd.trim() !== '') return { ...f, name };
                  const proposal = suggestProjectCwd(name);
                  return { ...f, name, cwd: proposal ? proposal : f.cwd };
                });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
                if (e.key === 'Escape') onClose();
              }}
              placeholder="My project"
              className={agentOpen ? 'h-8 text-sm bg-muted/40 text-zinc-500' : 'h-8 text-sm'}
              readOnly={agentOpen}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="project-cwd" className="mb-1 block text-[11px] font-medium text-zinc-500">
              Working directory
            </label>
            <div className="flex gap-1.5">
              <Input
                id="project-cwd"
                value={form.cwd}
                maxLength={500}
                onChange={(e) => {
                  const cwd = e.target.value;
                  setForm((f) => {
                    // REQ-088: cwd typed while name is empty -> derive the name
                    // from the last path segment. A filled name is never overwritten.
                    if (f.name.trim() !== '') return { ...f, cwd };
                    const proposal = suggestProjectName(cwd);
                    return { ...f, cwd, name: proposal ? proposal : f.name };
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit();
                  if (e.key === 'Escape') onClose();
                }}
                placeholder="/mnt/apopic/my-project (created if missing)"
                className={agentOpen ? 'h-8 font-mono text-xs bg-muted/40 text-zinc-500' : 'h-8 font-mono text-xs'}
                readOnly={agentOpen}
              />
              {agentOpen ? null : (
                <Button
                  type="button"
                  variant="outline"
                  aria-label={pickerOpen ? 'Close folder browser' : 'Browse server folders'}
                  title="Browse server folders"
                  className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
                  onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Browse
                </Button>
              )}
            </div>
            {pickerOpen ? (
              <div className="mt-1.5 overflow-hidden rounded-md border border-line" aria-label="Folder browser">
                <div className="flex items-center gap-1 border-b border-line bg-muted/40 px-2 py-1.5">
                  <button
                    type="button"
                    aria-label="Go to home folder"
                    title="Home"
                    className="rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-muted"
                    onClick={() => loadDir(undefined)}
                  >
                    Home
                  </button>
                  <button
                    type="button"
                    aria-label="Go up one folder"
                    title="Up"
                    disabled={!pickerData || pickerData.parent === null}
                    className="grid h-6 w-6 place-items-center rounded text-zinc-500 hover:bg-muted disabled:opacity-40"
                    onClick={() => {
                      if (pickerData && pickerData.parent !== null) loadDir(pickerData.parent);
                    }}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <span className="truncate font-mono text-[11px] text-zinc-500" title={pickerData ? pickerData.path : ''}>
                    {pickerBusy && !pickerData ? 'Loading…' : pickerData ? pickerData.path : ''}
                  </span>
                </div>
                {pickerError ? (
                  <div className="px-2.5 py-2 text-xs text-red-600">{pickerError}</div>
                ) : (
                  <div className="max-h-44 overflow-y-auto py-1">
                    {pickerData && pickerData.entries.length === 0 && !pickerBusy ? (
                      <div className="px-2.5 py-2 text-xs text-zinc-500">No subfolders here</div>
                    ) : null}
                    {(pickerData ? pickerData.entries : []).map((entry) => (
                      <button
                        key={entry.path}
                        type="button"
                        title={entry.path}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                        onClick={() => loadDir(entry.path)}
                      >
                        <Folder className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <span className="truncate">{entry.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5 border-t border-line px-2 py-1.5">
                  <Button
                    type="button"
                    className="h-7 flex-1 text-xs"
                    disabled={!pickerData || pickerBusy}
                    onClick={() => {
                      if (pickerData) {
                        const picked = pickerData.path;
                        setForm((f) => {
                          // REQ-088: folder picked while name is empty -> derive it.
                          if (f.name.trim() !== '') return { ...f, cwd: picked };
                          const proposal = suggestProjectName(picked);
                          return { ...f, cwd: picked, name: proposal ? proposal : f.name };
                        });
                        setPickerOpen(false);
                      }
                    }}
                  >
                    Use this folder
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setPickerOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
                {pickerData && pickerData.truncated ? (
                  <div className="border-t border-line px-2.5 py-1 text-[11px] text-zinc-500">
                    Showing the first 500 folders — type the rest manually
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {agentOpen ? null : (
            <div>
              <label htmlFor="project-visibility" className="mb-1 block text-[11px] font-medium text-zinc-500">
                Visibility
              </label>
              <select
                id="project-visibility"
                value={form.visibility}
                onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value as 'private' | 'public' }))}
                className="h-8 w-full rounded-md border border-line bg-white px-2 text-sm dark:bg-[#1E1E21]"
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </div>
          )}
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
          <Button
            className="h-8 w-full text-sm"
            disabled={busy}
            data-autofocus={agentOpen ? true : undefined}
            onClick={() => void submit()}
          >
            {busy ? 'Creating…' : agentOpen ? 'Open project' : 'Create project'}
          </Button>
        </div>
      </div>
    </div>
  );
}
