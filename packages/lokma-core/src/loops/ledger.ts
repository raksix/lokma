import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Append-only loop ledger (REQ-200 §4) — one human-readable `ledger.md` per
 * loop at `~/.lokma/loops/<id>/ledger.md`, mirroring the discipline of the
 * Hermes loop ledgers: 3–5 lines per iteration (what was done, what was
 * measured, what is next).
 *
 * Append-only, never deleted: when the file grows past `MAX_LEDGER_BYTES` the
 * store trims the OLDEST iterations and keeps a head summary, so history
 * survives in reduced form instead of disappearing. Reading is tolerant —
 * a missing file reads as an empty ledger, a corrupt one never throws.
 */

export const LOOPS_DIR = join(homedir(), '.lokma', 'loops');

/** Per-loop directory — the single source of truth for one loop. */
export function loopDir(loopId: string): string {
  return join(LOOPS_DIR, loopId);
}

export function ledgerPath(loopId: string): string {
  return join(loopDir(loopId), 'ledger.md');
}

/** Soft cap for one ledger; older iterations are trimmed past it. */
export const MAX_LEDGER_BYTES = 256 * 1024;

/** One ledger line cap — the console shows the tail, not a wall of text. */
const MAX_LINE_CHARS = 400;

const LEDGER_HEADER = [
  '# Loop ledger',
  '',
  'Append-only. Newest entry at the bottom. Trimmed (never deleted) when the file passes the size cap.',
  '',
].join('\n');

function cleanLine(value: string): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length > MAX_LINE_CHARS ? `${oneLine.slice(0, MAX_LINE_CHARS - 1)}…` : oneLine;
}

/**
 * Format one iteration entry. Lines are collapsed to a single line each so a
 * multi-line tool result can never smuggle a fake `## Iteration` heading into
 * the ledger and corrupt the trimmer.
 */
export function formatLedgerEntry(input: {
  iteration: number;
  at: string;
  summary: string;
  measured?: string | null;
  score?: string | null;
  next?: string | null;
}): string {
  const head = `## Iteration ${input.iteration} — ${input.at}`;
  const lines = [head, `- did: ${cleanLine(input.summary) || '(no summary)'}`];
  if (input.measured) lines.push(`- measured: ${cleanLine(input.measured)}`);
  if (input.score) lines.push(`- score: ${cleanLine(input.score)}`);
  if (input.next) lines.push(`- next: ${cleanLine(input.next)}`);
  return `${lines.join('\n')}\n`;
}

/** Split a ledger into (head summary, iteration blocks). Pure — probe-friendly. */
export function parseLedger(raw: string): { head: string; entries: Array<{ iteration: number; text: string }> } {
  const lines = raw.split('\n');
  const entries: Array<{ iteration: number; text: string }> = [];
  let head: string[] = [];
  let current: { iteration: number; lines: string[] } | null = null;
  const headRe = /^## Iteration (\d+) — /;
  for (const line of lines) {
    const m = headRe.exec(line);
    if (m) {
      if (current) entries.push({ iteration: current.iteration, text: current.lines.join('\n') });
      current = { iteration: Number(m[1]), lines: [line] };
      continue;
    }
    if (current) current.lines.push(line);
    else head.push(line);
  }
  if (current) entries.push({ iteration: current.iteration, text: current.lines.join('\n') });
  return { head: head.join('\n').trim(), entries };
}

/**
 * Trim to the newest `keep` iterations plus the head summary. Returns the
 * original string unchanged when it is already under the cap — pure, so the
 * trim decision is unit-testable without touching disk.
 */
export function trimLedger(raw: string, keep: number, maxBytes = MAX_LEDGER_BYTES): string {
  if (raw.length <= maxBytes || keep <= 0) return raw;
  const { head, entries } = parseLedger(raw);
  const kept = entries.slice(-keep);
  const dropped = entries.length - kept.length;
  const summary = dropped > 0 ? `${head}\n\n_Trimmed ${dropped} older iteration(s); newest ${kept.length} kept._\n` : `${head}\n`;
  const body = kept.map((e) => `${e.text.trim()}\n`).join('\n');
  return `${summary}\n${body}`;
}

/** Read the ledger; missing/corrupt reads as empty rather than throwing. */
export async function readLedger(loopId: string): Promise<string> {
  try {
    const raw = await readFile(ledgerPath(loopId), 'utf-8');
    return raw.trim() ? raw : LEDGER_HEADER;
  } catch {
    return LEDGER_HEADER;
  }
}

/**
 * Append one iteration, then trim if the file passed the cap. The caller owns
 * `state.json`; this file only ever grows at the bottom (or loses its oldest
 * entries to the trimmer, which is recorded in the head).
 */
export async function appendLedger(loopId: string, entry: string, keep = 40): Promise<void> {
  const path = ledgerPath(loopId);
  const current = await readLedger(loopId);
  const next = `${current.trimEnd()}\n\n${entry}`;
  const trimmed = trimLedger(next, keep);
  await writeFile(path, trimmed, 'utf-8');
}
