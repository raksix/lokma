import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { findChromeBinary, PNG_TIMEOUT_MS } from '../archify/raster.js';
import { findFfmpegBinary, WEBM_FPS, WEBM_FRAMES } from '../archify/webm.js';
import { assertArtifactId, getArtifact } from './store.js';
import { DESIGN_PNG_HEIGHT, DESIGN_PNG_WIDTH } from './raster.js';
import { DesignError } from './types.js';

const exec = promisify(execFile);

/**
 * WebM video export for design artifacts (Phase 3, Docs/34 §6 follow-up).
 * A 2-second slow-zoom over the stored self-contained `artifact.html`:
 * N static frames (a zoom style injected per frame — no JS, no viewer),
 * screenshotted at a fixed 1280x800 CSS viewport with headless Chromium
 * (`--screenshot`, no CDP socket — LXC-safe), then encoded with ffmpeg
 * libvpx-vp9. Same clip contract as archify (12f @ 6fps). No new
 * dependencies — both binaries are resolved, never bundled.
 */

/** Whole-encode budget (12 cold Chrome starts + one ffmpeg pass). */
export const DESIGN_WEBM_TIMEOUT_MS = 300_000;
/** EBML header — every export is verified before it leaves this module. */
const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

/**
 * One video frame — the stored artifact HTML with a per-frame zoom style
 * injected. `t` runs 0→1 across the clip: gentle zoom-in (1.00→1.20)
 * with a left→right drift, transform-origin pinned to the viewport
 * center so full-page documents stay framed. The injection lands before
 * `</head>` when the document has one, otherwise it is prepended —
 * either way the zoom wins over author styles (a second same-specificity
 * rule would lose, so the declaration carries `!important`).
 */
export function buildDesignWebmFrameHtml(html: string, t: number): string {
  const clamped = Math.min(Math.max(t, 0), 1);
  const scale = (1 + 0.2 * clamped).toFixed(4);
  const dx = (-2 + 4 * clamped).toFixed(2);
  const dy = (1 - 2 * clamped).toFixed(2);
  const style =
    `<style>html,body{overflow:hidden !important}` +
    `body{transform-origin:center center !important;` +
    `transform:scale(${scale}) translate(${dx}%,${dy}%) !important}</style>`;
  const headClose = html.indexOf('</head>');
  if (headClose !== -1) return html.slice(0, headClose) + style + html.slice(headClose);
  return style + html;
}

/**
 * Encode a stored artifact to WebM bytes (fixed 12f / 6fps slow-zoom).
 * Throws `bad_id` (400), `design_not_found` (404), `needs_toolchain`
 * (400 — no headless Chromium or no ffmpeg), `raster_failed` (500 — a
 * frame screenshot failed) or `encode_failed` (500 — ffmpeg errored or
 * emitted non-WebM bytes).
 */
export async function exportArtifactWebm(idRaw: unknown): Promise<{
  filename: string;
  contentType: string;
  body: Buffer;
  width: number;
  height: number;
  fps: number;
  frames: number;
}> {
  const id = assertArtifactId(idRaw);
  const { html } = await getArtifact(id); // 404 on unknown.

  const chrome = await findChromeBinary();
  const ffmpeg = await findFfmpegBinary();
  if (!chrome || !ffmpeg) {
    const missing = [!chrome ? 'headless Chromium (LOKMA_CHROME_BIN)' : null, !ffmpeg ? 'ffmpeg (LOKMA_FFMPEG_BIN)' : null]
      .filter(Boolean)
      .join(' and ');
    throw new DesignError('needs_toolchain', `WebM export needs ${missing}`, 400);
  }

  const w = DESIGN_PNG_WIDTH;
  const h = DESIGN_PNG_HEIGHT;
  const dir = await mkdtemp(join(tmpdir(), 'lokma-design-webm-'));
  const outPath = join(dir, 'artifact.webm');
  try {
    // One headless-Chromium launch per frame — `--screenshot` takes a single
    // shot, so the zoom is baked into per-frame HTML instead of JS.
    for (let i = 0; i < WEBM_FRAMES; i += 1) {
      const t = i / Math.max(WEBM_FRAMES - 1, 1);
      const htmlPath = join(dir, `frame${String(i).padStart(3, '0')}.html`);
      const pngPath = join(dir, `frame${String(i).padStart(3, '0')}.png`);
      await writeFile(htmlPath, buildDesignWebmFrameHtml(html, t), 'utf-8');
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
        throw new DesignError(
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
        { timeout: DESIGN_WEBM_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      );
    } catch (e) {
      throw new DesignError(
        'encode_failed',
        `ffmpeg failed: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`,
        500,
      );
    }
    let body: Buffer;
    try {
      body = await readFile(outPath);
    } catch {
      throw new DesignError('encode_failed', 'ffmpeg produced no output file', 500);
    }
    if (body.length < 4 || !body.subarray(0, 4).equals(WEBM_MAGIC)) {
      throw new DesignError('encode_failed', 'ffmpeg output is not a WebM', 500);
    }
    return { filename: `${id}.webm`, contentType: 'video/webm', body, width: w, height: h, fps: WEBM_FPS, frames: WEBM_FRAMES };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
