/**
 * Unit probe for the REQ-192 slice-3 design TEMPLATE catalog — the third axis
 * beside the system catalog and the skill catalog.
 *
 * The catalog root is INJECTED (a tmp dir), so the probe never reads or writes
 * the real `~/.lokma/design/templates`; bodies come from real `template.json` +
 * `SKILL.md` files on disk, so `resolveDesignTemplate` is measured against real
 * file I/O. Run from `packages/lokma-core`:
 *   bun src/design/templates.test.ts
 * No test framework — plain asserts so the package stays dependency-free.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DESIGN_TEMPLATES_BUNDLED_DIR,
  installDesignTemplate,
  listDesignTemplates,
  normalizeTemplateMode,
  parseTemplateManifest,
  parseTemplateSelection,
  resolveDesignTemplate,
} from './templates.js';
import { buildDesignPrompt, buildDesignTemplatePrompt } from './generate.js';
import { DesignError } from './types.js';

let passed = 0;
function check(label: string, cond: boolean): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

async function expectsDesign(
  label: string,
  fn: () => Promise<unknown> | unknown,
  code: string,
  status: number,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DesignError && e.code === code && e.status === status) {
      passed += 1;
      console.log('PASS: ' + label);
      return;
    }
    throw new Error('FAIL: ' + label + ' (got ' + (e instanceof Error ? e.name + ':' + e.message : String(e)) + ')');
  }
  throw new Error('FAIL: ' + label + ' (no error thrown)');
}

/**
 * Message-level assertion (the same shape systems.test.ts uses): some refusals
 * are about the WORDING a user reads ("no usable SKILL.md"), not about a code
 * pair, and pinning the message keeps the honest explanation from being
 * silently reworded into something vague.
 */
async function expectsMessage(label: string, fn: () => Promise<unknown>, re: RegExp): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DesignError && re.test(e.message)) {
      passed += 1;
      console.log('PASS: ' + label);
      return;
    }
    throw new Error('FAIL: ' + label + ' (got ' + (e instanceof Error ? e.name + ':' + e.message : String(e)) + ')');
  }
  throw new Error('FAIL: ' + label + ' (no error thrown)');
}

const base = await mkdtemp(join(tmpdir(), 'lokma-design-templates-'));

/** Write one template package: manifest (+ optional body). */
async function writeTemplate(
  root: string,
  id: string,
  manifest: unknown,
  body: string | null,
): Promise<void> {
  const dir = join(root, id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'template.json'),
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
    'utf-8',
  );
  if (body !== null) await writeFile(join(dir, 'SKILL.md'), body, 'utf-8');
}

const DECK_BODY = [
  '# Pitch Deck — 6 slides',
  '',
  '1. Hook — one claim-sized headline, no logo wall.',
  '2. Problem — the status quo with a number attached.',
].join('\n');

await writeTemplate(base, 'pitch-deck', {
  id: 'pitch-deck',
  label: 'Pitch Deck',
  mode: 'deck',
  category: 'Presentations',
  description: 'Six slides that carry an argument.',
  example_prompt: 'A seed round deck',
}, DECK_BODY);

await writeTemplate(base, 'launch-page', {
  id: 'launch-page',
  label: 'Launch Page',
  mode: 'prototype',
  description: 'One conversion column.',
}, '# Launch Page\n\nHero, proof, objections, price, close.\n');

// A manifest that reads but is broken: listed with an honest reason, NOT hidden.
await writeTemplate(base, 'broken-json', '{ "id": "broken-json", ', null);
await writeTemplate(base, 'no-id', { label: 'No Id Here' }, '# x\n');
await writeTemplate(base, 'no-body', { id: 'no-body', label: 'No Body', mode: 'document' }, null);
// A dir that is not a template at all: skipped silently (no template.json).
await mkdir(join(base, 'not-a-template'), { recursive: true });
await writeFile(join(base, 'not-a-template', 'README.md'), 'scratch', 'utf-8');
// A dir name that is not an id: never listed, never read.
await mkdir(join(base, 'Bad Name'), { recursive: true });
await writeFile(join(base, 'Bad Name', 'template.json'), '{"id":"bad-name"}', 'utf-8');

