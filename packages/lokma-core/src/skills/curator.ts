import { readFile } from 'node:fs/promises';
import { SkillUsageMapSchema, type SkillUsageMap } from 'lokma-shared';
import { expandHome, writeAtomic } from '../utils/fs.js';

/**
 * Curator — proposes new skills after complex tasks, patches on second use.
 * Usage telemetry is REAL: per-skill `use_count`/`view_count`/`patch_count`
 * in `~/.lokma/skills/.usage.json` (same shape as Hermes).
 * Auto-propose stays a stub until the agent loop lands (Phase 1).
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

export type SkillUsageEvent = 'view' | 'use' | 'patch';

/** Telemetry file — one JSON object, skill id → counters. */
export const SKILL_USAGE_PATH = '~/.lokma/skills/.usage.json';

/** Read the telemetry map; corrupt/missing files read as empty (never throw). */
export async function readUsage(): Promise<SkillUsageMap> {
  try {
    const raw = await readFile(expandHome(SKILL_USAGE_PATH), 'utf-8');
    const parsed = SkillUsageMapSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** Increment one counter for a skill (creates the file on first use). */
export async function recordUsage(skillId: string, event: SkillUsageEvent): Promise<void> {
  const map = await readUsage();
  const cur = map[skillId] ?? { use_count: 0, view_count: 0, patch_count: 0 };
  if (event === 'view') cur.view_count += 1;
  else if (event === 'use') {
    cur.use_count += 1;
    cur.last_used = new Date().toISOString();
  } else cur.patch_count += 1;
  map[skillId] = cur;
  await writeAtomic(SKILL_USAGE_PATH, JSON.stringify(map, null, 2));
}
