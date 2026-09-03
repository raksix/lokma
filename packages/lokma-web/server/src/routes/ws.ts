import { readFile, stat } from 'node:fs/promises';
import { normalize, relative, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { SessionStore } from 'lokma-core';
import { stream as aiStream } from 'lokma-ai';
import { decodeClientMessage, encodeServerMessage } from 'lokma-shared';

/**
 * WS /ws/:sessionId — streams `lokma-ai stream()` into typed server frames.
 * Model resolution per prompt: message `model` > session meta > default.
 * `@file` mentions arrive as `contextPaths`; the server reads them (scoped to
 * the session cwd, size-capped) and prepends them to the model context.
 * Transcript history is NOT replayed here — the client loads it via
 * GET /api/sessions/:id (same JSONL files as the CLI).
 * Protocol shapes come from `lokma-shared` (Zod) — never hand-duplicated.
 */

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-5';
const MAX_CONTEXT_FILES = 5;
const MAX_CONTEXT_BYTES = 20 * 1024;

/** Read workspace-relative paths into `<context>` blocks (real file content). */
async function readContextBlocks(cwd: string, paths: string[] | undefined): Promise<string> {
  if (!paths || paths.length === 0) return '';
  const root = resolve(cwd);
  const blocks: string[] = [];
  for (const raw of paths.slice(0, MAX_CONTEXT_FILES)) {
    if (typeof raw !== 'string' || !raw.trim() || raw.includes('\0')) continue;
    const abs = resolve(root, normalize(raw.trim().replace(/^@/, '')));
    // Escape hatch: never read outside the session workspace.
    if (relative(root, abs).startsWith('..')) continue;
    try {
      const info = await stat(abs);
      if (!info.isFile() || info.size > MAX_CONTEXT_BYTES) continue;
      const content = await readFile(abs, 'utf-8');
      const rel = relative(root, abs) || raw.trim();
      blocks.push(`<context path="${rel}">\n${content}\n</context>`);
    } catch {
      // Missing/unreadable mention — skip it, the prompt still streams.
    }
  }
  return blocks.length ? blocks.join('\n') + '\n' : '';
}

export async function wsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws/:sessionId', { websocket: true }, (socket, req) => {
    const { sessionId } = req.params as { sessionId: string };
    const cwd = (req.query as { cwd?: string })?.cwd ?? process.cwd();
    const store = new SessionStore(cwd);

    app.log.info(`[ws] client connected session=${sessionId} cwd=${cwd}`);

    socket.on('message', async (raw: Buffer) => {
      const msg = decodeClientMessage(raw.toString());
      if (!msg) {
        socket.send(
          encodeServerMessage({ type: 'error', message: 'Invalid message shape', sessionId }),
        );
        return;
      }

      if (msg.type === 'prompt') {
        const prompt = msg.prompt.trim();
        if (!prompt) return;
        await store.append(sessionId, { role: 'user', content: prompt, timestamp: new Date().toISOString() });

        // Effective model: per-prompt override wins, then the session meta.
        const meta = await store.readMeta(sessionId);
        const model = msg.model?.trim() || meta?.model || DEFAULT_MODEL;
        if (msg.model?.trim() && msg.model.trim() !== meta?.model) {
          await store.writeMeta(sessionId, { model: model });
        }
        const provider = model.split('/')[0] ?? 'anthropic';

        const contextPrefix = await readContextBlocks(cwd, msg.contextPaths);
        const effectivePrompt = contextPrefix ? `${contextPrefix}${prompt}` : prompt;

        let full = '';
        try {
          for await (const chunk of aiStream({
            provider,
            model,
            messages: [{ role: 'user', content: effectivePrompt }],
          })) {
            if (chunk.type === 'text_delta') {
              full += chunk.delta;
              socket.send(encodeServerMessage({ type: 'text_delta', delta: chunk.delta, sessionId }));
            } else if (chunk.type === 'done') {
              break;
            }
          }
          await store.append(sessionId, { role: 'assistant', content: full, timestamp: new Date().toISOString() });
          socket.send(encodeServerMessage({ type: 'done', sessionId, reason: 'complete' }));
          // Real character counts; pricing lands with the Usage wave (W2),
          // so costUsd stays 0 until a real price table exists.
          socket.send(
            encodeServerMessage({
              type: 'cost',
              sessionId,
              inputTokens: effectivePrompt.length,
              outputTokens: full.length,
              costUsd: 0,
              model,
            }),
          );
        } catch (e) {
          socket.send(
            encodeServerMessage({ type: 'error', message: String(e), sessionId }),
          );
        }
      } else if (msg.type === 'abort') {
        socket.send(encodeServerMessage({ type: 'done', sessionId, reason: 'aborted' }));
      } else if (msg.type === 'permission_response' || msg.type === 'ask_response') {
        // No tool-approval loop runs server-side yet (lands with W1-2/W4) —
        // acknowledge instead of dropping silently so the client can unblock.
        app.log.info(`[ws] ${msg.type} ${msg.requestId} (no pending gate yet)`);
      }
    });

    socket.on('close', () => {
      app.log.info(`[ws] client disconnected session=${sessionId}`);
    });
  });
}
