import {
  buildBuiltinTools,
  buildTodoTools,
  buildToolSystemPrompt,
  buildUiControlTools,
  createBlockFilter,
  decideToolCall,
  emptyResultPlaceholder,
  executeToolCall,
  heartbeatSession,
  isEmptyResultText,
  mintCallId,
  parseToolBlocks,
  persistedOutputEnvelope,
  previewCut,
  resultBudget,
  resultOverBudget,
  resultToText,
  runApprovedCall,
  SessionStore,
  spillPathFor,
  ToolRegistry,
  type ParsedToolCall,
  type SessionMessage,
  type ToolEvent,
} from '@lokma/core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ProviderError, stream as aiStream, zodToJsonSchema, type ProviderMessage } from '@lokma/ai';
import type { Permissions, ServerMessage } from '@lokma/shared';

/**
 * Agent tool loop — the WS `prompt` path with real tool/permission/ask
 * frames (Phase 1 core-loop hardening, wave 2b).
 *
 * The model drives tools through `<tool>`/`<ask>` text blocks (see
 * `lokma-core/tools/parse.ts` — works with every provider adapter, no
 * native function-calling needed). Each turn streams text live (block
 * markup is filtered out before it reaches the chat surface), then:
 * allowed calls run immediately, gated calls suspend on `waitApproval`
 * (the WS socket resolves it from `permission_response`, `always` is
 * persisted by the caller), questions suspend on `waitAnswer`, and the
 * results feed back as the next turn's user message. Ask/permission
 * answers and aborts arrive mid-loop — the loop never polls.
 * Tool evidence lands in the JSONL transcript as `role: 'tool'` rows
 * (same files the CLI reads) plus the follow-up context for the model.
 */

export type ApprovalDecision = 'allow' | 'deny' | 'always';

/** Rejection reason the loop treats as user-abort (socket closed, Stop). */
export class LoopAborted extends Error {
  constructor() {
    super('loop aborted');
    this.name = 'LoopAborted';
  }
}

export type AgentLoopOpts = {
  cwd: string;
  sessionId: string;
  model: string;
  upstream: { provider: 'anthropic' | 'openai'; baseUrl: string; apiKey: string | null };
  /** Prior transcript as provider messages (use `buildLoopHistory`). */
  history: ProviderMessage[];
  /** User prompt with `@file` context already prepended. */
  prompt: string;
  permissions: Pick<Permissions, 'allow' | 'deny' | 'defaultMode'> | undefined | null;
  store: SessionStore;
  /** Frame emitter (the caller binds `sessionId`). */
  send: (msg: ServerMessage) => void;
  /** Resolves from the client's `permission_response`; rejects on abort. */
  waitApproval: (req: { requestId: string; tool: string; description: string }) => Promise<ApprovalDecision>;
  /** Resolves from the client's `ask_response`; rejects on abort. */
  waitAnswer: (req: { requestId: string; question: string; choices?: string[] }) => Promise<string>;
  /** Parent abort (WS `abort` / socket close) — rejects waits, kills turns. */
  signal: AbortSignal;
  /**
   * Claiming user id for the todo tools (REQ-062 Parça C) — recorded as
   * the claim holder beside the session. Undefined for anonymous/agent
   * runs (recorded as `agent`).
   */
  userId?: string;
  /**
   * Bot SOUL + knowledge preamble (REQ-027, Docs/35 §8) — prepended ahead
   * of the tool system prompt so a bot-bound session chats AS the bot.
   */
  systemPreamble?: string;
  maxTurns?: number;
  turnTimeoutMs?: number;
  /**
   * REQ-077: auto-retry on upstream failure (stream errors + turn-1 empty
   * replies). Undefined = defaults (10 retries, default backoff). 0 = the
   * old fail-fast behavior. User aborts never retry.
   */
  maxRetries?: number;
  retryDelaysMs?: number[];
};

export type AgentLoopResult = {
  outcome: 'complete' | 'aborted';
  inputChars: number;
  outputChars: number;
  turns: number;
};

export const LOOP_DEFAULT_MAX_TURNS = 15;
export const LOOP_DEFAULT_TURN_TIMEOUT_MS = 180_000;
/** REQ-077: retries after the first try (default 10, 0 = fail fast). */
export const LOOP_DEFAULT_MAX_RETRIES = 10;
/** REQ-077: default backoff — 3s, 10s, 15s, 20s, 30s, 40s, 50s, then 60/90/120s. */
export const LOOP_DEFAULT_RETRY_DELAYS_MS = [3_000, 10_000, 15_000, 20_000, 30_000, 40_000, 50_000, 60_000, 90_000, 120_000];

/**
 * REQ-077: wait before retry `attempt` (1-based). Past the end of the
 * list the last value repeats; empty list = no wait. Pure — probe it.
 */
export function retryDelayMs(delaysMs: number[], attempt: number): number {
  if (delaysMs.length === 0 || attempt < 1) return 0;
  return delaysMs[Math.min(attempt - 1, delaysMs.length - 1)] ?? 0;
}

