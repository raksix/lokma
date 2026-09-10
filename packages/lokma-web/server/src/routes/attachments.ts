import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';

/**
 * Attachment helpers — binary files the composer cannot inline itself.
 * `POST /api/attachments/extract` ({ name, dataBase64 }) → PDF text via
 * `pdftotext -layout` (poppler; server box tool, zero npm deps). Body cap
 * 70MB covers a 50MB file + base64 overhead. Auto-gated by the global
 * login gate (REQ-076) — no per-route auth needed.
 * See Docs/refactor/finished/REQ-114-pdf-attach.md.
 */

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_TEXT_CHARS = 100 * 1024;

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 128 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve({ stdout: String(stdout ?? '') });
    });
  });
}

export async function attachmentRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/attachments/extract',
    { bodyLimit: 70 * 1024 * 1024 },
    async (req, reply) => {
      const body = (req.body ?? {}) as { name?: unknown; dataBase64?: unknown };
      if (typeof body.name !== 'string' || typeof body.dataBase64 !== 'string') {
        return reply.status(400).send({ code: 'bad_body', message: 'need { name, dataBase64 }' });
      }
      const ext = `.${body.name.split('.').pop()?.toLowerCase() ?? ''}`;
      if (ext !== '.pdf') {
        return reply.status(400).send({ code: 'unsupported_type', message: 'only .pdf extraction is supported' });
      }
      let bytes: Buffer;
      try {
        bytes = Buffer.from(body.dataBase64, 'base64');
      } catch {
        return reply.status(400).send({ code: 'bad_base64', message: 'dataBase64 is not valid base64' });
      }
      if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) {
        return reply.status(413).send({ code: 'too_large', message: 'pdf over 50MB cannot be attached' });
      }
      if (!bytes.subarray(0, 5).toString('latin1').startsWith('%PDF')) {
        return reply.status(400).send({ code: 'not_a_pdf', message: 'file does not look like a PDF' });
      }
      const dir = await mkdtemp(join(tmpdir(), 'lokma-pdf-'));
      try {
        const pdfPath = join(dir, 'in.pdf');
        await writeFile(pdfPath, bytes);
        const { stdout } = await run('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], 60_000);
        const text = stdout.replace(/\f/g, '\n').trim();
        if (!text) {
          return reply.status(422).send({ code: 'no_text', message: 'no extractable text (scanned images need OCR)' });
        }
        const truncated = text.length > MAX_TEXT_CHARS;
        return {
          ok: true,
          text: truncated
            ? `${text.slice(0, MAX_TEXT_CHARS)}\n…[pdf truncated: ${text.length} chars total, first ${MAX_TEXT_CHARS} shown]`
            : text,
          chars: text.length,
          truncated,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/ENOENT/.test(msg)) {
          return reply.status(501).send({ code: 'no_extractor', message: 'pdftotext not installed on server' });
        }
        return reply.status(500).send({ code: 'extract_failed', message: `pdf extraction failed: ${msg.slice(0, 200)}` });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
}
