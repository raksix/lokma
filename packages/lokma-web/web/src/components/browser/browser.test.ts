/**
 * browser.test.ts — probe for the pure BrowserPane helpers.
 * Run: `bun src/components/browser/browser.test.ts` (no DOM, no server).
 */
import {
  BROWSER_BLANK_URL,
  BROWSER_PROXY_PATH,
  BROWSER_URL_CAP,
  canGoBack,
  canGoForward,
  embedUrlFor,
  frameSrcFor,
  groupByAgent,
  historyPosition,
  isPipedUrl,
  isProxySrc,
  paneUrlFor,
  shortScope,
  tabLabel,
  validateTabUrl,
} from './browser';
import type { BrowserTab } from '@/lib/api';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${name}`);
  }
}

const tab = (over: Partial<BrowserTab> = {}): BrowserTab => ({
  id: 'tab_abc123',
  url: 'https://example.com/docs',
  history: ['https://example.com/', 'https://example.com/docs'],
  index: 1,
  agentId: null,
  sessionId: 'sess_1',
  cwd: '/tmp/work/repo',
  createdAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
  ...over,
});

// validateTabUrl
check('empty address rejected', validateTabUrl('   ') !== null);
check('plain https url valid', validateTabUrl('https://example.com/x') === null);
check('bare host valid (gains https)', validateTabUrl('example.com/docs') === null);
check('blank page valid', validateTabUrl(BROWSER_BLANK_URL) === null);
check('javascript scheme rejected', validateTabUrl('javascript:alert(1)') !== null);
check('data scheme rejected', validateTabUrl('data:text/html,hi') !== null);
check('over-cap rejected', validateTabUrl(`https://e.com/${'a'.repeat(BROWSER_URL_CAP)}`) !== null);

// tabLabel
check('blank tab label', tabLabel(tab({ url: BROWSER_BLANK_URL })) === 'New tab');
check('host label', tabLabel(tab({ url: 'https://example.com/' })) === 'example.com');
check('host+path label', tabLabel(tab()) === 'example.com/docs');

// canGoBack / canGoForward
check('mid-history goes both ways', canGoBack(tab()) && canGoForward(tab()) === false);
check(
  'oldest cannot go back',
  canGoBack(tab({ index: 0 })) === false && canGoForward(tab({ index: 0 })) === true,
);
check('single entry goes nowhere', canGoBack(tab({ history: ['https://e.com/'], index: 0 })) === false);

// historyPosition
check('position line', historyPosition(tab()) === '2 of 2');
check('first position', historyPosition(tab({ index: 0 })) === '1 of 2');

// groupByAgent
const grouped = groupByAgent([
  tab({ id: 't1', agentId: 'builder-1' }),
  tab({ id: 't2', agentId: null }),
  tab({ id: 't3', agentId: 'reviewer-2' }),
  tab({ id: 't4', agentId: 'builder-1' }),
]);
check('three groups', grouped.length === 3);
check('unowned group trails', grouped[2].agentId === null);
check('owned group keeps both tabs', grouped[0].tabs.length === 2);
check('empty list, empty groups', groupByAgent([]).length === 0);

// shortScope
check('basename scope', shortScope('/tmp/work/repo') === 'repo');
check('null scope', shortScope(null) === 'no scope');
check('trailing slash trimmed', shortScope('/tmp/work/repo/') === 'repo');

