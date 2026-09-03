import { randomBytes } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ApprovalDecision } from 'lokma-shared';
import { ensureDir } from '../utils/fs.js';

/**
 * Approval decision log (W6-25, Docs/30 §6 human-in-the-loop).
 * Every real WS `permission_response` / `ask_response` is appended to
 * `~/.lokma/approvals/decisions.jsonl` (best-effort from the WS handler —
 * accounting never breaks chat), and `GET /api/approvals` serves the
 * newest-first history to the Approvals pane. The Allow/Deny/Always RULES
 * themselves live in the shared `permissions` config store (same store the
 * chat permission card writes — one store, two views); this file is the
 * decision history, never the rule book.
 */

/** Typed approvals-log failure — routes map it straight to `{ code, message }`. */
export class ApprovalError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ApprovalError';
    this.code = code;
    this.status = status;
  }
}

const APPROVALS_DIR = '~/.lokma/approvals';
const DECISIONS_PATH = '~/.lokma/approvals/decisions.jsonl';

/** Answer text is capped — the log carries evidence, never full secrets. */
const MAX_ANSWER_CHARS = 500;

function assertDecisionShape(input: {
  sessionId: unknown;
  kind: unknown;
  requestId: unknown;
  decision?: unknown;
  answer?: unknown;
}): void {
  if (typeof input.sessionId !== 'string' || input.sessionId.length === 0 || input.sessionId.length > 128) {
    throw new ApprovalError('bad_session', 'sessionId must be a non-empty string');
  }
  if (input.kind !== 'permission' && input.kind !== 'question') {
    throw new ApprovalError('bad_kind', 'kind must be `permission` or `question`');
  }
  if (typeof input.requestId !== 'string' || input.requestId.length === 0 || input.requestId.length > 128) {
    throw new ApprovalError('bad_request_id', 'requestId must be a non-empty string');
  }
  if (
    input.decision !== undefined &&
    input.decision !== 'allow' &&
    input.decision !== 'deny' &&
    input.decision !== 'always'
  ) {
    throw new ApprovalError('bad_decision', 'decision must be `allow`, `deny`, or `always`');
  }
  if (input.answer !== undefined && typeof input.answer !== 'string') {
    throw new ApprovalError('bad_answer', 'answer must be a string');
  }
}

/**
 * Append one decision to the log. Called best-effort from the WS handler
 * on every real `permission_response` / `ask_response` — callers catch
 * and log so accounting never breaks chat.
 */
export async function recordApprovalDecision(input: {
  sessionId: string;
  kind: 'permission' | 'question';
  requestId: string;
  decision?: 'allow' | 'deny' | 'always';
  answer?: string;
}): Promise<ApprovalDecision> {
  assertDecisionShape(input);
  const entry: ApprovalDecision = {
    id: `ap_${randomBytes(8).toString('hex')}`,
    at: new Date().toISOString(),
    source: 'ws',
    sessionId: input.sessionId,
    kind: input.kind,
    requestId: input.requestId,
    ...(input.decision !== undefined ? { decision: input.decision } : {}),
    ...(input.answer !== undefined ? { answer: input.answer.slice(0, MAX_ANSWER_CHARS) } : {}),
  };
  await ensureDir(APPROVALS_DIR);
  await appendFile(join(homedir(), '.lokma', 'approvals', 'decisions.jsonl'), `${JSON.stringify(entry)}\n`);
  return entry;
}

/** Newest-first decisions (cap 200, default 100; torn lines are skipped). */
export async function listApprovalDecisions(limit = 100): Promise<ApprovalDecision[]> {
  const capped = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 100;
  let raw = '';
  try {
    raw = await readFile(join(homedir(), '.lokma', 'approvals', 'decisions.jsonl'), 'utf-8');
  } catch {
    return [];
  }
  const out: ApprovalDecision[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as ApprovalDecision;
      if (typeof parsed.id === 'string' && typeof parsed.at === 'string') out.push(parsed);
    } catch {
      // A torn line never breaks the whole history.
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, capped);
}
