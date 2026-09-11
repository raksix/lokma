import { spawn } from 'node:child_process';
import type { ServerMessage } from '@lokma/shared';

/**
 * REQ-116 FAZ B — headless `claude -p` engine (zero npm dependencies).
 *
 * Runs Claude Code as a subprocess (`-p --output-format stream-json
 * --verbose --include-partial-messages`) and translates its NDJSON events
 * into the harness WS frames (`text_delta` / `tool_start` / `tool_result` /
 * `cost`), so a Claude-driven run renders on the same chat surface as the
 * built-in `<tool>`-block loop (`agent-loop.ts`).
 *
 * Notes:
 * - Auth comes from the host environment (`ANTHROPIC_API_KEY`); the key is
 *   never logged, never written to the repo, never echoed into frames.
 * - `claude` 2.1.x has no `--max-turns` flag, so `maxTurns` is enforced
 *   harness-side: after that many assistant tool turns the child is killed
 *   and the summary carries subtype `error_max_turns` (same vocabulary as
 *   the SDK `ResultMessage`, see REQ-116 §2).
 * - A missing binary is an honest rejection
 *   (`[run failed: claude binary not found]`) — never a mock.
 */

export type ClaudePrintOpts = {
  prompt: string;
  cwd: string;
  model?: string;
  allowedTools: string[];
  disallowedTools?: string[];
  maxTurns: number;
  maxBudgetUsd: number;
  sessionId: string;
  signal: AbortSignal;
  send: (frame: ServerMessage) => void;
  /** Override for probes (defaults to `claude` on PATH). */
  claudeBin?: string;
  /** Extra env for the child (merged over `process.env`, never logged). */
  env?: Record<string, string>;
  /** Resume a previous Claude session (`--resume <id>`). */
  resumeSessionId?: string;
};

export type ClaudeRunSubtype =
  | 'success'
  | 'error_max_turns'
  | 'error_max_budget_usd'
  | 'error_during_execution';

export type ClaudeRunSummary = {
  subtype: ClaudeRunSubtype;
  result: string;
  costUsd: number;
  numTurns: number;
  /** Claude's own session id (`--resume` handle, empty when unknown). */
  claudeSessionId: string;
};

export const CLAUDE_BINARY_NOT_FOUND = '[run failed: claude binary not found]';

/**
 * REQ-116 FAZ B-spawn-fail — honest failure marker for a rejected headless run.
 *
 * Engine rejections already speak marker vocabulary (`CLAUDE_BINARY_NOT_FOUND`,
 * `[run failed: claude spawn: ...]`, `[run failed: claude exit ...]`), so they
 * pass through verbatim and the transcript shows exactly what the engine
 * reported. Anything else (unexpected throwables) is wrapped so the
 * transcript never shows a raw stack. `[run aborted]` is NOT a failure and
 * passes through untouched — the caller keeps the abort/completion framing.
 * Pure — probe it.
 */
export function formatClaudeRunFailed(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.startsWith('[run failed') || msg.startsWith('[run aborted]')) return msg;
  return '[run failed: ' + msg + ']';
}

/**
 * REQ-116 FAZ B-run-error — honest stop marker for an
 * `error_during_execution` result. The binary resolved (exit 0 with a
 * `result` event) but reports the run failed mid-execution; without a
 * marker the transcript would read as a clean completion. The engine
 * `result` text (when non-empty) is already in the transcript via the
 * caller, so the marker only frames the stop — same `[run stopped: ...]`
 * vocabulary as the FAZ A max_turns / max_budget markers.
 */
export const CLAUDE_RUN_ERROR_MARKER = '[run stopped: error_during_execution]';

/**
 * REQ-116 FAZ B-wiring — engine selection + harness-side defaults.
 *
 * A model id selects the headless engine only with the `claude-code/`
 * prefix (`claude-code/sonnet` runs Claude model `sonnet`; bare
 * `claude-code` runs the binary default). Anything else returns null and
 * keeps the built-in `<tool>`-block loop. Pure — probe it.
 */
export const CLAUDE_ENGINE_PREFIX = 'claude-code/';

export type ClaudeEngineSelection = {
  /** Claude-side `--model` value (undefined = binary default). */
  claudeModel?: string;
};

