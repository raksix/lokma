import type { FastifyInstance } from 'fastify';
import {
  CLOUD_MAX_UPLOAD_BYTES,
  CloudError,
  exportState,
  importState,
  startTunnel,
  stopTunnel,
  TunnelError,
  tunnelStatus,
  TUNNEL_DEFAULT_PORT,
} from '@lokma/core';

/**
 * Portable cloud transfer — the server side of the move-to-cloud story
 * (Docs/03 Phase 3 "cloud prep", wave 1).
 * `POST /api/cloud/export` (packs the portable `~/.lokma` state into a
 * dated `.zip` download — secrets never ride along, see core `cloud/`);
 * `POST /api/cloud/import { zipBase64, overwrite? }` (restores a bundle a
 * previous export produced; existing files are kept unless `overwrite` is
 * true; crafted paths are rejected, never written; nothing is deleted).
 * All failures answer `{ code, message }` (never raw stacks or secrets).
 */
export async function cloudRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/cloud/export', async (req, reply) => {
    void req;
    try {
      const packed = await exportState();
      return reply
        .header('Content-Type', packed.contentType)
        .header('Content-Disposition', `attachment; filename="${packed.filename}"`)
        .header('X-Export-Entries', String(packed.manifest.entries.length))
        .header('X-Export-Skipped', String(packed.manifest.skipped.length))
        .send(packed.body);
    } catch (e) {
      if (e instanceof CloudError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post(
    '/api/cloud/import',
    { bodyLimit: CLOUD_MAX_UPLOAD_BYTES },
    async (req, reply) => {
      const body = (req.body ?? {}) as { zipBase64?: unknown; overwrite?: unknown };
      if (typeof body.zipBase64 !== 'string' || body.zipBase64.length === 0) {
        return reply.status(400).send({ code: 'bad_zip', message: 'import needs { zipBase64 } with the bundle bytes' });
      }
      if (body.overwrite !== undefined && typeof body.overwrite !== 'boolean') {
        return reply.status(400).send({ code: 'bad_overwrite', message: 'overwrite must be a boolean' });
      }
      let bytes: Buffer;
      try {
        bytes = Buffer.from(body.zipBase64, 'base64');
      } catch {
        return reply.status(400).send({ code: 'bad_zip', message: 'zipBase64 is not valid base64' });
      }
      if (bytes.length === 0 || bytes.length > CLOUD_MAX_UPLOAD_BYTES) {
        return reply.status(400).send({ code: 'bad_zip', message: 'decoded bundle is empty or larger than the 64MB import cap' });
      }
      try {
        const result = await importState(bytes, { overwrite: body.overwrite });
        return { ok: true, ...result };
      } catch (e) {
        if (e instanceof CloudError) return reply.status(e.status).send({ code: e.code, message: e.message });
        throw e;
      }
    },
  );

  // --- Public tunnel (REQ-193 Kapsam 4) ---------------------------------------
  //
  // The export/import routes above move STATE to another box; these expose the
  // RUNNING box to the internet so a remote install is reachable. They are
  // deliberately NOT in the auth-gate public allowlist: starting a tunnel is a
  // privileged action, so the global gate (REQ-076) keeps covering `/api/*`
  // and the caller must be a logged-in user.
  //
  // Honesty contract (kontrol 5 in the REQ): no route ever synthesizes a url.
  // `GET` returns whatever the provider actually reported, `stop` always
  // answers stopped with a null url, and a failure answers `{code,message}`
  // -- never a made-up public host that would render as a broken frame.

  app.get('/api/cloud/tunnel', async () => tunnelStatus());

  app.post('/api/cloud/tunnel/start', async (req, reply) => {
    const body = (req.body ?? {}) as { port?: unknown };
    let port = TUNNEL_DEFAULT_PORT;
    if (body.port !== undefined) {
      const n = typeof body.port === 'number' ? body.port : Number(body.port);
      // A port is a 16-bit value; anything else is a typo, not a range request.
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        return reply.status(400).send({ code: 'bad_port', message: 'port must be an integer between 1 and 65535' });
      }
      port = n;
    }
    try {
      return await startTunnel({ port });
    } catch (e) {
      if (e instanceof TunnelError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.post('/api/cloud/tunnel/stop', async () => stopTunnel());
}
