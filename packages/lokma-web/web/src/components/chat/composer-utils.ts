/**
 * Composer pure helpers — mention/slash parsing for the chat Composer.
 * No React, no DOM: covered by `chat.test.ts` (`bun src/components/chat/chat.test.ts`).
 */

/** One `@path` mention inside the composer text. */
export type Mention = { path: string; start: number; end: number };

const MENTION_PATTERN = /@([A-Za-z0-9_][A-Za-z0-9_./-]*)/g;

/** Extract `@path` mentions (workspace-relative file references). */
export function parseMentions(text: string): Mention[] {
  const out: Mention[] = [];
  MENTION_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_PATTERN.exec(text)) !== null) {
    out.push({ path: m[1], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** Remove the first `@path` occurrence from the text (chip dismiss). */
export function removeMention(text: string, path: string): string {
  const mentions = parseMentions(text);
  const hit = mentions.find((m) => m.path === path);
  if (!hit) return text;
  return `${text.slice(0, hit.start)}${text.slice(hit.end)}`.replace(/ {2,}/g, ' ').trim();
}

/** Parsed `/command args` line (null when the text is not a slash command). */
export type SlashInvocation = { id: string; args: string };

/** Parse a `/command args` line — command lookup happens against GET /api/commands. */
export function parseSlashCommand(text: string): SlashInvocation | null {
  const line = text.trim();
  if (!line.startsWith('/')) return null;
  const space = line.indexOf(' ');
  if (space === -1) return { id: line.slice(1).toLowerCase(), args: '' };
  return { id: line.slice(1, space).toLowerCase(), args: line.slice(space + 1).trim() };
}

/** True while the user is still typing a `/cmd` prefix (palette should show). */
export function isSlashPrefix(text: string): boolean {
  if (!text.startsWith('/')) return false;
  const firstLine = text.split('\n')[0];
  return !firstLine.includes(' ');
}

/** Time-of-day greeting for the empty-state hero (no hardcoded persona name). */
export function timeGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 6) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Image extensions accepted as composer attachments (thumbnail + marker). */
export const IMAGE_ATTACH_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
]);

/** True when a dropped/pasted file should take the image path (not text-inline). */
export function isImageAttachment(name: string, mime: string): boolean {
  if (mime.startsWith('image/')) return true;
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot).toLowerCase();
  return IMAGE_ATTACH_EXTENSIONS.has(ext);
}

/** True when a drag event carries OS-level files (vs explorer @path/text drags). */
export function hasOsFiles(types: ReadonlyArray<string>): boolean {
  return types.includes('Files');
}

/** Compact `[image attached: …]` marker for an image riding a prompt (REQ-186). */
export function formatImageMarker(name: string, dims: string, sizeKb: number, scaledFrom?: string): string {
  const note = scaledFrom ? ` — downscaled from ${scaledFrom}` : '';
  return `[image attached: ${name} (${dims}, ${sizeKb} KB)${note}]`;
}

/**
 * REQ-186: the longest edge an image keeps before it rides the wire. Large
 * screenshots (4K+) are downscaled to this so the base64 payload fits the WS
 * frame budget; vision models read comfortably at this size.
 */
export const MAX_IMAGE_EDGE = 1568;

/**
 * Scale one image down to `maxEdge` (never up) — pure integer math so the
 * composer probe covers the sizing without a browser.
 */
export function downscaleDims(
  width: number,
  height: number,
  maxEdge: number = MAX_IMAGE_EDGE,
): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= maxEdge) return { width, height, scaled: false };
  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true,
  };
}
/** Starter prompts for the hero cards — each creates a real session on click. */
export const STARTER_PROMPTS: { title: string; desc: string; prompt: string }[] = [
  {
    title: 'Scaffold a new API',
    desc: 'Fastify + auth + tests',
    prompt: 'Scaffold a new Fastify API with auth and tests. Start with a plan.',
  },
  {
    title: 'Review this code',
    desc: 'Security, types, tests',
    prompt: 'Review the current workspace for security issues, type errors and missing tests.',
  },
  {
    title: 'Design a landing',
    desc: 'Brief to prototype',
    prompt: 'Design a landing page from this brief: headline, sections, and a first prototype.',
  },
];
