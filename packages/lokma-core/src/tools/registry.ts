import { z } from 'zod';

/**
 * ToolRegistry — narrow-waist tool surface.
 * Tools are registered once; the loop calls them by name.
 * Keeps CLI and Web in sync — same registry, same tools.
 */

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (input: unknown, ctx: unknown) => Promise<unknown>;
};

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** Names only — cheap index for <available_tools> prompt. */
  names(): string[] {
    return [...this.tools.keys()];
  }

  async call(name: string, input: unknown, ctx: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    const parsed = tool.inputSchema.parse(input);
    return tool.handler(parsed, ctx);
  }
}

/** Singleton for Phase 0 — Phase 1 scopes per Context. */
export const globalRegistry = new ToolRegistry();
