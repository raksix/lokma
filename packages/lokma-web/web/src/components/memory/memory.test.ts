/**
 * Memory helpers probe — run with:
 *   `bun src/components/memory/memory.test.ts` from `packages/lokma-web/web`.
 * Exits non-zero on the first failure (prior-wave style).
 */
import {
  charsLeft,
  entryChars,
  errorHint,
  filterEntries,
  targetHint,
  targetLabel,
  usageRatio,
  usageTone,
  validateAddForm,
  validateReplaceForm,
  MEMORY_TARGETS,
} from './memory';

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  passed++;
}

/* 1 — targets. */
check('two targets', MEMORY_TARGETS.length === 2);
check('memory label', targetLabel('memory') === 'MEMORY.md');
check('user label', targetLabel('user') === 'USER.md');
check('memory hint non-empty', targetHint('memory').length > 0);
check('user hint non-empty', targetHint('user').length > 0);
check('hints differ', targetHint('memory') !== targetHint('user'));

/* 2 — usage ratio clamps garbage. */
check('half', usageRatio(100, 200) === 0.5);
check('zero limit', usageRatio(10, 0) === 0);
check('negative limit', usageRatio(10, -5) === 0);
check('clamps over', usageRatio(300, 200) === 1);
check('clamps negative', usageRatio(-5, 200) === 0);
check('NaN safe', usageRatio(NaN, 200) === 0);

/* 3 — tone bands. */
check('calm', usageTone(100, 1000) === 'default');
check('warn at 70', usageTone(700, 1000) === 'warning');
check('warn at 89', usageTone(899, 1000) === 'warning');
check('destructive at 90', usageTone(900, 1000) === 'destructive');
check('destructive full', usageTone(20000, 20000) === 'destructive');

/* 4 — filtering. */
const entries = ['User prefers Turkish chat', 'Theme is terracotta', 'Deploy via pm2'];
check('empty query returns all', filterEntries(entries, '').length === 3);
check('blank query returns all', filterEntries(entries, '   ').length === 3);
check('case-insensitive', filterEntries(entries, 'TURKISH').length === 1);
check('partial', filterEntries(entries, 'e').length === 3);
check('no match', filterEntries(entries, 'zzz').length === 0);

/* 5 — entry chars. */
check('chars', entryChars('abc') === 3);
check('empty chars', entryChars('') === 0);

/* 6 — add validation. */
check('add ok', validateAddForm({ content: 'a fact' }) === null);
check('add blank rejected', validateAddForm({ content: '   ' }) !== null);
check('add empty rejected', validateAddForm({ content: '' }) !== null);

/* 7 — replace validation. */
check('replace ok', validateReplaceForm({ oldText: 'a', content: 'b' }) === null);
check('replace needs old', validateReplaceForm({ oldText: '  ', content: 'b' }) !== null);
check('replace needs content', validateReplaceForm({ oldText: 'a', content: '' }) !== null);

/* 8 — error hints cover every server MemoryError code. */
for (const code of ['memory_full', 'ambiguous_match', 'no_match', 'empty_content', 'empty_old_text', 'bad_target']) {
  check(`hint for ${code}`, errorHint(code).length > 0);
}
check('unknown code no hint', errorHint('nope') === '');

/* 9 — chars left. */
check('left', charsLeft(100, 1000) === 900);
check('left never negative', charsLeft(5000, 1000) === 0);

console.log(`memory helpers: ${passed} checks passed`);
