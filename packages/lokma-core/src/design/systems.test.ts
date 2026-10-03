/**
 * Unit probe for the REQ-191 design system catalog — manifest parsing,
 * taxonomy mapping, install-source validation (SSRF), the directory scan
 * with its bundled fallback, install and activation.
 *
 * Uses a real tmp HOME on purpose (the scan really reads manifest.json
 * files and activation really writes into the project). Never touches the
 * real ~/.lokma. Run from `packages/lokma-core`:
 *   bun src/design/systems.test.ts
 * No test framework — plain asserts so the package stays dependency-free.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SYSTEM_CATEGORIES,
  assertInstallSource,
  installDesignSystem,
  listDesignSystems,
  normalizeSystemCategory,
  parseSystemManifest,
  systemIdFromSource,
  useDesignSystem,
} from './systems.js';
import { DesignError } from './types.js';

let passed = 0;
function check(label: string, cond: boolean): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

/** Assert a thrown DesignError's code+status, the way store.test.ts does. */
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

/** Assert a thrown DesignError by message shape only (guard rejections). */
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

// The catalog root is INJECTED, never derived from $HOME: os.homedir() is
// cached by the runtime (measured — setting process.env.HOME inside the
// probe does NOT move it), so a HOME override would read/write the real
// ~/.lokma/design/systems. Every call below passes this tmp root.
const base = await mkdtemp(join(tmpdir(), 'lokma-systems-'));
const sysRoot = join(base, 'systems');
const home = base;

async function writePackage(id: string, manifest: unknown, files: Record<string, string> = {}): Promise<void> {
  const dir = join(sysRoot, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'manifest.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest), 'utf-8');
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(dir, name), body, 'utf-8');
  }
}

// ── taxonomy ────────────────────────────────────────────────────────────────
for (const cat of SYSTEM_CATEGORIES) {
  check(`taxonomy heading "${cat}" maps onto itself`, normalizeSystemCategory(cat) === cat);
}
check('category tolerates case + separator noise', normalizeSystemCategory('  developer-Tools ') === 'Developer Tools');
check('category maps e_commerce', normalizeSystemCategory('e_commerce') === 'E-commerce');
check('category maps "AI & LLM"', normalizeSystemCategory('AI & LLM') === 'AI / LLM');
check('category maps bare "ai"', normalizeSystemCategory('ai') === 'AI / LLM');
check('unknown heading falls into Other', normalizeSystemCategory('totally unknown') === 'Other');
check('empty category falls into Other', normalizeSystemCategory('') === 'Other');
check('non-string category falls into Other', normalizeSystemCategory(42) === 'Other');

// ── manifest parsing ────────────────────────────────────────────────────────
{
  const minimal = parseSystemManifest({ id: 'stripe' });
  check('minimal manifest (id only) parses', minimal.ok);
  if (minimal.ok) {
    check('minimal manifest defaults its label to the id', minimal.label === 'stripe');
    check('minimal manifest defaults its category to Other', minimal.category === 'Other');
    check('minimal manifest has an empty description', minimal.description === '');
  }
  const messy = parseSystemManifest({ id: '  Stripe  ', name: 'Stripe', label: 'Stripe Inc' });
  check('manifest id is lowercased + trimmed', messy.ok && messy.id === 'stripe');
  check('name wins over label for the display label', messy.ok && messy.label === 'Stripe');

  const missing = parseSystemManifest({ name: 'No Id' });
  check('manifest without an id is rejected', !missing.ok);
  check('rejection names the missing field', !missing.ok && missing.reason.includes('no "id"'));

  for (const bad of ['../etc', 'a/b', '', '   ', '.hidden', 'x'.repeat(80)]) {
    check(`manifest id "${bad}" is refused by the jail`, !parseSystemManifest({ id: bad }).ok);
  }
  for (const nonObj of [null, 'a string', [1, 2], 7, true]) {
    check(`manifest ${JSON.stringify(nonObj)} is not an object`, !parseSystemManifest(nonObj).ok);
  }

  const long = parseSystemManifest({ id: 'x', name: 'N'.repeat(300), description: 'D'.repeat(900) });
  check('over-long label is truncated, not rejected', long.ok && long.label.length === 80);
  check('over-long description is truncated, not rejected', long.ok && long.description.length === 240);
}

