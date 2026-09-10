import * as React from 'react';
import { CircleUserRound, Eye, KeyRound, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, api, type AuthUser } from '@/lib/api';
import {
  clearToken,
  emptyLoginForm,
  emptyRegisterForm,
  formatLastActive,
  initials,
  roleTone,
  statusTone,
  storeToken,
  validateLoginForm,
  validateRegisterForm,
} from './auth';

function errMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
}

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('lokma-toast', { detail: message }));
}

const labelClass = 'mb-1 block text-[11px] font-medium text-zinc-500';

/**
 * AccountPane — REQ-101. The signed-in user's OWN account only
 * (Settings → Account): profile card (name, email, role, status, last
 * activity) + sign out. Signed-out viewers get the sign-in / invite /
 * first-admin-seed forms — the only place auth forms live.
 *
 * Instance administration (users, roles, projects, policy) lives in
 * `AdminPane` (Settings → Admin, admin/superadmin only).
 */
export function AccountPane() {
  const [me, setMe] = React.useState<AuthUser | null>(null);
  const [bootstrapped, setBootstrapped] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [mode, setMode] = React.useState<'login' | 'register' | 'invite'>('login');

  const [loginForm, setLoginForm] = React.useState({ ...emptyLoginForm });
  const [registerForm, setRegisterForm] = React.useState({ ...emptyRegisterForm });
  const [inviteToken, setInviteToken] = React.useState('');
  const [inviteName, setInviteName] = React.useState('');
  const [invitePassword, setInvitePassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [authBusy, setAuthBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const settingsRes = await api.getAuthSettings();
      setBootstrapped(settingsRes.bootstrapped);
      if (!settingsRes.bootstrapped) {
        setMode('register');
        setMe(null);
        return;
      }
      try {
        const meRes = await api.authMeQuiet();
        setMe(meRes.user);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setMe(null);
        } else {
          throw e;
        }
      }
    } catch (e) {
      setAuthError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const afterSession = (user: AuthUser, token: string) => {
    storeToken(token);
    setMe(user);
    setAuthError(null);
  };

  const doLogin = async () => {
    const problem = validateLoginForm(loginForm);
    if (problem) {
      setAuthError(problem);
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const res = await api.login({ email: loginForm.email.trim(), password: loginForm.password });
      afterSession(res.user, res.token);
      setLoginForm({ ...emptyLoginForm });
      toast(`Signed in as ${res.user.name}`);
    } catch (e) {
      setAuthError(errMessage(e));
    } finally {
      setAuthBusy(false);
    }
  };

  const doRegister = async () => {
    const problem = validateRegisterForm(registerForm);
    if (problem) {
      setAuthError(problem);
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const res = await api.registerFirstAdmin({
        email: registerForm.email.trim(),
        name: registerForm.name.trim(),
        password: registerForm.password,
      });
      afterSession(res.user, res.token);
      setRegisterForm({ ...emptyRegisterForm });
      toast(`Instance seeded — ${res.user.name} is admin`);
    } catch (e) {
      setAuthError(errMessage(e));
    } finally {
      setAuthBusy(false);
    }
  };

  const doAcceptInvite = async () => {
    if (!inviteToken.trim()) {
      setAuthError('Paste the invite token from your invite link');
      return;
    }
    if (!inviteName.trim() || inviteName.trim().length > 40) {
      setAuthError('Name must be 1-40 chars');
      return;
    }
    if (invitePassword.length < 8 || invitePassword.length > 200) {
      setAuthError('Password must be 8-200 chars');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const res = await api.acceptInvite({ token: inviteToken.trim(), name: inviteName.trim(), password: invitePassword });
      afterSession(res.user, res.token);
      setInviteToken('');
      setInviteName('');
      setInvitePassword('');
      toast(`Welcome, ${res.user.name}`);
    } catch (e) {
      setAuthError(errMessage(e));
    } finally {
      setAuthBusy(false);
    }
  };

  const doLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Cookie may already be gone — local state still resets.
    }
    clearToken();
    setMe(null);
    setMode('login');
  };

  if (loading) {
    return (
      <div className="h-full grid place-items-center text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          <RefreshCw className="h-3 w-3 animate-spin" /> Loading account…
        </span>
      </div>
    );
  }

  // ─── Signed out — sign-in / invite / first-admin seed ──────────────
  if (!me) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
        <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
          <CircleUserRound className="w-3 h-3 text-zinc-500" />
          <span className="text-xs font-semibold">Account</span>
          <span className="text-[11px] text-zinc-400">RBAC · scrypt · can()</span>
        </div>
        <div className="flex-1 grid place-items-center p-6 bg-[#FAF9F5]/50 dark:bg-[#0F0F11]/50 overflow-auto">
          <div className="w-full min-w-0 rounded-xl bg-white dark:bg-[#1E1E21] border border-line p-5 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-[#262624] text-white grid place-items-center text-xs font-bold mx-auto font-serif">
              L
            </div>
            <h3 className="text-center text-sm font-semibold mt-2 font-serif">
              {!bootstrapped ? 'Seed the first admin' : mode === 'invite' ? 'Accept your invite' : 'Sign in to Lokma'}
            </h3>
            <p className="text-center text-xs text-zinc-500 mt-1">
              {!bootstrapped
                ? 'No users yet — this account becomes the instance admin'
                : 'email + password → httpOnly cookie + Bearer token'}
            </p>
            {bootstrapped && (
              <div className="mt-3 grid grid-cols-2 gap-1 rounded-md bg-muted/40 border border-line p-1">
                <Button
                  variant={mode === 'login' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-6 text-[11px]"
                  onClick={() => {
                    setMode('login');
                    setAuthError(null);
                  }}
                >
                  Sign in
                </Button>
                <Button
                  variant={mode === 'invite' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-6 text-[11px]"
                  onClick={() => {
                    setMode('invite');
                    setAuthError(null);
                  }}
                >
                  I have an invite
                </Button>
              </div>
            )}
            <div className="mt-4 space-y-2">
              {mode === 'invite' ? (
                <>
                  <div>
                    <label className={labelClass} htmlFor="auth-invite-token">Invite token</label>
                    <Input
                      id="auth-invite-token"
                      placeholder="paste the token from your invite link"
                      value={inviteToken}
                      onChange={(e) => setInviteToken(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="auth-invite-name">Display name</label>
                    <Input
                      id="auth-invite-name"
                      placeholder="e.g. Aylin"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="auth-invite-password">Password (8+ chars)</label>
                    <div className="relative">
                      <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                      <Input
                        id="auth-invite-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Choose a password"
                        value={invitePassword}
                        onChange={(e) => setInvitePassword(e.target.value)}
                        className="pl-8 pr-8 h-8 text-xs"
                      />
                      <button
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded hover:bg-muted"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <Eye className="w-3 h-3 text-zinc-400" />
                      </button>
                    </div>
                  </div>
                  <Button className="w-full h-7 text-xs" disabled={authBusy} onClick={doAcceptInvite}>
                    {authBusy ? 'Accepting…' : 'Accept invite — activate account'}
                  </Button>
                </>
              ) : mode === 'register' ? (
                <>
                  <div>
                    <label className={labelClass} htmlFor="auth-reg-email">Email</label>
                    <Input
                      id="auth-reg-email"
                      placeholder="admin@example.com"
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="auth-reg-name">Display name</label>
                    <Input
                      id="auth-reg-name"
                      placeholder="e.g. Furkan"
                      value={registerForm.name}
                      onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="auth-reg-password">Password (8+ chars)</label>
                    <div className="relative">
                      <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                      <Input
                        id="auth-reg-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Choose an admin password"
                        value={registerForm.password}
                        onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                        className="pl-8 pr-8 h-8 text-xs"
                      />
                      <button
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded hover:bg-muted"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <Eye className="w-3 h-3 text-zinc-400" />
                      </button>
                    </div>
                  </div>
                  <Button className="w-full h-7 text-xs" disabled={authBusy} onClick={doRegister}>
                    {authBusy ? 'Seeding…' : 'Create instance admin'}
                  </Button>
                </>
              ) : (
                <>
                  <div>
                    <label className={labelClass} htmlFor="auth-login-email">Email</label>
                    <Input
                      id="auth-login-email"
                      placeholder="you@example.com"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="auth-login-password">Password</label>
                    <div className="relative">
                      <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                      <Input
                        id="auth-login-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Your password"
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void doLogin();
                        }}
                        className="pl-8 pr-8 h-8 text-xs"
                      />
                      <button
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded hover:bg-muted"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <Eye className="w-3 h-3 text-zinc-400" />
                      </button>
                    </div>
                  </div>
                  <Button className="w-full h-7 text-xs" disabled={authBusy} onClick={doLogin}>
                    {authBusy ? 'Signing in…' : 'Sign in — verify credentials'}
                  </Button>
                </>
              )}
              {authError && <p className="text-[11px] text-red-600 dark:text-red-400">{authError}</p>}
            </div>
            <div className="mt-3 text-[11px] text-zinc-400 text-center">
              Protected routes answer 401/403 with a code — never a stack
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Signed in — own profile only ──────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <CircleUserRound className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Account</span>
        <Button variant="ghost" size="sm" className="ml-auto h-5 text-[11px] gap-1" onClick={doLogout}>
          <LogOut className="w-3 h-3" /> Sign out
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <div className="rounded-xl border border-line bg-white dark:bg-[#1E1E21] p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#262624] text-sm font-semibold text-white">
              {initials(me.name, me.email)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{me.name}</div>
              <div className="truncate text-xs text-zinc-500">{me.email}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className={`rounded border px-1.5 py-0.5 text-[11px] ${roleTone(me.role)}`}>{me.role}</span>
            <span className={`rounded border px-1.5 py-0.5 text-[11px] ${statusTone(me.status)}`}>{me.status}</span>
            <span className="text-[11px] text-zinc-400">active {formatLastActive(me.lastActiveAt)}</span>
          </div>
          <p className="mt-3 border-t border-line/60 pt-2 text-[11px] leading-4 text-zinc-500">
            Instance administration (users, roles, projects, policy) lives in Settings → Admin.
          </p>
        </div>
      </div>
    </div>
  );
}
