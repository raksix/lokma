import type { ProviderAdapter, ProviderMessage, StreamChunk } from './types.js';

/**
 * Anthropic adapter — Phase 0 mock (no network).
 * Phase 1 swaps to @anthropic-ai/sdk with real streaming.
 */

export class AnthropicAdapter implements ProviderAdapter {
  id = 'anthropic' as const;

  async *stream(opts: { model: string; messages: ProviderMessage[] }): AsyncGenerator<StreamChunk> {
    // Mock: echo last user message with lorem ipsum, streaming word by word
    const last = opts.messages.filter((m) => m.role === 'user').pop()?.content ?? 'Hello';
    const mock = `Mock Anthropic (${opts.model}) — you said: "${last.slice(0, 80)}" — this is a Phase 0 streaming stub. ` +
      'Real Anthropic SDK wiring lands in Phase 1 (see Docs/22).';
    for (const word of mock.split(' ')) {
      yield { type: 'text_delta', delta: word + ' ' };
      await sleep(18);
    }
    yield { type: 'done', reason: 'complete' };
  }

  async listModels(): Promise<{ id: string; label: string }[]> {
    return [
      { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { id: 'anthropic/claude-opus-4-5', label: 'Claude Opus 4.5' },
      { id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    ];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
