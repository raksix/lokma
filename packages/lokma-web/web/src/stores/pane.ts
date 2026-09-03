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

type PaneState = {
  layout: LayoutNode;
  leftW: number;
  rightW: number;
  tiling: boolean;
  windowed: boolean;
  openTabs: OpenTab[];
  focusedPaneId: string;
  activeSessionId: string | null;
  setLayout: (layout: LayoutNode) => void;
  setSideWidth: (side: 'left' | 'right', width: number) => void;
  setTiling: (on: boolean) => void;
  setWindowed: (on: boolean) => void;
  openTab: (tab: OpenTab) => void;
  closeTab: (id: string) => void;
  focusPane: (id: string) => void;
  setActiveSession: (id: string | null) => void;
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
