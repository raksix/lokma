import type { FastifyInstance } from 'fastify';
import { GitError, RepoGit, listLocks } from 'lokma-core';
import { relative, resolve, sep } from 'node:path';

/**
 * Repo git — real `git status` + log + commit + push for the GitPane (W3-11).
 * `GET /api/git/status` (branch/upstream/ahead-behind/staged-vs-unstaged files;
 * non-repos answer `{ repo: false }`, never an error, so the pane shows an
 * honest empty state);
 * `GET /api/git/log` (newest-first commits);
 * `POST /api/git/commit` (stages all + commits, message required);
 * `POST /api/git/push` (upstream push, output tail returned);
 * `POST /api/git/gc` (`git worktree prune` — the pane GC button).
 * All calls scope to `?cwd=` / `{ cwd }` (the session cwd, like `/api/files`).
 * See Docs/24 §git pane.
 */

function repo(cwd: unknown): RepoGit {
  return new RepoGit(typeof cwd === 'string' && cwd ? cwd : process.cwd());
}

export async function gitRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/git/status', async (req) => {
    const query = req.query as { cwd?: unknown };
    return { ok: true, ...(await repo(query.cwd).status()) };
  });

  app.get('/api/git/log', async (req, reply) => {
    const query = req.query as { cwd?: unknown; max?: unknown };
    const max = query.max === undefined ? undefined : Number(query.max);
    if (query.max !== undefined && !Number.isFinite(max)) {
      return reply.status(400).send({ code: 'bad_max', message: 'max must be a number' });
    }
    try {
      return { ok: true, ...(await repo(query.cwd).log(max)) };
    } catch (e) {
      if (e instanceof GitError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/git/commit', async (req, reply) => {
    const body = (req.body ?? {}) as { cwd?: unknown; message?: unknown };
    try {
      return { ok: true, ...(await repo(body.cwd).commit(body.message)) };
    } catch (e) {
      if (e instanceof GitError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/git/push', async (req, reply) => {
    const body = (req.body ?? {}) as { cwd?: unknown; remote?: unknown; branch?: unknown };
    try {
      return { ok: true, ...(await repo(body.cwd).push(body.remote, body.branch)) };
    } catch (e) {
      if (e instanceof GitError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/git/gc', async (req, reply) => {
    const body = (req.body ?? {}) as { cwd?: unknown };
    try {
      return { ok: true, ...(await repo(body.cwd).gc()) };
    } catch (e) {
      if (e instanceof GitError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  /**
   * Live advisory locks for the GitPane rows + safe banner (W3-11).
   * Lock paths stored under `?cwd=` come back workspace-relative (so rows
   * join on equality); foreign paths stay absolute. Expired leases are
   * reported as a count, never silently dropped. The per-agent twin
   * (`GET /api/agents/:id/locks`) serves the future AgentHub (W4).
   */
  app.get('/api/git/locks', async (req) => {
    const query = req.query as { cwd?: unknown };
    const root = resolve(typeof query.cwd === 'string' && query.cwd ? query.cwd : process.cwd());
    const now = Date.now();
    const locks: { path: string; owner: string; leaseUntil: number }[] = [];
    let expired = 0;
    for (const lock of await listLocks()) {
      if (lock.leaseUntil <= now) {
        expired += 1;
        continue;
      }
      const rel = relative(root, resolve(root, lock.path));
      locks.push({
        path: rel === '..' || rel.startsWith(`..${sep}`) ? lock.path : rel.split(sep).join('/'),
        owner: lock.owner,
        leaseUntil: lock.leaseUntil,
      });
    }
    locks.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return { ok: true, cwd: root, locks, count: locks.length, expired };
  });
}
