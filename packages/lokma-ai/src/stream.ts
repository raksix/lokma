import { providerRegistry } from './provider/registry.js';
import type { ProviderMessage, StreamChunk } from './provider/types.js';

/**
 * Unified stream() — picks adapter by provider, yields normalized chunks.
 * Both CLI loop and Web WS handler call this (single implementation, DRY).
 * See Docs/12-HARNESS-MIMARI §stream and Docs/22 §model fallback chain.
 */

export type StreamOpts = {
  provider: string;
  model: string;
  messages: ProviderMessage[];
  apiKey?: string;
};

export async function* stream(opts: StreamOpts): AsyncGenerator<StreamChunk> {
  const adapter = providerRegistry.get(opts.provider);
  if (!adapter) {
    throw new Error(`Unknown provider: ${opts.provider} — available: ${providerRegistry.ids().join(', ')}`);
  }
  yield* adapter.stream({ model: opts.model, messages: opts.messages, apiKey: opts.apiKey });
}
