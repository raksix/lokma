/**
 * Session types — JSONL transcript is the source of truth.
 * Same files for CLI (`lokma --resume <id>`) and Web (`WS /ws/:sessionId` replay).
 * See Docs/22-WEB-FEATURES §sessions and Docs/26 CONFIG projects/<hash>.
 */

export type SessionMessage = {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string; // ISO
  toolCallId?: string;
  toolName?: string;
};

export type SessionMeta = {
  id: string;
  cwd: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  /** Human label for the session list (set via rename; falls back to first user line). */
  title?: string;
  /**
   * Owner user id (REQ-062 Parça B, REQ-064): stamped by POST /api/sessions
   * from the caller token. `calisan` users list/read only their own
   * sessions; admin/superadmin see all. Absent (legacy/anonymous) means
   * unattributed — visible to every project member, never hidden.
   */
  ownerId?: string;
  /**
   * Bot binding for Grok-style bot chats (REQ-027, Docs/35 §8): when set,
   * prompts in this session run with the bot's model + systemPrompt +
   * knowledge injected. A per-prompt `model` override still wins for that
   * turn; clearing the binding (empty string) returns to plain chat.
   */
  botId?: string;
  /**
   * Headless Claude session handle for `claude-code/*` runs (REQ-116
   * FAZ D-continuity): the engine's own `session_id` from the `result`
   * event, mirrored here so the next turn resumes it via `--resume`.
   * Empty clears (fresh engine session next turn); forks never inherit
   * it (writeMeta only carries it on explicit patch).
   */
  claudeSessionId?: string;
};

export type Session = {
  meta: SessionMeta;
  messages: SessionMessage[];
};

/**
 * List summary for the session sidebar — one row per session.
 * Served by `GET /api/sessions`, consumed by the web Sessions pane.
 */
export type SessionSummary = {
  id: string;
  cwd: string;
  title: string;
  /** True when the title was set via rename (vs derived from transcript). */
  renamed: boolean;
  model: string | null;
  /**
   * Bot binding id for Grok-style bot chats (REQ-027) — null when the
   * session is plain chat. The client resolves the display name from the
   * bot registry (no core→bots import, no cycle).
   */
  botId: string | null;
  messageCount: number;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /**
   * Owner user id (REQ-062 Parça B) — null for legacy/anonymous sessions.
   * The server filters this list for `calisan` callers (own-only).
   */
  ownerId: string | null;
};
