import { randomBytes, scryptSync, createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  AuthSettingsSchema,
  ProjectMemberSchema,
  ProjectSchema,
  UserSchema,
  type AuthSettings,
  type Project,
  type ProjectMember,
  type ProjectVisibility,
  type Role,
  type UserStatus,
} from 'lokma-shared';
import type { User } from 'lokma-shared';
import { readJson, writeAtomic } from '../utils/fs.js';

/** Re-export the public user type so server routes import from one place. */
export type { User } from 'lokma-shared';

/**
 * Auth store — users, projects, memberships, invites + RBAC `can()`
 * (Docs/36-AUTH-and-PERMISSIONS).
 * File-backed under `~/.lokma/auth/` (users.json 0600 — it holds
 * password hashes; projects/members/settings are world-readable JSON).
 * Passwords are scrypt hashes, sessions are stateless HMAC tokens
 * (`lokma_token` cookie + `Authorization: *** — no session table,
 * so PM2 restarts never log anyone out.
 * Until the FIRST admin registers the instance is single-user-open
 * (Docs/36 §6.2 + §10): gates activate once a user exists.
 */

export class AuthError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}

const AUTH_DIR = join(homedir(), '.lokma', 'auth');
const USERS_PATH = join(AUTH_DIR, 'users.json');
const PROJECTS_PATH = join(AUTH_DIR, 'projects.json');
const MEMBERS_PATH = join(AUTH_DIR, 'members.json');
const INVITES_PATH = join(AUTH_DIR, 'invites.json');
const SETTINGS_PATH = join(AUTH_DIR, 'settings.json');
const SECRET_PATH = join(AUTH_DIR, 'secret');

/** A user row on disk — the public `User` plus the scrypt hash. */
type StoredUser = User & { passwordHash: string | null };

type Invite = {
  token: string;
  userId: string;
  projectIds: string[];
  expiresAt: string;
  createdAt: string;
};

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

/** Public projection — password hashes NEVER leave the store. */
export function publicUser(row: StoredUser): User {
  const { passwordHash: _hash, ...pub } = row;
  return UserSchema.parse(pub);
}

function assertEmail(email: unknown): asserts email is string {
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim()) || email.trim().length > 160) {
    throw new AuthError('bad_email', 'email must be a valid address (max 160 chars)', 400);
  }
}

function assertName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) {
    throw new AuthError('bad_name', 'name must be 1-40 chars', 400);
  }
}

function assertPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    throw new AuthError('bad_password', 'password must be 8-200 chars', 400);
  }
}

function assertRole(role: unknown): asserts role is Role {
  if (role !== 'admin' && role !== 'member' && role !== 'viewer') {
    throw new AuthError('bad_role', "role must be admin|member|viewer", 400);
  }
}

function assertId(id: unknown, what: string): asserts id is string {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new AuthError(what === 'user' ? 'bad_user_id' : 'bad_project_id', `Invalid ${what} id`, 400);
  }
}

