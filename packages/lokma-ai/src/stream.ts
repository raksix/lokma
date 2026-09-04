import { ProviderError } from './provider/errors.js';
import { providerRegistry } from './provider/registry.js';
import type { ProviderMessage, StreamChunk } from './provider/types.js';

/**
 * Unified stream() — picks adapter by provider, yields normalized chunks.
 * Both CLI loop and Web WS handler call this (single implementation, DRY).
 * The caller resolves `apiKey`/`baseUrl` (server: credentials store +
 * provider config) and passes them through; adapters do real HTTP.
 * See Docs/12-HARNESS-MIMARI §stream and Docs/22 §model fallback chain.
 */

export type StreamOpts = {
  provider: string;
  model: string;
  messages: ProviderMessage[];
  apiKey?: string | null;
  baseUrl?: string;
  signal?: AbortSignal;
};

export async function* stream(opts: StreamOpts): AsyncGenerator<StreamChunk> {
  const adapter = providerRegistry.get(opts.provider);
  if (!adapter) {
    throw new ProviderError(
      'unknown_provider',
      `Unknown provider: ${opts.provider} — available: ${providerRegistry.ids().join(', ')}`,
    );
  }
  yield* adapter.stream({
    model: opts.model,
    messages: opts.messages,
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    signal: opts.signal,
  });
}
