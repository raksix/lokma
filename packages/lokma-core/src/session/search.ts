import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Database } from 'bun:sqlite';
import { SessionStore } from './store.js';
import type { SessionMessage } from './types.js';
import { buildMatchQuery } from '../vault/fts.js';

/**
 * Full-text search over session transcripts (Phase 2 memory-deep wave 3b,
 * Docs/28 session_search — the read half of "infinite memory").
 *
 * Prefers SQLite FTS5 (weighted BM25, synced incrementally — same shape as
 * the vault index in `../vault/fts`); degrades to ranked substring when
 * `bun:sqlite` is unavailable on the runtime. The route reports the engine
 * honestly (`SessionSearchEngine`), never silently.
 *
 * Index lives at `<sessions>/.fts5/sessions.db` — a dot-dir, so
 * `SessionStore.list()` (which only takes `*.jsonl`) never mistakes it for
 * a session. Opened, synced and closed per call: sessions are few, and
 * per-call handles can't go stale across processes (CLI + server share
 * the store). Sync granularity is one session file (mtimeMs + size):
 * on change, all rows for that session are re-inserted.
 */

export type SessionSearchHit = {
  sessionId: string;
  /** Display title (renamed or first-user-line, via `SessionStore.summary`). */
  title: string;
  role: SessionMessage['role'];
  /** Tool name for `role: 'tool'` rows (anchor blocks, tool results). */
  toolName?: string;
  /** Message index inside the transcript (stable jump target). */
  index: number;
  /** Trimmed first matching line (FTS markers stripped), max 160 chars. */
  excerpt: string;
  timestamp: string;
  score: number;
};

/** Which engine answered a session search (the route reports it honestly). */
export type SessionSearchEngine = 'fts5' | 'substring';

/** Route-level caps — the hit list stays small enough to render. */
export const SESSION_SEARCH_LIMITS = {
  /** Default page when the caller sends no `limit`. */
  defaultLimit: 20,
  /** Hard ceiling (larger values 400, they never silently clamp). */
  maxLimit: 50,
} as const;

/** BM25 column weights for `msgs_fts(sessionId, title, body)`. */
const BM25_WEIGHTS = '2.0, 10.0, 1.0';
/** Snippet markers (control chars — stripped before the hit leaves core). */
const SNIP_OPEN = '';
const SNIP_CLOSE = '';
/** Max excerpt chars per hit (same budget as the vault search). */
const EXCERPT_CAP = 160;

type SqliteModule = { Database: new (path: string) => Database };

let sqlitePromise: Promise<SqliteModule | null> | null = null;

/** Load `bun:sqlite` once per process; `null` means "no FTS on this runtime". */
function loadSqlite(): Promise<SqliteModule | null> {
  if (!sqlitePromise) {
    sqlitePromise = import('bun:sqlite')
      .then((mod) => mod as unknown as SqliteModule)
      .catch(() => null);
  }
  return sqlitePromise;
}

let warnedFallback = false;

/** True when `bun:sqlite` loads on this runtime (the FTS5 path is live). */
export async function sessionFtsAvailable(): Promise<boolean> {
  return (await loadSqlite()) !== null;
}

/** Warn once when FTS is unavailable so the fallback never hides silently. */
export function noteSessionFtsFallback(): void {
  if (!warnedFallback) {
    warnedFallback = true;
    console.warn('[session] bun:sqlite unavailable — transcript search falls back to substring');
  }
}

function sessionError(code: string, message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode, code });
}

function ftsDir(cwd: string): string {
  return join(SessionStore.dirFor(cwd), '.fts5');
}

function ftsPath(cwd: string): string {
  return join(ftsDir(cwd), 'sessions.db');
}

type FtsSyncStats = { added: number; updated: number; removed: number };

/**
 * Bring the index up to date with the transcripts on disk (stat-based:
 * only new/changed/deleted session files are re-read). Returns per-run
 * counts for probes.
 */
