import * as React from 'react';
import { LoaderCircle, Unplug } from 'lucide-react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api, type TerminalInfo } from '@/lib/api';
import type { UseWs } from '@/hooks/use-ws';
import { emitToast } from '@/components/shell';
import { useKnownSession } from '@/stores';
import {
  appendCapped,
  isRecentDuplicate,
  connectionNotice,
  exitSummary,
  resolveTerminalCwd,
  shouldSendResize,
} from './terminal';

/**
 * TerminalPane — a REAL terminal emulator over the server PTYs (REQ-162).
 * Spawn via `POST /api/terminal`, keystrokes travel over the shared WS
 * socket (`terminal/input`) as raw PTY bytes, output arrives as
 * `terminal/data` frames, end as `terminal/exit`. Kill ends the real PID;
 * forget drops the record. No mocks: tabs, bytes, pids and exit codes all
 * come from the server.
 *
 * REQ-162: the viewport is an `@xterm/xterm` instance, not a plain-text
 * scrollback. Frames are written RAW (no ANSI stripping): the cursor
 * blinks where the shell says it is, Backspace deletes, `\r` redraws the
 * line, SGR colours render, and full-screen apps (vim/htop) work — it
 * reads like an SSH session because it IS an emulator.
 *
 * Kept contracts: auto-start (REQ-079), session cwd (REQ-060/159), frame
 * dedupe (REQ-158), live-terminal limit (REQ-159), socket notice (REQ-107).
 * Resize: FitAddon + ResizeObserver feed `terminal/resize` for live shells
 * only, and spawn passes the fitted cols/rows.
 */

/** xterm palette — matches the harness shell (#0F0F11) with legible ANSI hues. */
const TERMINAL_THEME: ITheme = {
  background: '#0F0F11',
  foreground: '#EDE9E2',
  cursor: '#EDE9E2',
  cursorAccent: '#0F0F11',
  selectionBackground: 'rgba(237, 233, 226, 0.24)',
  black: '#1E1E21',
  red: '#E5484D',
  green: '#46A758',
  yellow: '#FFB224',
  blue: '#4C8DFF',
  magenta: '#B26BFF',
  cyan: '#3DD4C8',
  white: '#EDE9E2',
  brightBlack: '#6E6E73',
  brightRed: '#FF6369',
  brightGreen: '#5BD46B',
  brightYellow: '#FFC94D',
  brightBlue: '#72A7FF',
  brightMagenta: '#C98AFF',
  brightCyan: '#56E6DA',
  brightWhite: '#FFFFFF',
};

const TERMINAL_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

/** Spawn size before the first fit (a zero-box pane must not spawn 0×0). */
const FALLBACK_SIZE = { cols: 80, rows: 24 };

