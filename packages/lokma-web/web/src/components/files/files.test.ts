/**
 * files.test.ts — probe for the pure FileBrowser helpers.
 * Run: `bun src/components/files/files.test.ts` (no DOM, no server).
 */
import {
  appendMention,
  basename,
  filterLoaded,
  formatSize,
  gitLabel,
  joinRel,
  parentDir,
} from './files';
import type { FileEntry } from '@/lib/api';

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

const entry = (path: string, type: FileEntry['type'] = 'file'): FileEntry => ({
  name: basename(path),
  path,
  type,
  size: 10,
  mtimeMs: 0,
  git: null,
});

// basename / parentDir / joinRel
check('basename top-level', basename('README.md') === 'README.md');
check('basename nested', basename('src/app.ts') === 'app.ts');
check('parentDir top-level is dot', parentDir('README.md') === '.');
check('parentDir nested', parentDir('src/app.ts') === 'src');
check('parentDir deep', parentDir('a/b/c.ts') === 'a/b');
check('joinRel root', joinRel('.', 'a.ts') === 'a.ts');
check('joinRel nested', joinRel('src', 'a.ts') === 'src/a.ts');

// formatSize
check('bytes raw', formatSize(942) === '942 B');
check('kilobytes 1 decimal', formatSize(1874) === '1.8 KB');
check('megabytes 1 decimal', formatSize(2_100_000) === '2.0 MB');
check('zero bytes', formatSize(0) === '0 B');
check('garbage is em-dash', formatSize(Number.NaN) === '—');

// gitLabel
check('M label', gitLabel('M') === 'Modified');
check('A label', gitLabel('A') === 'Added');
check('D label', gitLabel('D') === 'Deleted');
check('R label', gitLabel('R') === 'Renamed');
check('? label', gitLabel('?') === 'Untracked');
check('clean is null', gitLabel(null) === null);

// filterLoaded
const rows = [entry('src/app.ts'), entry('src/extra.ts'), entry('README.md')];
check('empty query returns all', filterLoaded('', rows).length === 3);
check('substring match', filterLoaded('app', rows).length === 1);
check('case-insensitive', filterLoaded('README', rows).length === 1);
check('dir prefix matches children', filterLoaded('src/', rows).length === 2);
check('no match is empty', filterLoaded('zzz', rows).length === 0);

// appendMention
check('empty text becomes mention', appendMention('', 'src/app.ts') === '@src/app.ts ');
check('appends with spacing', appendMention('review', 'src/app.ts') === 'review @src/app.ts ');
check('trailing space collapses', appendMention('review  ', 'src/app.ts') === 'review @src/app.ts ');
check('never duplicates', appendMention('see @src/app.ts ', 'src/app.ts') === 'see @src/app.ts ');
check('empty path is noop', appendMention('hi', '') === 'hi');

console.log(`files: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
