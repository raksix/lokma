import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { TODO_CLAIM_LEASE_MS, TodoSchema, type Todo } from '@lokma/shared';
import { readJson, writeAtomic } from '../utils/fs.js';

/**
 * Project todos with agent claim leases (REQ-062 Parça C, REQ-065).
 * One `~/.lokma/todos/<projectId>.json` file per project. Claim is a
 * single atomic file write (`writeAtomic` = tmp + rename): `open →
 * claimed` carries `claimedBy` + `leaseUntil` together, so two agents
 * racing the same todo cannot both win — the loser re-reads a live
 * lease and gets RED (`todo_claimed` + holder). Heartbeats extend the
 * lease; an expired lease auto-releases to `open` on next touch, so a
 * dead loop never orphans a todo. Same-session re-claim is idempotent
 * (extends the lease, keeps working).
 * File-backed like the auth store: corrupt rows are skipped, never fatal.
 */

const TODOS_DIR = join(homedir(), '.lokma', 'todos');

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const TODO_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export class TodoError extends Error {
  readonly code: string;
  readonly status: number;
  readonly holder?: { sessionId: string; userId: string; leaseUntil: number | null };

  constructor(code: string, message: string, status: number, holder?: TodoError['holder']) {
    super(message);
    this.name = 'TodoError';
    this.code = code;
    this.status = status;
    this.holder = holder;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function assertProjectId(projectId: unknown): asserts projectId is string {
  if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new TodoError('bad_project_id', 'Invalid project id', 400);
  }
}

function assertTodoId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !TODO_ID_PATTERN.test(id)) {
    throw new TodoError('bad_todo_id', 'Invalid todo id', 400);
  }
}

function todosPath(projectId: string): string {
  return join(TODOS_DIR, `${projectId}.json`);
}

async function readTodos(projectId: string): Promise<Todo[]> {
  assertProjectId(projectId);
  const rows = await readJson<unknown[]>(todosPath(projectId), (r) => (Array.isArray(r) ? r : []), []);
  const out: Todo[] = [];
  for (const row of rows) {
    try {
      out.push(TodoSchema.parse(row));
    } catch {
      // Skip corrupt rows — the list stays readable.
    }
  }
  return out;
}

async function writeTodos(projectId: string, rows: Todo[]): Promise<void> {
  await writeAtomic(todosPath(projectId), JSON.stringify(rows, null, 2));
}

/** A lease counts as live only while its deadline is in the future. */
export function leaseLive(todo: Todo, now = Date.now()): boolean {
  return todo.status === 'claimed' && typeof todo.leaseUntil === 'number' && todo.leaseUntil > now;
}

/**
 * Sweep expired claims back to `open` (in-memory — the caller persists
 * when anything changed). Returns true when the list was touched.
 */
function sweepExpired(rows: Todo[]): boolean {
  const now = Date.now();
  let touched = false;
  for (const todo of rows) {
    if (todo.status === 'claimed' && !leaseLive(todo, now)) {
      todo.status = 'open';
      todo.claimedBy = null;
      todo.leaseUntil = null;
      todo.updatedAt = nowIso();
      touched = true;
    }
  }
  return touched;
}

export type ClaimIdentity = { sessionId: string; userId: string };

function assertIdentity(identity: ClaimIdentity): void {
  if (!identity || typeof identity.sessionId !== 'string' || !identity.sessionId) {
    throw new TodoError('bad_session', 'claim needs a sessionId', 400);
  }
  if (typeof identity.userId !== 'string' || !identity.userId) {
    throw new TodoError('bad_user', 'claim needs a userId', 400);
  }
}

