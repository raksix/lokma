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

export class SessionStore {
  constructor(private cwd: string) {}

  /** Append one message as JSONL line. */
  async append(sessionId: string, msg: SessionMessage): Promise<void> {
    const dir = sessionDir(this.cwd);
    await mkdir(dir, { recursive: true });
    const line = JSON.stringify(msg) + '\n';
    await appendFile(sessionPath(this.cwd, sessionId), line, 'utf-8');
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
  async writeMeta(sessionId: string, patch: Partial<SessionMeta>): Promise<SessionMeta> {
    const dir = sessionDir(this.cwd);
    await mkdir(dir, { recursive: true });
    const prev = await this.readMeta(sessionId);
    const now = new Date().toISOString();
    const next: SessionMeta = {
      id: sessionId,
      cwd: this.cwd,
      model: patch.model ?? prev?.model ?? '',
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    const title = patch.title ?? prev?.title;
    if (typeof title === 'string' && title) next.title = title;
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
    await this.writeMeta(newId, { model: meta?.model ?? '', title: meta?.title });
    return { id: newId, copied: messages.length };
  }

  /**
   * Rewind a session — truncates the transcript to its first `keepLines`
   * lines (server-side checkpoint restore, not just UI scroll).
   */
  async rewind(sessionId: string, keepLines: number): Promise<{ id: string; kept: number }> {
    const messages = await this.read(sessionId);
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
        createdAt = createdAt ?? info.birthtime.toISOString();
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
      messageCount: messages.length,
      createdAt,
      updatedAt,
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
