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
import { AnthropicAdapter, toAnthropicMessages, toAnthropicTools } from './anthropic';
import { ProviderError } from './errors';
import { nativeCallInput, nativeCallToToolBlock, nativeToolsBlocked, looksLikeToolPairingError, looksLikeToolsUnsupported, OpenAIAdapter, responsesHttpError, shortModelId, toChatMessages, toChatTools, ToolCallAccumulator, toResponsesInput, toResponsesTools, unseenSuffix, usesResponsesApi } from './openai';
import { activeEffort, anthropicThinkingBudget, looksLikeReasoningUnsupported, reasoningBlocked, reasoningKey, resetReasoningMemory } from './reasoning';
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

// 8b. REQ-128: the chat path carries native tools too (REQ-118 shipped the
// Responses path first and left /chat/completions tool-blind).
const seenChat: { hasTools: boolean; choice: unknown; toolName: unknown } = {
  hasTools: false,
  choice: undefined,
  toolName: undefined,
};
const chatToolStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body) as {
        tools?: { function?: { name?: string } }[];
        tool_choice?: unknown;
      };
      seenChat.hasTools = 'tools' in parsed;
      seenChat.choice = parsed.tool_choice;
      seenChat.toolName = parsed.tools?.[0]?.function?.name;
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
      apiKey: 'test-key',
      baseUrl: chatToolStub.base,
      tools: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object' } }],
    }),
  );
  assert(seenChat.hasTools, 'chat completions body carries a tools key');
  assert(seenChat.choice === 'auto', 'chat completions body sets tool_choice auto');
  assert(seenChat.toolName === 'read_file', 'chat tools use the {type:function,function:{name}} shape');
} finally {
  chatToolStub.server.close();
}

// 8c. REQ-118 FAZ B.2: follow-up results return as native function_call_output.
const mixed = toResponsesInput([
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'run <tool_result tool="a" id="call-1">1</tool_result> mid <tool_result tool="b" call_id="call-2">ERROR x</tool_result> tail' },
  { role: 'tool', content: '{"old":"row"}' },
]);
assert(mixed.length === 7, 'mixed follow-up splits into text + native items, got ' + mixed.length);
assert((mixed[0] as { role?: string }).role === 'system', 'system message passes through');
assert((mixed[1] as { content?: string }).content === 'run ', 'leading text stays a user item');
const fco1 = mixed[2] as { type?: string; call_id?: string; output?: string };
assert(fco1.type === 'function_call_output' && fco1.call_id === 'call-1' && fco1.output === '1', 'id attr becomes native function_call_output');
assert((mixed[3] as { content?: string }).content === ' mid ', 'text between results stays a user item');
const fco2 = mixed[4] as { type?: string; call_id?: string; output?: string };
assert(fco2.type === 'function_call_output' && fco2.call_id === 'call-2' && fco2.output === 'ERROR x', 'call_id attr wins and error bodies ride along');
assert((mixed[5] as { content?: string }).content === ' tail', 'trailing text stays a user item');
assert((mixed[6] as { role?: string; content?: string }).role === 'user', 'tool history rows stay user text');
const noId = toResponsesInput([{ role: 'user', content: '<tool_result tool="a">{"x":1}</tool_result>' }]);
assert(
  noId.length === 1 && (noId[0] as { role?: string }).role === 'user' && ((noId[0] as { content?: string }).content ?? '').indexOf('tool_result') >= 0,
  'id-less result block stays user text (fail-open)',
);
const unclosed = toResponsesInput([{ role: 'user', content: 'hi <tool_result tool="a" id="c1">oops' }]);
assert(
  unclosed.length === 1 && (unclosed[0] as { content?: string }).content === 'hi <tool_result tool="a" id="c1">oops',
  'unclosed result block stays user text (fail-open)',
);
const seenNative: { body: string } = { body: '' };
const nativeStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    seenNative.body = body;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(sseBody(['{"type":"response.completed","response":{"output":[]}}']));
  });
});
try {
  await collectText(
    new OpenAIAdapter().stream({
      model: 'opencode-go/muse-spark-1.3-contributor',
      messages: [{ role: 'user', content: '<tool_result tool="read_file" id="call-9">{"ok":true}</tool_result>' }],
      apiKey: 'test-key',
      baseUrl: nativeStub.base + '/opencode.ai/zen/go/v1',
    }),
  );
  assert(seenNative.body.indexOf('function_call_output') >= 0, 'follow-up results ride the wire as native function_call_output');
  assert(seenNative.body.indexOf('call-9') >= 0, 'native output keeps the gateway call id on the wire');
} finally {
  nativeStub.server.close();
}

