import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { PNG_TIMEOUT_MS, findChromeBinary } from '../archify/raster.js';
import { assertArtifactId, getArtifact } from './store.js';
import { DesignError } from './types.js';

const exec = promisify(execFile);

/**
 * PNG raster export for design artifacts (Phase 3, Docs/34 §6 follow-up).
 * Screenshots the stored self-contained `artifact.html` at a fixed
 * 1280x800 CSS viewport with headless Chromium (`--screenshot` needs no
 * CDP socket, so it works inside locked-down LXC containers where
 * DevTools remote debugging is denied).
 * Chrome resolution is shared with archify (`findChromeBinary` — DRY:
 * one candidate list, one `LOKMA_CHROME_BIN` override). No new
 * dependencies — the binary is resolved, never bundled.
 */

/** Fixed CSS viewport for full-page artifact documents. */
export const DESIGN_PNG_WIDTH = 1280;
export const DESIGN_PNG_HEIGHT = 800;

/** PNG file signature — every export is verified before it leaves this module. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Raster a stored artifact to PNG bytes (2x by default for crisp captures).
 * Throws `bad_scale` (400), `bad_id` (400), `design_not_found` (404),
 * `needs_toolchain` (400 — no headless-Chrome binary, same contract as
 * PDF/PPTX/MP4), or `raster_failed` (500 — Chrome errored or emitted
 * non-PNG bytes).
 */
export async function exportArtifactPng(
  idRaw: unknown,
  opts?: { scale?: unknown },
): Promise<{ filename: string; contentType: string; body: Buffer; width: number; height: number }> {
  const scale = opts?.scale === undefined ? 2 : opts.scale;
  if (scale !== 1 && scale !== 2) {
    throw new DesignError('bad_scale', 'scale must be 1 or 2', 400);
  }
  const id = assertArtifactId(idRaw);
  const { html } = await getArtifact(id); // 404 on unknown.

  const chrome = await findChromeBinary();
  if (!chrome) {
    throw new DesignError(
      'needs_toolchain',
      'PNG export needs headless Chromium (set LOKMA_CHROME_BIN or install google-chrome)',
      400,
    );
  }

  const w = DESIGN_PNG_WIDTH;
  const h = DESIGN_PNG_HEIGHT;
  const dir = await mkdtemp(join(tmpdir(), 'lokma-design-png-'));
  const htmlPath = join(dir, 'artifact.html');
  const pngPath = join(dir, 'artifact.png');
  try {
    await writeFile(htmlPath, html, 'utf-8');
    try {
      await exec(
        chrome,
        [
          '--headless',
          '--disable-gpu',
          '--no-sandbox',
          '--hide-scrollbars',
          `--force-device-scale-factor=${scale}`,
          `--window-size=${w},${h}`,
          `--screenshot=${pngPath}`,
          `file://${htmlPath}`,
        ],
        { timeout: PNG_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      );
    } catch (e) {
      throw new DesignError(
        'raster_failed',
        `headless Chromium failed: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`,
        500,
      );
    }
    let body: Buffer;
    try {
      body = await readFile(pngPath);
    } catch {
      throw new DesignError('raster_failed', 'headless Chromium produced no output file', 500);
    }
    if (body.length < 8 || !body.subarray(0, 8).equals(PNG_MAGIC)) {
      throw new DesignError('raster_failed', 'headless Chromium output is not a PNG', 500);
    }
    return { filename: `${id}.png`, contentType: 'image/png', body, width: w * scale, height: h * scale };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
