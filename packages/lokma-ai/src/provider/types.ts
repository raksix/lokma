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

export type StreamChunk =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_start'; tool: string; input: unknown; callId: string }
  | { type: 'tool_result'; callId: string; result: unknown }
  | { type: 'done'; reason: 'complete' | 'error' };

export interface ProviderAdapter {
  id: ProviderId;
  /** Stream chat completion — yields chunks. Real API in Phase 1, mock in Phase 0. */
  stream(opts: { model: string; messages: ProviderMessage[]; apiKey?: string }): AsyncGenerator<StreamChunk>;
  /** List models for this provider. */
  listModels(apiKey?: string): Promise<{ id: string; label: string }[]>;
}
