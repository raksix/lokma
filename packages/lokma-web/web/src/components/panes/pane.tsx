import * as React from 'react';
import {
  AtSign,
  Columns2,
  Copy,
  FileText,
  GitFork,
  GitMerge,
  GripVertical,
  Loader2,
  MessageSquare,
  Plus,
  Rows2,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import type { UseWs } from '@/hooks/use-ws';
import { useSessionStore } from '@/stores/session';
import { emitToast, PaneErrorBoundary } from '@/components/shell';
import { ChatWithSocket } from '@/components/chat';
import { FILE_DRAG_MIME, emitInsertMention } from '@/components/files';
import {
  INSPECTOR_TABS,
  PANE_TAB_MIME,
  SESSION_DRAG_MIME,
  dropZoneFor,
  encodeTabMove,
  isValidRelPath,
  makeFileTab,
  makeInspectorTab,
  makeSessionTab,
  parseFileDrop,
  parseSessionDrop,
  parseTabMove,
  splitForZone,
  type DropZone,
  type InspectorTabId,
  type PaneTab,
} from './panes';
import { InspectorHost } from './inspector-host';
import { TAB_ICONS } from './tiling-bar';

// PaneFilePreview: read-only preview of a workspace file tab. Loads the
// owning session's cwd (GET /api/sessions/:id) then the real bytes
// (GET /api/files/read). Editing stays in the Explorer FileBrowser —
// this tab never fakes a save button.
export function PaneFilePreview({ sessionId, path }: { sessionId: string; path: string }) {
  const [status, setStatus] = React.useState<'loading' | 'error' | 'ok'>('loading');
  const [error, setError] = React.useState('');
  const [content, setContent] = React.useState('');
  const [meta, setMeta] = React.useState<{ sha: string; size: number; truncated: boolean } | null>(null);

  const load = React.useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const detail = await api.getSession(sessionId);
      const file = await api.readWorkspaceFile(detail.cwd, path);
      setContent(file.content);
      setMeta({ sha: file.sha, size: file.size, truncated: file.truncated });
      setStatus('ok');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the file');
      setStatus('error');
    }
  }, [sessionId, path]);

  React.useEffect(() => {
    void load();
  }, [load]);

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
        <span className="min-w-0 flex-1 truncate font-mono">{path}</span>
        {meta ? <span>{formatBytes(meta.size)}</span> : null}
        {meta?.truncated ? <span className="rounded bg-muted px-1">truncated at 256 KB</span> : null}
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" title="Copy the file path" onClick={() => void copyPath()}>
          <Copy className="h-3 w-3" />
          Copy
        </Button>
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" title="Insert @mention into the chat composer" onClick={() => emitInsertMention(path)}>
          <AtSign className="h-3 w-3" />
          Mention
        </Button>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11px] leading-relaxed">{content}</pre>
      <div className="shrink-0 border-t px-2 py-1 text-[10px] text-muted-foreground">
        Read-only preview{meta ? ` · sha ${meta.sha.slice(0, 12)}` : ''} · edit in the Explorer file browser
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
  splitArmed,
  onPickSession,
  onForkSession,
  onPickInspector,
  onCancel,
}: {
  splitArmed: { dir: 'row' | 'col' } | null;
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
          {splitArmed ? `Choose content for the new ${splitArmed.dir === 'row' ? 'side' : 'below'} pane` : 'Open a tab'}
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
                >
                  <GitFork className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
      <div>
        <div className="mb-1 text-[11px] text-muted-foreground">Tools</div>
        <div className="grid grid-cols-3 gap-1">
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
      <div className="text-[10px] text-muted-foreground">Tip: drag a session or file row here to open, split, fork, or merge it.</div>
    </div>
  );
}

