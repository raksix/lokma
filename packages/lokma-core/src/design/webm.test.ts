/**
 * Live probe for design WebM video export (`./webm` — Phase 3, Docs/34 §6).
 * Run: `HOME=$(mktemp -d) bun src/design/webm.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Real temp HOME on disk (startup env — bun snapshots HOME at boot; the
 * guard below refuses anything outside `/tmp/`). Validation failures need
 * no toolchain; the end-to-end encode runs only when BOTH headless Chrome
 * and ffmpeg resolve (otherwise an honest SKIP, never a fake pass).
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { findChromeBinary } from '../archify/raster.js';
import { findFfmpegBinary, WEBM_FPS, WEBM_FRAMES } from '../archify/webm.js';
import { generateArtifact } from './store.js';
import { DesignError } from './types.js';
import { buildDesignWebmFrameHtml, exportArtifactWebm, DESIGN_WEBM_TIMEOUT_MS } from './webm.js';

const HOME = process.env.HOME ?? '';
if (!HOME.startsWith('/tmp/')) {
  throw new Error(`refusing to run outside temp HOME (got ${HOME || '<empty>'})`);
}

let passed = 0;
let skipped = 0;
function check(label: string, cond: boolean): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

async function expectDesign(
  label: string,
  fn: () => Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DesignError && e.code === code && e.status === status) {
      passed += 1;
      console.log(`PASS: ${label}`);
      return;
    }
    throw new Error(`FAIL: ${label} (got ${e instanceof Error ? `${e.name}:${e.message}` : String(e)})`);
  }
  throw new Error(`FAIL: ${label} (no error thrown)`);
}

const WEBM_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];
const PAGE = '<!DOCTYPE html><html><head><title>t</title></head><body><h1>hi</h1></body></html>';

// Frame contract: author HTML survives, zoom style is injected, first frame
// ~1.0x and last frame ~1.2x, mid frame differs, t clamps at both ends.
const first = buildDesignWebmFrameHtml(PAGE, 0);
check('frame keeps the author body', first.includes('<h1>hi</h1>'));
check('frame injects a zoom style', first.includes('<style>') && first.includes('transform:scale('));
check('frame clips overflow', first.includes('overflow:hidden'));
check('first frame starts near 1x zoom', first.includes('scale(1.0000)'));
const last = buildDesignWebmFrameHtml(PAGE, 1);
check('last frame ends near 1.2x zoom', last.includes('scale(1.2000)'));
check('mid frame transform differs from the ends', buildDesignWebmFrameHtml(PAGE, 0.5) !== first);
check('t clamps above 1', buildDesignWebmFrameHtml(PAGE, 9) === buildDesignWebmFrameHtml(PAGE, 1));
check('t clamps below 0', buildDesignWebmFrameHtml(PAGE, -3) === buildDesignWebmFrameHtml(PAGE, 0));
check('headless pages still get the zoom', buildDesignWebmFrameHtml('<p>bare</p>', 0).includes('scale(1.0000)'));

// Constants stay sane (clip length feeds the pane label, budget covers 12 cold starts).
check('clip is 12 frames at 6 fps', WEBM_FRAMES === 12 && WEBM_FPS === 6);
check('encode budget covers cold starts', DESIGN_WEBM_TIMEOUT_MS >= 120_000);

// Binary resolution never throws — null (→ `needs_toolchain`) is a value.
const probeChrome = await findChromeBinary();
const probeFfmpeg = await findFfmpegBinary();
check('findChromeBinary resolves string|null', probeChrome === null || typeof probeChrome === 'string');
check('findFfmpegBinary resolves string|null', probeFfmpeg === null || typeof probeFfmpeg === 'string');
console.log(`INFO: chrome binary = ${probeChrome ?? '<none>'}`);
console.log(`INFO: ffmpeg binary = ${probeFfmpeg ?? '<none>'}`);

// Validation order: id → stored artifact → toolchain. First two need no binaries.
await expectDesign('evil id → bad_id 400', () => exportArtifactWebm('../evil'), 'bad_id', 400);
await expectDesign('empty id → bad_id 400', () => exportArtifactWebm(''), 'bad_id', 400);
await expectDesign(
  'unknown id → design_not_found 404',
  () => exportArtifactWebm('zz-no-such-artifact-9'),
  'design_not_found',
  404,
);

// End-to-end encode against a real generated artifact (Chrome + ffmpeg only).
if (probeChrome === null || probeFfmpeg === null) {
  skipped += 1;
  console.log('SKIP: end-to-end webm encode (Chrome and ffmpeg both required)');
} else {
  const { id } = await generateArtifact('prototype', 'webm probe landing page', 'stripe-linear');
  check('seed artifact generated', /^[a-z0-9][a-z0-9-]{1,63}$/.test(id));
  const webm = await exportArtifactWebm(id);
  check('content type is video/webm', webm.contentType === 'video/webm');
  check('filename is <id>.webm', webm.filename === `${id}.webm`);
  check('body has the EBML signature', WEBM_MAGIC.every((b, i) => webm.body[i] === b));
  check('body is a non-trivial video', webm.body.length > 1024);
  check('reports fps + frames', webm.fps === WEBM_FPS && webm.frames === WEBM_FRAMES);
  check('reports the fixed 1280x800 viewport', webm.width === 1280 && webm.height === 800);
}

console.log(`\n${passed} passed, ${skipped} skipped`);
