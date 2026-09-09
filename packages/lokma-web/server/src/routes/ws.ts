import { readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  SessionStore,
  TerminalError,
  UsageLedger,
  estimateCost,
  estimateTokens,
  loadConfig,
  loginGateActive,
  onAgentEvent,
  recordApprovalDecision,
  resolveBotChatContext,
  resolveInRoot,
  saveGlobal,
  terminalManager,
  userFromToken,
} from '@lokma/core';
import { decodeClientMessage, encodeServerMessage } from '@lokma/shared';
import { LoopAborted, buildLoopHistory, runAgentLoop, type ApprovalDecision } from '../agent-loop.js';
import {
  broadcast,
  enqueuePrompt,
  getRunState,
  pruneRunState,
  type SessionRunState,
} from '../session-runs.js';
import { resolveProviderUpstream } from './providers.js';
import { requestToken } from './auth.js';

/**
 * WS /ws/:sessionId — runs the agent tool loop (`../agent-loop.js`) over
 * `lokma-ai stream()`, forwarding typed server frames.
 * REQ-070: prompts run on a SESSION-scoped backend queue (`session-runs.js`),
 * never on the socket. A refresh (socket close) detaches the socket but the
 * run continues; frames fan out to whatever sockets are attached and the
 * JSONL transcript stays the source of truth reconnects read. Only an
 * explicit `abort` (Stop button) cancels a run.
 * Model resolution per prompt: message `model` > bound bot's model >
 * session meta > default. A bot-bound session (`meta.botId`, REQ-027,
 * Docs/35 §8) additionally injects the bot's SOUL + knowledge ahead of the
 * tool system prompt — resolved live per turn, so bot edits apply without
 * rebinding. A deleted bot degrades to plain chat, never a failed turn.
 * `@file` mentions arrive as `contextPaths`; the server reads them (scoped to
 * the session cwd, size-capped) and prepends them to the model context.
 * Transcript history is NOT replayed here — the client loads it via
 * GET /api/sessions/:id (same JSONL files as the CLI).
 * Tool evidence (`role: 'tool'` rows) is appended by the loop itself.
 * Protocol shapes come from `lokma-shared` (Zod) — never hand-duplicated.
 */

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-5';
const MAX_CONTEXT_FILES = 5;
const MAX_CONTEXT_BYTES = 20 * 1024;
/** A gate left unanswered this long auto-denies (the loop must not hang). */
const APPROVAL_TIMEOUT_MS = 10 * 60_000;

/**
 * Drain one session's prompt queue (REQ-070). Reentrancy-safe: concurrent
 * callers return while a pump owns the run. Each queued prompt resolves its
 * model/upstream/history fresh (a bot edit between two prompts applies to
 * the second), then runs the agent loop with a per-prompt AbortController.
 * Frames broadcast to attached sockets; with none attached the run still
 * completes into the transcript (refresh-proof).
 */
