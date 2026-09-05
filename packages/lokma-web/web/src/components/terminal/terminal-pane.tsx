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
import { api, type TerminalInfo } from '@/lib/api';
import type { UseWs } from '@/hooks/use-ws';
import { emitToast } from '@/components/shell';
import { useAgentStore, useKnownSession } from '@/stores';
import {
  appendCapped,
  copyText,
  exitSummary,
  filterLines,
  statusLabel,
  stripAnsi,
  terminalLabel,
} from './terminal';

/**
 * TerminalPane — live shell tabs over real server processes (W3-10).
 * Spawn via `POST /api/terminal`, stdin over the shared WS socket
 * (`terminal/input`), output as `terminal/data` frames, end as
 * `terminal/exit`. Kill ends the real PID; forget drops the record.
 * No mocks: tabs, bytes, pids and exit codes all come from the server.
 * No xterm.js yet (plain scrollback + stdin line) — see the footer note.
 */

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export function TerminalPane({ sessionId, ws }: { sessionId: string; ws: UseWs }) {
  const [terminals, setTerminals] = React.useState<TerminalInfo[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [buffers, setBuffers] = React.useState<Record<string, string>>({});
  const [cwd, setCwd] = React.useState('');
  const [input, setInput] = React.useState('');
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

  // Session scope: cwd for new shells + reset buffers on session switch.
  // cwd comes from the cached server list — never a detail GET (fresh
  // sessions used to 404 here once per mounted pane).
  const known = useKnownSession(sessionId);
  React.useEffect(() => {
    setBuffers({});
    setSelectedId(null);
    setArmedKill(null);
    processedRef.current = 0;
    if (known === 'loading') return;
    setCwd(known?.cwd ?? '');
    void refresh();
    void refreshAgents();
  }, [sessionId, refresh, refreshAgents, known]);

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
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'terminal create failed');
    } finally {
      setLoading(false);
    }
  }, [cwd, newAgent, sessionId, refresh, select]);

  const send = React.useCallback(() => {
    if (!selectedId || !input.trim()) return;
    // Piped shells do not echo stdin — show the command so output reads sanely.
    setBuffers((prev) => ({ ...prev, [selectedId]: appendCapped(prev[selectedId] ?? '', `$ ${input.trim()}\n`) }));
    ws.sendTerminal(selectedId, `${input.trim()}\n`);
    setInput('');
  }, [selectedId, input, ws]);

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
        <div className="grid shrink-0 grid-cols-1 gap-2 border-b border-white/5 bg-[#161618] p-2 sm:grid-cols-2">
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
        <span className="truncate font-mono text-white/90">{selected ? selected.cwd : 'no terminal'}</span>
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

      <div ref={scrollRef} className="flex-1 space-y-0.5 overflow-auto p-3 font-mono text-xs leading-5">
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

      <div className="shrink-0 border-t border-white/5 bg-[#161618] p-2">
        <label htmlFor="terminal-stdin" className="mb-1 block text-[10px] uppercase tracking-wide text-white/40">
          Command (sent to {selected ? terminalLabel(selected) : 'shell'} stdin)
        </label>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-emerald-400">$</span>
          <input
            id="terminal-stdin"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            placeholder={selected?.status === 'running' ? 'echo hello' : 'start a shell first'}
            disabled={!selected || selected.status !== 'running'}
            className="h-7 flex-1 rounded border border-white/10 bg-white/5 px-2 font-mono text-xs text-white placeholder:text-white/30 focus:border-white/20 focus:outline-none disabled:opacity-40"
          />
          <Button size="sm" className="h-7 text-[11px]" disabled={!selected || selected.status !== 'running' || !input.trim()} onClick={send}>
            Send
          </Button>
        </div>
      </div>

      <div className="flex h-6 shrink-0 items-center gap-1 overflow-x-auto border-t border-white/5 bg-[#161618] px-2 text-[10px]">
        <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">shell · pipes</span>
        <span className="hidden text-white/30 sm:inline">
          {terminals.filter((t) => t.status === 'running').length}/{terminals.length} live · no pty yet (plain
          scrollback, follow-up: xterm.js)
        </span>
        <span className="ml-auto hidden text-white/30 lg:inline">ws {ws.status}</span>
      </div>
    </div>
  );
}
