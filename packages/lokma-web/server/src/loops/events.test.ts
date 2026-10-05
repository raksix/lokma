/**
 * Loop change bus probe (REQ-202 kapsam 5) — run with:
 *   `HOME=$(mktemp -d) bun src/loops/events.test.ts`
 * from `packages/lokma-web/server`.
 *
 * The subject is the seam between the executor (which has no socket of its
 * own) and the WS fan-out. Two properties are load-bearing and neither is
 * visible in the JSX:
 *
 *  1. a THROWING listener cannot fail a turn — the executor announces from
 *     inside the turn's settle path, so an un-guarded dispatch here would turn
 *     a dead browser tab into a failed loop iteration;
 *  2. `'*'` and an empty list both mean "re-read everything", because a
 *     create/delete changes the CATALOG and no single id can name that.
 */
import { homedir, tmpdir } from 'node:os';
import { __resetLoopEvents, emitLoopChange, onLoopChange } from './events.js';

const home = homedir();
if (!home.startsWith(tmpdir())) {
  console.error('REFUSING: HOME=' + home + ' is not a temp dir — set HOME=$(mktemp -d)');
  process.exit(2);
}

let pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean): void {
  if (cond) {
    pass += 1;
    console.log('PASS: ' + name);
  } else {
    failures.push(name);
    console.error('FAIL: ' + name);
  }
}

// ── a listener receives the id list verbatim ────────────────────────────────
let received: readonly string[] | null = null;
const off = onLoopChange((ev) => {
  received = ev.loopIds;
});
emitLoopChange(['l_aaaaaaaa', 'l_bbbbbbbb']);
check('ids reach the listener', received !== null && received.length === 2);
check('ids arrive in order', received !== null && received[0] === 'l_aaaaaaaa' && received[1] === 'l_bbbbbbbb');

// ── an id-less announcement means "re-read the catalog" ────────────────────
received = ['stale'];
emitLoopChange();
check('no ids = full re-read', received !== null && received.length === 0);

// `'*'` is the "something changed and I do not know what" call. Passing it
// through would make the client fetch a loop literally named `*`, which 404s,
// so the frame degrades to a full re-read instead.
//
// The DEGRADING case is `'*'` BESIDE real ids, and it must be asserted
// separately from the lone sentinel: a lone `['*']` filters down to `[]` whether
// or not the wildcard is understood at all, so asserting only that proves
// nothing about the rule. Here the ids beside it are individually fetchable, so
// a reader that received them instead of the full-re-read signal would MISS a
// create/delete that rode along with the same announcement.
received = ['stale'];
emitLoopChange(['*', 'l_aaaaaaaa']);
check('a wildcard beside real ids still degrades to a full re-read', received !== null && received.length === 0);

// Empty strings are dropped the same way — an id that cannot be fetched must
// not reach the wire, and it must NOT cost the real ids beside it their
// meaning (a blank is noise, not a wildcard).
received = null;
emitLoopChange(['', 'l_cccccccc']);
check('blank ids are dropped, real ones kept', received !== null && received.length === 1 && received[0] === 'l_cccccccc');

// ── a throwing listener must not break the writer ───────────────────────────
onLoopChange(() => {
  throw new Error('dead socket');
});
let reached = false;
onLoopChange(() => {
  reached = true;
});
emitLoopChange(['l_dddddddd']);
check('a throwing listener does not stop the fan-out', reached);

// ── unsubscribe ─────────────────────────────────────────────────────────────
__resetLoopEvents();
received = null;
emitLoopChange(['l_eeeeeeee']);
check('no listeners means no delivery', received === null);
off();

console.log('\n' + pass + '/' + (pass + failures.length) + ' passed');
if (failures.length > 0) {
  console.log('failures: ' + failures.join(' | '));
  process.exit(1);
}