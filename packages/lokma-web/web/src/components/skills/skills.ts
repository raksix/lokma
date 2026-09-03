import type { SkillInfo, SkillUsage } from '@/lib/api';

/**
 * Pure helpers for the SkillsPane (W4-16). No mocks: every row renders a
 * real `registry.scan()` entry, every count a real `.usage.json` counter.
 */

export type SkillSource = 'bundled' | 'user';

export type NormalizedSkill = {
  id: string;
  name: string;
  description: string;
  category: string;
  path: string;
  linked_files: string[];
  source: SkillSource;
};

/** Zero-activity counters for skills with no `.usage.json` entry yet. */
export const EMPTY_USAGE: SkillUsage = { use_count: 0, view_count: 0, patch_count: 0 };

/**
 * Registry source from the absolute SKILL.md path: `~/.lokma/skills`
 * entries are user/hub installs, everything else ships with the repo.
 */
export function sourceOf(skillPath: string): SkillSource {
  return skillPath.includes('.lokma/skills') ? 'user' : 'bundled';
}

/** Normalize one raw registry row (drops malformed rows → null). */
export function normalizeSkill(raw: unknown): NormalizedSkill | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id) return null;
  const path = typeof row.path === 'string' ? row.path : '';
  const linked = Array.isArray(row.linked_files)
    ? row.linked_files.filter((f): f is string => typeof f === 'string')
    : [];
  return {
    id: row.id,
    name: typeof row.name === 'string' && row.name ? row.name : row.id,
    description: typeof row.description === 'string' ? row.description : '',
    category: typeof row.category === 'string' && row.category ? row.category : 'general',
    path,
    linked_files: linked,
    source: sourceOf(path),
  };
}

export function normalizeSkills(raw: unknown): NormalizedSkill[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedSkill[] = [];
  for (const row of raw) {
    const skill = normalizeSkill(row);
    if (skill) out.push(skill);
  }
  return out;
}

/** Live search over name + id + description + category (same rhythm as vault). */
export function filterSkills(skills: NormalizedSkill[], query: string): NormalizedSkill[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q),
  );
}

/** Total activity for the "used N · viewed M · patched K" row badge. */
export function activityOf(usage: SkillUsage | undefined): number {
  if (!usage) return 0;
  return usage.use_count + usage.view_count + usage.patch_count;
}

export function formatUsage(usage: SkillUsage | undefined): string {
  const u = usage ?? EMPTY_USAGE;
  return `used ${u.use_count} · viewed ${u.view_count} · patched ${u.patch_count}`;
}

/**
 * `<available_skills>` injection preview — the exact block the agent loop
 * injects every turn (Docs/27 §7.2), built from the live registry rows.
 */
export function buildAvailableSkills(skills: NormalizedSkill[], max = 12): string {
  const lines = skills.slice(0, Math.max(0, max)).map((s) => `  ${s.id}: ${s.description}`);
  return ['<available_skills>', ...lines, '</available_skills>'].join('\n');
}

export type PatchForm = { old_string: string; new_string: string };

export const emptyPatchForm: PatchForm = { old_string: '', new_string: '' };

/** Client-side guard mirroring the server's `bad_patch` rules. */
export function validatePatchForm(form: PatchForm): string | null {
  if (!form.old_string) return 'old_string must not be empty';
  if (typeof form.new_string !== 'string') return 'new_string must be a string';
  if (form.old_string === form.new_string) return 'old_string and new_string are identical';
  return null;
}

/** Type guard for the raw `SkillInfo` rows the API returns. */
export function isSkillInfo(raw: unknown): raw is SkillInfo {
  return normalizeSkill(raw) !== null;
}
