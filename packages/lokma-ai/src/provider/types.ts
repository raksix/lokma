import { z } from 'zod';
import type { ReasoningEffort } from '@lokma/shared/protocol/ws';

/**
 * Provider abstraction — one interface for all LLMs.
 * See Docs/22-WEB-FEATURES §providers and Docs/12-HARNESS-MIMARI §provider.
 */

export const ProviderIdSchema = z.enum(['anthropic', 'openai', 'deepseek', 'google', 'ollama', 'openrouter']);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

/**
 * One assistant-side native tool call, exactly as the upstream streamed it
 * (OpenAI `tool_calls[]`, Anthropic `tool_use` block, Responses
 * `function_call` item). `arguments` stays a RAW JSON STRING here so the
 * next turn can echo the call back byte-identical — upstreams reject a
 * re-serialized object (key order, number formatting) on some models, and
 * Claude-Code-style histories must round-trip.
 */
export type ProviderToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ProviderMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  /** `tool` rows: the call this result answers. */
  toolCallId?: string;
  /** `tool` rows: the tool name (Anthropic requires it, OpenAI tolerates it). */
  name?: string;
  /**
   * `assistant` rows: the native calls this turn emitted. A native turn
   * MUST be replayed with its calls attached, otherwise the following
   * `tool` rows reference call ids the upstream never saw (HTTP 400).
   */
  toolCalls?: ProviderToolCall[];
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
  /**
   * REQ-133: thinking budget from the composer. `low|medium|high` become
   * the provider's own reasoning knob (`reasoning_effort`, Responses
   * `reasoning.effort`, Anthropic `thinking.budget_tokens`); `off` or
   * undefined adds no field at all.
   */
  reasoningEffort?: ReasoningEffort;
};

export type StreamChunk =
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'tool_start'; tool: string; input: unknown; callId: string }
  | { type: 'tool_result'; callId: string; result: unknown }
  | {
      type: 'native_tool_call';
      tool: string;
      input: unknown;
      callId: string;
      /** Raw JSON text the model streamed (kept for native history replay). */
      argumentsJson?: string;
      parseError?: string;
    }
  /** Live partial tool input (Claude-Code-style progress) — UI only. */
  | { type: 'tool_input_delta'; tool: string; callId: string; delta: string }
  | { type: 'done'; reason: 'complete' | 'error' };

export interface ProviderAdapter {
  id: ProviderId;
  /** Stream chat completion — real HTTP upstream (keys arrive via opts). */
  stream(opts: AdapterStreamOpts): AsyncGenerator<StreamChunk>;
  /** List models for this provider. */
  listModels(apiKey?: string): Promise<{ id: string; label: string }[]>;
}