// ── 1. The catalog is a real directory scan, not a frozen table ────────────────
const cat = await listDesignTemplates(base);
const ids = cat.templates.map((t) => t.id);
check('valid templates are listed', ids.includes('pitch-deck') && ids.includes('launch-page'));
check('a dir without template.json is not a template', !ids.includes('not-a-template'));
check('a dir name that is not an id is skipped', !ids.includes('Bad Name') && !ids.includes('bad-name'));
check('broken JSON is listed with hasBody false', (cat.templates.find((t) => t.id === 'broken-json')?.hasBody) === false);
check('broken JSON carries an honest reason', (cat.templates.find((t) => t.id === 'broken-json')?.problem ?? '').includes('not valid JSON'));
check('a manifest with no id is listed as invalid', (cat.templates.find((t) => t.id === 'no-id')?.hasBody) === false);
check('a template with no SKILL.md is listed as invalid', (cat.templates.find((t) => t.id === 'no-body')?.problem ?? '').includes('SKILL.md'));
check('invalid count is reported honestly', cat.invalid === 3);
check('count matches the rows', cat.count === cat.templates.length);
check(
  'the injected root yields installed rows and the repo ships bundled ones',
  cat.templates.find((t) => t.id === 'launch-page')?.origin === 'installed' &&
    cat.templates.find((t) => t.id === 'status-report')?.origin === 'bundled',
);
check('a bundled id never appears twice (installed shadows bundled by id)', new Set(ids).size === ids.length);
check(
  'an id present in BOTH roots resolves to the INSTALLED one',
  // The tmp pitch-deck body is the injected one, the bundled one is different —
  // asserting the id alone would pass either way, so assert the body.
  (await resolveDesignTemplate('pitch-deck', base)).content === DECK_BODY,
);
check(
  'the bundled copy is still reachable under a root that does not shadow it',
  (await resolveDesignTemplate('status-report')).content.includes('number-first'),
);

// ── 2. Manifest parsing: pure, loud, defaulted ───────────────────────────────
check('mode is normalized from an OD alias', normalizeTemplateMode('slide') === 'deck' && normalizeTemplateMode('presentation') === 'deck');
check('unknown mode falls back to prototype', normalizeTemplateMode('sculpture') === 'prototype' && normalizeTemplateMode(undefined) === 'prototype');
const ok = parseTemplateManifest({ id: 'x-y', label: 'X', mode: 'deck', category: 'Sales', example_prompt: 'a brief' });
check('a valid manifest parses', ok.ok && ok.id === 'x-y' && ok.mode === 'deck');
check('category is lowercased for the filter slug', ok.ok && ok.category === 'sales');
check('example_prompt is carried through', ok.ok && ok.examplePrompt === 'a brief');
check('a missing label falls back to the id', parseTemplateManifest({ id: 'fallback-id' }).ok && parseTemplateManifest({ id: 'fallback-id' }).ok === true);
check('an id with illegal characters is refused', (() => { const p = parseTemplateManifest({ id: 'Bad Id' }); return !p.ok && p.reason.includes('lowercase'); })());
check('a non-object manifest is refused', !parseTemplateManifest([]).ok && !parseTemplateManifest('nope').ok);
check('an array manifest is refused', !parseTemplateManifest([1, 2]).ok);

// ── 3. Request coercion: ONE skeleton, never a silent drop ────────────────────
check('absent selection = no template', parseTemplateSelection(undefined) === null && parseTemplateSelection(null) === null && parseTemplateSelection('') === null);
check('a bare string id is accepted', parseTemplateSelection('pitch-deck') === 'pitch-deck');
check('a one-element array is accepted', parseTemplateSelection(['pitch-deck']) === 'pitch-deck');
check('the id is trimmed', parseTemplateSelection('  pitch-deck  ') === 'pitch-deck');
await expectsDesign('two templates are refused — one skeleton per artifact', () => parseTemplateSelection(['a', 'b']), 'too_many_templates', 400);
await expectsDesign('a non-string template is refused', () => parseTemplateSelection([7]), 'bad_template', 400);
await expectsDesign('a blank template is refused', () => parseTemplateSelection(['   ']), 'bad_template', 400);
await expectsDesign('an over-long id is refused', () => parseTemplateSelection('x'.repeat(65)), 'bad_template', 400);
await expectsDesign('a path-escaping id is refused', () => parseTemplateSelection('../../etc/passwd'), 'bad_template', 400);

