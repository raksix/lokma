import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import type { SessionMessage } from './types.js';

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
