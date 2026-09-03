/**
 * sessionStore — client cache over `GET /api/sessions*`.
 * The server (`SessionStore` JSONL, shared with the CLI) is the source of
 * truth; this store caches the list + per-session transcripts and marks them
 * stale when WS events signal server-side growth.
 */
import { create } from 'zustand';
import { api, type SessionSummary } from '@/lib/api';
import type { ServerMessage } from 'lokma-shared/protocol/ws';

export type SessionStore = {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  transcripts: Record<string, unknown[]>;
  stale: Record<string, boolean>;
  loading: boolean;
  lastError: string | null;
  /** Reload the session list from the server (replaces the cache). */
  refreshSessions: (cwd?: string) => Promise<void>;
  /** Switch the active session (URL + chat follow this id). */
  selectSession: (id: string | null) => void;
  /** Fetch one transcript unless cached and fresh. */
  loadTranscript: (id: string) => Promise<void>;
  /** Drop one cached transcript so the next view refetches it. */
  invalidateSession: (id: string) => void;
  /** Fold WS lifecycle frames into cache state (stream frames stay in use-ws). */
  applyWsEvent: (msg: ServerMessage) => void;
  reset: () => void;
};

const initial = {
  sessions: [] as SessionSummary[],
  activeSessionId: null as string | null,
  transcripts: {} as Record<string, unknown[]>,
  stale: {} as Record<string, boolean>,
  loading: false,
  lastError: null as string | null,
};

export const useSessionStore = create<SessionStore>()((set, get) => ({
  ...initial,

  refreshSessions: async (cwd?: string) => {
    set({ loading: true, lastError: null });
    try {
      const res = await api.listSessions(cwd);
      const ids = new Set(res.sessions.map((s) => s.id));
      set((prev) => ({
        sessions: res.sessions,
        // Prune transcript caches for sessions that no longer exist.
        transcripts: Object.fromEntries(Object.entries(prev.transcripts).filter(([id]) => ids.has(id))),
        stale: Object.fromEntries(Object.entries(prev.stale).filter(([id]) => ids.has(id))),
        activeSessionId: prev.activeSessionId && ids.has(prev.activeSessionId) ? prev.activeSessionId : null,
        loading: false,
      }));
    } catch (e) {
      set({ loading: false, lastError: e instanceof Error ? e.message : 'session list failed' });
    }
  },

  selectSession: (id: string | null) => {
    set({ activeSessionId: id });
  },

  loadTranscript: async (id: string) => {
    const { transcripts, stale } = get();
    if (transcripts[id] && !stale[id]) return;
    set({ loading: true, lastError: null });
    try {
      const detail = await api.getSession(id);
      set((prev) => ({
        transcripts: { ...prev.transcripts, [id]: detail.messages },
        stale: { ...prev.stale, [id]: false },
        loading: false,
      }));
    } catch (e) {
      set({ loading: false, lastError: e instanceof Error ? e.message : 'transcript load failed' });
    }
  },

  invalidateSession: (id: string) => {
    set((prev) => {
      const transcripts = { ...prev.transcripts };
      const stale = { ...prev.stale, [id]: true };
      delete transcripts[id];
      return { transcripts, stale };
    });
  },

  applyWsEvent: (msg: ServerMessage) => {
    // A finished stream means the server transcript grew — refetch on next view.
    if (msg.type === 'done' && msg.sessionId) {
      get().invalidateSession(msg.sessionId);
    }
  },

  reset: () => {
    set({ ...initial });
  },
}));
