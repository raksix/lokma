/**
 * Unit probe for the REQ-192 design SKILL catalog — scope filtering, group
 * normalization, request-shape coercion, and the load-bearing part: the
 * resolved SKILL.md BODIES that actually reach the design prompt.
 *
 * The scan is INJECTED (the probe never reads the real `skills/` tree), but
 * the bodies come from a real tmp SKILL.md on disk, so `resolveDesignSkills`
 * is measured against real file I/O. Run from `packages/lokma-core`:
 *   bun src/design/skills.test.ts
 * No test framework — plain asserts so the package stays dependency-free.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DESIGN_SKILL_GROUPS,
  DESIGN_SKILL_SELECT_CAP,
  listDesignSkills,
  normalizeSkillGroup,
  parseSkillSelection,
  resolveDesignSkills,
} from './skills.js';
import { buildDesignPrompt, buildDesignSkillsPrompt } from './generate.js';
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

const base = await mkdtemp(join(tmpdir(), 'lokma-design-skills-'));

const BRUTAL_BODY = [
  '# Brutalist Web',
  '',
  'Use raw blocky borders, a stark monochrome palette, heavy 900-weight type and',
  'zero rounded corners. No gradients, no shadows, no soft palette washes.',
].join('\n');

const A11Y_BODY = '# A11y\n\nEvery interactive element needs a visible focus ring and a label.\n';

async function writeSkill(name: string, front: string, body: string): Promise<string> {
  const dir = join(base, 'scope', name);
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'SKILL.md');
  await writeFile(file, `---\n${front}\n---\n\n${body}\n`, 'utf-8');
  return file;
}

const brutalPath = await writeSkill(
  'brutalist-web',
  'name: brutalist-web\ndescription: "Use when the design must look raw and blocky."\ncategory: design-style\nscope: design\ngroup: Style',
  BRUTAL_BODY,
);
const a11yPath = await writeSkill(
  'a11y-basics',
  'name: a11y-basics\ndescription: "Use when the artifact must be accessible."\ncategory: design-rules\nscope: DESIGN\ngroup: a11y',
  A11Y_BODY,
);
const plainPath = await writeSkill(
  'plain-helper',
  'name: plain-helper\ndescription: "Use when something unrelated is needed."\ncategory: general',
  '# Plain\n\nno scope here\n',
);
// Declared design but with an empty body: selectable in the list, unusable.
const emptyPath = await writeSkill(
  'empty-design',
  'name: empty-design\ndescription: "Use when nothing is inside."\ncategory: design-style\nscope: design\ngroup: Style',
  '',
);
await rm(emptyPath);

const skill = (id: string, name: string, description: string, path: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  description,
  category: 'design-style',
  path,
  linked_files: [],
  ...extra,
});

const fakeScan = async () => [
  skill('design-style/brutalist-web', 'brutalist-web', 'Use when the design must look raw and blocky.', brutalPath, {
    scope: 'design',
    group: 'Style',
  }),
  skill('design-rules/a11y-basics', 'a11y-basics', 'Use when the artifact must be accessible.', a11yPath, {
    scope: 'DESIGN',
    group: 'a11y',
  }),
  skill('general/plain-helper', 'plain-helper', 'Use when something unrelated is needed.', plainPath),
  skill('design-style/empty-design', 'empty-design', 'Use when nothing is inside.', emptyPath, {
    scope: 'design',
    group: 'Style',
  }),
];

// ── 1. The catalog: scoped rows only, grouped, honest about broken ones ──────
const listed = await listDesignSkills(fakeScan);
check('catalog lists only scope: design rows', !listed.skills.some((s) => s.id.includes('plain-helper')));
check('catalog counts the excluded scopeless skills', listed.unscoped === 1);
check('scope match is case-insensitive (DESIGN counts)', listed.skills.some((s) => s.id.endsWith('a11y-basics')));
check('rows are grouped in taxonomy order', (() => {
  const order = listed.skills.map((s) => DESIGN_SKILL_GROUPS.indexOf(s.group));
  return order.every((v, i) => i === 0 || order[i - 1] <= v);
})());
check('unknown frontmatter group lands on Other', listed.skills.some((s) => s.id.endsWith('brutalist-web')));
check('a11y alias maps to the Accessibility group', listed.skills.find((s) => s.id.endsWith('a11y-basics'))?.group === 'Accessibility');
check('a deleted SKILL.md lists as invalid, not silently healthy', (() => {
  const row = listed.skills.find((s) => s.id.endsWith('empty-design'));
  return row && row.hasBody === false && typeof row.problem === 'string' && row.problem.length > 0;
})());
check('catalog reports the invalid count', listed.invalid === 1);
check('catalog echoes the scope it filtered on', listed.scope === 'design');

// ── 2. Group normalization ───────────────────────────────────────────────────
check('normalizeSkillGroup maps an exact heading', normalizeSkillGroup('Style') === 'Style');
check('normalizeSkillGroup maps a loose synonym', normalizeSkillGroup('color / colour') === 'Style');
check('normalizeSkillGroup maps brand', normalizeSkillGroup('brand-identity') === 'Brand');
check('normalizeSkillGroup maps copy', normalizeSkillGroup('micro-copy') === 'Content');
check('normalizeSkillGroup defaults to Other', normalizeSkillGroup('quantum') === 'Other');
check('normalizeSkillGroup defaults to Other on junk', normalizeSkillGroup(42) === 'Other');

// ── 3. Request-shape coercion: honest errors, no silent drop ─────────────────
check('undefined selection is empty', parseSkillSelection(undefined).length === 0);
check('null selection is empty', parseSkillSelection(null).length === 0);
check('duplicates collapse', JSON.stringify(parseSkillSelection(['a', 'a'])) === JSON.stringify(['a']));
await expectsDesign('non-array selection is refused', () => parseSkillSelection('brutalist'), 'bad_skills', 400);
await expectsDesign('non-string entry is refused', () => parseSkillSelection([7]), 'bad_skills', 400);
await expectsDesign('empty entry is refused', () => parseSkillSelection(['  ']), 'bad_skills', 400);
await expectsDesign('over-long id is refused', () => parseSkillSelection(['x'.repeat(201)]), 'bad_skills', 400);
await expectsDesign(
  'over-cap selection is refused',
  () => parseSkillSelection(Array.from({ length: DESIGN_SKILL_SELECT_CAP + 1 }, (_, i) => `s${i}`)),
  'too_many_skills',
  400,
);

// ── 4. Resolution carries the REAL SKILL.md body ─────────────────────────────
const resolved = await resolveDesignSkills(['design-style/brutalist-web', 'design-rules/a11y-basics'], fakeScan);
check('every selected skill resolves to a payload', resolved.length === 2);
check('the payload carries the SKILL.md CONTENT, not the name', resolved[0].content.includes('heavy 900-weight type'));
check('the payload carries the second skill body too', resolved[1].content.includes('visible focus ring'));
check('a short name resolves by name as well as id', ((await resolveDesignSkills(['brutalist-web'], fakeScan))[0]?.id ?? '') === 'design-style/brutalist-web');
check('an empty selection resolves to nothing', (await resolveDesignSkills([], fakeScan)).length === 0);
await expectsDesign('unknown id 404s', () => resolveDesignSkills(['nope'], fakeScan), 'skill_not_found', 404);
await expectsDesign('scopeless skill is refused with an honest code', () => resolveDesignSkills(['general/plain-helper'], fakeScan), 'skill_not_design', 400);
await expectsDesign('a scoped but deleted SKILL.md is refused, not silently skipped', () => resolveDesignSkills(['design-style/empty-design'], fakeScan), 'skill_unusable', 409);

// ── 5. The prompt block: bodies, not names; truncation is labelled ───────────
check('no skills = empty block', buildDesignSkillsPrompt([]) === '');
check('no skills = empty block (undefined)', buildDesignSkillsPrompt(undefined) === '');
const block = buildDesignSkillsPrompt(resolved);
check('block opens and closes the design_skills envelope', block.startsWith('<design_skills>') && block.includes('</design_skills>'));
check('block contains BOTH selected bodies', block.includes('heavy 900-weight type') && block.includes('visible focus ring'));
check('block names each skill', block.includes('brutalist-web') && block.includes('a11y-basics'));

const fat = [{ id: 'design-style/fat', name: 'fat', content: 'X'.repeat(40_000) }];
const fatBlock = buildDesignSkillsPrompt(fat);
check('an oversized skill is truncated', fatBlock.length < 20_000);
check('the truncation is stated, not hidden', fatBlock.includes('[truncated:'));
const many = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, name: `s${i}`, content: 'Y'.repeat(11_000) }));
check('the total skill budget is bounded', buildDesignSkillsPrompt(many).length <= 40_000);

// ── 6. The prompt integration: skills reach buildDesignPrompt ────────────────
const bare = buildDesignPrompt({ type: 'prototype', brief: 'a pricing page', system: 'stripe-linear' });
check('a request without skills carries NO design_skills block', !bare.includes('design_skills'));
const withSkills = buildDesignPrompt({
  type: 'prototype',
  brief: 'a pricing page',
  system: 'stripe-linear',
  skills: resolved,
});
check('the request prompt carries the selected skill bodies', withSkills.includes('heavy 900-weight type'));
check('the request prompt carries BOTH skills', withSkills.includes('visible focus ring'));
check('the skill block sits before the per-type directive', withSkills.indexOf('design_skills') < withSkills.indexOf('Product screen'));
check('the skill block sits after the token table', withSkills.indexOf('accent #C96442') < withSkills.indexOf('design_skills'));

await rm(base, { recursive: true, force: true });
console.log('\nALL ' + passed + ' SKILL-CATALOG PROBES PASSED');