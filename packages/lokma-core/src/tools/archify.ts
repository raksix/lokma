import { z } from 'zod';
import {
  ARCHIFY_PRESETS,
  ARCHIFY_PROMPT_CAP,
  ARCHIFY_THEMES,
  ARCHIFY_TYPES,
  ArchifyError,
  exportDiagram,
  generateDiagram,
} from '../archify/index.js';
import type { ToolDefinition } from './registry.js';

/**
 * Archify tool (REQ-181 wave 1) — one family for the Archify surface: the
 * agent renders a diagram from a prompt chain (`web -> api -> db`) into the
 * artifact store, then gets the rendered SVG/HTML back. The starter IR is
 * derived deterministically (no LLM) and validated before it touches disk,
 * exactly like the pane's generate button.
 */

const ARCHIFY_TOOL_FORMATS = ['svg', 'html', 'json'] as const;

const ArchifyRenderInput = z.object({
  type: z.enum(ARCHIFY_TYPES),
  /** Node chain (`web -> api -> db`, `,`/newline also split) or a sentence. */
  prompt: z.string().min(1).max(ARCHIFY_PROMPT_CAP),
  preset: z.enum(ARCHIFY_PRESETS).optional(),
  theme: z.enum(ARCHIFY_THEMES).optional(),
  /** Rendered form to return; the artifact is stored either way. */
  format: z.enum(ARCHIFY_TOOL_FORMATS).optional(),
});

/**
 * Build the Archify tool family. Storage is the global `~/.lokma/archify/`
 * store the pane lists — diagrams are not project-scoped today.
 */
export function buildArchifyTools(): ToolDefinition[] {
  return [
    {
      name: 'archify_render',
      description:
        'Render an Archify diagram from a node chain or sentence (e.g. "web -> api -> db") and store it; returns the rendered SVG/HTML body plus the artifact id.',
      inputSchema: ArchifyRenderInput,
      readOnly: false,
      maxResultSizeChars: 24_000,
      handler: async (input) => {
        const { type, prompt, preset, theme, format } = input as z.infer<typeof ArchifyRenderInput>;
        const chosen = format ?? 'svg';
        try {
          const { id } = await generateDiagram(type, prompt, preset, theme);
          const out = await exportDiagram(id, chosen);
          return {
            ok: true,
            id,
            format: chosen,
            filename: out.filename,
            contentType: out.contentType,
            bytes: out.body.length,
            body: out.body,
          };
        } catch (e) {
          if (e instanceof ArchifyError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
  ];
}

/** Names only — cheap index for tests + gates. */
export const ARCHIFY_TOOL_NAMES = ['archify_render'] as const;
