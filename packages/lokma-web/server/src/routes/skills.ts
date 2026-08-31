import type { FastifyInstance } from 'fastify';
import { scan } from 'lokma-core';

/**
 * Skills — registry.scan() same as CLI (progressive disclosure).
 * See Docs/27 §7.3 — GET /api/skills + GET /api/skills/:id + /file
 */

export async function skillRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/skills', async () => {
    const skills = await scan({ dirs: ['skills', '~/.lokma/skills'] });
    return { skills, count: skills.length };
  });

  app.get('/api/skills/:id', async (req) => {
    const { id } = req.params as { id: string };
    const skills = await scan({ dirs: ['skills', '~/.lokma/skills'] });
    const skill = skills.find((s) => s.id === id || s.name === id);
    if (!skill) return { ok: false, error: 'Not found' };
    return { skill };
  });
}
