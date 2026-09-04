import * as React from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  clampPitch,
  hitTestProjected,
  layoutGraph3D,
  nodeRadius,
  NODE_PALETTE,
  paletteIndex,
  projectGraph3D,
  type GraphRotation,
  type VaultLink,
  type VaultNode,
} from './vault';

/**
 * VaultGraph3D — dependency-free canvas star-map over the SAME live vault
 * graph the 2D SVG shows (no `react-force-graph-3d` dep, no new packages).
 * Nodes sit on a deterministic Fibonacci sphere; the camera orbits with
 * drag (yaw/pitch) + wheel zoom + optional auto-rotate. Clicking a node
 * opens the note through the same `onOpenNote` path as the 2D graph.
 */
export function VaultGraph3D({
  nodes,
  links,
  selected,
  onOpenNote,
}: {
  nodes: VaultNode[];
  links: VaultLink[];
  selected: string | null;
  onOpenNote: (path: string) => void;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [rot, setRot] = React.useState<GraphRotation>({ yaw: 0.6, pitch: 0.35 });
  const [zoom, setZoom] = React.useState(1);
  const [spinning, setSpinning] = React.useState(true);
  const [hoverPath, setHoverPath] = React.useState<string | null>(null);
  const dragRef = React.useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const stateRef = React.useRef({ rot, zoom, spinning, selected, hoverPath });
  stateRef.current = { rot, zoom, spinning, selected, hoverPath };
  const openRef = React.useRef(onOpenNote);
  openRef.current = onOpenNote;

  // Same node set the 2D view shows — home positions are stable per path
  // order, so rotation (not layout) is the only thing that moves.
  const placed = React.useMemo(() => layoutGraph3D(nodes), [nodes]);
  const edgeSet = React.useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return links.filter((l) => ids.has(l.source) && ids.has(l.target));
  }, [nodes, links]);

  // Auto-rotate loop (pauses while the user drags).
  React.useEffect(() => {
    if (!spinning) return;
    const timer = window.setInterval(() => {
      if (dragRef.current) return;
      setRot((r) => ({ yaw: r.yaw + 0.02, pitch: r.pitch }));
    }, 50);
    return () => {
      window.clearInterval(timer);
    };
  }, [spinning]);

  // Canvas renderer (DPR-aware, redraws on data/rotation/zoom/selection).
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const width = Math.max(80, Math.floor(rect.width));
    const height = Math.max(80, Math.floor(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const dark = document.documentElement.classList.contains('dark');
    ctx.fillStyle = dark ? '#1E1E21' : '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    const { rot: live, zoom: liveZoom, selected: liveSelected, hoverPath: liveHover } = stateRef.current;
    const distance = 340 / liveZoom;
    const projected = projectGraph3D(placed, live, width, height, distance);
    const byId = new Map(projected.map((n) => [n.id, n]));
    // Far edges first so near structure draws on top.
    const ordered = [...projected].sort((a, b) => a.depth - b.depth);

    ctx.lineWidth = 1;
    for (const edge of edgeSet) {
      const a = byId.get(edge.source);
      const b = byId.get(edge.target);
      if (!a || !b) continue;
      const alpha = 0.18 + 0.5 * Math.min(a.depth, b.depth);
      ctx.strokeStyle = dark ? `rgba(232,228,222,${alpha.toFixed(2)})` : `rgba(120,113,108,${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }

    for (const node of ordered) {
      const r = (nodeRadius(node.links) + 1) * (0.7 + 0.6 * node.depth) * (0.6 + 0.4 * liveZoom);
      const fill = NODE_PALETTE[paletteIndex(node.path, NODE_PALETTE.length)];
      const isSelected = liveSelected === node.path;
      const isHover = liveHover === node.path;
      ctx.globalAlpha = 0.45 + 0.55 * node.depth;
      ctx.beginPath();
      ctx.arc(node.sx, node.sy, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.globalAlpha = (0.45 + 0.55 * node.depth) * 0.14;
      ctx.fill();
      ctx.globalAlpha = 0.45 + 0.55 * node.depth;
      ctx.beginPath();
      ctx.arc(node.sx, node.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = isSelected || isHover ? 2 : 1.2;
      ctx.strokeStyle = isSelected ? (dark ? '#FFFFFF' : '#262624') : dark ? '#1E1E21' : '#FFFFFF';
      ctx.stroke();
      if (isSelected || (projected.length <= 40 && node.depth > 0.35)) {
        ctx.font = '9px Inter, sans-serif';
        ctx.fillStyle = dark ? '#D4D4D8' : '#52525B';
        ctx.textAlign = 'center';
        const label = node.title.length > 20 ? `${node.title.slice(0, 19)}…` : node.title;
        ctx.fillText(label, node.sx, node.sy + r + 11);
      }
      // Stash the drawn radius for the shared hit-tester.
      (node as { r?: number }).r = r;
    }
    ctx.globalAlpha = 1;
  }, [placed, edgeSet, rot, zoom, selected, hoverPath]);

  function canvasPoint(e: React.MouseEvent): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function projectedNow(): Array<{ path: string; sx: number; sy: number; r?: number }> {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return [];
    const rect = wrap.getBoundingClientRect();
    const { rot: live, zoom: liveZoom } = stateRef.current;
    return projectGraph3D(placed, live, Math.max(80, rect.width), Math.max(80, rect.height), 340 / liveZoom).map(
      // Same radius math as the renderer so clicks land where circles draw.
      (n) => ({
        path: n.path,
        sx: n.sx,
        sy: n.sy,
        r: (nodeRadius(n.links) + 1) * (0.7 + 0.6 * n.depth) * (0.6 + 0.4 * liveZoom),
      }),
    );
  }

  // Native non-passive wheel listener: React attaches wheel handlers as
  // passive at the root, so preventDefault here would warn in the console.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(2.5, Math.max(0.5, z * (e.deltaY > 0 ? 0.92 : 1.08))));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <div ref={wrapRef} className="w-full h-full relative rounded-lg overflow-hidden border border-line">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Vault 3D star-map, ${nodes.length} notes. Drag to rotate, click a node to open it.`}
        className="block cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => {
          dragRef.current = { x: e.clientX, y: e.clientY, yaw: rot.yaw, pitch: rot.pitch };
        }}
        onMouseMove={(e) => {
          const drag = dragRef.current;
          if (drag) {
            const nextYaw = drag.yaw + (e.clientX - drag.x) * 0.008;
            const nextPitch = clampPitch(drag.pitch + (e.clientY - drag.y) * 0.006);
            setRot({ yaw: nextYaw, pitch: nextPitch });
            return;
          }
          const hit = hitTestProjected(projectedNow(), canvasPoint(e).x, canvasPoint(e).y);
          setHoverPath(hit);
          if (canvasRef.current) canvasRef.current.style.cursor = hit ? 'pointer' : 'grab';
        }}
        onMouseUp={(e) => {
          const drag = dragRef.current;
          dragRef.current = null;
          // A press without travel is a click — open the node under it.
          if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) {
            const hit = hitTestProjected(projectedNow(), canvasPoint(e).x, canvasPoint(e).y);
            if (hit) openRef.current(hit);
          }
        }}
        onMouseLeave={() => {
          dragRef.current = null;
          setHoverPath(null);
        }}
      />
      <div className="absolute top-1.5 right-1.5 flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] bg-white/80 dark:bg-[#1E1E21]/80 backdrop-blur"
          onClick={() => setSpinning((v) => !v)}
          aria-label={spinning ? 'Pause auto-rotate' : 'Resume auto-rotate'}
          title={spinning ? 'Pause auto-rotate' : 'Resume auto-rotate'}
        >
          {spinning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] bg-white/80 dark:bg-[#1E1E21]/80 backdrop-blur"
          onClick={() => {
            setRot({ yaw: 0.6, pitch: 0.35 });
            setZoom(1);
          }}
          aria-label="Reset 3D view"
          title="Reset 3D view"
        >
          <RotateCcw className="w-3 h-3" />
        </Button>
      </div>
      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-white/80 dark:bg-[#1E1E21]/80 backdrop-blur border border-line text-[10px] text-zinc-500 whitespace-nowrap">
        drag to rotate · scroll to zoom · click node to open
      </div>
    </div>
  );
}
