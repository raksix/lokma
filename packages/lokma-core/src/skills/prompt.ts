import type { Skill } from 'lokma-shared';

/**
 * Build <available_skills> prompt block — injected every turn.
 * Mirrors Hermes prompt_builder.py:build_skills_system_prompt().
 * See Docs/27 §4: cheap index + LLM description matching, no embeddings.
 */

export function buildSkillsSystemPrompt(skills: Skill[]): string {
  if (skills.length === 0) return '';

  const lines = skills.map((s) => `  ${s.id}: ${s.description}`);
  return [
    '<available_skills>',
    ...lines,
    '</available_skills>',
    '',
    'Before replying, scan the skills above. If a skill matches or is even partially relevant to the task,',
    'you MUST load it with skill_view(name) and follow its instructions. Err on the side of loading.',
    'Skills contain exact commands, pitfalls, and verification steps.',
  ].join('\n');
}