/** scrypt hash (`scrypt$<saltHex>$<hashHex>`) — same shape as CLI credentials. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expected] = parts;
  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, 64);
  } catch {
    return false;
  }
  const expBuf = Buffer.from(expected, 'hex');
  return actual.length === expBuf.length && timingSafeEqual(actual, expBuf);
}

// ─── File IO (atomic writes, corrupt files read as empty) ────────────────

async function readUsers(): Promise<StoredUser[]> {
  const rows = await readJson<unknown[]>(USERS_PATH, (r) => (Array.isArray(r) ? r : []), []);
  const out: StoredUser[] = [];
  for (const row of rows) {
    try {
      const base = UserSchema.parse(row);
      const hash = (row as Record<string, unknown>).passwordHash;
      out.push({ ...base, passwordHash: typeof hash === 'string' ? hash : null });
    } catch {
      // Skip corrupt rows — the registry stays readable.
    }
  }
  return out;
}

async function writeUsers(rows: StoredUser[]): Promise<void> {
  await writeAtomic(USERS_PATH, JSON.stringify(rows, null, 2), 0o600);
}

async function readProjects(): Promise<Project[]> {
  const rows = await readJson<unknown[]>(PROJECTS_PATH, (r) => (Array.isArray(r) ? r : []), []);
  const out: Project[] = [];
  for (const row of rows) {
    try {
      out.push(ProjectSchema.parse(row));
    } catch {
      // Skip corrupt rows.
    }
  }
  return out;
}

async function writeProjects(rows: Project[]): Promise<void> {
  await writeAtomic(PROJECTS_PATH, JSON.stringify(rows, null, 2));
}

async function readMembers(): Promise<ProjectMember[]> {
  const rows = await readJson<unknown[]>(MEMBERS_PATH, (r) => (Array.isArray(r) ? r : []), []);
  const out: ProjectMember[] = [];
  for (const row of rows) {
    try {
      out.push(ProjectMemberSchema.parse(row));
    } catch {
      // Skip corrupt rows.
    }
  }
  return out;
}

async function writeMembers(rows: ProjectMember[]): Promise<void> {
  await writeAtomic(MEMBERS_PATH, JSON.stringify(rows, null, 2));
}

async function readInvites(): Promise<Invite[]> {
  return readJson<Invite[]>(INVITES_PATH, (r) => (Array.isArray(r) ? r : []), []);
}

async function writeInvites(rows: Invite[]): Promise<void> {
  await writeAtomic(INVITES_PATH, JSON.stringify(rows, null, 2));
}

async function readSecret(): Promise<Buffer> {
  try {
    const raw = await readFile(SECRET_PATH, 'utf-8');
    const trimmed = raw.trim();
    if (/^[0-9a-f]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
  } catch {
    // Missing or unreadable — generate below.
  }
  const secret = randomBytes(32);
  await writeAtomic(SECRET_PATH, secret.toString('hex'), 0o600);
  return secret;
}

// ─── Tokens (stateless HMAC, 7d TTL) ──────────────────────────────────────

function b64urlEncode(data: string | Buffer): string {
  return (typeof data === 'string' ? Buffer.from(data, 'utf-8') : data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(part: string): string {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

/** Sign a session token for a user id (returned on login + register). */
export async function signToken(userId: string): Promise<string> {
  const secret = await readSecret();
  const payload = JSON.stringify({ sub: userId, exp: Date.now() + TOKEN_TTL_MS });
  const body = b64urlEncode(payload);
  const sig = b64urlEncode(createHmac('sha256', secret).update(`v1.${body}`).digest());
  return `v1.${body}.${sig}`;
}

/**
 * Verify a token → user id, or null (bad shape/signature/expired).
 * The caller loads the user row (status check happens there).
 */
export async function verifyTokenId(token: string): Promise<string | null> {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const [, body, sig] = parts;
  const secret = await readSecret();
  const expected = b64urlEncode(createHmac('sha256', secret).update(`v1.${body}`).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body)) as { sub?: unknown; exp?: unknown };
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

// ─── Users ────────────────────────────────────────────────────────────────

/** True once the first admin exists — gates activate (single-user-open before). */
export async function isBootstrapped(): Promise<boolean> {
  return (await readUsers()).length > 0;
}

export async function listUsers(): Promise<User[]> {
  return (await readUsers()).map(publicUser);
}

export async function getUserById(id: string): Promise<StoredUser | null> {
  return (await readUsers()).find((u) => u.id === id) ?? null;
}

export async function getUserByEmail(email: string): Promise<StoredUser | null> {
  const needle = email.trim().toLowerCase();
  return (await readUsers()).find((u) => u.email.toLowerCase() === needle) ?? null;
}

/**
 * First-user seed — becomes admin, no auth (Docs/36 §6.2). Fails closed
 * once ANY user exists (thereafter invite/login only).
 */
export async function registerFirstAdmin(input: { email: string; name: string; password: string }): Promise<{ user: User; token: string }> {
  assertEmail(input.email);
  assertName(input.name);
  assertPassword(input.password);
  const users = await readUsers();
  if (users.length > 0) {
    throw new AuthError('auth_already_bootstrapped', 'Instance already has users — ask an admin for an invite', 403);
  }
  const row: StoredUser = {
    id: randomId('u'),
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    role: 'admin',
    status: 'active',
    permissions: [],
    createdAt: nowIso(),
    lastActiveAt: nowIso(),
    passwordHash: hashPassword(input.password),
  };
  await writeUsers([row]);
  return { user: publicUser(row), token: await signToken(row.id) };
}

