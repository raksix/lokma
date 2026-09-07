import type { Bot } from '@/lib/api';

/**
 * Bot-chat pure helpers (REQ-027, Docs/35 §8) — Grok-style bot switching
 * inside a chat session. Switching a bot PATCHes both the binding and the
 * session model (the session chats AS the bot); clearing drops the binding
 * back to plain chat. No markup here — the Chat header owns the picker.
 */

/** PATCH body that binds a session to a bot (model follows the switch). */
export function botSwitchPatch(bot: Pick<Bot, 'id' | 'model'>): { botId: string; model: string } {
  return { botId: bot.id, model: bot.model };
}

/** PATCH body that clears a session back to plain chat. */
export function botClearPatch(): { botId: string } {
  return { botId: '' };
}

/** Display name for a bound bot id (falls back to `#id` when unlisted). */
export function sessionBotName(botId: string | null | undefined, bots: Pick<Bot, 'id' | 'name'>[]): string | null {
  if (!botId) return null;
  return bots.find((b) => b.id === botId)?.name ?? `#${botId}`;
}

/** Case-insensitive bot filter for the picker search box. */
export function filterPickerBots(bots: Bot[], query: string): Bot[] {
  const q = query.trim().toLowerCase();
  if (!q) return bots;
  return bots.filter(
    (b) =>
      b.name.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q) ||
      b.description.toLowerCase().includes(q),
  );
}