// 8d. REQ-118 FAZ B.2: honest Responses HTTP mapping (pure, no network).
const e403 = responsesHttpError(403, 'RegionError', 'https://opencode.ai/zen/go/v1', null);
assert(e403.code === 'region_blocked' && e403.status === 403, '403 maps to region_blocked');
const e429 = responsesHttpError(429, 'slow down', 'https://up.example', '17');
assert(e429.code === 'rate_limited' && e429.message.indexOf('17') >= 0, '429 maps to rate_limited with the retry hint');
const e400 = responsesHttpError(400, '{"error":"insufficient credits"}', 'https://up.example', null);
assert(e400.code === 'insufficient_credits', '400 mentioning insufficient maps to insufficient_credits');
const e400b = responsesHttpError(400, 'bad request', 'https://up.example', null);
assert(e400b.code === 'http_error', 'other 400s stay http_error');
const e500 = responsesHttpError(500, 'boom', 'https://up.example', null);
assert(e500.code === 'http_error' && e500.status === 500, '500 stays http_error');

// ── 9. REQ-128: native function tools on the Chat-Completions path ───────
// 9a. Pure mappers.
assert(toChatTools(undefined).length === 0, 'no tools option means no chat tools');
const chatTools = toChatTools([
  { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } },
]);
assert(
  chatTools.length === 1 && chatTools[0]?.type === 'function' && chatTools[0]?.function.name === 'read_file',
  'chat tools map to {type:function, function:{name}} entries',
);
const chatMsgs = toChatMessages([
  { role: 'user', content: 'read a.ts' },
  { role: 'assistant', content: 'on it', toolCalls: [{ id: 'call-1', name: 'read_file', arguments: '{"path":"a.ts"}' }] },
  { role: 'tool', content: 'file body', toolCallId: 'call-1', name: 'read_file' },
]);
assert(
  chatMsgs[1]?.role === 'assistant' && Array.isArray(chatMsgs[1]?.['tool_calls']),
  'assistant turn replays its native tool_calls',
);
assert(
  chatMsgs[2]?.role === 'tool' && chatMsgs[2]?.['tool_call_id'] === 'call-1' && chatMsgs[2]?.['content'] === 'file body',
  'tool row serializes as role:tool + tool_call_id + raw body',
);
const flatMsgs = toChatMessages(
  [
    { role: 'assistant', content: 'on it', toolCalls: [{ id: 'call-1', name: 'read_file', arguments: '{}' }] },
    { role: 'tool', content: 'file body', toolCallId: 'call-1', name: 'read_file' },
  ],
  { flatten: true },
);
assert(flatMsgs[0]?.['tool_calls'] === undefined && flatMsgs[1]?.role === 'user', 'flatten drops the native pairing');
assert(
  String(flatMsgs[1]?.['content']).indexOf('<tool_result') === 0 &&
    String(flatMsgs[1]?.['content']).indexOf('file body') >= 0,
  'flatten keeps the result body readable as text',
);

// 9b. Streaming fragment accumulation (id/name first, arguments split).
const acc = new ToolCallAccumulator();
acc.push([{ index: 0, id: 'call-7', function: { name: 'read_file', arguments: '{"pa' } }]);
acc.push([{ index: 0, function: { arguments: 'th":"a.t' } }]);
acc.push([{ index: 0, function: { arguments: 's"}' } }]);
acc.push([{ index: 1, id: 'call-8', function: { name: 'list_files', arguments: '{}' } }]);
const merged = acc.list();
assert(
  merged.length === 2 && merged[0]?.id === 'call-7' && merged[0]?.args === '{"path":"a.ts"}',
  'indexed fragments merge into one call with joined arguments',
);
assert(merged[1]?.name === 'list_files' && merged[1]?.id === 'call-8', 'a second index stays a second call');

