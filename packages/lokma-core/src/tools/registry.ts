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
  /**
   * REQ-128: concurrency-safe marker (Claude-Code `isReadOnly()`). Consecutive
   * read-only calls in one turn run in parallel; anything that can mutate the
   * workspace or read outside it stays serial.
   */
  readOnly?: boolean;
  /**
   * REQ-128: per-tool output budget in characters (Claude-Code
   * `maxResultSizeChars`). The loop spills anything larger to disk and hands
   * the model a preview envelope instead. Undefined = the global default.
   */
  maxResultSizeChars?: number;
};

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  /**
   * REQ-135: model-facing aliases. A model that learned a name in a sibling
   * harness (`clarify` in Hermes, or a bare `ask`) calls it by that name; we
   * resolve it to the real tool instead of answering `Unknown tool`.
   */
  private aliases = new Map<string, string>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Point an extra name at a registered tool (`ask` → `ask_user`). */
  alias(alias: string, target: string): void {
    if (!this.tools.has(target)) {
      throw new Error(`Cannot alias ${alias}: tool ${target} is not registered`);
    }
    this.aliases.set(alias, target);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(this.aliases.get(name) ?? name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** Names only — cheap index for <available_tools> prompt. */
  names(): string[] {
    return [...this.tools.keys()];
  }

  async call(name: string, input: unknown, ctx: unknown): Promise<unknown> {
    const tool = this.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    const parsed = tool.inputSchema.parse(input);
    return tool.handler(parsed, ctx);
  }

  /** True when the name (or one of its aliases) is a registered tool. */
  has(name: string): boolean {
    return this.get(name) !== undefined;
  }
}

/** Singleton for Phase 0 — Phase 1 scopes per Context. */
export const globalRegistry = new ToolRegistry();
