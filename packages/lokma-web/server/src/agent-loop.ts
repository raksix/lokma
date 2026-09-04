import {
  buildBuiltinTools,
  buildToolSystemPrompt,
  createBlockFilter,
  executeToolCall,
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
  maxTurns?: number;
  turnTimeoutMs?: number;
};

export type AgentLoopResult = {
  outcome: 'complete' | 'aborted';
  inputChars: number;
  outputChars: number;
  turns: number;
};

export const LOOP_DEFAULT_MAX_TURNS = 5;
export const LOOP_DEFAULT_TURN_TIMEOUT_MS = 120_000;
/** Transcript window rebuilt as model history (newest-first cap). */
const HISTORY_MESSAGE_CAP = 20;
const HISTORY_CHAR_CAP = 24_000;

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
    let text: string;
    let role: ProviderMessage['role'];
    if (m.role === 'tool') {
      role = 'user';
      text = `<tool_result tool="${m.toolName ?? 'unknown'}" id="${m.toolCallId ?? ''}">${m.content}</tool_result>`;
    } else {
      role = m.role === 'assistant' ? 'assistant' : 'user';
      text = m.content;
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
  const system = buildToolSystemPrompt(registry.list().map((t) => ({ name: t.name, description: t.description })));

  const messages: ProviderMessage[] = [
    { role: 'system', content: system },
    ...opts.history,
    { role: 'user', content: opts.prompt },
  ];
  let inputChars = system.length + opts.prompt.length + opts.history.reduce((n, m) => n + m.content.length, 0);
  let outputChars = 0;
  let turns = 0;

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
      })) {
        if (chunk.type === 'text_delta') {
          const visible = filter.push(chunk.delta);
          if (visible) {
            clean += visible;
            opts.send({ type: 'text_delta', delta: visible, sessionId: opts.sessionId });
          }
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
      throw streamFailed;
    }

    const end = filter.finish();
    if (end.tail) {
      clean += end.tail;
      opts.send({ type: 'text_delta', delta: end.tail, sessionId: opts.sessionId });
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
      return { outcome: 'complete', inputChars, outputChars, turns };
    }
    const followUp = followUps.join('\n');
    inputChars += followUp.length;
    messages.push({ role: 'user', content: followUp });
  }

  opts.send({
    type: 'error',
    message: `Tool turn limit (${maxTurns}) reached — remaining calls skipped. Ask the model to continue if needed.`,
    code: 'turn_limit',
    sessionId: opts.sessionId,
  });
  return { outcome: 'complete', inputChars, outputChars, turns: maxTurns };
}
