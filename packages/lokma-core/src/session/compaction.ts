import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { SessionStore } from './store.js';
import type { SessionMessage } from './types.js';

/**
 * Two-tier session-transcript compaction (Docs/28 §1.3 + §5.1).
 *
 * Tier 1 — gateway hygiene (deterministic, near-lossless): drop blank
 * messages, collapse whitespace runs, merge consecutive same-role messages,
 * truncate oversized tool results with an explicit marker. Runs first and
 * alone when the transcript only crossed the hygiene threshold.
 *
 * Tier 2 — extractive summary (deterministic, no LLM): when the transcript
 * still exceeds the summary threshold, keep the first user message plus the
 * most recent tail verbatim, replace everything in between with one anchor
 * block (`role: 'tool'`, `toolName: 'lokma-compact'`) carrying an extractive
 * bullet summary plus an anchor index. Removed originals are appended to
 * `<id>.archive.jsonl` first (soft-archive — `in_place` per Docs/28, the WAL
 * half of "infinite memory" arrives with session_search).
 *
 * 4-phase shape: trigger (`compactionStatus`) → select (`hygienePass` +
 * tail/first-user keep-set) → anchor index (`CompactionReport.anchors` +
 * `<id>.compaction.json`) → embed (rewrite `<id>.jsonl`).
 */

export const COMPACT_ANCHOR_TOOL = 'lokma-compact';

/** Char/message budgets — hygiene first, summary only for long sessions. */
export const COMPACTION_LIMITS = {
  /** Tier-1 trigger: transcript chars above this get the hygiene pass. */
  hygieneChars: 60000,
  /** Tier-2 trigger: post-hygiene chars above this get summarized. */
  summaryChars: 120000,
  /** Verbatim tail kept on every tier-2 compaction. */
  keepTail: 20,
  /** Per tool-result truncation cap (head + tail kept, middle marked). */
  toolResultCap: 8000,
  /** Max excerpt chars per anchor-index entry. */
  anchorExcerpt: 140,
  /** Max bullet lines in the embedded extractive summary. */
  maxBullets: 30,
} as const;

export type CompactionMode = 'hygiene' | 'full';

export type HygieneStats = {
  dropped: number;
  merged: number;
  truncated: number;
  beforeMessages: number;
  afterMessages: number;
  beforeChars: number;
  afterChars: number;
};

export type CompactAnchor = {
  role: SessionMessage['role'];
  toolName?: string;
  excerpt: string;
  timestamp: string;
};

export type CompactionReport = {
  id: string;
  compactedAt: string;
  mode: CompactionMode;
  compacted: boolean;
  beforeMessages: number;
  afterMessages: number;
  beforeChars: number;
  afterChars: number;
  /** Originals appended to `<id>.archive.jsonl` by this run. */
  archived: number;
  /** Cumulative messages in the archive after this run. */
  archiveMessages: number;
  anchors: CompactAnchor[];
  /** Embedded anchor-block content (null when nothing was embedded). */
  summary: string | null;
};

export type CompactionStatus = {
  id: string;
  messages: number;
  chars: number;
  hygieneNeeded: boolean;
  summaryNeeded: boolean;
  last: CompactionReport | null;
};

/** Total content chars — the single budget metric both tiers use. */
export function transcriptChars(messages: SessionMessage[]): number {
  let total = 0;
  for (const m of messages) total += m.content.length;
  return total;
}

/** True for anchor blocks embedded by a previous compaction run. */
export function isAnchorMessage(m: SessionMessage): boolean {
  return m.role === 'tool' && m.toolName === COMPACT_ANCHOR_TOOL;
}

function collapseWhitespace(content: string): string {
  return content.replace(/\n{3,}/g, '\n\n');
}

/**
 * Tier-1 hygiene pass — pure, no disk. Drops blanks, merges consecutive
 * same-role (+same toolName) runs, truncates oversized tool results.
 */
export function hygienePass(messages: SessionMessage[]): { messages: SessionMessage[]; stats: HygieneStats } {
  const beforeMessages = messages.length;
  const beforeChars = transcriptChars(messages);
  let dropped = 0;
  let merged = 0;
  let truncated = 0;
  const out: SessionMessage[] = [];
  for (const raw of messages) {
    const content = collapseWhitespace(raw.content);
    if (content.trim().length === 0) {
      dropped += 1;
      continue;
    }
    let kept = content;
    if (raw.role === 'tool' && kept.length > COMPACTION_LIMITS.toolResultCap) {
      const cap = COMPACTION_LIMITS.toolResultCap;
      const head = Math.floor(cap / 2);
      const tail = cap - head;
      const cut = kept.length - cap;
      kept = `${kept.slice(0, head)}\n[lokma-compact: truncated ${cut} chars]\n${kept.slice(kept.length - tail)}`;
      truncated += 1;
    }
    const prev = out[out.length - 1];
    if (prev && prev.role === raw.role && (prev.toolName ?? null) === (raw.toolName ?? null)) {
      prev.content = `${prev.content}\n${kept}`;
      merged += 1;
      continue;
    }
    out.push({ ...raw, content: kept });
  }
  return {
    messages: out,
    stats: {
      dropped,
      merged,
      truncated,
      beforeMessages,
      afterMessages: out.length,
      beforeChars,
      afterChars: transcriptChars(out),
    },
  };
}

