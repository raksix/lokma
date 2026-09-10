import * as React from 'react';
import { LoaderCircle, Unplug } from 'lucide-react';
import { api, type TerminalInfo } from '@/lib/api';
import type { UseWs } from '@/hooks/use-ws';
import { emitToast } from '@/components/shell';
import { useKnownSession } from '@/stores';
import {
  appendCapped,
  connectionNotice,
  exitSummary,
  keyToBytes,
  resolveTerminalCwd,
  stripAnsi,
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
 * REQ-079: chrome-free — no header/tab/action bars, the scrollback fills
 * the whole pane. A running shell auto-starts on mount when none exists
 * (an empty pane used to look broken — typing went nowhere); clicking an
 * empty/dead pane starts a fresh shell. `exit` ends the real process.
 */

export function TerminalPane({ sessionId, ws }: { sessionId: string; ws: UseWs }) {
  const [terminals, setTerminals] = React.useState<TerminalInfo[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [buffers, setBuffers] = React.useState<Record<string, string>>({});
  const [cwd, setCwd] = React.useState('');
  const [starting, setStarting] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const processedRef = React.useRef(0);
  const refreshRef = React.useRef(() => {});
  const selectRef = React.useRef<(id: string) => void>(() => {});
  // REQ-079: auto-start guard — one attempt per session so a failing create
  // never loops (the error toast explains, click retries manually).
  const autoStartedRef = React.useRef<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const res = await api.listTerminals();
      setTerminals(res.terminals);
    } catch {
      // List failures surface via the start toast, never a dead pane.
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
    }
  }, [sessionId, refresh, known, cwd]);

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
  // Session-scoped: another session's shell is never hijacked.
  const mine = React.useMemo(
    () => terminals.filter((t) => !t.sessionId || t.sessionId === sessionId),
    [terminals, sessionId],
  );
  React.useEffect(() => {
    if (selectedId || mine.length === 0) return;
    const first = mine.find((t) => t.status === 'running') ?? mine[0];
    if (first) selectRef.current(first.id);
  }, [mine, selectedId]);

  // Auto-scroll on new output (always follow — the pane is the terminal).
  const selected = mine.find((t) => t.id === selectedId) ?? null;
  const selectedRunning = selected?.status === 'running';
  const rawBuffer = selectedId ? (buffers[selectedId] ?? '') : '';
  const lines = React.useMemo(() => rawBuffer.split('\n'), [rawBuffer]);
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

  const create = React.useCallback(async () => {
    if (!cwd || starting) {
      if (!cwd) emitToast('Session cwd is still loading — retry in a second');
      return;
    }
    setStarting(true);
    try {
      const res = await api.createTerminal({ cwd, sessionId });
      await refresh();
      select(res.terminal.id);
      // REQ-059: hand focus to the scrollback so typing starts immediately.
      window.setTimeout(() => scrollRef.current?.focus({ preventScroll: true }), 50);
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'terminal create failed');
    } finally {
      setStarting(false);
    }
  }, [cwd, starting, sessionId, refresh, select]);

  // REQ-079: a running shell auto-starts when the pane has none (one attempt
  // per session — failures toast and wait for a click instead of looping).
  React.useEffect(() => {
    if (autoStartedRef.current === sessionId || !cwd || starting) return;
    if (mine.some((t) => t.status === 'running')) return;
    if (mine.length > 0) {
      // Dead records only — mark attempted so we don't respawn on every
      // refresh; the user starts a fresh shell with a click.
      autoStartedRef.current = sessionId;
      return;
    }
    autoStartedRef.current = sessionId;
    void create();
  }, [sessionId, cwd, mine, starting, create]);

  const sendRaw = React.useCallback(
    (data: string) => {
      if (!selectedId || !data || ws.status !== 'open') return;
      // PTY shells echo input themselves — never paint it client-side.
      ws.sendTerminal(selectedId, data);
    },
    [selectedId, ws],
  );

  // REQ-085 dedup: the same physical keypress must never reach the PTY
  // twice (double keydown delivery shows every key doubled). Held-key
  // auto-repeat (e.repeat) always passes; only non-repeat duplicates of
  // the identical byte within the window are dropped — a human cannot
  // re-press the same key in <50ms.
  const lastKeyRef = React.useRef<{ bytes: string; at: number }>({ bytes: '', at: 0 });

  // REQ-059 direct typing: the scrollback is the terminal. Every handled
  // key becomes raw PTY bytes; unmapped keys (Cmd-combos, F-keys) fall
  // through to the browser.
  const onTermKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!selectedId || selected?.status !== 'running') return;
      const bytes = keyToBytes({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey });
      if (bytes === null) return;
      e.preventDefault();
      if (!e.repeat) {
        const now = Date.now();
        if (lastKeyRef.current.bytes === bytes && now - lastKeyRef.current.at < 50) return;
        lastKeyRef.current = { bytes, at: now };
      }
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

  const exitNote = selected ? exitSummary(selected) : null;
  // REQ-107: SSH feel — the socket state is a visible scrollback row, not
  // just an aria-label. While disconnected the fake `$` cursor stays
  // hidden (it would pretend liveness) and keystrokes keep dropping
  // silently at sendRaw — same as a dead SSH socket, minus the beep.
  const connNotice = connectionNotice(ws.status);
  const wsLive = ws.status === 'open';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#0F0F11] text-[#EDE9E2]">
      <div
        ref={scrollRef}
        tabIndex={selectedRunning ? 0 : -1}
        role="application"
        aria-label={
          selectedRunning
            ? `Terminal — click and type directly, arrows for history, Control C interrupts (ws ${ws.status})`
            : 'Terminal scrollback'
        }
        onKeyDown={onTermKeyDown}
        onPaste={onTermPaste}
        onClick={() => {
          // REQ-079: an empty/dead pane starts a fresh shell on click — no
          // menus, no buttons, just click and type.
          if (!selectedRunning && !starting && cwd) void create();
          else scrollRef.current?.focus({ preventScroll: true });
        }}
        className="flex-1 cursor-text space-y-0.5 overflow-auto p-3 font-mono text-xs leading-5 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/40"
      >
        {starting && terminals.length === 0 ? (
          <div className="text-white/40">Starting shell…</div>
        ) : !selected ? (
          <div className="text-white/40">Click to start a shell in this session&apos;s workspace.</div>
        ) : (
          <>
            {lines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all text-zinc-300">
                {line || ' '}
              </div>
            ))}
            {exitNote ? <div className="pt-1 text-[11px] text-white/40">— {exitNote}</div> : null}
            {connNotice ? (
              connNotice.action === 'reconnect' ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    ws.reconnect();
                  }}
                  className="mt-1 flex items-center gap-1.5 rounded border border-amber-400/20 bg-amber-400/10 px-2 py-1 font-mono text-[11px] text-amber-200/90 hover:bg-amber-400/20"
                >
                  <Unplug className="h-3.5 w-3.5" />
                  {connNotice.text}
                </button>
              ) : (
                <div className="mt-1 flex items-center gap-1.5 py-1 font-mono text-[11px] text-white/40">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  {connNotice.text}
                </div>
              )
            ) : null}
            {selectedRunning && wsLive ? (
              <div className="flex items-center gap-1 text-white">
                <span className="text-emerald-400">$</span>
                <span className="h-4 w-2 animate-pulse bg-white/80" />
              </div>
            ) : null}
            {!selectedRunning ? (
              <button
                className="mt-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60 hover:bg-white/10 hover:text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!starting && cwd) void create();
                }}
              >
                Shell ended — click for a fresh one
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
