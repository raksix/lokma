import { readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  SessionStore,
  TerminalError,
  UsageLedger,
  canViewSession,
  compactSession,
  compactionStatus,
  decideToolCall,
  estimateCost,
  estimateTokens,
  getUserById,
  loadConfig,
  locateSession,
  loginGateActive,
  mintCallId,
  normalizeCwd,
  onAgentEvent,
  recordApprovalDecision,
  resolveBotChatContext,
  resolveInRoot,
  saveGlobal,
  terminalManager,
  userFromToken,
} from '@lokma/core';
import { decodeClientMessage, encodeServerMessage } from '@lokma/shared';
import { LoopAborted, LOOP_DEFAULT_MAX_TURNS, buildLoopHistory, runAgentLoop, type ApprovalDecision } from '../agent-loop.js';
import {
  CLAUDE_CLEAR_MARKER,
  CLAUDE_ENGINE_DEFAULT_MAX_BUDGET_USD,
  CLAUDE_MUTATION_SURFACE,
  CLAUDE_RUN_ERROR_MARKER,
  claudeCompactMarker,
  countClaudeCategories,
  countRecentClaudeReinjects,
  describeClaudeAskCard,
  formatClaudeContextReport,
  formatClaudeFocusLine,
  formatClaudeReinjectLine,
  formatClaudeRunFailed,
  isClaudeClearCommand,
  isClaudeContextCommand,
  parseClaudeCompactCommand,
  parseClaudeEngineModel,
  resolveClaudePermissions,
  runClaudePrint,
  shouldReinjectSkills,
} from '../engines/claude-print.js';
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

/**
 * REQ-129: the model a session falls back to when nothing named one.
 *
 * The CLI and the web UI both read `~/.lokma/config.json:defaultModel`, but
 * the server hard-coded an Anthropic id — so on a machine whose configured
 * default points at another provider (and which has no Anthropic key) the
 * first message of every session answered with "No API key configured for
 * Anthropic" and burned the whole retry ladder before aborting. Honour the
 * default the user actually configured; keep the built-in id only when the
 * config is unreadable or the named model is explicitly disabled.
 */
async function configuredDefaultModel(cwd: string): Promise<string> {
  const cfg = await loadConfig(cwd).catch(() => null);
  const candidate = cfg?.defaultModel?.trim();
  if (!candidate) return DEFAULT_MODEL;
  if (cfg?.models?.[candidate]?.enabled === false) return DEFAULT_MODEL;
  return candidate;
}
const MAX_CONTEXT_FILES = 5;
const MAX_CONTEXT_BYTES = 20 * 1024;
/** A gate left unanswered this long auto-denies (the loop must not hang). */
const APPROVAL_TIMEOUT_MS = 10 * 60_000;

/**
 * REQ-116 FAZ B — one headless-engine turn for `claude-code/*` models.
 * The subprocess owns tools natively (no `<tool>`-block loop); this helper
 * only persists + accounts like the built-in path: user prompt is already
 * in the transcript (the `prompt` handler appends it), the engine result
 * lands as the assistant row, stop subtypes leave FAZ A markers, and the
 * REAL reported cost hits the usage ledger. The engine already emitted its
 * `cost` frame from the `result` event, so no second cost frame here.
 * FAZ D-continuity: the next turn resumes the same engine session via the
 * meta-stored handle (`--resume <id>`).
 * FAZ D-compact-window: before spawning, the Lokma-side transcript is
 * auto-compacted when over budget (`compactionStatus` → `compactSession`),
 * so the persisted history the next turn reads stays consistent. Kill
 * switch: `LOKMA_DISABLE_AUTO_COMPACT=1`. Compaction never breaks chat —
 * every failure only warns.
 */
