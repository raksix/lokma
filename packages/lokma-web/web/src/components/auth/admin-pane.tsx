import * as React from 'react';
import {
  Check,
  ChevronDown,
  Copy,
  Crown,
  Eye,
  KeyRound,
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
import { ApiError, api, type AuthProject, type AuthRole, type AuthSettings, type AuthUser, type ProjectMember } from '@/lib/api';
import {
  canDo,
  canEditProject,
  emptyInviteForm,
  emptyProjectForm,
  filterProjects,
  filterUsers,
  formatLastActive,
  initials,
  joinMembers,
  memberCountLabel,
  roleTone,
  statusTone,
  validateInviteForm,
  validateProjectForm,
} from './auth';

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('lokma-toast', { detail: message }));
}

function errMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
}

/** REQ-101 — locked note for signed-out / non-admin viewers (never the tables). */
function AdminLockedNote({ reason }: { reason: string }) {
  return (
    <div className="h-full grid place-items-center p-6 text-center">
      <div className="space-y-1">
        <Shield className="mx-auto h-5 w-5 text-zinc-400" />
        <p className="text-xs font-medium">Admin access required</p>
        <p className="text-[11px] text-zinc-500">{reason}</p>
      </div>
    </div>
  );
}

const ROLES: { id: AuthRole; label: string; desc: string; can: string }[] = [
  { id: 'superadmin', label: 'Superadmin', desc: 'Instance owner — users, roles, auth policy, all projects', can: "can('*') → true" },
  { id: 'admin', label: 'Admin', desc: 'Projects, invites, every session in a project — no auth policy', can: 'all but auth:manage' },
  { id: 'calisan', label: 'Calisan', desc: 'Assigned projects only, own sessions only', can: 'session:view-own' },
  { id: 'viewer', label: 'Viewer', desc: 'Read-only transcript + files in assigned projects', can: 'read-only defaults' },
];

/**
 * AdminPane — REQ-101. Instance administration only (Settings → Admin):
 * role reference cards, superadmin instance policy, projects with
 * visibility & members, the admin-only user table (search, role/status,
 * password reset, delete, invites with project assignment — REQ-092/093).
 *
 * Own profile + sign-in/out live in `AccountPane` (Settings → Account).
 * This pane renders for admin/superadmin only — everyone else (and
 * signed-out viewers) gets a short locked note, never the tables.
 * Every button hits a live endpoint; the server re-checks permissions
 * (`requireAdmin`), so a stale client gate can hide UI, never grant it.
 */
