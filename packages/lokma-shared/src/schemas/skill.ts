import { z } from 'zod';

/**
 * Skill descriptor — one SKILL.md per skill.
 * Description's first 57 chars MUST be \"Use when <trigger>.\" — router key.
 * See Docs/27-SKILLS-auto-discovery §2.
 */
export const SkillSchema = z.object({
  id: z.string().min(1), // e.g. lokma-core/git-workflow
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(1024), // first 57 chars is trigger
  category: z.string().min(1),
  path: z.string().min(1), // absolute path to SKILL.md
  linked_files: z.array(z.string()).default([]), // auto-discovered references/*
});

export type Skill = z.infer<typeof SkillSchema>;

/** Payload for skill_view progressive disclosure. */
export const SkillViewSchema = z.object({
  skill: SkillSchema,
  content: z.string(), // SKILL.md body
  linked_files: z.record(z.string(), z.string()).optional(), // path → content when file_path given
});

export type SkillView = z.infer<typeof SkillViewSchema>;

/**
 * Curator telemetry — per-skill counters in `~/.lokma/skills/.usage.json`.
 * Same shape as Hermes (`use_count`/`view_count`/`patch_count`).
 * See Docs/27 §7.5.
 */
export const SkillUsageSchema = z.object({
  use_count: z.number().int().nonnegative().default(0),
  view_count: z.number().int().nonnegative().default(0),
  patch_count: z.number().int().nonnegative().default(0),
  last_used: z.string().optional(),
});

export type SkillUsage = z.infer<typeof SkillUsageSchema>;

/** skill id → counters (missing entries mean zero activity). */
export const SkillUsageMapSchema = z.record(z.string(), SkillUsageSchema);

export type SkillUsageMap = z.infer<typeof SkillUsageMapSchema>;
