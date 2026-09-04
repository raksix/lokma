import type { AgentInfo, Bot } from '@/lib/api';

/**
 * BotsPane pure helpers — Gallery tabs/filtering/validation over the REAL
 * `GET /api/bots` registry (W5-20, Docs/35). No mock rows anywhere: tab
 * membership derives from stored `featured`/`visibility`/`source` fields,
 * and the per-bot counter counts live agents (`createdBy: bot:<id>`).
 * Client validation mirrors the server rules in `lokma-core/src/bots/`.
 */

export type BotTab = 'featured' | 'mine' | 'shared';

export const BOT_TABS: BotTab[] = ['featured', 'mine', 'shared'];

const BOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** Gallery tab for one bot — Featured is curated, Mine is private, rest Shared. */
export function tabOf(bot: Pick<Bot, 'featured' | 'visibility' | 'source'>): BotTab {
  if (bot.featured) return 'featured';
  if (bot.source !== 'bundled' && bot.visibility === 'private') return 'mine';
  return 'shared';
}

export function tabCounts(bots: Bot[]): Record<BotTab, number> {
  const counts: Record<BotTab, number> = { featured: 0, mine: 0, shared: 0 };
  for (const bot of bots) counts[tabOf(bot)] += 1;
  return counts;
}

export function filterBots(bots: Bot[], tab: BotTab, query: string): Bot[] {
  const q = query.trim().toLowerCase();
  return bots.filter((bot) => {
    if (tabOf(bot) !== tab) return false;
    if (!q) return true;
    return (
      bot.name.toLowerCase().includes(q) ||
      bot.description.toLowerCase().includes(q) ||
      bot.id.toLowerCase().includes(q) ||
      bot.model.toLowerCase().includes(q)
    );
  });
}

/** Initial squares (the concept uses these, never the emoji avatar field). */
export function initials(name: string): string {
  const clean = name.trim();
  return clean.slice(0, 2).toUpperCase() || 'BO';
}

/** 120000 → "120k", 1500000 → "1.5M" (budget chips, never invented usage). */
export function formatTokensShort(n: number): string {
  if (n >= 1_000_000) return `${trimNum(n / 1_000_000)}M`;
  if (n >= 1000) return `${trimNum(n / 1000)}k`;
  return String(n);
}

function trimNum(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** "120k tok · $5 · 50 turns" — the configured run caps. */
export function formatBudgets(budgets: Bot['budgets']): string {
  return `${formatTokensShort(budgets.maxTokens)} tok · $${budgets.maxUsd} · ${budgets.maxTurns} turns`;
}

export function sourceLabel(source: Bot['source']): string {
  return source === 'bundled' ? 'bundled' : source === 'project' ? 'project' : 'yours';
}

/** Live agents spawned from this bot (`createdBy: bot:<id>`). */
export function agentCountFor(botId: string, agents: AgentInfo[]): number {
  const tag = `bot:${botId}`;
  return agents.filter((a) => (a as { createdBy?: unknown }).createdBy === tag).length;
}

export type CreateBotForm = {
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
  visibility: Bot['visibility'];
};

export const emptyCreateForm: CreateBotForm = {
  name: '',
  description: '',
  model: 'anthropic/claude-4-sonnet',
  systemPrompt: '',
  visibility: 'private',
};

/** Mirrors the server create rules (name 1-60, description 1-500, model set). */
export function validateCreateForm(form: CreateBotForm): string | null {
  if (!form.name.trim() || form.name.trim().length > 60) return 'Name must be 1-60 chars.';
  if (!form.description.trim() || form.description.trim().length > 500) {
    return 'Description must be 1-500 chars.';
  }
  if (!form.model.trim() || form.model.trim().length > 200) return 'Model must be set.';
  if (form.systemPrompt && form.systemPrompt.length > 20_000) return 'System prompt must be under 20000 chars.';
  return null;
}

/** Empty = server derives `<id>-fork`; otherwise the bot id shape. */
export function validateForkForm(asId: string): string | null {
  const clean = asId.trim();
  if (!clean) return null;
  if (!BOT_ID_PATTERN.test(clean)) return 'Fork id must be 1-64 chars (letters/digits/_/-).';
  return null;
}

/**
 * Delete gate for one bot — bundled templates are server-side read-only,
 * so the pane disables Delete there (same rule as Publish). Returns the
 * disabled reason (null when deletion is allowed).
 */
export function deleteBlockReason(bot: Pick<Bot, 'source'>): string | null {
  if (bot.source === 'bundled') return 'Bundled templates are read-only — fork to customize.';
  return null;
}

/** Mirrors the server run rule (task 1-2000 chars). */
export function validateTaskForm(task: string): string | null {
  if (!task.trim() || task.trim().length > 2000) return 'Task must be 1-2000 chars.';
  return null;
}
