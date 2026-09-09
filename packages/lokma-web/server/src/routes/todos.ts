import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  TodoError,
  can,
  claimTodo,
  completeTodo,
  createTodo,
  deleteTodo,
  getProject,
  heartbeatTodo,
  listTodos,
  loginGateActive,
  releaseTodo,
  userFromToken,
  type User,
} from '@lokma/core';
import { requestToken } from './auth.js';

/**
 * Project todos + agent claims (REQ-062 Parça C, REQ-065, Docs/36 §11).
 * `GET/POST /api/projects/:id/todos` — board list + create (needs
 * `project:view`; unbootstrapped instances stay open).
 * `POST /api/projects/:id/todos/:todoId/claim` — atomic open→claimed;
 * a live чужой lease answers 409 `todo_claimed` + holder (never a
 * silent double-take). `heartbeat` extends the holder lease;
 * `complete`/`release` finish or free the todo; `DELETE` removes it.
 * All failures answer `{ code, message }` (+ `holder` on 409).
 */

function todoErr(reply: FastifyReply, e: unknown): unknown {
  if (e instanceof TodoError) {
    const body: Record<string, unknown> = { code: e.code, message: e.message };
    if (e.holder) body.holder = e.holder;
    return reply.status(e.status).send(body);
  }
  throw e;
}

async function todoUser(req: FastifyRequest, reply: FastifyReply): Promise<User | null | undefined> {
  if (!(await loginGateActive())) return null;
  const user = await userFromToken(requestToken(req));
  if (!user) {
    reply.status(401).send({ code: 'unauthenticated', message: 'Not signed in' });
    return undefined;
  }
  return user;
}

async function todoProject(req: FastifyRequest, reply: FastifyReply, user: User | null): Promise<string | undefined> {
  const { id } = req.params as { id: string };
  try {
    const project = await getProject(id);
    if (!project) {
      reply.status(404).send({ code: 'project_not_found', message: 'Project not found' });
      return undefined;
    }
    if (user && !(await can(user, 'project:view', id))) {
      reply.status(403).send({ code: 'forbidden', message: 'forbidden: missing project:view' });
      return undefined;
    }
    return id;
  } catch {
    reply.status(400).send({ code: 'bad_project_id', message: 'Invalid project id' });
    return undefined;
  }
}

export async function todoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects/:id/todos', async (req, reply) => {
    const user = await todoUser(req, reply);
    if (user === undefined) return reply;
    const projectId = await todoProject(req, reply, user);
    if (!projectId) return reply;
    try {
      const todos = await listTodos(projectId);
      return { todos, count: todos.length };
    } catch (e) {
      return todoErr(reply, e);
    }
  });

  app.post('/api/projects/:id/todos', async (req, reply) => {
    const user = await todoUser(req, reply);
    if (user === undefined) return reply;
    const projectId = await todoProject(req, reply, user);
    if (!projectId) return reply;
    const body = (req.body ?? {}) as { title?: unknown };
    try {
      const todo = await createTodo(projectId, body.title as string);
      return { ok: true, todo };
    } catch (e) {
      return todoErr(reply, e);
    }
  });

  app.post('/api/projects/:id/todos/:todoId/claim', async (req, reply) => {
    const user = await todoUser(req, reply);
    if (user === undefined) return reply;
    const projectId = await todoProject(req, reply, user);
    if (!projectId) return reply;
    const { todoId } = req.params as { todoId: string };
    const body = (req.body ?? {}) as { sessionId?: unknown };
    if (typeof body.sessionId !== 'string' || !body.sessionId) {
      return reply.status(400).send({ code: 'bad_session', message: 'POST needs { sessionId }' });
    }
    try {
      const todo = await claimTodo(projectId, todoId, { sessionId: body.sessionId, userId: user?.id ?? 'agent' });
      return { ok: true, todo };
    } catch (e) {
      return todoErr(reply, e);
    }
  });

  app.post('/api/projects/:id/todos/:todoId/heartbeat', async (req, reply) => {
    const user = await todoUser(req, reply);
    if (user === undefined) return reply;
    const projectId = await todoProject(req, reply, user);
    if (!projectId) return reply;
    const { todoId } = req.params as { todoId: string };
    const body = (req.body ?? {}) as { sessionId?: unknown };
    if (typeof body.sessionId !== 'string' || !body.sessionId) {
      return reply.status(400).send({ code: 'bad_session', message: 'POST needs { sessionId }' });
    }
    try {
      const extended = await heartbeatTodo(projectId, todoId, body.sessionId);
      return { ok: true, extended };
    } catch (e) {
      return todoErr(reply, e);
    }
  });

  app.post('/api/projects/:id/todos/:todoId/complete', async (req, reply) => {
    const user = await todoUser(req, reply);
    if (user === undefined) return reply;
    const projectId = await todoProject(req, reply, user);
    if (!projectId) return reply;
    const { todoId } = req.params as { todoId: string };
    const body = (req.body ?? {}) as { sessionId?: unknown };
    try {
      const todo = await completeTodo(projectId, todoId, typeof body.sessionId === 'string' ? body.sessionId : undefined);
      return { ok: true, todo };
    } catch (e) {
      return todoErr(reply, e);
    }
  });

  app.post('/api/projects/:id/todos/:todoId/release', async (req, reply) => {
    const user = await todoUser(req, reply);
    if (user === undefined) return reply;
    const projectId = await todoProject(req, reply, user);
    if (!projectId) return reply;
    const { todoId } = req.params as { todoId: string };
    const body = (req.body ?? {}) as { sessionId?: unknown };
    try {
      const todo = await releaseTodo(projectId, todoId, typeof body.sessionId === 'string' ? body.sessionId : undefined);
      return { ok: true, todo };
    } catch (e) {
      return todoErr(reply, e);
    }
  });

  app.delete('/api/projects/:id/todos/:todoId', async (req, reply) => {
    const user = await todoUser(req, reply);
    if (user === undefined) return reply;
    const projectId = await todoProject(req, reply, user);
    if (!projectId) return reply;
    const { todoId } = req.params as { todoId: string };
    try {
      await deleteTodo(projectId, todoId);
      return { ok: true, id: todoId };
    } catch (e) {
      return todoErr(reply, e);
    }
  });
}
