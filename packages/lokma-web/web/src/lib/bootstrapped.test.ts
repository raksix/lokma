/**
 * bootstrapped store probe (REQ-169) — run with:
 *   `bun src/lib/bootstrapped.test.ts` from `packages/lokma-web/web`.
 * Exits non-zero on the first failure (same shape as setup.test.ts).
 */
import {
  isInstanceBootstrapped,
  setInstanceBootstrapped,
  subscribeInstanceBootstrapped,
} from './bootstrapped';

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`ok: ${name}`);
}

// Unknown/loading state counts as NOT bootstrapped — the legacy behaviour
// keeps the Setup entry visible until the server actually says otherwise.
check('defaults to not bootstrapped', isInstanceBootstrapped() === false);

let fired = 0;
const unsubscribe = subscribeInstanceBootstrapped(() => {
  fired += 1;
});

setInstanceBootstrapped(false);
check('same-value write does not notify', fired === 0);

setInstanceBootstrapped(true);
check('change notifies once', fired === 1 && isInstanceBootstrapped() === true);

setInstanceBootstrapped(true);
check('repeat write does not notify again', fired === 1);

setInstanceBootstrapped(false);
check('flips back and notifies', fired === 2 && isInstanceBootstrapped() === false);

unsubscribe();
setInstanceBootstrapped(true);
check('unsubscribe stops notifications', fired === 2 && isInstanceBootstrapped() === true);

// Leave the module in its neutral state for any following suite in-process.
setInstanceBootstrapped(false);

console.log(`\nbootstrapped store: ${passed}/${passed} checks PASS`);