// SessionDropChooser: a dropped session never becomes a fake tab. The user
// picks open / side-by-side split / real fork / real merge into the pane's
// current session tab.
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
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 p-3">
      <div className="w-full max-w-xs rounded-lg border bg-card p-3 shadow-xl">
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
  onClosePane,
  onMoveTab,
  onOpenSession,
}: {
  id: string;
  tabs: PaneTab[];
  activeTabId: string | null;
  ctx: PaneCtx;
  isFocused: boolean;
  onFocus: (paneId: string) => void;
  onTabsChange: (paneId: string, tabs: PaneTab[], active: string | null) => void;
  onSplit: (targetPaneId: string, dir: 'row' | 'col', pos: 'before' | 'after', tab: PaneTab) => void;
  onClosePane: (paneId: string) => void;
  onMoveTab: (tab: PaneTab, fromPaneId: string, toPaneId: string, split: { dir: 'row' | 'col'; pos: 'before' | 'after' } | null) => void;
  onOpenSession?: (id: string) => void;
}) {
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const [zone, setZone] = React.useState<DropZone | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [splitArm, setSplitArm] = React.useState<{ dir: 'row' | 'col' } | null>(null);
  const [pending, setPending] = React.useState<PendingSession | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [maximized, setMaximized] = React.useState(false);

  const sessions = useSessionStore((s) => s.sessions);
  const forkSession = useSessionStore((s) => s.forkSession);
  const mergeSessions = useSessionStore((s) => s.mergeSessions);

  const active = tabs.find((t) => t.id === activeTabId) ?? null;
  const mergeTarget = tabs.find((t) => t.kind === 'session' && t.sessionId) ?? null;

  const addTab = (tab: PaneTab) => {
    const next = tabs.some((t) => t.id === tab.id) ? tabs : [...tabs, tab];
    onTabsChange(id, next, tab.id);
    setPickerOpen(false);
    setSplitArm(null);
  };

  const closeTab = (tabId: string) => {
    const next = tabs.filter((t) => t.id !== tabId);
    const nextActive = activeTabId === tabId ? (next[next.length - 1]?.id ?? null) : activeTabId;
    onTabsChange(id, next, nextActive);
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
    setSplitArm(null);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = computeZone(e);
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

    emitToast('Drop a session, file, or pane tab here');
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
    e.dataTransfer.dropEffect = 'move';
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
    const tab = makeSessionTab(sid, title);
    if (splitArm) openSplit(tab, splitArm.dir, 'after');
    else addTab(tab);
  };

  const pickInspector = (inspectorId: InspectorTabId) => {
    const tab = makeInspectorTab(inspectorId);
    if (splitArm) openSplit(tab, splitArm.dir, 'after');
    else addTab(tab);
  };

  const showPicker = pickerOpen || tabs.length === 0;

  return (
    <div
      data-pane={id}
      onMouseDown={() => onFocus(id)}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-pane-tab]')) return;
        setMaximized((m) => !m);
      }}
      className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded border bg-card ${
        isFocused ? 'border-[#C96442]/60' : 'border-border'
      }`}
      style={maximized ? { flex: 'none', width: 1024, height: 640 } : undefined}
    >
      <PaneTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        paneId={id}
        onSelect={(tabId) => onTabsChange(id, tabs, tabId)}
        onClose={closeTab}
        onAdd={() => {
          setSplitArm(null);
          setPickerOpen((v) => !v);
        }}
        onArmSplit={(dir) => {
          setSplitArm({ dir });
          setPickerOpen(true);
        }}
        onClosePane={() => onClosePane(id)}
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
            splitArmed={splitArm}
            onPickSession={pickSession}
            onForkSession={(sid) => void forkHere(sid, (tab) => (splitArm ? openSplit(tab, splitArm.dir, 'after') : addTab(tab)))}
            onPickInspector={pickInspector}
            onCancel={tabs.length === 0 ? null : () => {
              setPickerOpen(false);
              setSplitArm(null);
            }}
          />
        ) : active ? (
          <PaneErrorBoundary paneName={active.title}>
            <PaneTabContent
              tab={active}
              ctx={ctx}
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
  return types.includes(PANE_TAB_MIME) || types.includes(SESSION_DRAG_MIME) || types.includes(FILE_DRAG_MIME) || types.includes('text/plain');
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
  onSelect,
  onClose,
  onAdd,
  onArmSplit,
  onClosePane,
}: {
  tabs: PaneTab[];
  activeTabId: string | null;
  paneId: string;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onAdd: () => void;
  onArmSplit: (dir: 'row' | 'col') => void;
  onClosePane: () => void;
}) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-0.5 border-b bg-[#FDFCFB] px-1 dark:bg-muted/40">
      <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              data-pane-tab={tab.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(PANE_TAB_MIME, encodeTabMove(paneId, tab));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => onSelect(tab.id)}
              title={`${tab.title} — drag to another pane to move it`}
              className={`flex max-w-36 shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                isActive ? 'bg-[#262624] text-white dark:bg-white dark:text-black' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <TabIcon tab={tab} />
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
      <Button variant="ghost" size="sm" className="h-5 w-5 shrink-0 p-0" title="Open a tab (live sessions and tools)" onClick={onAdd}>
        <Plus className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="sm" className="h-5 w-5 shrink-0 p-0" title="Split into side-by-side columns" onClick={() => onArmSplit('row')}>
        <Columns2 className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="sm" className="h-5 w-5 shrink-0 p-0" title="Split into stacked rows" onClick={() => onArmSplit('col')}>
        <Rows2 className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="sm" className="h-5 w-5 shrink-0 p-0" title="Close this pane" onClick={onClosePane}>
        <X className="h-3 w-3" />
      </Button>
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
// as the sidebar; file tabs render a real read preview.
function PaneTabContent({
  tab,
  ctx,
  onOpenInspectorTab,
  onOpenSession,
}: {
  tab: PaneTab;
  ctx: PaneCtx;
  onOpenInspectorTab: (id: InspectorTabId) => void;
  onOpenSession?: (id: string) => void;
}) {
  if (tab.kind === 'session' && tab.sessionId) {
    return <ChatWithSocket key={tab.sessionId} sessionId={tab.sessionId} />;
  }
  if (tab.kind === 'inspector' && tab.inspectorId) {
    return (
      <div className="h-full overflow-auto p-2">
        <InspectorHost tab={tab.inspectorId} sessionId={ctx.sessionId} ws={ctx.ws} onOpenSession={onOpenSession} onOpenInspectorTab={onOpenInspectorTab} />
      </div>
    );
  }
  if (tab.kind === 'file' && tab.filePath && tab.sessionId && isValidRelPath(tab.filePath)) {
    return <PaneFilePreview sessionId={tab.sessionId} path={tab.filePath} />;
  }
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
      This tab lost its content and was kept closed rather than faked — close it and open a live tab.
    </div>
  );
}
