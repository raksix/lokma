/**
 * shell.test.ts — probe for the pure shell-chrome helpers.
 * Run: `bun src/components/shell/shell.test.ts` (no DOM, no server).
 */
import { filterNoteHits, filterSessionHits } from './search-modal';

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

const sessions = [{ id: 'sess_alpha_1' }, { id: 'sess_beta_2' }, { id: 'work_review_3' }];

// filterSessionHits
check('empty query returns all (capped)', filterSessionHits(sessions, '').length === 3);
check(
  'substring match is case-insensitive',
  filterSessionHits(sessions, 'SESS').map((s) => s.id).join(',') === 'sess_alpha_1,sess_beta_2',
);
check('no match returns empty', filterSessionHits(sessions, 'zzz').length === 0);
check('trims whitespace', filterSessionHits(sessions, '  beta ').length === 1);

// filterNoteHits
const nodes: unknown[] = [
  { id: 'note-1', title: 'Roadmap priorities' },
  { id: 'note-2', label: 'Decision framework' },
  { path: 'vault/obsidian-note.md' },
  'not-an-object',
  { noId: true },
  null,
];
const allNotes = filterNoteHits(nodes, '');
check('coerces id/title/label/path, skips junk', allNotes.length === 3);
check('label falls back as title', allNotes[1]?.title === 'Decision framework');
check('path-only node uses path as id+title', allNotes[2]?.id === 'vault/obsidian-note.md');
check('query filters title+id', filterNoteHits(nodes, 'roadmap').length === 1);
check('query with no match is empty', filterNoteHits(nodes, 'zzz').length === 0);
check('empty nodes stay empty', filterNoteHits([], 'x').length === 0);

console.log(`shell.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
