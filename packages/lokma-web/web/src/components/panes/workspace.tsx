import * as React from 'react';
import { createPortal } from 'react-dom';
import { usePaneStore } from '@/stores/pane';
import { useSessionStore } from '@/stores/session';
import type { UseWs } from '@/hooks/use-ws';
import { emitToast } from '@/components/shell';
import { SplitTree } from './split-tree';
import { WindowedCanvas, parseWindowedPos, WINDOWED_POS_KEY, type WindowPos } from './windowed-canvas';
import {
  clampWindowPos,
  fillWindowPos,
  snapEdgeForPoint,
  snapWindowPos,
  type CanvasBox,
} from './windowed-canvas';
import { FullscreenPlaceholder, PaneFullscreenModal } from './fullscreen-modal';
import { WorkspacePane } from './pane';
import {
  RESET_LAYOUT_EVENT,
  TILING_TABS_KEY,
  closeLayoutPane,
  collectPaneIds,
  countPanes,
  findLayoutNode,
  findParentNode,
  isPaneTab,
  isPaneUnder,
  makeFileTab,
  makePaneId,
  makeSessionTab,
  parseTabStates,
  resizeLayoutNode,
  serializeTabStates,
  splitLayout,
  type PaneTab,
  type PaneTabState,
  upsertFileTab,
  upsertInspectorTab,
  upsertSessionTab,
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
  const focusedPaneId = usePaneStore((s) => s.focusedPaneId);
  const focusPane = usePaneStore((s) => s.focusPane);
  const resetStoreLayout = usePaneStore((s) => s.resetLayout);
  const pendingFileTab = usePaneStore((s) => s.pendingFileTab);
  const consumeFileTab = usePaneStore((s) => s.consumeFileTab);
  const pendingFilePane = usePaneStore((s) => s.pendingFilePane);
  const consumeFilePane = usePaneStore((s) => s.consumeFilePane);
  const pendingSessionTab = usePaneStore((s) => s.pendingSessionTab);
  const consumeSessionTab = usePaneStore((s) => s.consumeSessionTab);
  const pendingInspectorTab = usePaneStore((s) => s.pendingInspectorTab);
  const consumeInspectorTab = usePaneStore((s) => s.consumeInspectorTab);

  const [tabStates, setTabStates] = React.useState<Record<string, PaneTabState>>(loadTabStates);
  // REQ-042: floating window positions+sizes persist across reloads.
  const [winPos, setWinPos] = React.useState<Record<string, WindowPos>>(loadWindowedPos);
  // REQ-096 — measured windowed-canvas box (ResizeObserver). Windows clamp,
  // maximize and edge-snap against it; {w:0} until the first report.
  const [canvasBox, setCanvasBox] = React.useState<CanvasBox>({ left: 0, top: 0, w: 0, h: 0 });
  const handleCanvasBox = React.useCallback((b: CanvasBox) => {
    setCanvasBox((prev) =>
      prev.left === b.left && prev.top === b.top && prev.w === b.w && prev.h === b.h ? prev : b,
    );
  }, []);
  // REQ-089: fullscreen modal shows a LIVE view of one layout subtree
  // (`root` node id; `origin` pane id for narrowing back after collapses).
  // Not persisted — a reload lands on the plain layout, never a stale modal.
  const [fullscreen, setFullscreen] = React.useState<{ root: string; origin: string } | null>(null);
  const closeFullscreen = React.useCallback(() => setFullscreen(null), []);
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
  }, [paneIds, sessionId, tabStates]);

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

  // REQ-042: windowed positions+sizes survive reload (validated on load —
  // corrupt rows drop via parseWindowedPos).
  React.useEffect(() => {
    try {
      localStorage.setItem(WINDOWED_POS_KEY, JSON.stringify(winPos));
    } catch {
      // Private-mode storage never breaks the workspace.
    }
  }, [winPos]);

  // REQ-002: Explorer file clicks land here as a tab in the last-focused
  // pane (same path+session focuses instead of duplicating). One-shot: the
  // request is consumed even when no pane exists (nothing to open into).
  React.useEffect(() => {
    if (!pendingFileTab) return;
    const target = paneIds.includes(focusedPaneId) ? focusedPaneId : paneIds[0];
    if (target) {
      const { path, sessionId: ownerId } = pendingFileTab;
      setTabStates((prev) => ({
        ...prev,
        [target]: upsertFileTab(prev[target] ?? { tabs: [], active: null }, path, ownerId),
      }));
      focusPane(target);
    }
    consumeFileTab();
  }, [pendingFileTab, paneIds, focusedPaneId, focusPane, consumeFileTab]);

  // REQ-005: session-list "Open as pane tab" requests land here as a tab in
  // the last-focused pane (same session focuses instead of duplicating).
  // One-shot: the request is consumed even when no pane exists.
  React.useEffect(() => {
    if (!pendingSessionTab) return;
    const target = paneIds.includes(focusedPaneId) ? focusedPaneId : paneIds[0];
    if (target) {
      const { sessionId: ownerId, title } = pendingSessionTab;
      setTabStates((prev) => ({
        ...prev,
        [target]: upsertSessionTab(prev[target] ?? { tabs: [], active: null }, ownerId, title),
      }));
      focusPane(target);
    }
    consumeSessionTab();
  }, [pendingSessionTab, paneIds, focusedPaneId, focusPane, consumeSessionTab]);

  // REQ-075: "open in new pane" — split the focused pane and drop a live
  // file tab into the fresh pane (files as first-class panes, like
  // sessions). One-shot: consumed even when no pane exists.
  React.useEffect(() => {
    if (!pendingFilePane) return;
    const target = paneIds.includes(focusedPaneId) ? focusedPaneId : paneIds[0];
    if (target) {
      const { path, sessionId: ownerId } = pendingFilePane;
      split(target, 'col', 'after', makeFileTab(path, ownerId));
    }
    consumeFilePane();
  }, [pendingFilePane, paneIds, focusedPaneId, consumeFilePane]);

  // REQ-057: agent UI actions ("open the browser/terminal for me") land here
  // as a tab in the last-focused pane (same inspector focuses instead of
  // duplicating). One-shot: consumed even when no pane exists.
  React.useEffect(() => {
    if (!pendingInspectorTab) return;
    const target = paneIds.includes(focusedPaneId) ? focusedPaneId : paneIds[0];
    if (target) {
      const { inspectorId } = pendingInspectorTab;
      setTabStates((prev) => ({
        ...prev,
        [target]: upsertInspectorTab(prev[target] ?? { tabs: [], active: null }, inspectorId),
      }));
      focusPane(target);
    }
    consumeInspectorTab();
  }, [pendingInspectorTab, paneIds, focusedPaneId, focusPane, consumeInspectorTab]);

  const tabsChange = (paneId: string, tabs: PaneTab[], active: string | null) => {
    setTabStates((prev) => ({ ...prev, [paneId]: { tabs, active } }));
  };

  const split = (targetPaneId: string, dir: 'row' | 'col', pos: 'before' | 'after', tab: PaneTab) => {
    const newPaneId = makePaneId();
    const next = splitLayout(layout, targetPaneId, dir, pos, newPaneId);
    setLayout(next);
    setTabStates((prev) => ({ ...prev, [newPaneId]: { tabs: [tab], active: tab.id } }));
    focusPane(newPaneId);
    // REQ-089: a split inside the fullscreen modal widens the modal root to
    // the fresh parent, so the new sibling appears INSIDE the modal (same
    // handlers serve the modal and the background — no forked logic).
    setFullscreen((f) => {
      if (!f || !isPaneUnder(next, f.root, targetPaneId)) return f;
      const parent = findParentNode(next, targetPaneId);
      return parent ? { ...f, root: parent.id } : f;
    });
  };

  // REQ-033 (concept parity): split buttons split IMMEDIATELY into an empty
  // pane whose picker offers live content — no arm-then-pick two-step.
  const splitEmpty = (targetPaneId: string, dir: 'row' | 'col') => {
    const newPaneId = makePaneId();
    const next = splitLayout(layout, targetPaneId, dir, 'after', newPaneId);
    setLayout(next);
    setTabStates((prev) => ({ ...prev, [newPaneId]: { tabs: [], active: null } }));
    focusPane(newPaneId);
    // REQ-089: the strip split buttons inside the modal widen like split().
    setFullscreen((f) => {
      if (!f || !isPaneUnder(next, f.root, targetPaneId)) return f;
      const parent = findParentNode(next, targetPaneId);
      return parent ? { ...f, root: parent.id } : f;
    });
  };

  const closePane = (paneId: string) => {
    const next = closeLayoutPane(layout, paneId);
    if (!next) {
      const fresh = makePaneId();
      setLayout({ type: 'pane', id: fresh });
      setTabStates({ [fresh]: { tabs: [], active: null } });
      setWinPos({});
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
    // REQ-042: drop saved geometry for closed windows so the persisted map
    // never grows stale entries.
    setWinPos((prev) => {
      const pruned: Record<string, WindowPos> = {};
      for (const [pid, p] of Object.entries(prev)) if (alive.has(pid)) pruned[pid] = p;
      return pruned;
    });
    if (!alive.has(focusedPaneId)) focusPane([...alive][0]);
  };

  const moveTab = (tab: PaneTab, fromPaneId: string, toPaneId: string, edge: { dir: 'row' | 'col'; pos: 'before' | 'after' } | null) => {
    if (!isPaneTab(tab)) return;
    if (edge) {
      const newPaneId = makePaneId();
      const next = splitLayout(layout, toPaneId, edge.dir, edge.pos, newPaneId);
      setLayout(next);
      setTabStates((prev) => {
        const nextStates = { ...prev };
        const src = nextStates[fromPaneId];
        if (src) {
          const kept = src.tabs.filter((t) => t.id !== tab.id);
          nextStates[fromPaneId] = { tabs: kept, active: src.active === tab.id ? (kept[kept.length - 1]?.id ?? null) : src.active };
        }
        nextStates[newPaneId] = { tabs: [tab], active: tab.id };
        return nextStates;
      });
      focusPane(newPaneId);
      // REQ-089: an edge-drop split inside the modal widens like split().
      setFullscreen((f) => {
        if (!f || !isPaneUnder(next, f.root, toPaneId)) return f;
        const parent = findParentNode(next, newPaneId);
        return parent ? { ...f, root: parent.id } : f;
      });
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

  // REQ-046 — per-pane pop-out: the strip button floats this pane as an
  // independent window. The windowed canvas reuses the REQ-014 solid
  // surface plus the REQ-042 drag/resize handles, so entering windowed
  // mode plus a cascaded geometry slot is the whole move.
  // REQ-095 — the same strip button toggles back: already windowed →
  // setWindowed(false) so the layout returns to normal tiling. Geometry
  // is kept, never reset, so re-floating restores the same spot.
  const popoutPane = (paneId: string) => {
    setWinPos((prev) => {
      if (prev[paneId]) return prev;
      const n = Object.keys(prev).length % 8;
      return { ...prev, [paneId]: { 'x': 24 + n * 28, 'y': 24 + n * 28, 'w': 560, 'h': 420 } };
    });
    focusPane(paneId);
    if (!windowed) {
      setWindowed(true);
      emitToast('Pane popped out — drag the title bar to move, edges to resize');
    } else {
      setWindowed(false);
      emitToast('Back to tiling layout');
    }
  };

  // REQ-089 — per-pane fullscreen: the strip button roots the modal at this
  // pane. Already fullscreen → re-root (narrows back to one pane).
  const openFullscreen = (paneId: string) => {
    focusPane(paneId);
    setFullscreen({ root: paneId, origin: paneId });
  };

  // REQ-089: a collapsed root narrows back to the origin pane; a closed
  // origin closes the modal. The layout itself is never touched here.
  React.useEffect(() => {
    if (!fullscreen) return;
    if (!findLayoutNode(layout, fullscreen.root)) {
      if (collectPaneIds(layout).includes(fullscreen.origin)) {
        setFullscreen({ root: fullscreen.origin, origin: fullscreen.origin });
      } else {
        setFullscreen(null);
      }
    }
  }, [layout, fullscreen]);

  // REQ-045 — the TilingBar Reset button moved to the AppShell mode
  // cluster; the handler stays here where the tab/window state lives.
  // Dispatched as RESET_LAYOUT_EVENT, same pattern as FOCUS_FILES_EVENT.
  React.useEffect(() => {
    const onReset = () => {
      resetStoreLayout();
      setTabStates({});
      setWinPos({});
      setFullscreen(null);
      try {
        localStorage.removeItem(TILING_TABS_KEY);
        localStorage.removeItem(WINDOWED_POS_KEY);
      } catch {
        // Private-mode storage never breaks reset.
      }
      emitToast('Layout reset to the default 3-pane view');
    };
    window.addEventListener(RESET_LAYOUT_EVENT, onReset);
    return () => window.removeEventListener(RESET_LAYOUT_EVENT, onReset);
  }, [resetStoreLayout]);

  const renderPaneLive = (paneId: string) => {
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
        onSplitEmpty={splitEmpty}
        onClosePane={closePane}
        onMoveTab={moveTab}
        onOpenSession={onOpenSession}
        onPopout={popoutPane}
        onFullscreen={openFullscreen}
      />
    );
  };

  // REQ-089: panes under the fullscreen root render as placeholders in the
  // background (same slot, no geometry shift, nothing mounted twice). The
  // live pane renders only inside the modal. Mount boundary contract matches
  // tab switches: tab/layout state persists (workspace state + localStorage),
  // in-tab drafts are ephemeral.
  const renderPane = (paneId: string) => {
    if (fullscreen && isPaneUnder(layout, fullscreen.root, paneId)) {
      const st = states[paneId];
      const current = st?.tabs.find((t) => t.id === st.active) ?? st?.tabs[0];
      return <FullscreenPlaceholder title={current ? current.title : 'Empty pane'} onExit={closeFullscreen} />;
    }
    return renderPaneLive(paneId);
  };

  const paneTitles = paneIds.map((pid) => {
    const st = states[pid];
    const current = st?.tabs.find((t) => t.id === st.active) ?? st?.tabs[0];
    return { id: pid, title: current ? current.title : 'Empty pane' };
  });

  // REQ-096 — render positions clamped to the measured canvas so stale
  // persisted geometry can never park a window outside the visible box.
  const clampedWinPos = React.useMemo(() => {
    const out: Record<string, WindowPos> = {};
    for (const pid of paneIds) {
      out[pid] = clampWindowPos(winPos[pid] ?? { x: 24, y: 24, w: 560, h: 420 }, canvasBox);
    }
    return out;
  }, [winPos, canvasBox, paneIds]);

  const onWinDragStart = (winId: string, x: number, y: number) => {
    const box = canvasBox;
    const orig = clampWindowPos(winPos[winId] ?? { x: 24, y: 24, w: 560, h: 420 }, box);
    dragWin.current = { id: winId, startX: x, startY: y, origX: orig.x, origY: orig.y };
    const move = (ev: PointerEvent) => {
      const drag = dragWin.current;
      if (!drag || drag.id !== winId) return;
      const nx = Math.max(0, drag.origX + ev.clientX - drag.startX);
      const ny = Math.max(0, drag.origY + ev.clientY - drag.startY);
      setWinPos((prev) => {
        const cur = prev[winId] ?? orig;
        return { ...prev, [winId]: clampWindowPos({ ...cur, x: nx, y: ny }, box) };
      });
    };
    const up = (ev: PointerEvent) => {
      dragWin.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // REQ-096 — release near a canvas edge snaps Windows-style.
      const edge = snapEdgeForPoint(box, ev.clientX, ev.clientY);
      if (edge) {
        setWinPos((prev) => ({ ...prev, [winId]: snapWindowPos(box, edge) }));
        emitToast(edge === 'top' ? 'Window maximized' : `Window snapped ${edge}`);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // REQ-089: the modal is a live view of the root subtree, resolved fresh on
  // every render (splits widen the root via split()/moveTab; collapses
  // narrow it via the effect above — an unresolvable root renders nothing
  // until the effect narrows/closes). Portaled to body so no ancestor
  // transform/overflow can clip the viewport overlay.
  const fullscreenSub = fullscreen ? findLayoutNode(layout, fullscreen.root) : null;
  const fullscreenTitle = fullscreen
    ? (paneTitles.find((p) => p.id === fullscreen.origin)?.title ?? 'Pane')
    : '';

  // REQ-045 — the TilingBar strip is gone (tool buttons live on the rail,
  // splits on the pane strip). The workspace renders only the live layout.
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {windowed ? (
          <WindowedCanvas
            panes={paneTitles}
            pos={clampedWinPos}
            renderPane={renderPane}
            onBox={handleCanvasBox}
            onDragStart={onWinDragStart}
            onResize={(winId, next) =>
              setWinPos((prev) => {
                const cur = prev[winId] ?? { 'x': 24, 'y': 24, 'w': 560, 'h': 420 };
                return { ...prev, [winId]: clampWindowPos({ ...cur, ...next }, canvasBox) };
              })
            }
            onMaximize={(winId) =>
              // REQ-096 — fill the measured canvas (was a fixed 1100x680,
              // which left the bottom empty on tall screens).
              setWinPos((prev) => ({
                ...prev,
                [winId]: canvasBox.w > 0 ? fillWindowPos(canvasBox) : { x: 8, y: 8, w: 1100, h: 680 },
              }))
            }
            onClose={closePane}
          />
        ) : (
          <SplitTree node={layout} renderPane={renderPane} onResize={(nodeId, sizes) => setLayout(resizeLayoutNode(layout, nodeId, sizes))} />
        )}
      </div>
      {fullscreen && fullscreenSub
        ? createPortal(
            <PaneFullscreenModal title={fullscreenTitle} onClose={closeFullscreen}>
              {fullscreenSub.type === 'pane' ? (
                <div className="flex min-h-0 min-w-0 flex-1">{renderPaneLive(fullscreenSub.id)}</div>
              ) : (
                <SplitTree
                  node={fullscreenSub}
                  renderPane={renderPaneLive}
                  onResize={(nodeId, sizes) => setLayout(resizeLayoutNode(layout, nodeId, sizes))}
                />
              )}
            </PaneFullscreenModal>,
            document.body,
          )
        : null}
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

function loadWindowedPos(): Record<string, WindowPos> {
  try {
    return parseWindowedPos(JSON.parse(localStorage.getItem(WINDOWED_POS_KEY) ?? 'null'));
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
