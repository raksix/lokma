import { z } from 'zod';

/**
 * WebSocket protocol — same events for CLI (Ink) + Web (Fastify WS + Next.js).
 * The harness loop emits these; both surfaces render them.
 * See Docs/25-WEB-ROADMAP Phase 0 exit: two surfaces import same lokma-shared.
 */

// ─── Client → Server ───────────────────────────────────────────────────────
export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('prompt'),
    prompt: z.string(),
    sessionId: z.string().optional(),
    // Mid-session model override (persisted via PATCH /api/sessions/:id).
    model: z.string().optional(),
    // Workspace-relative `@file` mentions — the server reads these into context.
    contextPaths: z.array(z.string()).max(5).optional(),
  }),
  z.object({ type: z.literal('abort'), sessionId: z.string() }),
  z.object({ type: z.literal('permission_response'), requestId: z.string(), decision: z.enum(['allow', 'deny', 'always']) }),
  z.object({ type: z.literal('ask_response'), requestId: z.string(), answer: z.string() }),
  // Terminal pane (W3-10): stdin + resize + kill travel over the same
  // `/ws/:sessionId` socket; output comes back as `terminal/data|exit`.
  z.object({
    type: z.literal('terminal/input'),
    terminalId: z.string().min(1).max(64),
    data: z.string().max(64 * 1024),
  }),
  z.object({
    type: z.literal('terminal/resize'),
    terminalId: z.string().min(1).max(64),
    cols: z.number().int().min(1).max(500),
    rows: z.number().int().min(1).max(200),
  }),
  z.object({
    type: z.literal('terminal/kill'),
    terminalId: z.string().min(1).max(64),
  }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ─── Server → Client ───────────────────────────────────────────────────────
export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text_delta'), delta: z.string(), sessionId: z.string() }),
  z.object({ type: z.literal('tool_start'), tool: z.string(), input: z.unknown(), callId: z.string(), sessionId: z.string() }),
  z.object({ type: z.literal('tool_result'), callId: z.string(), result: z.unknown(), isError: z.boolean().default(false), sessionId: z.string() }),
  z.object({ type: z.literal('permission_request'), requestId: z.string(), tool: z.string(), description: z.string(), sessionId: z.string() }),
  z.object({ type: z.literal('ask_user_question'), requestId: z.string(), question: z.string(), choices: z.array(z.string()).optional(), sessionId: z.string() }),
  z.object({ type: z.literal('cost'), sessionId: z.string(), inputTokens: z.number(), outputTokens: z.number(), costUsd: z.number(), model: z.string() }),
  z.object({ type: z.literal('agent_state'), agentId: z.string(), state: z.string(), sessionId: z.string().optional() }),
  // Terminal pane (W3-10): live process output + exit, scoped to the
  // spawning session so tabs in other sessions never see each other's bytes.
  z.object({
    type: z.literal('terminal/data'),
    terminalId: z.string().min(1).max(64),
    data: z.string(),
    sessionId: z.string(),
  }),
  z.object({
    type: z.literal('terminal/exit'),
    terminalId: z.string().min(1).max(64),
    exitCode: z.number().int().nullable(),
    signal: z.string().nullable(),
    sessionId: z.string(),
  }),
  z.object({ type: z.literal('done'), sessionId: z.string(), reason: z.enum(['complete', 'aborted', 'error']).default('complete') }),
  z.object({ type: z.literal('error'), message: z.string(), code: z.string().optional(), sessionId: z.string().optional() }),
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Type-safe JSON stringify for WS send. */
export function encodeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg);
}

/** Parse + validate incoming client message. Returns null on invalid. */
export function decodeClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(raw);
    return ClientMessageSchema.parse(parsed);
  } catch {
    return null;
  }
}
