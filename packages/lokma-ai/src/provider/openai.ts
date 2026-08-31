import type { ProviderAdapter, ProviderMessage, StreamChunk } from './types.js';

/**
 * OpenAI adapter — Phase 0 mock.
 * Covers openai + deepseek + openrouter (OpenAI-compatible) via same shape.
 */

export class OpenAIAdapter implements ProviderAdapter {
  id = 'openai' as const;

  async *stream(opts: { model: string; messages: ProviderMessage[] }): AsyncGenerator<StreamChunk> {
    const last = opts.messages.filter((m) => m.role === 'user').pop()?.content ?? 'Hello';
    const mock = `Mock OpenAI (${opts.model}) — echo: "${last.slice(0, 80)}" — Phase 0 stub. ` +
      'Phase 1 will call OpenAI /v1/chat/completions with stream:true.';
    for (const word of mock.split(' ')) {
      yield { type: 'text_delta', delta: word + ' ' };
      await sleep(16);
    }
    yield { type: 'done', reason: 'complete' };
  }

  async listModels(): Promise<{ id: string; label: string }[]> {
    return [
      { id: 'openai/gpt-5', label: 'GPT-5' },
      { id: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
      { id: 'openrouter/auto', label: 'OpenRouter Auto' },
    ];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
