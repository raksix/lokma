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
  if (role === 'superadmin') return 'bg-[#C96442] text-white border-[#C96442]';
  if (role === 'admin') return 'bg-[#262624] text-white border-[#262624]';
  if (role === 'calisan' || role === 'member') return 'bg-white dark:bg-[#1E1E21] border-line';
  return 'bg-zinc-100 border-line text-zinc-600';
}

/** Human label — legacy `member` renders as its canonical `calisan`. */
export function roleLabel(role: AuthRole): string {
  if (role === 'member') return 'calisan';
  return role;
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
 * REQ-064: superadmin = everything; admin = everything except
 * manageSettings (instance auth policy is superadmin-only server-side);
 * calisan creates projects only under the `open` policy; inviteUsers =
 * admin+ (admins invite calisan/viewer, superadmin owns roles).
 */
export function canDo(
  viewer: AuthUser | null,
  action: 'manageUsers' | 'manageSettings' | 'inviteUsers' | 'createProject' | 'deleteProject',
  settings?: { projectCreation: 'admin-only' | 'members' | 'open' } | null,
): boolean {
  if (!viewer || viewer.status !== 'active') return false;
  if (viewer.role === 'superadmin') return true;
  if (action === 'manageSettings') return false;
  if (viewer.role === 'admin') return true;
  if (action === 'createProject') {
    // Viewers never create (read-only guests); calisan only under `open`.
    if (viewer.role === 'viewer') return false;
    return (settings?.projectCreation ?? 'members') === 'open';
  }
  return false;
}

/** Project edit gating — admin/superadmin or the project owner (mirrors the server). */
export function canEditProject(viewer: AuthUser | null, project: AuthProject): boolean {
  if (!viewer || viewer.status !== 'active') return false;
  if (viewer.role === 'admin' || viewer.role === 'superadmin') return true;
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

/** Accept-invite form (REQ-080): name + password entered twice. */
export type AcceptInviteForm = { name: string; password: string; confirm: string };
export const emptyAcceptInviteForm: AcceptInviteForm = { name: '', password: '', confirm: '' };

export function validateAcceptInviteForm(form: AcceptInviteForm): string | null {
  if (!form.name.trim() || form.name.trim().length > 40) return 'Name must be 1-40 chars';
  if (form.password.length < 8 || form.password.length > 200) return 'Password must be 8-200 chars';
  if (form.password !== form.confirm) return 'Passwords do not match';
  return null;
}

export type InviteForm = { email: string; role: AuthRole; projectIds: string[] };
export const emptyInviteForm: InviteForm = { email: '', role: 'calisan', projectIds: [] };

export function validateInviteForm(form: InviteForm): string | null {
  if (!EMAIL_PATTERN.test(form.email.trim())) return 'Enter a valid email address';
  if (form.role === 'admin' || form.role === 'superadmin') return 'Invites are calisan|viewer — promote after they join';
  return null;
}

export type ProjectForm = { name: string; cwd: string; visibility: 'private' | 'public' };
export const emptyProjectForm: ProjectForm = { name: '', cwd: '', visibility: 'private' };

export function validateProjectForm(form: ProjectForm): string | null {
  if (!form.name.trim() || form.name.trim().length > 60) return 'Name must be 1-60 chars';
  return null;
}

/**
 * REQ-088 — bidirectional New-Project modal autofill (pure, unit-tested).
 * `suggestProjectName` derives a display name from the last segment of a
 * working-directory path (`/mnt/apopic/my-app/` -> `my-app`).
 * `suggestProjectCwd` proposes a server path for a typed name
 * (`My App` -> `/mnt/apopic/my-app`). Both return '' when nothing
 * sensible can be derived; the modal only fills EMPTY fields, never
 * overwriting what the user typed.
 */
export function suggestProjectName(cwd: string): string {
  const trimmed = cwd.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const last = trimmed.slice(trimmed.lastIndexOf('/') + 1).trim();
  return last;
}

export function suggestProjectCwd(name: string): string {
  const slug = name
    .trim()
    .toLocaleLowerCase('en-US')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  if (!slug) return '';
  return `/mnt/apopic/${slug}`;
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
