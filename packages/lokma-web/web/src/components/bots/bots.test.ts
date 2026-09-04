import {
  agentCountFor,
  deleteBlockReason,
  emptyCreateForm,
  filterBots,
  formatBudgets,
  formatTokensShort,
  initials,
  sourceLabel,
  tabCounts,
  tabOf,
  validateCreateForm,
  validateForkForm,
  validateTaskForm,
} from './bots';
import type { AgentInfo, Bot } from '@/lib/api';

/**
 * BotsPane probe — pure helpers only (no React, no network).
 * Run: `bun src/components/bots/bots.test.ts` from the web package.
 * Never mock data here — assertions pin the real helper contracts.
 */

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

function bot(over: Partial<Bot>): Bot {
  return {
    id: 'x',
    name: 'X',
    description: 'd',
    systemPrompt: 's',
    model: 'anthropic/claude-4-sonnet',
    fallback: [],
    tools: [],
    skills: [],
    mcpServers: [],
    knowledgeFiles: [],
    memoryScope: 'bot',
    budgets: { maxTokens: 80000, maxUsd: 2, maxTurns: 40 },
    visibility: 'private',
    version: '1.0.0',
    tags: [],
    featured: false,
    source: 'global',
    ...over,
  };
}

// tabOf — Featured is curated, Mine is private user bots, rest Shared.
{
  check('featured wins over private', tabOf(bot({ featured: true, visibility: 'private', source: 'global' })) === 'featured');
  check('bundled featured is featured', tabOf(bot({ featured: true, source: 'bundled' })) === 'featured');
  check('private user bot is mine', tabOf(bot({ featured: false, visibility: 'private', source: 'global' })) === 'mine');
  check('bundled non-featured is shared', tabOf(bot({ featured: false, visibility: 'private', source: 'bundled' })) === 'shared');
  check('public user bot is shared', tabOf(bot({ featured: false, visibility: 'public', source: 'global' })) === 'shared');
  check('shared user bot is shared', tabOf(bot({ featured: false, visibility: 'shared', source: 'global' })) === 'shared');
  check('project private bot is mine', tabOf(bot({ featured: false, visibility: 'private', source: 'project' })) === 'mine');
}

// tabCounts + filterBots — Gallery tabs + live search.
const gallery: Bot[] = [
  bot({ id: 'lokma-ceo', name: 'Lokma CEO', description: 'Strategic CEO', model: 'anthropic/claude-opus-4', featured: true, source: 'bundled' }),
  bot({ id: 'mine-1', name: 'My Helper', description: 'helps me', visibility: 'private', source: 'global' }),
  bot({ id: 'pub-1', name: 'Vault Scout', description: 'scans vault', visibility: 'public', source: 'global' }),
];
{
  const counts = tabCounts(gallery);
  check('counts featured 1', counts.featured === 1);
  check('counts mine 1', counts.mine === 1);
  check('counts shared 1', counts.shared === 1);
  check('featured tab', filterBots(gallery, 'featured', '').map((b) => b.id).join() === 'lokma-ceo');
  check('mine tab', filterBots(gallery, 'mine', '').map((b) => b.id).join() === 'mine-1');
  check('shared tab', filterBots(gallery, 'shared', '').map((b) => b.id).join() === 'pub-1');
  check('search name', filterBots(gallery, 'shared', 'vault').length === 1);
  check('search description', filterBots(gallery, 'featured', 'strategic').length === 1);
  check('search id', filterBots(gallery, 'mine', 'mine-1').length === 1);
  check('search model', filterBots(gallery, 'featured', 'opus').length === 1);
  check('case-insensitive', filterBots(gallery, 'shared', 'VAULT').length === 1);
  check('no match is empty', filterBots(gallery, 'mine', 'vault').length === 0);
}

// initials — concept avatar squares, never the emoji avatar field.
{
  check('two letters', initials('Lokma CEO') === 'LO');
  check('short name', initials('a') === 'A');
  check('blank falls back', initials('   ') === 'BO');
}

// formatTokensShort + formatBudgets — configured caps, never invented usage.
{
  check('raw hundreds', formatTokensShort(800) === '800');
  check('kilos', formatTokensShort(120000) === '120k');
  check('millions', formatTokensShort(1500000) === '1.5M');
  check(
    'budgets line',
    formatBudgets({ maxTokens: 120000, maxUsd: 5, maxTurns: 50 }) === '120k tok · $5 · 50 turns',
  );
  check('source bundled', sourceLabel('bundled') === 'bundled');
  check('source global reads yours', sourceLabel('global') === 'yours');
  check('source project', sourceLabel('project') === 'project');
}

// agentCountFor — live agents spawned from this bot (`createdBy: bot:<id>`).
{
  const agents = [
    { createdBy: 'bot:lokma-ceo' },
    { createdBy: 'bot:lokma-ceo' },
    { createdBy: 'bot:mine-1' },
    { createdBy: 'fork:other' },
    {},
  ] as unknown as AgentInfo[];
  check('two live agents', agentCountFor('lokma-ceo', agents) === 2);
  check('one live agent', agentCountFor('mine-1', agents) === 1);
  check('zero live agents', agentCountFor('pub-1', agents) === 0);
}

// validateCreateForm — mirrors the server create rules.
{
  const good = { ...emptyCreateForm, name: 'Scout', description: 'Scans vault', model: 'anthropic/claude-4-sonnet' };
  check('valid form passes', validateCreateForm(good) === null);
  check('blank name rejected', validateCreateForm({ ...good, name: '   ' }) !== null);
  check('long name rejected', validateCreateForm({ ...good, name: 'x'.repeat(61) }) !== null);
  check('blank description rejected', validateCreateForm({ ...good, description: '' }) !== null);
  check('long description rejected', validateCreateForm({ ...good, description: 'x'.repeat(501) }) !== null);
  check('blank model rejected', validateCreateForm({ ...good, model: '' }) !== null);
  check('long prompt rejected', validateCreateForm({ ...good, systemPrompt: 'x'.repeat(20001) }) !== null);
}

// validateForkForm — empty means server-derived `<id>-fork`.
{
  check('blank is server-derived', validateForkForm('   ') === null);
  check('valid id passes', validateForkForm('my-fork_2') === null);
  check('spaces rejected', validateForkForm('my fork') !== null);
  check('empty string is server-derived', validateForkForm('') === null);
}

// deleteBlockReason — bundled templates are server-side read-only.
{
  check('bundled blocked', deleteBlockReason(bot({ source: 'bundled' })) !== null);
  check('global allowed', deleteBlockReason(bot({ source: 'global' })) === null);
  check('project allowed', deleteBlockReason(bot({ source: 'project' })) === null);
}

// validateTaskForm — mirrors the server run rule (task 1-2000 chars).
{
  check('valid task passes', validateTaskForm('Review the vault') === null);
  check('blank task rejected', validateTaskForm('   ') !== null);
  check('long task rejected', validateTaskForm('x'.repeat(2001)) !== null);
}

console.log(`bots helpers: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