export function AdminPane() {
  const [me, setMe] = React.useState<AuthUser | null>(null);
  const [settings, setSettings] = React.useState<AuthSettings | null>(null);
  const [bootstrapped, setBootstrapped] = React.useState(true);
  const [loading, setLoading] = React.useState(true);

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
  // REQ-093 — per-user project assignment (expandable membership panel).
  const [expandedUserId, setExpandedUserId] = React.useState<string | null>(null);
  const [userMemberships, setUserMemberships] = React.useState<{
    userId: string;
    rows: { projectId: string; projectName: string; role: ProjectMember['role'] }[];
  } | null>(null);
  const [userMembershipsBusy, setUserMembershipsBusy] = React.useState(false);
  const [assignProjectId, setAssignProjectId] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settingsRes = await api.getAuthSettings();
      setSettings(settingsRes.settings);
      setBootstrapped(settingsRes.bootstrapped);
      if (!settingsRes.bootstrapped) {
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
      if (viewer.role === 'admin' || viewer.role === 'superadmin') {
        const usersRes = await api.listUsers();
        setUsers(usersRes.users);
      }
    } catch (e) {
      setError(errMessage(e));
    }
  }, []);

  React.useEffect(() => {
    // REQ-101 — tables load for admin/superadmin only; everyone else sees
    // the locked note below (and the server 401/403s direct API calls).
    if (me && (me.role === 'admin' || me.role === 'superadmin')) void loadTables(me);
  }, [me, loadTables]);

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
        projectIds: inviteForm.projectIds,
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

  const setMemberRole = async (projectId: string, userId: string, role: 'calisan' | 'member' | 'viewer') => {
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

  // REQ-093 — per-user project assignment: expand a user row to see every
  // project they belong to, assign more, or remove them. Uses the existing
  // listMembers/addMember/removeMember endpoints (no new API).
  const loadUserMemberships = async (userId: string) => {
    setUserMembershipsBusy(true);
    try {
      const settled = await Promise.all(
        projects.map((p) =>
          api.listMembers(p.id).then(
            (res) => ({ project: p, members: res.members }),
            () => ({ project: p, members: [] as ProjectMember[] }),
          ),
        ),
      );
      const rows = settled.flatMap(({ project, members }) =>
        members
          .filter((m) => m.userId === userId)
          .map((m) => ({ projectId: project.id, projectName: project.name, role: m.role })),
      );
      setUserMemberships({ userId, rows });
    } finally {
      setUserMembershipsBusy(false);
    }
  };

  const toggleUserProjects = (target: AuthUser) => {
    if (expandedUserId === target.id) {
      setExpandedUserId(null);
      setUserMemberships(null);
      return;
    }
    setExpandedUserId(target.id);
    setAssignProjectId('');
    void loadUserMemberships(target.id);
  };

  const assignUserToProject = async (target: AuthUser) => {
    if (!assignProjectId) return;
    try {
      await api.addMember(assignProjectId, { userId: target.id, role: 'member' });
      if (me) await loadTables(me);
      await loadUserMemberships(target.id);
      toast(`Added ${target.email} to project`);
    } catch (e) {
      toast(errMessage(e));
    }
  };

  const unassignUserFromProject = async (target: AuthUser, projectId: string) => {
    try {
      await api.removeMember(projectId, target.id);
      if (me) await loadTables(me);
      await loadUserMemberships(target.id);
      toast(`Removed ${target.email} from project`);
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

  // ─── Locked — sign-in lives in Settings \u2192 Account (REQ-101) ───
  if (!me) {
    return (
      <AdminLockedNote
        reason={
          !bootstrapped
            ? 'No users yet \u2014 seed the first admin from Settings \u2192 Account.'
            : 'Sign in from Settings \u2192 Account, then reopen this tab.'
        }
      />
    );
  }

  // ─── Logged in ───────────────────────────────────────────────────────
  const isAdmin = me.role === 'admin' || me.role === 'superadmin';
  const isSuperadmin = me.role === 'superadmin';
  const shownUsers = filterUsers(users, userQuery);
  const shownProjects = filterProjects(projects, projectQuery);

  // REQ-101 — non-admin members never see the tables (own profile lives
  // in Settings → Account). Server endpoints 401/403 independently.
  if (!isAdmin) {
    return (
      <AdminLockedNote reason="Requires an admin or superadmin account — your own profile lives in Settings → Account." />
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Shield className="w-3 h-3 text-emerald-600" />
        <span className="text-xs font-semibold">Admin</span>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] flex items-center gap-1">
          <Check className="w-3 h-3" /> {me.name} · {me.role}
        </span>
        <span className="hidden @min-[320px]:inline ml-1 text-[11px] text-zinc-400">users · roles · projects · policy</span>
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

        <div className="grid grid-cols-1 gap-2 @min-[520px]:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r.id} className={`rounded-lg border p-2.5 ${roleTone(r.id)}`}>
              <div className="text-xs font-semibold flex items-center gap-1">
                {r.id === 'superadmin' ? <Crown className="w-3 h-3" /> : r.id === 'admin' ? <Shield className="w-3 h-3" /> : r.id === 'calisan' ? <Users className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
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

        {isSuperadmin && settings && (
          <div className="rounded-lg border border-line overflow-hidden">
            <div className="h-7 flex items-center px-3 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line text-xs font-medium">
              Instance policy
              <span className="ml-auto text-[11px] font-normal text-zinc-400">superadmin write · admin 403</span>
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
              <label className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300" htmlFor="auth-policy-require-login">
                <input
                  id="auth-policy-require-login"
                  type="checkbox"
                  checked={settings.requireLogin}
                  onChange={(e) => savePolicy({ requireLogin: e.target.checked })}
                  className="h-3.5 w-3.5 accent-[#C96442]"
                />
                Require login for web + WS
              </label>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-line overflow-hidden">
          <div className="h-7 flex items-center px-3 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line text-xs font-medium gap-2">
            Projects — visibility & members
            <span className="ml-auto text-[11px] font-normal text-zinc-400 hidden @min-[320px]:inline">
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
                                  onChange={(e) => setMemberRole(p.id, member.userId, e.target.value as 'calisan' | 'member' | 'viewer')}
                                  className="h-6 rounded-md border border-line bg-white dark:bg-[#1E1E21] text-[11px] px-1"
                                  aria-label={`Role for ${u?.email ?? member.userId}`}
                                >
                                  <option value="calisan">calisan</option>
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
                <div key={u.id}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 shrink-0"
                    onClick={() => toggleUserProjects(u)}
                    title={expandedUserId === u.id ? 'Hide projects' : 'Show projects'}
                    aria-label={`Projects for ${u.email}`}
                    aria-expanded={expandedUserId === u.id}
                  >
                    <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${expandedUserId === u.id ? 'rotate-180' : ''}`} />
                  </Button>
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
                    <option value="superadmin" disabled={!isSuperadmin}>superadmin</option>
                    <option value="admin">admin</option>
                    <option value="calisan">calisan</option>
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
                {expandedUserId === u.id && (
                  <div className="px-3 pb-2 pl-11">
                    {userMembershipsBusy && (!userMemberships || userMemberships.userId !== u.id) ? (
                      <p className="text-[11px] text-zinc-400">Loading projects…</p>
                    ) : (
                      <>
                        <div className="space-y-1">
                          {(userMemberships && userMemberships.userId === u.id ? userMemberships.rows : []).map((row) => (
                            <div key={row.projectId} className="flex items-center gap-2 rounded border border-line/60 px-2 py-1 text-[11px]">
                              <span className="font-mono font-medium text-xs">{row.projectName}</span>
                              <span className="px-1 py-0 rounded border border-line text-[10px] bg-white dark:bg-[#1E1E21]">{row.role}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="ml-auto h-5 text-[11px] text-red-600"
                                onClick={() => unassignUserFromProject(u, row.projectId)}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                          {userMemberships && userMemberships.userId === u.id && userMemberships.rows.length === 0 && (
                            <p className="text-[11px] text-zinc-400">No projects yet — assign the first one below.</p>
                          )}
                        </div>
                        <div className="mt-1 flex gap-1">
                          <select
                            value={assignProjectId}
                            onChange={(e) => setAssignProjectId(e.target.value)}
                            className="h-6 flex-1 rounded-md border border-line bg-white dark:bg-[#1E1E21] text-[11px] px-1"
                            aria-label={`Assign ${u.email} to project`}
                          >
                            <option value="">Assign to project…</option>
                            {projects
                              .filter(
                                (p) =>
                                  !(userMemberships && userMemberships.userId === u.id && userMemberships.rows.some((r) => r.projectId === p.id)),
                              )
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                          <Button size="sm" className="h-6 text-[11px] gap-1" disabled={!assignProjectId} onClick={() => assignUserToProject(u)}>
                            <Plus className="w-3 h-3" /> Assign
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
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
                  <option value="calisan">calisan</option>
                </select>
                <Button size="sm" className="h-7 text-xs gap-1" disabled={inviteBusy} onClick={doInvite}>
                  <UserPlus className="w-3 h-3" /> Invite
                </Button>
              </div>
              {projects.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] text-zinc-500">
                    Add invite to projects ({inviteForm.projectIds.length} selected):
                  </p>
                  <div className="max-h-24 overflow-auto space-y-1 rounded border border-line/60 p-1.5">
                    {projects.map((p) => (
                      <label key={p.id} className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={inviteForm.projectIds.includes(p.id)}
                          onChange={(e) =>
                            setInviteForm({
                              ...inviteForm,
                              projectIds: e.target.checked
                                ? [...inviteForm.projectIds, p.id]
                                : inviteForm.projectIds.filter((id) => id !== p.id),
                            })
                          }
                          className="h-3 w-3 accent-[#C96442]"
                        />
                        <span className="font-mono">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
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
