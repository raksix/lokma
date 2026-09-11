/**
 * Tool-result sizing — REQ-128, Claude-Code parity (§3.2 of the engine
 * teardown). A tool result is never truncated away blindly: anything past
 * the tool's budget is *spilled to disk* and the model receives a
 * `<persisted-output>` envelope with the size, the path (so it can read the
 * rest itself) and a newline-aligned preview.
 *
 * The pure half lives here so the loop stays testable; the caller owns the
 * filesystem (see `agent-loop.ts`).
 */

/** Default per-tool budget when a tool declares none. */
export const TOOL_RESULT_DEFAULT_BUDGET = 50_000;
/** Hard ceiling — no tool may ask for a bigger budget than this. */
export const TOOL_RESULT_HARD_BUDGET = 50_000;
/** Chars of the spilled payload the model still sees inline. */
export const TOOL_RESULT_PREVIEW_CHARS = 2_000;

/**
 * "Never spill this tool" (REQ-128 follow-up). A tool that already caps its
 * own payload declares this instead of a number. `read_file` is the reason
 * it exists: spilling a read produces a file the model is invited to read
 * back, and if that file is itself over budget the loop never terminates
 * (Hermes pins its read budget to infinity for exactly this). Tools that
 * can emit unbounded output must NOT use this.
 */
export const TOOL_RESULT_NO_SPILL = Number.POSITIVE_INFINITY;

export const PERSISTED_OUTPUT_OPEN = '<persisted-output>';
export const PERSISTED_OUTPUT_CLOSE = '</persisted-output>';

/** Resolve a tool's declared budget against the hard ceiling. */
export function resultBudget(declared?: number): number {
  if (declared === TOOL_RESULT_NO_SPILL) return TOOL_RESULT_NO_SPILL;
  if (typeof declared !== 'number' || !Number.isFinite(declared) || declared <= 0) {
    return TOOL_RESULT_DEFAULT_BUDGET;
  }
  return Math.min(declared, TOOL_RESULT_HARD_BUDGET);
}

/** True when the payload exceeds the budget and must be spilled. */
export function resultOverBudget(text: string, budget: number): boolean {
  return text.length > budget;
}

/**
 * Cut a preview at `cap`: back up to the last newline, but only when that
 * newline sits past the halfway point (otherwise a long first line would
 * shrink the preview to nothing).
 */
export function previewCut(text: string, cap: number = TOOL_RESULT_PREVIEW_CHARS): { preview: string; hasMore: boolean } {
  if (text.length <= cap) return { preview: text, hasMore: false };
  const nl = text.slice(0, cap).lastIndexOf('\n');
  const cut = nl > cap * 0.5 ? nl : cap;
  return { preview: text.slice(0, cut), hasMore: true };
}

/** Bytes → short human size ("12.4 KB"), used in the envelope header. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The exact notice the model sees instead of a giant payload (same shape as
 * Claude Code's): size, path, preview. `path` is workspace-relative so the
 * agent can `read_file` it straight back.
 */
export function persistedOutputEnvelope(args: {
  originalChars: number;
  path: string;
  preview: string;
  hasMore: boolean;
}): string {
  return [
    PERSISTED_OUTPUT_OPEN,
    `Output too large (${humanSize(args.originalChars)}). Full output saved to: ${args.path}`,
    '',
    `Preview (first ${humanSize(TOOL_RESULT_PREVIEW_CHARS)}):`,
    args.preview,
    args.hasMore ? '...' : '',
    PERSISTED_OUTPUT_CLOSE,
  ].join('\n');
}

/**
 * Claude Code rewrites an empty result to an explicit placeholder instead of
 * sending an empty string — "did it run?" must never be ambiguous.
 */
export function emptyResultPlaceholder(tool: string): string {
  return `(${tool} completed with no output)`;
}

/** True when a result serialized to nothing a model could act on. */
export function isEmptyResultText(text: string): boolean {
  const t = text.trim();
  return t.length === 0 || t === '{}' || t === '[]' || t === 'null' || t === '""';
}

/** Serialize any tool result into the text the model reads. */
export function resultToText(result: unknown): string {
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result) ?? 'null';
  } catch {
    return '(unserializable result)';
  }
}

/** Workspace-relative spill path (kept out of the model's source tree). */
export function spillPathFor(callId: string): string {
  const safe = callId.replace(/[^A-Za-z0-9_-]/g, '');
  return `.lokma/tool-results/${safe || 'result'}.txt`;
}
