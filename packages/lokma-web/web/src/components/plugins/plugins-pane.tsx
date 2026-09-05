import * as React from 'react';
import { ChevronDown, ChevronRight, Download, Layers, Puzzle, Search, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, api, type MarketplaceItem, type Plugin } from '@/lib/api';
import {
  PLUGIN_CATEGORIES,
  categoryTone,
  filterPlugins,
  formatStars,
  initials,
  isMarketplaceInstalled,
  summarizeRegistry,
  tabCounts,
  validatePluginUrl,
  type PluginCategoryFilter,
  type PluginTab,
} from './plugins';

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('lokma-toast', { detail: message }));
}

function errMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
}

/**
 * PluginsPane — kernel registry + hot toggle + add-from-URL + remote
 * marketplace (W6-23 + Phase 2 wiring, Docs/23 §9).
 * Concept layout 1:1 (header tabs + search + rows + kernel footer), but every
 * control is live: `GET /api/plugins` (bundled manifests with REAL endpoint
 * lists + URL records), `PATCH /api/plugins/:id { enabled }` (suspends the
 * plugin's routes server-side with 503 — no restart), `POST
 * /api/plugins/install { url }` (strict validation, stored suspended),
 * `DELETE /api/plugins/:id` (URL records only), `GET
 * /api/plugins/marketplace?q=` (live GitHub `lokma-plugin` topic — every
 * row is a real repo, Install feeds the same `POST /install` endpoint).
 * NOT ported: the concept's invented `downloads` figures and the fake
 * marketplace rows with toast-only Install buttons.
 */
