import { z } from 'zod';

/**
 * WebSocket protocol — same events for CLI (Ink) + Web (Fastify WS + Next.js).
 * The harness loop emits these; both surfaces render them.
 * See Docs/25-WEB-ROADMAP Phase 0 exit: two surfaces import same lokma-shared.
 */

// ─── Client → Server ───────────────────────────────────────────────────────

/**
 * REQ-133: composer-level thinking budget. `off` (or absent) puts no
 * reasoning field on the upstream request; the rest map per adapter to
 * `reasoning_effort` (OpenAI-compatible) or `thinking.budget_tokens`
 * (Anthropic). Kept as one shared union so the client picker, the wire
 * schema and the adapters cannot drift apart.
 */
/**
 * REQ-139 — the reasoning ladder, mirroring Hermes' `EFFORT_LADDER`.
 *
 * One shared vocabulary, wider than any single wire accepts; each adapter
 * clamps the pick down to the nearest level its model supports instead of the
 * composer having to know per-model capabilities. `off` is not a wire level:
 * it means "send no reasoning field at all".
 */
export const REASONING_EFFORTS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** The ladder without `off`, weakest → strongest (clamping order). */
export const REASONING_LADDER = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ActiveReasoningEffort = (typeof REASONING_LADDER)[number];

/**
 * REQ-149 — session data rides the socket.
 *
 * The session list and the chat transcript used to arrive over REST (with a
 * 4 s sidebar poll for liveness). These wire rows are the payload of the
 * `sessions` / `transcript` / `transcript_append` frames, so the client can
 * request data over WS and let the server PUSH every row it appends. The
 * REST endpoints stay for CLI/curl callers (backward compatible).
 */
export const SESSION_ROLES = ['user', 'assistant', 'tool', 'thinking'] as const;

/** One chat attachment on a transcript row (mirrors lokma-core `SessionAttachment`). */
export const SessionAttachmentSchema = z.object({
  path: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
});
export type SessionAttachment = z.infer<typeof SessionAttachmentSchema>;

/**
 * REQ-186 — one user-attached image riding a `prompt` frame.
 *
 * The composer downscales + JPEG-encodes in the browser and ships the raw
 * base64 payload (no `data:` prefix — `ProviderImage` shape verbatim), so the
 * server can hand the same bytes to the provider without a second decode.
 * Caps are hard: `MAX` entries per prompt and a per-image char budget that
 * keeps the whole frame under the WS `maxPayload`.
 */
export const PROMPT_MAX_IMAGES = 6;
/** ~1.5 MB binary per image (base64 is ~4/3 of the payload). */
export const PROMPT_IMAGE_BASE64_CHARS = 2_000_000;

export const PromptImageSchema = z.object({
  name: z.string().min(1).max(200),
  mime: z.string().min(1).max(80),
  dataBase64: z.string().min(1).max(PROMPT_IMAGE_BASE64_CHARS),
});
export type PromptImage = z.infer<typeof PromptImageSchema>;

/**
 * REQ-187 — one user-attached TEXT file riding a `prompt` frame.
 *
 * The composer reads the file in the browser (text files directly; PDFs via
 * the server's extract endpoint) and ships the capped content, so the server
 * can hand the model a labeled `<file>` block without touching the user's
 * disk again. Caps are hard: `MAX` entries per prompt and a per-file content
 * budget (the composer appends a `[truncated …]` marker, hence the slack).
 */
export const PROMPT_MAX_FILES = 10;
/** Per-file inline content budget (chars) — the composer truncates beyond it. */
export const PROMPT_FILE_CHAR_CAP = 100_000;
/** Slack above the cap for the truncation marker the composer appends. */
export const PROMPT_FILE_CHAR_SLACK = 2_000;

export const PromptFileSchema = z.object({
  name: z.string().min(1).max(200),
  mime: z.string().min(1).max(120),
  size: z.number().int().min(0),
  content: z.string().max(PROMPT_FILE_CHAR_CAP + PROMPT_FILE_CHAR_SLACK),
});
export type PromptFile = z.infer<typeof PromptFileSchema>;

/** One persisted transcript line (mirrors `SessionMessage` in lokma-core). */
export const TranscriptRowSchema = z.object({
  role: z.enum(SESSION_ROLES),
  content: z.string(),
  timestamp: z.string(),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
  /** REQ-155: agent-sent files — images inline, other files become cards. */
  attachments: z.array(SessionAttachmentSchema).optional(),
  /**
   * REQ-186: images the user attached to this prompt — the socket is the
   * chat's primary source after a reload, so dropping them here would make
   * every sent image vanish on refresh (same trap as `attachments`).
   */
  images: z.array(PromptImageSchema).optional(),
  /**
   * REQ-187: files the user attached to this prompt — text content only
   * (images ride `images`, REQ-186). The server stores them on the user row
   * and assembles labeled `<file>` blocks for the model.
   */
  files: z.array(PromptFileSchema).optional(),
});
export type TranscriptRow = z.infer<typeof TranscriptRowSchema>;

