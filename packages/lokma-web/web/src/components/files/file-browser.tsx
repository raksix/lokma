import * as React from 'react';
import {
  AlertTriangle,
  AtSign,
  ChevronDown,
  ChevronRight,
  Copy,
  File as FileIcon,
  Folder,
  FolderOpen,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ApiError, api, type FileEntry, type FileSearchHit } from '@/lib/api';
import { emitToast } from '@/components/shell';
import {
  FILE_DRAG_MIME,
  FOCUS_FILES_EVENT,
  appendMention,
  basename,
  emitInsertMention,
  filterLoaded,
  formatSize,
  gitLabel,
  joinRel,
  parentDir,
} from './files';

/**
 * FileBrowser — real workspace explorer ported from the concept shell.
 * Tree comes from `GET /api/files` (git overlay M/A/D/R/? straight from
 * `git status`, dirs aggregate dirty descendants); preview/edit/save go
 * through `GET /api/files/read` + `POST /api/files/write` with the
 * `expectedSha` lost-update guard (409 → conflict UI, never silent
 * overwrite). Dragging a file into the chat (or "Mention") inserts
 * `@path`, which the Composer already sends as `contextPaths` — the
 * server reads the bytes into model context. No Monaco dependency:
 * the editor is a plain textarea (honest scope note, plan §W3-9).
 * Terminal/Browser tabs from the concept land in W3-10/W3-12.
 */

type FileView = {
  content: string;
  sha: string;
  size: number;
  truncated: boolean;
};

const GIT_BADGE: Record<string, string> = {
  M: 'bg-amber-500 text-white',
  A: 'bg-emerald-500 text-white',
  D: 'bg-red-500 text-white',
  R: 'bg-sky-500 text-white',
  '?': 'bg-zinc-400 text-white',
};

function copyText(text: string, label: string): void {
  try {
    void navigator.clipboard.writeText(text).then(
      () => emitToast(`${label} copied`),
      () => emitToast('Copy failed'),
    );
  } catch {
    emitToast('Copy failed');
  }
}

function startFileDrag(e: React.DragEvent, path: string): void {
  e.dataTransfer.setData(FILE_DRAG_MIME, path);
  e.dataTransfer.setData('text/plain', `@${path}`);
  e.dataTransfer.effectAllowed = 'copy';
}