// embedUrlFor (REQ-150) — the watch page refuses framing, the embed does not.
check('watch url becomes the nocookie embed',
  embedUrlFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ') === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
check('watch url keeps extra params out of the embed',
  embedUrlFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PLabc123') === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
check('short link becomes the embed', embedUrlFor('https://youtu.be/dQw4w9WgXcQ') === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
check('shorts link becomes the embed',
  embedUrlFor('https://www.youtube.com/shorts/dQw4w9WgXcQ') === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
check('live link becomes the embed',
  embedUrlFor('https://m.youtube.com/live/dQw4w9WgXcQ') === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
check('playlist becomes the videoseries embed',
  embedUrlFor('https://www.youtube.com/playlist?list=PLabcdef123456') === 'https://www.youtube-nocookie.com/embed/videoseries?list=PLabcdef123456');
check('plain channel page has no embed', embedUrlFor('https://www.youtube.com/@somebody') === null);
check('youtube home has no embed', embedUrlFor('https://www.youtube.com/') === null);
check('already-embedded url stays put',
  embedUrlFor('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ') === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
check('other sites are untouched', embedUrlFor('https://example.com/watch?v=dQw4w9WgXcQ') === null);
check('garbage input is null', embedUrlFor('not a url') === null && embedUrlFor('') === null);

// paneUrlFor (REQ-153) — pages YouTube refuses to frame go through Piped.
check('youtube home goes through the Piped front-end', paneUrlFor('https://www.youtube.com/') === 'https://piped.video/');
check('a channel page keeps its path', paneUrlFor('https://www.youtube.com/@somebody') === 'https://piped.video/@somebody');
check('a search page maps to Piped search',
  paneUrlFor('https://www.youtube.com/results?search_query=lofi+beats') === 'https://piped.video/search?q=lofi%20beats');
check('a playlist with a real list id prefers the no-cookie player',
  paneUrlFor('https://www.youtube.com/playlist?list=PLabc123456') === 'https://www.youtube-nocookie.com/embed/videoseries?list=PLabc123456');
check('a playlist without a list id falls back to Piped',
  paneUrlFor('https://www.youtube.com/playlist') === 'https://piped.video/playlist');
check('a watch link still prefers the no-cookie player',
  paneUrlFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ') === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
check('non-YouTube sites are left alone', paneUrlFor('https://example.com/foo') === null);
check('garbage is left alone', paneUrlFor('not a url') === null && paneUrlFor('') === null);
check('isPipedUrl spots the front-end', isPipedUrl('https://piped.video/trending') === true && isPipedUrl('https://youtube.com/') === false && isPipedUrl(null) === false);

// frameSrcFor (REQ-193) — the pane must stop handing raw URLs to the iframe,
// which is what made a server-side 127.0.0.1 tab ask the CLIENT for a loopback
// that does not exist on the user's machine.
const loopbackSrc = frameSrcFor('http://127.0.0.1:3014/');
check('a loopback tab is fetched by the server, not the client',
  loopbackSrc === BROWSER_PROXY_PATH + '?url=' + encodeURIComponent('http://127.0.0.1:3014/'));
check('a normal page also goes through the proxy',
  frameSrcFor('https://example.com/docs') === BROWSER_PROXY_PATH + '?url=' + encodeURIComponent('https://example.com/docs'));
check('the target url survives encoding round-trip',
  decodeURIComponent(frameSrcFor('https://example.com/a?b=1&c=2#z').split('?url=')[1]) === 'https://example.com/a?b=1&c=2#z');
check('a query with & does not split into a second parameter',
  frameSrcFor('https://example.com/?a=1&b=2').split('?url=').length === 2);
check('youtube video keeps the native no-cookie embed (quality over proxy)',
  frameSrcFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ') === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
check('a youtube page without an embed keeps Piped, not the proxy',
  frameSrcFor('https://www.youtube.com/') === 'https://piped.video/');
check('the blank page renders no frame at all',
  frameSrcFor(BROWSER_BLANK_URL) === '' && frameSrcFor('') === '' && frameSrcFor('   ') === '');
check('whitespace around a url is trimmed before it is encoded',
  frameSrcFor('  https://example.com/x  ') === BROWSER_PROXY_PATH + '?url=' + encodeURIComponent('https://example.com/x'));
check('isProxySrc tells proxy from embed', isProxySrc(loopbackSrc) === true
  && isProxySrc('https://www.youtube-nocookie.com/embed/abc') === false
  && isProxySrc('') === false && isProxySrc(null) === false);

console.log(`browser probe: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
