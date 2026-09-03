import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type BrowserTab } from '@/lib/api';
import { emitToast } from '@/components/shell';
import { useAgentStore } from '@/stores';
import {
  BROWSER_BLANK_URL,
  canGoBack,
  canGoForward,
  groupByAgent,
  historyPosition,
  shortScope,
  tabLabel,
  validateTabUrl,
} from './browser';

/**
 * BrowserPane — per-agent live browser tabs over real server history (W3-12).
 * Tabs + history live on the server (`GET/POST /api/browser/*`); pages render
 * in this browser via a sandboxed iframe. Every control below hits a live
 * endpoint: Back/Forward step the REAL history pointer (409 `no_history` at
 * the edge), Reload touches the tab, Go pushes a real entry (forward entries
 * dropped, like a browser). Concept mock pills (`builder-1`/`reviewer-2`
 * hardcoded) and toast-only nav buttons are NOT ported — no dead buttons.
 * Honest scope: no CDP/screenshot pipeline yet (no Playwright dep in the
 * repo) — live AI-driven screenshots land with the agent tool loop (W4+).
 * Sites sending `X-Frame-Options: DENY` refuse the iframe; the external-link
 * button next to the address bar is the real fallback (opens the live URL).
 */

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export function BrowserPane({ sessionId }: { sessionId: string }) {
  const [tabs, setTabs] = React.useState<BrowserTab[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [address, setAddress] = React.useState('');
  const [cwd, setCwd] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [newUrl, setNewUrl] = React.useState('');
  const [newAgent, setNewAgent] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [armedClose, setArmedClose] = React.useState<string | null>(null);
  const [frameNonce, setFrameNonce] = React.useState(0);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const agents = useAgentStore((s) => s.agents);
  const refreshAgents = useAgentStore((s) => s.refresh);

  const refresh = React.useCallback(async () => {
    try {
      const res = await api.listBrowserTabs(sessionId);
      setTabs(res.tabs);
      setLastError(null);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : 'browser list failed');
    }
  }, [sessionId]);

  // Session scope: cwd for new tabs + tab list; reset selection on switch.
  React.useEffect(() => {
    setTabs([]);
    setSelectedId(null);
    setAddress('');
    setArmedClose(null);
    setCreating(false);
    setLoading(true);
    api
      .getSession(sessionId)
      .then((detail) => setCwd(detail.cwd ?? ''))
      .catch(() => setCwd(''));
    void refresh().finally(() => setLoading(false));
    void refreshAgents();
  }, [sessionId, refresh, refreshAgents]);

  // Keep a valid selection (first tab wins) and sync the address bar.
  const selected = tabs.find((t) => t.id === selectedId) ?? null;
  React.useEffect(() => {
    if (!selected && tabs.length > 0) {
      const first = tabs[0];
      setSelectedId(first.id);
      setAddress(first.url === BROWSER_BLANK_URL ? '' : first.url);
    } else if (selected) {
      setAddress((prev) => {
        const live = selected.url === BROWSER_BLANK_URL ? '' : selected.url;
        // Do not clobber text the user is typing — sync only on tab switch.
        return prev === live || document.activeElement?.id !== 'browser-address' ? live : prev;
      });
    }
  }, [tabs, selected, selectedId]);

  const select = React.useCallback(
    (tab: BrowserTab) => {
      setSelectedId(tab.id);
      setAddress(tab.url === BROWSER_BLANK_URL ? '' : tab.url);
    },
    [],
  );

  const applyTab = React.useCallback(
    (tab: BrowserTab) => {
      setTabs((prev) => prev.map((t) => (t.id === tab.id ? tab : t)));
      select(tab);
    },
    [select],
  );

  const open = React.useCallback(async () => {
    const trimmed = newUrl.trim();
    if (trimmed) {
      const problem = validateTabUrl(trimmed);
      if (problem) {
        setLastError(problem);
        return;
      }
    }
    setBusy(true);
    try {
      const res = await api.openBrowserTab({
        sessionId,
        ...(cwd ? { cwd } : {}),
        ...(newAgent ? { agentId: newAgent } : {}),
        ...(trimmed ? { url: trimmed } : {}),
      });
      await refresh();
      select(res.tab);
      setCreating(false);
      setNewUrl('');
      setNewAgent('');
      setLastError(null);
      emitToast(`Tab ${shortId(res.tab.id)} opened`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'browser open failed';
      setLastError(msg);
      emitToast(msg);
    } finally {
      setBusy(false);
    }
  }, [newUrl, newAgent, cwd, sessionId, refresh, select]);

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

  const close = React.useCallback(
    async (id: string) => {
      if (armedClose !== id) {
        setArmedClose(id);
        return;
      }
      setArmedClose(null);
      setBusy(true);
      try {
        await api.closeBrowserTab(id);
        setTabs((prev) => prev.filter((t) => t.id !== id));
        if (selectedId === id) {
          setSelectedId(null);
          setAddress('');
        }
        setLastError(null);
        emitToast(`Tab ${shortId(id)} closed`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'close failed';
        setLastError(msg);
        emitToast(msg);
      } finally {
        setBusy(false);
      }
    },
    [armedClose, selectedId],
  );

  const groups = React.useMemo(() => groupByAgent(tabs), [tabs]);
  const backDisabled = !selected || !canGoBack(selected) || busy;
  const forwardDisabled = !selected || !canGoForward(selected) || busy;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-line/60 bg-[#FDFCFB] px-2.5 dark:bg-[#161618]">
        <span className="grid h-5 w-5 place-items-center rounded-md border border-line bg-white dark:bg-[#1E1E21]">
          <Globe className="h-3 w-3" />
        </span>
        <span className="text-xs font-medium">Browser</span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
          AI visible
        </span>
        {selected ? (
          <span className="hidden truncate font-mono text-[10px] text-zinc-400 sm:inline" title={selected.cwd ?? ''}>
            · {shortScope(selected.cwd)}
          </span>
        ) : null}
        <span className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="sm" className="h-5 w-5 p-0"
            title="Reload tab"
            disabled={!selected || busy}
            onClick={() => void step('reload')}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm" className="h-5 w-5 p-0"
            title="Close selected tab"
            disabled={!selected || busy}
            onClick={() => selected && void close(selected.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line/50 bg-muted/20 px-2 py-1">
        {groups.map((group) => (
          <React.Fragment key={group.agentId ?? 'unowned'}>
            {group.tabs.map((tab) => {
              const active = tab.id === selected?.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => select(tab)}
                  onDoubleClick={() => void close(tab.id)}
                  title={`${tab.url}${group.agentId ? ` · agent ${group.agentId}` : ''} (double-click to close${armedClose === tab.id ? ' — click again to confirm' : ''})`}
                  className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] hover:border-terracotta/30 ${
                    active
                      ? 'border-terracotta/50 bg-white dark:bg-[#1E1E21]'
                      : 'border-line bg-white dark:bg-[#1E1E21]'
                  } ${armedClose === tab.id ? 'border-red-400 text-red-600' : ''}`}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {group.agentId ? <span className="font-medium">{group.agentId}</span> : null}
                  <span className={group.agentId ? 'text-zinc-500' : ''}>{tabLabel(tab)}</span>
                </button>
              );
            })}
          </React.Fragment>
        ))}
        <Button variant="ghost" size="sm" className="h-6 shrink-0 gap-1 text-[11px]" onClick={() => setCreating((v) => !v)}>
          <Plus className="h-3 w-3" />
          New tab
        </Button>
        <span className="ml-auto hidden shrink-0 text-[11px] text-zinc-400 sm:inline">
          browser per agent · worktree-scoped
        </span>
      </div>

      {creating ? (
        <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-line/50 bg-[#FDFCFB] p-2 dark:bg-[#161618]">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="browser-new-url" className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">
              Start address (optional)
            </label>
            <input
              id="browser-new-url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void open()}
              placeholder="example.com/docs"
              className="h-7 w-full rounded border border-line bg-white px-2 font-mono text-[11px] focus:border-terracotta/50 focus:outline-none dark:bg-[#1E1E21]"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="browser-new-agent" className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">
              Agent (optional)
            </label>
            <select
              id="browser-new-agent"
              value={newAgent}
              onChange={(e) => setNewAgent(e.target.value)}
              className="h-7 w-full rounded border border-line bg-white px-1 text-[11px] focus:border-terracotta/50 focus:outline-none dark:bg-[#1E1E21]"
            >
              <option value="">No agent</option>
              {agents.map((a) => (
                <option key={String(a.id)} value={String(a.id)}>
                  {String(a.id)}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 flex gap-2">
            <Button size="sm" className="h-6 flex-1 text-[11px]" disabled={busy} onClick={() => void open()}>
              {busy ? 'Opening…' : 'Open tab'}
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex shrink-0 items-center gap-1 border-b border-line bg-[#FDFCFB] px-2 py-1.5 dark:bg-[#161618]">
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" title="Back" disabled={backDisabled} onClick={() => void step('back')}>
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm" className="h-5 w-5 p-0"
          title="Forward"
          disabled={forwardDisabled}
          onClick={() => void step('forward')}
        >
          <ChevronRight className="h-3 w-3" />
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
          <div className="grid h-full place-items-center text-xs text-zinc-400">Loading tabs…</div>
        ) : !selected ? (
          <div className="grid h-full place-items-center p-4">
            <div className="rounded border border-dashed p-4 text-center text-xs text-zinc-500">
              No browser tabs yet — open one with New tab.
            </div>
          </div>
        ) : selected.url === BROWSER_BLANK_URL ? (
          <div className="grid h-full place-items-center p-4">
            <div className="rounded border border-dashed p-4 text-center text-xs text-zinc-500">
              New tab — type an address above and press Go.
              <div className="mt-1 font-mono text-[10px] text-zinc-400">{historyPosition(selected)}</div>
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
        {selected && selected.url !== BROWSER_BLANK_URL ? (
          <div className="absolute right-2 top-2 flex items-center gap-2 rounded-full bg-[#262624] px-2 py-1 text-[10px] font-medium text-white shadow">
            <span>AI sees &amp; controls</span>
            <span className="opacity-60">{historyPosition(selected)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
