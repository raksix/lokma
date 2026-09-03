import type { FastifyInstance } from 'fastify';

/**
 * Slash commands — the single registry behind the Composer `/` palette.
 * The server owns this list; the web client fetches it and executes each
 * command against a real endpoint (never a dead switch).
 * See Docs/38 W1-1 (SingleChatView + Composer).
 */

export type SlashCommand = {
  id: string;
  name: string;
  hint: string;
  usage: string;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'new', name: '/new', hint: 'Start a fresh session', usage: '/new [first prompt]' },
  { id: 'fork', name: '/fork', hint: 'Fork this session from here', usage: '/fork' },
  { id: 'model', name: '/model', hint: 'Switch model mid-session', usage: '/model <provider/id>' },
  { id: 'rewind', name: '/rewind', hint: 'Truncate transcript to N messages', usage: '/rewind <count>' },
  { id: 'help', name: '/help', hint: 'Show this palette', usage: '/help' },
];

export async function commandRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/commands', async () => {
    return { commands: SLASH_COMMANDS, count: SLASH_COMMANDS.length };
  });
}
