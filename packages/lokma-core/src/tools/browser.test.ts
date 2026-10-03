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
check(JSON.stringify(calls.at(-1)?.args[1]) === '{"cwd":"/tmp/ws","fullPage":true}', 'screenshot forwards cwd + fullPage to the engine');

// 10) Schema validation rejects an unknown direction.
check(scrollTool.inputSchema.safeParse({ direction: 'sideways' }).success === false, 'schema rejects unknown direction');

// 11) touchAgentUse stamps the record (the pane badge reads it).
const urlBefore = record.url;
const stamped = browserTabs.touchAgentUse(record.id).record;
check(typeof stamped.lastAgentUseAt === 'string' && stamped.lastAgentUseAt.length > 0, 'touchAgentUse stamps lastAgentUseAt');
check(stamped.url === urlBefore, 'touchAgentUse never alters the url');

browserTabs.clearForTests();
console.log(`\nbrowser-tools: ${passed} checks passed.`);

// ─── REQ-193 slice 10 (Kapsam 5): the agent-open stamp ───────────────────────
// The pane's "Ajan açtı" badge is driven by a FIELD on the record, so these
// are the asserts that keep it honest. The negative direction carries the
// weight: a stamp that is never cleared would sit over a page the USER typed,
// which is the exact ambiguity the badge was added to remove.
check(browserTabs.open({ sessionId: 'sess_user' }).record.openedByAgentAt === null,
  'a plain open stamps no agent (user navigation)');

const agentTab = browserTabs.open({ sessionId: 'sess_agent', url: 'https://agent.example', openedByAgent: true }).record;
check(typeof agentTab.openedByAgentAt === 'string' && agentTab.openedByAgentAt.length > 0,
  'an agent open stamps openedByAgentAt');

// A reuse that navigates is the agent's page again (REQ-146 reuse keeps the id).
const reusedTab = browserTabs.openOrReuse({ sessionId: 'sess_agent', url: 'https://agent-2.example', openedByAgent: true });
check(reusedTab.reused === true && reusedTab.record.id === agentTab.id, 'reuse: the same record is reused');
check(reusedTab.record.url === 'https://agent-2.example/', 'reuse: the record navigated to the agent url');
check(typeof reusedTab.record.openedByAgentAt === 'string' && reusedTab.record.openedByAgentAt.length > 0,
  'reuse: the agent stamp is present on the reused record');

// A plain navigate CLEARS the stamp — this is the negative control that makes
// "the badge shows" mean anything. Not "the stamp differs from the creation
// one": two ISO stamps in the same millisecond are byte-equal, so an
// inequality assert would be flaky while proving nothing about re-stamping.
const cleared = browserTabs.navigate(reusedTab.record.id, 'https://typed.example').record;
check(cleared.url === 'https://typed.example/', 'navigate moved the record to the typed url');
check(cleared.openedByAgentAt === null, 'navigate clears the agent stamp (the user chose this page)');

// Re-stamping is observable through the clear→set cycle above, not through a
// clock: a second agent open on the SAME record brings the stamp back.
const restamped = browserTabs.openOrReuse({ sessionId: 'sess_agent', url: 'https://agent-3.example', openedByAgent: true });
check(typeof restamped.record.openedByAgentAt === 'string', 'a later agent open re-stamps the record');

// A blank reuse touches without navigating, and must still stamp (the agent
// looked at the live tab) while leaving the url alone. The url is read from
// the record rather than hardcoded: the restamp above moved it, and a literal
// here would assert a premise another test already changed.
const blankBefore = restamped.record.url;
const blankReuse = browserTabs.openOrReuse({ sessionId: 'sess_agent', openedByAgent: true });
check(blankReuse.reused === true && blankReuse.record.url === blankBefore, 'blank reuse never navigates away');
check(typeof blankReuse.record.openedByAgentAt === 'string', 'blank reuse re-stamps the agent touch');

// REST cannot forge the badge: the route builds OpenTabOpts itself and has no
// field for it, so the closest REST caller (a plain open) leaves it null.
const restShaped = browserTabs.open({ sessionId: 'sess_rest', url: 'https://rest.example' } as { sessionId: string; url: string });
check(restShaped.record.openedByAgentAt === null, 'a REST-shaped open carries no agent stamp');
