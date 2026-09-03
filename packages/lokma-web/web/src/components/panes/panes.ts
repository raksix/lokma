/**
 * Pane-system pure helpers (W7-27) — ported from the frozen concept design
 * (`concept/src/App.tsx` shell state + `concept/src/components/layout/Pane.tsx`
 * drop/split logic + `concept/src/components/panes/*`).
 *
 * Everything here is UI-framework-free so it runs under `bun` probes.
 * Rendering lives in `pane.tsx` / `split-tree.tsx` / `windowed-canvas.tsx` /
 * `tiling-bar.tsx` / `workspace.tsx`. No mock content is ever produced here —
 * every factory carries a real session id, inspector id, or file path.
 */
import type { LayoutNode } from '@/stores/layout';

/** Drag MIME type for session rows (same wire as the sessions sidebar). */
export const SESSION_DRAG_MIME = 'application/x-lokma-session';

/** Tab-bar drag payload MIME (a whole real tab moving between panes). */
export const PANE_TAB_MIME = 'application/x-lokma-tab';

/** localStorage key for the per-pane tab snapshot (layout tree itself lives in `lokma:layout:v1`). */
export const TILING_TABS_KEY = 'lokma:tiling-tabs:v1';

/** Every Inspector tab the tiling bar can open (single source — mirrors the right Inspector). */
export const INSPECTOR_TABS = [
  { id: 'info', label: 'Info' },
  { id: 'providers', label: 'Providers' },
  { id: 'models', label: 'Models' },
  { id: 'usage', label: 'Usage' },
  { id: 'settings', label: 'Settings' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'git', label: 'Git' },
  { id: 'browser', label: 'Browser' },
  { id: 'agents', label: 'Agents' },
  { id: 'orchestration', label: 'Orchestration' },
  { id: 'vault', label: 'Vault' },
  { id: 'skills', label: 'Skills' },
  { id: 'archify', label: 'Archify' },
  { id: 'design', label: 'Design' },
  { id: 'testing', label: 'Testing' },
  { id: 'bots', label: 'Bots' },
  { id: 'auth', label: 'Auth' },
  { id: 'setup', label: 'Setup' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'observability', label: 'Observability' },
  { id: 'cron', label: 'Cron' },
  { id: 'extras', label: 'Extras' },
] as const;

export type InspectorTabId = (typeof INSPECTOR_TABS)[number]['id'];

/** The 18 concept TilingBar entries (concept prop names kept as comments). */
export const TILING_BAR_TABS: InspectorTabId[] = [
  'terminal', // onOpenTerminal
  'orchestration', // onOpenAgents (concept opens OrchestrationPane)
  'git', // onOpenGit
  'vault', // onOpenVault
  'archify', // onOpenArchify
  'design', // onOpenDesign
  'usage', // onOpenUsage
  'settings', // onOpenSettings
  'skills', // onOpenSkills
  'testing', // onOpenTesting
  'bots', // onOpenBots
  'agents', // onOpenHub (concept opens AgentHubPane)
  'auth', // onOpenAuth
  'setup', // onOpenSetup
  'plugins', // onOpenPlugins
  'observability', // onOpenObservability
  'cron', // onOpenCron
  'extras', // onOpenExtras
  'browser', // harness addition (W3-12 per-agent tabs)
];

export function isInspectorTabId(value: unknown): value is InspectorTabId {
  return typeof value === 'string' && (INSPECTOR_TABS as readonly { id: string }[]).some((t) => t.id === value);
}

export function inspectorLabel(id: InspectorTabId): string {
  return INSPECTOR_TABS.find((t) => t.id === id)?.label ?? id;
}

/** What a tiling tab points at — always a live surface, never mock content. */
export type PaneTabKind = 'session' | 'inspector' | 'file';

export type PaneTab = {
  id: string;
  title: string;
  kind: PaneTabKind;
  /** Live session id (session tabs render a real Chat; file tabs resolve cwd from this session). */
  sessionId?: string;
  /** Inspector tab id (inspector tabs render the real pane). */
  inspectorId?: InspectorTabId;
  /** Workspace-relative file path (file tabs render a real read preview). */
  filePath?: string;
};

export type PaneTabState = { tabs: PaneTab[]; active: string | null };

let tabSeq = 0;