// 9b-ii. Accumulator hardening (mirrors Hermes _ToolCallAccumulator).
// A reused index belongs to a NEW call once a different id shows up (Ollama
// recycles indices) — the previous arguments must not bleed into it.
const reused = new ToolCallAccumulator();
reused.push([{ index: 0, id: 'call-a', function: { name: 'read_file', arguments: '{"path":"a' } }]);
reused.push([{ index: 0, function: { arguments: '.ts"}' } }]);
reused.push([{ index: 0, id: 'call-b', function: { name: 'glob', arguments: '{"pat' } }]);
reused.push([{ index: 0, function: { arguments: 'tern":"*.ts"}' } }]);
const reusedCalls = reused.list();
assert(
  reusedCalls.length === 1 &&
    reusedCalls[0]?.id === 'call-b' &&
    reusedCalls[0]?.name === 'glob' &&
    reusedCalls[0]?.args === '{"pattern":"*.ts"}',
  'a reused index starts a fresh call instead of appending onto the closed one',
);
// Names are assigned, never appended (MiniMax/NIM resend the full name).
const renamed = new ToolCallAccumulator();
renamed.push([{ index: 0, id: 'call-c', function: { name: 'read_file' } }]);
renamed.push([{ index: 0, function: { name: 'read_file', arguments: '{}' } }]);
assert(
  renamed.list()[0]?.name === 'read_file',
  'a resent function name replaces the old one instead of doubling it',
);
// Many fragments must join to the exact payload (no loss, no duplication).
const many = new ToolCallAccumulator();
const pieces = Array.from({ length: 200 }, (_, i) => `x${i};`);
many.push([{ index: 0, id: 'call-d', function: { name: 'write_file', arguments: '["' } }]);
for (const piece of pieces) many.push([{ index: 0, function: { arguments: piece } }]);
many.push([{ index: 0, function: { arguments: '"]' } }]);
assert(
  many.list()[0]?.args === `["${pieces.join('')}"]`,
  'hundreds of fragments join back into the exact argument string',
);

// 9c. Capability probes (pure).
assert(looksLikeToolsUnsupported(400, 'tools are not supported by this model'), 'tools-unsupported wording is a probe hit');
assert(!looksLikeToolsUnsupported(400, 'invalid api key'), 'an unrelated 400 is never treated as a tools probe');
assert(looksLikeToolPairingError(400, 'tool_call_id must be provided for each tool message'), 'tool pairing errors are detected');
assert(!looksLikeToolPairingError(500, 'boom'), 'non-400/422 stays out of the pairing probe');

