import type { AuthProject, AuthRole, AuthUser, ProjectMember, UserStatus } from '@/lib/api';

/**
 * AuthPane pure helpers (W6-21, Docs/36).
 * No React, no fetch — every function is covered by `auth.test.ts`
 * (`bun src/components/auth/auth.test.ts`).
 */

export const TOKEN_KEY = 'lokma-token';

/** Persist the Bearer token (the server also sets the httpOnly cookie). */
export function storeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Non-browser runtimes (probes) skip persistence.
  }
}

/** Drop the Bearer token on logout. */
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Non-browser runtimes have nothing to clear.
  }
}

/** Row tone for the role cards + member badges (concept colors 1:1). */
export function roleTone(role: AuthRole): string {
  if (role === 'admin') return 'bg-[#262624] text-white border-[#262624]';
  if (role === 'member') return 'bg-white dark:bg-[#1E1E21] border-line';
  return 'bg-zinc-100 border-line text-zinc-600';
}

/** Status pill tone for the admin user table. */
export function statusTone(status: UserStatus): string {
  if (status === 'active') return 'bg-emerald-50 border-emerald-200 text-emerald-700';
  if (status === 'invited') return 'bg-amber-50 border-amber-200 text-amber-700';
  return 'bg-zinc-100 border-line text-zinc-500';
}

/** Initials for the avatar square (no external avatar images — real names only). */
export function initials(name: string, email: string): string {
  const stem = name.trim() || email.split('@')[0] || '?';
  const parts = stem.split(/\s+/);
  if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return stem.slice(0, 2).toUpperCase();
}

/** "3 members" style count label. */
export function memberCountLabel(n: number): string {
  return `${n} member${n === 1 ? '' : 's'}`;
}

/**
 * Client-side mirror of the server `can()` matrix (Docs/36 §3) — used
 * ONLY to gate buttons. The server re-checks every write; a stale
 * mirror can hide a button, never grant access.
 * `settings` mirrors the creation policy for `createProject` only.
 */
export function canDo(
  viewer: AuthUser | null,
  action: 'manageUsers' | 'manageSettings' | 'createProject' | 'deleteProject',
  settings?: { projectCreation: 'admin-only' | 'members' | 'open' } | null,
): boolean {
  if (!viewer || viewer.status !== 'active') return false;
  if (viewer.role === 'admin') return true;
  if (action === 'createProject') {
    if (viewer.role !== 'member') return false;
    return (settings?.projectCreation ?? 'members') !== 'admin-only';
  }
  return false;
}

/** Project edit gating — admin or the project owner (mirrors the server). */
export function canEditProject(viewer: AuthUser | null, project: AuthProject): boolean {
  if (!viewer || viewer.status !== 'active') return false;
  if (viewer.role === 'admin') return true;
  return project.ownerId === viewer.id;
}

/** Live search over the user table (name/email/role). */
export function filterUsers(users: AuthUser[], query: string): AuthUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  return users.filter(
    (u) =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.includes(q),
  );
}

/** Live search over projects (name only — ids are opaque). */
export function filterProjects(projects: AuthProject[], query: string): AuthProject[] {
  const q = query.trim().toLowerCase();
  if (!q) return projects;
  return projects.filter((p) => p.name.toLowerCase().includes(q));
}

/** Members of one project with the user row attached (null when unknown). */
export type MemberRow = { member: ProjectMember; user: AuthUser | null };

export function joinMembers(members: ProjectMember[], users: AuthUser[]): MemberRow[] {
  const byId = new Map(users.map((u) => [u.id, u]));
  return members.map((member) => ({ member, user: byId.get(member.userId) ?? null }));
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginForm = { email: string; password: string };
export const emptyLoginForm: LoginForm = { email: '', password: '' };

/** Client mirror of the server login rules (server re-validates). */
export function validateLoginForm(form: LoginForm): string | null {
  if (!EMAIL_PATTERN.test(form.email.trim())) return 'Enter a valid email address';
  if (!form.password) return 'Enter your password';
  return null;
}

export type RegisterForm = { email: string; name: string; password: string };
export const emptyRegisterForm: RegisterForm = { email: '', name: '', password: '' };

export function validateRegisterForm(form: RegisterForm): string | null {
  if (!EMAIL_PATTERN.test(form.email.trim())) return 'Enter a valid email address';
  if (!form.name.trim() || form.name.trim().length > 40) return 'Name must be 1-40 chars';
  if (form.password.length < 8 || form.password.length > 200) return 'Password must be 8-200 chars';
  return null;
}

export type InviteForm = { email: string; role: AuthRole; projectIds: string[] };
export const emptyInviteForm: InviteForm = { email: '', role: 'member', projectIds: [] };

export function validateInviteForm(form: InviteForm): string | null {
  if (!EMAIL_PATTERN.test(form.email.trim())) return 'Enter a valid email address';
  if (form.role === 'admin') return 'Invites are member|viewer — promote after they join';
  return null;
}

export type ProjectForm = { name: string; cwd: string; visibility: 'private' | 'public' };
export const emptyProjectForm: ProjectForm = { name: '', cwd: '', visibility: 'private' };

export function validateProjectForm(form: ProjectForm): string | null {
  if (!form.name.trim() || form.name.trim().length > 60) return 'Name must be 1-60 chars';
  return null;
}

/** Human "last active" label (null-safe — invited users never logged in). */
export function formatLastActive(lastActiveAt: string | null): string {
  if (!lastActiveAt) return 'never';
  const ms = Date.now() - new Date(lastActiveAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
