/**
 * Unit probe for REQ-190 — the tweak path: section splitting, the patch
 * prompt's token contract, patch parsing (including the refusal shapes),
 * and byte-exact splicing of untouched sections.
 *
 * PURE helpers only: no network, no model call, no disk. Run from
 * `packages/lokma-core`:
 *   bun src/design/tweak.test.ts
 * No test framework — plain asserts so the package stays dependency-free.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 *
 * Every refusal shape is asserted on its OWN code+status, because "it threw"
 * is not a contract: a wrong code would still look green in a truthy check.
 */
import {
  DESIGN_TWEAK_HEAD_TARGET,
  DESIGN_TWEAK_NOTE_CAP,
  DESIGN_TWEAK_PROMPT_CAP,
  DESIGN_TWEAK_SYSTEM_PROMPT,
  applyTweakedSections,
  assertTweakNote,
  buildTweakPrompt,
  parseTweakedSections,
  planTweakTargets,
  splitDesignSections,
} from './tweak.js';
import { DesignError } from './types.js';

let passed = 0;
function check(label: string, cond: boolean): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

function expectsDesign(label: string, fn: () => unknown, code: string, status: number): void {
  try {
    fn();
  } catch (e) {
    if (e instanceof DesignError && e.code === code && e.status === status) {
      passed += 1;
      console.log('PASS: ' + label);
      return;
    }
    const seen = e instanceof DesignError ? `${e.code}:${e.status}` : e instanceof Error ? `${e.name}:${e.message}` : String(e);
    throw new Error(`FAIL: ${label} (got ${seen})`);
  }
  throw new Error(`FAIL: ${label} (no error thrown)`);
}

// ── Splitting: offsets must reconstruct the document byte-for-byte ───────────

const DOC =
  '<!doctype html>\n<html lang="en">\n<head><style>a{color:red}</style></head>\n<body>\n' +
  '<h2>Hero</h2>\n<section><h1>Kahve</h1><p>Günlük kahve.</p></section>\n' +
  '<h2>Fiyatlar</h2>\n<section><ul><li>Aylık 90 TL</li></ul></section>\n' +
  '<h2>SSS</h2>\n<section><p>Sorular burada.</p></section>\n' +
  '</body>\n</html>';

{
  const { head, sections } = splitDesignSections(DOC);
  check('head stops before the first H2', head.endsWith('<body>\n'));
  check('three H2 sections found', sections.length === 3);
  check('section numbers are 1..n', sections.map((s) => s.n).join(',') === '1,2,3');
  check('section 1 carries its heading', sections[0]?.heading === 'Hero');
  check('section 3 is the last section', sections[2]?.heading === 'SSS');
  check('the last section runs to end of file', (sections[2]?.end ?? 0) === DOC.length);

  // THE offset contract: concatenating head + every section reproduces the
  // input exactly. Without this a splice silently drops or reorders markup.
  const plan = planTweakTargets(DOC, 10_000_000);
  const rebuilt = plan.ordered.map((s) => s.html).join('');
  check('head + sections reconstruct the document byte-for-byte', rebuilt === DOC);
  check(
    'ordered covers the whole document with no gap or overlap',
    plan.ordered.every((s, i) => (i === 0 ? s.start === 0 : s.start === plan.ordered[i - 1]!.end)),
  );
  check('the head is target 0', plan.ordered[0]?.n === DESIGN_TWEAK_HEAD_TARGET);
  check('a small document travels whole (no target index)', plan.full === true);
}

// ── Prompt budget: a large document must NOT travel whole ────────────────────

{
  const filler = '<p>' + 'x'.repeat(2000) + '</p>\n';
  const big = '<!doctype html><html><body>' + filler.repeat(20) + '</body></html>';
  check('the big fixture exceeds the prompt cap', big.length > DESIGN_TWEAK_PROMPT_CAP);
  const plan = planTweakTargets(big);
  check('a large document switches to patch mode', plan.full === false);
  check('patch mode lists a target per addressable region', plan.targets.length >= 1);
  check(
    'no target preview carries the whole body',
    plan.targets.every((t) => t.preview.length <= 1200),
  );
  const prompt = buildTweakPrompt({ plan, html: big, note: 'butonu terracotta yap', system: 'stripe-linear', type: 'prototype' });
  check('the patch prompt does NOT embed the whole document', !prompt.includes(big.slice(0, 3000)));
  check('the patch prompt names the change request', prompt.includes('butonu terracotta yap'));
  check('the patch prompt lists section numbers', /\[\d+\]/.test(prompt));
  check('the patch prompt carries the system tokens', prompt.includes('#C96442'));
  check(
    'the system prompt demands marker blocks and forbids fences',
    DESIGN_TWEAK_SYSTEM_PROMPT.includes('<!--lokma:section') && DESIGN_TWEAK_SYSTEM_PROMPT.includes('NO markdown code fences'),
  );
}

// ── Note validation: a tweak is a change question, not an empty click ───────

