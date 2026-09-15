/**
 * Live probe — the browser engine drives a REAL Chromium (REQ-154).
 *
 * Run from the repo root: `bun scripts/probe-browser-agent-tools.ts`
 *
 * Proves against the real network + a real headless Chromium:
 *   scroll moves the page (down grows, top/bottom land), read_page returns
 *   page-specific text, click navigates, type+submit runs a search, the
 *   screenshot writes a real PNG, the SSRF guard refuses loopback and a
 *   blank tab fails honestly. No model involved — the tools call the live
 *   engine module directly; the agent-level path is
 *   `scripts/probe-agent-browser-scroll.cjs`.
 */
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserTabs, buildBrowserTools, type BrowserToolEngine } from '@lokma/core';
import { BrowserEngine } from '../packages/lokma-web/server/src/browser-engine';

let passed = 0;
function check(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

type AnyResult = Record<string, unknown> & { ok: boolean; code?: string };

const engine = new BrowserEngine();
const SESSION = 'sess_probe_browser_tools';
const cwd = mkdtempSync(join(tmpdir(), 'lokma-browser-probe-'));
browserTabs.clearForTests();
browserTabs.open({ url: 'https://en.wikipedia.org/wiki/Web_browser', sessionId: SESSION, cwd });

const tool = (name: string) => {
  const t = buildBrowserTools(cwd, { sessionId: SESSION, engine }).find((x) => x.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
};
const call = async (name: string, input: Record<string, unknown>): Promise<AnyResult> =>
  (await tool(name).handler(input, undefined)) as AnyResult;
const scroll = (input: Record<string, unknown>) => call('browser_scroll', input);

// 1. read_page — real content from the tab's url
const read = await call('browser_read_page', { maxChars: 12_000 });
check(read.ok === true, 'read_page ok');
check(
  typeof read.title === 'string' && String(read.title).toLowerCase().includes('web browser'),
  `title is the real page title (${String(read.title).slice(0, 60)})`,
);
check(Number(read.totalChars) > 3_000, `real page text (${read.totalChars} chars)`);

// 2. scroll down twice — the position grows and the page is taller than the viewport
const s0 = await scroll({ direction: 'down' });
check(s0.ok === true && Number(s0.scrollY) > 0, `scroll down moved the page (scrollY=${s0.scrollY})`);
const s1 = await scroll({ direction: 'down' });
check(s1.ok === true && Number(s1.scrollY) > Number(s0.scrollY), `second scroll went further (${s0.scrollY} -> ${s1.scrollY})`);
check(Number(s1.scrollHeight) > Number(s1.viewportHeight), 'page is taller than the viewport');

// 3. top / bottom edges
const top = await scroll({ direction: 'top' });
check(top.ok === true && top.atTop === true, 'top lands at the top');
const bottom = await scroll({ direction: 'bottom' });
check(bottom.ok === true && bottom.atBottom === true, 'bottom lands at the end');
await scroll({ direction: 'top' });

// 4. click follows a real link (Wikipedia renders content links with absolute
//    https://en.wikipedia.org/wiki/... hrefs — match the /wiki/ path).
const click = await call('browser_click', { selector: '#mw-content-text p a[href*="/wiki/"]' });
check(click.ok === true && click.navigated === true && /wikipedia\.org\/wiki\//.test(String(click.url)), `click navigated (${String(click.url).slice(0, 70)})`);

// 5. type + submit runs the wiki search
const typed = await call('browser_type', { selector: '#searchInput', text: 'Linux', submit: true });
check(typed.ok === true && typed.submitted === true, 'type submitted the field');
check(/search/i.test(String(typed.url)) || String(typed.url).includes('Linux'), `submit navigated to a search (${String(typed.url).slice(0, 70)})`);
check(typed.masked === false, 'ordinary field is not flagged as secret');

// 6. screenshot → a real PNG on disk
const shot = await call('browser_screenshot', { fullPage: true });
check(shot.ok === true && existsSync(String(shot.absolutePath)), `screenshot file exists (${shot.file})`);
const head = readFileSync(String(shot.absolutePath)).subarray(0, 8);
check(head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47, 'screenshot is a real PNG');

// 7. SSRF guard refuses loopback
const localTab = browserTabs.open({ url: 'http://127.0.0.1:3456/health', sessionId: SESSION }).record;
const blocked = await scroll({ direction: 'down', tabId: localTab.id });
check(blocked.ok === false && blocked.code === 'blocked_url', 'loopback url is refused by the SSRF guard');

// 8. blank tab fails honestly
const blankTab = browserTabs.open({ sessionId: SESSION }).record;
const noPage = await scroll({ direction: 'down', tabId: blankTab.id });
check(noPage.ok === false && noPage.code === 'no_page', 'blank tab → no_page');

await engine.shutdown();
browserTabs.clearForTests();
console.log(`\nbrowser-agent-tools probe: ${passed} checks passed (cwd ${cwd}).`);
process.exit(0);
