import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ArchifyError } from './ir.js';
import { findChromeBinary, PNG_TIMEOUT_MS } from './raster.js';
import { buildSvg, canvasSize, esc, placeNodes } from './render.js';
import { assertDiagramId, readStoredIr } from './store.js';

const exec = promisify(execFile);

/**
 * WebM video export for archify diagrams (Phase 3, Docs/31 §6.6 follow-up).
 * A 2-second slow-zoom over the deterministic SVG: N static frames (CSS
 * transform baked per frame, no JS) screenshotted with headless Chromium
 * (`--screenshot`, no CDP socket — LXC-safe), then encoded with ffmpeg
 * libvpx-vp9. No new dependencies — both binaries are resolved, never bundled.
 */

/** 12 frames at 6 fps = a 2-second clip. */
export const WEBM_FRAMES = 12;
export const WEBM_FPS = 6;
/** Video viewports stay small — encode time grows with pixels, not nodes. */
export const WEBM_MAX_EDGE = 1280;
/** Whole-encode budget (12 cold Chrome starts + one ffmpeg pass). */
export const WEBM_TIMEOUT_MS = 300_000;
/** EBML header — every export is verified before it leaves this module. */
const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

/** Env override wins (same pattern as `LOKMA_CHROME_BIN`), then well-known paths. */
const FFMPEG_CANDIDATES = [
  '/usr/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/opt/homebrew/bin/ffmpeg',
  'ffmpeg',
];

/**
 * Resolve the ffmpeg binary (`LOKMA_FFMPEG_BIN` override first).
 * Returns null instead of throwing — the caller turns it into `needs_toolchain`.
 */
export async function findFfmpegBinary(): Promise<string | null> {
  const override = (process.env.LOKMA_FFMPEG_BIN ?? '').trim();
  const candidates = override ? [override, ...FFMPEG_CANDIDATES] : FFMPEG_CANDIDATES;
  for (const bin of candidates) {
    try {
      await exec(bin, ['-version'], { timeout: 10_000 });
      return bin;
    } catch {
      // Not installed / not executable — try the next candidate.
    }
  }
  return null;
}

/**
 * One video frame — exact canvas size, SVG wrapped in a scale+pan transform.
 * `t` runs 0→1 across the clip: gentle zoom-in (1.00→1.20) with a left→right
 * drift, transform-origin pinned to the center so small diagrams stay framed.
 */
export function buildWebmFrameHtml(title: string, svg: string, w: number, h: number, t: number): string {
  const clamped = Math.min(Math.max(t, 0), 1);
  const scale = (1 + 0.2 * clamped).toFixed(4);
  const dx = (-2 + 4 * clamped).toFixed(2);
  const dy = (1 - 2 * clamped).toFixed(2);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>html,body{margin:0;padding:0;background:#fff;overflow:hidden}</style></head><body><div style="width:${w}px;height:${h}px;overflow:hidden"><div style="width:${w}px;height:${h}px;transform:scale(${scale}) translate(${dx}%,${dy}%);transform-origin:center center">${svg}</div></div></body></html>`;
}

/**
 * Encode a stored diagram to WebM bytes (fixed 12f / 6fps slow-zoom).
 * Throws `diagram_not_found` (404), `needs_toolchain` (400 — no headless
 * Chromium or no ffmpeg), `raster_failed` (500 — a frame screenshot failed)
 * or `encode_failed` (500 — ffmpeg errored or emitted non-WebM bytes).
 */
export async function exportDiagramWebm(idRaw: unknown): Promise<{
  filename: string;
  contentType: string;
  body: Buffer;
  width: number;
  height: number;
  fps: number;
  frames: number;
}> {
  const id = assertDiagramId(idRaw);
  const ir = await readStoredIr(id); // 404 on unknown.

  const chrome = await findChromeBinary();
  const ffmpeg = await findFfmpegBinary();
  if (!chrome || !ffmpeg) {
    const missing = [!chrome ? 'headless Chromium (LOKMA_CHROME_BIN)' : null, !ffmpeg ? 'ffmpeg (LOKMA_FFMPEG_BIN)' : null]
      .filter(Boolean)
      .join(' and ');
    throw new ArchifyError('needs_toolchain', `WebM export needs ${missing}`, 400);
  }

  const placed = placeNodes(ir);
  const size = canvasSize(placed);
  const w = Math.min(Math.max(1, Math.round(size.w)), WEBM_MAX_EDGE);
  const h = Math.min(Math.max(1, Math.round(size.h)), WEBM_MAX_EDGE);
  const svg = buildSvg(ir);

  const dir = await mkdtemp(join(tmpdir(), 'lokma-webm-'));
  const outPath = join(dir, 'diagram.webm');
  try {
    // One headless-Chromium launch per frame — `--screenshot` takes a single
    // shot, so the zoom is baked into per-frame HTML instead of JS.
    for (let i = 0; i < WEBM_FRAMES; i += 1) {
      const t = i / Math.max(WEBM_FRAMES - 1, 1);
      const htmlPath = join(dir, `frame${String(i).padStart(3, '0')}.html`);
      const pngPath = join(dir, `frame${String(i).padStart(3, '0')}.png`);
      await writeFile(htmlPath, buildWebmFrameHtml(ir.title, svg, w, h, t), 'utf-8');
      try {
        await exec(
          chrome,
          [
            '--headless',
            '--disable-gpu',
            '--no-sandbox',
            '--hide-scrollbars',
            `--window-size=${w},${h}`,
            `--screenshot=${pngPath}`,
            `file://${htmlPath}`,
          ],
          { timeout: PNG_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
        );
      } catch (e) {
        throw new ArchifyError(
          'raster_failed',
          `headless Chromium failed on frame ${i}: ${e instanceof Error ? e.message.slice(0, 160) : 'unknown'}`,
          500,
        );
      }
    }
    try {
      await exec(
        ffmpeg,
        [
          '-y',
          '-framerate',
          String(WEBM_FPS),
          '-i',
          join(dir, 'frame%03d.png'),
          '-c:v',
          'libvpx-vp9',
          '-pix_fmt',
          'yuv420p',
          '-crf',
          '32',
          '-b:v',
          '0',
          outPath,
        ],
        { timeout: WEBM_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      );
    } catch (e) {
      throw new ArchifyError(
        'encode_failed',
        `ffmpeg failed: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`,
        500,
      );
    }
    let body: Buffer;
    try {
      body = await readFile(outPath);
    } catch {
      throw new ArchifyError('encode_failed', 'ffmpeg produced no output file', 500);
    }
    if (body.length < 4 || !body.subarray(0, 4).equals(WEBM_MAGIC)) {
      throw new ArchifyError('encode_failed', 'ffmpeg output is not a WebM', 500);
    }
    return { filename: `${id}.webm`, contentType: 'video/webm', body, width: w, height: h, fps: WEBM_FPS, frames: WEBM_FRAMES };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
