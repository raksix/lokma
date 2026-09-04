/**
 * Live probe for archify PNG raster export (`./raster` — Phase 3, Docs/31 follow-up).
 * Run: `HOME=$(mktemp -d) bun src/archify/raster.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Real temp HOME on disk (startup env — bun snapshots HOME at boot; the
 * guard below refuses anything outside `/tmp/`). Validation failures need
 * no Chrome; the end-to-end raster runs only when `findChromeBinary()`
 * resolves one (otherwise an honest SKIP, never a fake pass).
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { ArchifyError } from './ir.js';
import {
  buildRasterHtml,
  exportDiagramPng,
  findChromeBinary,
  PNG_MAX_EDGE,
  PNG_TIMEOUT_MS,
} from './raster.js';
import { generateDiagram } from './store.js';

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

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Shell contract: exact canvas size, raw SVG inline, title escaped.
const shell = buildRasterHtml('a<b', '<svg/>', 100, 50);
check('shell carries the svg', shell.includes('<svg/>'));
check('shell pins canvas width', shell.includes('width:100px'));
check('shell pins canvas height', shell.includes('height:50px'));
check('shell escapes the title', shell.includes('a&lt;b') && !shell.includes('a<b'));

// Constants stay sane (viewport cap feeds `--window-size`, timeout feeds exec).
check('PNG_MAX_EDGE caps the viewport', PNG_MAX_EDGE === 4096);
check('PNG_TIMEOUT_MS covers cold starts', PNG_TIMEOUT_MS === 60_000);

// Binary resolution never throws — null (→ `needs_toolchain`) is a value.
const probeBinary = await findChromeBinary();
check('findChromeBinary resolves string|null', probeBinary === null || typeof probeBinary === 'string');
console.log(`INFO: chrome binary = ${probeBinary ?? '<none>'}`);

// Validation order: scale → id → stored IR → toolchain. First three need no Chrome.
await expectArchify('scale 3 → bad_scale 400', () => exportDiagramPng('ab-valid-id', { scale: 3 }), 'bad_scale', 400);
await expectArchify('scale "2" → bad_scale 400', () => exportDiagramPng('ab-valid-id', { scale: '2' }), 'bad_scale', 400);
await expectArchify('scale NaN → bad_scale 400', () => exportDiagramPng('ab-valid-id', { scale: NaN }), 'bad_scale', 400);
await expectArchify('evil id → bad_id 400', () => exportDiagramPng('../evil', { scale: 1 }), 'bad_id', 400);
await expectArchify('empty id → bad_id 400', () => exportDiagramPng('', { scale: 1 }), 'bad_id', 400);
await expectArchify(
  'unknown id → diagram_not_found 404',
  () => exportDiagramPng('zz-no-such-diagram-9', { scale: 1 }),
  'diagram_not_found',
  404,
);

// End-to-end raster against a real generated diagram (Chrome only).
if (probeBinary === null) {
  skipped += 1;
  console.log('SKIP: end-to-end raster (no headless Chrome on this box)');
} else {
  const { id } = await generateDiagram('architecture', 'png probe alpha -> beta -> gamma', 'signal-flow', 'dark');
  check('seed diagram generated', /^[a-z0-9][a-z0-9-]{1,63}$/.test(id));
  const one = await exportDiagramPng(id, { scale: 1 });
  check('1x content type is image/png', one.contentType === 'image/png');
  check('1x filename is <id>.png', one.filename === `${id}.png`);
  check('1x body has the PNG signature', PNG_MAGIC.every((b, i) => one.body[i] === b));
  check('1x reports positive dimensions', one.width > 0 && one.height > 0);
  const two = await exportDiagramPng(id);
  check('default scale is 2x', two.width === one.width * 2 && two.height === one.height * 2);
  check('2x body has the PNG signature', PNG_MAGIC.every((b, i) => two.body[i] === b));
}

console.log(`\n${passed} passed, ${skipped} skipped`);
