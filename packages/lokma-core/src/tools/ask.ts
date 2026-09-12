import { z } from 'zod';
import type { ToolDefinition } from './registry.js';

/**
 * REQ-135 — `ask_user`: the native form of the blocking question.
 *
 * The agent loop owns this tool: it publishes an `ask_user_question` frame,
 * blocks on `waitAnswer`, and feeds the reply back as the tool result. The
 * handler below exists only so the registry entry is well-formed — a direct
 * executor call must fail loudly instead of pretending to have asked.
 *
 * Text `<ask …>` blocks stay supported for models without native function
 * calling (REQ-134); this is the path a tool-calling model sees in its schemas.
 */

/** Hard ceiling for one answer's option list (UI rows, not prose). */
export const ASK_MAX_CHOICES = 8;

export const AskUserInput = z.object({
  question: z.string().min(1).max(2000),
  /**
   * 2-8 short options, recommended first. Omit entirely for a free-text
   * question — the card always offers a "type your own answer" field anyway.
   */
  choices: z.array(z.string().min(1).max(200)).min(2).max(ASK_MAX_CHOICES).optional(),
});

export type AskUserArgs = z.infer<typeof AskUserInput>;

export function buildAskTools(): ToolDefinition[] {
  return [
    {
      name: 'ask_user',
      description:
        'Ask the user a blocking question and wait for the answer before continuing. Use it when the ' +
        "decision is genuinely the user's (direction, scope, taste, missing requirement) — not for " +
        'low-stakes choices you can make yourself, and never for dangerous-command confirmation. ' +
        'Put the options in `choices` (2-8, recommended first) or omit them for a free-text question. ' +
        'The user answers in the UI; the answer arrives as this tool result.',
      inputSchema: AskUserInput,
      // Not read-only: it must never ride a parallel read batch, and the loop
      // intercepts it before any executor sees it.
      handler: async (): Promise<never> => {
        throw new Error('ask_user is handled by the agent loop (blocking wait), not by the executor');
      },
    },
  ];
}
