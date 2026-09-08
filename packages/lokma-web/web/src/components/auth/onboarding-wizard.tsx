import * as React from 'react';
import { ArrowLeft, ArrowRight, Check, Globe, Shield, ShieldCheck, Sparkles, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';
import { emptyRegisterForm, storeToken, validateRegisterForm } from './auth';
import { defaultAuthChoice, nextStep, prevStep, stepIndex, type AuthChoice, type OnboardingStep } from './onboarding';

/**
 * OnboardingWizard — full-screen first-run setup (REQ-066, Docs/36 §14).
 * Rendered by `App` while the instance is unbootstrapped AND
 * `settings.onboardingDone` is false. Not a pane (unskippable, like
 * `LoginGate`): welcome → "do you want login?" → owner account (auth
 * path) or open-instance confirm (open path).
 *
 * Auth path: `registerFirstAdmin` bootstraps the instance, then the
 * fresh superadmin flips `requireLogin` (+ `onboardingDone`) via the
 * authed PATCH — `onDone` lands straight in the shell (token stored).
 * The finish is retry-safe: once the account exists (`accountCreated`)
 * a failed policy PATCH retries the PATCH only, never the register
 * (which would 403 as already-bootstrapped).
 *
 * Open path: `POST /api/auth/onboarding` persists
 * `{ requireLogin: false, onboardingDone: true }` server-side so the
 * wizard never returns; login can be enabled later from the Auth pane.
 */

const labelClass = 'mb-1 block text-[11px] font-medium text-zinc-500';
const inputClass =
  'h-8 rounded-md border border-line bg-white px-2.5 text-sm focus:outline-none dark:bg-[#1E1E21] w-full';

const WELCOME_POINTS = [
  { icon: Sparkles, text: 'Chat with coding agents that read, edit, and run your projects' },
  { icon: Users, text: 'Invite your team with roles — superadmin, admin, calisan, viewer' },
  { icon: Shield, text: 'Your keys stay on this box — nothing leaves the instance' },
];

export function OnboardingWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = React.useState<OnboardingStep>('welcome');
  const [choice, setChoice] = React.useState<AuthChoice>(defaultAuthChoice);
  const [registerForm, setRegisterForm] = React.useState({ ...emptyRegisterForm });
  const [accountCreated, setAccountCreated] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submitOnEnter = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void fn();
  };

  const finishAuth = async () => {
    if (!accountCreated) {
      const problem = validateRegisterForm(registerForm);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      if (!accountCreated) {
        const res = await api.registerFirstAdmin({
          email: registerForm.email.trim(),
          name: registerForm.name.trim(),
          password: registerForm.password,
        });
        storeToken(res.token);
        setAccountCreated(true);
        setRegisterForm({ ...emptyRegisterForm });
      }
      await api.patchAuthSettings({ requireLogin: true, onboardingDone: true });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Setup failed — try again');
    } finally {
      setBusy(false);
    }
  };

  const finishOpen = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.completeOnboarding({ requireLogin: false });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Setup failed — try again');
    } finally {
      setBusy(false);
    }
  };

  const dot = stepIndex(step);

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#FAF9F5] dark:bg-[#161618] p-4">
      <div className="w-[380px] max-w-full rounded-xl border border-line bg-white dark:bg-[#1E1E21] p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-7 h-7 rounded-lg bg-[#C96442] text-white grid place-items-center">
            <Shield className="w-4 h-4" />
          </span>
          <div>
            <div className="text-sm font-semibold">Lokma</div>
            <div className="text-[11px] text-zinc-400">First-run setup</div>
          </div>
          <div className="ml-auto flex gap-1" aria-label="Setup progress">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${i <= dot ? 'bg-[#C96442]' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
            ))}
          </div>
        </div>

        {step === 'welcome' && (
          <div className="mt-3">
            <div className="text-sm font-semibold">Welcome — let us set up your instance</div>
            <p className="mt-1 text-xs text-zinc-500 leading-5">
              Three quick steps: say hello, pick how this box is guarded, then start working.
            </p>
            <div className="mt-3 space-y-1.5">
              {WELCOME_POINTS.map((p) => (
                <div key={p.text} className="flex gap-2 items-start rounded-lg border border-line bg-muted/40 px-2.5 py-2">
                  <p.icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-terracotta" />
                  <span className="text-xs text-zinc-600 dark:text-zinc-300 leading-4">{p.text}</span>
                </div>
              ))}
            </div>
            <Button className="w-full mt-3 h-8 text-sm gap-1.5" onClick={() => setStep(nextStep(step, choice))}>
              Continue <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {step === 'choice' && (
          <div className="mt-3">
            <div className="text-sm font-semibold">Do you want login on this instance?</div>
            <p className="mt-1 text-xs text-zinc-500 leading-5">You can change this later from the Auth pane.</p>
            <div className="mt-2 space-y-1.5" role="radiogroup" aria-label="Login choice">
              <button
                type="button"
                role="radio"
                aria-checked={choice === 'auth'}
                onClick={() => setChoice('auth')}
                className={`w-full text-left flex gap-2.5 p-2.5 rounded-lg border cursor-pointer transition ${choice === 'auth' ? 'bg-[#FDF0E6] border-[#F2D5C2] dark:bg-[#2A1E15] dark:border-[#3A2A1A]' : 'bg-white dark:bg-[#1E1E21] border-line hover:border-zinc-300'}`}
              >
                <ShieldCheck className={`w-4 h-4 mt-0.5 shrink-0 ${choice === 'auth' ? 'text-terracotta' : 'text-zinc-400'}`} />
                <span className="flex-1 min-w-0">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    With login
                    <span className="text-[10px] font-medium px-1.5 py-px rounded-full bg-[#C96442] text-white">Recommended</span>
                  </span>
                  <span className="block text-xs text-zinc-500 leading-4">
                    You create an owner account; teammates join by invite with roles.
                  </span>
                </span>
                <span className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${choice === 'auth' ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={choice === 'open'}
                onClick={() => setChoice('open')}
                className={`w-full text-left flex gap-2.5 p-2.5 rounded-lg border cursor-pointer transition ${choice === 'open' ? 'bg-[#FDF0E6] border-[#F2D5C2] dark:bg-[#2A1E15] dark:border-[#3A2A1A]' : 'bg-white dark:bg-[#1E1E21] border-line hover:border-zinc-300'}`}
              >
                <Globe className={`w-4 h-4 mt-0.5 shrink-0 ${choice === 'open' ? 'text-terracotta' : 'text-zinc-400'}`} />
                <span className="flex-1 min-w-0">
                  <span className="text-xs font-semibold">Open instance</span>
                  <span className="block text-xs text-zinc-500 leading-4">
                    No login — anyone who can reach this box can use it. Best for local-only boxes.
                  </span>
                </span>
                <span className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${choice === 'open' ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
              </button>
            </div>
            <div className="mt-3 flex gap-1.5">
              <Button variant="ghost" className="h-8 text-sm gap-1" onClick={() => setStep(prevStep(step))}>
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </Button>
              <Button className="flex-1 h-8 text-sm gap-1.5" onClick={() => setStep(nextStep(step, choice))}>
                Continue <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {step === 'account' && (
          <div className="mt-3 space-y-2" onKeyDown={submitOnEnter(finishAuth)}>
            <div className="text-sm font-semibold">Create the owner account</div>
            <p className="text-xs text-zinc-500 leading-5">This account becomes superadmin — the instance owner.</p>
            <div>
              <label className={labelClass} htmlFor="ob-name">Name</label>
              <Input
                id="ob-name"
                placeholder="Your name"
                aria-label="Name"
                value={registerForm.name}
                onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                className={inputClass}
                disabled={accountCreated}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="ob-email">Email</label>
              <Input
                id="ob-email"
                placeholder="you@company.com"
                aria-label="Email"
                value={registerForm.email}
                onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                className={inputClass}
                disabled={accountCreated}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="ob-password">Password</label>
              <Input
                id="ob-password"
                type="password"
                placeholder="Min 8 characters"
                aria-label="Password"
                value={registerForm.password}
                onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                className={inputClass}
                disabled={accountCreated}
              />
            </div>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">{error}</div>
            )}
            <div className="flex gap-1.5">
              <Button variant="ghost" className="h-8 text-sm gap-1" disabled={busy} onClick={() => setStep(prevStep(step))}>
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </Button>
              <Button className="flex-1 h-8 text-sm gap-1.5" disabled={busy} onClick={() => void finishAuth()}>
                <UserPlus className="w-3.5 h-3.5" />
                {busy ? 'Please wait…' : accountCreated ? 'Retry finish' : 'Create account & finish'}
              </Button>
            </div>
          </div>
        )}

        {step === 'open-done' && (
          <div className="mt-3">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-500" /> Open instance — ready
            </div>
            <p className="mt-1 text-xs text-zinc-500 leading-5">
              No login wall: anyone who can reach this box uses it directly. Turn login on any time from the
              Auth pane (it walks you through the same owner-account step).
            </p>
            {error && (
              <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">{error}</div>
            )}
            <div className="mt-3 flex gap-1.5">
              <Button variant="ghost" className="h-8 text-sm gap-1" disabled={busy} onClick={() => setStep(prevStep(step))}>
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </Button>
              <Button className="flex-1 h-8 text-sm gap-1.5" disabled={busy} onClick={() => void finishOpen()}>
                {busy ? 'Please wait…' : 'Start using Lokma'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
