/**
 * git.test.ts — probe for the pure GitPane helpers.
 * Run: `bun src/components/git/git.test.ts` (no DOM, no server).
 */
import {
  GIT_MESSAGE_CAP,
  changeBadge,
  fileInWorktree,
  filterChanges,
  findLockForFile,
  pushLabel,
  shortHash,
  validateCommitMessage,
} from './git';
import type { GitFileChange, GitLockRow } from '@/lib/api';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${name}`);
  }
}

const change = (over: Partial<GitFileChange> = {}): GitFileChange => ({
  path: 'src/a.ts',
  staged: null,
  worktree: 'M',
  ...over,
});
const lock = (over: Partial<GitLockRow> = {}): GitLockRow => ({
  path: 'src/a.ts',
  owner: 'builder-1',
  leaseUntil: Date.now() + 60_000,
  ...over,
});

// changeBadge
check('staged wins over worktree', changeBadge(change({ staged: 'A', worktree: 'M' })) === 'A');
check('worktree when nothing staged', changeBadge(change({ staged: null, worktree: 'D' })) === 'D');
check('unknown when both null', changeBadge(change({ staged: null, worktree: null })) === '?');

// findLockForFile
check('exact rel-path match', findLockForFile('src/a.ts', [lock()])?.owner === 'builder-1');
check('no match is null', findLockForFile('src/b.ts', [lock()]) === null);
check('empty locks is null', findLockForFile('src/a.ts', []) === null);
check(
  'suffix fallback matches nested lock path',
  findLockForFile('a.ts', [lock({ path: 'repo/src/a.ts' })]) !== null,
);

// fileInWorktree
const trees = ['/repo/.lokma/worktrees/reviewer-2'];
check('file under worktree root', fileInWorktree('/repo', '.lokma/worktrees/reviewer-2/a.ts', trees));
check('main-tree file is not worktree', !fileInWorktree('/repo', 'src/a.ts', trees));
check('no worktrees is false', !fileInWorktree('/repo', 'src/a.ts', []));

// filterChanges
const files = [change({ path: 'src/a.ts' }), change({ path: 'src/b.ts' })];
check('all passes through', filterChanges(files, 'all', new Set(), new Set()).length === 2);
check('locked keeps only locked', filterChanges(files, 'locked', new Set(['src/a.ts']), new Set()).length === 1);
check(
  'worktree keeps only worktree',
  filterChanges(files, 'worktree', new Set(), new Set(['src/b.ts']))[0]?.path === 'src/b.ts',
);
check('locked with none is empty', filterChanges(files, 'locked', new Set(), new Set()).length === 0);

// pushLabel
check('up to date', pushLabel(0, 0, 'origin/main') === 'up to date');
check('ahead only', pushLabel(2, 0, 'origin/main') === 'ahead 2');
check('behind only', pushLabel(0, 1, 'origin/main') === 'behind 1');
check('diverged', pushLabel(1, 3, 'origin/main') === 'ahead 1 · behind 3');
check('no upstream', pushLabel(0, 0, null) === 'no upstream');

// validateCommitMessage
check('empty message rejected', validateCommitMessage('   ') !== null);
check('good message accepted', validateCommitMessage('feat(web): git pane') === null);
check('over-cap rejected', validateCommitMessage(`x${'y'.repeat(GIT_MESSAGE_CAP)}`) !== null);
check('cap is sane', GIT_MESSAGE_CAP >= 100);

// shortHash
check('long hash shortened', shortHash('11cc24cdeadbeef') === '11cc24c');
check('short hash untouched', shortHash('abc') === 'abc');

console.log(`git: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
