/**
 * Onboarding wizard pure helpers (REQ-066, Docs/36 §14).
 * No React, no fetch — every function is covered by
 * `onboarding.test.ts`
 * (`bun src/components/auth/onboarding.test.ts`).
 */

/** Wizard screens in order: welcome → choice → account|open-done. */
export type OnboardingStep = 'welcome' | 'choice' | 'account' | 'open-done';

/** The owner's answer to "do you want login on this instance?". */
export type AuthChoice = 'auth' | 'open';

export const defaultAuthChoice: AuthChoice = 'auth';

/** 0-based position for the progress dots (final screens share step 3). */
export function stepIndex(step: OnboardingStep): number {
  if (step === 'welcome') return 0;
  if (step === 'choice') return 1;
  return 2;
}

/**
 * Forward transition. `null` is never returned — the terminal screens
 * (`account`, `open-done`) finish through their own async submit
 * buttons (register / record-choice), not through Next.
 */
export function nextStep(step: OnboardingStep, choice: AuthChoice): OnboardingStep {
  if (step === 'welcome') return 'choice';
  if (step === 'choice') return choice === 'auth' ? 'account' : 'open-done';
  return step;
}

/** Back transition — the first screen stays put (no negative step). */
export function prevStep(step: OnboardingStep): OnboardingStep {
  if (step === 'account' || step === 'open-done') return 'choice';
  if (step === 'choice') return 'welcome';
  return 'welcome';
}
