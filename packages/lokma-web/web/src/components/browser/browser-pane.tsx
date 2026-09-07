import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type BrowserTab } from '@/lib/api';
import { emitToast } from '@/components/shell';
import { useKnownSession } from '@/stores';
import {
  BROWSER_BLANK_URL,
  canGoBack,
  canGoForward,
  tabLabel,
  validateTabUrl,
} from './browser';

/**
 * BrowserPane — single-page browser view over real server history (W3-12, REQ-013).
 * No inner tab strip: tabs live ONLY in the pane's top tab strip (one URL per
 * pane tab). The toolbar is URL-only (Back/Forward/Reload + address + Go) and
 * the page fills the whole pane body. The pane binds the session's first
 * server tab and auto-opens a blank one when the session has none yet.
 * Every control hits a live endpoint: Back/Forward step the REAL history
 * pointer (409 `no_history` at the edge), Reload touches the tab, Go pushes a
 * real entry (forward entries dropped, like a browser).
 * Honest scope: no CDP/screenshot pipeline yet (no Playwright dep in the
 * repo) — live AI-driven screenshots land with the agent tool loop (W4+).
 * Sites sending `X-Frame-Options: DENY` refuse the iframe; the external-link
 * button next to the address bar is the real fallback (opens the live URL).
 */
