/**
 * Live probe for archify WebM video export (`./webm` — Phase 3, Docs/31 §6.6).
 * Run: `HOME=$(mktemp -d) bun src/archify/webm.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Real temp HOME on disk (startup env — bun snapshots HOME at boot; the
 * guard below refuses anything outside `/tmp/`). Validation failures need
 * no toolchain; the end-to-end encode runs only when BOTH headless Chrome
 * and ffmpeg resolve (otherwise an honest SKIP, never a fake pass).
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { ArchifyError } from './ir.js';
import { findChromeBinary } from './raster.js';
import { generateDiagram } from './store.js';
import {
  buildWebmFrameHtml,
  exportDiagramWebm,
  findFfmpegBinary,
  WEBM_FPS,
  WEBM_FRAMES,
  WEBM_MAX_EDGE,
} from './webm.js';

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

async function expectArchify(
  label: string,
  fn: () => Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ArchifyError && e.code === code && e.status === status) {
      passed += 1;
      console.log(`PASS: ${label}`);
      return;
    }
    throw new Error(`FAIL: ${label} (got ${e instanceof Error ? `${e.name}:${e.message}` : String(e)})`);
  }
  throw new Error(`FAIL: ${label} (no error thrown)`);
}

const WEBM_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];

// Frame-shell contract: exact canvas size, raw SVG inline, title escaped,
// per-frame transform baked in (first frame ~1.0x, last frame ~1.2x).
const first = buildWebmFrameHtml('a<b', '<svg/>', 100, 50, 0);
check('frame shell carries the svg', first.includes('<svg/>'));
check('frame shell pins canvas width', first.includes('width:100px'));
check('frame shell pins canvas height', first.includes('height:50px'));
check('frame shell escapes the title', first.includes('a&lt;b') && !first.includes('a<b'));
check('first frame starts near 1x zoom', first.includes('scale(1.0000)'));
const last = buildWebmFrameHtml('done', '<svg/>', 100, 50, 1);
check('last frame ends near 1.2x zoom', last.includes('scale(1.2000)'));
check('mid frame transform differs from the ends', buildWebmFrameHtml('m', '<svg/>', 100, 50, 0.5) !== first);
check('t clamps above 1', buildWebmFrameHtml('m', '<svg/>', 100, 50, 9) === buildWebmFrameHtml('m', '<svg/>', 100, 50, 1));
check('t clamps below 0', buildWebmFrameHtml('m', '<svg/>', 100, 50, -3) === buildWebmFrameHtml('m', '<svg/>', 100, 50, 0));

// Constants stay sane (clip length feeds the pane label, edge feeds `--window-size`).
check('clip is 12 frames at 6 fps', WEBM_FRAMES === 12 && WEBM_FPS === 6);
check('WEBM_MAX_EDGE caps the viewport', WEBM_MAX_EDGE === 1280);

// Binary resolution never throws — null (→ `needs_toolchain`) is a value.
const probeChrome = await findChromeBinary();
const probeFfmpeg = await findFfmpegBinary();
check('findChromeBinary resolves string|null', probeChrome === null || typeof probeChrome === 'string');
check('findFfmpegBinary resolves string|null', probeFfmpeg === null || typeof probeFfmpeg === 'string');
console.log(`INFO: chrome binary = ${probeChrome ?? '<none>'}`);
console.log(`INFO: ffmpeg binary = ${probeFfmpeg ?? '<none>'}`);

// Validation order: id → stored IR → toolchain. First two need no binaries.
await expectArchify('evil id → bad_id 400', () => exportDiagramWebm('../evil'), 'bad_id', 400);
await expectArchify('empty id → bad_id 400', () => exportDiagramWebm(''), 'bad_id', 400);
await expectArchify(
  'unknown id → diagram_not_found 404',
  () => exportDiagramWebm('zz-no-such-diagram-9'),
  'diagram_not_found',
  404,
);

// End-to-end encode against a real generated diagram (Chrome + ffmpeg only).
if (probeChrome === null || probeFfmpeg === null) {
  skipped += 1;
  console.log('SKIP: end-to-end webm encode (Chrome and ffmpeg both required)');
} else {
  const { id } = await generateDiagram('architecture', 'webm probe alpha -> beta -> gamma', 'signal-flow', 'dark');
  check('seed diagram generated', /^[a-z0-9][a-z0-9-]{1,63}$/.test(id));
  const webm = await exportDiagramWebm(id);
  check('content type is video/webm', webm.contentType === 'video/webm');
  check('filename is <id>.webm', webm.filename === `${id}.webm`);
  check('body has the EBML signature', WEBM_MAGIC.every((b, i) => webm.body[i] === b));
  check('body is a non-trivial video', webm.body.length > 1024);
  check('reports fps + frames', webm.fps === WEBM_FPS && webm.frames === WEBM_FRAMES);
  check('reports positive dimensions', webm.width > 0 && webm.height > 0);
}

console.log(`\n${passed} passed, ${skipped} skipped`);