export function FileBrowser({ sessionId }: { sessionId: string }) {
  const [cwd, setCwd] = React.useState<string | null>(null);
  const [cwdError, setCwdError] = React.useState<string | null>(null);
  const [nodes, setNodes] = React.useState<Record<string, FileEntry[]>>({});
  const [expanded, setExpanded] = React.useState<string[]>(['.']);
  const [loadingDir, setLoadingDir] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [view, setView] = React.useState<FileView | null>(null);
  const [viewLoading, setViewLoading] = React.useState(false);
  const [viewError, setViewError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [conflict, setConflict] = React.useState<FileView | null>(null);
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<FileSearchHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [menu, setMenu] = React.useState<{ x: number; y: number; path: string } | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const requestSeq = React.useRef(0);

  const loadDir = React.useCallback(
    async (root: string, dir: string) => {
      setLoadingDir(dir);
      try {
        const res = await api.listFiles(root, dir);
        setNodes((prev) => ({ ...prev, [dir]: res.entries }));
      } catch (e) {
        emitToast(`Files unavailable: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setLoadingDir((cur) => (cur === dir ? null : cur));
      }
    },
    [],
  );

  // Session workspace root — the FileBrowser is always scoped to the open
  // session's cwd (same root the chat `@mention` reader uses server-side).
  React.useEffect(() => {
    setCwd(null);
    setCwdError(null);
    setNodes({});
    setExpanded(['.']);
    setSelected(null);
    setView(null);
    setEditing(false);
    setConflict(null);
    setQuery('');
    setHits([]);
    let cancelled = false;
    api
      .getSession(sessionId)
      .then((detail) => {
        if (cancelled) return;
        setCwd(detail.cwd);
        void loadDir(detail.cwd, '.');
      })
      .catch((e: Error) => {
        if (!cancelled) setCwdError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, loadDir]);

  // Ctrl+P quick-open focus (dispatched by AppShell).
  React.useEffect(() => {
    const onFocus = (): void => searchRef.current?.focus();
    window.addEventListener(FOCUS_FILES_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_FILES_EVENT, onFocus);
  }, []);

  // Debounced workspace-wide search (server-ranked fuzzy, skips deps/build).
  React.useEffect(() => {
    const q = query.trim();
    if (!q || !cwd) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      const root = cwd;
      void api
        .searchWorkspaceFiles(root, q)
        .then((res) => {
          setHits(res.hits);
        })
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, cwd]);

  const toggleDir = React.useCallback(
    (dir: string) => {
      setExpanded((prev) => {
        if (prev.includes(dir)) return prev.filter((d) => d !== dir);
        if (cwd && nodes[dir] === undefined) void loadDir(cwd, dir);
        return [...prev, dir];
      });
    },
    [cwd, nodes, loadDir],
  );

  const openFile = React.useCallback(
    async (path: string) => {
      if (!cwd) return;
      const seq = (requestSeq.current += 1);
      setSelected(path);
      setView(null);
      setViewError(null);
      setEditing(false);
      setDraft('');
      setConflict(null);
      setViewLoading(true);
      try {
        const res = await api.readWorkspaceFile(cwd, path);
        if (requestSeq.current !== seq) return;
        setView({ content: res.content, sha: res.sha, size: res.size, truncated: res.truncated });
      } catch (e) {
        if (requestSeq.current !== seq) return;
        setViewError(e instanceof Error ? e.message : String(e));
      } finally {
        if (requestSeq.current === seq) setViewLoading(false);
      }
    },
    [cwd],
  );

  const refreshParent = React.useCallback(
    (path: string) => {
      if (cwd) void loadDir(cwd, parentDir(path));
    },
    [cwd, loadDir],
  );

  const saveFile = React.useCallback(
    async (overwriteSha?: string) => {
      if (!cwd || !selected || !view) return;
      setSaving(true);
      try {
        const res = await api.writeWorkspaceFile(cwd, selected, draft, overwriteSha ?? view.sha);
        setView({ content: draft, sha: res.sha, size: res.size, truncated: false });
        setEditing(false);
        setConflict(null);
        emitToast(res.created ? `Created ${selected}` : `Saved ${selected}`);
        refreshParent(selected);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'stale_file') {
          // Lost-update guard fired: fetch the server version and let the
          // user choose (reload discards mine, overwrite keeps mine).
          try {
            const server = await api.readWorkspaceFile(cwd, selected);
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
    [cwd, selected, view, draft, refreshParent],
  );

  const openSearchHit = React.useCallback(
    (hit: FileSearchHit) => {
      if (hit.type === 'dir') {
        if (cwd && nodes[hit.path] === undefined) void loadDir(cwd, hit.path);
        setExpanded((prev) => (prev.includes(hit.path) ? prev : [...prev, hit.path]));
        setQuery('');
        return;
      }
      setQuery('');
      void openFile(hit.path);
    },
    [cwd, nodes, loadDir, openFile],
  );

  const loadedRows = React.useMemo(() => Object.values(nodes).flat(), [nodes]);
  const filteredRows = React.useMemo(() => filterLoaded(query, loadedRows), [query, loadedRows]);
  const isQuerying = query.trim().length > 0;

  const renderTree = (dir: string, depth: number): React.ReactNode => {
    const kids = nodes[dir] ?? [];
    return kids.map((entry) => {
      if (entry.type === 'dir') {
        const open = expanded.includes(entry.path);
        const FolderIcon = open ? FolderOpen : Folder;
        return (
          <div key={entry.path}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleDir(entry.path)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') toggleDir(entry.path);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, path: entry.path });
              }}
              className="flex w-full cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-white dark:hover:bg-[#1E1E21]"
              style={{ paddingLeft: 4 + depth * 12 }}
            >
              {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
              <FolderIcon className="h-3 w-3 shrink-0 text-amber-600" />
              <span className="flex-1 truncate">{entry.name}</span>
              {entry.git && (
                <span title={gitLabel(entry.git) ?? ''} className={cn('rounded px-1 text-[10px]', GIT_BADGE[entry.git])}>
                  {entry.git}
                </span>
              )}
            </div>
            {open && renderTree(entry.path, depth + 1)}
          </div>
        );
      }
      const active = selected === entry.path;
      return (
        <div
          key={entry.path}
          role="button"
          tabIndex={0}
          draggable
          onDragStart={(e) => startFileDrag(e, entry.path)}
          onClick={() => void openFile(entry.path)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void openFile(entry.path);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, path: entry.path });
          }}
          title={entry.path}
          className={cn(
            'flex w-full cursor-pointer items-center gap-1.5 rounded border px-1 py-0.5 text-left text-xs transition',
            active
              ? 'border-[#F2D5C2] bg-[#FDF0E6] text-terracotta'
              : 'border-transparent hover:border-line hover:bg-white dark:hover:bg-[#1E1E21]',
          )}
          style={{ paddingLeft: 4 + depth * 12 }}
        >
          <FileIcon className="h-3 w-3 shrink-0" />
          <span className="flex-1 truncate">{entry.name}</span>
          {entry.git && (
            <span title={gitLabel(entry.git) ?? ''} className={cn('rounded px-1 text-[10px]', GIT_BADGE[entry.git])}>
              {entry.git}
            </span>
          )}
        </div>
      );
    });
  };

  const selectedEntry = selected ? loadedRows.find((e) => e.path === selected) : undefined;

  return (
    <div className="flex flex-col" onClick={() => setMenu(null)}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-serif text-xs">
          <Folder className="h-3 w-3 text-zinc-500" /> Explorer
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px]"
          title="Reload workspace tree"
          onClick={() => {
            if (!cwd) return;
            setNodes({});
            void loadDir(cwd, '.');
            setExpanded(['.']);
          }}
         aria-label="Reload workspace tree">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      <div className="mt-2">
        <label htmlFor="lokma-file-search" className="mb-1 block text-[11px] font-medium text-muted-foreground">
          Search files <span className="text-zinc-400">(Ctrl+P)</span>
        </label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400" />
          <Input
            id="lokma-file-search"
            ref={searchRef}
            placeholder="Fuzzy search workspace…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const first = hits[0] ?? filteredRows[0];
                if (first) {
                  if ('score' in first) openSearchHit(first as FileSearchHit);
                  else void openFile((first as FileEntry).path);
                }
              }
              if (e.key === 'Escape') setQuery('');
            }}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      {cwdError ? (
        <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">{cwdError}</div>
      ) : !cwd ? (
        <div className="mt-2 flex items-center gap-1.5 p-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading workspace…
        </div>
      ) : isQuerying ? (
        <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-auto">
          {searching && (
            <div className="flex items-center gap-1.5 px-1 py-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Searching workspace…
            </div>
          )}
          {!searching && hits.length === 0 && filteredRows.length === 0 && (
            <div className="px-1 py-1 text-[11px] text-zinc-400">No files match “{query.trim()}”</div>
          )}
          {hits.map((hit) => (
            <button
              key={hit.path}
              onClick={() => openSearchHit(hit)}
              title={hit.path}
              className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-white dark:hover:bg-[#1E1E21]"
            >
              {hit.type === 'dir' ? (
                <Folder className="h-3 w-3 shrink-0 text-amber-600" />
              ) : (
                <FileIcon className="h-3 w-3 shrink-0" />
              )}
              <span className="flex-1 truncate">{hit.path}</span>
            </button>
          ))}
          {filteredRows.length > 0 && hits.length > 0 && (
            <div className="px-1.5 pt-1 text-[10px] uppercase tracking-wide text-zinc-400">Open folders</div>
          )}
          {hits.length > 0 &&
            filteredRows.slice(0, 20).map((entry) => (
              <button
                key={`loaded-${entry.path}`}
                onClick={() => (entry.type === 'dir' ? toggleDir(entry.path) : void openFile(entry.path))}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-white dark:hover:bg-[#1E1E21]"
              >
                <span className="flex-1 truncate">{entry.path}</span>
              </button>
            ))}
        </div>
      ) : (
        <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-auto">
          {loadingDir === '.' && Object.keys(nodes).length === 0 ? (
            <div className="flex items-center gap-1.5 p-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Reading directory…
            </div>
          ) : (
            renderTree('.', 0)
          )}
        </div>
      )}

      {(selected || viewLoading || viewError) && (
        <div className="mt-2 shrink-0 rounded-md border border-line bg-white p-2 dark:bg-[#1E1E21]">
          <div className="flex items-center gap-1.5">
            <span className="flex-1 truncate font-mono text-[11px] text-zinc-500" title={selected ?? ''}>
              {selected ?? '…'}
            </span>
            {selectedEntry?.git && (
              <Badge variant="outline" className={cn('text-[10px]', GIT_BADGE[selectedEntry.git])}>
                {gitLabel(selectedEntry.git)}
              </Badge>
            )}
            {view && <span className="text-[10px] text-zinc-400">{formatSize(view.size)}</span>}
            {selected && (
              <Button variant="ghost" size="sm" className="h-5 px-1" title="Close file" onClick={() => {
                setSelected(null);
                setView(null);
                setEditing(false);
                setConflict(null);
              }} aria-label="Close file">
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {viewLoading ? (
            <div className="flex items-center gap-1.5 py-3 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Reading file…
            </div>
          ) : viewError ? (
            <div className="py-2 text-[11px] text-red-600">{viewError}</div>
          ) : view && selected ? (
            <>
              {view.truncated && (
                <div className="mt-1.5 rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-700">
                  Preview capped at 256 KB of {formatSize(view.size)} — edit saves the full file only after reload.
                </div>
              )}
              {conflict && (
                <div className="mt-1.5 rounded border border-amber-300 bg-amber-50 p-1.5 text-[11px] text-amber-800">
                  <div className="flex items-center gap-1 font-medium">
                    <AlertTriangle className="h-3 w-3" /> Changed on disk since you opened it
                  </div>
                  <div className="mt-1 flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 flex-1 text-[11px]"
                      onClick={() => {
                        setView(conflict);
                        setDraft(conflict.content);
                        setConflict(null);
                        emitToast('Reloaded the server version');
                      }}
                    >
                      Use server version
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="h-6 flex-1 text-[11px]"
                      disabled={saving}
                      onClick={() => void saveFile(conflict.sha)}
                    >
                      Overwrite with mine
                    </Button>
                  </div>
                </div>
              )}
              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  rows={12}
                  className="mt-1.5 w-full resize-y rounded border border-line bg-[#FDFCFB] p-1.5 font-mono text-[11px] leading-relaxed dark:bg-[#161618]"
                />
              ) : (
                <pre className="mt-1.5 max-h-56 overflow-auto rounded bg-[#FDFCFB] p-1.5 font-mono text-[11px] leading-relaxed dark:bg-[#161618]">
                  {view.content || <span className="text-zinc-400">(empty file)</span>}
                </pre>
              )}
              <div className="mt-1.5 flex gap-1.5">
                {editing ? (
                  <>
                    <Button size="sm" className="h-6 flex-1 text-xs" disabled={saving} onClick={() => void saveFile()}>
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 flex-1 text-xs"
                      onClick={() => {
                        setEditing(false);
                        setDraft('');
                        setConflict(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 flex-1 text-xs"
                      disabled={view.truncated}
                      title={view.truncated ? 'Reload the file to edit large previews' : 'Edit this file'}
                      onClick={() => {
                        setDraft(view.content);
                        setEditing(true);
                      }}
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 flex-1 text-xs"
                      title="Insert @path into the chat composer"
                      onClick={() => emitInsertMention(selected)}
                    >
                      <AtSign className="h-3 w-3" /> Mention
                    </Button>
                  </>
                )}
              </div>
              <div className="mt-1.5 flex gap-1 text-[10px] text-zinc-400">
                <button className="hover:text-ink hover:underline" onClick={() => copyText(selected, 'Path')}>
                  <span className="flex items-center gap-0.5"><Copy className="h-2.5 w-2.5" /> Copy path</span>
                </button>
                <span>·</span>
                <button className="hover:text-ink hover:underline" onClick={() => copyText(basename(selected), 'Filename')}>
                  Copy filename
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {menu && (
        <div
          className="fixed z-50 w-44 rounded-md border border-line bg-white py-1 shadow-lg dark:bg-[#1E1E21]"
          style={{ left: Math.min(menu.x, window.innerWidth - 190), top: Math.min(menu.y, window.innerHeight - 160) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted"
            onClick={() => {
              copyText(menu.path, 'Path');
              setMenu(null);
            }}
          >
            <Copy className="h-3 w-3" /> Copy path
          </button>
          <button
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted"
            onClick={() => {
              copyText(basename(menu.path), 'Filename');
              setMenu(null);
            }}
          >
            <Copy className="h-3 w-3" /> Copy filename
          </button>
          <button
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted"
            onClick={() => {
              emitInsertMention(menu.path);
              setMenu(null);
            }}
          >
            <AtSign className="h-3 w-3" /> Insert @mention
          </button>
          <button
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted"
            onClick={() => {
              setMenu(null);
              void openFile(menu.path);
            }}
          >
            <FileIcon className="h-3 w-3" /> Open file
          </button>
        </div>
      )}
    </div>
  );
}
