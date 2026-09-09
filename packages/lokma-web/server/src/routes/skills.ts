import type { FastifyInstance } from 'fastify';
import {
  installSkillFromUrl,
  MarketplaceError,
  patchSkill,
  readSkillFile,
  readSkillView,
  readUsage,
  recordUsage,
  scan,
  searchSkillMarketplace,
  SkillError,
} from '@lokma/core';

/**
 * Skills — registry.scan() same as CLI (progressive disclosure) + web
 * parity from Docs/27 §7.3: `GET /api/skills` (light index for the
 * `/skills` palette, with the curator `usage` map attached),
 * `GET /api/skills/:id` (skill_view: SKILL.md + linked_files, records a
 * view), `GET /api/skills/:id/file?path=` (single reference load),
 * `PATCH /api/skills/:id { old_string, new_string }` (curator patch,
 * records a patch), `POST /api/skills/:id/use` (records a use — the web
 * parity of the agent loop's use event until the loop lands).
 * `GET /api/skills/marketplace?q=` (live GitHub `lokma-skill` topic —
 * every hit is a real repo, `url` feeds `POST /install` directly),
 * `POST /api/skills/install { url }` (strict https validation +
 * `git clone --depth 1` into `~/.lokma/skills/<slug>/`, rescan — the
 * skill appears in `<available_skills>` next turn).
 * Telemetry lives in `~/.lokma/skills/.usage.json`, same shape as Hermes.
 * All failures answer `{ code, message }` (never raw keys or stacks).
 */

function skillErr(reply: { status: (n: number) => { send: (b: unknown) => unknown } }, e: unknown) {
  if (e instanceof SkillError) return reply.status(e.status).send({ code: e.code, message: e.message });
  throw e;
}

export async function skillRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/skills', async () => {
    const skills = await scan({ dirs: ['skills', '~/.lokma/skills'] });
    // Telemetry is best-effort — a corrupt .usage.json never breaks the list.
    let usage = {};
    try {
      usage = await readUsage();
    } catch {
      // Keep the empty map.
    }
    return { skills, count: skills.length, usage };
  });

  // Static before `:id` — the live remote marketplace (no local writes).
  app.get('/api/skills/marketplace', async (req, reply) => {
    const { q } = (req.query ?? {}) as { q?: unknown };
    try {
      return await searchSkillMarketplace(q ?? '');
    } catch (e) {
      if (e instanceof MarketplaceError) {
        return reply.status(e.status).send({ code: e.code, message: e.message });
      }
      throw e;
    }
  });

  // Static before `:id/use` shape — git-clone install into ~/.lokma/skills.
  app.post('/api/skills/install', async (req, reply) => {
    const body = (req.body ?? {}) as { url?: unknown };
    try {
      const { skill, slug } = await installSkillFromUrl(body.url);
      return { ok: true, skill, slug };
    } catch (e) {
      return skillErr(reply, e);
    }
  });

  app.get('/api/skills/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const view = await readSkillView(id);
      // Best-effort: a telemetry write failure never breaks the read.
      try {
        await recordUsage(view.skill.id, 'view');
      } catch {
        // Telemetry is advisory.
      }
      return { ok: true, skill: view.skill, content: view.content };
    } catch (e) {
      return skillErr(reply, e);
    }
  });

  app.get('/api/skills/:id/file', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { path?: unknown };
    try {
      const file = await readSkillFile(id, query.path);
      return { ok: true, ...file };
    } catch (e) {
      return skillErr(reply, e);
    }
  });

  app.patch('/api/skills/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { old_string?: unknown; new_string?: unknown };
    try {
      const result = await patchSkill(id, body.old_string, body.new_string);
      try {
        await recordUsage(result.skill.id, 'patch');
      } catch {
        // Telemetry is advisory.
      }
      return { ok: true, skill: result.skill, bytes: result.bytes };
    } catch (e) {
      return skillErr(reply, e);
    }
  });

  app.post('/api/skills/:id/use', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const view = await readSkillView(id);
      await recordUsage(view.skill.id, 'use');
      return { ok: true, id: view.skill.id };
    } catch (e) {
      return skillErr(reply, e);
    }
  });
}
