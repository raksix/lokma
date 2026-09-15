/**
 * sessionStore — client cache over `GET /api/sessions*`.
 * The server (`SessionStore` JSONL, shared with the CLI) is the source of
 * truth; this store caches the list + per-session transcripts and marks them
 * stale when WS events signal server-side growth.
 */
import * as React from 'react';
import { create } from 'zustand';
import { api, ApiError, type AuthProject, type SessionSummary } from '@/lib/api';
import type { ServerMessage } from '@lokma/shared/protocol/ws';

export type SessionStore = {
  sessions: SessionSummary[];
  /** Project records (REQ-080) — visible even with zero sessions. */
  projects: AuthProject[];
  /** Reload the project list (called with sessions; failures keep old list). */
  refreshProjects: () => Promise<void>;
  activeSessionId: string | null;
  transcripts: Record<string, unknown[]>;
  stale: Record<string, boolean>;
  loading: boolean;
  lastError: string | null;
  /** True after the first successful list load — unknown ids are then local-only. */
  listLoaded: boolean;
  /** Reload the session list from the server (replaces the cache). */
  refreshSessions: (cwd?: string) => Promise<void>;
  /** Same reload without touching `loading` (REQ-121 background poll). */
  refreshSessionsQuiet: (cwd?: string) => Promise<void>;
  /** Switch the active session (URL + chat follow this id). */
  selectSession: (id: string | null) => void;
  /** Fetch one transcript unless cached and fresh (`force` refetches after streams). */
  loadTranscript: (id: string, force?: boolean) => Promise<void>;
  /** Drop one cached transcript so the next view refetches it. */
  invalidateSession: (id: string) => void;
  /** Create a session on the server, refresh the list, and select it. */
  createSession: (opts?: { cwd?: string; model?: string; botId?: string }) => Promise<string | null>;
  /** Bind/switch/clear the session's bot (Grok-style switch, REQ-027). */
  setSessionBot: (id: string, botId: string | null) => Promise<boolean>;
  /** Fork a session on the server, refresh, and return the new id. */
  forkSession: (id: string) => Promise<string | null>;
  /** Rename a session (title sidecar) and refresh the list. */
  renameSession: (id: string, title: string) => Promise<boolean>;
  /** Delete a session on the server and prune every local cache for it. */
  deleteSession: (id: string) => Promise<boolean>;
  /** Merge `fromId` into `intoId` on the server; the target goes stale. */
  mergeSessions: (intoId: string, fromId: string) => Promise<number | null>;
  /** Fold WS lifecycle frames into cache state (stream frames stay in use-ws). */
  applyWsEvent: (msg: ServerMessage) => void;
  reset: () => void;
};

const initial = {
  sessions: [] as SessionSummary[],
  projects: [] as AuthProject[],
  activeSessionId: null as string | null,
  transcripts: {} as Record<string, unknown[]>,
  stale: {} as Record<string, boolean>,
  loading: false,
  lastError: null as string | null,
  listLoaded: false,
};

/**
 * REQ-148 — cache-prune policy for the list refresh. The list is a polled
 * SNAPSHOT, never proof of absence: it lags a session the WS just created and
 * it drops rows it cannot see (scoped snapshots, ownership filters), so
 * pruning FRESH transcript caches by list membership deleted the history a
 * pane was reading on the next 4 s poll — the pane flipped back to the empty
 * hero mid-read (the second half of "the history does not auto-load"). A
 * FRESH entry came from the server, so the server knows that session: keep
 * it. Only STALE entries (refetch pending, or a gone session) may be pruned
 * by list membership.
 */
export function keepSessionCacheEntry(
  id: string,
  listIds: ReadonlySet<string>,
  stale: Record<string, boolean>,
): boolean {
  return listIds.has(id) || !stale[id];
}

