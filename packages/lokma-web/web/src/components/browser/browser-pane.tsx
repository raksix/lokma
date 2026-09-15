import * as React from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type BrowserTab } from '@/lib/api';
import { emitToast } from '@/components/shell';
import { useKnownCwd } from '@/stores';
import { usePaneStore } from '@/stores/pane';
import {
  BROWSER_BLANK_URL,
  canGoBack,
  canGoForward,
  isPipedUrl,
  paneUrlFor,
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
 *
 * REQ-037 full-height contract: this root is `flex-1` inside a flex column,
 * so every host must hand it a real height — the tiling InspectorHost wraps
 * it in a `h-full` flex shell, the scrolling sidebar/mobile InspectorPanel
 * wraps it in a viewport-relative (`h-[60vh]`) flex shell. Without that the
 * flex-1 chain collapses and the page area renders cut off.
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
  const [frameReady, setFrameReady] = React.useState(false);
  const [frameHint, setFrameHint] = React.useState(false);
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
  // REQ-144: the workspace path is a primitive dependency; keying this reset on
  // the `known` object let the 4 s session poll clear the tab list and refetch
  // it on every tick (the pane behaved like a reload).
  const knownCwd = useKnownCwd(sessionId);
  React.useEffect(() => {
    setTabs([]);
    setSelectedId(null);
    setAddress('');
    setLoading(true);
    ensuredBlank.current = false;
    if (knownCwd === 'loading') return;
    setCwd(knownCwd === 'missing' ? '' : knownCwd);
    void refresh().finally(() => setLoading(false));
  }, [sessionId, refresh, knownCwd]);

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
    if (knownCwd === 'loading') return;
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
  }, [loading, tabs.length, lastError, sessionId, cwd, knownCwd]);

  const applyTab = React.useCallback((tab: BrowserTab) => {
    setTabs((prev) => prev.map((t) => (t.id === tab.id ? tab : t)));
    setSelectedId(tab.id);
    setAddress(tab.url === BROWSER_BLANK_URL ? '' : tab.url);
  }, []);

  // REQ-150/153 — decide what the iframe actually loads: video links get
  // YouTube's own no-cookie player, other youtube.com pages (home, channels,
  // search) go through the Piped front-end because YouTube refuses framing and
  // has no embed for them.
  const frameSrc = React.useMemo(
    () => paneUrlFor(selected?.url ?? '') ?? selected?.url ?? '',
    [selected?.url],
  );
  const viaPiped = React.useMemo(() => isPipedUrl(frameSrc) && frameSrc !== selected?.url, [frameSrc, selected?.url]);

  // A refused frame never fires `onLoad`, so nothing would ever tell the user
  // why the body is blank. After 2.5 s without a load, show a hint (honest
  // wording — it may just be slow) with the real escape hatches.
  React.useEffect(() => {
    setFrameReady(false);
    setFrameHint(false);
    if (!frameSrc || frameSrc === BROWSER_BLANK_URL) return;
    const t = window.setTimeout(() => setFrameHint(true), 2500);
    return () => window.clearTimeout(t);
  }, [frameSrc, frameNonce]);

  // REQ-146 — the agent opened/reused a tab for THIS session (`ui_action` →
  // pane store). Pull the fresh list and follow that tab, so the visible
  // address bar + page show the agent's URL instead of the stale page. Never
  // opens a second tab: the server already reused the session's record, and
  // the blank-tab auto-open is disarmed so a race can't add one more.
  const pendingBrowserOpen = usePaneStore((s) => s.pendingBrowserOpen);
  const consumeBrowserOpen = usePaneStore((s) => s.consumeBrowserOpen);
  React.useEffect(() => {
    if (!pendingBrowserOpen) return;
    if (pendingBrowserOpen.sessionId && pendingBrowserOpen.sessionId !== sessionId) return;
    consumeBrowserOpen();
    ensuredBlank.current = true;
    if (pendingBrowserOpen.tabId) setSelectedId(pendingBrowserOpen.tabId);
    if (pendingBrowserOpen.url) {
      setAddress(pendingBrowserOpen.url === BROWSER_BLANK_URL ? '' : pendingBrowserOpen.url);
    }
    // Remount the frame: the reused tab keeps its id while its URL changes,
    // so the iframe must reload on the new src.
    setFrameNonce((n) => n + 1);
    void refresh();
  }, [pendingBrowserOpen, sessionId, refresh, consumeBrowserOpen]);

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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
        {viaPiped ? (
          <span
            title="YouTube bu panelde iframe'e izin vermediği için Piped önyüzü üzerinden açılıyor"
            className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] font-medium text-zinc-500"
            data-piped-chip="1"
          >
            Piped
          </span>
        ) : null}
        {selected?.lastAgentUseAt ? (
          /* REQ-154 — the agent drives this tab through the server engine.
             Its page and this iframe share the tab URL but render separately;
             the chip keeps that split visible instead of silent. */
          <span
            title="Ajan bu sekmeyi sunucu motorundaki bir kopya üzerinden kullanıyor (scroll/tıkla/yaz). Motorun sayfası ile bu paneldeki görünüm aynı adresi gösterir ama ayrı renderlardır."
            className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-500"
            data-engine-chip="1"
          >
            Ajan motoru
          </span>
        ) : null}
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

      <div className="relative min-h-0 flex-1 overflow-hidden bg-zinc-100 dark:bg-[#0F0F11]">
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
          <>
            {frameHint && !frameReady ? (
              <div className="absolute inset-x-2 top-2 z-10 flex items-start gap-2 rounded border border-amber-300 bg-amber-50/95 px-2.5 py-2 text-[11px] text-amber-900 shadow-sm">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Sayfa yüklenmedi.</div>
                  <div className="mt-0.5">
                    Siteler bu panelde iframe olarak açılmayı reddedebiliyor (X-Frame-Options/CSP).
                    YouTube için video linkini <span className="font-mono">watch?v=…</span> ya da{' '}
                    <span className="font-mono">youtu.be/…</span> biçiminde aç — gömülü oynatıcı otomatik yüklenir.
                  </div>
                </div>
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium hover:bg-amber-100"
                >
                  Harici sekmede aç
                </a>
                <button
                  type="button"
                  aria-label="Dismiss hint"
                  onClick={() => setFrameHint(false)}
                  className="shrink-0 rounded p-0.5 hover:bg-amber-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : null}
            <iframe
              key={`${selected.id}:${frameNonce}`}
              src={frameSrc}
              title={tabLabel(selected)}
              className="h-full w-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms"
              onLoad={() => {
                setFrameReady(true);
                setFrameHint(false);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
