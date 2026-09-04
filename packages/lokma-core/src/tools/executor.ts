import { randomBytes } from 'node:crypto';
import type { Permissions } from 'lokma-shared';
import { decideToolCall, describeToolCall } from './gate.js';
import type { ToolRegistry } from './registry.js';

/**
 * Tool executor — gate → emit → run, the single path every agent tool call
 * takes (CLI loop and the WS handler will both call this; same events,
 * same permission checks). Events mirror the `lokma-shared` WS frames
 * (`tool_start` / `tool_result` / `permission_request`) so the server can
 * forward them without reshaping.
 * See Docs/30 §agent tools + Docs/22 §permissions.
 */

/** Results bigger than this are returned as a capped preview (never guessed). */
export const TOOL_RESULT_PREVIEW_CAP = 128 * 1024;

export type ToolEvent =
  | { type: 'tool_start'; tool: string; input: unknown; callId: string }
  | { type: 'tool_result'; callId: string; result: unknown; isError: boolean }
  | { type: 'permission_request'; requestId: string; tool: string; description: string };

export type ToolOutcome =
  | { outcome: 'ok'; callId: string; result: unknown }
  | { outcome: 'error'; callId: string; code: string; message: string }
  | { outcome: 'denied'; callId: string; tool: string }
  | { outcome: 'needs_approval'; callId: string; requestId: string; tool: string; description: string };

export type ExecuteToolOpts = {
  tool: string;
  input: unknown;
  /** Registry ctx (reserved for per-agent scoping — builtins ignore it). */
  ctx?: unknown;
  permissions?: Pick<Permissions, 'allow' | 'deny' | 'defaultMode'> | undefined | null;
  callId?: string;
  onEvent?: (event: ToolEvent) => void;
};

export function mintCallId(prefix = 't'): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function errorOf(e: unknown): { code: string; message: string } {
  // Core helpers throw typed errors (`FileError.code`); anything else is an
  // execution failure with the real message (never a placeholder).
  const err = e as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof err?.code === 'string' && err.code ? err.code : 'tool_failed';
  const message = e instanceof Error ? e.message : String(e);
  return { code, message };
}

/** Cap huge results so one `read_file` cannot flood the socket. */
export function capToolResult(result: unknown): { result: unknown; truncated: boolean } {
  let json: string;
  try {
    json = JSON.stringify(result) ?? 'null';
  } catch {
    return { result: { unserializable: true }, truncated: true };
  }
  if (json.length <= TOOL_RESULT_PREVIEW_CAP) return { result, truncated: false };
  return {
    result: { truncated: true, bytes: json.length, preview: json.slice(0, TOOL_RESULT_PREVIEW_CAP) },
    truncated: true,
  };
}

/**
 * Run an already-approved call: emit `tool_start`, execute, emit
 * `tool_result`, return the outcome. Used directly for gate-allowed calls
 * (via `executeToolCall`) and after the user answers a `permission_request`
 * with allow/always (via `runApprovedCall`).
 */
export async function runApprovedCall(
  registry: ToolRegistry,
  opts: { tool: string; input: unknown; ctx?: unknown; callId?: string; onEvent?: (event: ToolEvent) => void },
): Promise<Extract<ToolOutcome, { outcome: 'ok' | 'error' }>> {
  const callId = opts.callId ?? mintCallId();
  opts.onEvent?.({ type: 'tool_start', tool: opts.tool, input: opts.input, callId });
  try {
    const raw = await registry.call(opts.tool, opts.input, opts.ctx);
    const { result } = capToolResult(raw);
    opts.onEvent?.({ type: 'tool_result', callId, result, isError: false });
    return { outcome: 'ok', callId, result };
  } catch (e) {
    const { code, message } = errorOf(e);
    opts.onEvent?.({ type: 'tool_result', callId, result: { code, message }, isError: true });
    return { outcome: 'error', callId, code, message };
  }
}

/**
 * Full gated path: unknown tool → error; gate deny → denied (no events, no
 * execution); gate ask → needs_approval (the caller emits
 * `permission_request` and resumes with `runApprovedCall` on allow/always);
 * gate allow → `runApprovedCall` immediately.
 */
export async function executeToolCall(registry: ToolRegistry, opts: ExecuteToolOpts): Promise<ToolOutcome> {
  const callId = opts.callId ?? mintCallId();
  if (!registry.get(opts.tool)) {
    return { outcome: 'error', callId, code: 'unknown_tool', message: `Unknown tool: ${opts.tool}` };
  }
  const gate = decideToolCall(opts.permissions, opts.tool);
  if (gate === 'deny') {
    return { outcome: 'denied', callId, tool: opts.tool };
  }
  if (gate === 'ask') {
    const description = describeToolCall(opts.tool, opts.input);
    return { outcome: 'needs_approval', callId, requestId: `perm_${callId}`, tool: opts.tool, description };
  }
  return runApprovedCall(registry, { tool: opts.tool, input: opts.input, ctx: opts.ctx, callId, onEvent: opts.onEvent });
}
