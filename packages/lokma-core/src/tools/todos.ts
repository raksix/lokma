import { z } from 'zod';
import { claimTodo, completeTodo, listTodos } from '../todos/store.js';
import type { ToolDefinition } from './registry.js';

/**
 * Todo agent tools (REQ-062 Parça C, REQ-065) — the claim discipline for
 * multi-agent projects. `claim_todo` before starting work on a shared
 * todo (RED when another live session holds it — pick something else),
 * `complete_todo` when done, `list_todos` to see the board. Heartbeats
 * are NOT a tool — the agent loop extends the session's claims once per
 * turn (`heartbeatSession`), so leases survive long runs without the
 * model spending turns on keep-alive calls.
 * `projectId` rides each call because the loop is cwd-scoped while todos
 * are project-scoped; the server validates project visibility per call.
 */

const ProjectIdInput = { projectId: z.string().min(1).max(64) };

const ListTodosInput = z.object({ ...ProjectIdInput });

const ClaimTodoInput = z.object({
  ...ProjectIdInput,
  todoId: z.string().min(1).max(64),
});

const CompleteTodoInput = z.object({
  ...ProjectIdInput,
  todoId: z.string().min(1).max(64),
});

export type TodoToolsOpts = {
  /** Owning loop session — recorded as the claim holder. */
  sessionId: string;
  /** Claiming user (agent runs without one — recorded as-is). */
  userId?: string;
};

/**
 * Build the three todo tool definitions bound to one loop session.
 * Claim/complete failures come back as `{ ok: false, code, message }`
 * result objects (never thrown) so the model reads the RED and moves on
 * instead of dying on an exception mid-turn.
 */
export function buildTodoTools(opts: TodoToolsOpts): ToolDefinition[] {
  const identity = { sessionId: opts.sessionId, userId: opts.userId ?? 'agent' };
  return [
    {
      name: 'list_todos',
      description: 'List the project todo board (open/claimed/done with holders)',
      inputSchema: ListTodosInput,
      handler: async (input) => {
        const { projectId } = input as z.infer<typeof ListTodosInput>;
        const todos = await listTodos(projectId);
        return { todos, count: todos.length };
      },
    },
    {
      name: 'claim_todo',
      description: 'Claim an open todo before working on it (fails when another live session holds it)',
      inputSchema: ClaimTodoInput,
      handler: async (input) => {
        const { projectId, todoId } = input as z.infer<typeof ClaimTodoInput>;
        try {
          const todo = await claimTodo(projectId, todoId, identity);
          return { ok: true, todo };
        } catch (e) {
          const err = e as { code?: string; message?: string; holder?: unknown };
          return { ok: false, code: err.code ?? 'claim_failed', message: err.message ?? String(e), holder: err.holder ?? null };
        }
      },
    },
    {
      name: 'complete_todo',
      description: 'Mark a todo done when its work is finished',
      inputSchema: CompleteTodoInput,
      handler: async (input) => {
        const { projectId, todoId } = input as z.infer<typeof CompleteTodoInput>;
        try {
          const todo = await completeTodo(projectId, todoId, opts.sessionId);
          return { ok: true, todo };
        } catch (e) {
          const err = e as { code?: string; message?: string; holder?: unknown };
          return { ok: false, code: err.code ?? 'complete_failed', message: err.message ?? String(e), holder: err.holder ?? null };
        }
      },
    },
  ];
}

/** Names only — cheap index for the `<available_tools>` prompt section. */
export const TODO_TOOL_NAMES = ['list_todos', 'claim_todo', 'complete_todo'] as const;
