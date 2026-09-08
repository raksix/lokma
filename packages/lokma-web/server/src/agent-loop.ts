import {
  buildBuiltinTools,
  buildTodoTools,
  buildToolSystemPrompt,
  buildUiControlTools,
  createBlockFilter,
  executeToolCall,
  heartbeatSession,
  mintCallId,
  runApprovedCall,
  SessionStore,
  ToolRegistry,
  type SessionMessage,
  type ToolEvent,
} from 'lokma-core';
import { stream as aiStream, type ProviderMessage } from 'lokma-ai';
import type { Permissions, ServerMessage } from 'lokma-shared';

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
};

export type AgentLoopResult = {
  outcome: 'complete' | 'aborted';
  inputChars: number;
  outputChars: number;
  turns: number;
};

export const LOOP_DEFAULT_MAX_TURNS = 15;
export const LOOP_DEFAULT_TURN_TIMEOUT_MS = 120_000;
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

/**
 * Rebuild model history from the JSONL transcript. Tool rows become
 * user-role `<tool_result>` text (adapters map unknown roles safely);
 * oldest rows drop first past the caps. Pure — probe it directly.
 */
export function buildLoopHistory(messages: SessionMessage[]): ProviderMessage[] {
  const recent = messages.slice(-HISTORY_MESSAGE_CAP);
  const out: ProviderMessage[] = [];
  let chars = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (!m) continue;
    // REQ-071: the newest message always rides whole (it is the prompt being
    // answered); older rows are truncated per-role so giants cannot evict
    // the conversation the model is supposed to remember.
    const isNewest = i === recent.length - 1;
    let text: string;
    let role: ProviderMessage['role'];
    if (m.role === 'tool') {
      role = 'user';
      const body = isNewest ? m.content : truncateHistoryText(m.content, HISTORY_TOOL_TRUNC);
      text = `<tool_result tool="${m.toolName ?? 'unknown'}" id="${m.toolCallId ?? ''}">${body}</tool_result>`;
    } else {
      role = m.role === 'assistant' ? 'assistant' : 'user';
      text = isNewest ? m.content : truncateHistoryText(m.content, HISTORY_CHAT_TRUNC);
    }
    if (!text.trim()) continue;
    chars += text.length;
    if (chars > HISTORY_CHAR_CAP && out.length > 0) break;
    out.unshift({ role, content: text });
  }
  return out;
}

function toolRecord(callId: string, tool: string, record: unknown): SessionMessage {
  return {
    role: 'tool',
    content: JSON.stringify(record),
    timestamp: new Date().toISOString(),
    toolCallId: callId,
    toolName: tool,
  };
}

