import * as React from 'react';
import { FolderPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, type ProjectVisibility } from '@/lib/api';
import { emitToast, useFocusTrap } from '@/components/shell';
import { emptyProjectForm, validateProjectForm } from '../auth/auth';

/**
 * ProjectModal (REQ-080) — Settings-style centered modal for creating a
 * project (name + working directory + visibility). Replaces the inline
 * Explorer form: same `POST /api/projects` call, but impossible to miss
 * and with the server error surfaced in the modal (the inline form's
 * failures looked like "nothing happens").
 */
export function ProjectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired with the new project so the caller refreshes + opens a session. */
  onCreated: (project: { id: string; name: string; cwd: string }) => void;
}) {
  const [form, setForm] = React.useState({ ...emptyProjectForm });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef, { onEscape: onClose });

  React.useEffect(() => {
    if (!open) return;
    setForm({ ...emptyProjectForm });
    setError(null);
  }, [open ]);

  if (!open) return null;

  const submit = async () => {
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
      onCreated(res.project);
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
      aria-label="New project"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md overflow-hidden rounded-xl border border-line bg-white shadow-2xl dark:bg-[#1E1E21]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5">
          <FolderPlus className="h-4 w-4 text-terracotta" />
          <span className="text-sm font-semibold">New project</span>
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            aria-label="Close new project"
            className="ml-auto grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-2.5 p-4">
          <div>
            <label htmlFor="project-name" className="mb-1 block text-[11px] font-medium text-zinc-500">
              Project name
            </label>
            <Input
              id="project-name"
              value={form.name}
              maxLength={60}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
                if (e.key === 'Escape') onClose();
              }}
              placeholder="My project"
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="project-cwd" className="mb-1 block text-[11px] font-medium text-zinc-500">
              Working directory
            </label>
            <Input
              id="project-cwd"
              value={form.cwd}
              maxLength={500}
              onChange={(e) => setForm((f) => ({ ...f, cwd: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
                if (e.key === 'Escape') onClose();
              }}
              placeholder="/mnt/apopic/my-project (created if missing)"
              className="h-8 font-mono text-xs"
            />
          </div>
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
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
          <Button className="h-8 w-full text-sm" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Creating…' : 'Create project'}
          </Button>
        </div>
      </div>
    </div>
  );
}
