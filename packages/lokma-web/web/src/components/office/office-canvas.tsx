/**
 * OfficeCanvas (REQ-204 slice 3) — the live pixel office.
 *
 * Browser host for the vendored Agent Office renderer (MIT — see
 * `./vendor/README.md`): sizes the canvas, calls `render(now, data)`, blits the
 * returned RGB framebuffer and routes clicks through `hitTest`. The drawing
 * code itself is upstream's; everything Lokma-specific (which workers exist,
 * what a click selects) lives in `office-canvas-model.ts` and the pane.
 *
 * Data comes in as the pane's rows (the same rows the list renders) — there is
 * no second source. The office therefore shows exactly what the office has:
 * live runs and loop turns, an idle boss when the user's own agent is idle,
 * and nothing when nothing runs.
 */
import * as React from 'react';
import {
  BOSS_ID,
  FRAME_MS,
  TODAY_ID,
  hitTest,
  render,
  resetOffice,
  setGeometry,
  setLanguage,
  setTheme,
} from './vendor/agent-office-core.mjs';
import { buildCanvasData, resolveCanvasSelection } from './office-canvas-model';
import type { OfficeDelivery, OfficeWorker } from './office-view';

export type OfficeCanvasProps = {
  workers: readonly OfficeWorker[];
  deliveries: readonly OfficeDelivery[];
  /** Selected worker id (Lokma id space); null = nothing selected. */
  selectedId: string | null;
  onSelect: (workerId: string | null) => void;
  /**
   * Forced office theme (REQ-204 slice 7): a key registered from the app's
   * named themes (`officeThemeName(id)`), or `''` to keep the renderer's own
   * per-project theme. The pane resolves it; the canvas only applies it.
   */
  themeName?: string;
};

export function OfficeCanvas({ workers, deliveries, selectedId, onSelect, themeName = '' }: OfficeCanvasProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  /** First observation (epoch ms) per worker id — the walk-in anchor. */
  const seenAtRef = React.useRef<Map<string, number>>(new Map());
  const bossIdRef = React.useRef<string | null>(null);
  const dataRef = React.useRef(buildCanvasData({ workers: [], deliveries: [], seenAt: new Map(), nowMs: Date.now() }));
  /** Renderer-space selection (the boss is marked with its own sentinel). */
  const selectedRef = React.useRef<string | null>(null);
  const focusRef = React.useRef<string>('');
  const onSelectRef = React.useRef(onSelect);
  React.useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Rows -> renderer payload. New worker ids get their first-seen stamp here
  // (the honest spawn anchor) and ids that left are pruned so the map stays
  // bounded by what is actually on stage.
  React.useEffect(() => {
    const seen = seenAtRef.current;
    const nowMs = Date.now();
    const present = new Set(workers.map((w) => w.id));
    for (const w of workers) if (!seen.has(w.id)) seen.set(w.id, nowMs);
    for (const id of [...seen.keys()]) if (!present.has(id)) seen.delete(id);
    bossIdRef.current = workers.find((w) => w.isBoss)?.id ?? null;
    dataRef.current = buildCanvasData({ workers, deliveries, seenAt: seen, nowMs });
  }, [workers, deliveries]);

  // Selection + desk glow. The renderer marks the boss with `BOSS_ID`, and the
  // focused project (desk glow) comes from the selected worker's resolved desk.
  React.useEffect(() => {
    const bossId = bossIdRef.current;
    selectedRef.current = selectedId !== null && bossId !== null && selectedId === bossId ? BOSS_ID : selectedId;
    const selected = selectedId !== null ? workers.find((w) => w.id === selectedId) : undefined;
    focusRef.current = selected && selected.projectId ? (selected.projectBadge ?? '') : '';
  }, [selectedId, workers]);

  // Theme (REQ-204 slice 7): the renderer re-reads its palette on the next
  // frame when the forced theme changes (`setThemes` resets its cache).
  React.useEffect(() => {
    setTheme(themeName);
  }, [themeName]);

  // The animation loop: size via ResizeObserver, draw at the renderer's own
  // frame interval (the office is designed for ~9 fps, not 60).
  React.useEffect(() => {
    setLanguage('en');
    resetOffice();
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const off = document.createElement('canvas');
    const offCtx = off.getContext('2d');
    if (!offCtx) return;

    let raf = 0;
    let last = 0;
    let img: ImageData | null = null;

    const resize = (): void => {
      const rect = host.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w < 8 || h < 8) return; // hidden tab: keep the last backing size
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      setGeometry(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const draw = (now: number): void => {
      raf = window.requestAnimationFrame(draw);
      if (now - last < FRAME_MS) return;
      last = now;
      if (canvas.width < 8 || canvas.height < 8) return;
      const shot = render(now, dataRef.current, { selected: selectedRef.current, focus: focusRef.current });
      const { fb, LW, LH, S } = shot;
      if (img === null || img.width !== LW || img.height !== LH) {
        off.width = LW;
        off.height = LH;
        img = offCtx.createImageData(LW, LH);
      }
      const px = img.data;
      for (let i = 0; i < fb.length; i++) {
        const c = fb[i];
        const o = i * 4;
        px[o] = (c >> 16) & 255;
        px[o + 1] = (c >> 8) & 255;
        px[o + 2] = c & 255;
        px[o + 3] = 255;
      }
      offCtx.putImageData(img, 0, 0);
      const dw = LW * S;
      const dh = LH * S;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(off, Math.floor((canvas.width - dw) / 2), Math.floor((canvas.height - dh) / 2), dw, dh);
    };
    raf = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const pxX = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const pxY = ((e.clientY - rect.top) * canvas.height) / rect.height;
    const hit = hitTest(pxX, pxY);
    onSelectRef.current(resolveCanvasSelection(hit, bossIdRef.current, BOSS_ID, TODAY_ID));
  };

  return (
    <div ref={hostRef} className="h-full w-full" data-office-canvas-host data-office-theme={themeName || 'auto'}>
      <canvas
        ref={canvasRef}
        onClick={onClick}
        role="img"
        aria-label={`Pixel office — ${workers.length} working now. Pick a worker to see who they are.`}
        className="block h-full w-full cursor-pointer"
        data-office-canvas
        data-office-canvas-workers={workers.length}
        data-office-canvas-selected={selectedId ?? ''}
      />
    </div>
  );
}
