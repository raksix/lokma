import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Sidebar — left/right panels (static Phase 0, flexlayout-react in Phase 1).
 * One component with variant prop — DRY over two files.
 *
 * REQ-019 — VS Code-style resizable edge: a pointer-drag handle on the
 * inner edge adjusts the width live (160–640px clamp, same as the
 * `setSideWidth` store guard). Double-click resets to the default width;
 * arrow keys nudge ±8px when the handle is focused. Persisting is the
 * caller's job via `onResize` (AppShell wires it to the persisted
 * `leftW`/`rightW` pane-store keys). Mobile drawers pass no width and stay
 * fixed (`resizable` defaults to false unless a width is given).
 */

export const SIDEBAR_MIN_WIDTH = 160;
export const SIDEBAR_MAX_WIDTH = 640;
const SIDEBAR_KEY_STEP = 8;

function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_MIN_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

export function Sidebar({
  side,
  title,
  children,
  className,
  width,
  defaultWidth,
  onResize,
  resizable,
  hideHeader,
}: {
  side: 'left' | 'right';
  title: string;
  children: React.ReactNode;
  /** Width override (mobile drawers pass a fluid width; defaults to 280px). */
  className?: string;
  /** Controlled pixel width (desktop: persisted leftW/rightW). Enables the resize handle. */
  width?: number;
  /** Width restored on double-click (defaults to the controlled width). */
  defaultWidth?: number;
  /** Called live while dragging (caller persists, e.g. setSideWidth). */
  onResize?: (width: number) => void;
  /** Force the handle on/off (default: on when width + onResize are set). */
  resizable?: boolean;
  /** REQ-067 — hide the h-10 title bar (Explorer/Inspector labels removed). */
  hideHeader?: boolean;
}) {
  const canResize = (resizable ?? (width !== undefined && onResize !== undefined)) === true;
  const dragRef = React.useRef<{ startX: number; startW: number } | null>(null);

  const onHandleDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!canResize || width === undefined || onResize === undefined) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startW: width };
      const move = (ev: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const delta = ev.clientX - drag.startX;
        const next = clampSidebarWidth(drag.startW + (side === 'left' ? delta : -delta));
        onResize(next);
      };
      const up = () => {
        dragRef.current = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [canResize, onResize, side, width],
  );

  const onHandleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!canResize || width === undefined || onResize === undefined) return;
      const outwards = side === 'left' ? 1 : -1;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onResize(clampSidebarWidth(width - SIDEBAR_KEY_STEP * outwards));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onResize(clampSidebarWidth(width + SIDEBAR_KEY_STEP * outwards));
      }
    },
    [canResize, onResize, side, width],
  );

  const onHandleDoubleClick = React.useCallback(() => {
    if (!canResize || onResize === undefined) return;
    const reset = defaultWidth ?? width;
    if (reset !== undefined) onResize(clampSidebarWidth(reset));
  }, [canResize, defaultWidth, onResize, width]);

  return (
    <aside
      className={`relative flex ${className ?? (width !== undefined ? 'min-w-0' : 'w-[280px]')} shrink-0 flex-col ${side === 'left' ? 'border-r' : 'border-l'} border-line bg-card`}
      style={className === undefined && width !== undefined ? { width } : undefined}
    >
      {hideHeader ? null : (
        <div className="flex h-10 items-center border-b px-3">
          <span className="text-sm font-medium">{title}</span>
        </div>
      )}
      {/* @container: Inspector panes use container queries (@min-*) instead of
          viewport sm: so subtitles/grids adapt to this 280px column even on
          wide viewports (area C run 3: sm:inline subtitles overflowed). */}
      <div className="flex-1 overflow-auto p-3 @container">{children}</div>
      {canResize ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={side === 'left' ? 'Resize left sidebar' : 'Resize right sidebar'}
          title="Drag to resize (double-click to reset)"
          tabIndex={0}
          onPointerDown={onHandleDown}
          onKeyDown={onHandleKeyDown}
          onDoubleClick={onHandleDoubleClick}
          className={
            side === 'left'
              ? 'absolute inset-y-0 right-0 w-1 shrink-0 cursor-col-resize touch-none bg-transparent hover:bg-[#C96442]/60 focus-visible:bg-[#C96442]/60 focus-visible:outline-none'
              : 'absolute inset-y-0 left-0 w-1 shrink-0 cursor-col-resize touch-none bg-transparent hover:bg-[#C96442]/60 focus-visible:bg-[#C96442]/60 focus-visible:outline-none'
          }
        />
      ) : null}
    </aside>
  );
}

export function InfoPanel() {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Stack A</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground leading-relaxed">
          Next 15 + Tailwind v4 + shadcn/ui + Fastify 5 + flexlayout-react + WS/SSE. Two surfaces share the same <code className="rounded bg-muted px-1">lokma-shared</code> and <code className="rounded bg-muted px-1">SessionStore JSONL</code>.
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Themes</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {['claude', 'omp', 'midnight', 'paper'].map((t) => (
            <Badge key={t} variant={t === 'omp' ? 'default' : 'outline'}>{t}</Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
