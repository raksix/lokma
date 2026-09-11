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
import { nativeCallInput, nativeCallToToolBlock, OpenAIAdapter, shortModelId, toResponsesTools, unseenSuffix, usesResponsesApi } from './openai';
import { zodToJsonSchema } from './tools-schema';
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

// 2b. REQ-038: opencode-go base auto-sends x-opencode-session (explicit wins).
const seenGo: { session: string | undefined; custom: string | undefined; ua: string | undefined } = { session: undefined, custom: undefined, ua: undefined };
const goStub = await listen((req, res) => {
  req.resume();
  req.on('end', () => {
    seenGo.session = req.headers['x-opencode-session'] as string | undefined;
    seenGo.custom = req.headers['x-test-mark'] as string | undefined;
    seenGo.ua = req.headers['user-agent'] as string | undefined;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(sseBody(['[DONE]']));
  });
});
try {
  await collectText(
    new OpenAIAdapter().stream({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'test-key',
      baseUrl: `${goStub.base}/opencode.ai/zen/go/v1`,
      extraHeaders: { 'x-test-mark': 'yes' },
    }),
  );
  assert(typeof seenGo.session === 'string' && seenGo.session.startsWith('lokma-'), 'go base auto-mints x-opencode-session');
  assert(seenGo.custom === 'yes', 'extraHeaders forwarded upstream');
  assert(seenGo.ua === 'lokma-harness/1.0 (+https://lokma.fermag.com.tr)', 'go base identifies with lokma UA');
  await collectText(
    new OpenAIAdapter().stream({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'test-key',
      baseUrl: `${goStub.base}/opencode.ai/zen/go/v1`,
      extraHeaders: { 'x-opencode-session': 'keep-me' },
    }),
  );
  assert(seenGo.session === 'keep-me', 'explicit x-opencode-session wins over mint');
} finally {
  goStub.server.close();
}

// 2c. REQ-039: spark on zen/go rides /responses (chat 500s upstream).
const seenResp: { path: string; model: string; hasInput: boolean } = { path: '', model: '', hasInput: false };
const respStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    seenResp.path = req.url ?? '';
    try {
      const parsed = JSON.parse(body) as { model?: string; input?: unknown };
      seenResp.model = parsed.model ?? '';
      seenResp.hasInput = Array.isArray(parsed.input);
    } catch {
      seenResp.model = '';
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hi"}\n\n' +
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":" there"}\n\n' +
        'event: response.completed\ndata: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"!"}]}]}}\n\n',
    );
  });
});
try {
  const out = await collectText(
    new OpenAIAdapter().stream({
      model: 'opencode-go/muse-spark-1.3-contributor',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
      ],
      apiKey: 'k',
      baseUrl: `${respStub.base}/opencode.ai/zen/go/v1`,
    }),
  );
  assert(seenResp.path === '/opencode.ai/zen/go/v1/responses', 'spark posts to {base}/responses');
  assert(seenResp.model === 'muse-spark-1.3-contributor', 'responses keeps the short model id');
  assert(seenResp.hasInput, 'responses carries input array');
  assert(out.text === 'Hi there!', 'responses deltas + completed tail concatenate');
  assert(out.done, 'responses stream ends with done');
  assert(usesResponsesApi('https://opencode.ai/zen/go/v1', 'muse-spark-1.2-contributor'), 'spark matches responses routing');
  assert(!usesResponsesApi('https://opencode.ai/zen/go/v1', 'mimo-v2.5'), 'non-spark stays on chat');
  assert(!usesResponsesApi('https://api.openai.com/v1', 'muse-spark-1.3-contributor'), 'spark off-zen stays on chat');
} finally {
  respStub.server.close();
}

