import type { Plugin } from '@/lib/api';

/**
 * PluginsPane pure helpers — Installed/Suspended tabs + search/category
 * filtering + add-from-URL validation over the REAL `GET /api/plugins`
 * registry (W6-23, Docs/23). No mock rows anywhere: tab membership
 * derives from the stored `enabled` flag, and endpoint counts are
 * `endpoints.length` from the server manifests. Client URL validation
 * mirrors the server rules in `lokma-core/src/plugins/registry.ts`.
 */

export type PluginTab = 'installed' | 'suspended';

export const PLUGIN_TABS: PluginTab[] = ['installed', 'suspended'];

export type PluginCategoryFilter = 'all' | Plugin['category'];

export const PLUGIN_CATEGORIES: PluginCategoryFilter[] = ['all', 'core', 'diagram', 'tool', 'skill'];

/** Installed/Suspended derive from the live `enabled` flag (no fake marketplace). */
export function tabOf(plugin: Pick<Plugin, 'enabled'>): PluginTab {
  return plugin.enabled ? 'installed' : 'suspended';
}

export function tabCounts(plugins: Plugin[]): Record<PluginTab, number> {
  const counts: Record<PluginTab, number> = { installed: 0, suspended: 0 };
  for (const plugin of plugins) counts[tabOf(plugin)] += 1;
  return counts;
}

export function filterPlugins(
  plugins: Plugin[],
  tab: PluginTab,
  query: string,
  category: PluginCategoryFilter,
): Plugin[] {
  const q = query.trim().toLowerCase();
  return plugins.filter((plugin) => {
    if (tabOf(plugin) !== tab) return false;
    if (category !== 'all' && plugin.category !== category) return false;
    if (!q) return true;
    return (
      plugin.name.toLowerCase().includes(q) ||
      plugin.description.toLowerCase().includes(q) ||
      plugin.id.toLowerCase().includes(q) ||
      plugin.author.toLowerCase().includes(q)
    );
  });
}

/** Initial squares (the concept uses these — no invented glyphs). */
export function initials(name: string): string {
  const clean = name.trim();
  return clean.slice(0, 2).toUpperCase() || 'PL';
}

/** Badge tone per category (concept parity: core terracotta, skill purple). */
export function categoryTone(category: Plugin['category']): string {
  if (category === 'core') return 'bg-terracotta text-white border-terracotta';
  if (category === 'skill') return 'bg-[#6C5CE7] text-white border-[#6C5CE7]';
  return 'bg-muted border-line';
}

/**
 * Client mirror of the server URL rules (https only, no credentials,
 * no local/private hosts). Returns the error message or null when valid.
 */
export function validatePluginUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return 'Enter an https plugin URL';
  if (url.length > 500) return 'URL is too long (max 500 chars)';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Not a valid URL';
  }
  if (parsed.protocol !== 'https:') return 'Only https plugin URLs are accepted';
  if (parsed.username || parsed.password || url.includes('@')) {
    return 'Plugin URLs must not carry credentials';
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const privateHost =
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]' ||
    host === '0.0.0.0' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host);
  if (privateHost) return 'Plugin URLs must not target local/private hosts';
  return null;
}

/** "6 plugins · 43 endpoints · 1 suspended" — footer strip over live rows. */
export function summarizeRegistry(plugins: Plugin[]): string {
  const endpoints = plugins.reduce((n, p) => n + p.endpoints.length, 0);
  const suspended = plugins.filter((p) => !p.enabled).length;
  const pluginWord = plugins.length === 1 ? 'plugin' : 'plugins';
  const suspendedPart = suspended === 0 ? 'none suspended' : `${suspended} suspended`;
  return `${plugins.length} ${pluginWord} · ${endpoints} endpoints · ${suspendedPart}`;
}