export const useSessionStore = create<SessionStore>()((set, get) => ({
  ...initial,

  refreshSessions: async (cwd?: string) => {
    set({ loading: true, lastError: null });
    try {
      const res = await api.listSessions(cwd);
      const ids = new Set(res.sessions.map((s) => s.id));
      set((prev) => ({
        sessions: res.sessions,
        // REQ-148: never prune a FRESH transcript by list membership.
        transcripts: Object.fromEntries(
          Object.entries(prev.transcripts).filter(([id]) => keepSessionCacheEntry(id, ids, prev.stale)),
        ),
        stale: Object.fromEntries(
          Object.entries(prev.stale).filter(([id]) => keepSessionCacheEntry(id, ids, prev.stale)),
        ),
        activeSessionId: prev.activeSessionId && ids.has(prev.activeSessionId) ? prev.activeSessionId : null,
        loading: false,
        listLoaded: true,
      }));
      // Project records ride along (REQ-080) — one list load refreshes both.
      await get().refreshProjects();
    } catch (e) {
      set({ loading: false, lastError: e instanceof Error ? e.message : 'session list failed' });
    }
  },

  refreshSessionsQuiet: async (cwd?: string) => {
    try {
      const res = await api.listSessions(cwd);
      const ids = new Set(res.sessions.map((s) => s.id));
      set((prev) => ({
        sessions: res.sessions,
        // REQ-148: same prune policy as the loud refresh — the 4 s sidebar
        // poll must not eat the transcript a pane is showing.
        transcripts: Object.fromEntries(
          Object.entries(prev.transcripts).filter(([id]) => keepSessionCacheEntry(id, ids, prev.stale)),
        ),
        stale: Object.fromEntries(
          Object.entries(prev.stale).filter(([id]) => keepSessionCacheEntry(id, ids, prev.stale)),
        ),
        activeSessionId: prev.activeSessionId && ids.has(prev.activeSessionId) ? prev.activeSessionId : null,
        listLoaded: true,
      }));
    } catch {
      // Background poll never surfaces errors — next tick retries.
    }
  },

  refreshProjects: async () => {
    try {
      const res = await api.listProjects();
      set({ projects: res.projects ?? [] });
    } catch (e) {
      console.error('[sessions] refreshProjects failed:', e instanceof Error ? e.message : e);
    }
  },

  selectSession: (id: string | null) => {
    set({ activeSessionId: id });
  },

  loadTranscript: async (id: string, force?: boolean) => {
    const { transcripts, stale } = get();
    if (!force && transcripts[id] && !stale[id]) return;
    // REQ-148: the list snapshot is never proof of absence. `sessions` is a
    // polled summary — it lags a session the WS just created and it prunes
    // rows the list cannot see — so "id not in the list" used to cache an
    // EMPTY transcript without asking the server, and a pane that switched to
    // such a session stayed permanently blank (zero requests, nothing to
    // debug). One verification GET decides instead: a real session returns
    // its history, a genuine miss falls through to the `session_not_found`
    // branch below (honest empty state, no error). `force` (post-stream
    // reload) keeps refetching; the fast-path above serves fresh hits.
    set({ loading: true, lastError: null });
    try {
      const detail = await api.getSession(id);
      set((prev) => ({
        transcripts: { ...prev.transcripts, [id]: detail.messages },
        stale: { ...prev.stale, [id]: false },
        loading: false,
      }));
    } catch (e) {
      // Deleted between list and fetch — same empty-session outcome, no error.
      if (e instanceof ApiError && e.code === 'session_not_found') {
        set((prev) => ({
          transcripts: { ...prev.transcripts, [id]: [] },
          stale: { ...prev.stale, [id]: false },
          loading: false,
        }));
        return;
      }
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

  createSession: async (opts?: { cwd?: string; model?: string; botId?: string }) => {
    try {
      const res = await api.createSession(opts ?? {});
      // REQ-087: always a GLOBAL refresh — a scoped `refreshSessions(cwd)`
      // used to REPLACE the whole list with one project's sessions (every
      // other session vanished) and the next unscoped refresh dropped the
      // new session again. The server list is global now, so one load shows
      // the new row inside its project group.
      await get().refreshSessions();
      get().selectSession(res.id);
      return res.id;
    } catch (e) {
      set({ lastError: e instanceof Error ? e.message : 'session create failed' });
      return null;
    }
  },

  setSessionBot: async (id: string, botId: string | null) => {
    try {
      // Empty string clears server-side; null would fail the string guard.
      await api.patchSession(id, { botId: botId ?? '' });
      await get().refreshSessions();
      return true;
    } catch (e) {
      set({ lastError: e instanceof Error ? e.message : 'bot bind failed' });
      return false;
    }
  },

  forkSession: async (id: string) => {
    try {
      const res = await api.forkSession(id);
      await get().refreshSessions();
      return res.id;
    } catch (e) {
      set({ lastError: e instanceof Error ? e.message : 'session fork failed' });
      return null;
    }
  },

  renameSession: async (id: string, title: string) => {
    try {
      await api.renameSession(id, title);
      await get().refreshSessions();
      return true;
    } catch (e) {
      set({ lastError: e instanceof Error ? e.message : 'session rename failed' });
      return false;
    }
  },

  deleteSession: async (id: string) => {
    try {
      await api.deleteSession(id);
      set((prev) => {
        const transcripts = { ...prev.transcripts };
        const stale = { ...prev.stale };
        delete transcripts[id];
        delete stale[id];
        return {
          sessions: prev.sessions.filter((s) => s.id !== id),
          transcripts,
          stale,
          activeSessionId: prev.activeSessionId === id ? null : prev.activeSessionId,
        };
      });
      return true;
    } catch (e) {
      set({ lastError: e instanceof Error ? e.message : 'session delete failed' });
      return false;
    }
  },

  mergeSessions: async (intoId: string, fromId: string) => {
    try {
      const res = await api.mergeSessions(intoId, fromId);
      get().invalidateSession(intoId);
      await get().refreshSessions();
      return res.appended;
    } catch (e) {
      set({ lastError: e instanceof Error ? e.message : 'session merge failed' });
      return null;
    }
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

/**
 * Known-session lookup for panes that only need list meta (cwd/model).
 * - `'loading'` — server list not in yet: wait (the effect re-runs on flip),
 *   never fire a detail GET for an id the server may not know.
 * - `null` — list loaded and the id is unknown: a fresh local-only session,
 *   use empty defaults with NO request (fresh boots used to 404 once per pane).
 * - summary — cached meta wins, no GET needed (cwd is create-time immutable).
 */
export type KnownSession = SessionSummary | 'loading' | null;

/**
 * REQ-144: value key for the identity cache below. Two summaries that carry the
 * same values share a key — every 4 s the sidebar polls the list and the store
 * swaps in freshly parsed objects for rows that did not change. An identity that
 * churns on every tick made every `useEffect(..., [known])` in the shell re-run
 * and reset its pane (the Files tree "pressed F5" every four seconds).
 */
export function knownSessionKey(state: KnownSession): string {
  if (state === 'loading') return 'loading';
  if (state === null) return 'missing';
  return JSON.stringify(state);
}

/** REQ-144: keep the previous summary object while its values are unchanged. */
export function rememberKnown(
  prev: { key: string; value: KnownSession } | null,
  state: KnownSession,
): { key: string; value: KnownSession } {
  const key = knownSessionKey(state);
  return prev && prev.key === key ? prev : { key, value: state };
}

export function useKnownSession(id: string | undefined | null): KnownSession {
  const listLoaded = useSessionStore((s) => s.listLoaded);
  const sessions = useSessionStore((s) => s.sessions);
  const state: KnownSession = !id
    ? null
    : !listLoaded
      ? 'loading'
      : (sessions.find((s) => s.id === id) ?? null);
  // REQ-144: hand out a value-stable reference so poll churn cannot re-run panes.
  const cache = React.useRef<{ key: string; value: KnownSession } | null>(null);
  cache.current = rememberKnown(cache.current, state);
  return cache.current.value;
}

/**
 * REQ-144: the workspace path a pane should bind to — a primitive string, safe
 * in dependency arrays. `'loading'` = list not in yet, `'missing'` = the server
 * does not know this id (fresh local-only session), otherwise the cwd (`''`
 * when the session has no workspace yet). None of those magic values can collide
 * with a real path, so panes can switch on them directly.
 */
export function useKnownCwd(id: string | undefined | null): string {
  const known = useKnownSession(id);
  if (known === 'loading') return 'loading';
  if (known === null) return 'missing';
  return known.cwd ?? '';
}

// ─── Read/unread tracking (REQ-121) ─────────────────────────────────────
// A session is unread when it has activity newer than the last time the user
// opened it (or watched it finish). Stored in localStorage; `markSessionSeen`
// broadcasts `SEEN_EVENT` so all sidebar groups re-render their dots.
const SEEN_KEY = 'lokma-seen:v1';
export const SEEN_EVENT = 'lokma:seen';

export function readSeenMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // Corrupt JSON reads as all-unseen — seeding below repairs it.
  }
  return {};
}

export function markSessionSeen(id: string): void {
  try {
    const all = readSeenMap();
    all[id] = new Date().toISOString();
    localStorage.setItem(SEEN_KEY, JSON.stringify(all));
  } catch {
    // Private mode: the dot just won't persist; still notify live rows.
  }
  window.dispatchEvent(new CustomEvent(SEEN_EVENT, { detail: id }));
}

/** Seed never-opened sessions as read-as-of-now (grandfathers old rows). */
export function seedSeenMap(ids: string[]): void {
  try {
    const all = readSeenMap();
    let dirty = false;
    const now = new Date().toISOString();
    for (const id of ids) {
      if (!(id in all)) {
        all[id] = now;
        dirty = true;
      }
    }
    if (dirty) localStorage.setItem(SEEN_KEY, JSON.stringify(all));
  } catch {
    // Private mode — skip.
  }
}

export function isSessionUnread(updatedAt: string | undefined, seenAt: string | undefined): boolean {
  if (!updatedAt) return false;
  if (!seenAt) return false;
  return Date.parse(updatedAt) > Date.parse(seenAt);
}
