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
  messageCount: number;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};
