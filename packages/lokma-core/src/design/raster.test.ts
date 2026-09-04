/**
 * Live probe for design PNG raster export (`./raster` — Phase 3, Docs/34 follow-up).
 * Run: `HOME=$(mktemp -d) bun src/design/raster.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Real temp HOME on disk (startup env — bun snapshots HOME at boot; the
 * guard below refuses anything outside `/tmp/`). Validation failures need
 * no Chrome; the end-to-end raster runs only when a headless-Chrome binary
 * resolves (otherwise an honest SKIP, never a fake pass).
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { findChromeBinary } from '../archify/raster.js';
import { DESIGN_PNG_HEIGHT, DESIGN_PNG_WIDTH, exportArtifactPng } from './raster.js';
import { generateArtifact } from './store.js';
import { DesignError } from './types.js';

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

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Fixed viewport contract — the screenshot matches the viewer size.
check('viewport is 1280x800', DESIGN_PNG_WIDTH === 1280 && DESIGN_PNG_HEIGHT === 800);

// Validation order: scale → id → stored artifact → toolchain. First three need no Chrome.
await expectDesign('scale 3 → bad_scale 400', () => exportArtifactPng('ab-valid-id', { scale: 3 }), 'bad_scale', 400);
await expectDesign('scale "2" → bad_scale 400', () => exportArtifactPng('ab-valid-id', { scale: '2' }), 'bad_scale', 400);
await expectDesign('scale NaN → bad_scale 400', () => exportArtifactPng('ab-valid-id', { scale: NaN }), 'bad_scale', 400);
await expectDesign('evil id → bad_id 400', () => exportArtifactPng('../evil', { scale: 1 }), 'bad_id', 400);
await expectDesign('empty id → bad_id 400', () => exportArtifactPng('', { scale: 1 }), 'bad_id', 400);
await expectDesign(
  'unknown id → design_not_found 404',
  () => exportArtifactPng('zz-no-such-artifact-9', { scale: 1 }),
  'design_not_found',
  404,
);

// End-to-end raster against a real generated artifact (Chrome only).
const probeBinary = await findChromeBinary();
check('findChromeBinary resolves string|null', probeBinary === null || typeof probeBinary === 'string');
console.log(`INFO: chrome binary = ${probeBinary ?? '<none>'}`);
if (probeBinary === null) {
  skipped += 1;
  console.log('SKIP: end-to-end raster (no headless Chrome on this box)');
} else {
  const { id } = await generateArtifact('prototype', 'png probe pricing page with three tiers', 'stripe-linear');
  check('seed artifact generated', /^[a-z0-9][a-z0-9-]{1,63}$/.test(id));
  const one = await exportArtifactPng(id, { scale: 1 });
  check('1x content type is image/png', one.contentType === 'image/png');
  check('1x filename is <id>.png', one.filename === `${id}.png`);
  check('1x body has the PNG signature', PNG_MAGIC.every((b, i) => one.body[i] === b));
  check('1x reports the fixed viewport', one.width === 1280 && one.height === 800);
  const two = await exportArtifactPng(id);
  check('default scale is 2x', two.width === 2560 && two.height === 1600);
  check('2x body has the PNG signature', PNG_MAGIC.every((b, i) => two.body[i] === b));
}

console.log(`\n${passed} passed, ${skipped} skipped`);
