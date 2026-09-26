import { SessionStore, listAllSummaries } from '@lokma/core';
import { runStatus } from './session-runs.js';

/**
 * REQ-161 — bot list enrichment for the Bots mode.
 *
 * The Bots mode shows a Grok-style list where every row carries the bot's
 * latest chat: last activity time + a last-message preview. The bot registry
 * itself (`listBots`) knows nothing about sessions, so `GET /api/bots?sessions=1`
 * joins the two: the newest session per `botId` (transcript meta is
 * authoritative) plus a one-line preview read from that transcript.
 *
 * The enrichment is opt-in — callers that only need the gallery rows keep the
 * cheap `GET /api/bots` response untouched.
 */

/** What one bot row shows about its latest session. */
export type BotLastSession = {
  id: string;
  title: string;
  updatedAt: string | null;
  preview: string;
  running: boolean;
  queued: number;
};

/** First meaningful line of a message body, capped for row previews. */
export function previewLine(content: string, max = 90): string {
  const first = content
    .split('\n')
    .map((line) => stripLead(line))
    .find((line) => line.length > 0);
  if (!first) return '';
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

/** Drop leading markdown noise (headings, bullets, quotes) from a preview line. */
function stripLead(line: string): string {
  let out = line.trim();
  while (out.length > 0 && '#>*-'.includes(out[0])) out = out.slice(1).trim();
  return out;
}

/**
 * Preview text from a transcript tail: the last USER/ASSISTANT row's first
 * line. Tool rows and the synthetic "Session created" marker are skipped so a
 * fresh session falls back to its title instead of leaking internals.
 */
export function lastChatPreview(messages: readonly { role?: unknown; content?: unknown }[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const row = messages[i];
    const role = typeof row?.role === 'string' ? row.role : '';
    if (role !== 'user' && role !== 'assistant') continue;
    const line = previewLine(typeof row?.content === 'string' ? row.content : '');
    if (line) return line;
  }
  return '';
}

/**
 * Attach `lastSession` to each bot (null when the bot has no chat yet).
 * `listAllSummaries` returns newest-first, so the first row per bot id IS the
 * newest one — one transcript read per bot, never a full sweep.
 */
export async function attachLastSessions<T extends { id: string }>(
  bots: T[],
): Promise<(T & { lastSession: BotLastSession | null })[]> {
  const sessions = await listAllSummaries();
  const newest = new Map<string, (typeof sessions)[number]>();
  for (const session of sessions) {
    const botId = session.botId;
    if (!botId || newest.has(botId)) continue;
    newest.set(botId, session);
  }
  return Promise.all(
    bots.map(async (bot) => {
      const latest = newest.get(bot.id);
      if (!latest) return { ...bot, lastSession: null };
      const store = new SessionStore(latest.cwd ?? process.cwd());
      const messages = await store.read(latest.id);
      return {
        ...bot,
        lastSession: {
          id: latest.id,
          title: latest.title ?? '',
          updatedAt: latest.updatedAt ?? null,
          preview: lastChatPreview(messages) || (latest.title ?? ''),
          ...runStatus(latest.id),
        } satisfies BotLastSession,
      };
    }),
  );
}
