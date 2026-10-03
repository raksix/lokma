import { readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { resolveInRoot } from '@lokma/core';

/**
 * REQ-188 — `<context path="…">` blocks for `@path` mentions.
 *
 * The chat WS path had this inline as `readContextBlocks` (routes/ws.ts); the
 * Design Studio brief now ships `@path` mentions too, and sending the raw
 * `@Docs/34-DESIGN.md` text to the model would tell it a FILENAME instead of
 * reading the file. This module is that reader, extracted so both call sites
 * share one jail, one cap and one block shape.
 *
 * Contract (deliberately unchanged from the WS original):
 *   - jailed by the shared core guard; a path outside the root is SKIPPED,
 *     never an error — a typo'd mention must not fail the whole turn;
 *   - max `MAX_CONTEXT_FILES` paths, each at most `MAX_CONTEXT_BYTES`;
 *   - a missing/unreadable file is skipped silently (the prompt still runs);
 *   - the output ends with a newline so callers can join with `\n\n`.
 */

/** Keep in step with the WS turn path — these are the shipped caps. */
export const MAX_CONTEXT_FILES = 5;
export const MAX_CONTEXT_BYTES = 20 * 1024;

/**
 * Read workspace-relative paths into labeled `<context>` blocks.
 *
 * @param cwd    the session/project root every path is jailed to
 * @param paths  workspace-relative paths (a leading `@` is tolerated)
 */
export async function readContextBlocks(cwd: string, paths: string[] | undefined): Promise<string> {
  if (!paths || paths.length === 0) return '';
  const root = resolve(cwd);
  const blocks: string[] = [];
  for (const raw of paths.slice(0, MAX_CONTEXT_FILES)) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    // Jailed by the shared core guard (outside escapes throw, skipped here).
    let abs: string;
    try {
      abs = resolveInRoot(root, raw.trim().replace(/^@/, ''));
    } catch {
      continue;
    }
    try {
      const info = await stat(abs);
      if (!info.isFile() || info.size > MAX_CONTEXT_BYTES) continue;
      const content = await readFile(abs, 'utf-8');
      const rel = relative(root, abs) || raw.trim();
      blocks.push(`<context path="${rel}">\n${content}\n</context>`);
    } catch {
      // Missing/unreadable mention — skip it, the prompt still streams.
    }
  }
  return blocks.length ? blocks.join('\n') + '\n' : '';
}

/**
 * Split a prompt into its clean text and the `@path` mentions it carries.
 *
 * The mention TEXT is stripped from the prompt (the model gets the file
 * CONTENT instead) — a bare `@Docs/34-…md` left inline reads as a filename,
 * which is the exact confusion this block shape exists to prevent. Offsets
 * come from the client `parseMentions`, which is the single definition of the
 * `@path` shape both surfaces share (REQ-188).
 */
export type Mention = { path: string; start: number; end: number };

/**
 * MUST stay identical to `MENTION_PATTERN` in the client's
 * `composer-utils.ts` — the chip the user sees and the block the model reads
 * are two ends of ONE parser, and a drifting pattern here would expand a
 * mention the chip never showed (or, worse, silently skip one it did).
 */
const MENTION_PATTERN = /@([A-Za-z0-9_][A-Za-z0-9_./-]*)/g;

/** One mention per path-shaped run after `@`. */
export function parsePromptMentions(text: string): Mention[] {
  const out: Mention[] = [];
  MENTION_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_PATTERN.exec(text)) !== null) {
    out.push({ path: m[1], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Fold a prompt's mentions into one generation-ready text: the mention text
 * removed, real `<context>` blocks for every readable file prepended.
 *
 * Nothing readable → the text comes back unchanged, so a design brief with a
 * stray `@` is not mangled.
 */
export async function expandPromptMentions(cwd: string, prompt: string): Promise<string> {
  const mentions = parsePromptMentions(prompt);
  if (mentions.length === 0) return prompt;
  const clean = mentions
    .slice()
    .reverse()
    .reduce((acc, m) => acc.slice(0, m.start) + acc.slice(m.end), prompt)
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  const paths = Array.from(new Set(mentions.map((m) => m.path)));
  const blocks = await readContextBlocks(cwd, paths);
  if (!blocks) return clean;
  return blocks + '\n' + clean;
}