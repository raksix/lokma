import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ArchifyError } from './ir.js';
import { buildSvg, canvasSize, esc, placeNodes } from './render.js';
import { assertDiagramId, readStoredIr } from './store.js';

const exec = promisify(execFile);

/**
 * PNG raster export for archify diagrams (Phase 3, Docs/31 §6.6 follow-up).
 * Renders the deterministic SVG at exact canvas size inside a minimal HTML
 * shell, then screenshots it with headless Chromium (`--screenshot` needs
 * no CDP socket, so it works inside locked-down LXC containers where
 * DevTools remote debugging is denied).
 * No new dependencies — the binary is resolved, never bundled.
 */

/** Env override wins (same pattern as provider base URLs), then well-known paths. */
const CHROME_CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

/** Max viewport edge in CSS px (scale multiplies afterwards). */
export const PNG_MAX_EDGE = 4096;
/** Headless screenshot budget — cold Chrome starts take seconds on shared boxes. */
export const PNG_TIMEOUT_MS = 60_000;
/** PNG file signature — every export is verified before it leaves this module. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Resolve the headless-Chrome binary (`LOKMA_CHROME_BIN` override first).
 * Returns null instead of throwing — the caller turns it into `needs_toolchain`.
 */
export async function findChromeBinary(): Promise<string | null> {
  const override = (process.env.LOKMA_CHROME_BIN ?? '').trim();
  const candidates = override ? [override, ...CHROME_CANDIDATES] : CHROME_CANDIDATES;
  for (const bin of candidates) {
    try {
      await exec(bin, ['--version'], { timeout: 10_000 });
      return bin;
    } catch {
      // Not installed / not executable — try the next candidate.
    }
  }
  return null;
}

/**
 * Minimal raster shell — exact canvas size, no viewer chrome, no animations.
 * The stored SVG scales 1:1 because the wrapper div matches the viewBox.
 */
export function buildRasterHtml(title: string, svg: string, w: number, h: number): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>html,body{margin:0;padding:0;background:#fff}</style></head><body><div style="width:${w}px;height:${h}px">${svg}</div></body></html>`;
}

/**
 * Raster a stored diagram to PNG bytes (2x by default for crisp diagrams).
 * Throws `diagram_not_found` (404), `bad_scale` (400), `needs_toolchain`
 * (400 — no headless-Chrome binary, same contract as design PDF/PPTX/MP4),
 * or `raster_failed` (500 — Chrome errored or emitted non-PNG bytes).
 */
export async function exportDiagramPng(
  idRaw: unknown,
  opts?: { scale?: unknown },
): Promise<{ filename: string; contentType: string; body: Buffer; width: number; height: number }> {
  const scale = opts?.scale === undefined ? 2 : opts.scale;
  if (scale !== 1 && scale !== 2) {
    throw new ArchifyError('bad_scale', 'scale must be 1 or 2', 400);
  }
  const id = assertDiagramId(idRaw);
  const ir = await readStoredIr(id); // 404 on unknown.

  const chrome = await findChromeBinary();
  if (!chrome) {
    throw new ArchifyError(
      'needs_toolchain',
      'PNG export needs headless Chromium (set LOKMA_CHROME_BIN or install google-chrome)',
      400,
    );
  }

  const placed = placeNodes(ir);
  const size = canvasSize(placed);
  const w = Math.min(Math.max(1, Math.round(size.w)), PNG_MAX_EDGE);
  const h = Math.min(Math.max(1, Math.round(size.h)), PNG_MAX_EDGE);

  const dir = await mkdtemp(join(tmpdir(), 'lokma-png-'));
  const htmlPath = join(dir, 'diagram.html');
  const pngPath = join(dir, 'diagram.png');
  try {
    await writeFile(htmlPath, buildRasterHtml(ir.title, buildSvg(ir), w, h), 'utf-8');
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
      throw new ArchifyError(
        'raster_failed',
        `headless Chromium failed: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`,
        500,
      );
    }
    let body: Buffer;
    try {
      body = await readFile(pngPath);
    } catch {
      throw new ArchifyError('raster_failed', 'headless Chromium produced no output file', 500);
    }
    if (body.length < 8 || !body.subarray(0, 8).equals(PNG_MAGIC)) {
      throw new ArchifyError('raster_failed', 'headless Chromium output is not a PNG', 500);
    }
    return { filename: `${id}.png`, contentType: 'image/png', body, width: w * scale, height: h * scale };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