export async function runAgentLoop(opts: AgentLoopOpts): Promise<AgentLoopResult> {
  const maxTurns = opts.maxTurns ?? LOOP_DEFAULT_MAX_TURNS;
  const turnTimeoutMs = opts.turnTimeoutMs ?? LOOP_DEFAULT_TURN_TIMEOUT_MS;

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
    let streamFailed: unknown = null;
    try {
      for await (const chunk of aiStream({
        provider: opts.upstream.provider,
        model: opts.model,
        messages,
        apiKey: opts.upstream.apiKey,
        baseUrl: opts.upstream.baseUrl,
        signal: turnCtrl.signal,
        // REQ-038: session-stable routing id for upstreams that need it
        // (OpenCode Go 400s headerless calls).
        extraHeaders: { 'x-opencode-session': `lokma-${opts.sessionId}` },
      })) {
        if (chunk.type === 'text_delta') {
          const visible = filter.push(chunk.delta);
          if (visible) {
            clean += visible;
            opts.send({ type: 'text_delta', delta: visible, sessionId: opts.sessionId });
          }
        } else if (chunk.type === 'thinking_delta') {
          // REQ-050: reasoning streams straight through (never filtered,
          // never persisted as answer text).
          if (chunk.delta) opts.send({ type: 'thinking_delta', delta: chunk.delta, sessionId: opts.sessionId });
        } else if (chunk.type === 'done') {
          break;
        }
      }
    } catch (e) {
      streamFailed = e;
    } finally {
      clearTimeout(timer);
      opts.signal.removeEventListener('abort', onParentAbort);
    }
    if (streamFailed !== null) {
      if (opts.signal.aborted || turnCtrl.signal.aborted) {
        if (clean.trim()) {
          await opts.store.append(opts.sessionId, {
            role: 'assistant',
            content: clean,
            timestamp: new Date().toISOString(),
          });
        }
        return { outcome: 'aborted', inputChars, outputChars: outputChars + clean.length, turns };
      }
      // REQ-071: a dead upstream used to vanish without a trace (no frame a
      // refresh can catch, nothing in the transcript) — the user saw "sent,
      // nothing happened". Leave a short honest note in the transcript so
      // the failure is visible and retryable with context intact.
      const reason = streamFailed instanceof Error ? streamFailed.message : String(streamFailed);
      await opts.store.append(opts.sessionId, {
        role: 'assistant',
        content: `[run failed: ${reason.slice(0, 300)}]`,
        timestamp: new Date().toISOString(),
      });
      throw streamFailed;
    }

    const end = filter.finish();
    if (end.tail) {
      clean += end.tail;
      opts.send({ type: 'text_delta', delta: end.tail, sessionId: opts.sessionId });
    }
    // REQ-071: a first turn with no text, no tool calls and no questions is
    // an empty upstream reply, NOT a completed run — completing silently
    // shows "Response complete" with no response. Fail honestly instead
    // (the error path leaves a transcript note + toast); later quiet turns
    // still mean "tool work is done", preserving the tool-then-silence flow.
    if (turns === 1 && !clean.trim() && end.toolCalls.length === 0 && end.asks.length === 0) {
      await opts.store.append(opts.sessionId, {
        role: 'assistant',
        content: '[run failed: model returned an empty response — please retry the prompt]',
        timestamp: new Date().toISOString(),
      });
      throw new Error('Model returned an empty response — please retry the prompt');
    }
    outputChars += clean.length;
    if (clean.trim()) {
      await opts.store.append(opts.sessionId, {
        role: 'assistant',
        content: clean,
        timestamp: new Date().toISOString(),
      });
    }

    const followUps: string[] = [];

    // ── Tool calls (in model order, one at a time) ──────────────────────────
    for (const call of end.toolCalls) {
      if (opts.signal.aborted) return { outcome: 'aborted', inputChars, outputChars, turns };
      const callId = mintCallId();
      if (!call.tool || call.input === undefined) {
        // Malformed block — honest error frame, no execution, no gate.
        const message = !call.tool ? 'Model emitted a <tool> block without a name' : `Model emitted invalid tool JSON: ${call.parseError ?? 'parse error'}`;
        opts.send({ type: 'tool_start', tool: call.tool || 'unknown', input: null, callId, sessionId: opts.sessionId });
        opts.send({ type: 'tool_result', callId, result: { code: 'bad_tool_block', message }, isError: true, sessionId: opts.sessionId });
        await opts.store.append(opts.sessionId, toolRecord(callId, call.tool || 'unknown', { callId, ok: false, code: 'bad_tool_block', message }));
        followUps.push(`<tool_result tool="${call.tool || 'unknown'}" id="${callId}">ERROR bad_tool_block: ${message}</tool_result>`);
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
          await opts.store.append(opts.sessionId, toolRecord(callId, outcome.tool, { callId, ok: false, ...result }));
          followUps.push(`<tool_result tool="${outcome.tool}" id="${callId}">ERROR denied: ${result.message}</tool_result>`);
        } else {
          const ran = await runApprovedCall(registry, { tool: outcome.tool, input: call.input, callId, onEvent: forwardEvent });
          if (ran.outcome === 'ok') {
            await opts.store.append(opts.sessionId, toolRecord(callId, outcome.tool, { callId, ok: true, result: ran.result }));
            followUps.push(`<tool_result tool="${outcome.tool}" id="${callId}">${JSON.stringify(ran.result)}</tool_result>`);
          } else {
            await opts.store.append(opts.sessionId, toolRecord(callId, outcome.tool, { callId, ok: false, code: ran.code, message: ran.message }));
            followUps.push(`<tool_result tool="${outcome.tool}" id="${callId}">ERROR ${ran.code}: ${ran.message}</tool_result>`);
          }
        }
      } else if (outcome.outcome === 'denied') {
        // Gate refusal — no events, no execution (executor contract).
        const result = { code: 'denied', message: `Denied by permissions: ${outcome.tool}` };
        opts.send({ type: 'tool_result', callId, result, isError: true, sessionId: opts.sessionId });
        await opts.store.append(opts.sessionId, toolRecord(callId, outcome.tool, { callId, ok: false, ...result }));
        followUps.push(`<tool_result tool="${outcome.tool}" id="${callId}">ERROR denied: ${result.message}</tool_result>`);
      } else if (outcome.outcome === 'ok') {
        await opts.store.append(opts.sessionId, toolRecord(callId, call.tool, { callId, ok: true, result: outcome.result }));
        followUps.push(`<tool_result tool="${call.tool}" id="${callId}">${JSON.stringify(outcome.result)}</tool_result>`);
      } else {
        await opts.store.append(opts.sessionId, toolRecord(callId, call.tool, { callId, ok: false, code: outcome.code, message: outcome.message }));
        followUps.push(`<tool_result tool="${call.tool}" id="${callId}">ERROR ${outcome.code}: ${outcome.message}</tool_result>`);
      }
    }

    // ── Questions (in model order) ──────────────────────────────────────────
    for (const ask of end.asks) {
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
      followUps.push(`<answer question="${ask.question}">${answer}</answer>`);
    }

    if (followUps.length === 0) {
      // REQ-071: the model went quiet with nothing done this turn. Once per
      // run, nudge it instead of calling the job complete (tool-then-silence
      // used to abandon real tasks: list_files ran, write_file never came).
      // A second quiet turn still means done — no poke loops.
      const quietTurn = !clean.trim() && end.toolCalls.length === 0 && end.asks.length === 0;
      if (quietTurn && turns < maxTurns && !nudgedQuiet) {
        nudgedQuiet = true;
        const nudge = '<system>You stopped without responding. Continue the user task now: emit the next <tool> block or write the answer.</system>';
        inputChars += nudge.length;
        messages.push({ role: 'user', content: nudge });
        continue;
      }
      return { outcome: 'complete', inputChars, outputChars, turns };
    }
    const followUp = followUps.join('\n');
    inputChars += followUp.length;
    messages.push({ role: 'user', content: followUp });
  }

  opts.send({
    type: 'error',
    message: `Paused after ${maxTurns} tool turns with work still queued — say "continue" and I will pick up where I left off.`,
    code: 'turn_limit',
    sessionId: opts.sessionId,
  });
  return { outcome: 'complete', inputChars, outputChars, turns: maxTurns };
}