async function appendClaudeReinjectIfQuota(
  app: FastifyInstance,
  store: SessionStore,
  sessionId: string,
): Promise<void> {
  // REQ-116 FAZ D-reinject-quota: one skill-guidance row after a successful
  // compact, bounded by the sliding-window quota. Quota-exhausted turns skip
  // silently (a marker every turn would defeat the bound); read/append
  // failures only warn, never break chat.
  try {
    const contents = await store.read(sessionId).then(
      (messages) => messages.map((m) => m.content),
      () => [] as string[],
    );
    const recent = countRecentClaudeReinjects(contents);
    if (!shouldReinjectSkills(recent)) return;
    await store.append(sessionId, {
      role: 'assistant',
      content: formatClaudeReinjectLine(recent),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    app.log.warn('[ws] claude reinject skipped session=' + sessionId + ': ' + String(e));
  }
}

async function runClaudeEngineTurn(
  app: FastifyInstance,
  args: {
    sessionId: string;
    cwd: string;
    store: SessionStore;
    send: (frame: Parameters<typeof encodeServerMessage>[0]) => void;
    state: SessionRunState;
    model: string;
    claudeModel: string | undefined;
    prompt: string;
  },
): Promise<void> {
  const { sessionId, cwd, store, send, state, model, prompt } = args;
  // REQ-116 FAZ D-clear: `/clear` drops the stored resume handle so the
  // next headless run starts fresh. Harness-side only — the binary never
  // spawns, no permission cards open, no compact runs. Empty string clears
  // the handle per the store merge rule.
  if (isClaudeClearCommand(prompt)) {
    try {
      await store.writeMeta(sessionId, { claudeSessionId: '' });
    } catch (e) {
      app.log.warn('[ws] claude clear failed session=' + sessionId + ': ' + String(e));
    }
    await store.append(sessionId, {
      role: 'assistant',
      content: CLAUDE_CLEAR_MARKER,
      timestamp: new Date().toISOString(),
    });
    send({ type: 'done', sessionId, reason: 'complete' });
    return;
  }
  // REQ-116 FAZ D-compact + D-compact-focus: `/compact` (or `/compact
  // <focus>`) runs the Lokma-side compaction harness-side (default `full`
  // mode) and never spawns the binary — the explicit counterpart to the
  // pre-turn auto-compact window below. No permission cards open (nothing
  // mutates the workspace beyond the transcript the user asked to compact).
  // Always leaves a marker; a focus suffix rides the marker row so the next
  // turn reads the user's instruction from the persisted transcript.
  const compactCmd = parseClaudeCompactCommand(prompt);
  if (compactCmd) {
    const focusSuffix = compactCmd.focus ? ' ' + formatClaudeFocusLine(compactCmd) : '';
    try {
      const report = await compactSession(cwd, sessionId, {});
      await store.append(sessionId, {
        role: 'assistant',
        content: report.compacted
          ? claudeCompactMarker(report.beforeMessages, report.afterMessages, report.mode) + focusSuffix
          : '[compact: no-op - ' + String(report.beforeMessages) + ' messages within budget]' + focusSuffix,
        timestamp: new Date().toISOString(),
      });
      if (report.compacted) await appendClaudeReinjectIfQuota(app, store, sessionId);
    } catch (e) {
      app.log.warn('[ws] claude compact failed session=' + sessionId + ': ' + String(e));
      await store.append(sessionId, {
        role: 'assistant',
        content: '[compact failed: ' + (e instanceof Error ? e.message : String(e)) + ']',
        timestamp: new Date().toISOString(),
      });
    }
    send({ type: 'done', sessionId, reason: 'complete' });
    return;
  }
  // REQ-116 FAZ D-context: `/context` reports headless-run context state
  // harness-side and never spawns the binary — the read-only counterpart to
  // `/clear` + `/compact`. Same inputs the pre-turn auto-compact window
  // reads (`compactionStatus`) plus the resume-handle + budget the engine
  // owns. Fresh/empty sessions report a fresh state instead of erroring;
  // any other failure only warns and leaves a marker row.
  if (isClaudeContextCommand(prompt)) {
    try {
      const status = await compactionStatus(cwd, sessionId);
      const meta = await store.readMeta(sessionId).catch(() => null);
      const last = status.last && status.last.compacted
        ? status.last.mode + ' ' + String(status.last.beforeMessages) + '->' + String(status.last.afterMessages) + ' (' + status.last.compactedAt + ')'
        : null;
      // REQ-116 FAZ D-context-categories: per-role breakdown reads the same
      // transcript the counts above come from; a missing read degrades to
      // no category line (never breaks the report).
      const categories = await store.read(sessionId).then(
        (messages) => countClaudeCategories(messages.map((m) => m.role)),
        () => null,
      );
      await store.append(sessionId, {
        role: 'assistant',
        content: formatClaudeContextReport({
          messages: status.messages,
          chars: status.chars,
          hygieneNeeded: status.hygieneNeeded,
          summaryNeeded: status.summaryNeeded,
          resumed: Boolean(meta?.claudeSessionId?.trim()),
          maxBudgetUsd: CLAUDE_ENGINE_DEFAULT_MAX_BUDGET_USD,
          lastCompact: last,
          categories,
        }),
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      await store.append(sessionId, {
        role: 'assistant',
        content: code === 'session_not_found'
          ? formatClaudeContextReport({
            messages: 0,
            chars: 0,
            hygieneNeeded: false,
            summaryNeeded: false,
            resumed: false,
            maxBudgetUsd: CLAUDE_ENGINE_DEFAULT_MAX_BUDGET_USD,
            lastCompact: null,
          })
          : '[context failed: ' + (e instanceof Error ? e.message : String(e)) + ']',
        timestamp: new Date().toISOString(),
      });
      if (code !== 'session_not_found') {
        app.log.warn('[ws] claude context failed session=' + sessionId + ': ' + String(e));
      }
    }
    send({ type: 'done', sessionId, reason: 'complete' });
    return;
  }
  const ctrl = new AbortController();
  state.abort = ctrl;
  // REQ-116 FAZ C — permission bridge: the project's `permissions` config
  // steers the headless allow/deny lists (deny wins, `Bash(rm *)` always
  // denied). Missing/unreadable config falls back to the engine defaults.
  const permissions = await loadConfig(cwd).then((cfg) => cfg?.permissions).catch(() => null);
  const claudePerms = resolveClaudePermissions(permissions);
  // REQ-116 FAZ D-continuity: resume the same headless Claude session
  // across turns (`--resume <id>`). The mapping lives in the session meta
  // sidecar; a forked session starts without a handle (writeMeta only
  // carries it on explicit patch), so resume never leaks across forks.
  // Missing/unreadable meta means a fresh engine run.
  const resumeSessionId = await store
    .readMeta(sessionId)
    .then((meta) => (meta?.claudeSessionId?.trim() ? meta.claudeSessionId : undefined))
    .catch(() => undefined);
  // REQ-116 FAZ D-compact-window: auto-compact the Lokma-side transcript
  // before the headless run when over budget. The engine resumes its own
  // session server-side; this keeps OUR persisted history (the source the
  // next turn + reconnects read) consistent on long runs. Opt out with
  // `LOKMA_DISABLE_AUTO_COMPACT=1`. Failures only warn, never break chat.
  if (process.env.LOKMA_DISABLE_AUTO_COMPACT !== '1') {
    try {
      const status = await compactionStatus(cwd, sessionId);
      const mode = status.summaryNeeded ? 'full' : status.hygieneNeeded ? 'hygiene' : null;
      if (mode) {
        const report = await compactSession(cwd, sessionId, { mode });
        if (report.compacted) {
          await store.append(sessionId, {
            role: 'assistant',
            content: claudeCompactMarker(report.beforeMessages, report.afterMessages, mode),
            timestamp: new Date().toISOString(),
          });
          await appendClaudeReinjectIfQuota(app, store, sessionId);
        }
      }
    } catch (e) {
      // Fresh/empty sessions throw sessionNotFound here — expected, not an error.
      app.log.warn('[ws] claude pre-turn compact skipped session=' + sessionId + ': ' + String(e));
    }
  }
  try {
    // REQ-116 FAZ C-ask-gate: the subprocess cannot raise a live per-tool
    // card (`tool_start` arrives after the tool ran), so ask-fated mutation
    // surface gates the run UP FRONT with the standard permission card.
    // Deny-fated tools already narrowed the argv lists above (deny wins);
    // each ask-fated tool gets one card on the shared gate path (`always`
    // persists a rule, timeout denies, Stop aborts the wait via the catch
    // below). Nothing spawns until every card is approved.
    for (const tool of CLAUDE_MUTATION_SURFACE) {
      if (decideToolCall(permissions, tool) !== 'ask') continue;
      const requestId = mintCallId('perm');
      send({ type: 'permission_request', requestId, tool, description: describeClaudeAskCard([tool]), sessionId });
      let decision: ApprovalDecision;
      try {
        decision = await new Promise<ApprovalDecision>((resolve, reject) => {
          const timer = setTimeout(() => {
            state.gates.delete(requestId);
            resolve('deny');
          }, APPROVAL_TIMEOUT_MS);
          state.gates.set(requestId, { kind: 'approval', tool, resolve, reject, timer });
        });
      } catch (e) {
        if (e instanceof LoopAborted || ctrl.signal.aborted) {
          if (state.abort === ctrl) state.abort = null;
          send({ type: 'done', sessionId, reason: 'aborted' });
          return;
        }
        throw e;
      }
      if (decision === 'deny') {
        await store.append(sessionId, {
          role: 'assistant',
          content: '[run stopped: permission denied (' + tool + ')]',
          timestamp: new Date().toISOString(),
        });
        if (state.abort === ctrl) state.abort = null;
        send({ type: 'done', sessionId, reason: 'aborted' });
        return;
      }
    }
    const summary = await runClaudePrint({
      prompt,
      cwd,
      model: args.claudeModel,
      allowedTools: claudePerms.allowedTools,
      disallowedTools: claudePerms.disallowedTools,
      maxTurns: LOOP_DEFAULT_MAX_TURNS,
      maxBudgetUsd: CLAUDE_ENGINE_DEFAULT_MAX_BUDGET_USD,
      sessionId,
      signal: ctrl.signal,
      send,
      resumeSessionId,
    });
    if (state.abort === ctrl) state.abort = null;
    if (summary.result.trim()) {
      await store.append(sessionId, { role: 'assistant', content: summary.result, timestamp: new Date().toISOString() });
    }
    if (summary.subtype === 'error_max_turns') {
      await store.append(sessionId, {
        role: 'assistant',
        content: '[run stopped: max_turns=' + String(LOOP_DEFAULT_MAX_TURNS) + ']',
        timestamp: new Date().toISOString(),
      });
    } else if (summary.subtype === 'error_max_budget_usd') {
      await store.append(sessionId, {
        role: 'assistant',
        content: '[run stopped: max_budget_usd=' + String(CLAUDE_ENGINE_DEFAULT_MAX_BUDGET_USD) + ']',
        timestamp: new Date().toISOString(),
      });
    } else if (summary.subtype === 'error_during_execution') {
      // REQ-116 FAZ B-run-error: the binary resolved but reports a
      // mid-execution failure — frame the stop honestly (same `[run
      // stopped: ...]` vocabulary as the FAZ A markers above) instead of
      // reading as a clean completion. The engine `result` text (when
      // non-empty) is already in the transcript from the append above.
      await store.append(sessionId, {
        role: 'assistant',
        content: CLAUDE_RUN_ERROR_MARKER,
        timestamp: new Date().toISOString(),
      });
    }
    // REQ-116 FAZ D-continuity: remember a fresh engine handle for the next
    // turn (compare-then-write avoids churning `updatedAt` when the handle
    // did not change; an empty handle keeps the previous one — the run
    // itself still completed and is already in the transcript).
    if (summary.claudeSessionId.trim() && summary.claudeSessionId !== resumeSessionId) {
      try {
        await store.writeMeta(sessionId, { claudeSessionId: summary.claudeSessionId });
      } catch (e) {
        // Persistence must never break chat — log and keep streaming.
        app.log.warn('[ws] claude handle persist failed session=' + sessionId + ': ' + String(e));
      }
    }
    try {
      await new UsageLedger(cwd).record({
        sessionId,
        provider: 'claude-code',
        model,
        inputTokens: estimateTokens(prompt.length),
        outputTokens: estimateTokens(summary.result.length),
        costUsd: summary.costUsd,
        priced: true,
      });
    } catch (e) {
      // Accounting must never break chat — log and keep streaming.
      app.log.warn('[ws] usage record failed session=' + sessionId + ': ' + String(e));
    }
    send({ type: 'done', sessionId, reason: 'complete' });
  } catch (e) {
    if (state.abort === ctrl) state.abort = null;
    if (e instanceof LoopAborted || ctrl.signal.aborted) {
      send({ type: 'done', sessionId, reason: 'aborted' });
      return;
    }
    // REQ-116 FAZ B-spawn-fail: a rejected headless run leaves an honest
    // failure marker in the transcript (REQ-070 F5-proof) — the `error`
    // frame alone is transient and a refresh would show nothing. Marker
    // vocabulary comes from `formatClaudeRunFailed` (engine markers pass
    // through verbatim, anything else is wrapped, never a raw stack).
    // Persistence is warn-only and never breaks the error path.
    try {
      await store.append(sessionId, {
        role: 'assistant',
        content: formatClaudeRunFailed(e),
        timestamp: new Date().toISOString(),
      });
    } catch (persistErr) {
      app.log.warn('[ws] claude failure marker failed session=' + sessionId + ': ' + String(persistErr));
    }
    send({ type: 'error', message: e instanceof Error ? e.message : String(e), sessionId });
  }
}

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
      const model = item.model?.trim() || botCtx?.model || meta?.model || (await configuredDefaultModel(cwd));
      if (item.model?.trim() && item.model.trim() !== meta?.model) {
        await store.writeMeta(sessionId, { model: model });
      }
      const provider = model.split('/')[0] ?? 'anthropic';
      const contextPrefix = await readContextBlocks(cwd, item.contextPaths);
      const effectivePrompt = contextPrefix ? `${contextPrefix}${item.prompt}` : item.prompt;

      // REQ-116 FAZ B-wiring: `claude-code/...` model ids run the headless
      // engine (the subprocess owns the tool loop natively) instead of the
      // built-in `<tool>`-block loop below. Anything else falls through.
      // Upstream credentials are NOT resolved here — auth comes from the
      // host environment (`ANTHROPIC_API_KEY`), never the repo.
      const claudeSel = parseClaudeEngineModel(model);
      if (claudeSel !== null) {
        await runClaudeEngineTurn(app, {
          sessionId,
          cwd,
          store,
          send,
          state,
          model,
          claudeModel: claudeSel.claudeModel,
          prompt: effectivePrompt,
        });
        continue;
      }

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
          reasoningEffort: item.reasoningEffort,
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
    // REQ-087: the client never sends `?cwd=`, so an explicit value wins
    // but otherwise the session's home dir is located by filename scan.
    // Without this every prompt on a project-cwd session appended to (and
    // pumped from) the server-cwd store — chat on new projects silently
    // went to the wrong transcript.
    const rawQueryCwd = (req.query as { cwd?: string })?.cwd;
    const queryCwd =
      typeof rawQueryCwd === 'string' && rawQueryCwd.trim() ? normalizeCwd(rawQueryCwd) : null;
    let resolvedCwd: string | null = null;
    async function effectiveCwd(): Promise<string> {
      if (queryCwd) return queryCwd;
      if (!resolvedCwd) {
        resolvedCwd = (await locateSession(sessionId).catch(() => null))?.cwd ?? process.cwd();
      }
      return resolvedCwd;
    }

    // REQ-062 Parça A (REQ-063): when the login gate is active
    // (bootstrapped + `requireLogin`), tokenless sockets are rejected at
    // the handshake — the chat cannot be driven without a login. Browsers
    // cannot set WS headers, so the token rides `?token=` or the httpOnly
    // `lokma_token` cookie; CLI/SDK callers use either. Gate-off
    // instances keep the legacy open handshake.
    // REQ-112: remember the handshake user — the prompt path re-resolves
    // per turn via headers/cookie only, which drops `?token=` sockets.
    let handshakeUserId: string | null = null;
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
        } else {
          handshakeUserId = user.id;
          // REQ-094: the socket alone leaks nothing, but terminal fan-out
          // + agent events are session-scoped — non-owners never attach.
          // Missing meta = unattributed = superadmin-only (uniform rule).
          const meta = await new SessionStore(await effectiveCwd()).readMeta(sessionId).catch(() => null);
          if (!canViewSession(user, meta?.ownerId)) {
            try {
              socket.send(
                encodeServerMessage({ type: 'error', message: 'forbidden: not your session', code: 'forbidden', sessionId }),
              );
            } catch {
              // Socket already gone — just close below.
            }
            socket.close(4403, 'forbidden');
          }
        }
      } catch {
        // Gate checks never break the socket — fail open, the prompt path
        // re-resolves the user per turn.
      }
    })();

    void effectiveCwd().then((cwd) => {
      app.log.info(`[ws] client connected session=${sessionId} cwd=${cwd}`);
    });

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
        const cwd = await effectiveCwd();
        // Claim attribution is resolved now (the socket may be gone by turn time).
        // REQ-112: fall back to the handshake user — headers/cookies miss
        // `?token=` sockets, which the handshake already accepted.
        const turnUser =
          (await userFromToken(requestToken(req)).catch(() => null)) ??
          (handshakeUserId ? await getUserById(handshakeUserId).catch(() => null) : null);
        // REQ-094: per-turn ownership re-check (handshake races + the
        // append below would otherwise mint unattributed transcripts for
        // anyone holding the id). Gate-off stays legacy-open.
        if (await loginGateActive()) {
          const turnMeta = await new SessionStore(cwd).readMeta(sessionId).catch(() => null);
          if (!turnUser || !canViewSession(turnUser, turnMeta?.ownerId)) {
            socket.send(
              encodeServerMessage({ type: 'error', message: 'forbidden: not your session', code: 'forbidden', sessionId }),
            );
            return;
          }
        }
        await new SessionStore(cwd).append(sessionId, { role: 'user', content: prompt, timestamp: new Date().toISOString() });
        const depth = enqueuePrompt(sessionId, {
          prompt,
          model: msg.model?.trim() || undefined,
          contextPaths: msg.contextPaths,
          reasoningEffort: msg.reasoningEffort,
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
                const cfg = await loadConfig(await effectiveCwd());
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
