/**
 * paneStore — layout tree + open tabs + active session, persisted to the same
 * `lokma:layout:v1` key the concept design uses (same shape, version-guarded).
 * Only serializable chrome state is persisted; pane contents always reload
 * from the server (sessionStore / providerStore / agentStore).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from './storage';
import {
  DEFAULT_LEFT_WIDTH,
  DEFAULT_RIGHT_WIDTH,
  LAYOUT_SCHEMA_VERSION,
  LAYOUT_STORAGE_KEY,
  defaultLayout,
  isLayoutNode,
  type LayoutNode,
  type OpenTab,
} from './layout';

export type { LayoutNode, OpenTab };

/** One-shot file-open request from the Explorer (consumed by TilingWorkspace, never persisted). */
export type PendingFileTab = {
  path: string;
  sessionId: string;
};

/** One-shot session-open request from the session list (REQ-005, consumed by TilingWorkspace, never persisted). */
export type PendingSessionTab = {
  sessionId: string;
  title: string;
};

/** One-shot file-in-new-pane request (REQ-075, consumed by TilingWorkspace, never persisted). */
export type PendingFilePane = {
  path: string;
  sessionId: string;
};

/**
 * One-shot inspector-open request from agent UI actions (REQ-057, consumed by
 * TilingWorkspace, never persisted). REQ-145 — `side` asks the workspace to
 * dock the inspector as a right-hand pane ("open to the side") instead of
 * stacking another tab into whichever pane happens to be focused.
 */
export type PendingInspectorTab = {
  inspectorId: 'browser' | 'terminal';
  side?: boolean;
};

/**
 * One-shot "the agent opened/reused a browser tab" signal (REQ-146, consumed
 * by the BrowserPane bound to the same session, never persisted). The tool
 * already did the server-side work; the open pane refreshes its list and
 * selects `tabId` so the visible address bar + page follow the agent's URL
 * instead of leaving a stale page (and a second tab) on screen.
 */
export type PendingBrowserOpen = {
  tabId: string;
  url: string;
  sessionId: string;
};

type PaneState = {
  layout: LayoutNode;
  leftW: number;
  rightW: number;
  tiling: boolean;
  windowed: boolean;
  openTabs: OpenTab[];
  focusedPaneId: string;
  activeSessionId: string | null;
  pendingFileTab: PendingFileTab | null;
  pendingFilePane: PendingFilePane | null;
  pendingSessionTab: PendingSessionTab | null;
  pendingInspectorTab: PendingInspectorTab | null;
  pendingBrowserOpen: PendingBrowserOpen | null;
  setLayout: (layout: LayoutNode) => void;
  setSideWidth: (side: 'left' | 'right', width: number) => void;
  setTiling: (on: boolean) => void;
  setWindowed: (on: boolean) => void;
  openTab: (tab: OpenTab) => void;
  closeTab: (id: string) => void;
  focusPane: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  requestFileTab: (path: string, sessionId: string) => void;
  consumeFileTab: () => void;
  requestFilePane: (path: string, sessionId: string) => void;
  consumeFilePane: () => void;
  requestSessionTab: (sessionId: string, title: string) => void;
  consumeSessionTab: () => void;
  requestInspectorTab: (inspectorId: 'browser' | 'terminal', side?: boolean) => void;
  consumeInspectorTab: () => void;
  requestBrowserOpen: (payload: PendingBrowserOpen) => void;
  consumeBrowserOpen: () => void;
  resetLayout: () => void;
};

const initial = {
  layout: defaultLayout(),
  leftW: DEFAULT_LEFT_WIDTH,
  rightW: DEFAULT_RIGHT_WIDTH,
  tiling: false,
  windowed: false,
  openTabs: [] as OpenTab[],
  focusedPaneId: 'a',
  activeSessionId: null as string | null,
  pendingFileTab: null as PendingFileTab | null,
  pendingFilePane: null as PendingFilePane | null,
  pendingSessionTab: null as PendingSessionTab | null,
  pendingInspectorTab: null as PendingInspectorTab | null,
  pendingBrowserOpen: null as PendingBrowserOpen | null,
};

export const usePaneStore = create<PaneState>()(
  persist(
    (set) => ({
      ...initial,

      setLayout: (layout: LayoutNode) => {
        if (isLayoutNode(layout)) set({ layout });
      },

      setSideWidth: (side: 'left' | 'right', width: number) => {
        if (!Number.isFinite(width) || width < 160 || width > 640) return;
        set(side === 'left' ? { leftW: Math.round(width) } : { rightW: Math.round(width) });
      },

      setTiling: (on: boolean) => set({ tiling: on }),
      setWindowed: (on: boolean) => set({ windowed: on }),

      openTab: (tab: OpenTab) => {
        set((prev) => ({
          openTabs: prev.openTabs.some((t) => t.id === tab.id)
            ? prev.openTabs.map((t) => (t.id === tab.id ? tab : t))
            : [...prev.openTabs, tab],
        }));
      },

      closeTab: (id: string) => {
        set((prev) => ({ openTabs: prev.openTabs.filter((t) => t.id !== id) }));
      },

      focusPane: (id: string) => set({ focusedPaneId: id }),
      setActiveSession: (id: string | null) => set({ activeSessionId: id }),

      requestFileTab: (path: string, sessionId: string) => set({ pendingFileTab: { path, sessionId } }),
      consumeFileTab: () => set({ pendingFileTab: null }),

      requestFilePane: (path: string, sessionId: string) => set({ pendingFilePane: { path, sessionId } }),
      consumeFilePane: () => set({ pendingFilePane: null }),

      requestSessionTab: (sessionId: string, title: string) => set({ pendingSessionTab: { sessionId, title } }),
      consumeSessionTab: () => set({ pendingSessionTab: null }),

      requestInspectorTab: (inspectorId: 'browser' | 'terminal', side = false) =>
        set({ pendingInspectorTab: side ? { inspectorId, side: true } : { inspectorId } }),
      consumeInspectorTab: () => set({ pendingInspectorTab: null }),

      // REQ-146 — the agent navigated/reused the session's browser tab; the
      // matching pane pulls the fresh list and follows that tab.
      requestBrowserOpen: (payload: PendingBrowserOpen) => set({ pendingBrowserOpen: payload }),
      consumeBrowserOpen: () => set({ pendingBrowserOpen: null }),

      resetLayout: () => set({ ...initial, layout: defaultLayout(), openTabs: [] }),
    }),
    {
      name: LAYOUT_STORAGE_KEY,
      version: LAYOUT_SCHEMA_VERSION,
      storage: createJSONStorage(() => safeStorage),
      // Persist chrome only — open tabs are session-scoped and rehydrate
      // from the server-backed stores instead.
      partialize: (s) => ({
        layout: s.layout,
        leftW: s.leftW,
        rightW: s.rightW,
        tiling: s.tiling,
        windowed: s.windowed,
        activeSessionId: s.activeSessionId,
      }),
      // Version mismatch or corrupt shape → clean defaults (never crash boot).
      migrate: (persisted: unknown) => {
        const p = (persisted ?? {}) as Partial<typeof initial>;
        return {
          ...initial,
          layout: isLayoutNode(p.layout) ? p.layout : defaultLayout(),
          leftW: typeof p.leftW === 'number' ? p.leftW : DEFAULT_LEFT_WIDTH,
          rightW: typeof p.rightW === 'number' ? p.rightW : DEFAULT_RIGHT_WIDTH,
          tiling: p.tiling === true,
          windowed: p.windowed === true,
          activeSessionId: typeof p.activeSessionId === 'string' ? p.activeSessionId : null,
        };
      },
    },
  ),
);
