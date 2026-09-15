/**
 * browser.test.ts — probe for the pure BrowserPane helpers.
 * Run: `bun src/components/browser/browser.test.ts` (no DOM, no server).
 */
import {
  BROWSER_BLANK_URL,
  BROWSER_URL_CAP,
  canGoBack,
  canGoForward,
  embedUrlFor,
  groupByAgent,
  historyPosition,
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

console.log(`browser probe: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
