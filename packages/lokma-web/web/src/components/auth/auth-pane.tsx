import * as React from 'react';
import {
  Check,
  Copy,
  Crown,
  Eye,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, api, type AuthProject, type AuthRole, type AuthSettings, type AuthUser } from '@/lib/api';
import {
  canDo,
  canEditProject,
  clearToken,
  emptyInviteForm,
  emptyLoginForm,
  emptyProjectForm,
  emptyRegisterForm,
  filterProjects,
  filterUsers,
  formatLastActive,
  initials,
  joinMembers,
  memberCountLabel,
  roleTone,
  statusTone,
  storeToken,
  validateInviteForm,
  validateLoginForm,
  validateProjectForm,
  validateRegisterForm,
} from './auth';

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('lokma-toast', { detail: message }));
}

function errMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
}

const labelClass = 'mb-1 block text-[11px] font-medium text-zinc-500';
const inputClass =
  'h-7 rounded-md border border-line bg-white px-2 text-xs focus:outline-none dark:bg-[#1E1E21]';

const ROLES: { id: AuthRole; label: string; desc: string; can: string }[] = [
  { id: 'admin', label: 'Admin', desc: 'Full access — users, projects, providers, config', can: "can('*') → true" },
  { id: 'member', label: 'Member', desc: 'Create sessions, edit files, run agents in assigned projects', can: "scoped to membership" },
  { id: 'viewer', label: 'Viewer', desc: 'Read-only transcript + files in assigned projects', can: 'read-only defaults' },
];

/**
 * AuthPane — login + RBAC matrix + projects + members (W6-21, Docs/36).
 * Concept layout 1:1 (role cards, projects with visibility badges,
 * members with invite row, flow footer), but every pixel is live:
 * `POST /api/auth/login|register|accept-invite` (httpOnly cookie +
 * Bearer token stored for the CLI path), `GET /api/auth/me` (quiet
 * 401 probe — no login bounce), `GET/PATCH /api/auth/settings`
 * (admin write, viewer 403), `GET /api/users` + invite/edit/disable/
 * delete/reset (admin only), `GET/POST /api/projects` + visibility
 * toggle + member add/remove (`project:edit`).
 * NOT ported: the concept's mock PROJECTS/MEMBERS rows, pravatar
 * avatars (initial squares from real names instead), and the
 * toast-only can()/Invite/Manage buttons (every button hits an
 * endpoint now). The concept's `lk_...` token box became the real
 * email+password login per Docs/36 §6.2 (local auth).
 */
