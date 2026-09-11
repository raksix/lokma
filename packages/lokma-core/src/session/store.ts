import { appendFile, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import type { SessionMessage, SessionMeta, SessionSummary } from './types.js';

/**
 * SessionStore — JSONL on disk, one file per session.
 * Path: ~/.lokma/projects/<hash>/sessions/<sessionId>.jsonl
 * Hash is sha1(cwd) — same as Claude Code ~/.claude/projects/.
 * Both CLI and Web read the same files (Phase 0 exit criteria).
 */

function projectHash(cwd: string): string {
  // Keep short like Claude: first 8 of sha1, plus sanitized cwd
  const h = createHash('sha1').update(cwd).digest('hex').slice(0, 8);
  const safe = cwd.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40);
  return `${safe}-${h}`;
}

function sessionDir(cwd: string): string {
  return join(homedir(), '.lokma', 'projects', projectHash(cwd), 'sessions');
}

function sessionPath(cwd: string, sessionId: string): string {
  return join(sessionDir(cwd), `${sessionId}.jsonl`);
}

function metaPath(cwd: string, sessionId: string): string {
  return join(sessionDir(cwd), `${sessionId}.meta.json`);
}

/** Session ids are filename-safe tokens — rejects traversal before any scan. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Canonical cwd form (REQ-087): trim, expand a leading `~` to the server
 * home, drop trailing slashes. Without this, `/x/proj` vs `/x/proj/` hash
 * to DIFFERENT project dirs and the same project splits in two — the
 * "session opens in the wrong project" half of REQ-087. Idempotent.
 */
export function normalizeCwd(cwd: string): string {
  const raw = cwd.trim();
  const expanded =
    raw === '~' ? homedir() : raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : raw;
  if (expanded.length > 1) return expanded.replace(/\/+$/, '');
  return expanded;
}

/** Root holding one `<hash(cwd)>` dir per project with sessions. */
function projectsRoot(): string {
  return join(homedir(), '.lokma', 'projects');
}

/**
 * Locate the on-disk session dir holding `<sessionId>.jsonl` (REQ-087).
 * Scans every project dir by filename — never by `hash(cwd)` — so legacy
 * slash-variant dirs (`/x/proj/` vs `/x/proj`) resolve too. Returns the
 * meta-stamped cwd (as written at create time) plus the dir, or null.
 */
