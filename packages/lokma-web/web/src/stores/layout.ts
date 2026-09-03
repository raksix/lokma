/**
 * Layout model ported 1:1 from the frozen concept design
 * (`concept/src/App.tsx` — `LayoutNode`, widths, storage shape).
 * The real harness reuses the exact same `lokma:layout:v1` key so
 * concept-saved layouts keep working. Never redesign this type here —
 * W7 ports the pane components that render it.
 */

export type LayoutNode =
  | { type: 'pane'; id: string }
  | { type: 'split'; id: string; dir: 'row' | 'col'; sizes: number[]; children: LayoutNode[] };

/** localStorage key shared with the concept design (do not rename). */
export const LAYOUT_STORAGE_KEY = 'lokma:layout:v1';

/** Persist schema version — bump when the stored shape changes. */
export const LAYOUT_SCHEMA_VERSION = 1;

export const DEFAULT_LEFT_WIDTH = 268;
export const DEFAULT_RIGHT_WIDTH = 300;

export function defaultLayout(): LayoutNode {
  return {
    type: 'split',
    id: 'root',
    dir: 'row',
    sizes: [33, 34, 33],
    children: [
      { type: 'pane', id: 'a' },
      { type: 'pane', id: 'center' },
      { type: 'pane', id: 'empty' },
    ],
  };
}

/** Runtime guard — a corrupt/foreign stored value falls back to the default. */
export function isLayoutNode(value: unknown): value is LayoutNode {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as Record<string, unknown>;
  if (node.type === 'pane') return typeof node.id === 'string';
  if (node.type === 'split') {
    return (
      typeof node.id === 'string' &&
      (node.dir === 'row' || node.dir === 'col') &&
      Array.isArray(node.sizes) &&
      Array.isArray(node.children) &&
      (node.children as unknown[]).every(isLayoutNode)
    );
  }
  return false;
}

/** Serializable tab identity (W7 adds pane-kind rendering; no React nodes here). */
export type OpenTab = {
  id: string;
  title: string;
  sessionId?: string;
};