async function pumpSessionRun(app: FastifyInstance, sessionId: string, cwd: string): Promise<void> {
  const state = getRunState(sessionId);
  if (state.running) return;
  state.running = true;
  const store = new SessionStore(cwd);
  const send = (frame: Parameters<typeof encodeServerMessage>[0]): void => {
    try {
      broadcast(state, encodeServerMessage(frame));
    } catch {
      // Broadcast never fails a run (dead sockets are pruned on close).
    }
  };
  try {
    while (state.queue.length > 0) {
      const item = state.queue.shift();
      if (!item) break;
      // Effective model: per-prompt override wins, then the bound bot's
      // model, then the session meta. The bot context (SOUL + knowledge)
      // resolves live per turn; a deleted bot degrades to plain chat.
      const meta = await store.readMeta(sessionId);
      const botCtx = meta?.botId ? await resolveBotChatContext(meta.botId, cwd).catch(() => null) : null;
      const model = item.model?.trim() || botCtx?.model || meta?.model || DEFAULT_MODEL;
      if (item.model?.trim() && item.model.trim() !== meta?.model) {
        await store.writeMeta(sessionId, { model: model });
      }
      const provider = model.split('/')[0] ?? 'anthropic';
      const contextPrefix = await readContextBlocks(cwd, item.contextPaths);
      const effectivePrompt = contextPrefix ? `${contextPrefix}${item.prompt}` : item.prompt;

      // Wire-level upstream: credentials store + provider config decide the
      // key and base URL (never a mock echo — missing keys fail honestly).
      let upstream: { provider: 'anthropic' | 'openai'; baseUrl: string; apiKey: string | null };
      try {
        upstream = await resolveProviderUpstream(provider);
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : String(e), sessionId });
        continue;
      }

      const ctrl = new AbortController();
      state.abort = ctrl;
      // History for model continuity (capped) + live permissions for the gate.
      const [historyMessages, config] = await Promise.all([
        store.read(sessionId).catch(() => []),
        loadConfig(cwd).catch(() => null),
      ]);
      const history = buildLoopHistory(historyMessages);
      try {
        const result = await runAgentLoop({
          cwd,
          sessionId,
          userId: item.userId,
          model,
          upstream,
          history,
          prompt: effectivePrompt,
          systemPreamble: botCtx?.systemPreamble || undefined,
          permissions: config?.permissions,
          maxRetries: config?.retry?.maxAttempts,
          retryDelaysMs: config?.retry?.delaysSec ? config.retry.delaysSec.map((s) => s * 1000) : undefined,
          store,
          send,
          waitApproval: ({ requestId, tool }) =>
            new Promise<ApprovalDecision>((resolve, reject) => {
              const timer = setTimeout(() => {
                state.gates.delete(requestId);
                resolve('deny');
              }, APPROVAL_TIMEOUT_MS);
              state.gates.set(requestId, { kind: 'approval', tool, resolve, reject, timer });
            }),
          waitAnswer: ({ requestId }) =>
            new Promise<string>((resolve, reject) => {
              const timer = setTimeout(() => {
                state.gates.delete(requestId);
                resolve('');
              }, APPROVAL_TIMEOUT_MS);
              state.gates.set(requestId, { kind: 'answer', resolve, reject, timer });
            }),
          signal: ctrl.signal,
        });
        if (state.abort === ctrl) state.abort = null;
        if (result.outcome === 'aborted') {
          // Interrupted (Stop button or turn timeout): no usage billing —
          // the loop already kept the partial output it really produced.
          // Exactly one `done/aborted`.
          send({ type: 'done', sessionId, reason: 'aborted' });
          continue;
        }
        send({ type: 'done', sessionId, reason: 'complete' });
        // Real accounting: token estimates from the core price table land
        // in the per-project usage ledger (powers GET /api/usage/*) and in
        // the `cost` frame (powers the header badge + message cost footer).
        // Unpriced models report costUsd 0 + priced:false — never a guess.
        // Char counts now span every loop turn (prompt + tool follow-ups).
        const inputTokens = estimateTokens(result.inputChars);
        const outputTokens = estimateTokens(result.outputChars);
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
        send({
          type: 'cost',
          sessionId,
          inputTokens,
          outputTokens,
          costUsd,
          model,
        });
      } catch (e) {
        if (state.abort === ctrl) state.abort = null;
        if (e instanceof LoopAborted || ctrl.signal.aborted) {
          // Interrupted (Stop button or turn timeout): the loop already
          // kept the partial output it really produced, no usage billing,
          // exactly one `done/aborted`.
          send({ type: 'done', sessionId, reason: 'aborted' });
          continue;
        }
        send({ type: 'error', message: e instanceof Error ? e.message : String(e), sessionId });
        continue;
      }
    }
  } finally {
    state.running = false;
    state.abort = null;
  }
}