/**
 * REQ-116 FAZ A: Claude-Code-style stop_reason discipline for the turn end.
 * The loop's continue/stop verdict is an explicit decision, not an
 * emergent `followUps.length` check:
 * - `tool_use` — the turn emitted tool calls, their results feed back in.
 * - `ask` — the turn asked blocking questions, answers feed back in.
 * - `empty` — no text, no calls, no questions: an empty turn (REQ-071
 *   empty-retry owns the first one, the second still means done).
 * - `end_turn` — answer text with nothing pending: the run is complete.
 * Pure — probe it directly.
 */
export type TurnEndDecision = 'tool_use' | 'ask' | 'empty' | 'end_turn';

export function decideTurnEnd(args: { toolCalls: number; asks: number; cleanText: string }): TurnEndDecision {
  if (args.toolCalls > 0) return 'tool_use';
  if (args.asks > 0) return 'ask';
  if (!args.cleanText.trim()) return 'empty';
  return 'end_turn';
}

/** Abort-aware sleep — resolves false when the parent aborts mid-wait. */
function sleepAbortable(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(t);
      resolve(false);
    };
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
/**
 * Transcript window rebuilt as model history (newest-first cap).
 * REQ-071: per-message truncation — one giant message (a 31KB tool block
 * the model echoed as text, a huge tool_result JSON) must never evict the
 * whole conversation. Chat turns keep 8K each, tool rows 2K; the newest
 * message (the prompt being answered) always rides whole.
 */
const HISTORY_MESSAGE_CAP = 30;
const HISTORY_CHAR_CAP = 48_000;
const HISTORY_CHAT_TRUNC = 8_000;
const HISTORY_TOOL_TRUNC = 2_000;

/** Cut `text` to `cap` chars, marking the cut so the model knows. */
export function truncateHistoryText(text: string, cap: number): string {
  if (text.length <= cap) return text;
  return `${text.slice(0, cap)}\n…[truncated ${text.length - cap} chars]`;
}

/** Split a persisted tool row into (argumentsJson, body) for native replay. */
export function toolRowParts(content: string): { argumentsJson: string; body: string } {
  try {
    const rec = JSON.parse(content) as {
      input?: unknown;
      result?: unknown;
      message?: unknown;
      ok?: unknown;
      code?: unknown;
    };
    if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
      const argumentsJson = JSON.stringify(rec.input ?? {});
      let body: string;
      if ('result' in rec) body = typeof rec.result === 'string' ? rec.result : JSON.stringify(rec.result ?? null);
      else if (rec.ok === false) body = `ERROR ${String(rec.code ?? 'error')}: ${String(rec.message ?? '')}`;
      else body = content;
      return { argumentsJson, body };
    }
  } catch {
    // Legacy/plain row — replay it verbatim as the result body.
  }
  return { argumentsJson: '{}', body: content };
}

/**
 * Rebuild model history from the JSONL transcript (REQ-071 caps + REQ-128
 * native pairing).
 *
 * Oldest rows drop first past the caps; thinking rows never ride upstream.
 * REQ-128: an assistant row followed by id-bearing tool rows is re-paired
 * into the native structure (`assistant.tool_calls[]` + one `tool` row per
 * result) — otherwise a second conversation in the same session would show
 * the model a wall of `<tool_result>` text instead of the tool protocol it
 * actually speaks. Anything unpaired (no id, no assistant row ahead of it)
 * degrades to that text blob, so a `tool_call_id` is never left dangling.
 * Pure — probe it directly.
 */
export function buildLoopHistory(messages: SessionMessage[]): ProviderMessage[] {
  const recent = messages.slice(-HISTORY_MESSAGE_CAP);
  type Row = {
    role: 'user' | 'assistant' | 'tool';
    content: string;
    toolCallId?: string;
    toolName?: string;
  };
  const rows: Row[] = [];
  let chars = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (!m) continue;
    // REQ-122: persisted thinking rows are display-only — they never ride
    // back upstream (as `user` text they would pollute context + tokens).
    if (m.role === 'thinking') continue;
    // REQ-071: the newest message always rides whole (it is the prompt being
    // answered); older rows are truncated per-role so giants cannot evict
    // the conversation the model is supposed to remember.
    const isNewest = i === recent.length - 1;
    const row: Row =
      m.role === 'tool'
        ? {
            role: 'tool',
            content: isNewest ? m.content : truncateHistoryText(m.content, HISTORY_TOOL_TRUNC),
            toolCallId: m.toolCallId,
            toolName: m.toolName,
          }
        : {
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: isNewest ? m.content : truncateHistoryText(m.content, HISTORY_CHAT_TRUNC),
          };
    if (!row.content.trim()) continue;
    chars += row.content.length;
    if (chars > HISTORY_CHAR_CAP && rows.length > 0) break;
    rows.unshift(row);
  }

  const out: ProviderMessage[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i] as Row;
    if (row.role === 'assistant') {
      const group: Row[] = [];
      let j = i + 1;
      while (j < rows.length) {
        const next = rows[j] as Row;
        if (next.role !== 'tool' || !next.toolCallId) break;
        group.push(next);
        j++;
      }
      if (group.length > 0) {
        out.push({
          role: 'assistant',
          content: row.content,
          toolCalls: group.map((g) => {
            const parts = toolRowParts(g.content);
            return { id: g.toolCallId as string, name: g.toolName ?? 'unknown', arguments: parts.argumentsJson };
          }),
        });
        for (const g of group) {
          out.push({
            role: 'tool',
            content: toolRowParts(g.content).body,
            toolCallId: g.toolCallId as string,
            name: g.toolName,
          });
        }
        i = j;
        continue;
      }
    }
    // Unpaired tool row (or plain turn): the text blob every upstream reads.
    if (row.role === 'tool') {
      out.push({
        role: 'user',
        content: `<tool_result tool="${row.toolName ?? 'unknown'}" id="${row.toolCallId ?? ''}">${row.content}</tool_result>`,
      });
    } else {
      out.push({ role: row.role, content: row.content });
    }
    i++;
  }
  return out;
}