/** Email + password login — 401 on unknown email, bad hash, or non-active status. */
export async function loginUser(email: string, password: string): Promise<{ user: User; token: string }> {
  assertEmail(email);
  if (typeof password !== 'string' || !password) {
    throw new AuthError('bad_credentials', 'Invalid email or password', 401);
  }
  const row = await getUserByEmail(email);
  if (!row || !row.passwordHash || !verifyPassword(password, row.passwordHash)) {
    throw new AuthError('bad_credentials', 'Invalid email or password', 401);
  }
  if (row.status !== 'active') {
    throw new AuthError('account_not_active', `Account is ${row.status}`, 403);
  }
  const users = await readUsers();
  const next = users.map((u) => (u.id === row.id ? { ...u, lastActiveAt: nowIso() } : u));
  await writeUsers(next);
  const updated = next.find((u) => u.id === row.id) ?? row;
  return { user: publicUser(updated), token: await signToken(row.id) };
}

/** Load the request user from a token (cookie or Bearer) — null when anonymous. */
export async function userFromToken(token: string | null | undefined): Promise<User | null> {
  if (!token) return null;
  const id = await verifyTokenId(token);
  if (!id) return null;
  const row = await getUserById(id);
  if (!row || row.status !== 'active') return null;
  return publicUser(row);
}

async function countAdmins(users: StoredUser[]): Promise<number> {
  return users.filter((u) => u.role === 'admin' && u.status === 'active').length;
}

/** Admin user edit — last-admin demote/disable is blocked (409, Docs/36 §9). */
export async function patchUser(
  id: string,
  actor: User,
  patch: { name?: unknown; role?: unknown; status?: unknown; permissions?: unknown },
): Promise<User> {
  assertId(id, 'user');
  void actor;
  const users = await readUsers();
  const row = users.find((u) => u.id === id);
  if (!row) throw new AuthError('user_not_found', 'User not found', 404);
  const keys = Object.keys(patch);
  if (keys.length === 0) throw new AuthError('empty_patch', 'Nothing to update', 400);

  const next: StoredUser = { ...row };
  if (patch.name !== undefined) {
    assertName(patch.name);
    next.name = (patch.name as string).trim();
  }
  if (patch.role !== undefined) {
    assertRole(patch.role);
    next.role = patch.role as Role;
  }
  if (patch.status !== undefined) {
    const s = patch.status;
    if (s !== 'active' && s !== 'invited' && s !== 'disabled') {
      throw new AuthError('bad_status', 'status must be active|invited|disabled', 400);
    }
    next.status = s as UserStatus;
  }
  if (patch.permissions !== undefined) {
    if (!Array.isArray(patch.permissions) || patch.permissions.some((p) => typeof p !== 'string' || !p || p.length > 80)) {
      throw new AuthError('bad_permissions', 'permissions must be a string array (max 80 chars each)', 400);
    }
    next.permissions = [...(patch.permissions as string[])];
  }
  const preview = users.map((u) => (u.id === id ? next : u));
  if ((await countAdmins(preview)) === 0) {
    throw new AuthError('last_admin', 'Cannot remove the last active admin', 409);
  }
  await writeUsers(preview);
  return publicUser(next);
}

/** Admin user delete — last-admin is blocked; memberships are cleaned up. */
export async function deleteUser(id: string): Promise<void> {
  assertId(id, 'user');
  const users = await readUsers();
  if (!users.some((u) => u.id === id)) throw new AuthError('user_not_found', 'User not found', 404);
  const preview = users.filter((u) => u.id !== id);
  if ((await countAdmins(preview)) === 0) {
    throw new AuthError('last_admin', 'Cannot remove the last active admin', 409);
  }
  await writeUsers(preview);
  await writeMembers((await readMembers()).filter((m) => m.userId !== id));
  await writeInvites((await readInvites()).filter((i) => i.userId !== id));
}