{
  const plan = planTweakTargets(DOC, 10_000_000);
  const full = buildTweakPrompt({ plan, html: DOC, note: 'başlığı büyüt', system: 'stripe-linear', type: 'prototype' });
  check('the whole-document prompt embeds the current html', full.includes('<h2>Hero</h2>'));
  expectsDesign('empty tweak → bad_tweak 400', () => assertTweakNote('   '), 'bad_tweak', 400);
  expectsDesign('missing tweak → bad_tweak 400', () => assertTweakNote(undefined), 'bad_tweak', 400);
  expectsDesign('over-long tweak → bad_tweak 400', () => assertTweakNote('x'.repeat(DESIGN_TWEAK_NOTE_CAP + 1)), 'bad_tweak', 400);
  check('a valid tweak is trimmed', assertTweakNote('  butonu mavi yap  ') === 'butonu mavi yap');
}

// ── Patch parsing: the accepted shape and every refusal shape ───────────────

{
  const plan = planTweakTargets(DOC, 10_000_000);
  const known = plan.ordered.map((s) => s.n);

  const one = parseTweakedSections('<!--lokma:section 2--><section><ul><li>Yeni</li></ul></section><!--/lokma:section 2-->', known);
  check('one well-formed block parses', one.size === 1 && one.has(2));
  check('the block body is the raw replacement', (one.get(2) ?? '').includes('Yeni'));

  const multi = parseTweakedSections(
    '<!--lokma:section 1-->A<!--/lokma:section 1-->noise between<!--lokma:section 3-->C<!--/lokma:section 3-->',
    known,
  );
  check('two blocks with prose between them parse', multi.size === 2 && multi.has(1) && multi.has(3));
  check('the block body excludes the trailing prose', (multi.get(1) ?? '') === 'A');

  check('an answer with no block is an empty patch', parseTweakedSections('looks fine to me', known).size === 0);

  // Refusals — each with its OWN code, because a generic throw hides the bug.
  expectsDesign(
    'unterminated block → tweak_bad_patch 502',
    () => parseTweakedSections('<!--lokma:section 2--><section>cut off', known),
    'tweak_bad_patch',
    502,
  );
  expectsDesign(
    'mismatched close number → tweak_bad_patch 502',
    () => parseTweakedSections('<!--lokma:section 2-->X<!--/lokma:section 3-->', known),
    'tweak_bad_patch',
    502,
  );
  expectsDesign(
    'a section that does not exist → tweak_unknown_target 502',
    () => parseTweakedSections('<!--lokma:section 99-->X<!--/lokma:section 99-->', known),
    'tweak_unknown_target',
    502,
  );
  expectsDesign(
    'the same section twice → tweak_bad_patch 502',
    () =>
      parseTweakedSections(
        '<!--lokma:section 2-->A<!--/lokma:section 2--><!--lokma:section 2-->B<!--/lokma:section 2-->',
        known,
      ),
    'tweak_bad_patch',
    502,
  );
}

// ── Splicing: untouched regions survive byte-for-byte ───────────────────────

{
  const plan = planTweakTargets(DOC, 10_000_000);
  const patches = new Map<number, string>([[2, '<h2>Fiyatlar</h2>\n<section><ul><li>YENİ FİYAT</li></ul></section>']]);
  const out = applyTweakedSections(DOC, plan.ordered, patches);
  check('splice reports the replaced target', out.replaced.join(',') === '2');
  check('the replacement landed', out.html.includes('YENİ FİYAT'));
  check('the replaced text is gone', !out.html.includes('Aylık 90 TL'));
  check('the head survives verbatim', out.html.startsWith('<!doctype html>'));
  check('the LAST section survives verbatim (no tail loss)', out.html.includes('<h2>SSS</h2>\n<section><p>Sorular burada.</p></section>'));
  check('the untouched middle section survives verbatim', out.html.includes('<h2>Hero</h2>'));
  check('the closing tags survive', out.html.trimEnd().endsWith('</body>\n</html>'));
  // The real regression this guards: replacing an early section must not
  // truncate everything after it (a naive index-concat drops the tail).
  check('nothing after the patched section is lost', out.html.includes('</html>'));

  // Replacing the head (tokens/fonts) must not drop the body.
  const headPatch = new Map<number, string>([[DESIGN_TWEAK_HEAD_TARGET, '<!doctype html>\n<html lang="en">\n<head><style>a{color:blue}</style></head>\n<body>\n']]);
  const headOut = applyTweakedSections(DOC, plan.ordered, headPatch);
  check('patching the head keeps every section', headOut.html.includes('<h2>Hero</h2>') && headOut.html.includes('<h2>SSS</h2>'));
  check('patching the head really replaced it', headOut.html.includes('color:blue') && !headOut.html.includes('color:red'));

  const none = applyTweakedSections(DOC, plan.ordered, new Map());
  check('an empty patch returns the document unchanged', none.html === DOC && none.replaced.length === 0);
}

console.log(`\ntweak probe: ${passed} passed`);