function toolRecord(callId: string, tool: string, record: Record<string, unknown>, input?: unknown): SessionMessage {
  // REQ-074: persist the input beside the outcome — transcript tool rows
  // render full human sentences (Hermes-desktop parity: the row survives
  // refresh with the same detail as the live trace).
  return {
    role: 'tool',
    content: JSON.stringify(input === undefined ? record : { ...record, input }),
    timestamp: new Date().toISOString(),
    toolCallId: callId,
    toolName: tool,
  };
}

/**
 * REQ-128: what the model actually reads for one tool result. Over-budget
 * payloads are spilled to `.lokma/tool-results/` and replaced with a
 * `<persisted-output>` envelope (Claude-Code discipline: never truncate a
 * result into uselessness, and never let one payload evict the
 * conversation). Best-effort — if the spill write fails, a capped preview
 * still goes out rather than the whole turn erroring.
 */
async function formatModelResult(
  cwd: string,
  tool: string,
  callId: string,
  result: unknown,
  declaredBudget: number | undefined,
): Promise<string> {
  const text = resultToText(result);
  if (isEmptyResultText(text)) return emptyResultPlaceholder(tool);
  const budget = resultBudget(declaredBudget);
  if (!resultOverBudget(text, budget)) return text;
  const rel = spillPathFor(callId);
  const { preview, hasMore } = previewCut(text);
  try {
    const abs = join(cwd, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, text, 'utf8');
    return persistedOutputEnvelope({ originalChars: text.length, path: rel, preview, hasMore });
  } catch {
    return `${text.slice(0, budget)}\n…[truncated ${text.length - budget} chars — could not persist output]`;
  }
}

