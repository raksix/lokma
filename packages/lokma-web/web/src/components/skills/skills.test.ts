/**
 * SkillsPane pure-helper probe — run with:
 *   `bun src/components/skills/skills.test.ts` from `packages/lokma-web/web`.
 * Exits non-zero on the first failure (16/16 style like prior waves).
 */
import {
  activityOf,
  buildAvailableSkills,
  EMPTY_USAGE,
  emptyPatchForm,
  filterSkills,
  formatUsage,
  isSkillInfo,
  normalizeSkill,
  normalizeSkills,
  sourceOf,
  validatePatchForm,
  type NormalizedSkill,
} from './skills';

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`ok: ${name}`);
}

const skill = (over: Partial<NormalizedSkill> = {}): NormalizedSkill => ({
  id: 'test/my-skill',
  name: 'my-skill',
  description: 'Use when testing the skills pane helpers.',
  category: 'test',
  path: '/repo/skills/test/my-skill/SKILL.md',
  linked_files: ['references/a.md'],
  source: 'bundled',
  ...over,
});

// ─── sourceOf ─────────────────────────────────────────────────────
check('repo path is bundled', sourceOf('/repo/skills/a/b/SKILL.md') === 'bundled');
check('home skills path is user', sourceOf('/home/u/.lokma/skills/a/b/SKILL.md') === 'user');
check('empty path is bundled', sourceOf('') === 'bundled');

// ─── normalizeSkill ───────────────────────────────────────────────
check('null skipped', normalizeSkill(null) === null);
check('missing id skipped', normalizeSkill({ name: 'x' }) === null);
check('empty id skipped', normalizeSkill({ id: '' }) === null);
const full = normalizeSkill({
  id: 'c/my-skill',
  name: 'my-skill',
  description: 'Use when testing.',
  category: 'c',
  path: '/r/skills/c/my-skill/SKILL.md',
  linked_files: ['references/a.md', 7, null],
});
check('full row kept', full !== null);
check('non-string linked files dropped', JSON.stringify(full?.linked_files) === JSON.stringify(['references/a.md']));
check('source derived bundled', full?.source === 'bundled');
const userRow = normalizeSkill({ id: 'u/s', path: '/h/.lokma/skills/u/s/SKILL.md' });
check('source derived user', userRow?.source === 'user');
check('name falls back to id', normalizeSkill({ id: 'only-id' })?.name === 'only-id');
check(
  'normalizeSkills drops nulls',
  normalizeSkills([{ id: 'a' }, null, { nope: 1 }, 'x']).length === 1,
);
check('normalizeSkills rejects non-array', normalizeSkills(null).length === 0);

// ─── filterSkills ─────────────────────────────────────────────────
const rows = [
  skill({ id: 'a/git-flow', name: 'git-flow', description: 'Use when doing git work.', category: 'dev' }),
  skill({ id: 'b/design', name: 'design', description: 'Use when drawing boxes.', category: 'art' }),
];
check('empty query keeps all', filterSkills(rows, '').length === 2);
check('name matches', filterSkills(rows, 'git').length === 1);
check('description matches', filterSkills(rows, 'drawing').length === 1);
check('category matches', filterSkills(rows, 'art').length === 1);
check('case-insensitive', filterSkills(rows, 'GIT').length === 1);
check('no match empty', filterSkills(rows, 'zzz').length === 0);

// ─── usage ────────────────────────────────────────────────────────
check('EMPTY_USAGE zeros', EMPTY_USAGE.use_count === 0 && EMPTY_USAGE.view_count === 0 && EMPTY_USAGE.patch_count === 0);
check('missing usage zero activity', activityOf(undefined) === 0);
check(
  'activity sums counters',
  activityOf({ use_count: 2, view_count: 3, patch_count: 1 }) === 6,
);
check(
  'formatUsage strings',
  formatUsage({ use_count: 2, view_count: 3, patch_count: 1 }) === 'used 2 · viewed 3 · patched 1',
);
check('formatUsage missing zeros', formatUsage(undefined) === 'used 0 · viewed 0 · patched 0');

// ─── buildAvailableSkills ─────────────────────────────────────────
const block = buildAvailableSkills(rows);
check('block opens with tag', block.startsWith('<available_skills>'));
check('block closes with tag', block.endsWith('</available_skills>'));
check('block carries ids', block.includes('a/git-flow') && block.includes('b/design'));
check('block carries descriptions', block.includes('Use when doing git work.'));
check('max caps rows', buildAvailableSkills(rows, 1).split('\n').length === 3);
check('empty list still valid block', buildAvailableSkills([]) === '<available_skills>\n</available_skills>');

// ─── validatePatchForm ────────────────────────────────────────────
check('empty old_string rejected', validatePatchForm({ ...emptyPatchForm }) !== null);
check(
  'identical strings rejected',
  validatePatchForm({ old_string: 'x', new_string: 'x' }) !== null,
);
check(
  'valid form passes',
  validatePatchForm({ old_string: 'a', new_string: 'b' }) === null,
);

// ─── isSkillInfo ──────────────────────────────────────────────────
check('real row passes guard', isSkillInfo({ id: 'a/b' }));
check('junk fails guard', !isSkillInfo({ nope: true }));

console.log(`\nAll ${passed} skills checks passed.`);
