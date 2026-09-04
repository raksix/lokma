import type { FastifyInstance } from 'fastify';
import {
  AgentError,
  BotError,
  createBot,
  deleteBot,
  forkBot,
  getBot,
  listBots,
  patchBot,
  publishBot,
  runBotAsAgent,
} from 'lokma-core';

/**
 * Bots — shareable `bot.json` packages for the BotsPane (W5-20, Docs/35).
 * `GET /api/bots` (bundled lokma-ceo + `~/.lokma/bots/` + optional
 * `?cwd=` project overlay, featured-first); `GET /api/bots/:id`;
 * `POST /api/bots` (create, 409 `bot_exists`); `PATCH /api/bots/:id`
 * (edit user bots — bundled are 400 `bundled_readonly`);
 * `POST /api/bots/:id/fork` (clone + knowledge copy, `createdFrom`
 * provenance); `POST /api/bots/:id/publish` (visibility flip);
 * `POST /api/bots/:id/run { task }` (spawns a REAL agent with
 * `createdBy: bot:<id>` + a REAL session for playground chat);
 * `DELETE /api/bots/:id` (removes a user bot — bundled templates answer
 * 400 `bundled_readonly`).
 * Storage `~/.lokma/bots/<id>/bot.json` — the same store the CLI uses.
 * All failures answer `{ code, message }`.
 */

function toBotError(e: unknown): { code: string; status: number; message: string } | null {
  if (e instanceof BotError) return { code: e.code, status: e.status, message: e.message };
  // Bot runs spawn agents — surface registry rejections with their own codes.
  if (e instanceof AgentError) return { code: e.code, status: e.status, message: e.message };
  return null;
}

function optCwd(req: { query?: unknown }): string | undefined {
  const cwd = (req.query as { cwd?: unknown } | undefined)?.cwd;
  return typeof cwd === 'string' && cwd ? cwd : undefined;
}

export async function botsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/bots', async (req) => {
    const { bots, count } = await listBots(optCwd(req));
    return { bots, count };
  });

  app.get('/api/bots/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const bot = await getBot(id, optCwd(req));
      if (!bot) return reply.status(404).send({ code: 'bot_not_found', message: `Bot '${id}' not found` });
      return { ok: true, bot };
    } catch (e) {
      const err = toBotError(e);
      if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
      throw e;
    }
  });

  app.post('/api/bots', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const bot = await createBot({
        ...(body.id !== undefined ? { id: body.id } : {}),
        name: body.name,
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.systemPrompt !== undefined ? { systemPrompt: body.systemPrompt } : {}),
        ...(body.model !== undefined ? { model: body.model } : {}),
        ...(body.fallback !== undefined ? { fallback: body.fallback } : {}),
        ...(body.tools !== undefined ? { tools: body.tools } : {}),
        ...(body.skills !== undefined ? { skills: body.skills } : {}),
        ...(body.mcpServers !== undefined ? { mcpServers: body.mcpServers } : {}),
        ...(body.knowledgeFiles !== undefined ? { knowledgeFiles: body.knowledgeFiles } : {}),
        ...(body.memoryScope !== undefined ? { memoryScope: body.memoryScope } : {}),
        ...(body.budgets !== undefined ? { budgets: body.budgets } : {}),
        ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
        ...(body.version !== undefined ? { version: body.version } : {}),
        ...(body.createdFrom !== undefined ? { createdFrom: body.createdFrom } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        ...(body.author !== undefined ? { author: body.author } : {}),
      });
      return { ok: true, bot };
    } catch (e) {
      const err = toBotError(e);
      if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
      throw e;
    }
  });

  app.patch('/api/bots/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const bot = await patchBot(id, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.avatar !== undefined ? { avatar: body.avatar } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.systemPrompt !== undefined ? { systemPrompt: body.systemPrompt } : {}),
        ...(body.model !== undefined ? { model: body.model } : {}),
        ...(body.fallback !== undefined ? { fallback: body.fallback } : {}),
        ...(body.tools !== undefined ? { tools: body.tools } : {}),
        ...(body.skills !== undefined ? { skills: body.skills } : {}),
        ...(body.mcpServers !== undefined ? { mcpServers: body.mcpServers } : {}),
        ...(body.knowledgeFiles !== undefined ? { knowledgeFiles: body.knowledgeFiles } : {}),
        ...(body.memoryScope !== undefined ? { memoryScope: body.memoryScope } : {}),
        ...(body.budgets !== undefined ? { budgets: body.budgets } : {}),
        ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
        ...(body.version !== undefined ? { version: body.version } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        ...(body.author !== undefined ? { author: body.author } : {}),
      });
      return { ok: true, bot };
    } catch (e) {
      const err = toBotError(e);
      if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
      throw e;
    }
  });

  app.post('/api/bots/:id/fork', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { as?: unknown };
    try {
      const bot = await forkBot(id, body.as, optCwd(req));
      return { ok: true, bot, from: id };
    } catch (e) {
      const err = toBotError(e);
      if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
      throw e;
    }
  });

  app.post('/api/bots/:id/publish', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { visibility?: unknown };
    try {
      const bot = await publishBot(id, body.visibility);
      return { ok: true, bot, visibility: bot.visibility };
    } catch (e) {
      const err = toBotError(e);
      if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
      throw e;
    }
  });

  app.post('/api/bots/:id/run', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { task?: unknown; cwd?: unknown };
    try {
      const { agent, sessionId } = await runBotAsAgent(id, body.task, {
        ...(typeof body.cwd === 'string' && body.cwd ? { cwd: body.cwd } : {}),
      });
      return { ok: true, agentId: agent.id, agent, sessionId };
    } catch (e) {
      const err = toBotError(e);
      if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
      throw e;
    }
  });

  app.delete('/api/bots/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const { id: deleted } = await deleteBot(id, optCwd(req));
      return { ok: true, id: deleted };
    } catch (e) {
      const err = toBotError(e);
      if (err) return reply.status(err.status).send({ code: err.code, message: err.message });
      throw e;
    }
  });
}
