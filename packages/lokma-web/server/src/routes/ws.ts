import { readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { SessionStore, TerminalError, UsageLedger, estimateCost, estimateTokens, onAgentEvent, recordApprovalDecision, resolveInRoot, terminalManager } from 'lokma-core';
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
    if (typeof raw !== 'string' || !raw.trim()) continue;
    // Jailed by the shared core guard (outside escapes throw, skipped here).
    let abs: string;
    try {
      abs = resolveInRoot(root, raw.trim().replace(/^@/, ''));
    } catch {
      continue;
    }
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

    // Terminal fan-out: process output reaches only this session's sockets.
    // Terminals spawned without a session tag (CLI) fan out to every socket.
    const matchesSession = (terminalId: string): boolean => {
      const record = terminalManager.peek(terminalId);
      if (!record) return false;
      return record.sessionId === '' || record.sessionId === sessionId;
    };
    const offData = terminalManager.onData((terminalId, data) => {
      if (!matchesSession(terminalId)) return;
      socket.send(encodeServerMessage({ type: 'terminal/data', terminalId, data, sessionId }));
    });
    const offExit = terminalManager.onExit((record) => {
      if (record.sessionId !== '' && record.sessionId !== sessionId) return;
      socket.send(
        encodeServerMessage({
          type: 'terminal/exit',
          terminalId: record.id,
          exitCode: record.exitCode,
          signal: record.signal,
          sessionId,
        }),
      );
    });

    // Orchestration (W4-14): registry lifecycle transitions
    // (create/pause/resume/kill/fork/clone/delete) fan out to every live
    // socket as `agent_state` frames, so the Hub + Orchestration panes go
    // live without polling. Agents are global (homedir registry), so unlike
    // terminal traffic no session scoping applies here.
    const offAgent = onAgentEvent((ev) => {
      socket.send(
        encodeServerMessage({ type: 'agent_state', agentId: ev.agentId, state: ev.state }),
      );
    });

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
          // Real accounting: token estimates from the core price table land
          // in the per-project usage ledger (powers GET /api/usage/*) and in
          // the `cost` frame (powers the header badge + message cost footer).
          // Unpriced models report costUsd 0 + priced:false — never a guess.
          const inputTokens = estimateTokens(effectivePrompt.length);
          const outputTokens = estimateTokens(full.length);
          const { costUsd, priced } = estimateCost(model, inputTokens, outputTokens);
          try {
            await new UsageLedger(cwd).record({
              sessionId,
              provider,
              model,
              inputTokens,
              outputTokens,
              costUsd,
              priced,
            });
          } catch (e) {
            // Accounting must never break chat — log and keep streaming.
            app.log.warn(`[ws] usage record failed session=${sessionId}: ${String(e)}`);
          }
          socket.send(
            encodeServerMessage({
              type: 'cost',
              sessionId,
              inputTokens,
              outputTokens,
              costUsd,
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
        // The answer is still real evidence: append it to the approvals
        // decision log (powers GET /api/approvals), best-effort so logging
        // never breaks chat.
        app.log.info(`[ws] ${msg.type} ${msg.requestId} (no pending gate yet)`);
        try {
          if (msg.type === 'permission_response') {
            await recordApprovalDecision({
              sessionId,
              kind: 'permission',
              requestId: msg.requestId,
              decision: msg.decision,
            });
          } else {
            await recordApprovalDecision({
              sessionId,
              kind: 'question',
              requestId: msg.requestId,
              answer: msg.answer,
            });
          }
        } catch (e) {
          app.log.warn(`[ws] approvals record failed session=${sessionId}: ${String(e)}`);
        }
      } else if (msg.type === 'terminal/input') {
        // Stdin for a live shell — errors come back as `error` frames so the
        // pane can toast instead of hanging on a dead terminal.
        try {
          terminalManager.write(msg.terminalId, msg.data);
        } catch (e) {
          const code = e instanceof TerminalError ? e.code : 'terminal_write_failed';
          socket.send(
            encodeServerMessage({ type: 'error', message: String(e), code, sessionId }),
          );
        }
      } else if (msg.type === 'terminal/resize') {
        try {
          terminalManager.resize(msg.terminalId, msg.cols, msg.rows);
        } catch (e) {
          const code = e instanceof TerminalError ? e.code : 'terminal_resize_failed';
          socket.send(
            encodeServerMessage({ type: 'error', message: String(e), code, sessionId }),
          );
        }
      } else if (msg.type === 'terminal/kill') {
        // The `terminal/exit` frame (via the exit listener above) confirms.
        try {
          const result = await terminalManager.kill(msg.terminalId);
          if (!result.killed) {
            const record = terminalManager.peek(msg.terminalId);
            socket.send(
              encodeServerMessage({
                type: 'terminal/exit',
                terminalId: msg.terminalId,
                exitCode: record?.exitCode ?? result.exitCode,
                signal: record?.signal ?? result.signal,
                sessionId,
              }),
            );
          }
        } catch (e) {
          const code = e instanceof TerminalError ? e.code : 'terminal_kill_failed';
          socket.send(
            encodeServerMessage({ type: 'error', message: String(e), code, sessionId }),
          );
        }
      }
    });

    socket.on('close', () => {
      offData();
      offExit();
      offAgent();
      app.log.info(`[ws] client disconnected session=${sessionId}`);
    });
  });
}