// ── install source (SSRF) ───────────────────────────────────────────────────
check('public https URL is accepted', assertInstallSource('https://github.com/acme/stripe-system').kind === 'url');
for (const host of [
  '127.0.0.1',
  'localhost',
  '10.0.0.5',
  '192.168.1.1',
  '172.16.9.9',
  '169.254.169.254',
  '100.64.0.1',
]) {
  check(`SSRF: ${host} is refused`, (() => { try { assertInstallSource(`https://${host}/pkg`); return false; } catch { return true; } })());
}
check('172.15 (outside the private block) is allowed', assertInstallSource('https://172.15.0.1/pkg').kind === 'url');
check('172.32 (outside the private block) is allowed', assertInstallSource('https://172.32.0.1/pkg').kind === 'url');
await expectsDesign('plain http is refused', () => assertInstallSource('http://example.com/pkg'), 'bad_source', 400);
await expectsDesign('credentials in the URL are refused', () => assertInstallSource('https://u:p@example.com/pkg'), 'bad_source', 400);
await expectsDesign('file: scheme is refused', () => assertInstallSource('file:///etc/passwd'), 'bad_source', 400);
await expectsDesign('ftp: scheme is refused', () => assertInstallSource('ftp://e.com/pkg'), 'bad_source', 400);
await expectsDesign('traversal source is refused', () => assertInstallSource('../../etc'), 'bad_source', 400);
await expectsDesign('empty source is refused', () => assertInstallSource(''), 'bad_source', 400);
await expectsDesign('non-string source is refused', () => assertInstallSource(123), 'bad_source', 400);
await expectsDesign('over-long source is refused', () => assertInstallSource(`https://e.com/${'a'.repeat(600)}`), 'bad_source', 400);
{
  // `~/` expands against the REAL homedir (cached by the runtime), so the
  // assertion is about expansion, not about which home this probe uses.
  const local = assertInstallSource('~/design/some-pkg');
  check('a tilde path expands under the real home', local.kind === 'path' && local.path === join(homedir(), 'design/some-pkg'));
  const abs = assertInstallSource('/opt/packs/acme');
  check('an absolute local path stays itself', abs.kind === 'path' && abs.path === '/opt/packs/acme');
}

// ── id derivation ───────────────────────────────────────────────────────────
check('id comes from the last path segment', systemIdFromSource('/tmp/packs/stripe-design-system') === 'stripe-design-system');
check('a .git suffix is stripped', systemIdFromSource('https://github.com/acme/linear.git') === 'linear');
check('a trailing slash is stripped', systemIdFromSource('https://github.com/acme/notion/') === 'notion');
await expectsDesign('an unusable segment is refused', () => systemIdFromSource('/tmp/packs/---'), 'bad_source', 400);

// ── catalog scan: bundled fallback ──────────────────────────────────────────
{
  const empty = await listDesignSystems(sysRoot);
  check('a missing catalog dir falls back to the bundled cards', empty.source === 'bundled');
  check('the fallback still lists rows', empty.count > 0);
  check('every fallback row is marked bundled', empty.systems.every((s) => s.origin === 'bundled'));
  check(
    'the four bundled ids survive the migration',
    empty.systems.map((s) => s.id).join(',') === 'stripe-linear,omp-dark,paper-ink,minimal-geo',
  );
  check('the taxonomy always ships with the response', empty.categories === SYSTEM_CATEGORIES);
}

// ── catalog scan: real packages ─────────────────────────────────────────────
await writePackage('stripe', { id: 'stripe', name: 'Stripe', category: 'Fintech', description: 'purple' }, { 'tokens.css': ':root{--a:1}' });
await writePackage('linear', { id: 'linear', name: 'Linear' }, { 'DESIGN.md': '# Linear' });
{
  const real = await listDesignSystems(sysRoot);
  check('installed packages report source=catalog', real.source === 'catalog');
  check('both packages are listed', real.count === 2);
  const stripe = real.systems.find((s) => s.id === 'stripe');
  check('a package row keeps its label', stripe?.label === 'Stripe');
  check('a package row keeps its taxonomy group', stripe?.category === 'Fintech');
  check('a package row is marked catalog-origin', stripe?.origin === 'catalog');
  check('a package row reports the files it carries', stripe?.files.includes('tokens.css') === true);
  const linear = real.systems.find((s) => s.id === 'linear');
  check('a missing file is simply absent from `files`', linear?.files.includes('tokens.css') === false);
}

// ── a broken package must not break the catalog ─────────────────────────────
await writePackage('broken', '{ not json');
await writePackage('nolabel', { name: 'no id here' });
{
  const mixed = await listDesignSystems(sysRoot);
  check('a broken package still appears as a row', mixed.count === 4);
  const broken = mixed.systems.find((s) => s.id === 'broken');
  check('bad JSON is marked invalid', broken?.status === 'invalid');
  check('bad JSON carries an honest problem string', (broken?.problem ?? '').includes('valid JSON'));
  const nolabel = mixed.systems.find((s) => s.id === 'nolabel');
  check('an id-less manifest is marked invalid', nolabel?.status === 'invalid');
  check('the healthy rows are unaffected', mixed.systems.find((s) => s.id === 'stripe')?.status === 'ok');
}

// ── dot dirs and junk names are not packages ────────────────────────────────
await mkdir(join(sysRoot, '.git'), { recursive: true });
await writeFile(join(sysRoot, '.git', 'manifest.json'), JSON.stringify({ id: 'git' }), 'utf-8');
{
  const names = (await listDesignSystems(sysRoot)).systems.map((s) => s.id);
  check('a dot dir is never a package', !names.includes('.git'));
}

