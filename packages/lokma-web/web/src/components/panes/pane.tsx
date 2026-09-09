import * as React from 'react';
import {
  AlertTriangle,
  AtSign,
  Columns2,
  Copy,
  Eye,
  FileText,
  GitFork,
  GitMerge,
  GripVertical,
  Loader2,
  Maximize,
  MessageSquare,
  Pencil,
  PictureInPicture2,
  Plus,
  Rows2,
  Save,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContextMenu, type ContextMenuEntry } from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';
import type { UseWs } from '@/hooks/use-ws';
import { useKnownSession, useSessionStore } from '@/stores/session';
import { emitToast, PaneErrorBoundary } from '@/components/shell';
import { ChatWithSocket } from '@/components/chat';
import { AssistantBody } from '@/components/chat/lokma-message';
import { FILE_DRAG_MIME, emitInsertMention } from '@/components/files';
import {
  INSPECTOR_DRAG_MIME,
  INSPECTOR_TABS,
  PANE_TAB_MIME,
  SESSION_DRAG_MIME,
  dropEffectFor,
  dropZoneFor,
  encodeTabMove,
  filePreviewKind,
  isValidRelPath,
  makeFileTab,
  makeInspectorTab,
  makeSessionTab,
  parseFileDrop,
  parseInspectorDrop,
  parseSessionDrop,
  parseTabMove,
  splitForZone,
  type DropZone,
  type FilePreviewKind,
  type InspectorTabId,
  type PaneTab,
} from './panes';
import { InspectorHost } from './inspector-host';
import { TAB_ICONS } from './tab-icons';

