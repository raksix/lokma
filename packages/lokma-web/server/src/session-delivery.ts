import {
  SessionStore,
  canViewSession,
  getUserById,
  locateSession,
  loginGateActive,
  type SessionDeliveryResult,
} from '@lokma/core';
import { enqueuePrompt, getRunState } from './session-runs.js';

/**
 * REQ-147: back-end for the `send_to_session` agent tool — deliver a user
 * message to ANOTHER session. Mirrors the WS prompt path exactly: append
 * the user row to the target transcript, queue it on the session-scoped run
 * queue, then pump. The socket is the only thing missing, so a message
 * aimed at a session whose pane is idle or closed still lands and RUNS.
 * Ownership mirrors the WS handshake: with the login gate on, only the same
 * user's sessions (or a superadmin's) accept a delivery.
 */

export type DeliverToSessionOpts = {
  targetSessionId: string;
  message: string;
  /** Acting user resolved for the CURRENT run (undefined = anonymous). */
  actorUserId?: string | undefined;
  /** cwd of the initiating session — fallback when the target has no meta. */
  fallbackCwd: string;
  /** Fire-and-forget run pump bound by the server (`pumpSessionRun`). */
  pump: (sessionId: string, cwd: string) => void;
  /** Test seam — defaults to the real auth store gate. */
  gateActive?: () => Promise<boolean>;
};

export async function deliverToSession(opts: DeliverToSessionOpts): Promise<SessionDeliveryResult> {
  const message = opts.message.trim();
  if (!message) {
    return { ok: false, code: 'empty_message', message: 'message must not be empty' };
  }
  const found = await locateSession(opts.targetSessionId).catch(() => null);
  if (!found) {
    return { ok: false, code: 'session_not_found', message: 'No such session: ' + opts.targetSessionId };
  }
  const cwd = found.cwd ?? opts.fallbackCwd;
  const store = new SessionStore(cwd);
  const gateOn = await (opts.gateActive ?? loginGateActive)().catch(() => false);
  if (gateOn) {
    const meta = await store.readMeta(opts.targetSessionId).catch(() => null);
    const actor = opts.actorUserId ? await getUserById(opts.actorUserId).catch(() => null) : null;
    if (!actor || !canViewSession(actor, meta?.ownerId)) {
      return { ok: false, code: 'forbidden', message: 'Not your session: ' + opts.targetSessionId };
    }
  }
  // Read before enqueue: `queued` means the target already had a run in
  // flight, so this message waits behind it (it still runs either way).
  const wasRunning = getRunState(opts.targetSessionId).running;
  await store.append(opts.targetSessionId, {
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  });
  const depth = enqueuePrompt(opts.targetSessionId, {
    prompt: message,
    userId: opts.actorUserId,
    enqueuedAt: new Date().toISOString(),
  });
  opts.pump(opts.targetSessionId, cwd);
  return { ok: true, queued: wasRunning || depth > 1 };
}
