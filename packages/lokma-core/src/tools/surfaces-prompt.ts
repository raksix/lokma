import { SURFACES } from '@lokma/shared';

/**
 * REQ-181 — the `<available_surfaces>` system-prompt block, derived from the
 * surface catalog alone (`@lokma/shared` SURFACES). It tells the model which
 * UI surfaces exist and which of their tools are actually registered — what
 * the user can do in the UI, the agent can do through the same surface.
 *
 * Only registered tools are listed: the prompt never advertises a tool the
 * registry cannot execute, and a surface left with no registered tool is
 * omitted entirely (honest empty beats a dead reference).
 */

/** Flat list of the tool names the block will carry, in catalog order. */
export function surfacePromptNames(registeredToolNames: readonly string[]): string[] {
  const registered = new Set(registeredToolNames);
  const names: string[] = [];
  for (const surface of SURFACES) {
    for (const tool of surface.tools) {
      if (registered.has(tool.name)) names.push(tool.name);
    }
  }
  return names;
}

/**
 * Build the block. Returns `''` when the registry declares none of the
 * catalog's tools — nothing honest to advertise.
 */
export function buildSurfaceSystemPrompt(registeredToolNames: readonly string[]): string {
  const registered = new Set(registeredToolNames);
  const lines: string[] = [];
  for (const surface of SURFACES) {
    const names = surface.tools.filter((tool) => registered.has(tool.name)).map((tool) => tool.name);
    if (names.length === 0) continue;
    lines.push(`- ${surface.label}: ${names.join(', ')}`);
  }
  if (lines.length === 0) return '';
  return [
    '<available_surfaces>',
    'These UI surfaces exist in the workspace; the tools listed under a surface drive the SAME surface the user sees. Reach for them when the user asks for something they could do in the UI (open a pane or a page, generate a design, render a diagram, run a test plan):',
    ...lines,
    '</available_surfaces>',
  ].join('\n');
}
