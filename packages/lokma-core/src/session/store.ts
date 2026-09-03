import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import type { SessionMessage, SessionMeta } from './types.js';

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

  /** List sessionIds for this project. */
  async list(): Promise<string[]> {
    try {
      const files = await readdir(sessionDir(this.cwd));
      return files.filter((f) => f.endsWith('.jsonl')).map((f) => f.replace('.jsonl', ''));
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
    await this.writeMeta(newId, { model: meta?.model ?? '' });
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