export function parseClaudeEngineModel(model: string): ClaudeEngineSelection | null {
  const id = model.trim();
  if (id === 'claude-code') return {};
  if (!id.startsWith(CLAUDE_ENGINE_PREFIX)) return null;
  const rest = id.slice(CLAUDE_ENGINE_PREFIX.length).trim();
  if (!rest) return {};
  return { claudeModel: rest };
}

/** Minimal tool surface for headless runs (REQ-116 §5 plan). */
export const CLAUDE_ENGINE_DEFAULT_ALLOWED_TOOLS = ['Read', 'Glob', 'Grep', 'Bash'];
/** Denied in every mode (REQ-116 §5 plan). */
export const CLAUDE_ENGINE_DEFAULT_DISALLOWED_TOOLS = ['Bash(rm *)'];
/** Matches the headless example in REQ-116 §2 (`--max-budget-usd 2`). */
export const CLAUDE_ENGINE_DEFAULT_MAX_BUDGET_USD = 2;

/**
 * REQ-116 FAZ C — permission bridge (config-driven allow/deny).
 *
 * Lokma's gate (`lokma-core` gate.ts) speaks Lokma tool ids
 * (`read_file`, `write_file`, `run_command`, ...) with deny > allow >
 * defaultMode precedence. Claude's CLI speaks Claude tool names (`Read`,
 * `Edit`, `Bash`, ...) via `--allowedTools` / `--disallowedTools` (deny
 * wins there too). This translator maps one vocabulary onto the other so
 * a project's `permissions` config steers headless runs instead of the
 * hardcoded FAZ B defaults.
 *
 * Headless honesty notes (why this is only a partial FAZ C):
 * - `--permission-mode dontAsk` (kept per the REQ-116 plan) auto-approves
 *   everything NOT disallowed — so only the disallow list enforces. The
 *   allow list is carried for intent plus future mode changes.
 * - `ask`-fated tools (mutations under `auto`/`manual`) CANNOT open a live
 *   Lokma permission card from inside the subprocess: by the time the
 *   harness sees `tool_start`, the tool already ran. Live ask-bridging
 *   needs hook-callback infrastructure (PreToolUse round-trip into the
 *   harness), recorded as FAZ C-remaining — never faked here.
 * - `defaultMode: bypass` deliberately does NOT map to
 *   `--dangerously-skip-permissions` (out of scope per REQ-116 section 5);
 *   the inviolable `Bash(rm *)` deny holds in every mode.
 * - Denials surface honestly: Claude reports the refusal and the
 *   translator below maps the `user[tool_result]` (`is_error`) block into
 *   a `tool_result` frame — visible in chat, never silent.
 */

/** Lokma tool id (plus gate-style prefixes) to Claude tool names. */
const LOKMA_TO_CLAUDE_TOOLS: Record<string, readonly string[]> = {
  'read_file': ['Read'],
  'list_files': ['Glob'],
  'search_files': ['Grep'],
  'write_file': ['Edit', 'Write'],
  'run_command': ['Bash'],
};

export type LokmaPermissionInput = {
  allow?: readonly string[] | null;
  deny?: readonly string[] | null;
};

export type ClaudePermissionLists = {
  allowedTools: string[];
  disallowedTools: string[];
};

function expandLokmaEntries(entries: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of entries ?? []) {
    if (typeof raw !== 'string') continue;
    const entry = raw.trim();
    if (!entry) continue;
    const direct = LOKMA_TO_CLAUDE_TOOLS[entry];
    if (direct) {
      out.push(...direct);
      continue;
    }
    // Gate-style prefix: `write` covers `write_file` (gate.ts `listed`).
    const prefixed = Object.keys(LOKMA_TO_CLAUDE_TOOLS).filter((id) => id.startsWith(entry));
    if (prefixed.length > 0) {
      for (const id of prefixed) out.push(...(LOKMA_TO_CLAUDE_TOOLS[id] ?? []));
      continue;
    }
    // Claude-native matcher (`Bash(git:*)`, `Edit`) passes through verbatim.
    out.push(entry);
  }
  return out;
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * Translate a Lokma `permissions` object into Claude argv lists. Pure —
 * probe it. Deny wins over allow (mirrors gate.ts); the inviolable
 * default deny (`Bash(rm *)`) is always present.
 */