/** Admin password reset — returns a one-time temp password (shown once). */
export async function resetPassword(id: string): Promise<{ user: User; tempPassword: string }> {
  assertId(id, 'user');
  const users = await readUsers();
  const row = users.find((u) => u.id === id);
  if (!row) throw new AuthError('user_not_found', 'User not found', 404);
  const tempPassword = randomBytes(9).toString('base64url');
  const next = users.map((u) =>
    u.id === id ? { ...u, passwordHash: hashPassword(tempPassword), status: 'active' as UserStatus } : u,
  );
  await writeUsers(next);
  const updated = next.find((u) => u.id === id) ?? row;
  return { user: publicUser(updated), tempPassword };
}

// ─── Settings ─────────────────────────────────────────────────────────────

export async function getAuthSettings(): Promise<AuthSettings> {
  return readJson<AuthSettings>(SETTINGS_PATH, (r) => AuthSettingsSchema.parse(r), AuthSettingsSchema.parse({}));
}

export async function saveAuthSettings(patch: unknown): Promise<AuthSettings> {
  const parsed = AuthSettingsSchema.partial().safeParse(patch);
  if (!parsed.success || Object.keys((patch ?? {}) as object).length === 0) {
    throw new AuthError('bad_settings', 'Invalid auth settings patch', 400);
  }
  const merged = AuthSettingsSchema.parse({ ...(await getAuthSettings()), ...parsed.data });
  await writeAtomic(SETTINGS_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

// ─── Projects + members ───────────────────────────────────────────────────

function slugifyProject(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'project';
}

export async function listProjects(): Promise<Project[]> {
  return readProjects();
}

export async function getProject(id: string): Promise<Project | null> {
  assertId(id, 'project');
  return (await readProjects()).find((p) => p.id === id) ?? null;
}

function assertProjectName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) {
    throw new AuthError('bad_project_name', 'name must be 1-60 chars', 400);
  }
}

function assertVisibility(v: unknown): asserts v is ProjectVisibility {
  if (v !== 'private' && v !== 'public') {
    throw new AuthError('bad_visibility', 'visibility must be private|public', 400);
  }
}

async function assertCwd(cwd: unknown): Promise<void> {
  if (cwd === undefined || cwd === '') return;
  if (typeof cwd !== 'string' || !cwd.trim() || cwd.length > 500) {
    throw new AuthError('bad_cwd', 'cwd must be an existing directory path', 400);
  }
  try {
    const st = await stat(cwd);
    if (!st.isDirectory()) throw new AuthError('bad_cwd', 'cwd is not a directory', 400);
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError('bad_cwd', 'cwd does not exist', 400);
  }
}

export async function createProject(
  owner: User,
  input: { name: string; cwd?: string; visibility?: ProjectVisibility },
): Promise<Project> {
  assertProjectName(input.name);
  await assertCwd(input.cwd);
  const settings = await getAuthSettings();
  const visibility = input.visibility ?? settings.projectVisibilityDefault;
  assertVisibility(visibility);
  const row: Project = {
    id: `p_${slugifyProject(input.name)}-${randomBytes(2).toString('hex')}`,
    name: input.name.trim(),
    cwd: typeof input.cwd === 'string' ? input.cwd : '',
    visibility,
    ownerId: owner.id,
    createdAt: nowIso(),
  };
  const projects = await readProjects();
  await writeProjects([...projects, row]);
  const members = await readMembers();
  await writeMembers([
    ...members,
    { projectId: row.id, userId: owner.id, role: 'member', permissions: [], addedAt: nowIso(), addedBy: owner.id },
  ]);
  return row;
}

export async function patchProject(
  id: string,
  patch: { name?: unknown; cwd?: unknown; visibility?: unknown },
): Promise<Project> {
  const row = await getProject(id);
  if (!row) throw new AuthError('project_not_found', 'Project not found', 404);
  if (Object.keys(patch).length === 0) throw new AuthError('empty_patch', 'Nothing to update', 400);
  const next: Project = { ...row };
  if (patch.name !== undefined) {
    assertProjectName(patch.name);
    next.name = (patch.name as string).trim();
  }
  if (patch.cwd !== undefined) {
    await assertCwd(patch.cwd);
    next.cwd = patch.cwd as string;
  }
  if (patch.visibility !== undefined) {
    assertVisibility(patch.visibility);
    next.visibility = patch.visibility;
  }
  const projects = await readProjects();
  await writeProjects(projects.map((p) => (p.id === id ? next : p)));
  return next;
}

