import * as React from 'react';
import { KeyRound, Shield, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';
import { emptyLoginForm, emptyRegisterForm, storeToken, validateLoginForm, validateRegisterForm } from './auth';

/**
 * LoginGate — full-screen login (REQ-062 Parça A, REQ-063). Rendered by
 * `App` when the instance is bootstrapped AND `requireLogin` is on AND
 * `/api/auth/me` 401s. Not a pane (unskippable): no shell, no tabs, no
 * session until the caller authenticates. Unbootstrapped instances show
 * the first-superadmin register form instead (same screen, same gate).
 */

const labelClass = 'mb-1 block text-[11px] font-medium text-zinc-500';
const inputClass =
  'h-8 rounded-md border border-line bg-white px-2.5 text-sm focus:outline-none dark:bg-[#1E1E21] w-full';

export function LoginGate({ mode, onDone }: { mode: 'login' | 'register'; onDone: () => void }) {
  const [loginForm, setLoginForm] = React.useState({ ...emptyLoginForm });
  const [registerForm, setRegisterForm] = React.useState({ ...emptyRegisterForm });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const doLogin = async () => {
    const problem = validateLoginForm(loginForm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.login({ email: loginForm.email.trim(), password: loginForm.password });
      storeToken(res.token);
      setLoginForm({ ...emptyLoginForm });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async () => {
    const problem = validateRegisterForm(registerForm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.registerFirstAdmin({
        email: registerForm.email.trim(),
        name: registerForm.name.trim(),
        password: registerForm.password,
      });
      storeToken(res.token);
      setRegisterForm({ ...emptyRegisterForm });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  const submitOnEnter = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void fn();
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#FAF9F5] dark:bg-[#161618]">
      <div className="w-[320px] rounded-xl border border-line bg-white dark:bg-[#1E1E21] p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-7 h-7 rounded-lg bg-[#C96442] text-white grid place-items-center">
            <Shield className="w-4 h-4" />
          </span>
          <div>
            <div className="text-sm font-semibold">Lokma</div>
            <div className="text-[11px] text-zinc-400">
              {mode === 'login' ? 'Sign in to continue' : 'Create the owner account'}
            </div>
          </div>
        </div>
        {mode === 'login' ? (
          <div className="mt-3 space-y-2" onKeyDown={submitOnEnter(doLogin)}>
            <div>
              <label className={labelClass} htmlFor="gate-email">Email</label>
              <Input
                id="gate-email"
                placeholder="you@company.com"
                aria-label="Email"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="gate-password">Password</label>
              <Input
                id="gate-password"
                type="password"
                placeholder="Your password"
                aria-label="Password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-2" onKeyDown={submitOnEnter(doRegister)}>
            <div>
              <label className={labelClass} htmlFor="gate-reg-name">Name</label>
              <Input
                id="gate-reg-name"
                placeholder="Your name"
                aria-label="Name"
                value={registerForm.name}
                onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="gate-reg-email">Email</label>
              <Input
                id="gate-reg-email"
                placeholder="you@company.com"
                aria-label="Email"
                value={registerForm.email}
                onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="gate-reg-password">Password</label>
              <Input
                id="gate-reg-password"
                type="password"
                placeholder="Min 8 characters"
                aria-label="Password"
                value={registerForm.password}
                onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                className={inputClass}
              />
            </div>
            <p className="text-[11px] text-zinc-400">The first account becomes superadmin (instance owner).</p>
          </div>
        )}
        {error && (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">{error}</div>
        )}
        <Button
          className="w-full mt-3 h-8 text-sm gap-1.5"
          disabled={busy}
          onClick={() => void (mode === 'login' ? doLogin() : doRegister())}
        >
          {mode === 'login' ? <KeyRound className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create owner account'}
        </Button>
      </div>
    </div>
  );
}