export function resolveClaudePermissions(perms?: LokmaPermissionInput | null): ClaudePermissionLists {
  const allowed = dedupeNames([...CLAUDE_ENGINE_DEFAULT_ALLOWED_TOOLS, ...expandLokmaEntries(perms?.allow)]);
  const disallowed = new Set(dedupeNames([...CLAUDE_ENGINE_DEFAULT_DISALLOWED_TOOLS, ...expandLokmaEntries(perms?.deny)]));
  return {
    allowedTools: allowed.filter((name) => !disallowed.has(name)),
    disallowedTools: [...disallowed],
  };
}

/**
 * REQ-116 FAZ C-ask-gate — mutation surface a headless run can touch.
 *
 * The subprocess cannot raise a live per-tool card: by the time the
 * harness sees `tool_start` the tool already ran (documented in the
 * FAZ C bridge above). So the WS pump gates the run UP FRONT on these
 * Lokma ids via the standard `decideToolCall` gate — `deny` already
 * narrowed the argv lists (deny wins), `ask` opens one
 * `permission_request` card per tool before spawning.
 */
export const CLAUDE_MUTATION_SURFACE = ['write_file', 'run_command'] as const;

/** Claude tool names covered by one Lokma mutation id (for card text). Pure — probe it. */
export function claudeToolsForLokmaTool(lokmaTool: string): string[] {
  return [...(LOKMA_TO_CLAUDE_TOOLS[lokmaTool] ?? [])];
}

/**
 * One-line `permission_request.description` for the pre-spawn card.
 * Names the Claude tools the run may use so the approver sees the real
 * surface. Pure — probe it.
 */
export function describeClaudeAskCard(askLokmaTools: readonly string[]): string {
  const names = [...new Set(askLokmaTools.flatMap(claudeToolsForLokmaTool))];
  const surface = names.length > 0 ? names.join(', ') : 'mutation tools';
  return 'Headless Claude run may change the workspace (' + surface + ') — approve to spawn';
}

/**
 * REQ-116 FAZ D-clear — `/clear` starts the next headless run fresh.
 *
 * Without this the stored resume handle (`--resume <id>`) drags the old
 * engine session along forever: no API or command clears it. The WS pump
 * intercepts this command harness-side (clears the handle, writes the
 * marker below, sends `done`) and never spawns the binary. Pure — probe it.
 */
export const CLAUDE_CLEAR_MARKER = '[claude session cleared - next run starts fresh]';

export function isClaudeClearCommand(prompt: string): boolean {
  return prompt.trim() === '/clear';
}

/**
 * REQ-116 FAZ D-compact — `/compact` compacts the Lokma-side transcript
 * harness-side (default `full` mode) and never spawns the binary: the
 * explicit counterpart to the pre-turn auto-compact window. The engine
 * keeps its own server-side session; this keeps OUR persisted history
 * (the source the next turn + reconnects read) consistent. Pure — probe it.
 */
export function isClaudeCompactCommand(prompt: string): boolean {
  return prompt.trim() === '/compact';
}

/**
 * REQ-116 FAZ D-compact-focus — `/compact <focus>` keeps focus instructions.
 *
 * Claude Code's `/compact` takes optional focus text ("compact, keeping the
 * auth work"). The bare form above stays exact-match (probe-locked), so this
 * parser owns the full command shape: bare `/compact` (empty focus),
 * `/compact <text>` (focus carried), anything else null. The WS pump runs
 * the same harness-side `compactSession`, then appends the focus line to
 * the marker row — the next turn reads the instruction from the persisted
 * transcript, and the binary never spawns for either form. Focus is capped
 * (`truncated: true` says so honestly) so a pasted paragraph cannot bloat
 * the transcript it just shrank.
 */
export type ClaudeCompactCommand = { focus: string; truncated: boolean };

export const CLAUDE_COMPACT_FOCUS_MAX = 500;

export function parseClaudeCompactCommand(prompt: string): ClaudeCompactCommand | null {
  const trimmed = prompt.trim();
  if (trimmed === '/compact') return { focus: '', truncated: false };
  if (!trimmed.startsWith('/compact')) return null;
  const rest = trimmed.slice('/compact'.length);
  if (rest.trim().length >= rest.length) return null;
  const focus = rest.trim();
  if (focus.length <= CLAUDE_COMPACT_FOCUS_MAX) return { focus, truncated: false };
  return { focus: focus.slice(0, CLAUDE_COMPACT_FOCUS_MAX), truncated: true };
}

