import * as React from 'react';
import { Maximize2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type WindowPos = { x: number; y: number; w: number; h: number };

export const WINDOWED_POS_KEY = 'lokma:windowed-pos:v1';
export const WINDOWED_MIN_W = 320;
export const WINDOWED_MIN_H = 220;

export function parseWindowedPos(raw: unknown): Record<string, WindowPos> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, WindowPos> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const p = v as Record<string, unknown>;
    const nums = [p['x'], p['y'], p['w'], p['h']];
    if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    out[id] = {
      x: Math.max(0, Math.round(p['x'] as number)),
      y: Math.max(0, Math.round(p['y'] as number)),
      w: Math.max(WINDOWED_MIN_W, Math.round(p['w'] as number)),
      h: Math.max(WINDOWED_MIN_H, Math.round(p['h'] as number)),
    };
  }
  return out;
}

// WindowedCanvas: concept panes/WindowedCanvas.tsx port. Floating,
// draggable, resizable windows over the tiling canvas. Glyph buttons
// (concept box/x) are lucide icons per the no-symbol-glyph rule.
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
  onResize: (id: string, next: WindowPos) => void;
  onMaximize: (id: string) => void;
  onClose: (id: string) => void;
}) {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded border bg-muted/20">
      {panes.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
          No floating windows. Pop a pane out from its strip button, then drag it here.
        </div>
      ) : null}
      {/* REQ-014: window frames use a solid card surface. `bg-background`
          has no rule in the Tailwind v4 bundle (@theme defines no
          --color-background, so the class compiles to nothing and the
          window renders as a transparent ghost). `bg-white` is solid in
          light and maps to #1E1E21 via the `.dark .bg-white` override
          in index.css. Tiling split panes are untouched (already opaque). */}
      {panes.map((pane, i) => {
        const p = pos[pane.id] ?? { x: 24 + i * 28, y: 24 + i * 28, w: 560, h: 420 };
        return (
          <div
            key={pane.id}
            className="absolute flex flex-col overflow-hidden rounded-lg border bg-white shadow-xl"
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
            <WindowResizeHandles pos={p} onResize={(next) => onResize(pane.id, next)} />
          </div>
        );
      })}
    </div>
  );
}

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const DIR_CURSOR: Record<ResizeDir, string> = {
  'n': 'cursor-ns-resize',
  's': 'cursor-ns-resize',
  'e': 'cursor-ew-resize',
  'w': 'cursor-ew-resize',
  'ne': 'cursor-nesw-resize',
  'sw': 'cursor-nesw-resize',
  'nw': 'cursor-nwse-resize',
  'se': 'cursor-nwse-resize',
};

// REQ-042: resize from all four edges plus all four corners. North/west
// handles move the origin as well as the size; every direction clamps to
// the shared minimums so a window can never collapse to zero.
function WindowResizeHandles({ pos, onResize }: { pos: WindowPos; onResize: (next: WindowPos) => void }) {
  const start = (e: React.PointerEvent, dir: ResizeDir) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const sx = pos.x;
    const sy = pos.y;
    const sw = pos.w;
    const sh = pos.h;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let x = sx;
      let y = sy;
      let w = sw;
      let h = sh;
      if (dir.includes('e')) w = Math.max(WINDOWED_MIN_W, sw + dx);
      if (dir.includes('s')) h = Math.max(WINDOWED_MIN_H, sh + dy);
      if (dir.includes('w')) {
        const nw = Math.max(WINDOWED_MIN_W, sw - dx);
        x = Math.max(0, sx + (sw - nw));
        w = nw;
      }
      if (dir.includes('n')) {
        const nh = Math.max(WINDOWED_MIN_H, sh - dy);
        y = Math.max(0, sy + (sh - nh));
        h = nh;
      }
      onResize({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 32 : 8;
    let w = pos.w;
    let h = pos.h;
    if (e.key === 'ArrowRight') w += step;
    else if (e.key === 'ArrowLeft') w -= step;
    else if (e.key === 'ArrowDown') h += step;
    else if (e.key === 'ArrowUp') h -= step;
    else return;
    e.preventDefault();
    onResize({ 'x': pos.x, 'y': pos.y, 'w': Math.max(WINDOWED_MIN_W, w), 'h': Math.max(WINDOWED_MIN_H, h) });
  };

  const edge = 'absolute z-10 touch-none hover:bg-foreground/10';
  return (
    <>
      <div role="separator" aria-orientation="horizontal" aria-label="Resize window from top edge" title="Resize window" className={edge + ' left-3 right-3 top-0 h-1.5 ' + DIR_CURSOR['n']} onPointerDown={(e) => start(e, 'n')} />
      <div role="separator" aria-orientation="horizontal" aria-label="Resize window from bottom edge" title="Resize window" className={edge + ' bottom-0 left-3 right-3 h-1.5 ' + DIR_CURSOR['s']} onPointerDown={(e) => start(e, 's')} />
      <div role="separator" aria-orientation="vertical" aria-label="Resize window from left edge" title="Resize window" className={edge + ' bottom-3 left-0 top-3 w-1.5 ' + DIR_CURSOR['w']} onPointerDown={(e) => start(e, 'w')} />
      <div role="separator" aria-orientation="vertical" aria-label="Resize window from right edge" title="Resize window" className={edge + ' bottom-3 right-0 top-3 w-1.5 ' + DIR_CURSOR['e']} onPointerDown={(e) => start(e, 'e')} />
      <div role="separator" aria-label="Resize window from top left corner" title="Resize window" className={edge + ' left-0 top-0 h-3 w-3 ' + DIR_CURSOR['nw']} onPointerDown={(e) => start(e, 'nw')} />
      <div role="separator" aria-label="Resize window from top right corner" title="Resize window" className={edge + ' right-0 top-0 h-3 w-3 ' + DIR_CURSOR['ne']} onPointerDown={(e) => start(e, 'ne')} />
      <div role="separator" aria-label="Resize window from bottom left corner" title="Resize window" className={edge + ' bottom-0 left-0 h-3 w-3 ' + DIR_CURSOR['sw']} onPointerDown={(e) => start(e, 'sw')} />
      <div
        role="separator"
        aria-label="Resize window from bottom right corner. Arrow keys resize, shift makes bigger steps."
        title="Resize window"
        tabIndex={0}
        onKeyDown={onKey}
        className={edge + ' bottom-0 right-0 h-4 w-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ' + DIR_CURSOR['se']}
        onPointerDown={(e) => start(e, 'se')}
      />
    </>
  );
}