export async function syncSessionIndex(cwd: string): Promise<FtsSyncStats> {
  const mod = await loadSqlite();
  if (!mod) {
    noteSessionFtsFallback();
    return { added: 0, updated: 0, removed: 0 };
  }
  const store = new SessionStore(cwd);
  await mkdir(ftsDir(cwd), { recursive: true });
  const db = new mod.Database(ftsPath(cwd));
  try {
    db.run(
      `CREATE VIRTUAL TABLE IF NOT EXISTS msgs_fts USING fts5(sessionId, title, body, idx UNINDEXED, tokenize='unicode61 remove_diacritics 1')`,
    );
    db.run(`CREATE TABLE IF NOT EXISTS msgs_meta(sessionId TEXT PRIMARY KEY, mtimeMs REAL, size INTEGER)`);
    const stats: FtsSyncStats = { added: 0, updated: 0, removed: 0 };

    const ids = await store.list();
    const onDisk = new Map<string, { mtimeMs: number; size: number }>();
    for (const id of ids) {
      try {
        const s = await stat(SessionStore.pathFor(cwd, id));
        if (s.isFile()) onDisk.set(id, { mtimeMs: s.mtimeMs, size: s.size });
      } catch {
        continue;
      }
    }
    const known = new Map<string, { mtimeMs: number; size: number }>();
    for (const row of db.query<{ sessionId: string; mtimeMs: number; size: number }>(`SELECT sessionId, mtimeMs, size FROM msgs_meta`).all()) {
      known.set(row.sessionId, { mtimeMs: row.mtimeMs, size: row.size });
    }
    for (const id of known.keys()) {
      if (!onDisk.has(id)) {
        db.run(`DELETE FROM msgs_fts WHERE sessionId = ?`, id);
        db.run(`DELETE FROM msgs_meta WHERE sessionId = ?`, id);
        stats.removed += 1;
      }
    }
    for (const [id, info] of onDisk) {
      const prev = known.get(id);
      if (prev && prev.mtimeMs === info.mtimeMs && prev.size === info.size) continue;
      const messages = await store.read(id);
      const summary = await store.summary(id);
      db.run(`DELETE FROM msgs_fts WHERE sessionId = ?`, id);
      db.run(`DELETE FROM msgs_meta WHERE sessionId = ?`, id);
      if (prev) stats.updated += 1;
      else stats.added += 1;
      messages.forEach((m, index) => {
        db.run(`INSERT INTO msgs_fts(sessionId, title, body, idx) VALUES (?, ?, ?, ?)`, id, summary.title, m.content, index);
      });
      db.run(`INSERT INTO msgs_meta(sessionId, mtimeMs, size) VALUES (?, ?, ?)`, id, info.mtimeMs, info.size);
    }
    return stats;
  } finally {
    db.close();
  }
}

type FtsRow = { sessionId: string; title: string; idx: number; role: string; toolName: string | null; rank: number; snip: string };

/**
 * FTS5 search over one project's transcripts. Syncs the index first
 * (incremental), then runs one weighted-BM25 MATCH query. Returns `null`
 * when FTS is unavailable (caller falls back) or the query has no
 * searchable terms.
 */
export async function searchSessionsFts(cwd: string, query: string, limit: number): Promise<SessionSearchHit[] | null> {
  const match = buildMatchQuery(query);
  if (!match) return [];
  const mod = await loadSqlite();
  if (!mod) {
    noteSessionFtsFallback();
    return null;
  }
  const store = new SessionStore(cwd);
  await syncSessionIndex(cwd);
  const db = new mod.Database(ftsPath(cwd));
  try {
    const rows = db
      .query<FtsRow>(
        `SELECT f.sessionId AS sessionId, f.title AS title, f.idx AS idx, ` +
          `bm25(msgs_fts, ${BM25_WEIGHTS}) AS rank, ` +
          `snippet(msgs_fts, 2, '${SNIP_OPEN}', '${SNIP_CLOSE}', '…', 12) AS snip ` +
          `FROM msgs_fts AS f ` +
          `WHERE msgs_fts MATCH ? ORDER BY rank LIMIT ?`,
      )
      .all(match, limit);
    if (rows.length === 0) return [];
    // Titles can rename between sync and read — resolve fresh, keep FTS order.
    const hits: SessionSearchHit[] = [];
    for (const row of rows) {
      const messages = await store.read(row.sessionId);
      const at = messages[row.idx];
      if (!at) continue;
      const summary = await store.summary(row.sessionId);
      const excerpt = row.snip
        .replaceAll(SNIP_OPEN, '')
        .replaceAll(SNIP_CLOSE, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, EXCERPT_CAP);
      hits.push({
        sessionId: row.sessionId,
        title: summary.title,
        role: at.role,
        ...(at.toolName ? { toolName: at.toolName } : {}),
        index: row.idx,
        excerpt,
        timestamp: at.timestamp,
        score: Math.round(-row.rank * 10000) / 10000,
      });
    }
    return hits;
  } finally {
    db.close();
  }
}

