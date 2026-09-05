import type { FastifyInstance } from 'fastify';
import { CLOUD_MAX_UPLOAD_BYTES, CloudError, exportState, importState } from 'lokma-core';

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
}