/** Transcript line carrying the focus into the next turn. Pure — probe it. */
export function formatClaudeFocusLine(cmd: ClaudeCompactCommand): string {
  return '[focus: ' + cmd.focus + (cmd.truncated ? ' [truncated]' : '') + ']';
}

/**
 * Shared `[compact: ...]` marker so the explicit `/compact` path and the
 * pre-turn auto-compact window write identical transcript text. Pure.
 */
export function claudeCompactMarker(beforeMessages: number, afterMessages: number, mode: string): string {
  return '[compact: ' + mode + ' ' + String(beforeMessages) + '->' + String(afterMessages) + ' messages]';
}

/**
 * REQ-116 FAZ D-context — `/context` reports headless-run context state.
 *
 * Claude Code's `/context` shows window usage; ours reports the same inputs
 * the pre-turn auto-compact window reads (`compactionStatus`: message/char
 * counts against the hygiene/summary budgets) plus headless-run state the
 * engine owns (resume handle present/fresh, per-run budget, last compact).
 * Read-only: never spawns the binary, never mutates the transcript itself
 * (the WS pump still appends the report as the visible assistant row, like
 * the `/clear` + `/compact` paths). Pure — probe it.
 */
export function isClaudeContextCommand(prompt: string): boolean {
  return prompt.trim() === '/context';
}

/** Inputs for {@link formatClaudeContextReport} — all plain values, no store. */
export type ClaudeContextInput = {
  messages: number;
  chars: number;
  hygieneNeeded: boolean;
  summaryNeeded: boolean;
  resumed: boolean;
  maxBudgetUsd: number;
  /** Pre-formatted last-compact line (`mode before->after (at)`) or null. */
  lastCompact: string | null;
  /**
   * REQ-116 FAZ D-context-categories — per-role breakdown (`kategori
   * dökümü`, REQ-116 §3 FAZ D). Optional so older callers (fresh-session
   * path, existing probes) keep working: absent means no category line.
   */
  categories?: ClaudeCategoryCounts | null;
};

/** Per-role message counts for the `/context` category line. */
export type ClaudeCategoryCounts = {
  user: number;
  assistant: number;
  tool: number;
};

/**
 * REQ-116 FAZ D-context-categories — count transcript roles into the
 * category breakdown. Unknown roles are ignored (anchor rows and future
 * roles never inflate the line). Pure — probe it.
 */
export function countClaudeCategories(roles: readonly string[]): ClaudeCategoryCounts {
  const counts: ClaudeCategoryCounts = { user: 0, assistant: 0, tool: 0 };
  for (const role of roles) {
    if (role === 'user') counts.user += 1;
    else if (role === 'assistant') counts.assistant += 1;
    else if (role === 'tool') counts.tool += 1;
  }
  return counts;
}

/** One category line for the `/context` report. Pure — probe it. */
export function formatClaudeCategoryLine(counts: ClaudeCategoryCounts): string {
  return '[categories: ' + String(counts.user) + ' user, ' + String(counts.assistant) + ' assistant, ' + String(counts.tool) + ' tool]';
}

/** One readable status block for the `/context` assistant row. Pure. */
export function formatClaudeContextReport(input: ClaudeContextInput): string {
  const window = input.summaryNeeded
    ? 'over summary budget'
    : input.hygieneNeeded
      ? 'over hygiene budget'
      : 'within budget';
  const lines = [
    '[context: ' + String(input.messages) + ' messages, ' + String(input.chars) + ' chars — ' + window + ']',
    'engine session: ' + (input.resumed ? 'resumed (resume handle stored)' : 'fresh (no resume handle)'),
    'budget: $' + String(input.maxBudgetUsd) + ' per run',
    'last compact: ' + (input.lastCompact ?? 'none'),
  ];
  if (input.categories) lines.push(formatClaudeCategoryLine(input.categories));
  return lines.join('\n');
}

/**
 * REQ-116 FAZ D-reinject-quota — skill/rule re-injection quota after compact.
 *
 * Claude Code re-applies skill + rule context after a compaction (the summary
 * drops the guidance the run relied on). Our harness-side equivalent is a
 * `[reinject: ...]` transcript row appended right after a SUCCESSFUL compact,
 * so the next turn re-reads skill guidance from the persisted history.
 *
 * The quota bounds density, not cycles: at most CLAUDE_REINJECT_QUOTA_MAX
 * reinject rows in the last CLAUDE_REINJECT_WINDOW transcript rows. Without
 * it a pathological run (auto-compact firing every turn) would grow the
 * transcript with marker + reinject rows faster than compaction shrinks it.
 * Quota state lives in the transcript itself — no new store fields, survives
 * restarts. No-op compacts and failures never reinject (nothing was lost).
 * Pure — probe it.
 */
