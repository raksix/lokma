import type { FastifyInstance } from 'fastify';
import { loginGateActive, userFromToken } from '@lokma/core';
import { requestToken } from '../routes/auth.js';
import { isAuthGateJudged, isAuthGatePublic } from './auth-gate-policy.js';

/**
 * Global login gate (REQ-076) — ONE hook protecting every `/api/*` route
 * (present and future). Before this, only `sessions` / `todos` / `ws`
 * checked `loginGateActive()`; `files`, `terminal`, `git`, `config`,
 * `providers` and ~15 more families served 200 with no token at all.
 * Register BEFORE all routes in `app.ts` (root-level `onRequest` hooks
 * apply to subsequently registered routes). Gate-off instances (fresh or
 * `requireLogin: false`) behave exactly like before — the hook returns
 * immediately. WS upgrades (`/ws/*`) are skipped here; `ws.ts` keeps its
 * own handshake check (browsers can't set WS headers, token rides query).
 */
export async function registerAuthGate(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    const url = req.url ?? '/';
    if (!isAuthGateJudged(url)) return;
    if (isAuthGatePublic(req.method, url)) return;
    let gate = false;
    try {
      gate = await loginGateActive();
    } catch {
      // Settings unreadable — fail CLOSED, never expose APIs on error.
      reply.status(401).send({ code: 'unauthenticated', message: 'Not signed in' });
      return;
    }
    if (!gate) return;
    const user = await userFromToken(requestToken(req));
    if (!user) {
      reply.status(401).send({ code: 'unauthenticated', message: 'Not signed in' });
      return;
    }
  });
}
