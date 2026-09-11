import { mkdir, writeFile } from 'node:fs/promises';
import type { ProviderMessage } from '@lokma/ai';
import {
  emptyResultPlaceholder,
  isEmptyResultText,
  persistedOutputEnvelope,
  previewCut,
  resultBudget,
  resultOverBudget,
  resultToText,
  spillPathFor,
  spillResult,
} from './result-budget.js';

/**
 * One call's result, ready to hand back to the model (REQ-128).
 *
 * Both loops (Web WS + CLI TUI) build these and let `feedBackResults()` turn
 * them into provider messages — one implementation of the tool→model wire
 * shape, so a fix here lands in both front-ends (the same DRY rule the
 * registry follows).
 */
export type ToolResultCarrier = {
  tool: string;
  input: unknown;
  /** Text-mode payload: the full `<tool_result …>body</tool_result>` block. */
  text: string;
  /** Native-mode payload: the bare result body (the call id already links it). */
  body: string;
  isError: boolean;
  /** Present when the call arrived as a gateway function call. */
  native?: { id: string; name: string; arguments: string };
};

/** Build the carrier for one executed call. */
export function toolResultCarrier(args: {
  tool: string;
  input: unknown;
  /** Id the text-mode blob carries (gateway id or the minted execution id). */
  resultId: string;
  body: string;
  isError: boolean;
  /** Gateway call id — set only for native calls. */
  nativeCallId?: string;
  /** Raw argument json the gateway streamed (replayed byte-identical). */
  nativeArgs?: string;
}): ToolResultCarrier {
  const tool = args.tool || 'unknown';
  const nativeId = typeof args.nativeCallId === 'string' ? args.nativeCallId.trim() : '';
  const nativeArgs = typeof args.nativeArgs === 'string' && args.nativeArgs.trim() ? args.nativeArgs : '';
  return {
    tool,
    input: args.input,
    text: `<tool_result tool="${tool}" id="${args.resultId}">${args.body}</tool_result>`,
    body: args.body,
    isError: args.isError,
    ...(nativeId
      ? {
          native: {
            id: nativeId,
            name: tool,
            arguments: nativeArgs || JSON.stringify(args.input ?? {}),
          },
        }
      : {}),
  };
}

/**
 * Append one turn's results to the provider conversation.
 *
 * A turn whose calls arrived as gateway function calls is replayed the way
 * Claude Code does it — the assistant row keeps its `tool_calls[]` and each
 * result answers with a `tool` row carrying the bare body. Text-parsed calls
 * in the same turn get synthetic ids, because an unanswered call id is an
 * instant upstream 400. A purely text turn keeps the single `<tool_result>`
 * user blob every upstream reads. Question answers always ride as plain
 * conversation, after the pair.
 */
export function feedBackResults(
  messages: ProviderMessage[],
  args: {
    results: ToolResultCarrier[];
    answers: string[];
    /** Visible assistant text of the turn (empty for a silent tool turn). */
    assistantText: string;
    /** Current turn number — only used to keep synthetic ids unique. */
    turn: number;
  },
): void {
  const { results, answers, assistantText, turn } = args;
  const nativeTurn = results.some((r) => r.native !== undefined);
  if (nativeTurn) {
    const calls = results.map((r, i) => ({
      id: r.native?.id ?? `call_text_${turn}_${i}`,
      name: r.tool,
      arguments: r.native?.arguments ?? JSON.stringify(r.input ?? {}),
    }));
    messages.push({ role: 'assistant', content: assistantText, toolCalls: calls });
    results.forEach((r, i) => {
      messages.push({
        role: 'tool',
        content: r.body,
        toolCallId: calls[i]?.id ?? `call_text_${turn}_${i}`,
        name: r.tool,
      });
    });
    if (answers.length > 0) messages.push({ role: 'user', content: answers.join('\n') });
    return;
  }
  const blob = [...results.map((r) => r.text), ...answers].join('\n');
  if (blob.trim()) messages.push({ role: 'user', content: blob });
}

/**
 * What the model actually reads for one tool result: the payload, or — when
 * it exceeds the tool's budget — a `<persisted-output>` envelope after the
 * full text is spilled to `.lokma/tool-results/` inside the workspace (so
 * the agent can read the rest itself). Empty results get an explicit
 * placeholder rather than an ambiguous empty string. Best-effort: if the
 * spill write fails, a capped preview still goes out. Tools that already cap
 * their own payload (`read_file`) declare `TOOL_RESULT_NO_SPILL` and bypass
 * this path entirely — spilling a read would invite the model to read back
 * a file that is itself over budget, forever.
 */
export async function formatToolResult(args: {
  cwd: string;
  tool: string;
  callId: string;
  result: unknown;
  declaredBudget?: number;
}): Promise<string> {
  const text = resultToText(args.result);
  if (isEmptyResultText(text)) return emptyResultPlaceholder(args.tool);
  const budget = resultBudget(args.declaredBudget);
  if (!resultOverBudget(text, budget)) return text;
  let rel: string;
  try {
    rel = await spillResult(
      { cwd: args.cwd, callId: args.callId, text },
      {
        mkdirp: async (dir: string) => {
          await mkdir(dir, { recursive: true });
        },
        write: async (file: string, body: string) => {
          // 'wx' — never clobber an earlier spill (Claude Code does the same).
          await writeFile(file, body, { encoding: 'utf8', flag: 'wx' });
        },
      },
    );
  } catch {
    rel = spillPathFor(args.callId);
  }
  const { preview, hasMore } = previewCut(text);
  return persistedOutputEnvelope({ originalChars: text.length, path: rel, preview, hasMore });
}