export const CLAUDE_REINJECT_QUOTA_MAX = 3;
export const CLAUDE_REINJECT_WINDOW = 20;
export const CLAUDE_REINJECT_PREFIX = '[reinject:';

/** Count reinject rows in the last window rows. Pure — probe it. */
export function countRecentClaudeReinjects(contents: readonly string[], window = CLAUDE_REINJECT_WINDOW): number {
  const tail = contents.slice(Math.max(0, contents.length - window));
  let count = 0;
  for (const c of tail) {
    if (c.indexOf(CLAUDE_REINJECT_PREFIX) !== -1) count += 1;
  }
  return count;
}

/** True while the window still has quota left. Pure — probe it. */
export function shouldReinjectSkills(recentCount: number): boolean {
  return recentCount < CLAUDE_REINJECT_QUOTA_MAX;
}

/** One quota-stamped reinject line. Pure — probe it. */
export function formatClaudeReinjectLine(recentCount: number): string {
  return '[reinject: skill guidance re-applied (' + String(recentCount + 1) + '/' + String(CLAUDE_REINJECT_QUOTA_MAX) + ' in window)]';
}

/**
 * Build the exact argv for the child. Pure — probe it (no invented flags:
 * every flag below exists in `claude --help` v2.1.x).
 */
export function buildClaudeArgs(opts: {
  prompt: string;
  model?: string;
  allowedTools: string[];
  disallowedTools?: string[];
  maxBudgetUsd: number;
  resumeSessionId?: string;
}): string[] {
  const args = [
    '-p',
    opts.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-mode',
    'dontAsk',
  ];
  if (opts.model) args.push('--model', opts.model);
  if (opts.allowedTools.length > 0) args.push('--allowedTools', opts.allowedTools.join(','));
  if (opts.disallowedTools && opts.disallowedTools.length > 0) {
    args.push('--disallowedTools', opts.disallowedTools.join(','));
  }
  args.push('--max-budget-usd', String(opts.maxBudgetUsd));
  if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId);
  return args;
}

type TranslateOut = { frames: ServerMessage[]; summary?: ClaudeRunSummary };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  try {
    return JSON.stringify(content);
  } catch {
    return '[unserializable tool_result]';
  }
}

/**
 * Translate ONE stream-json NDJSON line into WS frames. Pure — probe it.
 * Unknown / malformed lines yield zero frames (never throw on live output).
 */
export function translateClaudeLine(raw: string, sessionId: string): TranslateOut {
  const frames: ServerMessage[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { frames };
  }
  const event = asRecord(parsed);
  if (!event || typeof event['type'] !== 'string') return { frames };

  // Partial token stream (needs --verbose --include-partial-messages).
  if (event['type'] === 'stream_event') {
    const inner = asRecord(event['event']);
    if (inner && inner['type'] === 'content_block_delta') {
      const delta = asRecord(inner['delta']);
      if (delta && delta['type'] === 'text_delta' && typeof delta['text'] === 'string' && delta['text'].length > 0) {
        frames.push({ type: 'text_delta', delta: delta['text'], sessionId });
      }
    }
    return { frames };
  }

  // Full assistant turn: text parts stream, tool_use blocks become starts.
  if (event['type'] === 'assistant') {
    const message = asRecord(event['message']);
    const content = message ? message['content'] : undefined;
    if (Array.isArray(content)) {
      for (const block of content) {
        const part = asRecord(block);
        if (!part) continue;
        if (part['type'] === 'text' && typeof part['text'] === 'string' && part['text'].length > 0) {
          frames.push({ type: 'text_delta', delta: part['text'], sessionId });
        } else if (part['type'] === 'tool_use' && typeof part['id'] === 'string' && typeof part['name'] === 'string') {
          frames.push({ type: 'tool_start', tool: part['name'], input: part['input'] ?? null, callId: part['id'], sessionId });
        }
      }
    }
    return { frames };
  }

  // Tool outcomes land as user turns carrying tool_result blocks.
  if (event['type'] === 'user') {
    const message = asRecord(event['message']);
    const content = message ? message['content'] : undefined;
    if (Array.isArray(content)) {
      for (const block of content) {
        const part = asRecord(block);
        if (!part || part['type'] !== 'tool_result' || typeof part['tool_use_id'] !== 'string') continue;
        frames.push({
          type: 'tool_result',
          callId: part['tool_use_id'],
          result: toolResultText(part['content']),
          isError: part['is_error'] === true,
          sessionId,
        });
      }
    }
    return { frames };
  }

  // Terminal event: cost frame + machine-readable summary for the caller.
  if (event['type'] === 'result') {
    const subtype = typeof event['subtype'] === 'string' ? event['subtype'] : 'error_during_execution';
    const known: ClaudeRunSubtype =
      subtype === 'success' || subtype === 'error_max_turns' || subtype === 'error_max_budget_usd'
        ? subtype
        : 'error_during_execution';
    const costUsd = typeof event['total_cost_usd'] === 'number' ? event['total_cost_usd'] : 0;
    const numTurns = typeof event['num_turns'] === 'number' ? event['num_turns'] : 0;
    const resultText = typeof event['result'] === 'string' ? event['result'] : '';
    const claudeSessionId = typeof event['session_id'] === 'string' ? event['session_id'] : '';
    frames.push({ type: 'cost', sessionId, inputTokens: 0, outputTokens: 0, costUsd, model: 'claude-code' });
    return { frames, summary: { subtype: known, result: resultText, costUsd, numTurns, claudeSessionId } };
  }

  // system/init and everything else: log-only, no frames.
  return { frames };
}

