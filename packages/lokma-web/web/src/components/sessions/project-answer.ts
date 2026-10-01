/**
 * project-answer.ts — REQ-182: the shell's decision when the agent-open
 * project modal answers.
 *
 * The modal only reports 'done' (the user pressed Open) or 'cancelled' (the
 * user dismissed it). What the shell does with that answer is pure and lives
 * here so the cancel path is unit-testable without a DOM (same pattern as
 * submit-guard / group-storage): a cancelled answer ONLY acks the agent's
 * wait — nothing is revealed, no session switches; a done answer acks AND
 * reveals the project's group, then lands the user in the fresh session
 * (REQ-145 immediacy, no extra clicks).
 *
 * A null pending (the modal was already answered) makes every later call a
 * no-op: an Open press and a queued dismiss can both land, and the first
 * answer wins.
 */

export type AgentProjectPending = {
  actionId: string;
  projectId: string;
  projectName: string;
  cwd: string;
  targetSessionId: string;
};

export type AgentProjectAnswer = {
  /** The ack that resolves the agent's wait (project_ack frame). */
  actionId: string;
  outcome: 'done' | 'cancelled';
  /** Reveal this project's group in the sidebar — done only. */
  expandProjectId: string | null;
  /** Land the user in this session — done only. */
  switchSessionId: string | null;
};

export function planProjectAnswer(
  pending: AgentProjectPending | null,
  outcome: 'done' | 'cancelled',
): AgentProjectAnswer | null {
  if (!pending) return null;
  if (outcome === 'cancelled') {
    return { actionId: pending.actionId, outcome, expandProjectId: null, switchSessionId: null };
  }
  return {
    actionId: pending.actionId,
    outcome,
    expandProjectId: pending.projectId,
    switchSessionId: pending.targetSessionId,
  };
}
