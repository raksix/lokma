/**
 * PluginsPane pure-helper probe — run with:
 *   `bun src/components/plugins/plugins.test.ts` from `packages/lokma-web/web`.
 * Exits non-zero on the first failure (16/16 style like prior waves).
 */
import {
  categoryTone,
  filterPlugins,
  formatStars,
  initials,
  isMarketplaceInstalled,
  summarizeRegistry,
  tabCounts,
  tabOf,
  validatePluginUrl,
} from './plugins';
import type { MarketplaceItem, Plugin } from '@/lib/api';

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`ok: ${name}`);
}

const row = (over: Partial<Plugin> = {}): Plugin => ({
  id: '@lokma/plugin-archify',
  name: 'Archify',
  version: '0.0.1',
  author: 'lokma',
  description: 'Typed JSON IR diagrams',
  category: 'diagram',
  source: 'bundled',
  installed: true,
  enabled: true,
  routes: ['/api/archify'],
  endpoints: ['POST /api/archify/generate', 'GET /api/archify/list'],
  ...over,
});

// ─── tabs derive from the live enabled flag ──────────────────────────
check('enabled row is installed', tabOf(row()) === 'installed');
check('disabled row is suspended', tabOf(row({ enabled: false })) === 'suspended');
check(
  'counts split live rows',
  JSON.stringify(tabCounts([row(), row({ id: 'b', enabled: false }), row({ id: 'c' })])) ===
    JSON.stringify({ installed: 2, suspended: 1 }),
);
check('counts empty is 0/0', JSON.stringify(tabCounts([])) === JSON.stringify({ installed: 0, suspended: 0 }));

// ─── filtering (tab + query + category) ──────────────────────────────
const rows = [
  row(),
  row({ id: '@lokma/plugin-vault', name: 'Vault Sync', category: 'core', enabled: false }),
  row({ id: 'demo-tool', name: 'Demo Tool', category: 'tool', source: 'url', author: 'example.com' }),
];
check('installed tab hides suspended', filterPlugins(rows, 'installed', '', 'all').length === 2);
check('suspended tab shows one', filterPlugins(rows, 'suspended', '', 'all').length === 1);
check('query matches name', filterPlugins(rows, 'installed', 'arch', 'all').length === 1);
check('query matches author', filterPlugins(rows, 'installed', 'example', 'all').length === 1);
check('query matches id', filterPlugins(rows, 'suspended', 'vault', 'all').length === 1);
check('category filter narrows', filterPlugins(rows, 'installed', '', 'tool').length === 1);
check('category mismatch empties', filterPlugins(rows, 'installed', '', 'skill').length === 0);
check('blank query returns tab rows', filterPlugins(rows, 'installed', '   ', 'all').length === 2);

// ─── presentation ────────────────────────────────────────────────────
check('initials two letters', initials('Archify') === 'AR');
check('initials trims', initials('  x ') === 'X');
check('initials empty falls back', initials('') === 'PL');
check('core tone is terracotta', categoryTone('core').includes('terracotta'));
check('skill tone is purple', categoryTone('skill').includes('6C5CE7'));
check('tool tone is muted', categoryTone('tool').includes('muted'));

// ─── footer summary over live rows ───────────────────────────────────
check(
  'summary counts endpoints',
  summarizeRegistry(rows) === '3 plugins · 6 endpoints · 1 suspended',
);
check('summary empty registry', summarizeRegistry([]) === '0 plugins · 0 endpoints · none suspended');
check('summary singular plugin', summarizeRegistry([row()]).startsWith('1 plugin · 2 endpoints'));

// ─── URL validation mirrors the server ───────────────────────────────
check('empty url rejected', validatePluginUrl('') !== null);
check('http rejected', validatePluginUrl('http://example.com/p') !== null);
check('garbage rejected', validatePluginUrl('not a url') !== null);
check('credentials rejected', validatePluginUrl('https://user@example.com/p') !== null);
check('localhost rejected', validatePluginUrl('https://localhost/p') !== null);
check('loopback rejected', validatePluginUrl('https://127.0.0.1/p') !== null);
check('private 10 rejected', validatePluginUrl('https://10.0.0.1/p') !== null);
check('private 192 rejected', validatePluginUrl('https://192.168.1.1/p') !== null);
check('private 172 rejected', validatePluginUrl('https://172.16.0.1/p') !== null);
check('public 172 allowed', validatePluginUrl('https://172.32.0.1/p') === null);
check('public https allowed', validatePluginUrl('https://github.com/lokma/demo-plugin') === null);

// ─── marketplace helpers (live GitHub rows, never invented) ──────────
check('stars under 1000 plain', formatStars(42) === '42');
check('stars zero plain', formatStars(0) === '0');
check('stars 1000 is 1k', formatStars(1000) === '1k');
check('stars 1500 is 1.5k', formatStars(1500) === '1.5k');
check('stars 125000 is 125k', formatStars(125000) === '125k');
check('stars 2.5M compact', formatStars(2500000) === '2.5M');
check('stars negative falls back', formatStars(-3) === '0');
const marketItem: MarketplaceItem = {
  repo: 'acme/lokma-vault',
  name: 'lokma-vault',
  author: 'acme',
  description: 'Vault sync plugin',
  stars: 42,
  url: 'https://github.com/acme/lokma-vault',
  updatedAt: '2026-08-01T00:00:00Z',
};
check(
  'url match counts as installed',
  isMarketplaceInstalled(marketItem, [row({ source: 'url', url: marketItem.url })]) === true,
);
check('other urls are installable', isMarketplaceInstalled(marketItem, [row()]) === false);
check('empty registry is installable', isMarketplaceInstalled(marketItem, []) === false);

console.log(`\nplugins: ${passed} passed`);
