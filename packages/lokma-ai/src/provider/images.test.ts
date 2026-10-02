/**
 * Image conversion probes (REQ-186): a user message carrying attached
 * images must reach each wire format as real content parts, and messages
 * without images keep the plain string shape (no regression).
 * Run: `bun src/provider/images.test.ts` from `packages/lokma-ai`.
 * Plain asserts (no framework) — mirrors `adapters.test.ts`.
 */
import { toAnthropicMessages } from './anthropic';
import { toChatMessages, toResponsesInput } from './openai';
import type { ProviderImage } from './types';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value !== null && typeof value === 'object' ? value : {}) as Record<string, unknown>;
}

function asParts(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

/** Tiny opaque payload — the converters never decode base64. */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const IMAGE: ProviderImage = { mime: 'image/png', dataBase64: PNG_B64 };
const DATA_URL = 'data:image/png;base64,' + PNG_B64;

// 1. Chat-completions: text + image ride as a parts array.
{
  const row = asRecord(toChatMessages([{ role: 'user', content: 'look at this', images: [IMAGE] }])[0]);
  const parts = asParts(row['content']);
  assert(Array.isArray(row['content']), 'chat: image message content is an array');
  assert(parts.length === 2, 'chat: one text part + one image part');
  assert(parts[0]?.['type'] === 'text' && parts[0]?.['text'] === 'look at this', 'chat: text part first');
  const imageUrl = asRecord(parts[1]?.['image_url']);
  assert(parts[1]?.['type'] === 'image_url' && imageUrl['url'] === DATA_URL, 'chat: image_url carries the data URL');
}

// 2. Chat-completions: an image-only message drops the empty text part.
{
  const row = asRecord(toChatMessages([{ role: 'user', content: '', images: [IMAGE] }])[0]);
  const parts = asParts(row['content']);
  assert(parts.length === 1 && parts[0]?.['type'] === 'image_url', 'chat: empty text is not sent as a part');
}

// 3. Chat-completions: no images keeps the legacy string shape.
{
  const row = asRecord(toChatMessages([{ role: 'user', content: 'plain' }])[0]);
  assert(row['content'] === 'plain', 'chat: text-only message stays a plain string');
}

// 4. Chat-completions: a junk mime entry degrades to the text shape.
{
  const junk = { mime: 'text/plain', dataBase64: PNG_B64 } as unknown as ProviderImage;
  const row = asRecord(toChatMessages([{ role: 'user', content: 'plain', images: [junk] }])[0]);
  assert(row['content'] === 'plain', 'chat: junk mime is dropped, text shape kept');
}

// 5. Chat-completions: multiple images all ride, order kept.
{
  const second: ProviderImage = { mime: 'image/jpeg', dataBase64: 'QUJD' };
  const row = asRecord(toChatMessages([{ role: 'user', content: 'two', images: [IMAGE, second] }])[0]);
  const parts = asParts(row['content']);
  assert(parts.length === 3, 'chat: both images ride as separate parts');
  assert(asRecord(parts[1]?.['image_url'])['url'] === DATA_URL, 'chat: first image keeps its order');
  assert(
    asRecord(parts[2]?.['image_url'])['url'] === 'data:image/jpeg;base64,QUJD',
    'chat: second image follows',
  );
}

// 6. Responses: input_text + input_image parts, image_url as a string.
{
  const row = asRecord(toResponsesInput([{ role: 'user', content: 'look', images: [IMAGE] }])[0]);
  const parts = asParts(row['content']);
  assert(parts[0]?.['type'] === 'input_text' && parts[0]?.['text'] === 'look', 'responses: input_text part first');
  assert(
    parts[1]?.['type'] === 'input_image' && parts[1]?.['image_url'] === DATA_URL,
    'responses: input_image carries the data URL string',
  );
}

// 7. Responses: tool-result rows keep their native mapping (regression).
{
  const rows = toResponsesInput([
    { role: 'user', content: '<tool_result id="call_1">ok</tool_result>' },
  ]).map(asRecord);
  assert(
    rows.length === 1 && rows[0]?.['type'] === 'function_call_output' && rows[0]?.['call_id'] === 'call_1',
    'responses: tool_result splitting is unchanged',
  );
}

// 8. Anthropic: a base64 image block sits next to the text block.
{
  const rows = toAnthropicMessages([{ role: 'user', content: 'look', images: [IMAGE] }]);
  const content = rows[0]?.content;
  const blocks = asParts(content);
  assert(Array.isArray(content), 'anthropic: image message content is a block array');
  assert(blocks[0]?.['type'] === 'text' && blocks[0]?.['text'] === 'look', 'anthropic: text block first');
  const source = asRecord(blocks[1]?.['source']);
  assert(
    blocks[1]?.['type'] === 'image' &&
      source['type'] === 'base64' &&
      source['media_type'] === 'image/png' &&
      source['data'] === PNG_B64,
    'anthropic: image block carries the base64 source',
  );
}

// 9. Anthropic: a text-only row keeps the plain string (regression).
{
  const rows = toAnthropicMessages([{ role: 'user', content: 'plain' }]);
  assert(rows[0]?.content === 'plain', 'anthropic: text-only message stays a plain string');
}

console.log('');
console.log('All ' + passed + ' image checks passed.');