export async function runAgentLoop(opts: AgentLoopOpts): Promise<AgentLoopResult> {
  const maxTurns = opts.maxTurns ?? LOOP_DEFAULT_MAX_TURNS;
  const turnTimeoutMs = opts.turnTimeoutMs ?? LOOP_DEFAULT_TURN_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? LOOP_DEFAULT_MAX_RETRIES;
  const retryDelaysMs = opts.retryDelaysMs ?? LOOP_DEFAULT_RETRY_DELAYS_MS;

  const registry = new ToolRegistry();
  for (const tool of buildBuiltinTools(opts.cwd)) registry.register(tool);
  // REQ-057: UI-control tools run the server effect (browser tab, shell,
  // session) and emit a `ui_action` frame per call so connected clients
  // open/focus the matching pane — the harness drives its own surface.
  for (const tool of buildUiControlTools(opts.cwd, {
    sessionId: opts.sessionId,
    emit: (payload) =>
      opts.send({ type: 'ui_action', actionId: mintCallId('ui'), ...payload, sessionId: opts.sessionId }),
  })) {
    registry.register(tool);
  }
  // REQ-062 Parça C (REQ-065): todo claim discipline for multi-agent
  // projects — claim before starting shared work, complete when done.
  for (const tool of buildTodoTools({ sessionId: opts.sessionId, userId: opts.userId })) {
    registry.register(tool);
  }
  const toolSystem = buildToolSystemPrompt(registry.list().map((t) => ({ name: t.name, description: t.description })));
  const preamble = opts.systemPreamble?.trim() ? `${opts.systemPreamble.trim()}\n\n` : '';
  const system = `${preamble}${toolSystem}`;

  const messages: ProviderMessage[] = [
    { role: 'system', content: system },
    ...opts.history,
    { role: 'user', content: opts.prompt },
  ];
  let inputChars = system.length + opts.prompt.length + opts.history.reduce((n, m) => n + m.content.length, 0);
  let outputChars = 0;
  let turns = 0;
  /** REQ-071: one quiet-turn nudge per run (see the followUps-empty leg). */
  let nudgedQuiet = false;

  const forwardEvent = (event: ToolEvent): void => {
    if (event.type === 'tool_start') {
      opts.send({ type: 'tool_start', tool: event.tool, input: event.input, callId: event.callId, sessionId: opts.sessionId });
    } else if (event.type === 'tool_result') {
      opts.send({
        type: 'tool_result',
        callId: event.callId,
        result: event.result,
        isError: event.isError,
        sessionId: opts.sessionId,
      });
    }
    // `permission_request` is emitted by the caller below (it owns the
    // request id the client's answer must echo back).
  };

  for (turns = 1; turns <= maxTurns; turns++) {
    if (opts.signal.aborted) return { outcome: 'aborted', inputChars, outputChars, turns: turns - 1 };

    // REQ-065: keep this session's todo claims leased. Once per turn
    // approximates the ~60s heartbeat cadence; best-effort so the sweep
    // never breaks a turn (a dead loop simply stops heartbeating and its
    // claims auto-release).
    try {
      await heartbeatSession(opts.sessionId);
    } catch {
      // Heartbeat sweep is best-effort — ignore and run the turn.
    }

    // Per-turn timeout: a hung model call ends the turn, not the socket.
    const turnCtrl = new AbortController();
    const onParentAbort = (): void => turnCtrl.abort();
    opts.signal.addEventListener('abort', onParentAbort, { once: true });
    const timer = setTimeout(() => turnCtrl.abort(), turnTimeoutMs);

    const filter = createBlockFilter();
    let clean = '';
    // REQ-119: DeepSeek puts DSML tool calls in reasoning_content, which
    // never passes the text filter — accumulate thinking per turn so a
    // thinking-only DSML block still executes (deduped against text calls).
    let thinkingText = '';
    // REQ-118 FAZ B: gateway-typed native calls bypass the text filter —
    // collected per attempt, merged into runEnd.toolCalls below.
    let nativeCalls: {
      tool: string;
      input: unknown;
      callId: string;
      argumentsJson?: string;
      parseError?: string;
    }[] = [];
    let streamFailed: unknown = null;
    // REQ-077: retry attempts loop — a dead upstream re-tries the same turn
    // with backoff instead of killing the run. `attempt` counts tries (1 =
    // first); retries stop at maxRetries, aborts never retry.
    let attempt = 0;
    let end: ReturnType<typeof filter.finish> | null = null;
    try {
    for (;;) {
      attempt++;
      // A fresh filter per attempt: a partial failed stream must not leak
      // half-written tool blocks into the retry.
      const attemptFilter = attempt === 1 ? filter : createBlockFilter();
      if (attempt > 1) {
        clean = '';
        nativeCalls = [];
      }
      streamFailed = null;
      try {
        for await (const chunk of aiStream({
          provider: opts.upstream.provider,
          model: opts.model,
          messages,
          apiKey: opts.upstream.apiKey,
          baseUrl: opts.upstream.baseUrl,
          signal: turnCtrl.signal,
          // REQ-118 FAZ A/B: registry schemas ride as native Responses tools
          // on spark (other adapters ignore them); native calls execute
          // directly and results return as `function_call_output`
          // (toResponsesInput converts the follow-up blocks).
          tools: registry.list().map((t) => ({
            name: t.name,
            description: t.description,
            parameters: zodToJsonSchema(t.inputSchema),
          })),
          // REQ-038: session-stable routing id for upstreams that need it
          // (OpenCode Go 400s headerless calls).
          extraHeaders: { 'x-opencode-session': `lokma-${opts.sessionId}` },
        })) {
          if (chunk.type === 'text_delta') {
            const visible = attemptFilter.push(chunk.delta);
            if (visible) {
              clean += visible;
              opts.send({ type: 'text_delta', delta: visible, sessionId: opts.sessionId });
            }
          } else if (chunk.type === 'thinking_delta') {
            // REQ-050: reasoning streams straight through (never filtered,
            // never persisted as answer text).
            if (chunk.delta) {
              thinkingText += chunk.delta;
              opts.send({ type: 'thinking_delta', delta: chunk.delta, sessionId: opts.sessionId });
            }
          } else if (chunk.type === 'native_tool_call') {
            // REQ-118 FAZ B: gateway-typed call — collected for direct
            // execution below; the live tool_start row fires at execution
            // time like the text path (no double rows).
            if (chunk.parseError === undefined) {
              nativeCalls.push({
                tool: chunk.tool,
                input: chunk.input,
                callId: chunk.callId,
                argumentsJson: chunk.argumentsJson,
              });
            } else {
              nativeCalls.push({
                tool: chunk.tool,
                input: chunk.input,
                callId: chunk.callId,
                argumentsJson: chunk.argumentsJson,
                parseError: chunk.parseError,
              });
            }
          } else if (chunk.type === 'done') {
            break;
          }
        }
      } catch (e) {
        streamFailed = e;
      }
      if (streamFailed === null) {
        const finished = attemptFilter.finish();
        if (finished.tail) {
          clean += finished.tail;
          opts.send({ type: 'text_delta', delta: finished.tail, sessionId: opts.sessionId });
        }
        // REQ-071: a first turn with no text, no tool calls and no questions
        // is an empty upstream reply, NOT a completed run — it retries like
        // any other upstream failure instead of showing an empty response.
        // REQ-118 FAZ B: native calls count as activity too.
        if (
          turns === 1 &&
          !clean.trim() &&
          finished.toolCalls.length === 0 &&
          nativeCalls.length === 0 &&
          finished.asks.length === 0
        ) {
          streamFailed = new Error('Model returned an empty response');
        } else {
          end = finished;
          break;
        }
      }
      // Failure path: abort (user stop / turn timeout) ends the turn, never
      // retries. Anything else backs off and re-tries the same turn.
      if (opts.signal.aborted || turnCtrl.signal.aborted) {
        if (clean.trim()) {
          await opts.store.append(opts.sessionId, {
            role: 'assistant',
            content: clean,
            timestamp: new Date().toISOString(),
          });
        } else {
          // REQ-071: a turn that produced zero output before aborting
          // (timeout with a stalled upstream) also leaves a trace — never
          // complete silently with nothing to show.
          await opts.store.append(opts.sessionId, {
            role: 'assistant',
            content: '[run aborted: turn produced no output before it ended]',
            timestamp: new Date().toISOString(),
          });
        }
        return { outcome: 'aborted', inputChars, outputChars: outputChars + clean.length, turns };
      }
      const reason = streamFailed instanceof Error ? streamFailed.message : String(streamFailed);
      // REQ-118 FAZ B.2: permanent upstream refusals (region lock, empty
      // pool) never clear on retry — fail fast with the honest message
      // instead of burning the retry budget. Rate limits still retry.
      const failCode = streamFailed instanceof ProviderError ? streamFailed.code : null;
      if (failCode === 'region_blocked' || failCode === 'insufficient_credits') break;
      if (attempt > maxRetries) break;
      const waitMs = retryDelayMs(retryDelaysMs, attempt);
      opts.send({ type: 'retry_notice', attempt, maxAttempts: maxRetries, waitMs, message: reason.slice(0, 300), sessionId: opts.sessionId });
      const waited = await sleepAbortable(waitMs, opts.signal);
      if (!waited) {
        await opts.store.append(opts.sessionId, {
          role: 'assistant',
          content: '[run aborted: stopped while waiting to retry]',
          timestamp: new Date().toISOString(),
        });
        return { outcome: 'aborted', inputChars, outputChars, turns };
      }
    }
    } finally {
      clearTimeout(timer);
      opts.signal.removeEventListener('abort', onParentAbort);
    }
    if (streamFailed !== null) {
      // REQ-071: a dead upstream used to vanish without a trace (no frame a
      // refresh can catch, nothing in the transcript) — the user saw "sent,
      // nothing happened". Leave a short honest note in the transcript so
      // the failure is visible and retryable with context intact.
      const reason = streamFailed instanceof Error ? streamFailed.message : String(streamFailed);
      await opts.store.append(opts.sessionId, {
        role: 'assistant',
        content: `[run failed after ${attempt} tries: ${reason.slice(0, 300)}]`,
        timestamp: new Date().toISOString(),
      });
      throw streamFailed;
    }
    const runEnd = end ?? filter.finish();
    // REQ-119: thinking-only DSML (DeepSeek reasoning_content without a
    // content echo) — parse the accumulated thinking and merge calls the
    // text filter missed. Whitespace-insensitive keys so the same call
    // echoed with different JSON spacing never executes twice.
    if (thinkingText.includes('DSML')) {
      const keyOf = (tool: string, input: unknown): string => {
        let s: string;
        try {
          s = JSON.stringify(input ?? null);
        } catch {
          s = String(input);
        }
        return `${tool}::${s.replace(/\s+/g, '')}`;
      };
      const seen = new Set(runEnd.toolCalls.map((c) => keyOf(c.tool, c.input)));
      for (const call of parseToolBlocks(thinkingText)) {
        if (!call.tool) continue;
        const key = keyOf(call.tool, call.input);
        if (seen.has(key)) continue;
        seen.add(key);
        runEnd.toolCalls.push(call);
      }
    }
    // REQ-118 FAZ B: gateway-typed native calls join the text-parsed ones
    // (deduped by tool+input like the REQ-119 merge, so a model that both
    // dispatches natively and echoes text never executes twice).
    {
      const seen = new Set(
        runEnd.toolCalls.map((c) => `${c.tool}::${JSON.stringify(c.input ?? null)}`),
      );
      for (const n of nativeCalls) {
        if (!n.tool) continue;
        const key = `${n.tool}::${JSON.stringify(n.input ?? null)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // REQ-118 FAZ B.2: keep the gateway call id so the follow-up can
        // answer natively (`function_call_output`); the transcript still
        // uses the minted execution id below.
        // REQ-128: the raw argument string rides along for an exact replay.
        if (n.parseError === undefined) {
          runEnd.toolCalls.push({
            tool: n.tool,
            input: n.input,
            nativeCallId: n.callId,
            nativeArgs: n.argumentsJson,
          });
        } else {
          runEnd.toolCalls.push({
            tool: n.tool,
            input: n.input,
            parseError: n.parseError,
            nativeCallId: n.callId,
            nativeArgs: n.argumentsJson,
          });
        }
      }
    }
    outputChars += clean.length;
    // REQ-122: persist the turn in stream order — thinking first, then text
    // segments interleaved with their tool rows. `runMarks` cut `clean`
    // where each text-parsed block sat; merged (thinking/native) calls carry
    // no mark and flush remaining text first. Empty segments are skipped.
    const runMarks = [...(runEnd.marks ?? [])].sort((a, b) => a.at - b.at);
    const THINK_CAP = 12_000;
    if (thinkingText.trim()) {
      const t = thinkingText.trim();
      await opts.store.append(opts.sessionId, {
        role: 'thinking',
        content:
          t.length > THINK_CAP
            ? `${t.slice(0, THINK_CAP)}\n…[thinking truncated: ${t.length} chars total]`
            : t,
        timestamp: new Date().toISOString(),
      });
    }
    let segPos = 0;
    let execIdx = 0;
    const flushText = async (to: number): Promise<void> => {
      const at = Math.max(segPos, Math.min(to, clean.length));
      const seg = clean.slice(segPos, at);
      segPos = at;
      if (seg.trim()) {
        await opts.store.append(opts.sessionId, {
          role: 'assistant',
          content: seg,
          timestamp: new Date().toISOString(),
        });
      }
    };

    /**
     * REQ-128: one result handed back to the model. `native` is present when
     * the call arrived as a gateway function call — that pair is replayed
     * exactly (assistant.tool_calls + one `tool` row per result), the shape
     * Claude Code uses; text-parsed calls feed back as one `<tool_result>`
     * user blob, which every upstream reads.
     */
    type FollowUp = {
      tool: string;
      input: unknown;
      /** Text-mode payload: the full `<tool_result …>body</tool_result>` block. */
      text: string;
      /** Native-mode payload: the bare result body (the id links it already). */
      body: string;
      isError: boolean;
      native?: { id: string; name: string; arguments: string };
    };
    const results: FollowUp[] = [];
    /** Blocking-question answers — plain text, never tool rows. */
    const answers: string[] = [];

    /** Record one result (text blob always; native pair when the call had one). */
    const pushResult = (
      call: { tool: string; input: unknown; nativeCallId?: string; nativeArgs?: string },
      resultId: string,
      body: string,
      isError: boolean,
    ): void => {
      const nativeId = typeof call.nativeCallId === 'string' ? call.nativeCallId.trim() : '';
      const nativeArgs = typeof call.nativeArgs === 'string' && call.nativeArgs.trim() ? call.nativeArgs : '';
      results.push({
        tool: call.tool || 'unknown',
        input: call.input,
        text: `<tool_result tool="${call.tool || 'unknown'}" id="${resultId}">${body}</tool_result>`,
        body,
        isError,
        ...(nativeId
          ? {
              native: {
                id: nativeId,
                name: call.tool || 'unknown',
                arguments: nativeArgs || JSON.stringify(call.input ?? {}),
              },
            }
          : {}),
      });
    };

    // ── Tool calls (model order) ────────────────────────────────────────────
    // REQ-128: consecutive read-only calls run as one parallel batch (max 10,
    // Claude-Code parity) — independent reads must not queue behind each
    // other. Mutating calls stay strictly serial, and anything the gate wants
    // to ask about takes the serial path so approvals keep their
    // one-at-a-time semantics. Results are recorded in MODEL order either way.
    const TOOL_CONCURRENCY = 10;
    const parallelizable = (call: ParsedToolCall | undefined): boolean => {
      if (!call || !call.tool || call.input === undefined) return false;
      if (registry.get(call.tool)?.readOnly !== true) return false;
      return decideToolCall(opts.permissions, call.tool) === 'allow';
    };
    for (let callIdx = 0; callIdx < runEnd.toolCalls.length; callIdx++) {
      const call = runEnd.toolCalls[callIdx];
      if (!call) continue;
      if (opts.signal.aborted) return { outcome: 'aborted', inputChars, outputChars, turns };
      if (parallelizable(call)) {
        const run: ParsedToolCall[] = [];
        while (run.length < TOOL_CONCURRENCY && parallelizable(runEnd.toolCalls[callIdx + run.length])) {
          run.push(runEnd.toolCalls[callIdx + run.length] as ParsedToolCall);
        }
        // Text segments between the consumed blocks flush first, so the
        // transcript keeps stream order even though the calls overlapped.
        for (let k = 0; k < run.length; k++) {
          await flushText(runMarks[execIdx]?.at ?? clean.length);
          execIdx++;
        }
        const batch = run.map((c) => ({ call: c, callId: mintCallId() }));
        const settled = await Promise.all(
          batch.map((b) =>
            executeToolCall(registry, {
              tool: b.call.tool,
              input: b.call.input,
              permissions: opts.permissions,
              callId: b.callId,
              onEvent: forwardEvent,
            }),
          ),
        );
        for (let k = 0; k < batch.length; k++) {
          const b = batch[k] as { call: ParsedToolCall; callId: string };
          const outcome = settled[k];
          if (!outcome) continue;
          const resultId = b.call.nativeCallId ?? b.callId;
          if (outcome.outcome === 'ok') {
            await opts.store.append(
              opts.sessionId,
              toolRecord(b.callId, b.call.tool, { callId: b.callId, ok: true, result: outcome.result }, b.call.input),
            );
            pushResult(
              b.call,
              resultId,
              await formatModelResult(opts.cwd, b.call.tool, b.callId, outcome.result, registry.get(b.call.tool)?.maxResultSizeChars),
              false,
            );
          } else {
            // A gated batch cannot reach here through the normal path; if it
            // ever does, the call is reported honestly instead of vanishing.
            const code = outcome.outcome === 'error' ? outcome.code : outcome.outcome;
            const message =
              outcome.outcome === 'error' ? outcome.message : `Call was not executed (${outcome.outcome})`;
            await opts.store.append(
              opts.sessionId,
              toolRecord(b.callId, b.call.tool, { callId: b.callId, ok: false, code, message }, b.call.input),
            );
            pushResult(b.call, resultId, `ERROR ${code}: ${message}`, true);
          }
        }
        callIdx += run.length - 1;
        continue;
      }
      // Text-parsed calls consume stream marks in order; merged calls flush
      // whatever text remains, then run adjacency-ordered.
      if (execIdx < runMarks.length) {
        await flushText(runMarks[execIdx]?.at ?? clean.length);
      } else {
        await flushText(clean.length);
      }
      execIdx++;
      const callId = mintCallId();
      // REQ-118 FAZ B.2: native calls answer with the gateway id so the
      // next turn links `function_call_output`; text calls keep the mint.
      const resultId = call.nativeCallId ?? callId;
      if (!call.tool || call.input === undefined) {
        // Malformed block — honest error frame, no execution, no gate.
        const message = !call.tool ? 'Model emitted a <tool> block without a name' : `Model emitted invalid tool JSON: ${call.parseError ?? 'parse error'}`;
        opts.send({ type: 'tool_start', tool: call.tool || 'unknown', input: null, callId, sessionId: opts.sessionId });
        opts.send({ type: 'tool_result', callId, result: { code: 'bad_tool_block', message }, isError: true, sessionId: opts.sessionId });
        await opts.store.append(opts.sessionId, toolRecord(callId, call.tool || 'unknown', { callId, ok: false, code: 'bad_tool_block', message }, call.input));
        pushResult(call, resultId, `ERROR bad_tool_block: ${message}`, true);
        continue;
      }
      const outcome = await executeToolCall(registry, {
        tool: call.tool,
        input: call.input,
        permissions: opts.permissions,
        callId,
        onEvent: forwardEvent,
      });
      if (outcome.outcome === 'needs_approval') {
        opts.send({
          type: 'permission_request',
          requestId: outcome.requestId,
          tool: outcome.tool,
          description: outcome.description,
          sessionId: opts.sessionId,
        });
        let decision: ApprovalDecision;
        try {
          decision = await opts.waitApproval({ requestId: outcome.requestId, tool: outcome.tool, description: outcome.description });
        } catch (e) {
          if (e instanceof LoopAborted || opts.signal.aborted) return { outcome: 'aborted', inputChars, outputChars, turns };
          throw e;
        }
        if (decision === 'deny') {
          const result = { code: 'denied', message: `Denied by permissions: ${outcome.tool}` };
          opts.send({ type: 'tool_result', callId, result, isError: true, sessionId: opts.sessionId });
          await opts.store.append(opts.sessionId, toolRecord(callId, outcome.tool, { callId, ok: false, ...result }, call.input));
          pushResult(call, resultId, `ERROR denied: ${result.message}`, true);
        } else {
          const ran = await runApprovedCall(registry, { tool: outcome.tool, input: call.input, callId, onEvent: forwardEvent });
          if (ran.outcome === 'ok') {
            await opts.store.append(opts.sessionId, toolRecord(callId, outcome.tool, { callId, ok: true, result: ran.result }, call.input));
            pushResult(
              call,
              resultId,
              await formatModelResult(opts.cwd, outcome.tool, callId, ran.result, registry.get(outcome.tool)?.maxResultSizeChars),
              false,
            );
          } else {
            await opts.store.append(opts.sessionId, toolRecord(callId, outcome.tool, { callId, ok: false, code: ran.code, message: ran.message }, call.input));
            pushResult(call, resultId, `ERROR ${ran.code}: ${ran.message}`, true);
          }
        }
      } else if (outcome.outcome === 'denied') {
        // Gate refusal — no events, no execution (executor contract).
        const result = { code: 'denied', message: `Denied by permissions: ${outcome.tool}` };
        opts.send({ type: 'tool_result', callId, result, isError: true, sessionId: opts.sessionId });
        await opts.store.append(opts.sessionId, toolRecord(callId, outcome.tool, { callId, ok: false, ...result }, call.input));
        pushResult(call, resultId, `ERROR denied: ${result.message}`, true);
      } else if (outcome.outcome === 'ok') {
        await opts.store.append(opts.sessionId, toolRecord(callId, call.tool, { callId, ok: true, result: outcome.result }, call.input));
        pushResult(
          call,
          resultId,
          await formatModelResult(opts.cwd, call.tool, callId, outcome.result, registry.get(call.tool)?.maxResultSizeChars),
          false,
        );
      } else {
        await opts.store.append(opts.sessionId, toolRecord(callId, call.tool, { callId, ok: false, code: outcome.code, message: outcome.message }, call.input));
        pushResult(call, resultId, `ERROR ${outcome.code}: ${outcome.message}`, true);
      }
    }

    // REQ-122: trailing text after the last tool row belongs to this turn.
    await flushText(clean.length);

    // ── Questions (in model order) ──────────────────────────────────────────
    for (const ask of runEnd.asks) {
      if (opts.signal.aborted) return { outcome: 'aborted', inputChars, outputChars, turns };
      const requestId = mintCallId('ask');
      opts.send({
        type: 'ask_user_question',
        requestId,
        question: ask.question || '(the model asked an empty question)',
        choices: ask.choices,
        sessionId: opts.sessionId,
      });
      let answer: string;
      try {
        answer = await opts.waitAnswer({ requestId, question: ask.question, choices: ask.choices });
      } catch (e) {
        if (e instanceof LoopAborted || opts.signal.aborted) return { outcome: 'aborted', inputChars, outputChars, turns };
        throw e;
      }
      answers.push(`<answer question="${ask.question}">${answer}</answer>`);
    }

    if (results.length === 0 && answers.length === 0) {
      // REQ-116 FAZ A: explicit stop_reason verdict. tool_use/ask turns
      // always produce followUps above, so reaching here with calls means
      // an internal wiring break — but the observed invariant holds, and
      // the decision below documents the intended mapping either way.
      const decision = decideTurnEnd({
        toolCalls: runEnd.toolCalls.length,
        asks: runEnd.asks.length,
        cleanText: clean,
      });
      // REQ-071: the model went quiet with nothing done this turn. Once per
      // run, nudge it instead of calling the job complete (tool-then-silence
      // used to abandon real tasks: list_files ran, write_file never came).
      // A second quiet turn still means done — no poke loops.
      const quietTurn = decision === 'empty';
      if (quietTurn && turns < maxTurns && !nudgedQuiet) {
        nudgedQuiet = true;
        const nudge = '<system>You stopped without responding. Continue the user task now: emit the next <tool> block or write the answer.</system>';
        inputChars += nudge.length;
        messages.push({ role: 'user', content: nudge });
        continue;
      }
      return { outcome: 'complete', inputChars, outputChars, turns };
    }
    // ── Feed the results back (REQ-128) ─────────────────────────────────────
    // Claude-Code shape first: a turn whose calls arrived as gateway
    // function calls is replayed WITH its calls (`assistant.tool_calls[]`)
    // and answered by one `tool` row per result — the model sees the same
    // pairing it produced. Text-parsed calls in the same turn get synthetic
    // ids, because an unanswered call id is an instant upstream 400.
    const nativeTurn = results.some((r) => r.native !== undefined);
    if (nativeTurn) {
      const calls = results.map((r, i) => ({
        id: r.native?.id ?? `call_text_${turns}_${i}`,
        name: r.tool,
        arguments: r.native?.arguments ?? JSON.stringify(r.input ?? {}),
      }));
      inputChars += clean.length;
      messages.push({ role: 'assistant', content: clean, toolCalls: calls });
      results.forEach((r, i) => {
        const id = calls[i]?.id ?? `call_text_${turns}_${i}`;
        inputChars += r.body.length;
        messages.push({ role: 'tool', content: r.body, toolCallId: id, name: r.tool });
      });
      // Question answers stay plain conversation, after the tool pair.
      if (answers.length > 0) {
        const blob = answers.join('\n');
        inputChars += blob.length;
        messages.push({ role: 'user', content: blob });
      }
    } else {
      const followUp = [...results.map((r) => r.text), ...answers].join('\n');
      inputChars += followUp.length;
      messages.push({ role: 'user', content: followUp });
    }
  }

  // REQ-116 FAZ A: a maxed-out run leaves a machine-readable stop marker
  // in the transcript (`[run stopped: max_turns=N]`), not just a live
  // error frame a refresh can never catch.
  await opts.store.append(opts.sessionId, {
    role: 'assistant',
    content: `[run stopped: max_turns=${maxTurns}]`,
    timestamp: new Date().toISOString(),
  });
  opts.send({
    type: 'error',
    message: `Paused after ${maxTurns} tool turns with work still queued — say "continue" and I will pick up where I left off.`,
    code: 'turn_limit',
    sessionId: opts.sessionId,
  });
  return { outcome: 'complete', inputChars, outputChars, turns: maxTurns };
}