// 9d. Live stub: chat/completions carries tools[] and flushes native calls.
const seenChatTools: { path: string; tools: unknown; choice: unknown; msgs: unknown } = {
  path: '',
  tools: undefined,
  choice: undefined,
  msgs: undefined,
};
const chatStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    seenChatTools.path = req.url ?? '';
    try {
      const parsed = JSON.parse(body) as { tools?: unknown; tool_choice?: unknown; messages?: unknown };
      seenChatTools.tools = parsed.tools;
      seenChatTools.choice = parsed.tool_choice;
      seenChatTools.msgs = parsed.messages;
    } catch {
      seenChatTools.tools = undefined;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      sseBody([
        '{"choices":[{"delta":{"content":"checking"},"finish_reason":null}]}',
        '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-42","type":"function","function":{"name":"read_file","arguments":""}}]},"finish_reason":null}]}',
        '{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"path\\":"}}]},"finish_reason":null}]}',
        '{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a.ts\\"}"}}]},"finish_reason":"tool_calls"}]}',
        '[DONE]',
      ]),
    );
  });
});
try {
  const chunks: { type: string; delta?: string; tool?: string; input?: unknown; callId?: string; args?: string }[] = [];
  for await (const chunk of new OpenAIAdapter().stream({
    model: 'opencode-go/mimo-v2.5',
    messages: [
      { role: 'user', content: 'read a.ts' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'call-41', name: 'read_file', arguments: '{"path":"a.ts"}' }] },
      { role: 'tool', content: 'FILE BODY', toolCallId: 'call-41', name: 'read_file' },
    ],
    apiKey: 'test-key',
    baseUrl: `${chatStub.base}/v1`,
    tools: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: {} } }],
  })) {
    if (chunk.type === 'text_delta') chunks.push({ type: chunk.type, delta: chunk.delta });
    else if (chunk.type === 'native_tool_call') {
      chunks.push({ type: chunk.type, tool: chunk.tool, input: chunk.input, callId: chunk.callId, args: chunk.argumentsJson });
    }
  }
  const native = chunks.filter((c) => c.type === 'native_tool_call');
  const sentMsgs = seenChatTools.msgs as Record<string, unknown>[] | undefined;
  assert(seenChatTools.path === '/v1/chat/completions', 'chat path stays /chat/completions');
  assert(
    Array.isArray(seenChatTools.tools) &&
      (seenChatTools.tools as { function?: { name?: string } }[])[0]?.function?.name === 'read_file',
    'chat body carries the registry schema as function tools',
  );
  assert(seenChatTools.choice === 'auto', 'chat body sets tool_choice auto');
  assert(sentMsgs?.[1]?.['tool_calls'] !== undefined, 'native assistant turn rides the wire with tool_calls');
  assert(
    sentMsgs?.[2]?.['role'] === 'tool' && sentMsgs?.[2]?.['tool_call_id'] === 'call-41',
    'tool result rides as a native tool row',
  );
  assert(
    native.length === 1 && native[0]?.callId === 'call-42' && JSON.stringify(native[0]?.input) === '{"path":"a.ts"}',
    `fragmented tool_calls flush one native chunk, got ${JSON.stringify(native)}`,
  );
  assert(native[0]?.args === '{"path":"a.ts"}', 'raw argument string is preserved for replay');
  assert(
    chunks.some((c) => c.type === 'text_delta' && c.delta === 'checking'),
    'text beside a native call still streams',
  );
} finally {
  chatStub.server.close();
}

// 9e. Capability probe #1: an upstream that rejects `tools` is retried
// without the field (turn still runs through the text protocol).
let noToolsRequests = 0;
let secondBodyHadTools: boolean | undefined;
const noToolsStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    noToolsRequests += 1;
    const hasTools = body.indexOf('"tools"') >= 0;
    if (noToolsRequests === 2) secondBodyHadTools = hasTools;
    if (hasTools) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end('{"error":{"message":"tools are not supported by this endpoint"}}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(sseBody(['{"choices":[{"delta":{"content":"no-tools-ok"}}]}', '[DONE]']));
  });
});
try {
  let text = '';
  for await (const chunk of new OpenAIAdapter().stream({
    model: 'stub/text-only',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: 'test-key',
    baseUrl: `${noToolsStub.base}/v1`,
    tools: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: {} } }],
  })) {
    if (chunk.type === 'text_delta') text += chunk.delta;
  }
  assert(noToolsRequests === 2, `tools rejection is retried exactly once, got ${noToolsRequests} requests`);
  assert(secondBodyHadTools === false, 'the retry drops tools from the body');
  assert(text === 'no-tools-ok', 'the retried turn still streams its answer');
  assert(nativeToolsBlocked(`${noToolsStub.base}/v1`, 'stub/text-only'), 'the rejected pair is remembered');
} finally {
  noToolsStub.server.close();
}