/** Unique tab id (prefix keeps tab-bar drag payloads recognizable). */
export function makeTabId(prefix = 'tab'): string {
  tabSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${tabSeq.toString(36)}`;
}

/** Unique pane id (same shape as the concept `genId`). */
export function makePaneId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
}

export function makeSessionTab(sessionId: string, title?: string): PaneTab {
  const short = sessionId.length > 24 ? `${sessionId.slice(0, 24)}…` : sessionId;
  return { id: makeTabId('tab-session'), title: title ?? short, kind: 'session', sessionId };
}

export function makeInspectorTab(inspectorId: InspectorTabId): PaneTab {
  return {
    id: makeTabId('tab-tool'),
    title: inspectorLabel(inspectorId),
    kind: 'inspector',
    inspectorId,
  };
}

export function makeFileTab(filePath: string, sessionId: string): PaneTab {
  const base = filePath.split('/').pop() || filePath;
  return { id: makeTabId('tab-file'), title: base, kind: 'file', filePath, sessionId };
}

/** Runtime guard for persisted / drag-carried tabs (corrupt rows are dropped, never rendered). */
export function isPaneTab(value: unknown): value is PaneTab {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  if (typeof t.id !== 'string' || typeof t.title !== 'string') return false;
  if (t.kind === 'session') return typeof t.sessionId === 'string' && t.sessionId.length > 0;
  if (t.kind === 'inspector') return isInspectorTabId(t.inspectorId);
  if (t.kind === 'file') return typeof t.filePath === 'string' && typeof t.sessionId === 'string';
  return false;
}

/** Session ids are server-minted slugs (`sess_*`, agent ids, …) — never paths. */
export function isValidSessionId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id);
}

/** Workspace-relative file path (mirrors the server `resolveInRoot` jail, loosely). */
export function isValidRelPath(path: string): boolean {
  if (!path || path.length > 512 || path.startsWith('/') || path.includes('\\')) return false;
  return !path.split('/').some((seg) => seg === '' || seg === '.' || seg === '..');
}

type DataGetter = Pick<DataTransfer, 'getData'>;

/** Real session id carried by a sidebar-row drag (MIME first, text fallback). */
export function parseSessionDrop(dt: DataGetter): string | null {
  const viaMime = dt.getData(SESSION_DRAG_MIME).trim();
  if (viaMime && isValidSessionId(viaMime)) return viaMime;
  // Sidebar rows also set text/plain to the display title — never a valid id,
  // so a text-only drop is not openable (caller toasts instead of faking a tab).
  return null;
}

/** Real file path carried by a file-row drag (`@path` text fallback included). */
export function parseFileDrop(dt: DataGetter, fileMime: string): string | null {
  const viaMime = dt.getData(fileMime).trim();
  if (viaMime && isValidRelPath(viaMime)) return viaMime;
  const text = dt.getData('text/plain').trim();
  const atPath = text.startsWith('@') ? text.slice(1).trim() : text;
  if (atPath && isValidRelPath(atPath)) return atPath;
  return null;
}

/** Decode a tab-bar drag payload (a whole real tab moving panes). */
export function parseTabMove(dt: DataGetter): { fromPane: string; tab: PaneTab } | null {
  const raw = dt.getData(PANE_TAB_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { fromPane?: unknown; tab?: unknown };
    if (typeof parsed.fromPane !== 'string' || !isPaneTab(parsed.tab)) return null;
    return { fromPane: parsed.fromPane, tab: parsed.tab };
  } catch {
    return null;
  }
}

export function encodeTabMove(fromPane: string, tab: PaneTab): string {
  return JSON.stringify({ fromPane, tab });
}

export type DropZone = 'center' | 'left' | 'right' | 'top' | 'bottom';

/** Windows-snap 5-zone computation (same 24% edge rule as the concept Pane). */
export function dropZoneFor(w: number, h: number, x: number, y: number, edge = 0.24): DropZone {
  if (x < w * edge) return 'left';
  if (x > w * (1 - edge)) return 'right';
  if (y < h * edge) return 'top';
  if (y > h * (1 - edge)) return 'bottom';
  return 'center';
}

/** Split direction + position implied by an edge drop zone. */
export function splitForZone(zone: DropZone): { dir: 'row' | 'col'; pos: 'before' | 'after' } | null {
  if (zone === 'left') return { dir: 'row', pos: 'before' };
  if (zone === 'right') return { dir: 'row', pos: 'after' };
  if (zone === 'top') return { dir: 'col', pos: 'before' };
  if (zone === 'bottom') return { dir: 'col', pos: 'after' };
  return null;
}

// ─── Layout-tree ops (pure mirrors of the concept App split/close/resize) ────

let splitSeq = 0;

/** Insert a fresh pane next to `targetId` (concept `splitPane` recur). */
export function splitLayout(
  layout: LayoutNode,
  targetId: string,
  dir: 'row' | 'col',
  pos: 'before' | 'after',
  newPaneId: string,
): LayoutNode {
  const newPane: LayoutNode = { type: 'pane', id: newPaneId };
  const recur = (node: LayoutNode): LayoutNode => {
    if (node.type === 'pane') {
      if (node.id !== targetId) return node;
      const children = pos === 'before' ? [newPane, node] : [node, newPane];
      splitSeq += 1;
      return { type: 'split', id: `s-${Date.now().toString(36)}-${splitSeq}`, dir, sizes: [50, 50], children };
    }
    return { ...node, children: node.children.map(recur) };
  };
  return recur(layout);
}

/**
 * Remove a pane (concept `closePane` recur). Returns null when the tree would
 * go empty — the caller opens a fresh pane instead (last pane never vanishes).
 */
export function closeLayoutPane(layout: LayoutNode, targetId: string): LayoutNode | null {
  const recur = (node: LayoutNode): LayoutNode | null => {
    if (node.type === 'pane') return node.id === targetId ? null : node;
    const children = node.children.map(recur).filter((c): c is LayoutNode => c !== null);
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    const sizes = node.sizes.slice(0, children.length);
    while (sizes.length < children.length) sizes.push(100 / children.length);
    const sum = sizes.reduce((a, b) => a + b, 0) || 1;
    return { ...node, children, sizes: sizes.map((s) => (s / sum) * 100) };
  };
  return recur(layout);
}

/** Resize a split node (concept SplitTree drag math, clamped 15–85). */
export function resizeLayoutNode(layout: LayoutNode, nodeId: string, sizes: number[]): LayoutNode {
  const update = (node: LayoutNode): LayoutNode => {
    if (node.type === 'pane') return node;
    if (node.id === nodeId) return { ...node, sizes };
    return { ...node, children: node.children.map(update) };
  };
  return update(layout);
}

/** Append a pane id as a new right-most column (concept `handleOpenTab` grow). */
export function appendLayoutPane(layout: LayoutNode, newPaneId: string): LayoutNode {
  const newPane: LayoutNode = { type: 'pane', id: newPaneId };
  if (layout.type === 'split') {
    const sizes = [...layout.sizes, 50];
    const sum = sizes.reduce((a, b) => a + b, 0) || 1;
    return { ...layout, children: [...layout.children, newPane], sizes: sizes.map((s) => (s / sum) * 100) };
  }
  return { type: 'split', id: 'root', dir: 'row', sizes: [50, 50], children: [layout, newPane] };
}

export function collectPaneIds(layout: LayoutNode): string[] {
  if (layout.type === 'pane') return [layout.id];
  return layout.children.flatMap(collectPaneIds);
}

export function countPanes(layout: LayoutNode): number {
  return collectPaneIds(layout).length;
}

/** Serialize the per-pane tab snapshot (validated on load — corrupt rows drop). */
export function serializeTabStates(states: Record<string, PaneTabState>): string {
  return JSON.stringify(states);
}

export function parseTabStates(raw: string | null): Record<string, PaneTabState> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: Record<string, PaneTabState> = {};
    for (const [paneId, state] of Object.entries(parsed)) {
      if (typeof state !== 'object' || state === null) continue;
      const { tabs, active } = state as { tabs?: unknown; active?: unknown };
      if (!Array.isArray(tabs)) continue;
      const clean = tabs.filter(isPaneTab);
      if (clean.length === 0) continue;
      out[paneId] = {
        tabs: clean,
        active: typeof active === 'string' && clean.some((t) => t.id === active) ? active : clean[0].id,
      };
    }
    return out;
  } catch {
    return {};
  }
}