export async function deleteProject(id: string): Promise<void> {
  const row = await getProject(id);
  if (!row) throw new AuthError('project_not_found', 'Project not found', 404);
  // Deletes the DB index + memberships only — never `rm -rf cwd` (Docs/36 §9).
  await writeProjects((await readProjects()).filter((p) => p.id !== id));
  await writeMembers((await readMembers()).filter((m) => m.projectId !== id));
  await writeInvites((await readInvites()).filter((i) => !i.projectIds.includes(id)));
}

export async function listMembers(projectId: string): Promise<ProjectMember[]> {
  await getProject(projectId).then((p) => {
    if (!p) throw new AuthError('project_not_found', 'Project not found', 404);
  });
  return (await readMembers()).filter((m) => m.projectId === projectId);
}

export async function memberOf(projectId: string, userId: string): Promise<ProjectMember | null> {
  return (await readMembers()).find((m) => m.projectId === projectId && m.userId === userId) ?? null;
}

export async function addMember(
  projectId: string,
  actor: User,
  input: { userId: string; role?: 'member' | 'viewer' },
): Promise<ProjectMember> {
  const project = await getProject(projectId);
  if (!project) throw new AuthError('project_not_found', 'Project not found', 404);
  assertId(input.userId, 'user');
  const role = input.role ?? 'member';
  if (role !== 'member' && role !== 'viewer') throw new AuthError('bad_role', 'role must be member|viewer', 400);
  const target = await getUserById(input.userId);
  if (!target) throw new AuthError('user_not_found', 'User not found', 404);
  const members = await readMembers();
  const existing = members.find((m) => m.projectId === projectId && m.userId === input.userId);
  const row: ProjectMember = {
    projectId,
    userId: input.userId,
    role,
    permissions: existing?.permissions ?? [],
    addedAt: existing?.addedAt ?? nowIso(),
    addedBy: actor.id,
  };
  await writeMembers([...members.filter((m) => !(m.projectId === projectId && m.userId === input.userId)), row]);
  return row;
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  await getProject(projectId).then((p) => {
    if (!p) throw new AuthError('project_not_found', 'Project not found', 404);
  });
  assertId(userId, 'user');
  const members = await readMembers();
  if (!members.some((m) => m.projectId === projectId && m.userId === userId)) {
    throw new AuthError('member_not_found', 'Membership not found', 404);
  }
  await writeMembers(members.filter((m) => !(m.projectId === projectId && m.userId === userId)));
}

// ─── Invites (copyable link when no email is configured, Docs/36 §6.1) ────

export async function inviteUser(
  actor: User,
  input: { email: string; role?: Role; projectIds?: string[] },
): Promise<{ user: User; inviteLink: string }> {
  assertEmail(input.email);
  const role = input.role ?? 'member';
  assertRole(role);
  if (role === 'admin') throw new AuthError('bad_role', 'Invites are member|viewer — admins are promoted, not invited', 400);
  const projectIds = Array.isArray(input.projectIds) ? input.projectIds : [];
  for (const pid of projectIds) {
    if (!(await getProject(pid))) throw new AuthError('project_not_found', `Project not found: ${pid}`, 404);
  }
  const settings = await getAuthSettings();
  const email = input.email.trim().toLowerCase();
  let target = await getUserByEmail(email);
  if (!target) {
    const row: StoredUser = {
      id: randomId('u'),
      email,
      name: email.split('@')[0].slice(0, 40),
      role,
      status: 'invited',
      permissions: [],
      createdAt: nowIso(),
      lastActiveAt: null,
      passwordHash: null,
    };
    await writeUsers([...(await readUsers()), row]);
    target = row;
  }
  const members = await readMembers();
  const additions: ProjectMember[] = projectIds
    .filter((pid) => !members.some((m) => m.projectId === pid && m.userId === (target as StoredUser).id))
    .map((pid) => ({ projectId: pid, userId: (target as StoredUser).id, role, permissions: [], addedAt: nowIso(), addedBy: actor.id }));
  if (additions.length > 0) await writeMembers([...members, ...additions]);

  const token = randomBytes(24).toString('hex');
  const invites = await readInvites();
  const expiresAt = new Date(Date.now() + settings.inviteExpiryDays * 24 * 60 * 60 * 1000).toISOString();
  await writeInvites([
    ...invites.filter((i) => i.userId !== target.id),
    { token, userId: target.id, projectIds, expiresAt, createdAt: nowIso() },
  ]);
  return { user: publicUser(target), inviteLink: `/invite?token=${token}` };
}