/** Reject every pending gate of a session (Stop button only — never socket close). */
function rejectSessionGates(state: SessionRunState): void {
  for (const [id, gate] of state.gates) {
    clearTimeout(gate.timer);
    state.gates.delete(id);
    gate.reject(new LoopAborted());
  }
}

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

    // REQ-062 Parça A (REQ-063): when the login gate is active
    // (bootstrapped + `requireLogin`), tokenless sockets are rejected at
    // the handshake — the chat cannot be driven without a login. Browsers
    // cannot set WS headers, so the token rides `?token=` or the httpOnly
    // `lokma_token` cookie; CLI/SDK callers use either. Gate-off
    // instances keep the legacy open handshake.
    void (async () => {
      try {
        if (!(await loginGateActive())) return;
        const query = req.query as { token?: unknown };
        const token = (typeof query.token === 'string' && query.token) || requestToken(req);
        const user = await userFromToken(token);
        if (!user) {
          try {
            socket.send(encodeServerMessage({ type: 'error', message: 'Login required', code: 'login_required', sessionId }));
          } catch {
            // Socket already gone — just close below.
          }
          socket.close(4401, 'login required');
        }
      } catch {
        // Gate checks never break the socket — fail open, the prompt path
        // re-resolves the user per turn.
      }
    })();

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

    // REQ-070: the run state lives on the SESSION (session-runs.js), not the
    // socket. This socket attaches for fan-out; a refresh detaches it while
    // the run continues. Only an explicit `abort` cancels a run.
    const runState = getRunState(sessionId);
    runState.sockets.add(socket);

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
        // Claim attribution is resolved now (the socket may be gone by turn time).
        const turnUser = await userFromToken(requestToken(req)).catch(() => null);
        const depth = enqueuePrompt(sessionId, {
          prompt,
          model: msg.model?.trim() || undefined,
          contextPaths: msg.contextPaths,
          userId: turnUser?.id,
          enqueuedAt: new Date().toISOString(),
        });
        if (depth > 1) {
          socket.send(
            encodeServerMessage({ type: 'error', message: `Queued behind ${depth - 1} prompt(s) — it runs automatically.`, code: 'queued', sessionId }),
          );
        }
        // Fire-and-forget: the pump owns the run; rejections are impossible
        // by construction (every leg catches), but never float one.
        void pumpSessionRun(app, sessionId, cwd).catch((e) => {
          app.log.warn(`[ws] pump failed session=${sessionId}: ${String(e)}`);
        });
        return;

      } else if (msg.type === 'abort') {
        // Stop button: cancels the session run AND rejects pending gates —
        // the loop's catch block sends the single `done/aborted` (no
        // double-done, no phantom usage record). Socket close never lands
        // here (REQ-070: refresh must not kill the run).
        rejectSessionGates(runState);
        if (runState.abort) runState.abort.abort();
        else socket.send(encodeServerMessage({ type: 'done', sessionId, reason: 'aborted' }));
      } else if (msg.type === 'permission_response' || msg.type === 'ask_response') {
        // Resume a gate the agent loop is suspended on (or log it when the
        // client answers with nothing pending — e.g. after a restart).
        const pending = runState.gates.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          runState.gates.delete(msg.requestId);
        }
        // The answer is still real evidence: append it to the approvals
        // decision log (powers GET /api/approvals), best-effort so logging
        // never breaks chat.
        app.log.info(`[ws] ${msg.type} ${msg.requestId}${pending ? ' (resuming gate)' : ' (no pending gate)'}`);
        try {
          if (msg.type === 'permission_response') {
            await recordApprovalDecision({
              sessionId,
              kind: 'permission',
              requestId: msg.requestId,
              decision: msg.decision,
            });
            // `always` persists a rule so the gate never asks again.
            if (msg.decision === 'always' && pending?.kind === 'approval') {
              try {
                const cfg = await loadConfig(cwd);
                if (!cfg.permissions.allow.includes(pending.tool)) {
                  await saveGlobal({ permissions: { ...cfg.permissions, allow: [...cfg.permissions.allow, pending.tool] } });
                }
              } catch (persistError) {
                app.log.warn(`[ws] always-rule persist failed session=${sessionId}: ${String(persistError)}`);
              }
            }
            if (pending?.kind === 'approval') pending.resolve(msg.decision);
            else if (pending) pending.reject(new LoopAborted());
          } else {
            await recordApprovalDecision({
              sessionId,
              kind: 'question',
              requestId: msg.requestId,
              answer: msg.answer,
            });
            if (pending?.kind === 'answer') pending.resolve(msg.answer);
            else if (pending) pending.reject(new LoopAborted());
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
      // REQ-070: detach only — the session run (and its gates) survive a
      // refresh. A reconnected socket reattaches to the same run state.
      runState.sockets.delete(socket);
      pruneRunState(sessionId);
      app.log.info(`[ws] client disconnected session=${sessionId}`);
    });
  });
}