// 2d. REQ-061: `response.completed` replays the FULL text — the adapter must
// not append it on top of already-streamed deltas (live transcript doubled
// every spark answer: "Selam!...Selam!...").
const dupStub = await listen((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.end(
    'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Hi"}\n\n' +
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":" there"}\n\n' +
      'event: response.completed\ndata: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"Hi there"}]}]}}\n\n',
  );
});
try {
  const out = await collectText(
    new OpenAIAdapter().stream({
      model: 'opencode-go/muse-spark-1.3-contributor',
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'test-key',
      baseUrl: `${dupStub.base}/opencode.ai/zen/go/v1`,
    }),
  );
  assert(out.text === 'Hi there', `completed full-text replay deduped, got: ${JSON.stringify(out.text)}`);
  assert(unseenSuffix('Hi there', 'Hi there') === '', 'identical tail skipped');
  assert(unseenSuffix('Hi', 'Hi there!') === ' there!', 'extended tail yields suffix only');
  assert(unseenSuffix('', 'abc') === 'abc', 'empty seen passes tail through');
  assert(unseenSuffix('abc', '') === '', 'empty tail yields nothing');
} finally {
  dupStub.server.close();
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

// 8. REQ-118 FAZ B: native tools ride the responses body; function_call
// items flush as machine-typed native_tool_call chunks (mock-transport
// probe) — no synthetic <tool> text passes the filter anymore.
assert(toResponsesTools(undefined).length === 0, 'no tools option means no tools array');
assert(toResponsesTools([]).length === 0, 'empty tools means no tools array');
assert(
  toResponsesTools([{ name: 'read_file', description: 'read', parameters: { type: 'object' } }])[0]?.type ===
    'function',
  'responses tools map to function entries',
);
assert(
  nativeCallToToolBlock('read_file', '{"path":"a.ts"}') === '<tool name="read_file">{"path":"a.ts"}</tool>',
  'native call renders exact tool block',
);
assert(
  nativeCallToToolBlock('list_files', '  ') === '<tool name="list_files">{}</tool>',
  'empty native args become empty object block',
);
assert(
  JSON.stringify(nativeCallInput('{"path":"a.ts"}').input) === '{"path":"a.ts"}' &&
    nativeCallInput('{"path":"a.ts"}').parseError === undefined,
  'nativeCallInput parses gateway-echoed JSON args',
);
assert(
  JSON.stringify(nativeCallInput('  ').input) === '{}',
  'nativeCallInput maps empty args to empty object',
);
assert(
  nativeCallInput('{oops').input === undefined && typeof nativeCallInput('{oops').parseError === 'string',
  'nativeCallInput reports unparseable args honestly',
);
assert(
  (zodToJsonSchema({ _def: { typeName: 'ZodString' } }) as { type?: string }).type === 'string',
  'zodToJsonSchema maps ZodString',
);
const objSchema = zodToJsonSchema({
  _def: {
    typeName: 'ZodObject',
    shape: () => ({
      path: { _def: { typeName: 'ZodString' } },
      max: { _def: { typeName: 'ZodOptional', innerType: { _def: { typeName: 'ZodNumber' } } } },
    }),
  },
}) as { type?: string; properties?: Record<string, unknown>; required?: string[] };
assert(objSchema.type === 'object' && typeof objSchema.properties?.path === 'object', 'zod object converts shape');
assert(
  Array.isArray(objSchema.required) && objSchema.required.length === 1 && objSchema.required[0] === 'path',
  'optional fields stay out of required',
);

const seenTools: { path: string; tools: unknown; choice: unknown } = { path: '', tools: undefined, choice: undefined };
const toolStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    seenTools.path = req.url ?? '';
    try {
      const parsed = JSON.parse(body) as { tools?: unknown; tool_choice?: unknown };
      seenTools.tools = parsed.tools;
      seenTools.choice = parsed.tool_choice;
    } catch {
      seenTools.tools = undefined;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"checking"}\n\n' +
        'event: response.output_item.added\ndata: {"type":"response.output_item.added","output_index":0,"item":{"id":"fc-1","type":"function_call","name":"read_file","call_id":"call-1","arguments":""}}' +
        '\n\n' +
        'event: response.function_call_arguments.delta\ndata: {"type":"response.function_call_arguments.delta","item_id":"fc-1","output_index":0,"delta":"{\\"path\\":\\"a.ts\\"}"}' +
        '\n\n' +
        'event: response.completed\ndata: {"type":"response.completed","response":{"output":[{"type":"function_call","id":"fc-1","call_id":"call-1","name":"read_file","arguments":"{\\"path\\":\\"a.ts\\"}"}]}}\n\n',
    );
  });
});
try {
  const chunks: { type: string; delta?: string; tool?: string; input?: unknown; callId?: string }[] = [];
  for await (const chunk of new OpenAIAdapter().stream({
    model: 'opencode-go/muse-spark-1.3-contributor',
    messages: [{ role: 'user', content: 'read a.ts' }],
    apiKey: 'probe-key',
    baseUrl: `${toolStub.base}/opencode.ai/zen/go/v1`,
    tools: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: {} } }],
  })) {
    if (chunk.type === 'text_delta' && typeof (chunk as { delta?: unknown }).delta === 'string') {
      chunks.push({ type: chunk.type, delta: (chunk as { delta: string }).delta });
    } else if (chunk.type === 'native_tool_call') {
      chunks.push({ type: chunk.type, tool: chunk.tool, input: chunk.input, callId: chunk.callId });
    }
  }
  const joined = chunks.map((c) => c.delta ?? '').join('');
  const native = chunks.filter((c) => c.type === 'native_tool_call');
  assert(seenTools.path === '/opencode.ai/zen/go/v1/responses', 'native tools still ride /responses');
  assert(
    Array.isArray(seenTools.tools) &&
      (seenTools.tools as { name?: string }[]).length === 1 &&
      (seenTools.tools as { name?: string }[])[0]?.name === 'read_file',
    'responses body carries tools[] with the registry schema',
  );
  assert(seenTools.choice === 'auto', 'responses body sets tool_choice auto');
  assert(joined.includes('checking'), 'native run keeps streamed text');
  assert(
    native.length === 1 &&
      native[0]?.tool === 'read_file' &&
      JSON.stringify(native[0]?.input) === '{"path":"a.ts"}' &&
      native[0]?.callId === 'call-1',
    `function_call flushes one native_tool_call chunk, got: ${JSON.stringify(native)}`,
  );
  assert(!joined.includes('<tool'), 'no synthetic tool text passes the filter anymore');
  assert(!joined.includes('checkingchecking'), 'no text doubling beside the native call');
} finally {
  toolStub.server.close();
}

// 8b. REQ-118: chat path ignores tools (no body change for non-spark).
const seenChat: { hasTools: boolean } = { hasTools: false };
const chatToolStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    try {
      seenChat.hasTools = 'tools' in (JSON.parse(body) as Record<string, unknown>);
    } catch {
      seenChat.hasTools = false;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(sseBody(['{"choices":[{"delta":{"content":"ok"}}]}', '[DONE]']));
  });
});
try {
  await collectText(
    new OpenAIAdapter().stream({
      model: 'openai/probe-model',
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'probe-key',
      baseUrl: chatToolStub.base,
      tools: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object' } }],
    }),
  );
  assert(!seenChat.hasTools, 'chat completions body carries no tools key');
} finally {
  chatToolStub.server.close();
}

console.log(`\nAll ${passed} checks passed.`);