/**
 * Ranked substring degrade path (no FTS on this runtime). AND over
 * whitespace-separated terms (case-insensitive); title hits outrank body
 * hits; excerpt is the first matching line, trimmed to 160 chars.
 */
export async function searchSessionsSubstring(cwd: string, query: string, limit: number): Promise<SessionSearchHit[]> {
  const store = new SessionStore(cwd);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const hits: SessionSearchHit[] = [];
  for (const id of await store.list()) {
    const [messages, summary] = await Promise.all([store.read(id), store.summary(id)]);
    const titleLower = summary.title.toLowerCase();
    const titleHit = terms.every((t) => titleLower.includes(t));
    messages.forEach((m, index) => {
      const bodyLower = m.content.toLowerCase();
      if (!terms.every((t) => bodyLower.includes(t))) return;
      let score: number;
      let excerpt: string;
      if (titleHit) {
        score = 100;
        excerpt = m.content.split('\n')[0]?.trim().slice(0, EXCERPT_CAP) ?? '';
      } else {
        const firstAt = Math.min(...terms.map((t) => bodyLower.indexOf(t)));
        score = 10 - Math.min(firstAt / 1000, 9);
        const line = m.content.split('\n').find((l) => terms.every((t) => l.toLowerCase().includes(t))) ?? '';
        excerpt = line.trim().slice(0, EXCERPT_CAP);
      }
      hits.push({
        sessionId: id,
        title: summary.title,
        role: m.role,
        ...(m.toolName ? { toolName: m.toolName } : {}),
        index,
        excerpt,
        timestamp: m.timestamp,
        score: Math.round(score * 10000) / 10000,
      });
    });
  }
  hits.sort((a, b) => b.score - a.score || a.sessionId.localeCompare(b.sessionId) || a.index - b.index);
  return hits.slice(0, limit);
}

export type SessionSearchOptions = {
  /** Max hits (default 20, ceiling 50 — larger values 400, never clamp). */
  limit?: unknown;
};

/**
 * Full-text search over one project's session transcripts. Prefers FTS5,
 * degrades to ranked substring. Empty/non-string queries 400 (`bad_query`);
 * out-of-range limits 400 (`bad_limit`).
 */
export async function searchSessionsDetailed(
  cwd: string,
  query: unknown,
  opts: SessionSearchOptions = {},
): Promise<{ hits: SessionSearchHit[]; count: number; engine: SessionSearchEngine }> {
  if (typeof query !== 'string' || query.trim() === '') {
    throw sessionError('bad_query', 'GET /api/sessions/search needs ?q=<text>', 400);
  }
  const limit = opts.limit === undefined || opts.limit === '' ? SESSION_SEARCH_LIMITS.defaultLimit : Number(opts.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > SESSION_SEARCH_LIMITS.maxLimit) {
    throw sessionError('bad_limit', `limit must be an integer 1-${SESSION_SEARCH_LIMITS.maxLimit}`, 400);
  }
  const engine: SessionSearchEngine = (await sessionFtsAvailable()) ? 'fts5' : 'substring';
  if (engine === 'fts5') {
    const ftsHits = await searchSessionsFts(cwd, query, limit);
    if (ftsHits !== null) return { hits: ftsHits, count: ftsHits.length, engine: 'fts5' };
  }
  const hits = await searchSessionsSubstring(cwd, query, limit);
  return { hits, count: hits.length, engine: 'substring' };
}