export async function locateSession(
  sessionId: string,
): Promise<{ cwd: string | null; dir: string } | null> {
  if (!SESSION_ID_PATTERN.test(sessionId)) return null;
  let entries;
  try {
    entries = await readdir(projectsRoot(), { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(projectsRoot(), entry.name, 'sessions');
    const transcript = join(dir, `${sessionId}.jsonl`);
    try {
      await stat(transcript);
    } catch {
      continue;
    }
    let cwd: string | null = null;
    try {
      const meta = JSON.parse(await readFile(join(dir, `${sessionId}.meta.json`), 'utf-8')) as {
        cwd?: unknown;
      };
      if (typeof meta.cwd === 'string' && meta.cwd) cwd = meta.cwd;
    } catch {
      // Meta-less transcript — the dir still identifies the session.
    }
    return { cwd, dir };
  }
  return null;
}

/**
 * Summaries for EVERY session across all project dirs, newest first
 * (REQ-087). Powers the unscoped `GET /api/sessions` so a session created
 * in a new project's cwd is visible in the default list instead of
 * silently living in a dir the sidebar never reads.
 */
export async function listAllSummaries(): Promise<SessionSummary[]> {
  let entries;
  try {
    entries = await readdir(projectsRoot(), { withFileTypes: true });
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const out: SessionSummary[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const dir = join(projectsRoot(), entry.name, 'sessions');
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl') || file.endsWith('.archive.jsonl')) continue;
      const id = file.replace(/\.jsonl$/, '');
      if (!SESSION_ID_PATTERN.test(id) || seen.has(id)) continue;
      seen.add(id);
      let cwd: string | null = null;
      try {
        const meta = JSON.parse(await readFile(join(dir, `${id}.meta.json`), 'utf-8')) as {
          cwd?: unknown;
        };
        if (typeof meta.cwd === 'string' && meta.cwd) cwd = meta.cwd;
      } catch {
        // Meta-less: group under the server default rather than dropping.
      }
      // The meta cwd reproduces this dir's hash exactly (it was written
      // from the same string), so no slash-variant miss is possible here.
      const store = new SessionStore(cwd ?? process.cwd());
      // Guard against a cwd whose hash points elsewhere (moved homes):
      // fall back to reading the found dir's files directly is overkill —
      // summary() degrades to stat/now, never throws.
      out.push(await store.summary(id));
    }
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return out;
}

export class SessionStore {
  constructor(private cwd: string) {}

  /** Append one message as JSONL line. */
  async append(sessionId: string, msg: SessionMessage): Promise<void> {
    const dir = sessionDir(this.cwd);
    await mkdir(dir, { recursive: true });
    const line = JSON.stringify(msg) + '\n';
    await appendFile(sessionPath(this.cwd, sessionId), line, 'utf-8');
    // REQ-121: real activity bumps updatedAt (drives newest-first order).
    // Meta patches (model/bot/title/claude-handle) must NOT bump — opening
    // a session used to catapult it to the top of the list.
    const meta = await this.readMeta(sessionId);
    if (meta) await this.writeMeta(sessionId, {}, { touch: true });
  }

  /** Read all messages for a session. Returns [] if not found. */
  async read(sessionId: string): Promise<SessionMessage[]> {
    try {
      const raw = await readFile(sessionPath(this.cwd, sessionId), 'utf-8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as SessionMessage);
    } catch {
      return [];
    }
  }

  /** List sessionIds for this project (compaction archives are not sessions). */
  async list(): Promise<string[]> {
    try {
      const files = await readdir(sessionDir(this.cwd));
      return files
        .filter((f) => f.endsWith('.jsonl') && !f.endsWith('.archive.jsonl'))
        .map((f) => f.replace('.jsonl', ''));
    } catch {
      return [];
    }
  }

  /** Read the `<id>.meta.json` sidecar (model, timestamps). Null when absent. */
  async readMeta(sessionId: string): Promise<SessionMeta | null> {
    try {
      const raw = await readFile(metaPath(this.cwd, sessionId), 'utf-8');
      return JSON.parse(raw) as SessionMeta;
    } catch {
      return null;
    }
  }

  /** Merge + persist the `<id>.meta.json` sidecar (creates the dir if needed). */
  async writeMeta(sessionId: string, patch: Partial<SessionMeta>, opts?: { touch?: boolean }): Promise<SessionMeta> {
    const dir = sessionDir(this.cwd);
    await mkdir(dir, { recursive: true });
    const prev = await this.readMeta(sessionId);
    const now = new Date().toISOString();
    // REQ-121: updatedAt advances only on explicit touch (new sessions get
    // `now`; plain patches preserve the previous stamp so opening/editing
    // settings never reorders the list).
    const updatedAt = opts?.touch ? now : (prev?.updatedAt ?? now);
    const next: SessionMeta = {
      id: sessionId,
      cwd: this.cwd,
      model: patch.model ?? prev?.model ?? '',
      createdAt: prev?.createdAt ?? now,
      updatedAt,
    };
    const title = patch.title ?? prev?.title;
    if (typeof title === 'string' && title) next.title = title;
    // Owner: a patch value wins (stamped at create/fork by the server),
    // otherwise the previous owner survives the merge. Empty clears.
    const ownerId = patch.ownerId !== undefined ? patch.ownerId : prev?.ownerId;
    if (typeof ownerId === 'string' && ownerId) next.ownerId = ownerId;
    // Bot binding: a patch value wins (empty string clears the binding back
    // to plain chat), otherwise the previous binding survives the merge.
    const botId = patch.botId !== undefined ? patch.botId : prev?.botId;
    if (typeof botId === 'string' && botId) next.botId = botId;
    // Claude headless handle (REQ-116 FAZ D-continuity): a patch value wins
    // (empty string clears back to a fresh engine run), otherwise the
    // previous handle survives the merge — unrelated patches keep it.
    const claudeSessionId = patch.claudeSessionId !== undefined ? patch.claudeSessionId : prev?.claudeSessionId;
    if (typeof claudeSessionId === 'string' && claudeSessionId) next.claudeSessionId = claudeSessionId;
    await writeFile(metaPath(this.cwd, sessionId), JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }

  /**
   * Fork a session — copies transcript + meta into a new id.
   * The fork is a real on-disk copy, so CLI `--resume <newId>` sees it too.
   */
  async fork(sessionId: string, newId: string): Promise<{ id: string; copied: number }> {
    const messages = await this.read(sessionId);
    const dir = sessionDir(this.cwd);
    await mkdir(dir, { recursive: true });
    const lines = messages.map((m) => JSON.stringify(m)).join('\n');
    await writeFile(sessionPath(this.cwd, newId), lines ? lines + '\n' : '', 'utf-8');
    const meta = await this.readMeta(sessionId);
    await this.writeMeta(newId, { model: meta?.model ?? '', title: meta?.title, botId: meta?.botId ?? '' });
    return { id: newId, copied: messages.length };
  }

  /**
   * Rewind a session — truncates the transcript to its first `keepLines`
   * lines (server-side checkpoint restore, not just UI scroll).
   * Unknown ids throw `session_not_found` (same convention as merge/GET) —
   * rewinding must never mint an empty transcript file for a bogus id.
   */
  async rewind(sessionId: string, keepLines: number): Promise<{ id: string; kept: number }> {
    const [messages, meta] = await Promise.all([this.read(sessionId), this.readMeta(sessionId)]);
    if (messages.length === 0 && meta == null) {
      throw Object.assign(new Error(`No transcript for ${sessionId}`), {
        statusCode: 404,
        code: 'session_not_found',
      });
    }
    const kept = messages.slice(0, Math.max(0, Math.floor(keepLines)));
    await writeFile(
      sessionPath(this.cwd, sessionId),
      kept.map((m) => JSON.stringify(m)).join('\n') + (kept.length ? '\n' : ''),
      'utf-8',
    );
    return { id: sessionId, kept: kept.length };
  }

  /**
   * Rename a session — persists a human title in the meta sidecar.
   * The title is display-only; the transcript on disk is untouched.
   */
  async rename(sessionId: string, title: string): Promise<SessionMeta> {
    return this.writeMeta(sessionId, { title });
  }

  /**
   * Delete a session — removes the transcript JSONL + meta sidecar.
   * Missing files are tolerated; `existed` tells whether anything was there.
   */
  async remove(sessionId: string): Promise<{ id: string; existed: boolean }> {
    let existed = false;
    for (const path of [sessionPath(this.cwd, sessionId), metaPath(this.cwd, sessionId)]) {
      try {
        await unlink(path);
        existed = true;
      } catch {
        // Already gone — keep deleting the other file.
      }
    }
    return { id: sessionId, existed };
  }

  /**
   * Merge one session into another — appends every message of `fromId`
   * to `intoId` (chronological file order) and touches the target meta.
   * Both transcripts must exist and be non-empty, otherwise it throws
   * a `{ statusCode, code }` error the route maps to 404.
   */
  async merge(intoId: string, fromId: string): Promise<{ id: string; from: string; appended: number }> {
    if (intoId === fromId) {
      throw Object.assign(new Error('Cannot merge a session into itself'), {
        statusCode: 400,
        code: 'bad_merge',
      });
    }
    const [target, source] = await Promise.all([this.read(intoId), this.read(fromId)]);
    if (target.length === 0) {
      throw Object.assign(new Error(`No transcript for ${intoId}`), {
        statusCode: 404,
        code: 'session_not_found',
      });
    }
    if (source.length === 0) {
      throw Object.assign(new Error(`No transcript for ${fromId}`), {
        statusCode: 404,
        code: 'session_not_found',
      });
    }
    const lines = source.map((m) => JSON.stringify(m)).join('\n') + '\n';
    await appendFile(sessionPath(this.cwd, intoId), lines, 'utf-8');
    await this.writeMeta(intoId, {});
    return { id: intoId, from: fromId, appended: source.length };
  }

  /** Display title for a transcript: first user line, single-line, capped. */
  private static titleFor(messages: SessionMessage[], fallback: string): string {
    const firstUser = messages.find((m) => m.role === 'user' && m.content.trim());
    const raw = (firstUser?.content ?? '').split('\n')[0]?.trim() ?? '';
    if (!raw) return fallback;
    return raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
  }

  /**
   * List summary for one session — title, model, counts, timestamps.
   * Powers `GET /api/sessions` grouping (Today/Yesterday/Earlier, by-project)
   * without forcing the client to fetch every transcript.
   */
  async summary(sessionId: string): Promise<SessionSummary> {
    const [messages, meta] = await Promise.all([this.read(sessionId), this.readMeta(sessionId)]);
    let createdAt = meta?.createdAt ?? null;
    let updatedAt = meta?.updatedAt ?? null;
    if (!createdAt || !updatedAt) {
      try {
        const info = await stat(sessionPath(this.cwd, sessionId));
        // Bun reports birthtimeMs 0 (no btime support) — epoch is never a
        // real creation date, so fall back to mtime on runtimes without btime.
        const birthMs = typeof info.birthtimeMs === 'number' ? info.birthtimeMs : 0;
        createdAt = createdAt ?? (birthMs > 0 ? info.birthtime.toISOString() : info.mtime.toISOString());
        updatedAt = updatedAt ?? info.mtime.toISOString();
      } catch {
        // Brand-new session whose file is not flushed yet — fall back to now.
        const now = new Date().toISOString();
        createdAt = createdAt ?? now;
        updatedAt = updatedAt ?? now;
      }
    }
    return {
      id: sessionId,
      cwd: this.cwd,
      title: meta?.title ?? SessionStore.titleFor(messages, 'Untitled session'),
      renamed: typeof meta?.title === 'string' && meta.title.length > 0,
      model: meta?.model && meta.model.length > 0 ? meta.model : null,
      botId: meta?.botId && meta.botId.length > 0 ? meta.botId : null,
      messageCount: messages.length,
      createdAt,
      updatedAt,
      ownerId: typeof meta?.ownerId === 'string' && meta.ownerId ? meta.ownerId : null,
    };
  }

  /** List summaries for every session in this project (newest first). */
  async listSummaries(): Promise<SessionSummary[]> {
    const ids = await this.list();
    const out = await Promise.all(ids.map((id) => this.summary(id)));
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return out;
  }

  /** Helpers for server to compute hash without instance. */
  static hashFor(cwd: string): string {
    return projectHash(cwd);
  }

  static dirFor(cwd: string): string {
    return sessionDir(cwd);
  }
  static pathFor(cwd: string, sessionId: string): string {
    return sessionPath(cwd, sessionId);
  }
}
