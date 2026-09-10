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
