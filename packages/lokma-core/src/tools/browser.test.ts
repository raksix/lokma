/**
 * Browser-tool unit probe (REQ-154) — `buildBrowserTools` against a FAKE
 * engine: tab resolution, honest failures, masking and argument forwarding.
 * Run: `bun src/tools/browser.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts (same precedent as tools.test.ts).
 * The REAL engine path is probed live via `scripts/probe-browser-agent-tools.ts`.
 */
import { browserTabs, BROWSER_TOOL_NAMES, BrowserEngineError, buildBrowserTools, type BrowserToolEngine } from '../index';

let passed = 0;
function check(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

type AnyResult = { ok: boolean; code?: string; message?: string; [k: string]: unknown };

const SESSION = 'sess_browser_tools_test';
browserTabs.clearForTests();

const calls: Array<{ method: string; args: unknown[] }> = [];
const fake: BrowserToolEngine = {
  readPage: async (tabId, opts) => {
    calls.push({ method: 'readPage', args: [tabId, opts] });
    return { url: 'https://example.com', title: 'Example', text: 'hello world', totalChars: 11, truncated: false, scrollY: 0, scrollHeight: 1400, viewportHeight: 800 };
  },
  scroll: async (tabId, opts) => {
    calls.push({ method: 'scroll', args: [tabId, opts] });
    return { scrollY: 900, scrollHeight: 5000, viewportHeight: 800, atTop: false, atBottom: false };
  },
  click: async (tabId, opts) => {
    calls.push({ method: 'click', args: [tabId, opts] });
    return { matched: opts.selector ?? `text=${opts.text}`, url: 'https://example.com/more', title: 'More', navigated: true };
  },
  type: async (tabId, opts) => {
    calls.push({ method: 'type', args: [tabId, opts] });
    return { selector: opts.selector, masked: true, url: 'https://example.com', title: 'Example', submitted: opts.submit === true };
  },
  screenshot: async (tabId, opts) => {
    calls.push({ method: 'screenshot', args: [tabId, opts] });
    return { file: '.lokma/browser-shots/x.png', absolutePath: '/tmp/x.png', width: 1280, height: 800, fullPage: opts.fullPage === true };
  },
};

const tools = buildBrowserTools('/tmp/ws', { sessionId: SESSION, engine: fake });
const byName = new Map(tools.map((t) => [t.name, t]));
check(tools.length === 5, 'five browser tools built');
check(
  tools.map((t) => t.name).join(',') === [...BROWSER_TOOL_NAMES].join(','),
  'tool names match BROWSER_TOOL_NAMES',
);
check(
  tools.every((t) => t.readOnly !== true),
  'browser tools are non-read-only (gated like writes)',
);

const scrollTool = byName.get('browser_scroll');
if (!scrollTool) throw new Error('FAIL: browser_scroll missing');

// 1) No tab yet → honest failure, engine not called.
const before = calls.length;
const noTab = (await scrollTool.handler({ direction: 'down' }, undefined)) as AnyResult;
check(noTab.ok === false && noTab.code === 'no_tab', 'scroll without a tab → no_tab');
check(calls.length === before, 'engine never called when no tab exists');

// 2) Default tab = the session's newest tab; result carries the position.
const { record } = browserTabs.open({ url: 'https://example.com', sessionId: SESSION });
const scrolled = (await scrollTool.handler({ direction: 'down' }, undefined)) as AnyResult;
check(scrolled.ok === true && scrolled.tabId === record.id && scrolled.scrollY === 900, 'scroll uses the session tab');
check(calls.at(-1)?.method === 'scroll', 'engine.scroll called');
check(JSON.stringify(calls.at(-1)?.args[1]) === '{"direction":"down"}', 'scroll forwards direction');

// 3) Explicit tabId targets that tab.
const other = browserTabs.open({ url: 'https://example.com/2', sessionId: SESSION }).record;
await scrollTool.handler({ direction: 'top', tabId: other.id }, undefined);
check(calls.at(-1)?.args[0] === other.id, 'explicit tabId targets that tab');

// 4) No engine → engine_unavailable (CLI hosts stay honest).
const noEngine = buildBrowserTools('/tmp/ws', { sessionId: SESSION }).find((t) => t.name === 'browser_scroll');
const unavailable = (await noEngine?.handler({ direction: 'down' }, undefined)) as AnyResult;
check(unavailable.ok === false && unavailable.code === 'engine_unavailable', 'no engine → engine_unavailable');

// 5) Typed engine errors map to structured failures.
const throwing: BrowserToolEngine = {
  ...fake,
  scroll: async () => {
    throw new BrowserEngineError('blocked_url', 'refusing a private address');
  },
};
const blockedTool = buildBrowserTools('/tmp/ws', { sessionId: SESSION, engine: throwing }).find((t) => t.name === 'browser_scroll');
const blocked = (await blockedTool?.handler({ direction: 'down' }, undefined)) as AnyResult;
check(blocked.ok === false && blocked.code === 'blocked_url' && blocked.message === 'refusing a private address', 'BrowserEngineError → structured failure');

// 6) Click requires selector or text.
const clickTool = byName.get('browser_click');
const badClick = (await clickTool?.handler({}, undefined)) as AnyResult;
check(badClick.ok === false && badClick.code === 'bad_target', 'click without target → bad_target');

// 7) Type never echoes the value; masking flag flows through.
const typeTool = byName.get('browser_type');
const typed = (await typeTool?.handler({ selector: '#pass', text: 'secret123', submit: true }, undefined)) as AnyResult;
check(typed.ok === true && typed.masked === true && typed.submitted === true, 'type reports masked + submitted');
check(!JSON.stringify(typed).includes('secret123'), 'type result never echoes the value');

// 8) read_page forwards maxChars.
const readTool = byName.get('browser_read_page');
await readTool?.handler({ maxChars: 1200 }, undefined);
check(JSON.stringify(calls.at(-1)?.args[1]) === '{"maxChars":1200}', 'read_page forwards maxChars');

// 9) screenshot forwards fullPage.
const shotTool = byName.get('browser_screenshot');
const shot = (await shotTool?.handler({ fullPage: true }, undefined)) as AnyResult;
check(shot.ok === true && shot.fullPage === true, 'screenshot forwards fullPage');
check(JSON.stringify(calls.at(-1)?.args[1]) === '{"fullPage":true}', 'screenshot forwards fullPage to the engine');

// 10) Schema validation rejects an unknown direction.
check(scrollTool.inputSchema.safeParse({ direction: 'sideways' }).success === false, 'schema rejects unknown direction');

// 11) touchAgentUse stamps the record (the pane badge reads it).
const urlBefore = record.url;
const stamped = browserTabs.touchAgentUse(record.id).record;
check(typeof stamped.lastAgentUseAt === 'string' && stamped.lastAgentUseAt.length > 0, 'touchAgentUse stamps lastAgentUseAt');
check(stamped.url === urlBefore, 'touchAgentUse never alters the url');

browserTabs.clearForTests();
console.log(`\nbrowser-tools: ${passed} checks passed.`);
