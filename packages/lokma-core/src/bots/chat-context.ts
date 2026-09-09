import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Bot } from '@lokma/shared';
import { getBot } from './store.js';

/**
 * Bot chat context — Grok-style bot binding for plain chat sessions
 * (REQ-027, Docs/35 §8). A bot-bound session runs every prompt with the
 * bot's model + systemPrompt + knowledge files injected ahead of the tool
 * system prompt, so chatting "as" a bot is real prompt injection — not a
 * label. The WS prompt path resolves this per turn, so bot edits apply
 * live without rebinding the session.
 * See Docs/35-BOTS-lokma-bots.md §3 (bot.json), §4 (lifecycle).
 */

/** Total knowledge chars injected into one prompt (context-budget guard). */
export const BOT_CHAT_KNOWLEDGE_CAP = 24_000;
/** One knowledge file never contributes more than this. */
export const BOT_CHAT_FILE_CAP = 8_000;

export type BotChatContext = {
  bot: Bot;
  /** Effective model for the turn (`msg.model` overrides still win). */
  model: string;
  /** Preamble prepended ahead of the tool system prompt ('' when none). */
  systemPreamble: string;
};

/**
 * Pure preamble builder — SOUL first, then capped knowledge sections.
 * Empty knowledge entries are skipped; over-cap text is cut with a marker
 * (the model sees the cut instead of a silent mid-sentence end).
 */
export function buildBotSystemPreamble(botName: string, systemPrompt: string, knowledge: string): string {
  const parts: string[] = [];
  const soul = systemPrompt.trim();
  if (soul) parts.push(`[Bot: ${botName}]\n${soul}`);
  const know = knowledge.trim();
  if (know) parts.push(`[Bot knowledge]\n${know}`);
  return parts.join('\n\n');
}

/** Cap one knowledge blob (pure, tested). */
export function capKnowledgeText(text: string, cap: number = BOT_CHAT_FILE_CAP): string {
  if (text.length <= cap) return text;
  return `${text.slice(0, cap)}\n…[truncated ${text.length - cap} chars]`;
}

/** Join per-file sections under the total cap (pure, tested). */
export function joinKnowledgeSections(sections: { path: string; text: string }[]): string {
  let out = '';
  for (const s of sections) {
    const clean = s.text.trim();
    if (!clean) continue;
    const capped = capKnowledgeText(clean);
    const block = `<knowledge path="${s.path}">\n${capped}\n</knowledge>`;
    if (out.length + block.length + 1 > BOT_CHAT_KNOWLEDGE_CAP) {
      const room = BOT_CHAT_KNOWLEDGE_CAP - out.length - 1;
      if (room > 200) out += `${out ? '\n' : ''}${block.slice(0, room)}\n…[truncated to chat cap]`;
      break;
    }
    out += `${out ? '\n' : ''}${block}`;
  }
  return out;
}

/**
 * Read a bot's knowledge files (jailed to the bot dir, best-effort —
 * missing/unreadable files never block a chat turn). Bundled bots ship
 * no on-disk dir, so they resolve knowledge-free (SOUL only).
 */
export async function readBotKnowledge(bot: Bot, cwd?: string): Promise<string> {
  let dir: string | null = null;
  if (bot.source === 'project' && cwd) dir = join(cwd, '.lokma', 'bots', bot.id);
  else if (bot.source === 'global') dir = join(homedir(), '.lokma', 'bots', bot.id);
  if (!dir || !bot.knowledgeFiles || bot.knowledgeFiles.length === 0) return '';
  const sections: { path: string; text: string }[] = [];
  for (const rel of bot.knowledgeFiles.slice(0, 20)) {
    if (typeof rel !== 'string' || !rel || rel.startsWith('/') || rel.split('/').includes('..')) continue;
    const abs = join(dir, rel);
    // Jail: the join must stay inside the bot dir.
    if (!abs.startsWith(`${dir}/`)) continue;
    try {
      const info = await stat(abs);
      if (!info.isFile() || info.size > 512 * 1024) continue;
      sections.push({ path: rel, text: await readFile(abs, 'utf-8') });
    } catch {
      // Missing/unreadable knowledge never blocks a chat turn.
    }
  }
  return joinKnowledgeSections(sections);
}

/**
 * Resolve the full chat context for a bot id. Returns null when the bot
 * is gone (deleted after binding) — the caller then chats unbound instead
 * of failing the turn.
 */
export async function resolveBotChatContext(botId: string, cwd?: string): Promise<BotChatContext | null> {
  const bot = await getBot(botId, cwd);
  if (!bot) return null;
  const knowledge = await readBotKnowledge(bot, cwd);
  return {
    bot,
    model: bot.model,
    systemPreamble: buildBotSystemPreamble(bot.name, bot.systemPrompt, knowledge),
  };
}
