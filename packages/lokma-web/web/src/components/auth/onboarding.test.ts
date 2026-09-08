/**
 * Onboarding wizard pure-helper probe — run with:
 *   `bun src/components/auth/onboarding.test.ts` from `packages/lokma-web/web`.
 * Exits non-zero on the first failure (16/16 style like prior waves).
 */
import { defaultAuthChoice, nextStep, prevStep, stepIndex } from './onboarding';

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`ok ${passed} — ${name}`);
}

// ─── step order ────────────────────────────────────────────────────
check('welcome advances to choice', nextStep('welcome', 'auth') === 'choice');
check('welcome advances regardless of choice', nextStep('welcome', 'open') === 'choice');
check('auth choice opens the account screen', nextStep('choice', 'auth') === 'account');
check('open choice opens the open-done screen', nextStep('choice', 'open') === 'open-done');
check('account screen is terminal', nextStep('account', 'auth') === 'account');
check('open-done screen is terminal', nextStep('open-done', 'open') === 'open-done');

// ─── back navigation ───────────────────────────────────────────────
check('choice backs to welcome', prevStep('choice') === 'welcome');
check('account backs to choice', prevStep('account') === 'choice');
check('open-done backs to choice', prevStep('open-done') === 'choice');
check('welcome backs to itself', prevStep('welcome') === 'welcome');

// ─── progress + defaults ───────────────────────────────────────────
check('welcome is dot 0', stepIndex('welcome') === 0);
check('choice is dot 1', stepIndex('choice') === 1);
check('account is dot 2', stepIndex('account') === 2);
check('open-done is dot 2', stepIndex('open-done') === 2);
check('default choice is auth', defaultAuthChoice === 'auth');

console.log(`\nAll ${passed} onboarding checks passed.`);