// 9f. Capability probe #2: an upstream that rejects the native pairing gets
// the flattened text history instead — the turn still runs.
let pairRequests = 0;
let secondHadPairing: boolean | undefined;
const pairStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    pairRequests += 1;
    const hasPairing = body.indexOf('"tool_calls"') >= 0 || body.indexOf('"role":"tool"') >= 0;
    if (pairRequests === 2) secondHadPairing = hasPairing;
    if (hasPairing) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end('{"error":{"message":"tool_call_id must be provided for each tool message"}}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(sseBody(['{"choices":[{"delta":{"content":"flat-ok"}}]}', '[DONE]']));
  });
});
try {
  let text = '';
  for await (const chunk of new OpenAIAdapter().stream({
    model: 'stub/no-pairing',
    messages: [
      { role: 'assistant', content: '', toolCalls: [{ id: 'call-9', name: 'read_file', arguments: '{}' }] },
      { role: 'tool', content: 'BODY', toolCallId: 'call-9', name: 'read_file' },
      { role: 'user', content: 'continue' },
    ],
    apiKey: 'test-key',
    baseUrl: `${pairStub.base}/v1`,
  })) {
    if (chunk.type === 'text_delta') text += chunk.delta;
  }
  assert(pairRequests === 2, `pairing rejection is retried exactly once, got ${pairRequests} requests`);
  assert(secondHadPairing === false, 'the retry sends the flattened history');
  assert(text === 'flat-ok', 'the flattened turn still streams its answer');
} finally {
  pairStub.server.close();
}

// ── 10. REQ-128: Anthropic native tools (the protocol Claude Code speaks) ─
const anthTools = toAnthropicTools([
  { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } },
]);
assert(
  anthTools.length === 1 && anthTools[0]?.name === 'read_file' && anthTools[0]?.input_schema !== undefined,
  'anthropic tools map to {name, description, input_schema}',
);
assert(toAnthropicTools(undefined).length === 0, 'no tools means no anthropic tools array');
const anthMsgs = toAnthropicMessages([
  { role: 'user', content: 'read a.ts' },
  { role: 'assistant', content: 'on it', toolCalls: [{ id: 'toolu_1', name: 'read_file', arguments: '{"path":"a.ts"}' }] },
  { role: 'tool', content: 'FILE BODY', toolCallId: 'toolu_1', name: 'read_file' },
  { role: 'tool', content: 'SECOND', toolCallId: 'toolu_2', name: 'list_files' },
]);
const anthAssistant = anthMsgs[1];
assert(
  anthAssistant?.role === 'assistant' &&
    Array.isArray(anthAssistant.content) &&
    (anthAssistant.content as { type?: string }[])[1]?.type === 'tool_use',
  'anthropic assistant turn replays tool_use blocks',
);
const anthResults = anthMsgs[2];
assert(
  anthResults?.role === 'user' &&
    Array.isArray(anthResults.content) &&
    (anthResults.content as { type?: string; tool_use_id?: string }[]).length === 2 &&
    (anthResults.content as { tool_use_id?: string }[])[1]?.tool_use_id === 'toolu_2',
  'consecutive tool rows merge into ONE user message with both tool_result blocks',
);

