import type { TodoView } from '@/lib/api';

/**
 * TodoPane pure helpers (REQ-062 Parça C, REQ-065).
 * No React, no fetch — every function is covered by `todos.test.ts`
 * (`bun src/components/todos/todos.test.ts`).
 */

export type TodoGroup = 'open' | 'mine' | 'others' | 'done';

/** Group label for the board sections. */
export function groupLabel(group: TodoGroup): string {
  if (group === 'open') return 'Open';
  if (group === 'mine') return 'Claimed by me';
  if (group === 'others') return 'In progress';
  return 'Done';
}

/** Split a board into its four sections for one viewer session. */
export function groupTodos(
  todos: TodoView[],
  sessionId: string | null,
): Record<TodoGroup, TodoView[]> {
  const out: Record<TodoGroup, TodoView[]> = { open: [], mine: [], others: [], done: [] };
  for (const todo of todos) {
    if (todo.status === 'done') {
      out.done.push(todo);
    } else if (todo.status === 'claimed') {
      if (sessionId && todo.claimedBy?.sessionId === sessionId) out.mine.push(todo);
      else out.others.push(todo);
    } else {
      out.open.push(todo);
    }
  }
  return out;
}

/** Short holder label (`sess_abc…` + user) for a claimed row. */
export function holderLabel(todo: TodoView): string {
  const holder = todo.claimedBy;
  if (!holder) return 'unclaimed';
  const short = holder.sessionId.length > 14 ? `${holder.sessionId.slice(0, 14)}…` : holder.sessionId;
  return `${short} · ${holder.userId}`;
}

/** Milliseconds until the lease drops (<=0 = releasable now). */
export function leaseLeftMs(todo: TodoView, now = Date.now()): number {
  if (todo.status !== 'claimed' || typeof todo.leaseUntil !== 'number') return 0;
  return todo.leaseUntil - now;
}

/** Human countdown for a live lease (`4m 12s`, `38s`, `expired`). */
export function leaseLabel(todo: TodoView, now = Date.now()): string {
  const left = leaseLeftMs(todo, now);
  if (left <= 0) return 'expired';
  const seconds = Math.floor(left / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

/** Prompt staged into a fresh session by the "Do with AI" button. */
export function todoPrompt(todo: TodoView, projectName: string): string {
  return `Work on this project todo (claim it with claim_todo first, complete it with complete_todo when done):\n\nProject: ${projectName}\nTodo: ${todo.title}\nTodo id: ${todo.id} (projectId: ${todo.projectId})`;
}

/** Client mirror of the server title rule (1-200 chars). */
export function validateTitle(title: string): string | null {
  if (!title.trim() || title.trim().length > 200) return 'Title must be 1-200 chars';
  return null;
}
