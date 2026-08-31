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
};

export type Session = {
  meta: SessionMeta;
  messages: SessionMessage[];
};
