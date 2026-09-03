/**
 * Agent lifecycle events — tiny in-process pub/sub for the orchestration
 * wave (W4-14). Registry writes stay synchronous and durable; listeners
 * (the WS fan-out in `lokma-server`) only observe. A throwing listener
 * must never break a registry write, so dispatch is guarded per listener.
 * Cross-process delivery (CLI mutating while web watches) is out of scope
 * here — panes refresh on mount and after their own mutations for that.
 * See Docs/30-AGENT-SYSTEM §5, §12
 */

/** Lifecycle transitions worth broadcasting to live panes. */
export type AgentLifecycleAction =
  | 'created'
  | 'paused'
  | 'resumed'
  | 'killed'
  | 'forked'
  | 'cloned'
  | 'deleted';

/**
 * One lifecycle event. `state` is the agent's new registry state, except
 * `deleted` (the row is gone — panes drop it instead of merging).
 */
export type AgentLifecycleEvent = {
  agentId: string;
  state: string;
  action: AgentLifecycleAction;
};

export type AgentEventListener = (ev: AgentLifecycleEvent) => void;

const listeners = new Set<AgentEventListener>();

/** Subscribe to lifecycle events. Returns an unsubscribe function. */
export function onAgentEvent(fn: AgentEventListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Broadcast one event to all subscribers (never throws into the caller). */
export function emitAgentEvent(ev: AgentLifecycleEvent): void {
  for (const fn of [...listeners]) {
    try {
      fn(ev);
    } catch {
      // A listener must never break registry writes — skip the faulty one.
    }
  }
}
