/**
 * REQ-156 — duplicate-submit guard checks.
 * Run: `bun src/components/chat/submit-guard.test.ts` (no DOM, no server).
 */
import {
  SUBMIT_GUARD_MS,
  dedupePending,
  isDuplicateSubmit,
  recordSubmit,
} from './submit-guard';

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean): void {
  if (cond) {
    passed += 1;
    console.log(`PASS: ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL: ${label}`);
  }
}

const T = 1_000_000;

// The accidental repeat: same text, right after the first submit.
const first = recordSubmit('abi ss atsana', T);
check('no previous submit is never a duplicate', isDuplicateSubmit(null, 'abi ss atsana', T) === false);
check('same text inside the window is dropped', isDuplicateSubmit(first, 'abi ss atsana', T + 200) === true);
check('the window edge still counts', isDuplicateSubmit(first, 'abi ss atsana', T + SUBMIT_GUARD_MS - 1) === true);

// Deliberate re-asks must still work.
check('same text after the window goes through', isDuplicateSubmit(first, 'abi ss atsana', T + SUBMIT_GUARD_MS) === false);
check('same text much later goes through', isDuplicateSubmit(first, 'abi ss atsana', T + 60_000) === false);
check('different text goes through', isDuplicateSubmit(first, 'baska soru', T + 100) === false);
check('whitespace-only text is never sent', isDuplicateSubmit(first, '   ', T + 100) === false);
check('untracked text records as null', recordSubmit('   ', T) === null);

// Trimming: the composer may hand us the same prompt with stray whitespace.
const padded = recordSubmit('  merhaba  ', T);
check('submit records the trimmed text', padded !== null && padded.text === 'merhaba');
check('a padded repeat still matches', isDuplicateSubmit(padded, 'merhaba', T + 100) === true);

// Clock going backwards (system time change) must not eat a real send.
check('a negative delta is not a duplicate', isDuplicateSubmit(first, 'abi ss atsana', T - 5000) === false);

// Pending-row collapsing.
const rows = [
  { key: 1, text: 'aynı' },
  { key: 2, text: 'farklı' },
  { key: 3, text: 'aynı' },
];
const deduped = dedupePending(rows);
check('identical optimistic rows collapse to one', deduped.length === 2);
check('the first row of a repeated pair survives', deduped[0].key === 1);
check('order of the remaining rows is kept', deduped[1].key === 2);
check('distinct rows are untouched', dedupePending([{ text: 'a' }, { text: 'b' }]).length === 2);
check('an empty list stays empty', dedupePending([]).length === 0);

console.log(`submit-guard probe: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
