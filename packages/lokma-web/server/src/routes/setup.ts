import type { FastifyInstance } from 'fastify';
import { stat } from 'node:fs/promises';
import { applyModelFlags, getCatalog } from 'lokma-ai';
import {
  SessionStore,
  applySetupFeatures,
  expandHome,
  getMaskedCredentials,
  getSetupState,
  listAgents,
  listLocks,
  loadConfig,
  readAgentDoc,
  runSetupInit,
  scan,
  SetupError,
} from 'lokma-core';
import type { Lock } from 'lokma-shared';
import { listProviderViews } from './providers.js';

/**
 * Setup + doctor — the server side of `lokma init` / `lokma setup`
 * (Docs/32 §8) and the SetupPane (W6-22).
 * `GET /api/setup` (feature registry + resolved flags),
 * `POST /api/setup { features }` (persist the optional-stack checkboxes),
 * `POST /api/setup/init { cwd? }` (ensure global config + data dirs +
 * optional project scaffold exist — never wipes),
 * `GET /api/doctor[?agents=1]` (8 real subsystem probes + an optional
 * 9th SOUL probe; every check is measured, failures carry detail —
 * nothing here is invented).
 * All failures answer `{ code, message }` (never raw stacks or secrets).
 */

export type DoctorCheck = {
  name: string;
  ok: boolean;
  latencyMs: number;
  detail: string;
};

/** Run one probe — timing it, and turning throws into `ok: false` rows. */
async function timed(name: string, fn: () => Promise<string>): Promise<DoctorCheck> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, latencyMs: Date.now() - start, detail };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { name, ok: false, latencyMs: Date.now() - start, detail: detail.slice(0, 200) };
  }
}

function setupErr(reply: { status: (n: number) => { send: (b: unknown) => unknown } }, e: unknown) {
  if (e instanceof SetupError) return reply.status(e.status).send({ code: e.code, message: e.message });
  throw e;
}

export async function setupRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/setup', async () => {
    const { features, applied } = await getSetupState();
    return { features, applied, count: features.length };
  });

  app.post('/api/setup', async (req, reply) => {
    const body = (req.body ?? {}) as { features?: unknown };
    try {
      const applied = await applySetupFeatures(body.features);
      return { ok: true, applied };
    } catch (e) {
      return setupErr(reply, e);
    }
  });

  app.post('/api/setup/init', async (req, reply) => {
    const body = (req.body ?? {}) as { cwd?: unknown };
    if (body.cwd !== undefined && typeof body.cwd !== 'string') {
      return reply.code(400).send({ ok: false, code: 'bad_cwd', message: 'cwd must be a string path' });
    }
    try {
      const { created, existed } = await runSetupInit(body.cwd);
      return { ok: true, created, existed };
    } catch (e) {
      return setupErr(reply, e);
    }
  });

  app.get('/api/doctor', async (req) => {
    const query = req.query as { agents?: unknown };
    const withSoul = query.agents === '1' || query.agents === 'true';

    const checks: DoctorCheck[] = [
      await timed('config', async () => {
        const cfg = await loadConfig(process.cwd());
        return `~/.lokma/config.json parses · theme ${cfg.theme} · model ${cfg.defaultModel}`;
      }),
      await timed('credentials', async () => {
        let mode: string | null = null;
        try {
          const s = await stat(expandHome('~/.lokma/credentials.json'));
          mode = (s.mode & 0o777).toString(8);
        } catch {
          return 'not created yet — written 0600 on the first key save';
        }
        const masked = await getMaskedCredentials();
        const ids = Object.keys(masked);
        const withKey = ids.filter((id) => masked[id]?.keySet).length;
        const perms = mode === '600' ? '0600' : `perms ${mode} (want 600)`;
        if (mode !== '600') throw new Error(`${perms} · keySet ${withKey}/${ids.length}`);
        return `${perms} · keySet ${withKey}/${ids.length}`;
      }),
      await timed('providers', async () => {
        const views = await listProviderViews();
        const enabled = views.filter((v) => v.enabled).length;
        const withKey = views.filter((v) => v.keySet).length;
        if (views.length === 0) throw new Error('no providers configured — add one in the Providers tab');
        return `${enabled}/${views.length} enabled · ${withKey} with keys`;
      }),
      await timed('models', async () => {
        const cfg = await loadConfig(process.cwd());
        const models = applyModelFlags(await getCatalog(), cfg.models ?? {});
        const enabled = models.filter((m) => m.enabled).length;
        if (enabled === 0) throw new Error(`${models.length} models in the catalog, none enabled`);
        return `${enabled}/${models.length} enabled`;
      }),
      await timed('sessions', async () => {
        const store = new SessionStore(process.cwd());
        const summaries = await store.listSummaries();
        return `${summaries.length} session(s) on disk`;
      }),
      await timed('agents', async () => {
        const agents = await listAgents();
        if (agents.length === 0) return 'none registered yet';
        const byState = new Map<string, number>();
        for (const agent of agents) {
          const state = (agent as { state?: unknown }).state;
          const key = typeof state === 'string' ? state : 'unknown';
          byState.set(key, (byState.get(key) ?? 0) + 1);
        }
        const parts = [...byState.entries()].map(([k, n]) => `${n} ${k}`);
        return `${agents.length} registered (${parts.join(' · ')})`;
      }),
      await timed('skills', async () => {
        const skills = await scan({ dirs: ['skills', '~/.lokma/skills'] });
        return `${skills.length} skill(s) (bundled + user)`;
      }),
      await timed('locks', async () => {
        const locks: Lock[] = await listLocks();
        const now = Date.now();
        const live = locks.filter((l) => l.leaseUntil > now).length;
        return `${live} live · ${locks.length - live} stale (${locks.length} total)`;
      }),
    ];

    if (withSoul) {
      checks.push(
        await timed('soul', async () => {
          const agents = await listAgents();
          if (agents.length === 0) return 'no agents yet — nothing to check';
          const ids = agents.slice(0, 20).map((a) => (a as { id: string }).id);
          let withSoulContent = 0;
          for (const id of ids) {
            try {
              const content = await readAgentDoc(id, 'SOUL.md');
              if (content.trim().length > 0) withSoulContent += 1;
            } catch {
              // Unreadable counts as missing — the count carries the truth.
            }
          }
          if (withSoulContent < ids.length) {
            throw new Error(`${withSoulContent}/${ids.length} agents have SOUL.md content`);
          }
          return `${withSoulContent}/${ids.length} agents have SOUL.md content`;
        }),
      );
    }

    const passed = checks.filter((c) => c.ok).length;
    return { checks, passed, total: checks.length };
  });
}