export function AuthPane() {
  const [me, setMe] = React.useState<AuthUser | null>(null);
  const [settings, setSettings] = React.useState<AuthSettings | null>(null);
  const [bootstrapped, setBootstrapped] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [mode, setMode] = React.useState<'login' | 'register' | 'invite'>('login');

  // Auth forms
  const [loginForm, setLoginForm] = React.useState({ ...emptyLoginForm });
  const [registerForm, setRegisterForm] = React.useState({ ...emptyRegisterForm });
  const [inviteToken, setInviteToken] = React.useState('');
  const [inviteName, setInviteName] = React.useState('');
  const [invitePassword, setInvitePassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [authBusy, setAuthBusy] = React.useState(false);

  // Data
  const [users, setUsers] = React.useState<AuthUser[]>([]);
  const [projects, setProjects] = React.useState<AuthProject[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [userQuery, setUserQuery] = React.useState('');
  const [projectQuery, setProjectQuery] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // Invite + project forms
  const [inviteForm, setInviteForm] = React.useState({ ...emptyInviteForm });
  const [inviteBusy, setInviteBusy] = React.useState(false);
  const [lastInviteLink, setLastInviteLink] = React.useState<string | null>(null);
  const [projectForm, setProjectForm] = React.useState({ ...emptyProjectForm });
  const [projectBusy, setProjectBusy] = React.useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = React.useState<string | null>(null);
  const [confirmDeleteProject, setConfirmDeleteProject] = React.useState<string | null>(null);
  const [tempPassword, setTempPassword] = React.useState<{ email: string; password: string } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settingsRes = await api.getAuthSettings();
      setSettings(settingsRes.settings);
      setBootstrapped(settingsRes.bootstrapped);
      if (!settingsRes.bootstrapped) {
        setMode('register');
        setMe(null);
        setUsers([]);
        setProjects([]);
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
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const loadTables = React.useCallback(async (viewer: AuthUser) => {
    try {
      const projRes = await api.listProjects();
      setProjects(projRes.projects);
      setSelectedId((prev) => {
        if (prev && projRes.projects.some((p) => p.id === prev)) return prev;
        return projRes.projects[0]?.id ?? null;
      });
      if (viewer.role === 'admin') {
        const usersRes = await api.listUsers();
        setUsers(usersRes.users);
      }
    } catch (e) {
      setError(errMessage(e));
    }
  }, []);

  React.useEffect(() => {
    if (me) void loadTables(me);
  }, [me, loadTables]);

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
    setUsers([]);
    setProjects([]);
    setSelectedId(null);
    setMode('login');
  };

  const doInvite = async () => {
    const problem = validateInviteForm(inviteForm);
    if (problem) {
      toast(problem);
      return;
    }
    setInviteBusy(true);
    try {
      const res = await api.inviteUser({
        email: inviteForm.email.trim(),
        role: inviteForm.role,
        projectIds: selectedId && inviteForm.projectIds.includes(selectedId) ? [selectedId] : [],
      });
      setLastInviteLink(res.inviteLink);
      setInviteForm({ ...emptyInviteForm });
      const usersRes = await api.listUsers();
      setUsers(usersRes.users);
      toast(`Invited ${res.user.email}`);
    } catch (e) {
      toast(errMessage(e));
    } finally {
      setInviteBusy(false);
    }
  };

  const doCreateProject = async () => {
    const problem = validateProjectForm(projectForm);
    if (problem) {
      toast(problem);
      return;
    }
    setProjectBusy(true);
    try {
      const res = await api.createProject({
        name: projectForm.name.trim(),
        ...(projectForm.cwd.trim() ? { cwd: projectForm.cwd.trim() } : {}),
        visibility: projectForm.visibility,
      });
      setProjectForm({ ...emptyProjectForm });
      if (me) await loadTables(me);
      setSelectedId(res.project.id);
      toast(`Project ${res.project.name} created`);
    } catch (e) {
      toast(errMessage(e));
    } finally {
      setProjectBusy(false);
    }
  };

  const flipVisibility = async (project: AuthProject) => {
    const next = project.visibility === 'private' ? 'public' : 'private';
    try {
      await api.patchProject(project.id, { visibility: next });
      if (me) await loadTables(me);
      toast(`${project.name} is now ${next}`);
    } catch (e) {
      toast(errMessage(e));
    }
  };

  const selected = projects.find((p) => p.id === selectedId) ?? null;
  const [detailMembers, setDetailMembers] = React.useState<{ projectId: string; members: ReturnType<typeof joinMembers> } | null>(null);

  React.useEffect(() => {
    if (!selected || !me) {
      setDetailMembers(null);
      return;
    }
    let cancelled = false;
    api
      .listMembers(selected.id)
      .then((res) => {
        if (!cancelled) setDetailMembers({ projectId: selected.id, members: joinMembers(res.members, users) });
      })
      .catch(() => {
        if (!cancelled) setDetailMembers(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, me, users, projects]);

  const patchUserRole = async (target: AuthUser, role: AuthUser['role']) => {
    try {
      await api.patchUser(target.id, { role });
      const usersRes = await api.listUsers();
      setUsers(usersRes.users);
      toast(`${target.email} → ${role}`);
    } catch (e) {
      toast(errMessage(e));
    }
  };

  const patchUserStatus = async (target: AuthUser, status: AuthUser['status']) => {
    try {
      await api.patchUser(target.id, { status });
      const usersRes = await api.listUsers();
      setUsers(usersRes.users);
      toast(`${target.email} → ${status}`);
    } catch (e) {
      toast(errMessage(e));
    }
  };

  const deleteUserRow = async (target: AuthUser) => {
    if (confirmDeleteUser !== target.id) {
      setConfirmDeleteUser(target.id);
      return;
    }
    setConfirmDeleteUser(null);
    try {
      await api.deleteUser(target.id);
      const usersRes = await api.listUsers();
      setUsers(usersRes.users);
      toast(`Deleted ${target.email}`);
    } catch (e) {
      toast(errMessage(e));
    }
  };

  const resetRowPassword = async (target: AuthUser) => {
    try {
      const res = await api.resetUserPassword(target.id);
      setTempPassword({ email: res.user.email, password: res.tempPassword });
      const usersRes = await api.listUsers();
      setUsers(usersRes.users);
    } catch (e) {
      toast(errMessage(e));
    }
  };

  const deleteProjectRow = async (project: AuthProject) => {
    if (confirmDeleteProject !== project.id) {
      setConfirmDeleteProject(project.id);
      return;
    }
    setConfirmDeleteProject(null);
    try {
      await api.deleteProject(project.id);
      if (me) await loadTables(me);
      toast(`Deleted ${project.name} (index only — files kept)`);
    } catch (e) {
      toast(errMessage(e));
    }
  };

  const setMemberRole = async (projectId: string, userId: string, role: 'member' | 'viewer') => {
    try {
      await api.addMember(projectId, { userId, role });
      if (me) await loadTables(me);
    } catch (e) {
      toast(errMessage(e));
    }
  };

  const removeMemberRow = async (projectId: string, userId: string) => {
    try {
      await api.removeMember(projectId, userId);
      if (me) await loadTables(me);
    } catch (e) {
      toast(errMessage(e));
    }
  };

  const savePolicy = async (patch: Partial<AuthSettings>) => {
    try {
      const res = await api.patchAuthSettings(patch);
      setSettings(res.settings);
      toast('Policy saved');
    } catch (e) {
      toast(errMessage(e));
    }
  };

  if (loading) {
    return (
      <div className="h-full grid place-items-center text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          <RefreshCw className="h-3 w-3 animate-spin" /> Loading auth state…
        </span>
      </div>
    );
  }

  // ─── Logged out ──────────────────────────────────────────────────────
  if (!me) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
        <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
          <Lock className="w-3 h-3 text-zinc-500" />
          <span className="text-xs font-semibold">Auth</span>
          <span className="text-[11px] text-zinc-400">RBAC · scrypt · can()</span>
        </div>
        <div className="flex-1 grid place-items-center p-6 bg-[#FAF9F5]/50 dark:bg-[#0F0F11]/50 overflow-auto">
          <div className="w-full max-w-[360px] rounded-xl bg-white dark:bg-[#1E1E21] border border-line p-5 shadow-sm">
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

  // ─── Logged in ───────────────────────────────────────────────────────
  const isAdmin = me.role === 'admin';
  const shownUsers = filterUsers(users, userQuery);
  const shownProjects = filterProjects(projects, projectQuery);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Shield className="w-3 h-3 text-emerald-600" />
        <span className="text-xs font-semibold">Auth</span>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] flex items-center gap-1">
          <Check className="w-3 h-3" /> {me.name} · {me.role}
        </span>
        <span className="hidden sm:inline ml-1 text-[11px] text-zinc-400">admin/member/viewer · project-scoped</span>
        <Button variant="ghost" size="sm" className="ml-auto h-5 text-[11px] gap-1" onClick={doLogout}>
          <LogOut className="w-3 h-3" /> Sign out
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-2">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700 flex items-center gap-2">
            <span className="flex-1">{error}</span>
            <Button variant="ghost" size="sm" className="h-5 text-[11px]" onClick={() => loadTables(me)}>
              <RefreshCw className="w-3 h-3" /> Retry
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r.id} className={`rounded-lg border p-2.5 ${roleTone(r.id)}`}>
              <div className="text-xs font-semibold flex items-center gap-1">
                {r.id === 'admin' ? <Crown className="w-3 h-3" /> : r.id === 'member' ? <Users className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {r.label}
                {me.role === r.id && (
                  <span className="ml-auto text-[10px] font-normal opacity-70">you</span>
                )}
              </div>
              <div className="text-[11px] opacity-70 mt-1 leading-4">{r.desc}</div>
              <div className="text-[11px] font-mono mt-1 opacity-60">{r.can}</div>
            </div>
          ))}
        </div>

        {isAdmin && settings && (
          <div className="rounded-lg border border-line overflow-hidden">
            <div className="h-7 flex items-center px-3 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line text-xs font-medium">
              Instance policy
              <span className="ml-auto text-[11px] font-normal text-zinc-400">admin write · viewer 403</span>
            </div>
            <div className="p-2 flex flex-wrap items-center gap-2 text-xs">
              <label className="text-[11px] text-zinc-500" htmlFor="auth-policy-creation">Who can create projects</label>
              <select
                id="auth-policy-creation"
                value={settings.projectCreation}
                onChange={(e) => savePolicy({ projectCreation: e.target.value as AuthSettings['projectCreation'] })}
                className="h-7 rounded-md border border-line bg-white dark:bg-[#1E1E21] text-xs px-2"
              >
                <option value="admin-only">admin-only</option>
                <option value="members">members</option>
                <option value="open">open</option>
              </select>
              <label className="text-[11px] text-zinc-500" htmlFor="auth-policy-visibility">Default visibility</label>
              <select
                id="auth-policy-visibility"
                value={settings.projectVisibilityDefault}
                onChange={(e) => savePolicy({ projectVisibilityDefault: e.target.value as AuthSettings['projectVisibilityDefault'] })}
                className="h-7 rounded-md border border-line bg-white dark:bg-[#1E1E21] text-xs px-2"
              >
                <option value="private">private</option>
                <option value="public">public</option>
              </select>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-line overflow-hidden">
          <div className="h-7 flex items-center px-3 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line text-xs font-medium gap-2">
            Projects — visibility & members
            <span className="ml-auto text-[11px] font-normal text-zinc-400 hidden sm:inline">
              private default · public → read-only link
            </span>
          </div>
          <div className="p-2 border-b border-line/50 flex gap-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
              <Input
                placeholder="Search projects…"
                aria-label="Search projects"
                value={projectQuery}
                onChange={(e) => setProjectQuery(e.target.value)}
                className="pl-7 h-7 text-xs"
              />
            </div>
            {canDo(me, 'createProject', settings) && (
              <div className="flex gap-1 flex-1">
                <Input
                  placeholder="New project name"
                  aria-label="New project name"
                  value={projectForm.name}
                  onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                  className="h-7 text-xs flex-1"
                />
                <select
                  value={projectForm.visibility}
                  onChange={(e) => setProjectForm({ ...projectForm, visibility: e.target.value as 'private' | 'public' })}
                  className="h-7 rounded-md border border-line bg-white dark:bg-[#1E1E21] text-xs px-1"
                  aria-label="New project visibility"
                >
                  <option value="private">private</option>
                  <option value="public">public</option>
                </select>
                <Button size="sm" className="h-7 text-xs gap-1" disabled={projectBusy} onClick={doCreateProject}>
                  <Plus className="w-3 h-3" /> New
                </Button>
              </div>
            )}
          </div>
          <div className="divide-y divide-line/50">
            {shownProjects.map((p) => {
              const editable = canEditProject(me, p);
              return (
                <div key={p.id}>
                  <button
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-muted/40 ${selectedId === p.id ? 'bg-muted/40' : ''}`}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <span className="font-mono font-medium">{p.name}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full border text-[10px] ${p.visibility === 'private' ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-black' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}
                    >
                      {p.visibility}
                    </span>
                    {p.ownerId === me.id && (
                      <span className="px-1.5 py-0.5 rounded-full bg-muted border border-line text-[10px]">owner</span>
                    )}
                    <span className="ml-auto flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {editable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[11px]"
                          onClick={() => flipVisibility(p)}
                          title={`Make ${p.visibility === 'private' ? 'public' : 'private'}`}
                        >
                          Make {p.visibility === 'private' ? 'public' : 'private'}
                        </Button>
                      )}
                      {canDo(me, 'deleteProject') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[11px] text-red-600"
                          onClick={() => deleteProjectRow(p)}
                         title="Delete project" aria-label="Delete project">
                          <Trash2 className="w-3 h-3" />
                          {confirmDeleteProject === p.id ? 'Confirm?' : ''}
                        </Button>
                      )}
                    </span>
                  </button>
                  {selectedId === p.id && (
                    <div className="px-3 pb-2 text-[11px] text-zinc-500">
                      <span className="font-mono">{p.id}</span>
                      {p.cwd ? <span> · <span className="font-mono">{p.cwd}</span></span> : null}
                      <div className="mt-1 space-y-1">
                        {(detailMembers && detailMembers.projectId === p.id ? detailMembers.members : []).map(({ member, user: u }) => (
                          <div key={member.userId} className="flex items-center gap-2 rounded border border-line/60 px-2 py-1">
                            <span className="w-6 h-6 rounded-full bg-[#262624] text-white grid place-items-center text-[10px] font-semibold shrink-0">
                              {initials(u?.name ?? '', u?.email ?? member.userId)}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="text-xs font-medium">{u?.name ?? member.userId.slice(0, 8)}</span>{' '}
                              <span className="text-zinc-400 truncate">{u?.email ?? ''}</span>
                            </span>
                            {editable ? (
                              <>
                                <select
                                  value={member.role}
                                  onChange={(e) => setMemberRole(p.id, member.userId, e.target.value as 'member' | 'viewer')}
                                  className="h-6 rounded-md border border-line bg-white dark:bg-[#1E1E21] text-[11px] px-1"
                                  aria-label={`Role for ${u?.email ?? member.userId}`}
                                >
                                  <option value="member">member</option>
                                  <option value="viewer">viewer</option>
                                </select>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[11px] text-red-600"
                                  onClick={() => removeMemberRow(p.id, member.userId)}
                                >
                                  Remove
                                </Button>
                              </>
                            ) : (
                              <span className="px-1 py-0 rounded border border-line text-[10px] bg-white">{member.role}</span>
                            )}
                          </div>
                        ))}
                        {(detailMembers?.members.length ?? 0) === 0 && (
                          <p className="text-zinc-400">No members yet.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {shownProjects.length === 0 && (
              <p className="px-3 py-3 text-xs text-zinc-400">No projects yet — create the first one above.</p>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="rounded-lg border border-line overflow-hidden">
            <div className="h-7 flex items-center px-3 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line text-xs font-medium gap-2">
              Users — admin only
              <span className="ml-auto text-[11px] font-normal text-zinc-400">
                last admin cannot be removed
              </span>
            </div>
            <div className="p-2 border-b border-line/50 flex gap-1">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                <Input
                  placeholder="Search users…"
                  aria-label="Search users"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  className="pl-7 h-7 text-xs"
                />
              </div>
              <span className="text-[11px] text-zinc-400 self-center">{memberCountLabel(shownUsers.length)}</span>
            </div>
            <div className="divide-y divide-line/50">
              {shownUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-7 h-7 rounded-full bg-[#262624] text-white grid place-items-center text-[10px] font-semibold shrink-0">
                    {initials(u.name, u.email)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium flex items-center gap-1.5">
                      {u.name}
                      <span className={`px-1 py-0 rounded border text-[10px] ${roleTone(u.role)}`}>{u.role}</span>
                      <span className={`px-1 py-0 rounded border text-[10px] ${statusTone(u.status)}`}>{u.status}</span>
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">
                      {u.email} · active {formatLastActive(u.lastActiveAt)}
                    </div>
                  </div>
                  <select
                    value={u.role}
                    onChange={(e) => patchUserRole(u, e.target.value as AuthUser['role'])}
                    className="h-6 rounded-md border border-line bg-white dark:bg-[#1E1E21] text-[11px] px-1"
                    aria-label={`Role for ${u.email}`}
                  >
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                    <option value="viewer">viewer</option>
                  </select>
                  {u.status === 'disabled' ? (
                    <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => patchUserStatus(u, 'active')}>
                      Enable
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => patchUserStatus(u, 'disabled')}>
                      Disable
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => resetRowPassword(u)} title="Reset password" aria-label="Reset password">
                    <KeyRound className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] text-red-600"
                    onClick={() => deleteUserRow(u)}
                   title="Delete user" aria-label="Delete user">
                    <Trash2 className="w-3 h-3" />
                    {confirmDeleteUser === u.id ? 'Confirm?' : ''}
                  </Button>
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-line/50 bg-muted/20 space-y-1">
              <div className="flex gap-1">
                <Input
                  placeholder="invite@email.com"
                  aria-label="Invite email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="flex-1 h-7 text-xs"
                />
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as AuthUser['role'] })}
                  className="h-7 rounded-md border border-line bg-white dark:bg-[#1E1E21] text-xs px-2"
                  aria-label="Invite role"
                >
                  <option value="viewer">viewer</option>
                  <option value="member">member</option>
                </select>
                <Button size="sm" className="h-7 text-xs gap-1" disabled={inviteBusy} onClick={doInvite}>
                  <UserPlus className="w-3 h-3" /> Invite
                </Button>
              </div>
              {selected && (
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <input
                    type="checkbox"
                    checked={selectedId !== null && inviteForm.projectIds.includes(selectedId)}
                    onChange={(e) =>
                      setInviteForm({
                        ...inviteForm,
                        projectIds: e.target.checked && selectedId ? [selectedId] : [],
                      })
                    }
                  />
                  Add to selected project ({selected.name})
                </label>
              )}
              {lastInviteLink && (
                <p className="text-[11px] text-zinc-500 flex items-center gap-1">
                  Invite link (copy it — shown once):
                  <code className="px-1 py-0 rounded bg-white dark:bg-[#1E1E21] border border-line font-mono">{lastInviteLink}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[11px]"
                    onClick={() => {
                      void navigator.clipboard?.writeText(lastInviteLink).catch(() => undefined);
                      toast('Invite link copied');
                    }}
                   title="Copy invite link" aria-label="Copy invite link">
                    <Copy className="w-3 h-3" />
                  </Button>
                </p>
              )}
              {tempPassword && (
                <p className="text-[11px] text-amber-700 flex items-center gap-1">
                  Temp password for {tempPassword.email} (shown once):
                  <code className="px-1 py-0 rounded bg-white border border-line font-mono">{tempPassword.password}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[11px]"
                    onClick={() => {
                      void navigator.clipboard?.writeText(tempPassword.password).catch(() => undefined);
                      toast('Temp password copied');
                    }}
                   title="Copy temporary password" aria-label="Copy temporary password">
                    <Copy className="w-3 h-3" />
                  </Button>
                </p>
              )}
            </div>
          </div>
        )}

        <div className="p-2 rounded-md bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] text-[11px] leading-4 text-zinc-600 dark:text-zinc-300">
          <span className="font-medium">Flow:</span>{' '}
          <code className="px-1 py-0 rounded bg-white dark:bg-[#1E1E21] border border-line">email + password</code> → httpOnly cookie{' '}
          <code className="px-1 py-0 rounded bg-white dark:bg-[#1E1E21] border border-line">lokma_token</code> +{' '}
          <code className="px-1 py-0 rounded bg-white dark:bg-[#1E1E21] border border-line">Authorization: ***</code> → server{' '}
          <code className="px-1 py-0 rounded bg-white dark:bg-[#1E1E21] border border-line">can(user, perm, projectId)</code> → 401/403.
          Sessions inherit project membership.
        </div>
      </div>
    </div>
  );
}
