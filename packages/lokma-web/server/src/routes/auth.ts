import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthError,
  acceptInvite,
  addMember,
  can,
  createProject,
  deleteProject,
  deleteUser,
  getAuthSettings,
  getProject,
  inviteUser,
  isBootstrapped,
  listMembers,
  listProjects,
  listUsers,
  loginUser,
  memberOf,
  patchProject,
  patchUser,
  registerFirstAdmin,
  removeMember,
  resetPassword,
  saveAuthSettings,
  userFromToken,
  visibleProjects,
  type User,
} from 'lokma-core';

/**
 * Auth + users + projects (Docs/36-AUTH-and-PERMISSIONS §8).
 * `POST /api/auth/register` seeds the first admin (no auth — fails
 * closed once a user exists); `POST /api/auth/login` sets the
 * httpOnly `lokma_token` cookie AND returns the token for
 * `Authorization: *** use (the web client stores it in
 * `localStorage["lokma-token"]`, the CLI passes `--token`).
 * Admin-only reads/writes 403 for member/viewer (the W6 acceptance
 * leg: a viewer PATCHing settings gets 403, not a silent pass).
 * Until bootstrapped the instance is single-user-open (Docs/36 §10).
 * All failures answer `{ code, message }` (never hashes or stacks).
 */

const COOKIE_NAME = 'lokma_token';

function authErr(reply: FastifyReply, e: unknown): unknown {
  if (e instanceof AuthError) return reply.status(e.status).send({ code: e.code, message: e.message });
  throw e;
}

/** Token from the httpOnly cookie first, Bearer fallback (CLI + web). */
function requestToken(req: FastifyRequest): string | null {
  const cookie = req.headers.cookie;
  if (typeof cookie === 'string') {
    for (const part of cookie.split(';')) {
      const idx = part.indexOf('=');
      if (idx > 0 && part.slice(0, idx).trim() === COOKIE_NAME) {
        const value = decodeURIComponent(part.slice(idx + 1).trim());
        if (value) return value;
      }
    }
  }
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  return null;
}

function setSessionCookie(reply: FastifyReply, token: string): void {
  // 7d httpOnly cookie matching the token TTL. Secure is nginx's job
  // (TLS terminates there); SameSite=Lax keeps top-level login working.
  reply.header(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
  );
}