/** Accept an invite — one-time use, sets name + password, activates. */
export async function acceptInvite(input: { token: string; name: string; password: string }): Promise<{ user: User; token: string }> {
  if (typeof input.token !== 'string' || !input.token) throw new AuthError('bad_token', 'Invite token required', 400);
  assertName(input.name);
  assertPassword(input.password);
  const invites = await readInvites();
  const invite = invites.find((i) => i.token === input.token);
  if (!invite) throw new AuthError('invite_not_found', 'Invite not found or already used', 404);
  if (invite.expiresAt < nowIso()) {
    await writeInvites(invites.filter((i) => i.token !== input.token));
    throw new AuthError('invite_expired', 'Invite expired — ask an admin for a new one', 410);
  }
  const users = await readUsers();
  const row = users.find((u) => u.id === invite.userId);
  if (!row) throw new AuthError('user_not_found', 'Invited user no longer exists', 404);
  const next = users.map((u) =>
    u.id === row.id
      ? { ...u, name: (input.name as string).trim(), passwordHash: hashPassword(input.password), status: 'active' as UserStatus, lastActiveAt: nowIso() }
      : u,
  );
  await writeUsers(next);
  await writeInvites(invites.filter((i) => i.token !== input.token));
  const updated = next.find((u) => u.id === row.id) ?? row;
  return { user: publicUser(updated), token: await signToken(row.id) };
}

// ─── RBAC `can()` (Docs/36 §3 + §7.1) ──────────────────────────────────────

/** Global admin-only capabilities (plus per-user `permissions[]` grants). */
const ADMIN_ONLY = new Set([
  'user:list',
  'user:create',
  'user:edit',
  'user:delete',
  'project:list:all',
  'project:delete',
  'provider:manage',
  'model:manage',
  'theme:manage',
  'config:manage',
  'agent:manage:all',
  'vault:manage',
  'usage:view:all',
  'auth:manage',
]);

/** What a project `member` gets by default (Docs/36 §3.2). */
const MEMBER_DEFAULTS = new Set([
  'project:view',
  'session:create',
  'session:list',
  'session:read',
  'session:write',
  'session:fork',
  'file:read',
  'file:write',
  'terminal:use',
  'browser:use',
  'git:write',
  'agent:create',
  'worktree:create',
]);

/** What a project `viewer` gets by default (read-only, Docs/36 §3.2). */
const VIEWER_DEFAULTS = new Set(['project:view', 'session:list', 'session:read', 'file:read']);

/**
 * RBAC check — admin always passes; per-user `permissions[]` grant;
 * project-scoped perms resolve via membership (or public visibility
 * for `project:view`); `project:create` follows the creation policy.
 */
export async function can(user: User, perm: string, projectId?: string): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.permissions.includes(perm)) return true;

  if (perm === 'project:create') {
    const settings = await getAuthSettings();
    if (settings.projectCreation === 'admin-only') return false;
    if (settings.projectCreation === 'members') return user.role === 'member';
    return true; // open — any authenticated user
  }

  if (!projectId) return false;
  const project = await getProject(projectId).catch(() => null);
  if (!project) return false;
  if (perm === 'project:view' && project.visibility === 'public') return true;
  const membership = await memberOf(projectId, user.id);
  if (!membership) return false;
  if (perm === 'project:edit') {
    if (project.ownerId === user.id) return true;
    if (membership.permissions.includes('project:edit')) return true;
    return false;
  }
  if (membership.permissions.includes(perm)) return true;
  const defaults = membership.role === 'member' ? MEMBER_DEFAULTS : VIEWER_DEFAULTS;
  return defaults.has(perm);
}

/** Projects visible to a user (membership + public; admins see all). */
export async function visibleProjects(user: User): Promise<Project[]> {
  const projects = await readProjects();
  if (user.role === 'admin') return projects;
  const members = await readMembers();
  const mine = new Set(members.filter((m) => m.userId === user.id).map((m) => m.projectId));
  return projects.filter((p) => mine.has(p.id) || p.visibility === 'public');
}
