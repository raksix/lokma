import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type { SessionMessage } from '../session/types.js';
import { SessionStore } from '../session/store.js';
import { buildAgentTrace, type AgentTrace } from './trace.js';

/**
 * Trace shares — frozen read-only snapshots under `~/.lokma/shares/`.
 * `POST /api/share/agent { agentId }` freezes `buildAgentTrace()` output;
 * `POST /api/share/session { sessionId, cwd? }` freezes the session JSONL
 * transcript (the same bytes the Replay view renders — snapshot and replay
 * can never disagree). `GET /api/share/:token` serves the frozen copy, so
 * later edits/deletes do not rewrite shared history.
 * Tokens are unguessable (`sh_` + 128-bit hex); the dir is 0700 because
 * snapshots may contain file paths and prompt text.
 * See Docs/36 §sharing.
 */

export type ShareKind = 'agent' | 'session';

export type SessionSnapshot = {
  id: string;
  cwd: string;
  model: string | null;
  title: string;
  messages: SessionMessage[];
  count: number;
};

export type ShareRecord = {
  token: string;
  kind: ShareKind;
  refId: string;
  title: string;
  createdAt: string;
  snapshot: AgentTrace | SessionSnapshot;
};

export type ShareSummary = {
  token: string;
  kind: ShareKind;
  refId: string;
  title: string;
  createdAt: string;
  /** Trace events (agent shares) or transcript rows (session shares). */
  size: number;
};

/** Typed error — routes map `code`/`status` straight into `{ code, message }`. */
export class ShareError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ShareError';
    this.code = code;
    this.status = status;
  }
}

const SHARE_TOKEN_PATTERN = /^sh_[0-9a-f]{32}$/;

function sharesDir(): string {
  return join(homedir(), '.lokma', 'shares');
}

function sharePath(token: string): string {
  return join(sharesDir(), `${token}.json`);
}

function assertToken(token: unknown): asserts token is string {
  if (typeof token !== 'string' || !SHARE_TOKEN_PATTERN.test(token)) {
    throw new ShareError('bad_token', 'Invalid share token (sh_<32 hex>)', 400);
  }
}

function newToken(): string {
  return `sh_${randomBytes(16).toString('hex')}`;
}

async function persist(record: ShareRecord): Promise<void> {
  await mkdir(sharesDir(), { recursive: true, mode: 0o700 });
  await writeFile(sharePath(record.token), JSON.stringify(record, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

function summarize(record: ShareRecord): ShareSummary {
  const size =
    record.kind === 'agent'
      ? (record.snapshot as AgentTrace).events.length
      : (record.snapshot as SessionSnapshot).count;
  return {
    token: record.token,
    kind: record.kind,
    refId: record.refId,
    title: record.title,
    createdAt: record.createdAt,
    size,
  };
}

/** Freeze an agent trace into a shareable snapshot. */
export async function createAgentShare(agentId: unknown): Promise<ShareRecord> {
  if (typeof agentId !== 'string' || !agentId.trim()) {
    throw new ShareError('bad_agent_id', 'POST needs { agentId: "<id>" }', 400);
  }
  // buildAgentTrace throws AgentError (bad_agent_id/agent_not_found) — let it
  // propagate; the route maps both error classes.
  const trace = await buildAgentTrace(agentId);
  const record: ShareRecord = {
    token: newToken(),
    kind: 'agent',
    refId: trace.agent.id,
    title: trace.agent.name,
    createdAt: new Date().toISOString(),
    snapshot: trace,
  };
  await persist(record);
  return record;
}

/** Freeze a session transcript into a shareable snapshot. */
export async function createSessionShare(
  sessionId: unknown,
  cwd: string,
): Promise<ShareRecord> {
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
    throw new ShareError('bad_session_id', 'POST needs { sessionId: "<id>" }', 400);
  }
  const store = new SessionStore(cwd);
  const messages = await store.read(sessionId);
  if (messages.length === 0) {
    throw new ShareError('session_not_found', `No transcript for ${sessionId}`, 404);
  }
  const meta = await store.readMeta(sessionId);
  const firstUser = messages.find((m) => m.role === 'user')?.content?.slice(0, 80);
  const snapshot: SessionSnapshot = {
    id: sessionId,
    cwd,
    model: meta?.model ?? null,
    title: meta?.title ?? firstUser ?? sessionId,
    messages,
    count: messages.length,
  };
  const record: ShareRecord = {
    token: newToken(),
    kind: 'session',
    refId: sessionId,
    title: snapshot.title,
    createdAt: new Date().toISOString(),
    snapshot,
  };
  await persist(record);
  return record;
}

/** Read one frozen snapshot (serves the copy, never re-derives). */
export async function getShare(token: string): Promise<ShareRecord> {
  assertToken(token);
  try {
    const raw = await readFile(sharePath(token), 'utf-8');
    const record = JSON.parse(raw) as ShareRecord;
    if (record.token !== token || (record.kind !== 'agent' && record.kind !== 'session')) {
      throw new ShareError('share_not_found', `Share ${token} not found`, 404);
    }
    return record;
  } catch (e) {
    if (e instanceof ShareError) throw e;
    throw new ShareError('share_not_found', `Share ${token} not found`, 404);
  }
}

/** Metadata list (no snapshot bytes — the pane loads those per share). */
export async function listShares(): Promise<ShareSummary[]> {
  let names: string[];
  try {
    names = await readdir(sharesDir());
  } catch {
    return [];
  }
  const out: ShareSummary[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = await readFile(join(sharesDir(), name), 'utf-8');
      out.push(summarize(JSON.parse(raw) as ShareRecord));
    } catch {
      // Corrupt share files are skipped, never fatal (locks.ts precedent).
    }
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

/** Delete a share (the frozen copy is gone; source agent/session untouched). */
export async function deleteShare(token: string): Promise<void> {
  assertToken(token);
  try {
    await rm(sharePath(token), { force: false });
  } catch {
    throw new ShareError('share_not_found', `Share ${token} not found`, 404);
  }
}