// PaneFilePreview (REQ-017): IDE-style editable file tab. Loads the
// owning session's cwd (GET /api/sessions/:id) then the real bytes
// (GET /api/files/read). Edits save through POST /api/files/write with
// the `expectedSha` lost-update guard (409 `stale_file` → conflict UI,
// never a silent overwrite) — the same honest pattern as the Explorer
// FileBrowser. Dirty state reports up via onDirtyChange so the tab strip
// can show an unsaved dot. Known limit: the draft lives while the tab is
// active (inactive tabs unmount); closing a dirty tab asks first.
//
// REQ-075: preview mode for markdown/html/pdf/images — rendered output
// instead of raw bytes, with an Edit toggle back to source. Markdown reuses
// the chat renderer; html is scriptless (`sandbox=""`); pdf/images load raw
// bytes as an object URL (never decoded as text).
export function PaneFilePreview({
  sessionId,
  path,
  tabId,
  onDirtyChange,
}: {
  sessionId: string;
  path: string;
  tabId?: string;
  onDirtyChange?: (tabId: string, dirty: boolean) => void;
}) {
  const [status, setStatus] = React.useState<'loading' | 'error' | 'ok'>('loading');
  const [error, setError] = React.useState('');
  const [content, setContent] = React.useState('');
  const [meta, setMeta] = React.useState<{ sha: string; size: number; truncated: boolean } | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [conflict, setConflict] = React.useState<{
    content: string;
    sha: string;
    size: number;
    truncated: boolean;
  } | null>(null);
  // REQ-075: preview-first for renderable types, source editor otherwise.
  const kind = filePreviewKind(path);
  const previewable = kind !== 'text';
  const [mode, setMode] = React.useState<'preview' | 'source'>(previewable ? 'preview' : 'source');
  const [blobUrl, setBlobUrl] = React.useState<string | null>(null);

  const dirty = editing && status === 'ok' && draft !== content;
  const dirtyKey = tabId ?? `${sessionId}:${path}`;
  React.useEffect(() => {
    onDirtyChange?.(dirtyKey, dirty);
    return () => {
      onDirtyChange?.(dirtyKey, false);
    };
  }, [dirtyKey, dirty, onDirtyChange]);

  // cwd comes from the cached server list — never a detail GET (fresh
  // sessions used to 404 here once per mounted file tab).
  const known = useKnownSession(sessionId);
  const load = React.useCallback(async () => {
    setStatus('loading');
    setError('');
    setEditing(false);
    setDraft('');
    setConflict(null);
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (known === 'loading') return;
    if (!known) {
      setError('Session has no workspace yet');
      setStatus('error');
      return;
    }
    // REQ-075: binary previews never touch the text endpoint (it 400s on
    // binary) — raw bytes become an object URL instead.
    if (kind === 'pdf' || kind === 'image') {
      try {
        const blob = await api.readWorkspaceFileRaw(known.cwd ?? '', path);
        setBlobUrl(URL.createObjectURL(blob));
        setMeta({ sha: '', size: blob.size, truncated: false });
        setStatus('ok');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the file');
        setStatus('error');
      }
      return;
    }
    try {
      const file = await api.readWorkspaceFile(known.cwd ?? '', path);
      setContent(file.content);
      setMeta({ sha: file.sha, size: file.size, truncated: file.truncated });
      setStatus('ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the file');
      setStatus('error');
    }
  }, [sessionId, path, known, kind]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Revoke the object URL when the tab unmounts or the file changes.
  React.useEffect(() => {
    return () => {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  const saveFile = React.useCallback(
    async (overwriteSha?: string) => {
      if (!known || known === 'loading' || !meta || saving) return;
      const cwd = known.cwd ?? '';
      if (!cwd) return;
      setSaving(true);
      try {
        const res = await api.writeWorkspaceFile(cwd, path, draft, overwriteSha ?? meta.sha);
        setContent(draft);
        setMeta({ sha: res.sha, size: res.size, truncated: false });
        setEditing(false);
        setConflict(null);
        emitToast(res.created ? `Created ${path}` : `Saved ${path}`);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'stale_file') {
          // Lost-update guard fired: fetch the server version and let the
          // user choose (reload discards mine, overwrite keeps mine).
          try {
            const server = await api.readWorkspaceFile(cwd, path);
            setConflict({ content: server.content, sha: server.sha, size: server.size, truncated: server.truncated });
            emitToast('File changed on disk — resolve the conflict below');
          } catch {
            emitToast(`Save blocked: ${e.message}`);
          }
        } else {
          emitToast(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      } finally {
        setSaving(false);
      }
    },
    [known, meta, saving, draft, path],
  );

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(path);
      emitToast('Path copied');
    } catch {
      emitToast('Copy failed');
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading {path}…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <FileText className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{error}</p>
        <p className="text-[11px] text-muted-foreground">The file may have moved, or its session may be deleted.</p>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-2 py-1 text-[11px] text-muted-foreground">
        {dirty ? (
          <span title="Unsaved changes" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#C96442]" />
        ) : null}
        <span className="min-w-0 flex-1 truncate font-mono">{path}</span>
        {meta ? <span>{formatBytes(meta.size)}</span> : null}
        {meta?.truncated ? <span className="rounded bg-muted px-1">truncated at 256 KB</span> : null}
        {previewable ? (
          <div className="flex shrink-0 items-center rounded-md border border-line p-0.5" role="tablist" aria-label="Preview or source">
            <Button
              variant="ghost"
              size="sm"
              role="tab"
              aria-selected={mode === 'preview'}
              className={`h-6 px-1.5 text-[11px] ${mode === 'preview' ? 'bg-muted font-medium' : ''}`}
              title="Rendered preview"
              onClick={() => setMode('preview')}
            >
              <Eye className="h-3 w-3" />
              Preview
            </Button>
            {(kind === 'markdown' || kind === 'html') && (
              <Button
                variant="ghost"
                size="sm"
                role="tab"
                aria-selected={mode === 'source'}
                className={`h-6 px-1.5 text-[11px] ${mode === 'source' ? 'bg-muted font-medium' : ''}`}
                title="Source and edit"
                onClick={() => setMode('source')}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            )}
          </div>
        ) : null}
        {editing ? (
          <>
            <Button
              variant="default"
              size="sm"
              className="h-6 px-1.5 text-[11px]"
              title="Save (Ctrl+S)"
              disabled={saving || !dirty}
              onClick={() => void saveFile()}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[11px]"
              title="Discard edits"
              onClick={() => {
                setEditing(false);
                setDraft('');
                setConflict(null);
              }}
            >
              <X className="h-3 w-3" />
              Cancel
            </Button>
          </>
        ) : (
          <>
            {(kind === 'text' || kind === 'markdown' || kind === 'html') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-[11px]"
                title={meta?.truncated ? 'Reload the file to edit large previews' : 'Edit this file'}
                disabled={meta?.truncated}
                onClick={() => {
                  setDraft(content);
                  setEditing(true);
                }}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" title="Copy the file path" onClick={() => void copyPath()}>
              <Copy className="h-3 w-3" />
              Copy
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" title="Insert @mention into the chat composer" onClick={() => emitInsertMention(path)}>
              <AtSign className="h-3 w-3" />
              Mention
            </Button>
          </>
        )}
      </div>
      {conflict ? (
        <div className="mx-2 mt-2 shrink-0 rounded border border-amber-300 bg-amber-50 p-1.5 text-[11px] text-amber-800">
          <div className="flex items-center gap-1 font-medium">
            <AlertTriangle className="h-3 w-3" /> Changed on disk since you opened it
          </div>
          <div className="mt-1 flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-6 flex-1 text-[11px]"
              onClick={() => {
                setContent(conflict.content);
                setMeta({ sha: conflict.sha, size: conflict.size, truncated: conflict.truncated });
                setDraft(conflict.content);
                setConflict(null);
                emitToast('Reloaded the server version');
              }}
            >
              Use server version
            </Button>
            <Button variant="default" size="sm" className="h-6 flex-1 text-[11px]" disabled={saving} onClick={() => void saveFile(conflict.sha)}>
              Overwrite with mine
            </Button>
          </div>
        </div>
      ) : null}
      {mode === 'preview' && previewable ? (
        kind === 'markdown' ? (
          <div className="min-h-0 flex-1 overflow-auto p-3 text-[13.5px] leading-[1.6]">
            <AssistantBody
              content={content}
              onCopy={(t) => {
                try {
                  void navigator.clipboard.writeText(t);
                  emitToast('Copied');
                } catch {
                  emitToast('Copy failed');
                }
              }}
            />
          </div>
        ) : kind === 'html' ? (
          <iframe sandbox="" srcDoc={content} title={`Preview of ${path}`} className="min-h-0 flex-1 border-0 bg-white" />
        ) : kind === 'pdf' ? (
          blobUrl ? (
            <iframe src={blobUrl} title={`Preview of ${path}`} className="min-h-0 flex-1 border-0 bg-white" />
          ) : (
            <div className="grid min-h-0 flex-1 place-items-center p-6 text-xs text-muted-foreground">Loading preview…</div>
          )
        ) : blobUrl ? (
          <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-muted/30 p-4">
            <img src={blobUrl} alt={path} className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center p-6 text-xs text-muted-foreground">Loading preview…</div>
        )
      ) : editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              void saveFile();
            }
          }}
          spellCheck={false}
          aria-label={`Edit ${path}`}
          className="min-h-0 flex-1 resize-none overflow-auto bg-transparent p-2 font-mono text-[11px] leading-relaxed focus:outline-none"
        />
      ) : (
        <pre className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11px] leading-relaxed">{content}</pre>
      )}
      <div className="shrink-0 border-t px-2 py-1 text-[10px] text-muted-foreground">
        {dirty ? (
          'Edited — unsaved changes (Ctrl+S saves)'
        ) : (
          <>
            {meta ? `sha ${meta.sha.slice(0, 12)}` : 'saved'} · Ctrl+S saves while editing
          </>
        )}
      </div>
    </div>
  );
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
// PaneTabPicker: the honest empty-pane state. Every option opens a LIVE
// surface (a real session chat, a real Inspector pane); dragging a session
// or file row onto the pane works too. Replaces the concept's mock tabs.
export function PaneTabPicker({
  onPickSession,
  onForkSession,
  onPickInspector,
  onCancel,
}: {
  onPickSession: (id: string, title: string) => void;
  onForkSession: (id: string) => void;
  onPickInspector: (id: InspectorTabId) => void;
  onCancel: (() => void) | null;
}) {
  const sessions = useSessionStore((s) => s.sessions);
  const [q, setQ] = React.useState('');
  const query = q.trim().toLowerCase();
  const matches = sessions.filter(
    (s) => !query || s.id.toLowerCase().includes(query) || (s.title ?? '').toLowerCase().includes(query),
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3">
      <div className="flex items-center gap-2">
        <div className="text-xs font-medium">
          Open a tab
        </div>
        {onCancel ? (
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
      <div>
        <label htmlFor="pane-picker-search" className="mb-1 block text-[11px] text-muted-foreground">
          Sessions
        </label>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input id="pane-picker-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sessions…" className="h-7 pl-7 text-xs" />
        </div>
        <div className="mt-1 max-h-40 overflow-auto rounded border">
          {matches.length === 0 ? (
            <div className="p-2 text-[11px] text-muted-foreground">
              {sessions.length === 0 ? 'No sessions yet — create one from the Explorer sidebar.' : 'No sessions match.'}
            </div>
          ) : (
            matches.slice(0, 30).map((s) => (
              <div key={s.id} className="flex items-center gap-1 border-b px-2 py-1 last:border-0">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-xs hover:underline"
                  title={`Open session ${s.id}`}
                  onClick={() => onPickSession(s.id, s.title || s.id)}
                >
                  <MessageSquare className="mr-1 inline h-3 w-3 text-muted-foreground" />
                  {s.title || s.id}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 shrink-0 p-0"
                  title={`Fork session ${s.id} (real POST /api/sessions/:id/fork)`}
                  onClick={() => onForkSession(s.id)}
                 aria-label={`Fork session ${s.id} (real POST /api/sessions/:id/fork)`}>
                  <GitFork className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
      <div>
        <div className="mb-1 text-[11px] text-muted-foreground">Tools</div>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {INSPECTOR_TABS.map((t) => (
            <Button
              key={t.id}
              variant="outline"
              size="sm"
              className="h-7 justify-start gap-1.5 px-2 text-[11px]"
              title={`Open the live ${t.label} pane`}
              onClick={() => onPickInspector(t.id)}
            >
              {TAB_ICONS[t.id]}
              {t.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground">Tip: drag a session, file row, or rail icon here to open, split, fork, or merge it.</div>
    </div>
  );
}

// SessionDropChooser: a dropped session never becomes a fake tab. The user
// picks open / side-by-side split / real fork / real merge into the pane's
// current session tab.
// REQ-035: top-anchored, never centered — in short panes a centered dialog
// gets squeezed under the content or clipped at the bottom. The overlay
// scrolls, the card caps its own height with an inner scroll, and the
// z-index clears the zone highlight plus chat composer layers.
export function SessionDropChooser({
  sessionId,
  title,
  canMerge,
  mergeTarget,
  busy,
  onOpen,
  onSplit,
  onFork,
  onMerge,
  onCancel,
}: {
  sessionId: string;
  title: string;
  canMerge: boolean;
  mergeTarget: string;
  busy: boolean;
  onOpen: () => void;
  onSplit: () => void;
  onFork: () => void;
  onMerge: () => void;
  onCancel: () => void;
}) {
  // REQ-035: Escape dismisses the chooser (same as Cancel, blocked while busy).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Dropped session" className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-2 pt-4">
      <div className="my-1 max-h-[calc(100%-0.5rem)] w-full max-w-xs overflow-y-auto rounded-lg border bg-card p-2.5 shadow-xl">
        <div className="mb-1 text-xs font-medium">Dropped session</div>
        <div className="mb-2 truncate font-mono text-[11px] text-muted-foreground" title={sessionId}>
          {title}
        </div>
        <div className="grid grid-cols-2 gap-1">
          <Button variant="default" size="sm" className="h-7 text-xs" disabled={busy} onClick={onOpen}>
            Open here
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy} onClick={onSplit} title="Open side-by-side in a new split pane">
            Split
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy} onClick={onFork} title="Fork (real POST /api/sessions/:id/fork) and open the copy here">
            <GitFork className="mr-1 h-3 w-3" />
            {busy ? 'Forking…' : 'Fork here'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={busy || !canMerge}
            onClick={onMerge}
            title={canMerge ? `Merge into ${mergeTarget} (real POST /api/sessions/:id/merge)` : 'Open a session tab in this pane first to merge into it'}
          >
            <GitMerge className="mr-1 h-3 w-3" />
            Merge
          </Button>
        </div>
        {!canMerge ? (
          <div className="mt-1 text-[10px] text-muted-foreground">Merge needs a session tab open in this pane as the target.</div>
        ) : null}
        <Button variant="ghost" size="sm" className="mt-1 h-6 w-full text-[11px]" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
export type PaneCtx = {
  sessionId: string | null;
  ws?: UseWs;
  onOpenSession?: (id: string) => void;
};

type PendingSession = { id: string; title: string };

// WorkspacePane: concept layout/Pane.tsx port. Tab bar with drag-to-move,
// 5-zone drag split with live session/file intents, resize handles, and
// per-tab REAL content (session chats, Inspector panes, file previews).
// The concept's mock-tab Composer path is gone by construction: session
// tabs render ChatWithSocket (own socket + own Composer); tool and file
// tabs have no composer.
export function WorkspacePane({
  id,
  tabs,
  activeTabId,
  ctx,
  isFocused,
  onFocus,
  onTabsChange,
  onSplit,
  onSplitEmpty,
  onClosePane,
  onMoveTab,
  onOpenSession,
  onPopout,
  onFullscreen,
}: {
  id: string;
  tabs: PaneTab[];
  activeTabId: string | null;
  ctx: PaneCtx;
  isFocused: boolean;
  onFocus: (paneId: string) => void;
  onTabsChange: (paneId: string, tabs: PaneTab[], active: string | null) => void;
  onSplit: (targetPaneId: string, dir: 'row' | 'col', pos: 'before' | 'after', tab: PaneTab) => void;
  onSplitEmpty: (targetPaneId: string, dir: 'row' | 'col') => void;
  onClosePane: (paneId: string) => void;
  onMoveTab: (tab: PaneTab, fromPaneId: string, toPaneId: string, split: { dir: 'row' | 'col'; pos: 'before' | 'after' } | null) => void;
  onOpenSession?: (id: string) => void;
  onPopout?: (paneId: string) => void;
  onFullscreen?: (paneId: string) => void;
}) {
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const [zone, setZone] = React.useState<DropZone | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pending, setPending] = React.useState<PendingSession | null>(null);
  const [busy, setBusy] = React.useState(false);
  // REQ-017: file tabs with unsaved edits report here (PaneFilePreview →
  // PaneTabContent → markDirty); the strip shows a dot and closing asks.
  const [dirtyTabs, setDirtyTabs] = React.useState<ReadonlySet<string>>(() => new Set());
  const markDirty = React.useCallback((tabId: string, dirty: boolean) => {
    setDirtyTabs((prev) => {
      if (dirty === prev.has(tabId)) return prev;
      const next = new Set(prev);
      if (dirty) next.add(tabId);
      else next.delete(tabId);
      return next;
    });
  }, []);

  const sessions = useSessionStore((s) => s.sessions);
  const forkSession = useSessionStore((s) => s.forkSession);
  const mergeSessions = useSessionStore((s) => s.mergeSessions);

  const active = tabs.find((t) => t.id === activeTabId) ?? null;
  const mergeTarget = tabs.find((t) => t.kind === 'session' && t.sessionId) ?? null;

  const addTab = (tab: PaneTab) => {
    const next = tabs.some((t) => t.id === tab.id) ? tabs : [...tabs, tab];
    onTabsChange(id, next, tab.id);
    setPickerOpen(false);
  };

  const closeTab = (tabId: string) => {
    // REQ-017: never silently drop unsaved file edits.
    if (dirtyTabs.has(tabId) && typeof window !== 'undefined') {
      const tab = tabs.find((t) => t.id === tabId);
      if (!window.confirm(`Close ${tab?.title ?? 'this tab'} with unsaved changes? They will be lost.`)) return;
    }
    setDirtyTabs((prev) => {
      if (!prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });
    const next = tabs.filter((t) => t.id !== tabId);
    const nextActive = activeTabId === tabId ? (next[next.length - 1]?.id ?? null) : activeTabId;
    onTabsChange(id, next, nextActive);
  };

  // REQ-056: right-click "Close other tabs" — keeps one tab, asks
  // first when any closed tab carries unsaved file edits.
  const closeOtherTabs = (keepId: string) => {
    const doomed = tabs.filter((t) => t.id !== keepId);
    if (doomed.length === 0) return;
    if (typeof window !== 'undefined' && doomed.some((t) => dirtyTabs.has(t.id))) {
      if (!window.confirm('Close other tabs with unsaved changes? They will be lost.')) return;
    }
    setDirtyTabs((prev) => {
      const next = new Set(prev);
      for (const t of doomed) next.delete(t.id);
      return next;
    });
    onTabsChange(id, tabs.filter((t) => t.id === keepId), keepId);
  };

  // Verify a dropped session id against the live list first (the common
  // path — drops originate from the sidebar showing that list), falling
  // back to one GET so a fresh session never 404s into a fake tab.
  const resolveSession = async (droppedId: string): Promise<{ id: string; title: string } | null> => {
    const known = sessions.find((s) => s.id === droppedId);
    if (known) return { id: known.id, title: known.title || known.id };
    try {
      const detail = await api.getSession(droppedId);
      return { id: detail.id, title: droppedId };
    } catch {
      return null;
    }
  };

  const openSplit = (tab: PaneTab, dir: 'row' | 'col', pos: 'before' | 'after') => {
    onSplit(id, dir, pos, tab);
    setPickerOpen(false);
  };

  const handleDrop = async (e: React.DragEvent, forcedZone?: DropZone) => {
    e.preventDefault();
    e.stopPropagation();
    const target = forcedZone ?? computeZone(e);
    setZone(null);
    if (pending) return;

    const move = parseTabMove(e.dataTransfer);
    if (move) {
      if (move.fromPane === id) return;
      const edge = target ? splitForZone(target) : null;
      onMoveTab(move.tab, move.fromPane, id, edge);
      return;
    }

    const sessionId = parseSessionDrop(e.dataTransfer);
    if (sessionId) {
      const found = await resolveSession(sessionId);
      if (!found) {
        emitToast('That session no longer exists — nothing opened');
        return;
      }
      if (target) {
        const edge = splitForZone(target);
        if (edge) {
          openSplit(makeSessionTab(found.id, found.title), edge.dir, edge.pos);
          return;
        }
      }
      setPending(found);
      return;
    }

    // REQ-026: rail icons (InspectorRail + ActivityBar) drop as live tool
    // tabs through the same flow. Runs BEFORE parseFileDrop: the rail also
    // sets text/plain to its label, and labels like "Terminal" would
    // otherwise parse as workspace-relative file paths.
    const railId = parseInspectorDrop(e.dataTransfer);
    if (railId) {
      if (railId === 'sessions') {
        // The sessions list lives in the Explorer sidebar, not the
        // Inspector: reveal this pane's live picker (real sessions +
        // tools) as its pane entry instead of a tool tab.
        setPickerOpen(true);
        return;
      }
      const tab = makeInspectorTab(railId);
      if (target) {
        const edge = splitForZone(target);
        if (edge) {
          openSplit(tab, edge.dir, edge.pos);
          return;
        }
      }
      addTab(tab);
      return;
    }

    const filePath = parseFileDrop(e.dataTransfer, FILE_DRAG_MIME);
    if (filePath && ctx.sessionId) {
      const tab = makeFileTab(filePath, ctx.sessionId);
      if (target) {
        const edge = splitForZone(target);
        if (edge) {
          openSplit(tab, edge.dir, edge.pos);
          return;
        }
      }
      addTab(tab);
      return;
    }
    if (filePath && !ctx.sessionId) {
      emitToast('Open a session first — file tabs need its working directory');
      return;
    }

    emitToast('Drop a session, file, rail icon, or pane tab here');
  };

  const computeZone = (e: React.DragEvent): DropZone | null => {
    const el = bodyRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return dropZoneFor(rect.width, rect.height, e.clientX - rect.left, e.clientY - rect.top);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!hasPanePayload(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    // REQ-029: answer with an effect the source allows — Chrome silently
    // rejects drops whose dropEffect is incompatible with effectAllowed
    // (session/file rows drag with 'copy', rails/tabs with 'move').
    e.dataTransfer.dropEffect = dropEffectFor(e.dataTransfer.effectAllowed);
    setZone(computeZone(e));
  };

  const forkHere = async (sourceId: string, after: (tab: PaneTab) => void) => {
    setBusy(true);
    try {
      const newId = await forkSession(sourceId);
      if (!newId) {
        emitToast('Fork failed — source session may be gone');
        return;
      }
      const created = useSessionStore.getState().sessions.find((s) => s.id === newId);
      after(makeSessionTab(newId, created?.title || `Fork of ${sourceId.slice(0, 12)}`));
      emitToast('Session forked');
    } finally {
      setBusy(false);
    }
  };

  const mergeHere = async (droppedId: string) => {
    if (!mergeTarget?.sessionId || mergeTarget.sessionId === droppedId) return;
    setBusy(true);
    try {
      const appended = await mergeSessions(mergeTarget.sessionId, droppedId);
      if (appended === null) {
        emitToast('Merge failed — a session may be gone');
        return;
      }
      emitToast(`Merged ${appended} message${appended === 1 ? '' : 's'}`);
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const pickSession = (sid: string, title: string) => {
    addTab(makeSessionTab(sid, title));
  };

  const pickInspector = (inspectorId: InspectorTabId) => {
    addTab(makeInspectorTab(inspectorId));
  };

  const showPicker = pickerOpen || tabs.length === 0;

  return (
    <div
      data-pane={id}
      onMouseDown={() => onFocus(id)}
      className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded border bg-card ${
        isFocused ? 'border-[#C96442]/60' : 'border-border'
      }`}
    >
      <PaneTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        paneId={id}
        dirtyTabIds={dirtyTabs}
        onSelect={(tabId) => onTabsChange(id, tabs, tabId)}
        onClose={closeTab}
        onCloseOthers={closeOtherTabs}
        onAdd={() => {
          setPickerOpen((v) => !v);
        }}
        onSplitEmpty={(dir) => onSplitEmpty(id, dir)}
        onClosePane={() => onClosePane(id)}
        onPopout={onPopout ? () => onPopout(id) : undefined}
        onFullscreen={onFullscreen ? () => onFullscreen(id) : undefined}
        onTabBarDrop={(e) => void handleDrop(e, 'center')}
      />
      <div
        ref={bodyRef}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        onDragOver={onDragOver}
        onDragLeave={() => setZone(null)}
        onDrop={(e) => void handleDrop(e)}
      >
        {showPicker ? (
          <PaneTabPicker
            onPickSession={pickSession}
            onForkSession={(sid) => void forkHere(sid, (tab) => addTab(tab))}
            onPickInspector={pickInspector}
            onCancel={tabs.length === 0 ? null : () => {
              setPickerOpen(false);
            }}
          />
        ) : active ? (
          <PaneErrorBoundary paneName={active.title}>
            <PaneTabContent
              tab={active}
              ctx={ctx}
              onDirtyChange={markDirty}
              onOpenInspectorTab={(inspectorId) => addTab(makeInspectorTab(inspectorId))}
              onOpenSession={onOpenSession}
            />
          </PaneErrorBoundary>
        ) : null}
        {zone && zone !== 'center' ? <ZoneHighlight zone={zone} /> : null}
        {pending ? (
          <SessionDropChooser
            sessionId={pending.id}
            title={pending.title}
            canMerge={!!mergeTarget?.sessionId && mergeTarget.sessionId !== pending.id}
            mergeTarget={mergeTarget?.title ?? ''}
            busy={busy}
            onOpen={() => {
              addTab(makeSessionTab(pending.id, pending.title));
              setPending(null);
            }}
            onSplit={() => {
              openSplit(makeSessionTab(pending.id, pending.title), 'row', 'after');
              setPending(null);
            }}
            onFork={() => void forkHere(pending.id, (tab) => {
              addTab(tab);
              setPending(null);
            })}
            onMerge={() => void mergeHere(pending.id)}
            onCancel={() => setPending(null)}
          />
        ) : null}
      </div>
    </div>
  );
}

function hasPanePayload(dt: React.DragEvent['dataTransfer']): boolean {
  const types = Array.from(dt.types ?? []);
  return types.includes(PANE_TAB_MIME) || types.includes(SESSION_DRAG_MIME) || types.includes(INSPECTOR_DRAG_MIME) || types.includes(FILE_DRAG_MIME) || types.includes('text/plain');
}

function ZoneHighlight({ zone }: { zone: DropZone }) {
  const cls =
    zone === 'left'
      ? 'inset-y-0 left-0 w-1/4'
      : zone === 'right'
        ? 'inset-y-0 right-0 w-1/4'
        : zone === 'top'
          ? 'inset-x-0 top-0 h-1/4'
          : 'inset-x-0 bottom-0 h-1/4';
  return <div className={`pointer-events-none absolute ${cls} z-10 border-2 border-[#C96442]/70 bg-[#C96442]/10`} />;
}
// PaneTabBar: concept Pane tab strip (h-7, active ink pill, grip drag,
// add / split-row / split-col / close-pane). Tab drags carry the whole
// real tab (PANE_TAB_MIME) so drops move live content, never copies.
function PaneTabBar({
  tabs,
  activeTabId,
  paneId,
  dirtyTabIds,
  onSelect,
  onClose,
  onCloseOthers,
  onAdd,
  onSplitEmpty,
  onClosePane,
  onPopout,
  onFullscreen,
  onTabBarDrop,
}: {
  tabs: PaneTab[];
  activeTabId: string | null;
  paneId: string;
  dirtyTabIds: ReadonlySet<string>;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onAdd: () => void;
  onSplitEmpty: (dir: 'row' | 'col') => void;
  onClosePane: () => void;
  onPopout?: () => void;
  onFullscreen?: () => void;
  onTabBarDrop: (e: React.DragEvent) => void;
}) {
  // REQ-029: the tab strip is a drop target too (concept handleTabBarDrop).
  // Drops here land as CENTER (open tab / chooser, never split) so aiming
  // at the top of a pane no longer loses the drop.
  const [barOver, setBarOver] = React.useState(false);
  // REQ-056: right-click a tab for its context menu (close / close
  // others / split / pop out) on the shared ContextMenu primitive.
  const [tabMenu, setTabMenu] = React.useState<{ x: number; y: number; id: string } | null>(null);
  const menuTab = tabMenu ? (tabs.find((t) => t.id === tabMenu.id) ?? null) : null;
  const menuItems: ContextMenuEntry[] = menuTab
    ? [
        { type: 'header', label: menuTab.title },
        {
          type: 'item',
          label: 'Close tab',
          icon: X,
          onSelect: () => onClose(menuTab.id),
        },
        {
          type: 'item',
          label: 'Close other tabs',
          icon: X,
          disabled: tabs.length < 2,
          onSelect: () => onCloseOthers(menuTab.id),
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Split side-by-side',
          icon: Columns2,
          onSelect: () => onSplitEmpty('row'),
        },
        {
          type: 'item',
          label: 'Split stacked',
          icon: Rows2,
          onSelect: () => onSplitEmpty('col'),
        },
        ...(onPopout
          ? [
              {
                type: 'item',
                label: 'Pop out as window',
                icon: PictureInPicture2,
                onSelect: () => onPopout(),
              } as ContextMenuEntry,
            ]
          : []),
        ...(onFullscreen
          ? [
              {
                type: 'item',
                label: 'Open fullscreen',
                icon: Maximize,
                onSelect: () => onFullscreen(),
              } as ContextMenuEntry,
            ]
          : []),
      ]
    : [];
  return (
    <div
      onDragOver={(e) => {
        if (!hasPanePayload(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = dropEffectFor(e.dataTransfer.effectAllowed);
        setBarOver(true);
      }}
      onDragLeave={() => setBarOver(false)}
      onDrop={(e) => {
        setBarOver(false);
        onTabBarDrop(e);
      }}
      className={`flex h-7 shrink-0 items-center gap-0.5 border-b px-1 ${barOver ? 'border-[#C96442]/50 bg-[#C96442]/10' : 'bg-[#FDFCFB] dark:bg-muted/40'}`}
    >
      <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto" role="tablist" aria-label="Pane tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              data-pane-tab={tab.id}
              draggable
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(tab.id);
                }
              }}
              onDragStart={(e) => {
                e.dataTransfer.setData(PANE_TAB_MIME, encodeTabMove(paneId, tab));
                e.dataTransfer.effectAllowed = 'move';
              }}
              // REQ-015: a draggable tab swallows clicks — the browser turns
              // any press with a few px of movement into a dragstart, so the
              // click event never fires and the tab never activates. Select
              // on mousedown (always delivered before a drag can start, and
              // the standard IDE behavior that dragging a tab activates it);
              // the click handler stays as a fallback. Both call the
              // idempotent onSelect, so double delivery is harmless.
              onMouseDown={() => onSelect(tab.id)}
              onClick={() => onSelect(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setTabMenu({ x: e.clientX, y: e.clientY, id: tab.id });
              }}
              title={`${tab.title} — drag to another pane to move it`}
              className={`flex max-w-36 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                isActive ? 'bg-[#262624] text-white dark:bg-white dark:text-black' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <TabIcon tab={tab} />
              {dirtyTabIds.has(tab.id) ? (
                <span title="Unsaved changes" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#C96442]" />
              ) : null}
              <span className="truncate">{tab.title}</span>
              <button
                type="button"
                aria-label={`Close ${tab.title}`}
                className="rounded p-0.5 opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
      <Button variant="ghost" size="sm" className="h-5 w-5 shrink-0 p-0" title="Open a tab (live sessions and tools)" onClick={onAdd} aria-label="Open a tab (live sessions and tools)">
        <Plus className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="sm" className="h-5 w-5 shrink-0 p-0" title="Split into side-by-side columns" onClick={() => onSplitEmpty('row')} aria-label="Split into side-by-side columns">
        <Columns2 className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="sm" className="h-5 w-5 shrink-0 p-0" title="Split into stacked rows" onClick={() => onSplitEmpty('col')} aria-label="Split into stacked rows">
        <Rows2 className="h-3 w-3" />
      </Button>
      {onPopout ? (
        <Button variant="ghost" size="sm" className="h-5 w-5 shrink-0 p-0" title="Pop out as a floating window (drag the title bar to move, edges to resize)" onClick={onPopout} aria-label="Pop out as a floating window">
          <PictureInPicture2 className="h-3 w-3" />
        </Button>
      ) : null}
      {onFullscreen ? (
        <Button variant="ghost" size="sm" className="h-5 w-5 shrink-0 p-0" title="Open fullscreen (app modal, Esc closes)" onClick={onFullscreen} aria-label="Open fullscreen">
          <Maximize className="h-3 w-3" />
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" className="h-5 w-5 shrink-0 p-0" title="Close this pane" onClick={onClosePane} aria-label="Close this pane">
        <X className="h-3 w-3" />
      </Button>
      {tabMenu && menuTab ? (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          items={menuItems}
          onClose={() => setTabMenu(null)}
          label="Pane tab actions menu"
        />
      ) : null}
    </div>
  );
}

function TabIcon({ tab }: { tab: PaneTab }) {
  if (tab.kind === 'session') return <MessageSquare className="h-3 w-3 shrink-0" />;
  if (tab.kind === 'file') return <FileText className="h-3 w-3 shrink-0" />;
  if (tab.inspectorId) return <span className="flex shrink-0">{TAB_ICONS[tab.inspectorId]}</span>;
  return <Wrench className="h-3 w-3 shrink-0" />;
}

// PaneTabContent: one live surface per tab. Session tabs own a real Chat
// (socket + Composer included); inspector tabs render the same real panes
// as the sidebar; file tabs render an editable file editor (REQ-017).
function PaneTabContent({
  tab,
  ctx,
  onDirtyChange,
  onOpenInspectorTab,
  onOpenSession,
}: {
  tab: PaneTab;
  ctx: PaneCtx;
  onDirtyChange: (tabId: string, dirty: boolean) => void;
  onOpenInspectorTab: (id: InspectorTabId) => void;
  onOpenSession?: (id: string) => void;
}) {
  if (tab.kind === 'session' && tab.sessionId) {
    return <ChatWithSocket key={tab.sessionId} sessionId={tab.sessionId} />;
  }
  // @container mirrors the Inspector sidebar so the same pane hides its
  // subtitles/grids only when the tiling pane itself is narrow.
  if (tab.kind === 'inspector' && tab.inspectorId) {
    return (
      <div className="h-full overflow-auto p-2 @container">
        <InspectorHost tab={tab.inspectorId} sessionId={ctx.sessionId} ws={ctx.ws} onOpenSession={onOpenSession} onOpenInspectorTab={onOpenInspectorTab} />
      </div>
    );
  }
  if (tab.kind === 'file' && tab.filePath && tab.sessionId && isValidRelPath(tab.filePath)) {
    return <PaneFilePreview sessionId={tab.sessionId} path={tab.filePath} tabId={tab.id} onDirtyChange={onDirtyChange} />;
  }
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
      This tab lost its content and was kept closed rather than faked — close it and open a live tab.
    </div>
  );
}
