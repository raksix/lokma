import * as React from 'react';
import { Maximize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type WindowPos = { x: number; y: number; w: number; h: number };

// WindowedCanvas: concept panes/WindowedCanvas.tsx port. Floating,
// draggable, resizable windows over the tiling canvas. Glyph buttons
// (concept □/×) are lucide icons per the no-symbol-glyph rule.
export function WindowedCanvas({
  panes,
  pos,
  renderPane,
  onDragStart,
  onResize,
  onMaximize,
  onClose,
}: {
  panes: { id: string; title: string }[];
  pos: Record<string, WindowPos>;
  renderPane: (id: string) => React.ReactNode;
  onDragStart: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
  onMaximize: (id: string) => void;
  onClose: (id: string) => void;
}) {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded border bg-muted/20">
      {panes.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
          No floating windows. Open a pane from the tiling bar, then switch back to float it here.
        </div>
      ) : null}
      {panes.map((pane, i) => {
        const p = pos[pane.id] ?? { x: 24 + i * 28, y: 24 + i * 28, w: 560, h: 420 };
        return (
          <div
            key={pane.id}
            className="absolute flex flex-col overflow-hidden rounded-lg border bg-background shadow-xl"
            style={{ left: p.x, top: p.y, width: p.w, height: p.h }}
          >
            <div
              className="flex h-8 shrink-0 cursor-move items-center gap-1 border-b bg-muted/60 px-2"
              onPointerDown={(e) => onDragStart(pane.id, e.clientX, e.clientY)}
            >
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{pane.title}</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Maximize window" onClick={() => onMaximize(pane.id)} aria-label="Maximize window">
                <Maximize2 className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Close window" onClick={() => onClose(pane.id)} aria-label="Close window">
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{renderPane(pane.id)}</div>
            <WindowResizer onResize={(w, h) => onResize(pane.id, w, h)} />
          </div>
        );
      })}
    </div>
  );
}

function WindowResizer({ onResize }: { onResize: (w: number, h: number) => void }) {
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const box = (e.target as HTMLElement).closest('[style]')?.parentElement as HTMLElement | null;
    const startW = box?.offsetWidth ?? 560;
    const startH = box?.offsetHeight ?? 420;
    const move = (ev: PointerEvent) => {
      onResize(Math.max(320, startW + ev.clientX - startX), Math.max(220, startH + ev.clientY - startY));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return <div onPointerDown={onDown} title="Resize window" className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize" />;
}