export function TerminalPane({ sessionId, ws }: { sessionId: string; ws: UseWs }) {
  const [terminals, setTerminals] = React.useState<TerminalInfo[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [cwd, setCwd] = React.useState('');
  const [starting, setStarting] = React.useState(false);

  /** xterm mount point — the emulator's own DOM lives inside it. */
  const hostRef = React.useRef<HTMLDivElement>(null);
  const termRef = React.useRef<Terminal | null>(null);
  /** Last fitted emulator size (drives spawn cols/rows + resize frames). */
  const sizeRef = React.useRef<{ cols: number; rows: number } | null>(null);
  /** Last size SENT per terminal — `terminal/resize` only on a real change. */
  const sentSizeRef = React.useRef<Record<string, { cols: number; rows: number }>>({});
  /** Raw PTY bytes per terminal — the emulator's replay log (never stripped). */
  const rawRef = React.useRef<Record<string, string>>({});
  const processedRef = React.useRef(0);
  /** REQ-158: last folded frames — identical back-to-back deliveries are one. */
  const recentFramesRef = React.useRef<{ terminalId: string; data: string; at: number }[]>([]);
  const refreshRef = React.useRef(() => {});
  const selectRef = React.useRef<(id: string) => void>(() => {});
  // REQ-079: auto-start guard — one attempt per session so a failing create
  // never loops (the error toast explains, click retries manually).
  const autoStartedRef = React.useRef<string | null>(null);

  // Live values for the emulator's own (non-React) event handlers.
  const wsRef = React.useRef(ws);
  wsRef.current = ws;
  const selectedIdRef = React.useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const runningRef = React.useRef(false);

  const refresh = React.useCallback(async () => {
    try {
      const res = await api.listTerminals();
      setTerminals(res.terminals);
    } catch {
      // List failures surface via the start toast, never a dead pane.
    }
  }, []);
  refreshRef.current = refresh;

  // ── Emulator lifecycle (REQ-162): one xterm instance owns the viewport.
  // Raw bytes go in as-is; nothing here interprets escape sequences.
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: TERMINAL_FONT,
      lineHeight: 1.2,
      scrollback: 5000,
      theme: TERMINAL_THEME,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    termRef.current = term;

    // xterm encodes keys/paste/selection itself — its data event IS the
    // stdin stream. (REQ-059's hand-rolled keyToBytes is gone.)
    const dataSub = term.onData((data) => {
      const id = selectedIdRef.current;
      if (!id) return;
      wsRef.current.sendTerminal(id, data);
    });
    // Fit changes are the only source of resize frames; a dead/absent
    // shell never gets one (server answers terminal_not_found otherwise).
    const resizeSub = term.onResize(({ cols, rows }) => {
      sizeRef.current = { cols, rows };
      const id = selectedIdRef.current;
      if (!id || !runningRef.current) return;
      if (!shouldSendResize(sentSizeRef.current[id] ?? null, { cols, rows })) return;
      sentSizeRef.current[id] = { cols, rows };
      wsRef.current.resizeTerminal(id, cols, rows);
    });

    // Fit is a no-op while xterm is still measuring its cell size or while
    // the pane has no box yet (sidebar column / inactive tab): retry briefly,
    // then let the ResizeObserver take over for real box changes.
    const fitNow = (): boolean => {
      const el = hostRef.current;
      if (!el || el.clientWidth < 24 || el.clientHeight < 24) return false;
      const dims = fit.proposeDimensions();
      if (!dims || !dims.cols || !dims.rows) return false;
      try {
        fit.fit();
      } catch {
        return false;
      }
      sizeRef.current = { cols: term.cols, rows: term.rows };
      return true;
    };
    let fitTimer: number | null = null;
    const fitUntilSized = (attempt = 0) => {
      if (fitNow() || attempt >= 8) return;
      fitTimer = window.setTimeout(() => fitUntilSized(attempt + 1), 120 * (attempt + 1));
    };
    fitUntilSized();
    const raf = window.requestAnimationFrame(() => fitUntilSized());
    const ro = new ResizeObserver(() => {
      fitNow();
    });
    ro.observe(host);
    const onWinResize = () => {
      fitNow();
    };
    window.addEventListener('resize', onWinResize);

    return () => {
      window.cancelAnimationFrame(raf);
      if (fitTimer !== null) window.clearTimeout(fitTimer);
      window.removeEventListener('resize', onWinResize);
      ro.disconnect();
      dataSub.dispose();
      resizeSub.dispose();
      term.dispose();
      termRef.current = null;
    };
  }, []);

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
      setSelectedId(null);
      processedRef.current = 0;
      cwdAdoptedRef.current = false;
      // REQ-162: emulator bookkeeping is session-scoped too — a new
      // session starts with an empty byte log and a blank screen.
      rawRef.current = {};
      sentSizeRef.current = {};
      termRef.current?.reset();
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

  // Fold WS terminal frames into the emulator + the replay log (incremental,
  // capped). REQ-158 dedupe runs BEFORE anything is written.
  React.useEffect(() => {
    const messages = ws.messages;
    let advanced = false;
    for (let i = processedRef.current; i < messages.length; i += 1) {
      const msg = messages[i];
      if (msg.type === 'terminal/data' && msg.sessionId === sessionId) {
        const now = Date.now();
        if (isRecentDuplicate(recentFramesRef.current, msg, now)) {
          advanced = true;
          continue;
        }
        recentFramesRef.current = [...recentFramesRef.current, { terminalId: msg.terminalId, data: msg.data, at: now }].slice(-6);
        rawRef.current[msg.terminalId] = appendCapped(rawRef.current[msg.terminalId] ?? '', msg.data);
        if (msg.terminalId === selectedIdRef.current) termRef.current?.write(msg.data);
      } else if (msg.type === 'terminal/exit' && msg.sessionId === sessionId) {
        void refreshRef.current();
      }
      advanced = true;
    }
    if (advanced) processedRef.current = messages.length;
  }, [ws.messages, sessionId]);

  // ── Selection (REQ-162): replay the raw byte log into the emulator, or
  // seed it from the server tail on a late join. Replay keeps ANSI state
  // (colours, alternate screen) intact across terminal switches.
  React.useEffect(() => {
    const term = termRef.current;
    if (!term || !selectedId) return;
    term.reset();
    const buffered = rawRef.current[selectedId];
    if (buffered !== undefined) {
      if (buffered) term.write(buffered);
      return;
    }
    let alive = true;
    void api
      .getTerminal(selectedId)
      .then((detail) => {
        const tail = detail.tail ?? '';
        if (!alive || !tail) return;
        rawRef.current[selectedId] = appendCapped(rawRef.current[selectedId] ?? '', tail);
        if (selectedIdRef.current === selectedId) term.write(tail);
      })
      .catch(() => {
        // Live frames still arrive — the tail is a convenience, not a gate.
      });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const select = React.useCallback((id: string) => {
    setSelectedId(id);
  }, []);
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

  const selected = mine.find((t) => t.id === selectedId) ?? null;
  const selectedRunning = selected?.status === 'running';
  runningRef.current = selectedRunning;

  // The server shell may hold a stale size (spawned elsewhere, or before a
  // layout change): push the fitted size once per terminal, live ones only.
  React.useEffect(() => {
    if (!selectedId || !selectedRunning) return;
    const size = sizeRef.current;
    if (!size) return;
    if (!shouldSendResize(sentSizeRef.current[selectedId] ?? null, size)) return;
    sentSizeRef.current[selectedId] = size;
    ws.resizeTerminal(selectedId, size.cols, size.rows);
  }, [selectedId, selectedRunning, ws]);

  const create = React.useCallback(async () => {
    // REQ-159: a session with no folder still gets a shell — the server falls
    // back to its own workspace, which beats a pane that swallows the click.
    // Only a *loading* session list waits: the folder may still be on its way.
    const waiting = !cwd && known === 'loading';
    if (waiting || starting) {
      if (waiting) emitToast('Session cwd is still loading — retry in a second');
      return;
    }
    setStarting(true);
    try {
      // REQ-162: spawn at the emulator's fitted size so the first prompt
      // wraps exactly like the pane (never the 80×24 default).
      const size = sizeRef.current ?? FALLBACK_SIZE;
      const res = await api.createTerminal({
        ...(cwd ? { cwd } : {}),
        sessionId,
        cols: size.cols,
        rows: size.rows,
      });
      await refresh();
      select(res.terminal.id);
      // REQ-059: hand focus to the emulator so typing starts immediately.
      window.setTimeout(() => termRef.current?.focus(), 50);
    } catch (e) {
      emitToast(e instanceof Error ? e.message : 'terminal create failed');
    } finally {
      setStarting(false);
    }
  }, [cwd, known, starting, sessionId, refresh, select]);

  const pendingStartRef = React.useRef(false);

  /**
   * REQ-158: clicking (or asking for a shell) while the session cwd is still
   * loading used to be a silent no-op — the terminal simply never came up and
   * typing went nowhere. The intent is remembered instead and honoured as soon
   * as the cwd lands. A session with no folder at all starts straight away.
   */
  const startShell = React.useCallback(() => {
    if (starting) return;
    if (cwd || known !== 'loading') {
      void create();
      return;
    }
    pendingStartRef.current = true;
    emitToast('Session cwd is still loading — the shell starts as soon as it lands');
  }, [cwd, known, starting, create]);

  // REQ-079: a running shell auto-starts when the pane has none (one attempt
  // per session — failures toast and wait for a click instead of looping).
  React.useEffect(() => {
    if (autoStartedRef.current === sessionId || (!cwd && known === 'loading') || starting) return;
    if (mine.some((t) => t.status === 'running')) return;
    if (mine.length > 0) {
      // Dead records only — mark attempted so we don't respawn on every
      // refresh; the user starts a fresh shell with a click.
      autoStartedRef.current = sessionId;
      return;
    }
    autoStartedRef.current = sessionId;
    void create();
  }, [sessionId, cwd, known, mine, starting, create]);

  React.useEffect(() => {
    if (!pendingStartRef.current || !cwd || starting) return;
    if (mine.some((t) => t.status === 'running')) {
      pendingStartRef.current = false;
      return;
    }
    pendingStartRef.current = false;
    autoStartedRef.current = sessionId;
    void create();
  }, [cwd, starting, mine, sessionId, create]);

  const exitNote = selected ? exitSummary(selected) : null;
  // REQ-107: SSH feel — the socket state is a visible strip, not just an
  // aria-label. While disconnected keystrokes keep dropping silently at the
  // emulator, same as a dead SSH socket.
  const connNotice = connectionNotice(ws.status);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#0F0F11] text-[#EDE9E2]">
      <div
        role="application"
        aria-label={
          selectedRunning
            ? `Terminal — click and type directly, arrows for history, Control C interrupts (ws ${ws.status})`
            : 'Terminal pane'
        }
        onClick={() => {
          // REQ-079: an empty/dead pane starts a fresh shell on click — no
          // menus, no buttons, just click and type. A live one just focuses.
          if (!selectedRunning) {
            if (!starting) startShell();
            return;
          }
          termRef.current?.focus();
        }}
        className="relative min-h-0 flex-1 cursor-text"
      >
        <div ref={hostRef} data-terminal-host className="absolute inset-0 p-2" />
        {starting && terminals.length === 0 ? (
          <div className="absolute inset-x-0 top-0 p-3 font-mono text-xs text-white/40">Starting shell…</div>
        ) : !selected ? (
          <button
            type="button"
            className="absolute inset-0 flex items-start p-3 text-left font-mono text-xs text-white/40 hover:text-white/70"
            onClick={(e) => {
              e.stopPropagation();
              if (!starting) startShell();
            }}
          >
            Click to start a shell in this session&apos;s workspace.
          </button>
        ) : null}
      </div>
      {exitNote ? (
        <div className="border-t border-white/10 px-3 py-1 font-mono text-[11px] text-white/40">— {exitNote}</div>
      ) : null}
      {connNotice ? (
        connNotice.action === 'reconnect' ? (
          <button
            onClick={() => ws.reconnect()}
            className="flex items-center gap-1.5 border-t border-amber-400/20 bg-amber-400/10 px-3 py-1 font-mono text-[11px] text-amber-200/90 hover:bg-amber-400/20"
          >
            <Unplug className="h-3.5 w-3.5" />
            {connNotice.text}
          </button>
        ) : (
          <div className="flex items-center gap-1.5 border-t border-white/10 px-3 py-1 font-mono text-[11px] text-white/40">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            {connNotice.text}
          </div>
        )
      ) : null}
      {selected && !selectedRunning ? (
        <button
          className="border-t border-white/10 bg-white/5 px-3 py-1.5 text-left text-[11px] text-white/60 hover:bg-white/10 hover:text-white"
          onClick={() => startShell()}
        >
          Shell ended — click for a fresh one
        </button>
      ) : null}
    </div>
  );
}
