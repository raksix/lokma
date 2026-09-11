import { z } from 'zod';

/**
 * Provider abstraction — one interface for all LLMs.
 * See Docs/22-WEB-FEATURES §providers and Docs/12-HARNESS-MIMARI §provider.
 */

export const ProviderIdSchema = z.enum(['anthropic', 'openai', 'deepseek', 'google', 'ollama', 'openrouter']);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export type ProviderMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCallId?: string;
};

/** One tool schema for native function-calling upstreams (REQ-118). */
export type ProviderToolSchema = {
  name: string;
  description: string;
  parameters: unknown;
};

/** Options every adapter accepts — key/base/signal ride through stream(). */
export type AdapterStreamOpts = {
  model: string;
  messages: ProviderMessage[];
  /** Raw API key (server resolves it from the credentials store). */
  apiKey?: string | null;
  /** Upstream root (server resolves it from provider config + overrides). */
  baseUrl?: string;
  /** AbortSignal for real interrupt (WS `abort` cancels the HTTP call). */
  signal?: AbortSignal;
  /** Extra HTTP headers for the upstream call (e.g. routing headers). */
  extraHeaders?: Record<string, string>;
  /**
   * Native tool schemas (REQ-118 FAZ A). Adapters that cannot pass tools
   * natively ignore this — the text `<tool>` loop still works.
   */
  tools?: ProviderToolSchema[];
};

export type StreamChunk =
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'tool_start'; tool: string; input: unknown; callId: string }
  | { type: 'tool_result'; callId: string; result: unknown }
  | { type: 'done'; reason: 'complete' | 'error' };

export interface ProviderAdapter {
  id: ProviderId;
  /** Stream chat completion — real HTTP upstream (keys arrive via opts). */
  stream(opts: AdapterStreamOpts): AsyncGenerator<StreamChunk>;
  /** List models for this provider. */
  listModels(apiKey?: string): Promise<{ id: string; label: string }[]>;
}