function clearSessionCookie(reply: FastifyReply): void {
  reply.header('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Load the caller or 401 (also refreshes nothing — tokens are stateless). */
async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<User | null> {
  const user = await userFromToken(requestToken(req));
  if (!user) {
    reply.status(401).send({ code: 'unauthenticated', message: 'Not signed in' });
    return null;
  }
  return user;
}

/** Admin gate — 403 for member/viewer (Docs/36 §3.1, W6 acceptance leg). */
async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<User | null> {
  const user = await requireUser(req, reply);
  if (!user) return null;
  if (user.role !== 'admin' && !user.permissions.includes('*')) {
    reply.status(403).send({ code: 'forbidden', message: 'forbidden: requires admin' });
    return null;
  }
  return user;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // ─── Session ──────────────────────────────────────────────────────────

  app.post('/api/auth/register', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: unknown; name?: unknown; password?: unknown };
    try {
      if (await isBootstrapped()) {
        return reply.status(403).send({ code: 'auth_already_bootstrapped', message: 'Instance already has users — ask an admin for an invite' });
      }
      const { user, token } = await registerFirstAdmin({
        email: body.email as string,
        name: body.name as string,
        password: body.password as string,
      });
      setSessionCookie(reply, token);
      return { ok: true, user, token };
    } catch (e) {
      return authErr(reply, e);
    }
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
    try {
      const { user, token } = await loginUser(body.email as string, body.password as string);
      setSessionCookie(reply, token);
      return { ok: true, user, token };
    } catch (e) {
      return authErr(reply, e);
    }
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return reply;
    return { ok: true, user };
  });

  app.post('/api/auth/accept-invite', async (req, reply) => {
    const body = (req.body ?? {}) as { token?: unknown; name?: unknown; password?: unknown };
    try {
      const { user, token } = await acceptInvite({
        token: body.token as string,
        name: body.name as string,
        password: body.password as string,
      });
      setSessionCookie(reply, token);
      return { ok: true, user, token };
    } catch (e) {
      return authErr(reply, e);
    }
  });

  // ─── Instance policy (public read, admin write) ───────────────────────

  app.get('/api/auth/settings', async () => {
    const settings = await getAuthSettings();
    return { ok: true, settings, bootstrapped: await isBootstrapped() };
  });

  app.patch('/api/auth/settings', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return reply;
    try {
      const settings = await saveAuthSettings(req.body ?? {});
      return { ok: true, settings };
    } catch (e) {
      return authErr(reply, e);
    }
  });

  // ─── Users (admin only) ───────────────────────────────────────────────

  app.get('/api/users', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return reply;
    const users = await listUsers();
    return { users, count: users.length };
  });

  app.post('/api/users/invite', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return reply;
    const body = (req.body ?? {}) as { email?: unknown; role?: unknown; projectIds?: unknown };
    try {
      const { user, inviteLink } = await inviteUser(admin, {
        email: body.email as string,
        role: (body.role ?? 'member') as 'admin' | 'member' | 'viewer',
        projectIds: Array.isArray(body.projectIds) ? (body.projectIds as string[]) : [],
      });
      return { ok: true, user, inviteLink };
    } catch (e) {
      return authErr(reply, e);
    }
  });

  app.patch('/api/users/:id', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return reply;
    const { id } = req.params as { id: string };
    try {
      const user = await patchUser(id, admin, (req.body ?? {}) as Record<string, unknown>);
      return { ok: true, user };
    } catch (e) {
      return authErr(reply, e);
    }
  });

  app.delete('/api/users/:id', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return reply;
    const { id } = req.params as { id: string };
    try {
      await deleteUser(id);
      return { ok: true, id };
    } catch (e) {
      return authErr(reply, e);
    }
  });

  app.post('/api/users/:id/reset-password', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return reply;
    const { id } = req.params as { id: string };
    try {
      const { user, tempPassword } = await resetPassword(id);
      return { ok: true, user, tempPassword };
    } catch (e) {
      return authErr(reply, e);
    }
  });

  // ─── Projects ─────────────────────────────────────────────────────────

  app.get('/api/projects', async (req, reply) => {
    // Unbootstrapped single-user mode lists everything (no gates yet).
    if (!(await isBootstrapped())) return { projects: await listProjects() };
    const user = await requireUser(req, reply);
    if (!user) return reply;
    const projects = await visibleProjects(user);
    return { projects };
  });

  app.post('/api/projects', async (req, reply) => {
    const body = (req.body ?? {}) as { name?: unknown; cwd?: unknown; visibility?: unknown };
    // Single-user mode: the owner creates freely.
    if (!(await isBootstrapped())) {
      return reply
        .status(403)
        .send({ code: 'not_bootstrapped', message: 'Register the first admin before creating projects' });
    }
    const user = await requireUser(req, reply);
    if (!user) return reply;
    if (!(await can(user, 'project:create'))) {
      return reply.status(403).send({ code: 'forbidden', message: 'forbidden: missing project:create' });
    }
    try {
      const project = await createProject(user, {
        name: body.name as string,
        cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
        visibility: body.visibility as 'private' | 'public' | undefined,
      });
      return { ok: true, project };
    } catch (e) {
      return authErr(reply, e);
    }
  });

  app.get('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await isBootstrapped())) {
      const project = await getProject(id).catch(() => null);
      if (!project) return reply.status(404).send({ code: 'project_not_found', message: 'Project not found' });
      return { ok: true, project, members: await listMembers(id) };
    }
    const user = await requireUser(req, reply);
    if (!user) return reply;
    try {
      const project = await getProject(id);
      if (!project) return reply.status(404).send({ code: 'project_not_found', message: 'Project not found' });
      if (!(await can(user, 'project:view', id))) {
        return reply.status(403).send({ code: 'forbidden', message: 'forbidden: missing project:view' });
      }
      return { ok: true, project, members: await listMembers(id) };
    } catch (e) {
      return authErr(reply, e);
    }
  });

  app.patch('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await requireUser(req, reply);
    if (!user) return reply;
    try {
      const project = await getProject(id);
      if (!project) return reply.status(404).send({ code: 'project_not_found', message: 'Project not found' });
      const editor = user.role === 'admin' || project.ownerId === user.id || (await memberOf(id, user.id)) !== null;
      if (!editor || !(await can(user, 'project:edit', id))) {
        return reply.status(403).send({ code: 'forbidden', message: 'forbidden: missing project:edit' });
      }
      const updated = await patchProject(id, (req.body ?? {}) as Record<string, unknown>);
      return { ok: true, project: updated };
    } catch (e) {
      return authErr(reply, e);
    }
  });

  app.delete('/api/projects/:id', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return reply;
    const { id } = req.params as { id: string };
    try {
      await deleteProject(id);
      return { ok: true, id };
    } catch (e) {
      return authErr(reply, e);
    }
  });

  app.get('/api/projects/:id/members', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await requireUser(req, reply);
    if (!user) return reply;
    try {
      const project = await getProject(id);
      if (!project) return reply.status(404).send({ code: 'project_not_found', message: 'Project not found' });
      if (!(await can(user, 'project:view', id))) {
        return reply.status(403).send({ code: 'forbidden', message: 'forbidden: missing project:view' });
      }
      return { members: await listMembers(id) };
    } catch (e) {
      return authErr(reply, e);
    }
  });

  app.post('/api/projects/:id/members', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await requireUser(req, reply);
    if (!user) return reply;
    const body = (req.body ?? {}) as { userId?: unknown; role?: unknown };
    try {
      const project = await getProject(id);
      if (!project) return reply.status(404).send({ code: 'project_not_found', message: 'Project not found' });
      if (!(await can(user, 'project:edit', id))) {
        return reply.status(403).send({ code: 'forbidden', message: 'forbidden: missing project:edit' });
      }
      const member = await addMember(id, user, {
        userId: body.userId as string,
        role: (body.role ?? 'member') as 'member' | 'viewer',
      });
      return { ok: true, member };
    } catch (e) {
      return authErr(reply, e);
    }
  });

  app.delete('/api/projects/:id/members/:userId', async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const user = await requireUser(req, reply);
    if (!user) return reply;
    try {
      const project = await getProject(id);
      if (!project) return reply.status(404).send({ code: 'project_not_found', message: 'Project not found' });
      if (!(await can(user, 'project:edit', id))) {
        return reply.status(403).send({ code: 'forbidden', message: 'forbidden: missing project:edit' });
      }
      await removeMember(id, userId);
      return { ok: true, id: userId };
    } catch (e) {
      return authErr(reply, e);
    }
  });
}
