/**
 * Live probe for the real streaming adapters (`./openai`, `./anthropic`).
 * Run: `bun src/provider/adapters.test.ts` from `packages/lokma-ai`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Network doubles are local stub HTTP servers speaking real SSE (the HTTP
 * + parse path under test is production code, not a mock of the feature).
 * Not imported by library code, so `tsc -p` output ignores it.
 */
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { AnthropicAdapter } from './anthropic';
import { ProviderError } from './errors';
import { OpenAIAdapter, shortModelId } from './openai';
import { stream } from '../stream';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

async function collectText(
  gen: AsyncGenerator<{ type: string; delta?: string; reason?: string }>,
): Promise<{ text: string; done: boolean }> {
  let text = '';
  let done = false;
  for await (const chunk of gen) {
    if (chunk.type === 'text_delta' && typeof chunk.delta === 'string') text += chunk.delta;
    if (chunk.type === 'done') done = true;
  }
  return { text, done };
}

function listen(app: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function sseBody(lines: string[]): string {
  return lines.map((l) => `data: ${l}\n\n`).join('');
}

// 1. Pure helper: harness `provider/id` prefix is stripped for the upstream.
assert(shortModelId('openai/gpt-5') === 'gpt-5', 'shortModelId strips provider prefix');
assert(shortModelId('plain-model') === 'plain-model', 'shortModelId keeps bare ids');

// 2. OpenAI-compatible happy path against a stub SSE server.
const seenOpenAi: { path: string; auth: string | undefined; model: string } = { path: '', auth: undefined, model: '' };
const openAiStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    seenOpenAi.path = req.url ?? '';
    seenOpenAi.auth = req.headers.authorization;
    try {
      seenOpenAi.model = (JSON.parse(body) as { model?: string }).model ?? '';
    } catch {
      seenOpenAi.model = '';
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      sseBody([
        '{"choices":[{"delta":{"content":"Hello"}}]}',
        '{"choices":[{"delta":{"content":" world"}}]}',
        '{"choices":[{"delta":{}}]}',
        '[DONE]',
      ]),
    );
  });
});
try {
  const out = await collectText(
    new OpenAIAdapter().stream({
      model: 'openai/probe-model',
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'test-key',
      baseUrl: `${openAiStub.base}/v1`,
    }),
  );
  assert(out.text === 'Hello world', 'openai stub streams concatenated deltas');
  assert(out.done, 'openai stub ends with done');
  assert(seenOpenAi.path === '/v1/chat/completions', 'openai posts to {base}/chat/completions');
  assert(seenOpenAi.auth === 'Bearer test-key', 'openai sends Bearer key');
  assert(seenOpenAi.model === 'probe-model', 'openai strips provider prefix for upstream');
} finally {
  openAiStub.server.close();
}

// 3. OpenAI-compatible upstream 401 surfaces as http_error with the status.
const denyStub = await listen((_req, res) => {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'bad key' } }));
});
try {
  let caught: unknown = null;
  try {
    await collectText(
      new OpenAIAdapter().stream({
        model: 'openai/x',
        messages: [{ role: 'user', content: 'hi' }],
        apiKey: 'wrong',
        baseUrl: denyStub.base,
      }),
    );
  } catch (e) {
    caught = e;
  }
  assert(caught instanceof ProviderError, 'openai 401 throws ProviderError');
  assert((caught as ProviderError).code === 'http_error', 'openai 401 maps code=http_error');
  assert((caught as ProviderError).status === 401, 'openai 401 keeps status=401');
} finally {
  denyStub.server.close();
}

// 4. No key + remote base refuses before any network happens.
let caughtMissing: unknown = null;
try {
  await collectText(
    new OpenAIAdapter().stream({ model: 'openai/x', messages: [{ role: 'user', content: 'hi' }], baseUrl: 'https://api.openai.com/v1' }),
  );
} catch (e) {
  caughtMissing = e;
}
assert(caughtMissing instanceof ProviderError, 'openai keyless remote throws ProviderError');
assert((caughtMissing as ProviderError).code === 'missing_api_key', 'openai keyless remote maps code=missing_api_key');

// 5. Anthropic happy path: headers + system extraction + text deltas.
const seenAnthropic: { path: string; key: string | undefined; version: string | undefined; system: string; model: string } = {
  path: '',
  key: undefined,
  version: undefined,
  system: '',
  model: '',
};
const anthropicStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    seenAnthropic.path = req.url ?? '';
    seenAnthropic.key = req.headers['x-api-key'] as string | undefined;
    seenAnthropic.version = req.headers['anthropic-version'] as string | undefined;
    try {
      const parsed = JSON.parse(body) as { model?: string; system?: string };
      seenAnthropic.model = parsed.model ?? '';
      seenAnthropic.system = parsed.system ?? '';
    } catch {
      // Keep defaults on malformed bodies.
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      'event: message_start\ndata: {"type":"message_start"}\n\n' +
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi "}}\n\n' +
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"there"}}\n\n' +
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    );
  });
});
try {
  const out = await collectText(
    new AnthropicAdapter().stream({
      model: 'anthropic/probe-model',
      messages: [
        { role: 'system', content: 'sys-prompt' },
        { role: 'user', content: 'hi' },
      ],
      apiKey: 'ant-key',
      baseUrl: anthropicStub.base,
    }),
  );
  assert(out.text === 'Hi there', 'anthropic stub streams concatenated deltas');
  assert(seenAnthropic.path === '/v1/messages', 'anthropic posts to {base}/v1/messages');
  assert(seenAnthropic.key === 'ant-key', 'anthropic sends x-api-key');
  assert(seenAnthropic.version === '2023-06-01', 'anthropic sends version header');
  assert(seenAnthropic.system === 'sys-prompt', 'anthropic extracts system prompt');
  assert(seenAnthropic.model === 'probe-model', 'anthropic strips provider prefix');
} finally {
  anthropicStub.server.close();
}

// 6. Anthropic without a key refuses (no keyless tier upstream).
let caughtAntKey: unknown = null;
try {
  await collectText(new AnthropicAdapter().stream({ model: 'anthropic/x', messages: [{ role: 'user', content: 'hi' }] }));
} catch (e) {
  caughtAntKey = e;
}
assert(caughtAntKey instanceof ProviderError, 'anthropic keyless throws ProviderError');
assert((caughtAntKey as ProviderError).code === 'missing_api_key', 'anthropic keyless maps code=missing_api_key');

// 7. stream() still rejects unknown providers.
let caughtUnknown: unknown = null;
try {
  await collectText(stream({ provider: 'nope', model: 'nope/x', messages: [] }));
} catch (e) {
  caughtUnknown = e;
}
assert(caughtUnknown instanceof ProviderError, 'stream() unknown provider throws ProviderError');
assert((caughtUnknown as ProviderError).code === 'unknown_provider', 'stream() unknown provider keeps code');

console.log(`\nAll ${passed} checks passed.`);