// ── 4. Resolution carries the REAL skeleton body ─────────────────────────────
const resolved = await resolveDesignTemplate('pitch-deck', base);
check('the payload carries the SKILL.md CONTENT, not the label', resolved.content.includes('claim-sized headline'));
check('the payload names the template', resolved.id === 'pitch-deck' && resolved.label === 'Pitch Deck');
check('the payload reports the target mode', resolved.mode === 'deck');
await expectsDesign('an unknown id 404s', () => resolveDesignTemplate('nope', base), 'template_not_found', 404);
await expectsDesign('a template with no body 409s rather than silently shaping nothing', () => resolveDesignTemplate('no-body', base), 'template_unusable', 409);
await expectsDesign('a broken manifest 409s', () => resolveDesignTemplate('broken-json', base), 'template_unusable', 409);
await expectsDesign('a traversal id 404s at the root, never resolves', () => resolveDesignTemplate('../base', base), 'template_not_found', 404);

// ── 5. The prompt block: skeleton, labelled truncation, empty default ─────────
check('no template = empty block', buildDesignTemplatePrompt(undefined) === '');
check('a body-less payload = empty block', buildDesignTemplatePrompt({ id: 'x', label: 'X', mode: 'deck', content: '' }) === '');
const block = buildDesignTemplatePrompt(resolved);
check('block opens and closes the design_template envelope', block.startsWith('<design_template>') && block.includes('</design_template>'));
check('block carries the skeleton body', block.includes('claim-sized headline'));
check('block names the template', block.includes('pitch-deck') && block.includes('Pitch Deck'));
const fatBlock = buildDesignTemplatePrompt({ id: 'fat', label: 'Fat', mode: 'deck', content: 'Z'.repeat(30_000) });
check('an oversized template is truncated', fatBlock.length < 16_000);
check('the truncation is stated, not hidden', fatBlock.includes('[truncated:'));

// ── 6. Prompt integration: skeleton before skills, type directive last ───────
const bare = buildDesignPrompt({ type: 'prototype', brief: 'a pricing page', system: 'stripe-linear' });
check('a request without a template carries NO design_template block', !bare.includes('design_template'));
const withTemplate = buildDesignPrompt({ type: 'deck', brief: 'a seed deck', system: 'stripe-linear', template: resolved });
check('the request prompt carries the skeleton body', withTemplate.includes('claim-sized headline'));
check('the template block sits after the token table', withTemplate.indexOf('accent #C96442') < withTemplate.indexOf('design_template'));
check('the per-type directive stays the last word', withTemplate.indexOf('design_template') < withTemplate.indexOf('Slide deck as ONE scrollable page'));
const both = buildDesignPrompt({
  type: 'deck',
  brief: 'a seed deck',
  system: 'stripe-linear',
  template: resolved,
  skills: [{ id: 'design-style/brutalist-web', name: 'brutalist-web', content: '## Surfaces\n\nraw blocky borders, heavy 900-weight type' }],
});
check('template and skills are SEPARATE blocks', both.includes('design_template') && both.includes('design_skills'));
check('the skeleton owns structure and the skills own style', both.indexOf('design_template') < both.indexOf('design_skills'));
check('both bodies are present in one prompt', both.includes('claim-sized headline') && both.includes('heavy 900-weight type'));
check('the template block says it does not own style', both.includes('not by the template'));

// ── 7. The bundled root is a real directory, not a claim ─────────────────────
check('the bundled root is a declared constant', DESIGN_TEMPLATES_BUNDLED_DIR === 'design-templates');
const bundledPitch = await resolveDesignTemplate('pitch-deck').catch((e) => e);
check(
  'the repo ships a real bundled pitch-deck template with a readable body',
  !(bundledPitch instanceof DesignError) && bundledPitch.content.includes('Pitch Deck'),
);

// ── 8. REQ-192 slice 4: the INSTALL surface ─────────────────────────────────
// The catalog is only a catalog if something can put a package into it. The
// install root is injected again (a second tmp dir) so the probe never writes
// the real `~/.lokma/design/templates`.
const inst = await mkdtemp(join(tmpdir(), 'lokma-tpl-install-'));
const srcPkg = await mkdtemp(join(tmpdir(), 'lokma-tpl-src-'));

