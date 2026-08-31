/**
 * Curator — proposes new skills after complex tasks, patches on second use.
 * Stub for Phase 0; full logic in Phase 2 (skill_manage(patch) + .usage.json telemetry).
 * See Docs/27 §7 and Docs/02 decision log.
 */

export type CuratorDecision = {
  shouldPropose: boolean;
  reason?: string;
};

export function shouldProposeSkill(_opts: { toolCalls: number; durationMs: number }): CuratorDecision {
  // Phase 0: never auto-propose — manual skill creation only
  return { shouldPropose: false };
}

export async function recordUsage(_skillId: string, _event: 'view' | 'use' | 'patch'): Promise<void> {
  // Phase 1: write to ~/.lokma/skills/.usage.json
}