function excerptOf(content: string): string {
  const first = content.split('\n')[0]?.trim() ?? '';
  return first.length > COMPACTION_LIMITS.anchorExcerpt
    ? `${first.slice(0, COMPACTION_LIMITS.anchorExcerpt - 1)}…`
    : first;
}

/**
 * Hygiene with a pinned head — used when a prior anchor exists. The first
 * message after an anchor is the protected conversation head (the original
 * user request); merging it with a much-later tail message on a repeat run
 * would corrupt context, so the pin boundary never merges. Stats merge.
 */
export function hygienePinned(
  messages: SessionMessage[],
  pinCount: number,
): { messages: SessionMessage[]; stats: HygieneStats } {
  if (pinCount <= 0) return hygienePass(messages);
  const head = hygienePass(messages.slice(0, pinCount));
  const rest = hygienePass(messages.slice(pinCount));
  return {
    messages: [...head.messages, ...rest.messages],
    stats: {
      dropped: head.stats.dropped + rest.stats.dropped,
      merged: head.stats.merged + rest.stats.merged,
      truncated: head.stats.truncated + rest.stats.truncated,
      beforeMessages: head.stats.beforeMessages + rest.stats.beforeMessages,
      afterMessages: head.stats.afterMessages + rest.stats.afterMessages,
      beforeChars: head.stats.beforeChars + rest.stats.beforeChars,
      afterChars: head.stats.afterChars + rest.stats.afterChars,
    },
  };
}

/**
 * Extractive summary for the compacted middle — first lines of compacted
 * user turns plus the tool names invoked. Deterministic, capped, honest:
 * it never invents content, only quotes and lists.
 */
export function buildExtractiveSummary(
  sessionId: string,
  compacted: SessionMessage[],
  previouslyCompacted: number,
): string {
  const userLines: string[] = [];
  const tools = new Set<string>();
  for (const m of compacted) {
    if (m.role === 'user') {
      const line = excerptOf(m.content);
      if (line) userLines.push(line);
    } else if (m.role === 'tool' && m.toolName) {
      tools.add(m.toolName);
    }
  }
  const shown = userLines.slice(0, COMPACTION_LIMITS.maxBullets);
  const hidden = userLines.length - shown.length;
  const lines = [
    `[lokma-compact] Summarized ${compacted.length} older messages on ${new Date().toISOString()}.`,
    `Full originals are preserved in ${sessionId}.archive.jsonl.`,
  ];
  if (previouslyCompacted > 0) {
    lines.push(`Plus ${previouslyCompacted} messages compacted by earlier runs (see archive).`);
  }
  if (shown.length > 0) {
    lines.push('Key earlier requests:');
    for (const line of shown) lines.push(`- ${line}`);
    if (hidden > 0) lines.push(`- …and ${hidden} more earlier requests (see archive).`);
  }
  if (tools.size > 0) lines.push(`Tools used earlier: ${[...tools].sort().join(', ')}.`);
  return lines.join('\n');
}

function archivePath(cwd: string, sessionId: string): string {
  return join(SessionStore.dirFor(cwd), `${sessionId}.archive.jsonl`);
}

function reportPath(cwd: string, sessionId: string): string {
  return join(SessionStore.dirFor(cwd), `${sessionId}.compaction.json`);
}

