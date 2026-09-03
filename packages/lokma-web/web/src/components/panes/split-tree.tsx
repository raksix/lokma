import * as React from 'react';
import type { LayoutNode } from '@/stores/layout';

// SplitTree: concept panes/SplitTree.tsx port. Renders the LayoutNode
// tree with draggable dividers (flex-basis %, 15-85 clamp, live update).
export function SplitTree({
  node,
  renderPane,
  onResize,
}: {
  node: LayoutNode;
  renderPane: (id: string) => React.ReactNode;
  onResize: (nodeId: string, sizes: number[]) => void;
}) {
  const dragRef = React.useRef<{ nodeId: string; index: number } | null>(null);

  if (node.type === 'pane') {
    return <div className="flex min-h-0 min-w-0 flex-1">{renderPane(node.id)}</div>;
  }

  const onDividerDown = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { nodeId: node.id, index };
    const move = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.nodeId !== node.id) return;
      const el = (e.target as HTMLElement).closest('[data-split]') as HTMLElement | null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const horizontal = node.dir === 'row';
      const total = horizontal ? rect.width : rect.height;
      if (total <= 0) return;
      const pos = horizontal ? ev.clientX - rect.left : ev.clientY - rect.top;
      const pct = Math.min(85, Math.max(15, (pos / total) * 100));
      const next = [...node.sizes];
      next[drag.index] = pct;
      next[drag.index + 1] = 100 - pct;
      onResize(node.id, next);
    };
    const up = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div data-split={node.id} className={`flex min-h-0 min-w-0 flex-1 ${node.dir === 'row' ? 'flex-row' : 'flex-col'}`}>
      {node.children.map((child, i) => (
        <React.Fragment key={child.type === 'pane' ? child.id : child.id}>
          <div className="flex min-h-0 min-w-0" style={{ flex: `${node.sizes[i] ?? 50} 1 0%` }}>
            <SplitTree node={child} renderPane={renderPane} onResize={onResize} />
          </div>
          {i < node.children.length - 1 ? (
            <div
              role="separator"
              aria-label={node.dir === 'row' ? 'Resize columns' : 'Resize rows'}
              onPointerDown={onDividerDown(i)}
              className={
                node.dir === 'row'
                  ? 'w-1 shrink-0 cursor-col-resize bg-border/60 hover:bg-[#C96442]/60'
                  : 'h-1 shrink-0 cursor-row-resize bg-border/60 hover:bg-[#C96442]/60'
              }
            />
          ) : null}
        </React.Fragment>
      ))}
    </div>
  );
}