/**
 * Run the headless engine: spawn, translate NDJSON stdout into frames,
 * resolve with the terminal summary. Rejects honestly on missing binary,
 * spawn failure, non-zero exit without a `result` event, or parent abort.
 */
export function runClaudePrint(opts: ClaudePrintOpts): Promise<ClaudeRunSummary> {
  const bin = opts.claudeBin ?? 'claude';
  return new Promise<ClaudeRunSummary>((resolve, reject) => {
    let child;
    try {
      child = spawn(bin, buildClaudeArgs(opts), {
        cwd: opts.cwd,
        env: { ...process.env, ...(opts.env ?? {}) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      reject(new Error(CLAUDE_BINARY_NOT_FOUND + ': ' + String(err)));
      return;
    }
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      opts.signal.removeEventListener('abort', onAbort);
      fn();
    };
    const onAbort = (): void => {
      finish(() => {
        try {
          child.kill('SIGTERM');
        } catch {
          // Already gone — the close handler below is skipped via `settled`.
        }
        reject(new Error('[run aborted]'));
      });
    };
    if (opts.signal.aborted) {
      reject(new Error('[run aborted]'));
      return;
    }
    opts.signal.addEventListener('abort', onAbort);

    let stderrTail = '';
    let toolTurns = 0;
    let maxTurnsHit = false;
    let leftover = '';
    let summary: ClaudeRunSummary | undefined;

    const pumpLines = (chunk: Buffer): void => {
      leftover += chunk.toString('utf8');
      const lines = leftover.split('\n');
      leftover = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const out = translateClaudeLine(line, opts.sessionId);
        for (const frame of out.frames) {
          if (frame.type === 'tool_start') {
            toolTurns += 1;
            if (toolTurns > opts.maxTurns && !maxTurnsHit) {
              maxTurnsHit = true;
              try {
                child.kill('SIGTERM');
              } catch {
                // Close handler reports the outcome.
              }
            }
          }
          opts.send(frame);
        }
        if (out.summary) summary = out.summary;
      }
    };

    child.stdout?.on('data', pumpLines);
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-4000);
    });
    child.on('error', (err: Error & { code?: string }) => {
      finish(() => {
        if (err.code === 'ENOENT') reject(new Error(CLAUDE_BINARY_NOT_FOUND));
        else reject(new Error('[run failed: claude spawn: ' + err.message + ']'));
      });
    });
    child.on('close', (code: number | null) => {
      finish(() => {
        if (maxTurnsHit && !summary) {
          resolve({ subtype: 'error_max_turns', result: '', costUsd: 0, numTurns: toolTurns, claudeSessionId: '' });
          return;
        }
        if (summary) {
          resolve(summary);
          return;
        }
        reject(new Error('[run failed: claude exit ' + String(code) + (stderrTail ? ': ' + stderrTail.slice(0, 500) : '') + ']'));
      });
    });
  });
}
