import type { FastifyInstance } from 'fastify';
import {
  TestError,
  getRun,
  listRuns,
  readJunit,
  runTestRun,
} from 'lokma-core';

/**
 * Testing Lab — TestSprite-inspired self-hosted runs (W5-19, Docs/33).
 * `POST /api/tests/run { plan, targets?, includeShannon?, timeoutMs? }`
 * (every target becomes one real `GET` check executed through `app.inject`,
 * so each check exercises the REAL handler code — status + body — never a
 * stub; plus a Shannon secret scan over the plan + response bodies);
 * `GET /api/tests/list` (newest first, concept Runs parity);
 * `GET /api/tests/:id` (stored plan input + classified report);
 * `GET /api/tests/:id/junit` (Report-stage `junit.xml` download).
 * Storage `~/.lokma/test-runs/<id>/` (`plan.json` + `report.json` +
 * `junit.xml`) — the same store the CLI will use. No Playwright/video here
 * (no headless browser dep) — the pane says so in its footer instead of
 * faking thumbnails. All failures answer `{ code, message }`.
 */

export async function testsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/tests/run', async (req, reply) => {
    const body = (req.body ?? {}) as {
      plan?: unknown;
      targets?: unknown;
      includeShannon?: unknown;
      timeoutMs?: unknown;
    };
    try {
      const { id, report } = await runTestRun(
        async (target: string) => {
          const res = await app.inject({ method: 'GET', url: target });
          const raw = res.body;
          return { status: res.statusCode, body: typeof raw === 'string' ? raw : String(raw ?? '') };
        },
        body.plan,
        body.targets,
        { includeShannon: body.includeShannon, timeoutMs: body.timeoutMs },
      );
      return { ok: true, id, report };
    } catch (e) {
      if (e instanceof TestError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  // Static sub-path first — `list` matches the `:id` shape guard.
  app.get('/api/tests/list', async () => {
    const { items, count } = await listRuns();
    return { items, count };
  });

  app.get('/api/tests/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return { ok: true, ...(await getRun(id)) };
    } catch (e) {
      if (e instanceof TestError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/api/tests/:id/junit', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const { filename, xml } = await readJunit(id);
      return reply
        .header('Content-Type', 'application/xml; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(xml);
    } catch (e) {
      if (e instanceof TestError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });
}