/** One sidebar row (mirrors `SessionSummary` in lokma-core). */
export const SessionRowSchema = z.object({
  id: z.string(),
  cwd: z.string(),
  title: z.string(),
  renamed: z.boolean(),
  model: z.string().nullable(),
  botId: z.string().nullable(),
  messageCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  ownerId: z.string().nullable(),
  /**
   * REQ-121/REQ-149: live run flags ride the list rows, so a socket-fed
   * sidebar keeps the working-session badges the REST list carries.
   */
  running: z.boolean().optional(),
  queued: z.number().int().min(0).optional(),
});
export type SessionRow = z.infer<typeof SessionRowSchema>;

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('prompt'),
    prompt: z.string(),
    sessionId: z.string().optional(),
    // Mid-session model override (persisted via PATCH /api/sessions/:id).
    model: z.string().optional(),
    // Workspace-relative `@file` mentions — the server reads these into context.
    contextPaths: z.array(z.string()).max(5).optional(),
    // Thinking budget for this prompt (REQ-133).
    reasoningEffort: z.enum(REASONING_EFFORTS).optional(),
    // REQ-186: attached images as real bytes — the server stores them on the
    // user row and the adapters emit them as content parts next to the text.
    images: z.array(PromptImageSchema).max(PROMPT_MAX_IMAGES).optional(),
    // REQ-187: attached text files (content read + capped in the browser) —
    // the server stores them on the user row and assembles `<file>` blocks
    // for the model.
    files: z.array(PromptFileSchema).max(PROMPT_MAX_FILES).optional(),
  }),
  z.object({ type: z.literal('abort'), sessionId: z.string() }),
  z.object({ type: z.literal('permission_response'), requestId: z.string(), decision: z.enum(['allow', 'deny', 'always']) }),
  z.object({ type: z.literal('ask_response'), requestId: z.string(), answer: z.string() }),
  // REQ-182: the open_project modal answers the agent's call — 'done' (the
  // user confirmed, or no UI was attached to ask) or 'cancelled' (the user
  // dismissed it). Keyed by the frame's actionId; resolves the pending
  // project gate so the tool result carries the outcome the user chose.
  z.object({
    type: z.literal('project_ack'),
    actionId: z.string().min(1).max(64),
    outcome: z.enum(['done', 'cancelled']),
  }),
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
  // REQ-149: session data over the socket. `sessions_list` asks for the
  // sidebar rows (the socket also becomes a live subscriber), and
  // `transcript_get` asks for one session's history. Answers arrive as the
  // `sessions` / `transcript` frames; growth is PUSHED as `transcript_append`.
  z.object({ type: z.literal('sessions_list') }),
  z.object({
    type: z.literal('transcript_get'),
    sessionId: z.string().min(1).max(128),
  }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ─── Server → Client ───────────────────────────────────────────────────────
export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text_delta'), delta: z.string(), sessionId: z.string() }),
  // REQ-050: live reasoning stream (Claude-Code style thinking block).
  z.object({ type: z.literal('thinking_delta'), delta: z.string(), sessionId: z.string() }),
  // REQ-077: auto-retry notice — stream died, waiting waitMs then trying
  // again (attempt of maxAttempts). Never persisted; toast/badge only.
  z.object({
    type: z.literal('retry_notice'),
    attempt: z.number().int().min(1),
    maxAttempts: z.number().int().min(1),
    waitMs: z.number().int().min(0),
    message: z.string().max(300),
    sessionId: z.string(),
  }),
  z.object({ type: z.literal('tool_start'), tool: z.string(), input: z.unknown(), callId: z.string(), sessionId: z.string() }),
  z.object({ type: z.literal('tool_result'), callId: z.string(), result: z.unknown(), isError: z.boolean().default(false), sessionId: z.string() }),
  z.object({ type: z.literal('permission_request'), requestId: z.string(), tool: z.string(), description: z.string(), sessionId: z.string() }),
  z.object({ type: z.literal('ask_user_question'), requestId: z.string(), question: z.string(), choices: z.array(z.string()).optional(), sessionId: z.string() }),
  z.object({
    type: z.literal('cost'),
    sessionId: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    costUsd: z.number(),
    model: z.string(),
    /**
     * REQ-174: the thinking level this run forwarded to the adapter (`off`
     * when none). Rides the cost frame so the run meta line can show it —
     * optional, because engine-driven runs (claude-code) emit no level.
     */
    reasoningEffort: z.enum(REASONING_EFFORTS).optional(),
  }),
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
  // REQ-057: the agent loop drives the Web UI surface (browser / terminal /
  // session panes) through the same socket. Tools run server-side AND emit
  // one of these so every connected client opens/focuses the matching pane —
  // the user sees exactly what the agent did, live.
  // REQ-180: `open_project` carries the registered project id + its cwd
  // beside the fresh session id (`targetSessionId`).
  z.object({
    type: z.literal('ui_action'),
    actionId: z.string().min(1).max(64),
    action: z.enum(['open_browser', 'open_terminal', 'open_session', 'send_to_session', 'open_project']),
    url: z.string().max(2048).optional(),
    tabId: z.string().max(64).optional(),
    terminalId: z.string().max(64).optional(),
    targetSessionId: z.string().max(128).optional(),
    prompt: z.string().max(8000).optional(),
    projectId: z.string().max(64).optional(),
    cwd: z.string().max(500).optional(),
    // REQ-182: display name so the confirmation modal/toast needs no refetch.
    projectName: z.string().max(60).optional(),
    sessionId: z.string(),
  }),
  // REQ-149: answers to `sessions_list` / `transcript_get` and the live
  // push for every row the server appends. `transcript` is a full snapshot
  // (open + reconnect catch-up), `transcript_append` is one new row — the
  // client never needs the 4 s REST poll to see growth.
  z.object({ type: z.literal('sessions'), sessions: z.array(SessionRowSchema) }),
  z.object({
    type: z.literal('transcript'),
    sessionId: z.string(),
    messages: z.array(TranscriptRowSchema),
  }),
  z.object({
    type: z.literal('transcript_append'),
    sessionId: z.string(),
    message: TranscriptRowSchema,
  }),
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