const seenAnth: { path: string; body: Record<string, unknown> | undefined } = { path: '', body: undefined };
const anthStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    seenAnth.path = req.url ?? '';
    try {
      seenAnth.body = JSON.parse(body) as Record<string, unknown>;
    } catch {
      seenAnth.body = undefined;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"checking"}}\n\n' +
        'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_9","name":"read_file"}}\n\n' +
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":"}}\n\n' +
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\\"a.ts\\"}"}}\n\n' +
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n' +
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    );
  });
});
try {
  const chunks: { type: string; delta?: string; tool?: string; input?: unknown; callId?: string; args?: string }[] = [];
  for await (const chunk of new AnthropicAdapter().stream({
    model: 'anthropic/claude-sonnet-4-5',
    messages: [
      { role: 'user', content: 'read a.ts' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'toolu_8', name: 'read_file', arguments: '{"path":"a.ts"}' }] },
      { role: 'tool', content: 'FILE BODY', toolCallId: 'toolu_8', name: 'read_file' },
    ],
    apiKey: 'test-key',
    baseUrl: anthStub.base,
    tools: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: {} } }],
  })) {
    if (chunk.type === 'text_delta') chunks.push({ type: chunk.type, delta: chunk.delta });
    else if (chunk.type === 'native_tool_call') {
      chunks.push({ type: chunk.type, tool: chunk.tool, input: chunk.input, callId: chunk.callId, args: chunk.argumentsJson });
    }
  }
  const native = chunks.filter((c) => c.type === 'native_tool_call');
  assert(seenAnth.path === '/v1/messages', 'anthropic path stays /v1/messages');
  assert(Array.isArray(seenAnth.body?.['tools']) && seenAnth.body?.['stream'] === true, 'anthropic body carries tools[] and stream:true');
  assert(
    JSON.stringify(seenAnth.body?.['tool_choice']) === '{"type":"auto"}',
    'anthropic body sets tool_choice auto',
  );
  const sent = seenAnth.body?.['messages'] as { role?: string; content?: unknown }[] | undefined;
  assert(
    sent?.[1]?.role === 'assistant' && JSON.stringify(sent[1]?.content).includes('tool_use'),
    'anthropic assistant turn rides the wire with tool_use blocks',
  );
  assert(
    sent?.[2]?.role === 'user' && JSON.stringify(sent[2]?.content).includes('tool_result'),
    'anthropic tool result rides inside a user message',
  );
  assert(
    native.length === 1 && native[0]?.callId === 'toolu_9' && JSON.stringify(native[0]?.input) === '{"path":"a.ts"}',
    `streamed input_json_delta fragments flush one native call, got ${JSON.stringify(native)}`,
  );
  assert(native[0]?.args === '{"path":"a.ts"}', 'anthropic native call keeps the raw argument json');
  assert(chunks.some((c) => c.type === 'text_delta' && c.delta === 'checking'), 'anthropic text beside a tool call streams');
} finally {
  anthStub.server.close();
}

// ─── REQ-133: composer thinking budget ──────────────────────────────────────
resetReasoningMemory();

// 13a. Pure helpers — the level map and the narrow probe wording.
assert(activeEffort('off') === null && activeEffort(undefined) === null, 'off/undefined ask for no reasoning field');
assert(activeEffort('medium') === 'medium', 'a real level passes through');
assert(anthropicThinkingBudget('low') === 1024, 'low maps to the Anthropic thinking floor');
assert(anthropicThinkingBudget('high') === 6144, 'high stays under max_tokens');
assert(looksLikeReasoningUnsupported(400, 'reasoning_effort is not supported'), 'reasoning wording is a probe hit');
assert(!looksLikeReasoningUnsupported(400, 'invalid api key'), 'an unrelated 400 is never a reasoning probe');
assert(!looksLikeReasoningUnsupported(401, 'reasoning_effort not supported'), 'non-capability statuses are not probes');

// 13b. Chat-Completions: the picked level rides the body as reasoning_effort.
let thinkBody: Record<string, unknown> | undefined;
const thinkStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    thinkBody = JSON.parse(body) as Record<string, unknown>;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(sseBody(['{"choices":[{"delta":{"content":"think-ok"}}]}', '[DONE]']));
  });
});
try {
  let text = '';
  for await (const chunk of new OpenAIAdapter().stream({
    model: 'stub/thinking-ok',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: 'stub-key',
    baseUrl: `${thinkStub.base}/v1`,
    reasoningEffort: 'high',
  })) {
    if (chunk.type === 'text_delta') text += chunk.delta;
  }
  assert(
    thinkBody?.['reasoning_effort'] === 'high',
    `chat body carries reasoning_effort, got ${JSON.stringify(thinkBody?.['reasoning_effort'])}`,
  );
  assert(text === 'think-ok', 'the thinking turn still streams its answer');
} finally {
  thinkStub.server.close();
}

// 13c. `off` adds no reasoning field at all (the default path is unchanged).
let offBody: Record<string, unknown> | undefined;
const offStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    offBody = JSON.parse(body) as Record<string, unknown>;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(sseBody(['{"choices":[{"delta":{"content":"plain-ok"}}]}', '[DONE]']));
  });
});
try {
  for await (const _chunk of new OpenAIAdapter().stream({
    model: 'stub/no-thinking',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: 'stub-key',
    baseUrl: `${offStub.base}/v1`,
    reasoningEffort: 'off',
  })) {
    /* drain */
  }
  assert(offBody?.['reasoning_effort'] === undefined, 'off sends no reasoning_effort field');
} finally {
  offStub.server.close();
}