export async function listTodos(projectId: string): Promise<Todo[]> {
  const rows = await readTodos(projectId);
  if (sweepExpired(rows)) await writeTodos(projectId, rows);
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export async function createTodo(projectId: string, title: string): Promise<Todo> {
  const rows = await readTodos(projectId);
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) {
    throw new TodoError('bad_title', 'title must be 1-200 chars', 400);
  }
  const now = nowIso();
  const todo: Todo = {
    id: `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    projectId,
    title: title.trim(),
    status: 'open',
    claimedBy: null,
    leaseUntil: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  await writeTodos(projectId, [...rows, todo]);
  return todo;
}

/**
 * Claim a todo for one agent session. Idempotent for the holder session
 * (extends the lease); RED 409 `todo_claimed` for anyone else while the
 * lease is live; takes over cleanly once the lease expired (swept first).
 */
export async function claimTodo(
  projectId: string,
  id: string,
  identity: ClaimIdentity,
  leaseMs = TODO_CLAIM_LEASE_MS,
): Promise<Todo> {
  assertTodoId(id);
  assertIdentity(identity);
  const rows = await readTodos(projectId);
  sweepExpired(rows);
  const todo = rows.find((t) => t.id === id);
  if (!todo) throw new TodoError('todo_not_found', 'Todo not found', 404);
  if (todo.status === 'done') throw new TodoError('todo_done', 'Todo is already done', 409);
  if (todo.status === 'claimed' && todo.claimedBy && leaseLive(todo)) {
    if (todo.claimedBy.sessionId === identity.sessionId) {
      // Same session re-claims its own work — extend, keep going.
      todo.leaseUntil = Date.now() + leaseMs;
      todo.updatedAt = nowIso();
      await writeTodos(projectId, rows);
      return todo;
    }
    throw new TodoError(
      'todo_claimed',
      `Todo is being worked on in session ${todo.claimedBy.sessionId}`,
      409,
      { sessionId: todo.claimedBy.sessionId, userId: todo.claimedBy.userId, leaseUntil: todo.leaseUntil },
    );
  }
  const now = nowIso();
  todo.status = 'claimed';
  todo.claimedBy = { sessionId: identity.sessionId, userId: identity.userId, claimedAt: now };
  todo.leaseUntil = Date.now() + leaseMs;
  todo.updatedAt = now;
  await writeTodos(projectId, rows);
  return todo;
}

/**
 * Extend a live claim (agent loop heartbeat, ~60s). Only the holder
 * session extends; anything else is a no-op false (never an error, so a
 * racing heartbeat cannot crash a turn).
 */
export async function heartbeatTodo(
  projectId: string,
  id: string,
  sessionId: string,
  leaseMs = TODO_CLAIM_LEASE_MS,
): Promise<boolean> {
  assertTodoId(id);
  const rows = await readTodos(projectId);
  const todo = rows.find((t) => t.id === id);
  if (!todo || todo.status !== 'claimed' || todo.claimedBy?.sessionId !== sessionId) return false;
  todo.leaseUntil = Date.now() + leaseMs;
  todo.updatedAt = nowIso();
  await writeTodos(projectId, rows);
  return true;
}

/**
 * Extend every live claim held by one session across ALL projects.
 * The agent loop calls this once per turn — one cheap scan, no project
 * id needed, so the loop never has to know which project a todo came from.
 */
export async function heartbeatSession(sessionId: string, leaseMs = TODO_CLAIM_LEASE_MS): Promise<number> {
  if (typeof sessionId !== 'string' || !sessionId) return 0;
  let names: string[];
  try {
    names = await readdir(TODOS_DIR);
  } catch {
    return 0;
  }
  let extended = 0;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const projectId = name.slice(0, -'.json'.length);
    try {
      const rows = await readTodos(projectId);
      let touched = false;
      for (const todo of rows) {
        if (todo.status === 'claimed' && todo.claimedBy?.sessionId === sessionId && leaseLive(todo)) {
          todo.leaseUntil = Date.now() + leaseMs;
          todo.updatedAt = nowIso();
          touched = true;
          extended += 1;
        }
      }
      if (touched) await writeTodos(projectId, rows);
    } catch {
      // One bad project file never breaks the heartbeat sweep.
    }
  }
  return extended;
}

export async function completeTodo(projectId: string, id: string, sessionId?: string): Promise<Todo> {
  assertTodoId(id);
  const rows = await readTodos(projectId);
  sweepExpired(rows);
  const todo = rows.find((t) => t.id === id);
  if (!todo) throw new TodoError('todo_not_found', 'Todo not found', 404);
  if (todo.status === 'claimed' && sessionId && todo.claimedBy?.sessionId !== sessionId && leaseLive(todo)) {
    throw new TodoError('todo_claimed', `Todo is being worked on in session ${todo.claimedBy?.sessionId}`, 409, {
      sessionId: todo.claimedBy?.sessionId ?? '',
      userId: todo.claimedBy?.userId ?? '',
      leaseUntil: todo.leaseUntil,
    });
  }
  const now = nowIso();
  todo.status = 'done';
  todo.completedAt = now;
  todo.updatedAt = now;
  todo.leaseUntil = null;
  await writeTodos(projectId, rows);
  return todo;
}

/** Release a claim back to `open` (holder session, or anyone once expired). */
export async function releaseTodo(projectId: string, id: string, sessionId?: string): Promise<Todo> {
  assertTodoId(id);
  const rows = await readTodos(projectId);
  sweepExpired(rows);
  const todo = rows.find((t) => t.id === id);
  if (!todo) throw new TodoError('todo_not_found', 'Todo not found', 404);
  if (todo.status === 'claimed' && sessionId && todo.claimedBy?.sessionId !== sessionId && leaseLive(todo)) {
    throw new TodoError('todo_claimed', `Todo is being worked on in session ${todo.claimedBy?.sessionId}`, 409, {
      sessionId: todo.claimedBy?.sessionId ?? '',
      userId: todo.claimedBy?.userId ?? '',
      leaseUntil: todo.leaseUntil,
    });
  }
  todo.status = 'open';
  todo.claimedBy = null;
  todo.leaseUntil = null;
  todo.updatedAt = nowIso();
  await writeTodos(projectId, rows);
  return todo;
}

export async function deleteTodo(projectId: string, id: string): Promise<void> {
  assertTodoId(id);
  const rows = await readTodos(projectId);
  if (!rows.some((t) => t.id === id)) throw new TodoError('todo_not_found', 'Todo not found', 404);
  await writeTodos(
    projectId,
    rows.filter((t) => t.id !== id),
  );
}
