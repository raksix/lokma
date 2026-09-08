/**
 * Panes barrel — the W7 pane system (concept `layout/Pane.tsx` + `panes/*`
 * ported onto live harness surfaces). Single import point for the tiling
 * workspace, its frames, and the pure helpers with their probe.
 */
export {
  INSPECTOR_DRAG_MIME,
  INSPECTOR_TABS,
  PANE_TAB_MIME,
  SESSION_DRAG_MIME,
  TILING_BAR_TABS,
  TILING_TABS_KEY,
  appendLayoutPane,
  closeLayoutPane,
  collectPaneIds,
  countPanes,
  dropZoneFor,
  encodeInspectorDrag,
  encodeTabMove,
  inspectorLabel,
  isInspectorTabId,
  isPaneTab,
  isRailDropId,
  isValidRelPath,
  isValidSessionId,
  makeFileTab,
  makeInspectorTab,
  makePaneId,
  makeSessionTab,
  makeTabId,
  parseFileDrop,
  parseInspectorDrop,
  parseSessionDrop,
  parseTabMove,
  parseTabStates,
  resizeLayoutNode,
  serializeTabStates,
  splitForZone,
  splitLayout,
  type DropZone,
  type InspectorTabId,
  type PaneTab,
  type PaneTabKind,
  type PaneTabState,
  type RailDropId,
} from './panes';
export { WorkspacePane, PaneFilePreview, PaneTabPicker, SessionDropChooser, formatBytes, type PaneCtx } from './pane';
export { SplitTree } from './split-tree';
export { WindowedCanvas, parseWindowedPos, WINDOWED_POS_KEY, WINDOWED_MIN_W, WINDOWED_MIN_H, type WindowPos } from './windowed-canvas';
export { TilingBar, TAB_ICONS } from './tiling-bar';
export { InspectorHost } from './inspector-host';
export { TilingWorkspace } from './workspace';