// 13d. Capability probe: an upstream that rejects the field is retried
// without it (the turn still runs) and the pair is remembered.
let rProbeRequests = 0;
let secondReasoning: unknown;
const rProbeStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    rProbeRequests += 1;
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (rProbeRequests === 2) secondReasoning = parsed['reasoning_effort'];
    if (parsed['reasoning_effort'] !== undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end('{"error":{"message":"reasoning_effort is not supported by this model"}}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(sseBody(['{"choices":[{"delta":{"content":"no-reasoning-ok"}}]}', '[DONE]']));
  });
});
try {
  let text = '';
  for await (const chunk of new OpenAIAdapter().stream({
    model: 'stub/no-reasoning',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: 'stub-key',
    baseUrl: `${rProbeStub.base}/v1`,
    reasoningEffort: 'medium',
  })) {
    if (chunk.type === 'text_delta') text += chunk.delta;
  }
  assert(rProbeRequests === 2, `reasoning rejection is retried exactly once, got ${rProbeRequests} requests`);
  assert(secondReasoning === undefined, 'the retry drops reasoning_effort from the body');
  assert(text === 'no-reasoning-ok', 'the retried turn still streams its answer');
  assert(
    reasoningBlocked(reasoningKey(`${rProbeStub.base}/v1`, 'no-reasoning')),
    'the rejected pair is remembered',
  );
} finally {
  rProbeStub.server.close();
}

// 13e. Anthropic: the level becomes an enabled thinking budget.
let anthThinkBody: Record<string, unknown> | undefined;
const anthThinkStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    anthThinkBody = JSON.parse(body) as Record<string, unknown>;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"anth-think-ok"}}\n\n' +
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    );
  });
});
try {
  let text = '';
  for await (const chunk of new AnthropicAdapter().stream({
    model: 'claude-stub-thinking',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: 'stub-key',
    baseUrl: anthThinkStub.base,
    reasoningEffort: 'medium',
  })) {
    if (chunk.type === 'text_delta') text += chunk.delta;
  }
  const thinking = anthThinkBody?.['thinking'] as { type?: string; budget_tokens?: number } | undefined;
  assert(
    thinking?.type === 'enabled' && thinking?.budget_tokens === 4096,
    `anthropic body enables thinking with the level budget, got ${JSON.stringify(thinking)}`,
  );
  assert(text === 'anth-think-ok', 'the anthropic thinking turn still streams its answer');
} finally {
  anthThinkStub.server.close();
}

// 13f. Anthropic probe: a model without extended thinking is retried without
// the field instead of failing the turn.
let anthProbeRequests = 0;
let anthSecondThinking: unknown;
const anthProbeStub = await listen((req, res) => {
  let body = '';
  req.on('data', (c) => {
    body += c;
  });
  req.on('end', () => {
    anthProbeRequests += 1;
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (anthProbeRequests === 2) anthSecondThinking = parsed['thinking'];
    if (parsed['thinking'] !== undefined) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end('{"error":{"message":"thinking is not supported by this model"}}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"anth-plain-ok"}}\n\n' +
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    );
  });
});
try {
  let text = '';
  for await (const chunk of new AnthropicAdapter().stream({
    model: 'claude-stub-no-thinking',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: 'stub-key',
    baseUrl: anthProbeStub.base,
    reasoningEffort: 'low',
  })) {
    if (chunk.type === 'text_delta') text += chunk.delta;
  }
  assert(anthProbeRequests === 2, `anthropic thinking rejection is retried once, got ${anthProbeRequests} requests`);
  assert(anthSecondThinking === undefined, 'the anthropic retry drops the thinking block');
  assert(text === 'anth-plain-ok', 'the anthropic retried turn still streams its answer');
} finally {
  anthProbeStub.server.close();
}

console.log(`\nAll ${passed} checks passed.`);
