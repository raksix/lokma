/**
 * shell.test.ts — probe for the pure shell-chrome helpers.
 * Run: `bun src/components/shell/shell.test.ts` (no DOM, no server).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

// REQ-175 source guard — the header must not carry the session id or the
// Checking/Active/Down pill any more (the footer bar owns gateway state and
// the session list owns ids). A stale re-add of either prop fails this gate.
const HERE = dirname(fileURLToPath(import.meta.url));
const headerSrc = readFileSync(join(HERE, '..', 'header.tsx'), 'utf8');
check(
  'header carries no sessionId/serverUp props (REQ-175)',
  !headerSrc.includes('sessionId') && !headerSrc.includes('serverUp'),
);

const shellSrc = readFileSync(join(HERE, '..', 'app-shell.tsx'), 'utf8');
const headerBlocks = shellSrc
  .split('<Header')
  .slice(1)
  .map((b) => b.slice(0, b.indexOf('/>')));
check(
  'no Header call site passes sessionId/serverUp (REQ-175)',
  headerBlocks.length >= 4 &&
    headerBlocks.every((b) => !b.includes('serverUp') && !b.includes('sessionId')),
);

console.log(`shell.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
