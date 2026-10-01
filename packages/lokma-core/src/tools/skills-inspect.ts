import { z } from 'zod';
import { SkillError, patchSkill, readSkillFile, readSkillView } from '../skills/registry.js';
import type { ToolDefinition } from './registry.js';

/**
 * Skills tool family (REQ-181 wave 2) — the agent reads and edits skills
 * through the SAME registry the Skills surface uses: progressive disclosure
 * (`readSkillView` for SKILL.md, `readSkillFile` for one linked reference —
 * both jailed to the skill directory) and the curator patch (exact
 * single-occurrence `old_string` -> `new_string`). Registry failures answer
 * as `{ ok: false, code, message }`; there is no second implementation.
 */

const SkillViewInput = z.object({
  /** Skill id or name, e.g. `lokma/commit-atomic`. */
  id: z.string().min(1).max(120),
  /** Linked reference to load instead of SKILL.md, e.g. `references/x.md`. */
  file: z.string().min(1).max(300).optional(),
});

const SkillPatchInput = z.object({
  id: z.string().min(1).max(120),
  /** Exact text to replace — must occur exactly once in SKILL.md. */
  old_string: z.string().min(1).max(64 * 1024),
  new_string: z.string().max(64 * 1024),
});

export const SKILLS_TOOL_NAMES = ['skill_view', 'skill_patch'] as const;

export function buildSkillTools(): ToolDefinition[] {
  return [
    {
      name: 'skill_view',
      description:
        "Read a skill's SKILL.md body plus its metadata and linked files, or one linked reference file when `file` is given.",
      inputSchema: SkillViewInput,
      readOnly: true,
      maxResultSizeChars: 20_000,
      handler: async (input) => {
        const { id, file } = input as z.infer<typeof SkillViewInput>;
        try {
          if (file) {
            const res = await readSkillFile(id, file);
            return { ok: true, id, file: res.path, content: res.content };
          }
          const { skill, content } = await readSkillView(id);
          return {
            ok: true,
            id: skill.id,
            name: skill.name,
            description: skill.description,
            category: skill.category,
            linked_files: skill.linked_files,
            content,
          };
        } catch (e) {
          if (e instanceof SkillError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
    {
      name: 'skill_patch',
      description:
        "Edit a skill's SKILL.md through the curator: one exact old_string -> new_string replacement; zero or ambiguous matches are refused.",
      inputSchema: SkillPatchInput,
      readOnly: false,
      maxResultSizeChars: 4_000,
      handler: async (input) => {
        const { id, old_string, new_string } = input as z.infer<typeof SkillPatchInput>;
        try {
          const { skill, bytes } = await patchSkill(id, old_string, new_string);
          return { ok: true, id: skill.id, name: skill.name, bytes };
        } catch (e) {
          if (e instanceof SkillError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
  ];
}
