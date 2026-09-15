import { z } from 'zod';
import { FileError, WorkspaceFiles } from '../files/files.js';
import { SessionStore } from '../session/store.js';
import type { SessionAttachment } from '../session/types.js';
import type { ToolDefinition } from './registry.js';

/**
 * Chat attachments (REQ-155) — the agent pushes a workspace file into the
 * conversation as a real transcript row: images render inline (the web pulls
 * bytes through the authed `/api/files/raw` route), everything else becomes a
 * download card. Rows persist like any message and the store's append feed
 * paints them live on open sockets (REQ-149), so a delivery needs no extra
 * frame.
 *
 * Paths are jailed by `WorkspaceFiles` (same jail as every file tool) and
 * capped at `CHAT_ATTACHMENT_MAX_BYTES`; failures answer with honest codes —
 * the model never claims a delivery that did not land.
 */

/** Chat delivery cap per file (raw preview caps at 10 MB; this is the send cap). */
export const CHAT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Fixed extension map — mirrors the `/api/files/raw` MIME map (never probes
 * content). Unknown extensions become `application/octet-stream` (file card).
 */
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  log: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
  zip: 'application/zip',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

export function mimeForFile(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/** Images render inline in the chat; everything else is a download card. */
export function isInlinePreviewable(mime: string): boolean {
  return mime.startsWith('image/');
}

/** Typed failure — tools map `code`/`message` straight into the result object. */
export class ChatFileError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ChatFileError';
    this.code = code;
  }
}

/**
 * Deliver one workspace file to the session chat.
 * Validates (jail + existence + size) FIRST, then appends the assistant row
 * with the attachment. Throws `ChatFileError` on any refusal.
 */
export async function deliverAttachment(
  cwd: string,
  sessionId: string,
  opts: { path: string; caption?: string },
): Promise<{ attachment: SessionAttachment; caption: string }> {
  let raw: { path: string; bytes: Buffer; size: number };
  try {
    raw = await new WorkspaceFiles(cwd).readRaw(opts.path, CHAT_ATTACHMENT_MAX_BYTES);
  } catch (e) {
    if (e instanceof FileError) throw new ChatFileError(e.code, e.message);
    throw new ChatFileError('file_unreadable', e instanceof Error ? e.message : String(e));
  }
  const rel = raw.path;
  const name = rel.split('/').pop() ?? rel;
  const attachment: SessionAttachment = {
    path: rel,
    name,
    mime: mimeForFile(name),
    size: raw.size,
  };
  const caption = (opts.caption ?? '').trim() || `Attached: ${name}`;
  const store = new SessionStore(cwd);
  await store.append(sessionId, {
    role: 'assistant',
    content: caption,
    timestamp: new Date().toISOString(),
    attachments: [attachment],
  });
  return { attachment, caption };
}

const SendFileInput = z.object({
  path: z.string().min(1).max(500),
  caption: z.string().max(300).optional(),
});

/**
 * Build the chat-delivery tool for one session. `send_file` takes a
 * workspace-relative path (or `@file`-style path the user named) and puts the
 * file into the chat; the result tells the model whether it landed.
 */
export function buildAttachmentTools(cwd: string, opts: { sessionId: string }): ToolDefinition[] {
  return [
    {
      name: 'send_file',
      description:
        'Send a workspace file to the chat as an attachment — images render inline, other files become a download card. Use when the user asks to receive a file or image (e.g. after browser_screenshot). Path is relative to the workspace.',
      inputSchema: SendFileInput,
      readOnly: false,
      handler: async (input) => {
        const { path, caption } = input as z.infer<typeof SendFileInput>;
        try {
          const { attachment } = await deliverAttachment(
            cwd,
            opts.sessionId,
            caption === undefined ? { path } : { path, caption },
          );
          return {
            ok: true,
            delivered: true,
            name: attachment.name,
            path: attachment.path,
            mime: attachment.mime,
            size: attachment.size,
            note: 'The file is visible in the chat now.',
          };
        } catch (e) {
          if (e instanceof ChatFileError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
  ];
}

/** Names only — cheap index for tests + gates. */
export const ATTACHMENT_TOOL_NAMES = ['send_file'] as const;