async function readArchive(cwd: string, sessionId: string): Promise<SessionMessage[]> {
  try {
    const raw = await readFile(archivePath(cwd, sessionId), 'utf-8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as SessionMessage);
  } catch {
    return [];
  }
}

async function readReport(cwd: string, sessionId: string): Promise<CompactionReport | null> {
  try {
    const raw = await readFile(reportPath(cwd, sessionId), 'utf-8');
    return JSON.parse(raw) as CompactionReport;
  } catch {
    return null;
  }
}

function sessionNotFound(sessionId: string): Error {
  return Object.assign(new Error(`No transcript for ${sessionId}`), {
    statusCode: 404,
    code: 'session_not_found',
  });
}

/** Live trigger check — backs `GET /api/sessions/:id/compaction`. */
export async function compactionStatus(cwd: string, sessionId: string): Promise<CompactionStatus> {
  const store = new SessionStore(cwd);
  const messages = await store.read(sessionId);
  if (messages.length === 0) throw sessionNotFound(sessionId);
  const chars = transcriptChars(messages);
  const [last] = await Promise.all([readReport(cwd, sessionId)]);
  return {
    id: sessionId,
    messages: messages.length,
    chars,
    hygieneNeeded: chars > COMPACTION_LIMITS.hygieneChars,
    summaryNeeded: chars > COMPACTION_LIMITS.summaryChars,
    last,
  };
}

/**
 * Run compaction — backs `POST /api/sessions/:id/compaction`.
 * `hygiene` mode runs tier 1 only; `full` (default) runs both tiers.
 * Returns `compacted: false` (not an error) when below every threshold.
 */
export async function compactSession(
  cwd: string,
  sessionId: string,
  opts: { mode?: CompactionMode } = {},
): Promise<CompactionReport> {
  const mode = opts.mode ?? 'full';
  const store = new SessionStore(cwd);
  const onDisk = await store.read(sessionId);
  if (onDisk.length === 0) throw sessionNotFound(sessionId);
  const beforeMessages = onDisk.length;
  const beforeChars = transcriptChars(onDisk);

  // Prior anchors are re-derived every run: strip them so summaries never stack.
  // When one existed, the head message stays pinned (never merges across
  // the anchor boundary on repeat runs — see `hygienePinned`).
  const priorAnchors = onDisk.filter(isAnchorMessage).length;
  const priorAnchorMsgs = onDisk.filter(isAnchorMessage);
  const base = onDisk.filter((m) => !isAnchorMessage(m));
  const archive = await readArchive(cwd, sessionId);

  const { messages: hyg } = hygienePinned(base, priorAnchors > 0 ? 1 : 0);
  const hygieneChanged = hyg.length !== base.length || transcriptChars(hyg) !== transcriptChars(base);

  let finalMessages = hyg;
  let summary: string | null = null;
  let anchors: CompactAnchor[] = [];
  let archived = 0;

  if (mode === 'full' && transcriptChars(hyg) > COMPACTION_LIMITS.summaryChars) {
    const firstUserIdx = hyg.findIndex((m) => m.role === 'user' && m.content.trim().length > 0);
    const tailStart = Math.max(0, hyg.length - COMPACTION_LIMITS.keepTail);
    const keep = new Set<number>();
    if (firstUserIdx >= 0) keep.add(firstUserIdx);
    for (let i = tailStart; i < hyg.length; i += 1) keep.add(i);
    const compacted = hyg.filter((_, i) => !keep.has(i));
    if (compacted.length > 0) {
      summary = buildExtractiveSummary(sessionId, compacted, archive.length);
      anchors = compacted.map((m) => ({
        role: m.role,
        ...(m.toolName ? { toolName: m.toolName } : {}),
        excerpt: excerptOf(m.content),
        timestamp: m.timestamp,
      }));
      const anchorMsg: SessionMessage = {
        role: 'tool',
        toolName: COMPACT_ANCHOR_TOOL,
        content: summary,
        timestamp: new Date().toISOString(),
      };
      const kept = hyg.filter((_, i) => keep.has(i));
      finalMessages = [anchorMsg, ...kept];
      const lines = compacted.map((m) => JSON.stringify(m)).join('\n') + '\n';
      await mkdir(SessionStore.dirFor(cwd), { recursive: true });
      await appendFile(archivePath(cwd, sessionId), lines, 'utf-8');
      archived = compacted.length;
    }
  }

  const compactedRun = archived > 0 || hygieneChanged;
  if (anchors.length === 0 && priorAnchorMsgs.length > 0 && compactedRun) {
    // Hygiene rewrote around an old summary — re-attach it so the archive
    // pointer is never lost by a tier-1-only run.
    finalMessages = [priorAnchorMsgs[priorAnchorMsgs.length - 1], ...finalMessages];
  }
  const report: CompactionReport = {
    id: sessionId,
    compactedAt: new Date().toISOString(),
    mode,
    compacted: compactedRun,
    beforeMessages,
    afterMessages: compactedRun ? finalMessages.length : beforeMessages,
    beforeChars,
    afterChars: compactedRun ? transcriptChars(finalMessages) : beforeChars,
    archived,
    archiveMessages: archive.length + archived,
    anchors,
    summary,
  };

  if (!compactedRun) return report;
  await writeFile(
    SessionStore.pathFor(cwd, sessionId),
    finalMessages.map((m) => JSON.stringify(m)).join('\n') + '\n',
    'utf-8',
  );
  await writeFile(reportPath(cwd, sessionId), JSON.stringify(report, null, 2), 'utf-8');
  await store.writeMeta(sessionId, {});
  return report;
}

/** Short content hash for anchor provenance (debug footer, not a security use). */
export function hashContent(content: string): string {
  return createHash('sha1').update(content).digest('hex').slice(0, 8);
}