export function BrowserPane({ sessionId }: { sessionId: string }) {
  const [tabs, setTabs] = React.useState<BrowserTab[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [address, setAddress] = React.useState('');
  const [cwd, setCwd] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [frameNonce, setFrameNonce] = React.useState(0);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const ensuredBlank = React.useRef(false);

  const refresh = React.useCallback(async () => {
    try {
      const res = await api.listBrowserTabs(sessionId);
      setTabs(res.tabs);
      setLastError(null);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : 'browser list failed');
    }
  }, [sessionId]);

  // Session scope: cwd for the auto-opened tab + tab list; reset on switch.
  // cwd comes from the cached server list — never a detail GET (fresh
  // sessions used to 404 here once per mounted pane).
  const known = useKnownSession(sessionId);
  React.useEffect(() => {
    setTabs([]);
    setSelectedId(null);
    setAddress('');
    setLoading(true);
    ensuredBlank.current = false;
    if (known === 'loading') return;
    setCwd(known?.cwd ?? '');
    void refresh().finally(() => setLoading(false));
  }, [sessionId, refresh, known]);

  // Single visible tab: explicit selection wins, otherwise the first tab.
  // Surplus server tabs (opened before REQ-013) stay on the server untouched.
  const selected =
    (selectedId ? tabs.find((t) => t.id === selectedId) : undefined) ??
    tabs[0] ??
    null;
  const selectedIdKey = selected?.id ?? '';

  // Sync the address bar when the visible tab changes — never while typing.
  React.useEffect(() => {
    if (!selected) return;
    if (document.activeElement?.id === 'browser-address') return;
    setAddress(selected.url === BROWSER_BLANK_URL ? '' : selected.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdKey]);

  // No tabs yet (fresh session) → open one blank tab so the address bar has
  // a target. Runs once per session mount; failures surface in the banner.
  React.useEffect(() => {
    if (loading || tabs.length > 0 || ensuredBlank.current) return;
    if (known === 'loading') return;
    if (lastError) return;
    ensuredBlank.current = true;
    setBusy(true);
    api
      .openBrowserTab({ sessionId, ...(cwd ? { cwd } : {}) })
      .then((res) => {
        setTabs([res.tab]);
        setSelectedId(res.tab.id);
        setLastError(null);
      })
      .catch((e: unknown) => {
        setLastError(e instanceof Error ? e.message : 'browser open failed');
      })
      .finally(() => setBusy(false));
  }, [loading, tabs.length, lastError, sessionId, cwd, known]);

  const applyTab = React.useCallback((tab: BrowserTab) => {
    setTabs((prev) => prev.map((t) => (t.id === tab.id ? tab : t)));
    setSelectedId(tab.id);
    setAddress(tab.url === BROWSER_BLANK_URL ? '' : tab.url);
  }, []);

  const go = React.useCallback(async () => {
    if (!selected) return;
    const problem = validateTabUrl(address);
    if (problem) {
      setLastError(problem);
      return;
    }
    setBusy(true);
    try {
      const res = await api.navigateBrowserTab(selected.id, address.trim());
      applyTab(res.tab);
      setLastError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'navigate failed';
      setLastError(msg);
      emitToast(msg);
    } finally {
      setBusy(false);
    }
  }, [address, selected, applyTab]);

  const step = React.useCallback(
    async (dir: 'back' | 'forward' | 'reload') => {
      if (!selected) return;
      setBusy(true);
      try {
        const res =
          dir === 'back'
            ? await api.backBrowserTab(selected.id)
            : dir === 'forward'
              ? await api.forwardBrowserTab(selected.id)
              : await api.reloadBrowserTab(selected.id);
        applyTab(res.tab);
        if (dir === 'reload') setFrameNonce((n) => n + 1);
        setLastError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : `${dir} failed`;
        setLastError(msg);
        emitToast(msg);
      } finally {
        setBusy(false);
      }
    },
    [selected, applyTab],
  );

  const backDisabled = !selected || !canGoBack(selected) || busy;
  const forwardDisabled = !selected || !canGoForward(selected) || busy;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1 border-b border-line bg-[#FDFCFB] px-2 py-1.5 dark:bg-[#161618]">
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" title="Back" disabled={backDisabled} onClick={() => void step('back')} aria-label="Back">
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm" className="h-5 w-5 p-0"
          title="Forward"
          disabled={forwardDisabled}
          onClick={() => void step('forward')}
         aria-label="Forward">
          <ChevronRight className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm" className="h-5 w-5 p-0"
          title="Reload page"
          disabled={!selected || busy}
          onClick={() => void step('reload')}
         aria-label="Reload page">
          <RefreshCw className="h-3 w-3" />
        </Button>
        <div className="flex h-7 flex-1 items-center gap-1.5 rounded-full border border-line bg-white px-2.5 dark:bg-[#1E1E21]">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
          <label htmlFor="browser-address" className="sr-only">
            Address
          </label>
          <input
            id="browser-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void go()}
            placeholder="Type a web address…"
            disabled={!selected}
            className="h-6 flex-1 border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0 focus:outline-none disabled:opacity-40"
          />
          <Button variant="ghost" size="sm" className="h-5 px-2 text-[10px]" disabled={!selected || busy} onClick={() => void go()}>
            Go
          </Button>
        </div>
        {selected && selected.url !== BROWSER_BLANK_URL ? (
          <a
            href={selected.url}
            target="_blank"
            rel="noreferrer"
            title="Open in a new browser tab (fallback for sites that refuse iframes)"
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-zinc-500 hover:bg-muted hover:text-zinc-800"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>

      {lastError ? (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-2.5 py-1 text-[11px] text-red-700">{lastError}</div>
      ) : null}

      <div className="relative flex-1 overflow-hidden bg-zinc-100 dark:bg-[#0F0F11]">
        {loading ? (
          <div className="grid h-full place-items-center text-xs text-zinc-400">Loading…</div>
        ) : !selected ? (
          <div className="grid h-full place-items-center p-4">
            <div className="rounded border border-dashed p-4 text-center text-xs text-zinc-500">
              {busy ? 'Opening a blank tab…' : 'No page open — type an address above and press Enter.'}
            </div>
          </div>
        ) : selected.url === BROWSER_BLANK_URL ? (
          <div className="grid h-full place-items-center p-4">
            <div className="rounded border border-dashed p-4 text-center text-xs text-zinc-500">
              Type an address above and press Enter.
            </div>
          </div>
        ) : (
          <iframe
            key={`${selected.id}:${frameNonce}`}
            src={selected.url}
            title={tabLabel(selected)}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        )}
      </div>
    </div>
  );
}