// ── install ─────────────────────────────────────────────────────────────────
{
  const src = join(home, 'src-pkg');
  await mkdir(src, { recursive: true });
  await writeFile(join(src, 'manifest.json'), JSON.stringify({ id: 'acme', name: 'Acme' }), 'utf-8');
  await writeFile(join(src, 'DESIGN.md'), '# Acme\n\n## a\n## b\n', 'utf-8');
  const res = await installDesignSystem(src, sysRoot);
  check('install derives the id from the directory', res.id === 'src-pkg');
  check('install reports the package files', res.files.includes('DESIGN.md'));
  check('the installed package shows up in the catalog', (await listDesignSystems(sysRoot)).systems.some((s) => s.id === 'src-pkg'));
  await expectsDesign('installing the same id twice is 409', () => installDesignSystem(src, sysRoot), 'system_exists', 409);
}

{
  const bad = join(home, 'bad-pkg');
  await mkdir(bad, { recursive: true });
  await writeFile(join(bad, 'readme.txt'), 'no manifest here', 'utf-8');
  await expectsMessage('a package without a manifest is refused', () => installDesignSystem(bad, sysRoot), /manifest\.json/);
  check(
    'the refused install rolled back — no half-package row',
    !(await listDesignSystems(sysRoot)).systems.some((s) => s.id === 'bad-pkg'),
  );
}

{
  const file = join(home, 'a-file');
  await writeFile(file, 'x', 'utf-8');
  await expectsMessage('a file source is refused', () => installDesignSystem(file, sysRoot), /not a directory/);
  await expectsMessage('a missing source dir is 404', () => installDesignSystem(join(home, 'nope'), sysRoot), /No such package directory/);
  await expectsDesign('a loopback URL never reaches git', () => installDesignSystem('https://127.0.0.1/pkg', sysRoot), 'bad_source', 400);
  await expectsDesign('a link-local URL never reaches git', () => installDesignSystem('https://169.254.169.254/latest', sysRoot), 'bad_source', 400);
}

// ── activation ──────────────────────────────────────────────────────────────
{
  await writePackage(
    'acme-brand',
    { id: 'acme-brand', name: 'Acme' },
    { 'DESIGN.md': '# Acme\n\n## 1\n## 2\n', 'tokens.css': ':root{--brand:#123456}' },
  );
  const proj = join(home, 'project');
  await mkdir(proj, { recursive: true });
  const res = await useDesignSystem('acme-brand', proj, sysRoot);
  check('activation copies both brand files', res.copied.join(',') === 'DESIGN.md,tokens.css');
  check('activation echoes the token body', (res.tokens ?? '').includes('#123456'));
  // The guard reads exactly this path — prove the file is really on disk.
  const guard = await readFile(join(proj, '.lokma', 'DESIGN.md'), 'utf-8');
  check('the guard path now holds the package DESIGN.md', guard.includes('# Acme'));
}

{
  await writePackage('toks-only', { id: 'toks-only' }, { 'tokens.css': ':root{--x:1}' });
  const proj = join(home, 'p2');
  await mkdir(proj, { recursive: true });
  const res = await useDesignSystem('toks-only', proj, sysRoot);
  check('a token-only package activates what it has', res.copied.join(',') === 'tokens.css');
  let designExists = true;
  try {
    await readFile(join(proj, '.lokma', 'DESIGN.md'));
  } catch {
    designExists = false;
  }
  check('a token-only package writes no DESIGN.md', !designExists);
}

{
  const proj = join(home, 'p3');
  await mkdir(proj, { recursive: true });
  await expectsMessage('an unknown system is 404', () => useDesignSystem('ghost', proj, sysRoot), /No installed design system/);
  await expectsDesign('a traversal id is refused', () => useDesignSystem('../escape', proj), 'bad_id', 400);
  await expectsDesign('an empty id is refused', () => useDesignSystem('', proj, sysRoot), 'bad_id', 400);
  await expectsMessage('a missing project cwd is 404', () => useDesignSystem('toks-only', join(home, 'ghost-project', sysRoot)), /no such project directory/i);
}

{
  await writePackage('empty-pkg', { id: 'empty-pkg' });
  const proj = join(home, 'p4');
  await mkdir(proj, { recursive: true });
  await expectsMessage('a package with nothing to activate is refused', () => useDesignSystem('empty-pkg', proj, sysRoot), /neither DESIGN\.md nor tokens\.css/);
}

{
  await writePackage('junk-pkg', '{ nope');
  const proj = join(home, 'p5');
  await mkdir(proj, { recursive: true });
  await expectsMessage('an invalid package cannot be activated', () => useDesignSystem('junk-pkg', proj, sysRoot), /not usable/);
}

await rm(base, { recursive: true, force: true });
console.log(passed + ' passed');