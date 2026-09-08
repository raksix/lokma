import * as React from 'react';
import {
  ArrowDownToLine,
  Copy,
  Plus,
  RefreshCw,
  Search,
  Square,
  Terminal as TerminalIcon,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContextMenu, useContextMenu, type ContextMenuEntry } from '@/components/ui/context-menu';
import { api, type TerminalInfo } from '@/lib/api';
import type { UseWs } from '@/hooks/use-ws';
import { emitToast } from '@/components/shell';
import { useAgentStore, useKnownSession } from '@/stores';
import {
  appendCapped,
  copyText,
  exitSummary,
  filterLines,
  keyToBytes,
  resolveTerminalCwd,
  statusLabel,
  stripAnsi,
  terminalLabel,
} from './terminal';

/**
 * TerminalPane — live shell tabs over real server processes (W3-10).
 * Spawn via `POST /api/terminal`, keystrokes travel over the shared WS
 * socket (`terminal/input`) as raw PTY bytes, output arrives as
 * `terminal/data` frames, end as `terminal/exit`. Kill ends the real PID;
 * forget drops the record. No mocks: tabs, bytes, pids and exit codes all
 * come from the server.
 * REQ-059: no command box — the scrollback itself is the terminal. Click
 * it and type: printable keys, Enter, Backspace, Tab, arrows (shell
 * history), Ctrl+C (interrupt), Ctrl+D (EOF) all reach the server PTY.
 */

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export function TerminalPane({ sessionId, ws }: { sessionId: string; ws: UseWs }) {
  const [terminals, setTerminals] = React.useState<TerminalInfo[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [buffers, setBuffers] = React.useState<Record<string, string>>({});
  const [cwd, setCwd] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [follow, setFollow] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newAgent, setNewAgent] = React.useState('');
  const [armedKill, setArmedKill] = React.useState<string | null>(null);
  const [lastError, setLastError] = React.useState<string | null>(null);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const processedRef = React.useRef(0);
  const refreshRef = React.useRef(() => {});
  const selectRef = React.useRef<(id: string) => void>(() => {});
  const agents = useAgentStore((s) => s.agents);
  const refreshAgents = useAgentStore((s) => s.refresh);

  const refresh = React.useCallback(async () => {
    try {
      const res = await api.listTerminals();
      setTerminals(res.terminals);
      setLastError(null);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : 'terminal list failed');
    }
  }, []);
  refreshRef.current = refresh;

  // Session scope: new shells default to the selected session/project cwd
  // (REQ-060) — the value comes from the cached server list, never a
  // detail GET (fresh sessions used to 404 here once per mounted pane).
  // Resets + cwd adoption run ONLY on session switch: plain session-list
  // refreshes hand out a new object identity but must not wipe buffers,
  // selection, or a manual cwd edit. A late-arriving cwd (list still
  // loading at mount) is adopted once into a pristine input.
  const known = useKnownSession(sessionId);
  // Null sentinel (a real sessionId is never null): the first run counts
  // as a change so mount resets + loads the terminal/agent lists.
  const prevSessionRef = React.useRef<string | null>(null);
  const cwdAdoptedRef = React.useRef(false);
  React.useEffect(() => {
    const sessionChanged = prevSessionRef.current !== sessionId;
    if (sessionChanged) {
      prevSessionRef.current = sessionId;
      setBuffers({});
      setSelectedId(null);
      setArmedKill(null);
      processedRef.current = 0;
      cwdAdoptedRef.current = false;
    }
    const next = resolveTerminalCwd({
      sessionChanged,
      knownCwd: known === 'loading' || known === null ? undefined : known.cwd,
      currentCwd: cwd,
      adopted: cwdAdoptedRef.current,
    });
    cwdAdoptedRef.current = next.adopted;
    if (next.cwd !== cwd) setCwd(next.cwd);
    if (sessionChanged) {
      void refresh();
      void refreshAgents();
    }
  }, [sessionId, refresh, refreshAgents, known, cwd]);

  // Fold WS terminal frames into per-terminal scrollback (incremental, capped).
  React.useEffect(() => {
    const messages = ws.messages;
    let advanced = false;
    for (let i = processedRef.current; i < messages.length; i += 1) {
      const msg = messages[i];
      if (msg.type === 'terminal/data' && msg.sessionId === sessionId) {
        const text = stripAnsi(msg.data);
        setBuffers((prev) => ({ ...prev, [msg.terminalId]: appendCapped(prev[msg.terminalId] ?? '', text) }));
      } else if (msg.type === 'terminal/exit' && msg.sessionId === sessionId) {
        void refreshRef.current();
      }
      advanced = true;
    }
    if (advanced) processedRef.current = messages.length;
  }, [ws.messages, sessionId]);

  const select = React.useCallback(
    (id: string) => {
      setSelectedId(id);
      setArmedKill(null);
      // Late-join catch-up: seed the buffer from the server tail when empty.
      setBuffers((prev) => {
        if (prev[id] !== undefined) return prev;
        void api
          .getTerminal(id)
          .then((detail) => {
            const tail = stripAnsi(detail.tail ?? '');
            if (tail) setBuffers((cur) => (cur[id] === undefined || cur[id] === '' ? { ...cur, [id]: tail } : cur));
          })
          .catch(() => {
            // Live frames still arrive — the tail is a convenience, not a gate.
          });
        return prev;
      });
    },
    [],
  );
  selectRef.current = select;

  // Auto-select the first running terminal once the list lands.
  React.useEffect(() => {
    if (selectedId || terminals.length === 0) return;
    const first = terminals.find((t) => t.status === 'running') ?? terminals[0];
    if (first) selectRef.current(first.id);
  }, [terminals, selectedId]);

  // Auto-scroll on new output when Follow is on.
  const selected = terminals.find((t) => t.id === selectedId) ?? null;
  const rawBuffer = selectedId ? (buffers[selectedId] ?? '') : '';
  const lines = React.useMemo(() => filterLines(rawBuffer, search), [rawBuffer, search]);
  React.useEffect(() => {
    if (follow && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines, follow]);

  const create = React.useCallback(async () => {
    if (!cwd) {
      emitToast('Session cwd is still loading — retry in a second');
      return;
    }
    setLoading(true);
    try {
      const res = await api.createTerminal({
        cwd,
        sessionId,
        ...(newAgent ? { agentId: newAgent } : {}),
      });
      await refresh();
      select(res.terminal.id);
      setCreating(false);
      setNewAgent('');
      emitToast(`Terminal ${shortId(res.terminal.id)} started (pid ${res.terminal.pid ?? '?'})`);
      // REQ-059: hand focus to the scrollback so typing starts immediately.
      window.setTimeout(() => scrollRef.current?.focus({ preventScroll: true }), 50);
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'terminal create failed');
    } finally {
      setLoading(false);
    }
  }, [cwd, newAgent, sessionId, refresh, select]);

  const sendRaw = React.useCallback(
    (data: string) => {
      if (!selectedId || !data || ws.status !== 'open') return;
      // PTY shells echo input themselves — never paint it client-side.
      ws.sendTerminal(selectedId, data);
    },
    [selectedId, ws],
  );

  // REQ-059 direct typing: the scrollback is the terminal. Every handled
  // key becomes raw PTY bytes; unmapped keys (Cmd-combos, F-keys) fall
  // through to the browser.
  const onTermKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!selectedId || selected?.status !== 'running') return;
      const bytes = keyToBytes({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey });
      if (bytes === null) return;
      e.preventDefault();
      sendRaw(bytes);
    },
    [selectedId, selected, sendRaw],
  );

  const onTermPaste = React.useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (!selectedId || selected?.status !== 'running') return;
      const text = e.clipboardData.getData('text');
      if (!text) return;
      e.preventDefault();
      sendRaw(text.replace(/\r\n/g, '\n'));
    },
    [selectedId, selected, sendRaw],
  );

  const kill = React.useCallback(
    async (id: string) => {
      if (armedKill !== id) {
        setArmedKill(id);
        return;
      }
      setArmedKill(null);
      if (ws.status === 'open') {
        ws.killTerminal(id);
        emitToast(`Kill sent to ${shortId(id)}`);
      } else {
        // Socket down — REST path still ends the real process.
        try {
          await api.deleteTerminal(id);
          await refresh();
          emitToast(`Terminal ${shortId(id)} killed (REST fallback)`);
        } catch (e) {
          emitToast(e instanceof Error ? e.message : 'terminal kill failed');
        }
      }
    },
    [armedKill, ws, refresh],
  );

  const forget = React.useCallback(
    async (id: string) => {
      try {
        await api.deleteTerminal(id);
        setBuffers((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setTerminals((prev) => {
          const rest = prev.filter((t) => t.id !== id);
          if (selectedId === id) {
            const next = rest.find((t) => t.status === 'running') ?? rest[0] ?? null;
            setSelectedId(next ? next.id : null);
          }
          return rest;
        });
      } catch (e) {
        emitToast(e instanceof Error ? e.message : 'terminal delete failed');
      }
    },
    [selectedId],
  );

  const clear = React.useCallback(() => {
    if (!selectedId) return;
    setBuffers((prev) => ({ ...prev, [selectedId]: '' }));
  }, [selectedId]);

  const copy = React.useCallback(async () => {
    if (!selectedId) return;
    const ok = await copyText(rawBuffer || '(empty scrollback)');
    emitToast(ok ? 'Scrollback copied' : 'Copy failed');
  }, [selectedId, rawBuffer]);

  const exitNote = selected ? exitSummary(selected) : null;

  // REQ-056 — right-click a terminal tab for its lifecycle menu on the
  // shared ContextMenu primitive. Kill keeps its two-click arm: the
  // first menu click arms, the second (re-opened) menu click confirms.
  const termCtx = useContextMenu<string>();
  const openTermMenu = termCtx.menu;
  const ctxTerm: TerminalInfo | null = openTermMenu
    ? (terminals.find((t) => t.id === openTermMenu.key) ?? null)
    : null;
  const copyTermId = (id: string) => {
    try {
      void navigator.clipboard.writeText(id).then(
        () => emitToast('Terminal id copied'),
        () => emitToast('Copy failed'),
      );
    } catch {
      emitToast('Copy failed');
    }
  };
  const ctxItems: ContextMenuEntry[] = ctxTerm
    ? [
        { type: 'header', label: `${terminalLabel(ctxTerm)} · ${statusLabel(ctxTerm)}` },
        {
          type: 'item',
          label: 'Open terminal',
          icon: TerminalIcon,
          onSelect: () => select(ctxTerm.id),
        },
        {
          type: 'item',
          label: armedKill === ctxTerm.id ? 'Confirm kill' : 'Kill process',
          icon: Square,
          danger: true,
          disabled: ctxTerm.status !== 'running',
          onSelect: () => void kill(ctxTerm.id),
        },
        {
          type: 'item',
          label: 'Forget record',
          icon: Trash2,
          danger: true,
          disabled: ctxTerm.status === 'running',
          hint: ctxTerm.status === 'running' ? 'kill first' : undefined,
          onSelect: () => void forget(ctxTerm.id),
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Copy terminal id',
          icon: Copy,
          onSelect: () => copyTermId(ctxTerm.id),
        },
      ]
    : [];

  return (
    <div className="flex h-[420px] flex-col overflow-hidden rounded-lg border border-[#232326] bg-[#0F0F11] text-[#EDE9E2]">
      <div className="flex h-7 shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 bg-[#1E1E21] px-2">
        <TerminalIcon className="h-3 w-3 shrink-0 text-emerald-400" />
        <span className="whitespace-nowrap text-xs font-medium">Terminal</span>
        <span className="ml-2 flex shrink-0 gap-1">
          {terminals.map((t) => (
            <button
              key={t.id}
              onClick={() => select(t.id)}
              onContextMenu={(e) => {
                select(t.id);
                termCtx.open(e, t.id);
              }}
              title={`${terminalLabel(t)} — ${statusLabel(t)}`}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                t.id === selectedId
                  ? 'border-white bg-white text-black'
                  : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  t.status === 'running' ? 'animate-pulse bg-emerald-500' : 'bg-zinc-500'
                }`}
              />
              {terminalLabel(t)}
            </button>
          ))}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-white/60 hover:bg-white/10 hover:text-white"
            title="New terminal"
            onClick={() => setCreating((v) => !v)}
           aria-label="New terminal">
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-white/60 hover:bg-white/10 hover:text-white"
            title="Refresh list"
            onClick={() => void refresh()}
           aria-label="Refresh list">
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-white/60 hover:bg-white/10 hover:text-white"
            title="Copy scrollback"
            onClick={() => void copy()}
           aria-label="Copy scrollback">
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-white/60 hover:bg-white/10 hover:text-white"
            title="Clear scrollback (local only)"
            onClick={clear}
           aria-label="Clear scrollback (local only)">
            <Trash2 className="h-3 w-3" />
          </Button>
        </span>
      </div>

      {creating ? (
        <div className="grid shrink-0 grid-cols-1 gap-2 border-b border-white/5 bg-[#161618] p-2 @min-[420px]:grid-cols-2">
          <div>
            <label htmlFor="terminal-cwd" className="mb-1 block text-[10px] uppercase tracking-wide text-white/40">
              Working directory
            </label>
            <input
              id="terminal-cwd"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              className="h-7 w-full rounded border border-white/10 bg-white/5 px-2 font-mono text-[11px] text-white focus:border-white/20 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="terminal-agent" className="mb-1 block text-[10px] uppercase tracking-wide text-white/40">
              Agent (optional)
            </label>
            <select
              id="terminal-agent"
              value={newAgent}
              onChange={(e) => setNewAgent(e.target.value)}
              className="h-7 w-full rounded border border-white/10 bg-white/5 px-1 text-[11px] text-white focus:border-white/20 focus:outline-none"
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
            <Button size="sm" className="h-6 flex-1 text-[11px]" disabled={loading || !cwd} onClick={() => void create()}>
              {loading ? 'Starting…' : 'Start shell'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px] text-white/60 hover:bg-white/10 hover:text-white"
              onClick={() => setCreating(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex h-6 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/5 bg-[#161618] px-2 text-[11px]">
        <span className="truncate font-mono text-white/90" title={selected ? selected.cwd : 'no terminal'}>{selected ? selected.cwd : 'no terminal'}</span>
        {selected ? (
          <span className="shrink-0 text-white/40" title={statusLabel(selected)}>
            · {statusLabel(selected)}
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <div className="relative hidden items-center md:flex">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/30" />
            <label htmlFor="terminal-filter" className="sr-only">
              Filter scrollback
            </label>
            <input
              id="terminal-filter"
              placeholder="Filter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-6 w-[110px] rounded-full border border-white/10 bg-white/5 pl-6 pr-2 text-xs text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={`h-5 gap-1 text-[11px] ${follow ? 'text-emerald-400' : 'text-white/60'} hover:bg-white/10 hover:text-white`}
            title="Follow new output"
            onClick={() => setFollow((v) => !v)}
          >
            <ArrowDownToLine className="h-3 w-3" />
            {follow ? 'Following' : 'Follow'}
          </Button>
          {selected && selected.status === 'running' ? (
            <Button
              variant="ghost"
              size="sm"
              className={`h-5 gap-1 text-[11px] ${armedKill === selected.id ? 'bg-red-500/20 text-red-300' : 'text-white/60'} hover:bg-white/10 hover:text-white`}
              title={armedKill === selected.id ? 'Click again to confirm kill' : 'Kill the real process'}
              onClick={() => void kill(selected.id)}
            >
              <Square className="h-3 w-3" />
              {armedKill === selected.id ? 'Confirm?' : 'Kill'}
            </Button>
          ) : null}
          {selected && selected.status !== 'running' ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 gap-1 text-[11px] text-white/60 hover:bg-white/10 hover:text-white"
              title="Forget this record"
              onClick={() => void forget(selected.id)}
            >
              <Trash2 className="h-3 w-3" />
              Forget
            </Button>
          ) : null}
        </span>
      </div>

      <div
        ref={scrollRef}
        tabIndex={selected?.status === 'running' ? 0 : -1}
        role="application"
        aria-label={
          selected?.status === 'running'
            ? 'Terminal — click and type directly, arrows for history, Control C interrupts'
            : 'Terminal scrollback'
        }
        onKeyDown={onTermKeyDown}
        onPaste={onTermPaste}
        className="flex-1 cursor-text space-y-0.5 overflow-auto p-3 font-mono text-xs leading-5 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/40"
      >
        {lastError && terminals.length === 0 ? (
          <div className="text-red-400">{lastError}</div>
        ) : !selected ? (
          <div className="text-white/40">
            No shells yet — press <Plus className="inline h-3 w-3" /> to start a real shell in this session&apos;s
            workspace.
          </div>
        ) : (
          <>
            {lines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all text-zinc-300">
                {line || ' '}
              </div>
            ))}
            {exitNote ? <div className="pt-1 text-[11px] text-white/40">— {exitNote}</div> : null}
            {selected.status === 'running' ? (
              <div className="flex items-center gap-1 text-white">
                <span className="text-emerald-400">$</span>
                <span className="h-4 w-2 animate-pulse bg-white/80" />
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="flex h-6 shrink-0 items-center gap-1 overflow-x-auto border-t border-white/5 bg-[#161618] px-2 text-[10px]">
        <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">
          {selected ? (selected.pty ? 'shell · pty' : 'shell · pipes') : 'shell'}
        </span>
        <span className="hidden text-white/30 @min-[320px]:inline">
          {terminals.filter((t) => t.status === 'running').length}/{terminals.length} live ·{' '}
          {selected?.status === 'running'
            ? 'click the output and type — arrows history, ctrl+c interrupts, ctrl+d exits'
            : 'start a shell to type'}
        </span>
        <span className="ml-auto hidden text-white/30 lg:inline">ws {ws.status}</span>
      </div>
      {openTermMenu && ctxTerm ? (
        <ContextMenu
          x={openTermMenu.x}
          y={openTermMenu.y}
          items={ctxItems}
          onClose={termCtx.close}
          label="Terminal actions menu"
        />
      ) : null}
    </div>
  );
}
