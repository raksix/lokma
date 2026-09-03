import * as React from 'react';
import { usePaneStore } from '@/stores/pane';
import { useSessionStore } from '@/stores/session';
import type { UseWs } from '@/hooks/use-ws';
import { emitToast } from '@/components/shell';
import { SplitTree } from './split-tree';
import { WindowedCanvas, type WindowPos } from './windowed-canvas';
import { TilingBar } from './tiling-bar';
import { WorkspacePane } from './pane';
import {
  TILING_TABS_KEY,
  appendLayoutPane,
  closeLayoutPane,
  collectPaneIds,
  countPanes,
  isPaneTab,
  makeInspectorTab,
  makePaneId,
  makeSessionTab,
  parseTabStates,
  resizeLayoutNode,
  serializeTabStates,
  splitLayout,
  type InspectorTabId,
  type PaneTab,
  type PaneTabState,
} from './panes';

// TilingWorkspace: the W7 pane system inside the harness center column.
// Owns per-pane tabs (persisted to lokma:tiling-tabs:v1; the tree itself
// lives in the paneStore lokma:layout:v1 key). Session tabs render their
// own Chat+socket; tool panes share the workspace session; file tabs carry
// the session that owns their working directory.
export function TilingWorkspace({
  sessionId,
  ws,
  onOpenSession,
}: {
  sessionId: string;
  ws: UseWs;
  onOpenSession: (id: string) => void;
}) {
  const layout = usePaneStore((s) => s.layout);
  const setLayout = usePaneStore((s) => s.setLayout);
  const windowed = usePaneStore((s) => s.windowed);
  const setWindowed = usePaneStore((s) => s.setWindowed);
  const setTiling = usePaneStore((s) => s.setTiling);
  const focusedPaneId = usePaneStore((s) => s.focusedPaneId);
  const focusPane = usePaneStore((s) => s.focusPane);
  const resetStoreLayout = usePaneStore((s) => s.resetLayout);

  const [tabStates, setTabStates] = React.useState<Record<string, PaneTabState>>(loadTabStates);
  const [winPos, setWinPos] = React.useState<Record<string, WindowPos>>({});
  const dragWin = React.useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const paneIds = React.useMemo(() => collectPaneIds(layout), [layout]);

  // New panes (splits, appends) start empty; the first pane re-opens the
  // workspace session so tiling is never a blank wall on first entry.
  const ensured = React.useMemo(() => {
    const next: Record<string, PaneTabState> = { ...tabStates };
    let changed = false;
    paneIds.forEach((pid, i) => {
      if (!next[pid]) {
        next[pid] =
          i === 0 && sessionId
            ? { tabs: [makeSessionTab(sessionId, sessionTitle(sessionId))], active: null }
            : { tabs: [], active: null };
        if (next[pid].tabs.length > 0) next[pid] = { tabs: next[pid].tabs, active: next[pid].tabs[0].id };
        changed = true;
      }
    });
    return { states: next, changed };
  }, [paneIds, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (ensured.changed) setTabStates(ensured.states);
  }, [ensured]);

  const states = ensured.states;

  // Persist tab snapshots (validated on load — corrupt rows drop).
  React.useEffect(() => {
    try {
      const pruned: Record<string, PaneTabState> = {};
      for (const pid of paneIds) {
        const st = states[pid];
        if (st && st.tabs.length > 0) pruned[pid] = st;
      }
      localStorage.setItem(TILING_TABS_KEY, serializeTabStates(pruned));
    } catch {
      // Private-mode storage never breaks the workspace.
    }
  }, [states, paneIds]);

  const tabCount = paneIds.reduce((n, pid) => n + (states[pid]?.tabs.length ?? 0), 0);

  const tabsChange = (paneId: string, tabs: PaneTab[], active: string | null) => {
    setTabStates((prev) => ({ ...prev, [paneId]: { tabs, active } }));
  };

  const split = (targetPaneId: string, dir: 'row' | 'col', pos: 'before' | 'after', tab: PaneTab) => {
    const newPaneId = makePaneId();
    setLayout(splitLayout(layout, targetPaneId, dir, pos, newPaneId));
    setTabStates((prev) => ({ ...prev, [newPaneId]: { tabs: [tab], active: tab.id } }));
    focusPane(newPaneId);
  };

  const closePane = (paneId: string) => {
    const next = closeLayoutPane(layout, paneId);
    if (!next) {
      const fresh = makePaneId();
      setLayout({ type: 'pane', id: fresh });
      setTabStates({ [fresh]: { tabs: [], active: null } });
      focusPane(fresh);
      return;
    }
    setLayout(next);
    const alive = new Set(collectPaneIds(next));
    setTabStates((prev) => {
      const pruned: Record<string, PaneTabState> = {};
      for (const [pid, st] of Object.entries(prev)) if (alive.has(pid)) pruned[pid] = st;
      return pruned;
    });
    if (!alive.has(focusedPaneId)) focusPane([...alive][0]);
  };

  const moveTab = (tab: PaneTab, fromPaneId: string, toPaneId: string, edge: { dir: 'row' | 'col'; pos: 'before' | 'after' } | null) => {
    if (!isPaneTab(tab)) return;
    if (edge) {
      const newPaneId = makePaneId();
      setLayout(splitLayout(layout, toPaneId, edge.dir, edge.pos, newPaneId));
      setTabStates((prev) => {
        const next = { ...prev };
        const src = next[fromPaneId];
        if (src) {
          const kept = src.tabs.filter((t) => t.id !== tab.id);
          next[fromPaneId] = { tabs: kept, active: src.active === tab.id ? (kept[kept.length - 1]?.id ?? null) : src.active };
        }
        next[newPaneId] = { tabs: [tab], active: tab.id };
        return next;
      });
      focusPane(newPaneId);
      return;
    }
    setTabStates((prev) => {
      const next = { ...prev };
      const src = next[fromPaneId];
      if (src) {
        const kept = src.tabs.filter((t) => t.id !== tab.id);
        next[fromPaneId] = { tabs: kept, active: src.active === tab.id ? (kept[kept.length - 1]?.id ?? null) : src.active };
      }
      const dst = next[toPaneId] ?? { tabs: [], active: null };
      if (!dst.tabs.some((t) => t.id === tab.id)) dst.tabs = [...dst.tabs, tab];
      next[toPaneId] = { tabs: dst.tabs, active: tab.id };
      return next;
    });
    focusPane(toPaneId);
  };

  const openInspector = (inspectorId: InspectorTabId) => {
    const tab = makeInspectorTab(inspectorId);
    const newPaneId = makePaneId();
    setLayout(appendLayoutPane(layout, newPaneId));
    setTabStates((prev) => ({ ...prev, [newPaneId]: { tabs: [tab], active: tab.id } }));
    focusPane(newPaneId);
  };

  const addPane = () => {
    const newPaneId = makePaneId();
    setLayout(appendLayoutPane(layout, newPaneId));
    setTabStates((prev) => ({ ...prev, [newPaneId]: { tabs: [], active: null } }));
    focusPane(newPaneId);
  };

  const save = () => {
    emitToast(`Layout saved — ${paneIds.length} ${paneIds.length === 1 ? 'pane' : 'panes'}, ${tabCount} ${tabCount === 1 ? 'tab' : 'tabs'}`);
  };

  const reset = () => {
    resetStoreLayout();
    setTabStates({});
    setWinPos({});
    try {
      localStorage.removeItem(TILING_TABS_KEY);
    } catch {
      // Private-mode storage never breaks reset.
    }
    emitToast('Layout reset to the default 3-pane view');
  };
  const renderPane = (paneId: string) => {
    const st = states[paneId] ?? { tabs: [], active: null };
    return (
      <WorkspacePane
        id={paneId}
        tabs={st.tabs}
        activeTabId={st.active}
        ctx={{ sessionId, ws, onOpenSession }}
        isFocused={focusedPaneId === paneId}
        onFocus={focusPane}
        onTabsChange={tabsChange}
        onSplit={split}
        onClosePane={closePane}
        onMoveTab={moveTab}
        onOpenSession={onOpenSession}
      />
    );
  };

  const paneTitles = paneIds.map((pid) => {
    const st = states[pid];
    const current = st?.tabs.find((t) => t.id === st.active) ?? st?.tabs[0];
    return { id: pid, title: current ? current.title : 'Empty pane' };
  });

  const onWinDragStart = (winId: string, x: number, y: number) => {
    const orig = winPos[winId] ?? { x: 24, y: 24, w: 560, h: 420 };
    dragWin.current = { id: winId, startX: x, startY: y, origX: orig.x, origY: orig.y };
    const move = (ev: PointerEvent) => {
      const drag = dragWin.current;
      if (!drag || drag.id !== winId) return;
      const nx = Math.max(0, drag.origX + ev.clientX - drag.startX);
      const ny = Math.max(0, drag.origY + ev.clientY - drag.startY);
      setWinPos((prev) => ({ ...prev, [winId]: { ...prev[winId], x: nx, y: ny } }));
    };
    const up = () => {
      dragWin.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <TilingBar
        paneCount={paneIds.length}
        tabCount={tabCount}
        windowed={windowed}
        onToggleWindowed={() => setWindowed(!windowed)}
        onOpenInspector={openInspector}
        onAddPane={addPane}
        onSave={save}
        onReset={reset}
        onSingle={() => setTiling(false)}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {windowed ? (
          <WindowedCanvas
            panes={paneTitles}
            pos={winPos}
            renderPane={renderPane}
            onDragStart={onWinDragStart}
            onResize={(winId, w, h) => setWinPos((prev) => ({ ...prev, [winId]: { ...prev[winId], w, h } }))}
            onMaximize={(winId) => setWinPos((prev) => ({ ...prev, [winId]: { x: 8, y: 8, w: 1100, h: 680 } }))}
            onClose={closePane}
          />
        ) : (
          <SplitTree node={layout} renderPane={renderPane} onResize={(nodeId, sizes) => setLayout(resizeLayoutNode(layout, nodeId, sizes))} />
        )}
      </div>
      <div className="shrink-0 text-center text-[11px] text-muted-foreground">
        Session tabs run their own chat. Tool panes share this workspace session. Drag sessions or files here to open, split, fork, or merge.
      </div>
    </div>
  );
}

function loadTabStates(): Record<string, PaneTabState> {
  try {
    return parseTabStates(localStorage.getItem(TILING_TABS_KEY));
  } catch {
    return {};
  }
}

function sessionTitle(id: string): string {
  try {
    const found = useSessionStore.getState().sessions.find((s) => s.id === id);
    return found?.title || id;
  } catch {
    return id;
  }
}