export function PluginsPane() {
  const [plugins, setPlugins] = React.useState<Plugin[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<PluginTab>('installed');
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState<PluginCategoryFilter>('all');
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [manifests, setManifests] = React.useState<Record<string, Plugin>>({});
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [url, setUrl] = React.useState('');
  const [urlError, setUrlError] = React.useState<string | null>(null);
  const [installing, setInstalling] = React.useState(false);
  // Remote marketplace (live GitHub topic — no local state until Install).
  const [marketOpen, setMarketOpen] = React.useState(false);
  const [mquery, setMquery] = React.useState('');
  const [mitems, setMitems] = React.useState<MarketplaceItem[] | null>(null);
  const [msource, setMsource] = React.useState('');
  const [mloading, setMloading] = React.useState(false);
  const [merror, setMerror] = React.useState<string | null>(null);
  const [minstalling, setMinstalling] = React.useState<Record<string, boolean>>({});

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.listPlugins();
      setPlugins(res.plugins);
    } catch (e) {
      setLoadError(errMessage(e));
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const setRowBusy = (id: string, value: boolean) =>
    setBusy((prev) => ({ ...prev, [id]: value }));

  const toggle = async (plugin: Plugin) => {
    setRowBusy(plugin.id, true);
    try {
      const res = await api.setPluginEnabled(plugin.id, !plugin.enabled);
      setPlugins((prev) => prev?.map((p) => (p.id === plugin.id ? res.plugin : p)) ?? prev);
      toast(res.plugin.enabled ? `${res.plugin.name} enabled` : `${res.plugin.name} suspended — its routes answer 503`);
    } catch (e) {
      toast(`Toggle failed — ${errMessage(e)}`);
    } finally {
      setRowBusy(plugin.id, false);
    }
  };

  const toggleKernel = async (plugin: Plugin) => {
    const open = !expanded[plugin.id];
    setExpanded((prev) => ({ ...prev, [plugin.id]: open }));
    if (open && !manifests[plugin.id]) {
      try {
        const res = await api.getPlugin(plugin.id);
        setManifests((prev) => ({ ...prev, [plugin.id]: res.plugin }));
      } catch (e) {
        toast(`Manifest failed — ${errMessage(e)}`);
      }
    }
  };

  const install = async () => {
    const clientError = validatePluginUrl(url);
    if (clientError) {
      setUrlError(clientError);
      return;
    }
    setUrlError(null);
    setInstalling(true);
    try {
      const res = await api.installPlugin(url.trim());
      setPlugins((prev) => (prev ? [...prev, res.plugin] : [res.plugin]));
      setUrl('');
      setTab('suspended');
      toast(`${res.plugin.name} added — suspended until enabled`);
    } catch (e) {
      setUrlError(errMessage(e));
    } finally {
      setInstalling(false);
    }
  };

  const remove = async (plugin: Plugin) => {
    if (confirmDelete !== plugin.id) {
      setConfirmDelete(plugin.id);
      return;
    }
    setConfirmDelete(null);
    setRowBusy(plugin.id, true);
    try {
      await api.deletePlugin(plugin.id);
      setPlugins((prev) => prev?.filter((p) => p.id !== plugin.id) ?? prev);
      toast(`${plugin.name} deleted`);
    } catch (e) {
      toast(`Delete failed — ${errMessage(e)}`);
    } finally {
      setRowBusy(plugin.id, false);
    }
  };

  const counts = tabCounts(plugins ?? []);
  const rows = plugins ? filterPlugins(plugins, tab, query, category) : [];

  const searchMarket = React.useCallback(async (q: string) => {
    setMloading(true);
    setMerror(null);
    try {
      const res = await api.searchMarketplace(q.trim());
      setMitems(res.items);
      setMsource(res.source);
    } catch (e) {
      setMerror(errMessage(e));
    } finally {
      setMloading(false);
    }
  }, []);

  const openMarket = () => {
    setMarketOpen(true);
    // Browse the whole topic on first open (empty q = no filter).
    if (mitems === null && !mloading && merror === null) void searchMarket('');
  };

  const installFromMarket = async (item: MarketplaceItem) => {
    setMinstalling((prev) => ({ ...prev, [item.repo]: true }));
    try {
      const res = await api.installPlugin(item.url);
      setPlugins((prev) => (prev ? [...prev, res.plugin] : [res.plugin]));
      toast(`${res.plugin.name} added — suspended until enabled`);
    } catch (e) {
      toast(`Install failed — ${errMessage(e)}`);
    } finally {
      setMinstalling((prev) => ({ ...prev, [item.repo]: false }));
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0 overflow-x-auto">
        <Puzzle className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Plugins</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">
          Kernel manifest · hot toggle · no restart
        </span>
        <span className="ml-auto flex shrink-0 gap-1">
          <Button
            variant={tab === 'installed' && !marketOpen ? 'default' : 'ghost'}
            size="sm"
            className="h-5 px-2 text-[11px]"
            onClick={() => {
              setMarketOpen(false);
              setTab('installed');
            }}
          >
            Installed {counts.installed}
          </Button>
          <Button
            variant={tab === 'suspended' && !marketOpen ? 'default' : 'ghost'}
            size="sm"
            className="h-5 px-2 text-[11px]"
            onClick={() => {
              setMarketOpen(false);
              setTab('suspended');
            }}
          >
            Suspended {counts.suspended}
          </Button>
          <Button
            variant={marketOpen ? 'default' : 'ghost'}
            size="sm"
            className="h-5 px-2 text-[11px]"
            onClick={openMarket}
          >
            Marketplace
          </Button>
        </span>
      </div>

      {marketOpen ? (
        <div className="p-2 border-b border-line/50 space-y-2">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <label htmlFor="marketplace-search" className="sr-only">
                Search the plugin marketplace
              </label>
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
              <Input
                id="marketplace-search"
                placeholder="Search GitHub lokma-plugin repos…"
                value={mquery}
                onChange={(e) => setMquery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void searchMarket(mquery);
                }}
                className="pl-7 h-7 text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => void searchMarket(mquery)}
              disabled={mloading}
            >
              <Search className="w-3 h-3" />
              {mloading ? 'Searching…' : 'Search'}
            </Button>
          </div>
          <div className="text-[11px] text-zinc-400">
            Live GitHub <span className="font-mono">lokma-plugin</span> topic{msource ? ` — ${msource}` : ''} · Install adds the repo URL
            suspended, like Add from URL.
          </div>
        </div>
      ) : (
      <div className="p-2 border-b border-line/50 space-y-2">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <label htmlFor="plugins-search" className="sr-only">
              Search plugins
            </label>
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
            <Input
              id="plugins-search"
              placeholder="Search name, description, author…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-7 h-7 text-xs"
            />
          </div>
          <label htmlFor="plugins-category" className="sr-only">
            Filter by category
          </label>
          <select
            id="plugins-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as PluginCategoryFilter)}
            className="h-7 text-xs rounded-md border border-input bg-transparent px-2"
          >
            {PLUGIN_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'All categories' : c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 items-start">
          <div className="relative flex-1">
            <label htmlFor="plugins-url" className="sr-only">
              Plugin URL (https)
            </label>
            <Download className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
            <Input
              id="plugins-url"
              placeholder="Add from URL — https git/tarball…"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void install();
              }}
              className="pl-7 h-7 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => void install()} disabled={installing}>
            <Download className="w-3 h-3" />
            {installing ? 'Adding…' : 'Add'}
          </Button>
        </div>
        {urlError && <div className="text-[11px] text-red-500">{urlError}</div>}
        <div className="text-[11px] text-zinc-400">
          URL records are stored suspended with version 0.0.0 — metadata resolves on first fetch (follow-up).
        </div>
      </div>
      )}

      {marketOpen ? (
      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {merror && (
          <div className="p-3 rounded-lg border border-red-200 text-xs text-red-600">
            {merror}{' '}
            <button type="button" className="underline" onClick={() => void searchMarket(mquery)}>
              Retry
            </button>
          </div>
        )}
        {mloading && mitems === null && !merror && (
          <div className="p-6 text-center text-xs text-zinc-400">Searching the marketplace…</div>
        )}
        {(mitems ?? []).map((item) => {
          const installed = isMarketplaceInstalled(item, plugins ?? []);
          const busy = minstalling[item.repo] ?? false;
          return (
            <div
              key={item.repo}
              className="flex gap-3 p-2.5 rounded-lg border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/20 hover:shadow-sm transition"
            >
              <span className="w-8 h-8 rounded-lg bg-[#262624] dark:bg-white text-white dark:text-black grid place-items-center text-[10px] font-bold shrink-0">
                {initials(item.name)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold flex items-center gap-1.5 flex-wrap">
                  {item.name}
                  <span className="text-[11px] font-normal text-zinc-400">· {item.author}</span>
                  <span className="flex items-center gap-0.5 text-[11px] font-normal text-zinc-400">
                    <Star className="w-3 h-3" /> {formatStars(item.stars)}
                  </span>
                </div>
                <div className="text-xs text-zinc-500 leading-4 line-clamp-2">
                  {item.description || 'No description upstream.'}
                </div>
                <div className="mt-1 text-[11px] text-zinc-400 font-mono truncate">{item.repo}</div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button
                  variant={installed ? 'ghost' : 'outline'}
                  size="sm"
                  className="h-6 text-xs px-2 gap-1"
                  onClick={() => void installFromMarket(item)}
                  disabled={installed || busy}
                  title={installed ? 'Already in your registry' : `Install ${item.repo}`}
                >
                  <Download className="w-3 h-3" />
                  {installed ? 'Installed' : busy ? 'Adding…' : 'Install'}
                </Button>
                <a
                  className="text-[11px] text-zinc-400 underline text-center"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Repo
                </a>
              </div>
            </div>
          );
        })}
        {!mloading && !merror && mitems !== null && mitems.length === 0 && (
          <div className="p-6 text-center text-xs text-zinc-400">
            No plugins carry the lokma-plugin topic yet — publish a repo with that topic to list it here.
          </div>
        )}
      </div>
      ) : (
      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {loadError && (
          <div className="p-3 rounded-lg border border-red-200 text-xs text-red-600">
            {loadError}{' '}
            <button type="button" className="underline" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}
        {plugins === null && !loadError && (
          <div className="p-6 text-center text-xs text-zinc-400">Loading plugins…</div>
        )}
        {plugins !== null &&
          rows.map((plugin) => {
            const manifest = manifests[plugin.id] ?? plugin;
            const isOpen = expanded[plugin.id] ?? false;
            return (
              <div
                key={plugin.id}
                className="flex gap-3 p-2.5 rounded-lg border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/20 hover:shadow-sm transition"
              >
                <span className="w-8 h-8 rounded-lg bg-[#262624] dark:bg-white text-white dark:text-black grid place-items-center text-[10px] font-bold shrink-0">
                  {initials(plugin.name)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold flex items-center gap-1.5 flex-wrap">
                    {plugin.name} <span className="text-[11px] font-normal text-zinc-400">· {plugin.version}</span>
                    <span className={`hidden sm:inline px-1 py-0 rounded border text-[10px] ${categoryTone(plugin.category)}`}>
                      {plugin.category}
                    </span>
                    {plugin.source === 'url' && (
                      <span className="hidden sm:inline px-1 py-0 rounded border text-[10px] bg-muted border-line">url</span>
                    )}
                    <span
                      className={`w-2 h-2 rounded-full ${plugin.enabled ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                      title={plugin.enabled ? 'Enabled' : 'Suspended'}
                    />
                  </div>
                  <div className="text-xs text-zinc-500 leading-4 line-clamp-2">{plugin.description}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3" /> {plugin.endpoints.length} endpoints
                    </span>
                    <span className="hidden sm:inline">
                      {plugin.author} · {plugin.id}
                    </span>
                  </div>
                  {isOpen && (
                    <div className="mt-2 rounded-md border border-line bg-muted/20 p-2 text-[11px] text-zinc-500">
                      <div className="font-semibold text-zinc-600 dark:text-zinc-300">
                        Kernel manifest — ctx.routes / endpoints
                      </div>
                      {manifest.routes.length > 0 ? (
                        <div className="mt-1">prefixes: {manifest.routes.join(', ')}</div>
                      ) : (
                        <div className="mt-1">No owned routes yet (metadata resolves on first fetch).</div>
                      )}
                      {manifest.endpoints.length > 0 && (
                        <ul className="mt-1 space-y-0.5 font-mono">
                          {manifest.endpoints.map((endpoint) => (
                            <li key={endpoint}>{endpoint}</li>
                          ))}
                        </ul>
                      )}
                      {manifest.url && <div className="mt-1 break-all">source: {manifest.url}</div>}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button
                    variant={plugin.enabled ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => void toggle(plugin)}
                    disabled={busy[plugin.id] ?? false}
                  >
                    {plugin.enabled ? 'Enabled' : 'Enable'}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-5 text-[11px] gap-1" onClick={() => void toggleKernel(plugin)}>
                    {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    Kernel
                  </Button>
                  {plugin.source === 'url' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-[11px] gap-1 text-red-500"
                      onClick={() => void remove(plugin)}
                      disabled={busy[plugin.id] ?? false}
                    >
                      <Trash2 className="w-3 h-3" />
                      {confirmDelete === plugin.id ? 'Confirm?' : 'Delete'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        {plugins !== null && rows.length === 0 && !loadError && (
          <div className="p-6 text-center text-xs text-zinc-400">
            {tab === 'suspended' ? 'Nothing suspended — all plugins live' : 'No plugins match — try the search'}
          </div>
        )}
      </div>
      )}

      <div className="p-2 border-t border-line bg-muted/20 text-[11px] text-zinc-500 flex gap-1 flex-wrap">
        <span className="flex items-center gap-1">
          <Layers className="w-3 h-3" /> {plugins ? summarizeRegistry(plugins) : 'Kernel: ctx.routes — emit/waterfall/bail'}
        </span>
        <span className="ml-auto hidden sm:inline">suspend/resume without restart — marketplace is live GitHub search</span>
      </div>
    </div>
  );
}