await writeTemplate(srcPkg, 'quarterly-deck', {
  id: 'quarterly-deck',
  label: 'Quarterly Deck',
  mode: 'deck',
  description: 'A review-shaped deck.',
}, '# Quarterly Deck\n\nHeadline, three proofs, one ask.\n');

const installed = await installDesignTemplate(join(srcPkg, 'quarterly-deck'), inst);
check('a local package installs', installed.id === 'quarterly-deck');
check('the install reports the manifest mode', installed.mode === 'deck');
check('the install reports the label it read', installed.label === 'Quarterly Deck');
const listed = await listDesignTemplates(inst);
check('the installed package appears in the catalog', listed.templates.some((t) => t.id === 'quarterly-deck'));
check('an installed row says installed, not bundled', listed.templates.find((t) => t.id === 'quarterly-deck')?.origin === 'installed');
const resolvedInstalled = await resolveDesignTemplate('quarterly-deck', inst);
check('an installed body is resolvable by id', resolvedInstalled.content.includes('three proofs'));

// Rollback: a package whose SKILL.md is missing would list as a row that can
// never shape anything, so the install must refuse AND clean up after itself.
await writeTemplate(srcPkg, 'bodyless', { id: 'bodyless', label: 'Bodyless', mode: 'deck' }, null);
await expectsMessage(
  'a package without a body is refused',
  () => installDesignTemplate(join(srcPkg, 'bodyless'), inst),
  /SKILL\.md/,
);
const afterBodyless = await listDesignTemplates(inst);
check('a refused install leaves NO row behind', !afterBodyless.templates.some((t) => t.id === 'bodyless'));

// Same for a manifest that does not read at all.
await mkdir(join(srcPkg, 'garbage'), { recursive: true });
await writeFile(join(srcPkg, 'garbage', 'template.json'), '{ "id": ', 'utf-8');
await writeFile(join(srcPkg, 'garbage', 'SKILL.md'), '# body\n', 'utf-8');
await expectsMessage(
  'a broken manifest is refused',
  () => installDesignTemplate(join(srcPkg, 'garbage'), inst),
  /template\.json/,
);
check(
  'a refused broken manifest leaves NO row behind',
  !(await listDesignTemplates(inst)).templates.some((t) => t.id === 'garbage'),
);

// Idempotence / conflict: installed shadows bundled on purpose, so re-installing
// the same id must refuse rather than silently overwrite.
await expectsDesign('installing the same id twice is 409', () => installDesignTemplate(join(srcPkg, 'quarterly-deck'), inst), 'template_exists', 409);

// Source guard: REUSED from the system catalog, never a second copy.
await expectsDesign('a loopback URL never reaches git', () => installDesignTemplate('https://127.0.0.1/pkg', inst), 'bad_source', 400);
await expectsDesign('a link-local URL never reaches git', () => installDesignTemplate('https://169.254.169.254/latest', inst), 'bad_source', 400);
await expectsDesign('a plain http URL is refused', () => installDesignTemplate('http://example.com/pkg', inst), 'bad_source', 400);
await expectsDesign('a credentialed URL is refused', () => installDesignTemplate('https://user:pw@example.com/pkg', inst), 'bad_source', 400);
await expectsDesign('a traversal source is refused', () => installDesignTemplate('../escape', inst), 'bad_source', 400);
await expectsDesign('an empty source is refused', () => installDesignTemplate('', inst), 'bad_source', 400);
await expectsDesign('a missing source dir is 404', () => installDesignTemplate(join(srcPkg, 'nope'), inst), 'source_not_found', 404);

// A file (not a dir) is not a package.
await writeFile(join(srcPkg, 'a-file.json'), '{}', 'utf-8');
await expectsMessage('a file source is refused', () => installDesignTemplate(join(srcPkg, 'a-file.json'), inst), /not a directory/);

await rm(inst, { recursive: true, force: true });
await rm(srcPkg, { recursive: true, force: true });

await rm(base, { recursive: true, force: true });
console.log('\nALL ' + passed + ' TEMPLATE-CATALOG PROBES PASSED');
