import { z } from 'zod';
import {
  DESIGN_BRIEF_CAP,
  DESIGN_SKILL_SELECT_CAP,
  DESIGN_SYSTEMS,
  DESIGN_TYPES,
  DesignError,
  critiqueArtifact,
  generateArtifact,
  listArtifacts,
} from '../design/index.js';
import type { ToolDefinition } from './registry.js';

/**
 * Design Studio tools (REQ-181 wave 1) — the agent drives the same core
 * module the REST routes and the pane use: `design_generate` runs a REAL
 * model call (REQ-177), the session's project `cwd` scopes generation,
 * listing and critique storage (REQ-178), and failures come back as honest
 * `{ code, message }` results — never as fabricated artifacts.
 */

/** Compact 5-dimension critique for tool output (dims + scores only). */
function critiqueSummary(critique: { overall: number; scores: { dim: string; score: number }[] }): {
  overall: number;
  scores: { dim: string; score: number }[];
} {
  return { overall: critique.overall, scores: critique.scores.map((s) => ({ dim: s.dim, score: s.score })) };
}

const DesignGenerateInput = z.object({
  type: z.enum(DESIGN_TYPES),
  brief: z.string().min(1).max(DESIGN_BRIEF_CAP),
  /** Bundled design system; omitted = the default (stripe-linear). */
  system: z.enum(DESIGN_SYSTEMS).optional(),
  /** Model override; omitted = the configured default model. */
  model: z.string().min(1).max(200).optional(),
  /**
   * REQ-192 — design skill ids (the `scope: design` ones). Each is resolved to
   * its real SKILL.md body before generation; an unknown or scopeless id is an
   * honest error, never a silently dropped selection.
   */
  skills: z.array(z.string().min(1).max(200)).max(DESIGN_SKILL_SELECT_CAP).optional(),
});

const DesignCritiqueInput = z.object({
  id: z.string().min(2).max(64),
});

/**
 * Build the Design Studio tool family for one session. `cwd` is the
 * session's project directory — artifacts live under
 * `<cwd>/.lokma/design/artifacts/` exactly like the pane's project scope.
 */
export function buildDesignTools(cwd: string): ToolDefinition[] {
  return [
    {
      name: 'design_generate',
      description:
        'Generate a design artifact (a self-contained HTML page) from a brief through a real model and store it in the Design Studio; returns the artifact id, the design skills it really received and its critique score. Pass `skills` (ids of installed `scope: design` SKILL.md files) to have their instructions applied to the artifact.',
      inputSchema: DesignGenerateInput,
      readOnly: false,
      maxResultSizeChars: 12_000,
      handler: async (input) => {
        const { type, brief, system, model, skills } = input as z.infer<typeof DesignGenerateInput>;
        try {
          const { id, manifest, critique } = await generateArtifact(type, brief, system, model, cwd, skills);
          return {
            ok: true,
            id,
            type: manifest.type,
            model: manifest.model ?? null,
            // REQ-192 — report the skills the model REALLY received (id +
            // sent chars), so "applied" is never a claim the prompt cannot back.
            skills: manifest.skills ?? [],
            critique: critiqueSummary(critique),
            note: 'Artifact stored in the Design Studio — open the Design mode to view it.',
          };
        } catch (e) {
          if (e instanceof DesignError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
    {
      name: 'design_list',
      description:
        'List stored design artifacts in the session project scope, newest first — id, type, brief, model and critique score.',
      inputSchema: z.object({}),
      readOnly: true,
      maxResultSizeChars: 12_000,
      handler: async () => {
        try {
          const { items, count } = await listArtifacts(cwd);
          return {
            ok: true,
            count,
            items: items.map((i) => ({
              id: i.id,
              type: i.type,
              brief: i.brief.slice(0, 120),
              model: i.model ?? null,
              overall: i.overall,
              updatedAt: i.updatedAt,
            })),
          };
        } catch (e) {
          if (e instanceof DesignError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
    {
      name: 'design_critique',
      description:
        'Re-run the 5-dimension critique over a stored design artifact and persist the fresh result; use after editing an artifact or before shipping one.',
      inputSchema: DesignCritiqueInput,
      readOnly: false,
      maxResultSizeChars: 8_000,
      handler: async (input) => {
        const { id } = input as z.infer<typeof DesignCritiqueInput>;
        try {
          const res = await critiqueArtifact(id, cwd);
          return { ok: true, id: res.id, critique: critiqueSummary(res.critique) };
        } catch (e) {
          if (e instanceof DesignError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
  ];
}

/** Names only — cheap index for tests + gates. */
export const DESIGN_TOOL_NAMES = ['design_generate', 'design_list', 'design_critique'] as const;
