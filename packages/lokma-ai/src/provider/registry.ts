import type { ProviderAdapter, ProviderId } from './types.js';
import { AnthropicAdapter } from './anthropic.js';
import { OpenAIAdapter } from './openai.js';

/**
 * Provider registry — singleton that holds all adapters.
 * DRY: one place to add a new provider (just register + add to ProviderId).
 */

export class ProviderRegistry {
  private adapters = new Map<ProviderId, ProviderAdapter>();

  constructor() {
    this.register(new AnthropicAdapter());
    this.register(new OpenAIAdapter());
    // Future: GoogleAdapter, OllamaAdapter, DeepSeekAdapter (OpenAI-compatible)
  }

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.id as ProviderId, adapter);
  }

  get(id: string): ProviderAdapter | undefined {
    return this.adapters.get(id as ProviderId);
  }

  list(): ProviderAdapter[] {
    return [...this.adapters.values()];
  }

  ids(): ProviderId[] {
    return [...this.adapters.keys()];
  }
}

export const providerRegistry = new ProviderRegistry();
