import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { createInterface, type Interface } from 'node:readline/promises';
import { stream as aiStream, type ProviderMessage } from 'lokma-ai';
import { loadConfig, saveGlobal } from '../config/loader.js';
import { loadCredentials } from '../config/credentials.js';
import { SessionStore } from '../session/store.js';
import type { SessionMessage } from '../session/types.js';
import { ToolRegistry } from '../tools/registry.js';
import { buildBuiltinTools } from '../tools/builtins.js';
import { buildTodoTools } from '../tools/todos.js';
import { buildToolSystemPrompt, createBlockFilter } from '../tools/parse.js';
import { executeToolCall, mintCallId, runApprovedCall } from '../tools/executor.js';
import { describeToolCall } from '../tools/gate.js';
import { estimateCost, estimateTokens } from '../usage/pricing.js';
import { UsageLedger } from '../usage/ledger.js';
import { resolveInRoot } from '../files/files.js';

/**
 * Lokma TUI — Claude-Code-style terminal chat over the real harness.
 *
 * Same building blocks as the Web WS loop
 * (`packages/lokma-web/server/src/agent-loop.ts`): `lokma-ai stream()`,
 * core tool registry + gated executor, `<tool>`/`<ask>` text blocks,
 * JSONL SessionStore (same files the Web harness reads), usage ledger.
 * No UI-control tools (browser/shell/session panes are Web-only).
 * Zero TUI dependencies — `node:readline/promises` + ANSI only, so it
 * works in PowerShell, cmd, and POSIX terminals alike.
 */

export type TuiOpts = {
  cwd?: string;
  model?: string;
  sessionId?: string;
  /** One-shot mode: run a single prompt, print the answer, exit. */
  prompt?: string;
};

const MAX_TURNS = 15;
const TURN_TIMEOUT_MS = 180_000;
const MAX_CONTEXT_FILES = 5;
const MAX_CONTEXT_BYTES = 20 * 1024;

/** Built-in base URLs mirror the server provider views (single copy here). */
const BUILTIN_BASE_URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  google: 'https://generativelanguage.googleapis.com',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434/v1',
};

const ENV_KEYS: Record<string, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  google: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
};

// ── ANSI (disabled when piped or NO_COLOR) ────────────────────────────────────

const USE_COLOR = !!process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  bold: (s: string): string => (USE_COLOR ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string): string => (USE_COLOR ? `\x1b[2m${s}\x1b[0m` : s),
  cyan: (s: string): string => (USE_COLOR ? `\x1b[36m${s}\x1b[0m` : s),
  green: (s: string): string => (USE_COLOR ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string): string => (USE_COLOR ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s: string): string => (USE_COLOR ? `\x1b[31m${s}\x1b[0m` : s),
  gray: (s: string): string => (USE_COLOR ? `\x1b[90m${s}\x1b[0m` : s),
};

// ── Model / provider resolution ──────────────────────────────────────────────

/** Canonical harness id: adapters strip `provider/`, so `::` becomes `/`. */
export function canonicalModelId(model: string): string {
  return model.replace(/::/g, '/');
}

export function providerOf(model: string): string {
  const canon = canonicalModelId(model);
  const slash = canon.indexOf('/');
  return slash >= 0 ? canon.slice(0, slash) : canon;
}

async function resolveApiKey(id: string): Promise<string | null> {
  try {
    const creds = await loadCredentials();
    const fileKey = (creds.providers[id] as { apiKey?: string } | undefined)?.apiKey;
    if (fileKey) return fileKey;
  } catch {
    // No credentials file — fall through to env.
  }
  for (const envName of ENV_KEYS[id] ?? []) {
    const envKey = process.env[envName];
    if (envKey) return envKey;
  }
  return null;
}

async function resolveBaseUrl(cwd: string, id: string): Promise<string> {
  try {
    const cfg = await loadConfig(cwd);
    const override = (cfg.providers ?? []).find((p) => p.id === id)?.baseUrl;
    if (override) return override;
  } catch {
    // Config unreadable — fall through to built-ins.
  }
  return BUILTIN_BASE_URLS[id] ?? '';
}

type Upstream = { provider: 'anthropic' | 'openai'; baseUrl: string; apiKey: string | null };

async function resolveUpstream(cwd: string, model: string): Promise<Upstream> {
  const provider = providerOf(model);
  const apiKey = await resolveApiKey(provider);
  const baseUrl = await resolveBaseUrl(cwd, provider);
  if (provider === 'anthropic') {
    return { provider: 'anthropic', baseUrl: baseUrl || BUILTIN_BASE_URLS.anthropic, apiKey };
  }
  if (provider === 'openai' || provider === 'deepseek' || provider === 'openrouter' || provider === 'ollama' || baseUrl) {
    return { provider: 'openai', baseUrl: baseUrl || BUILTIN_BASE_URLS.openai, apiKey };
  }
  throw new Error(
    `Provider "${provider}" is not wired for chat (wired: anthropic, openai, deepseek, openrouter, ollama, custom OpenAI-compatible) — configure it in the Web Providers tab or ~/.lokma/config.json.`,
  );
}

// ── History + @file context (mirrors the WS loop) ────────────────────────────

const HISTORY_MESSAGE_CAP = 30;
const HISTORY_CHAR_CAP = 48_000;
const HISTORY_CHAT_TRUNC = 8_000;
const HISTORY_TOOL_TRUNC = 2_000;

function truncateHistoryText(text: string, cap: number): string {
  if (text.length <= cap) return text;
  return `${text.slice(0, cap)}\n…[truncated ${text.length - cap} chars]`;
}

function buildHistory(messages: SessionMessage[]): ProviderMessage[] {
  const recent = messages.slice(-HISTORY_MESSAGE_CAP);
  const out: ProviderMessage[] = [];
  let chars = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (!m) continue;
    const isNewest = i === recent.length - 1;
    let text: string;
    let role: ProviderMessage['role'];
    if (m.role === 'tool') {
      role = 'user';
      const body = isNewest ? m.content : truncateHistoryText(m.content, HISTORY_TOOL_TRUNC);
      text = `<tool_result tool="${m.toolName ?? 'unknown'}" id="${m.toolCallId ?? ''}">${body}</tool_result>`;
    } else {
      role = m.role === 'assistant' ? 'assistant' : 'user';
      text = isNewest ? m.content : truncateHistoryText(m.content, HISTORY_CHAT_TRUNC);
    }
    if (!text.trim()) continue;
    chars += text.length;
    if (chars > HISTORY_CHAR_CAP && out.length > 0) break;
    out.unshift({ role, content: text });
  }
  return out;
}

async function readContextBlocks(cwd: string, prompt: string): Promise<{ prefix: string; files: string[] }> {
  const mentions = [...prompt.matchAll(/@([^\s@][^\s]*)/g)].map((m) => m[1]).filter((p): p is string => !!p);
  if (mentions.length === 0) return { prefix: '', files: [] };
  const root = resolve(cwd);
  const blocks: string[] = [];
  const files: string[] = [];
  for (const raw of mentions.slice(0, MAX_CONTEXT_FILES)) {
    let abs: string;
    try {
      abs = resolveInRoot(root, raw.trim());
    } catch {
      continue;
    }
    try {
      const info = await stat(abs);
      if (!info.isFile() || info.size > MAX_CONTEXT_BYTES) continue;
      const content = await readFile(abs, 'utf-8');
      const rel = relative(root, abs) || raw.trim();
      blocks.push(`<context path="${rel}">\n${content}\n</context>`);
      files.push(rel);
    } catch {
      // Missing/unreadable mention — skip it, the prompt still streams.
    }
  }
  return { prefix: blocks.length ? blocks.join('\n') + '\n' : '', files };
}

// ── Prompt helpers ───────────────────────────────────────────────────────────

class TurnAborted extends Error {
  constructor() {
    super('turn aborted');
    this.name = 'TurnAborted';
  }
}

async function askLine(rl: Interface, prompt: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const answer = signal ? await rl.question(prompt, { signal }) : await rl.question(prompt);
    return answer;
  } catch {
    return null; // aborted (Ctrl+C) or closed
  }
}

// ── One agent turn-loop for a single user prompt ─────────────────────────────

type LoopResult = { inputChars: number; outputChars: number; turns: number; aborted: boolean };

async function runPrompt(opts: {
  rl: Interface | null;
  cwd: string;
  sessionId: string;
  model: string;
  upstream: Upstream;
  store: SessionStore;
  prompt: string;
  signal: AbortSignal;
}): Promise<LoopResult> {
  const { cwd, sessionId, model, upstream, store } = opts;
  const cfg = await loadConfig(cwd).catch(() => null);
  const permissions = cfg?.permissions;

  const registry = new ToolRegistry();
  for (const tool of buildBuiltinTools(cwd)) registry.register(tool);
  for (const tool of buildTodoTools({ sessionId })) registry.register(tool);
  const toolSystem = buildToolSystemPrompt(registry.list().map((t) => ({ name: t.name, description: t.description })));

  const { prefix, files } = await readContextBlocks(cwd, opts.prompt);
  if (files.length > 0) console.log(c.gray(`  context: ${files.join(', ')}`));
  const effectivePrompt = prefix ? `${prefix}${opts.prompt}` : opts.prompt;

  const historyMessages = await store.read(sessionId).catch(() => []);
  const messages: ProviderMessage[] = [
    { role: 'system', content: toolSystem },
    ...buildHistory(historyMessages),
    { role: 'user', content: effectivePrompt },
  ];
  await store.append(sessionId, { role: 'user', content: opts.prompt, timestamp: new Date().toISOString() }).catch(() => {});

  let inputChars = toolSystem.length + effectivePrompt.length;
  let outputChars = 0;
  let nudgedQuiet = false;

  const askUser = async (question: string, choices?: string[]): Promise<string | null> => {
    if (!opts.rl) return null;
    console.log(`\n${c.yellow('?')} ${c.bold(question)}`);
    if (choices && choices.length > 0) {
      choices.forEach((ch, i) => console.log(`  ${c.cyan(String(i + 1))}) ${ch}`));
      const raw = await askLine(opts.rl, c.dim('  answer (number or text): '), opts.signal);
      if (raw === null) return null;
      const n = Number(raw.trim());
      if (Number.isInteger(n) && n >= 1 && n <= choices.length) return choices[n - 1] as string;
      return raw;
    }
    const raw = await askLine(opts.rl, c.dim('  answer: '), opts.signal);
    return raw;
  };

  const askApproval = async (tool: string, description: string): Promise<'allow' | 'deny' | 'always' | null> => {
    if (!opts.rl) return null;
    const raw = await askLine(
      opts.rl,
      `\n${c.yellow('!')} ${c.bold(description)} ${c.dim(`[${tool}] — (a)llow / (d)eny / al(w)ays: `)}`,
      opts.signal,
    );
    if (raw === null) return null;
    const v = raw.trim().toLowerCase();
    if (v === 'w' || v === 'always' || v === 'alw') return 'always';
    if (v === 'a' || v === 'allow' || v === 'y' || v === 'yes' || v === '') return 'allow';
    return 'deny';
  };

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    if (opts.signal.aborted) return { inputChars, outputChars, turns: turn - 1, aborted: true };
    try {
      const { heartbeatSession } = await import('../todos/store.js');
      await heartbeatSession(sessionId).catch(() => {});
    } catch {
      // Best-effort — never break a turn.
    }

    const turnCtrl = new AbortController();
    const onParentAbort = (): void => turnCtrl.abort();
    opts.signal.addEventListener('abort', onParentAbort, { once: true });
    const timer = setTimeout(() => turnCtrl.abort(), TURN_TIMEOUT_MS);

    const filter = createBlockFilter();
    let clean = '';
    let streamFailed: unknown = null;
    try {
      for await (const chunk of aiStream({
        provider: upstream.provider,
        model,
        messages,
        apiKey: upstream.apiKey,
        baseUrl: upstream.baseUrl,
        signal: turnCtrl.signal,
        extraHeaders: { 'x-opencode-session': `lokma-${sessionId}` },
      })) {
        if (chunk.type === 'text_delta') {
          const visible = filter.push(chunk.delta);
          if (visible) {
            clean += visible;
            process.stdout.write(visible);
          }
        } else if (chunk.type === 'thinking_delta') {
          if (chunk.delta) process.stdout.write(c.gray(chunk.delta));
        } else if (chunk.type === 'done') {
          break;
        }
      }
    } catch (e) {
      streamFailed = e;
    } finally {
      clearTimeout(timer);
      opts.signal.removeEventListener('abort', onParentAbort);
    }

    if (streamFailed !== null) {
      if (opts.signal.aborted || turnCtrl.signal.aborted) {
        if (clean.trim()) {
          await store.append(sessionId, { role: 'assistant', content: clean, timestamp: new Date().toISOString() }).catch(() => {});
        }
        process.stdout.write('\n');
        console.log(c.yellow('[aborted]'));
        return { inputChars, outputChars: outputChars + clean.length, turns: turn, aborted: true };
      }
      const reason = streamFailed instanceof Error ? streamFailed.message : String(streamFailed);
      console.log(`\n${c.red('[run failed]')} ${reason.slice(0, 300)}`);
      await store
        .append(sessionId, { role: 'assistant', content: `[run failed: ${reason.slice(0, 300)}]`, timestamp: new Date().toISOString() })
        .catch(() => {});
      return { inputChars, outputChars, turns: turn, aborted: false };
    }

    const end = filter.finish();
    if (end.tail) {
      clean += end.tail;
      process.stdout.write(end.tail);
    }
    if (turn === 1 && !clean.trim() && end.toolCalls.length === 0 && end.asks.length === 0) {
      console.log(`\n${c.red('[run failed]')} model returned an empty response — please retry the prompt`);
      return { inputChars, outputChars, turns: turn, aborted: false };
    }
    outputChars += clean.length;
    if (clean.trim()) {
      await store.append(sessionId, { role: 'assistant', content: clean, timestamp: new Date().toISOString() }).catch(() => {});
    }

    const followUps: string[] = [];

    for (const call of end.toolCalls) {
      if (opts.signal.aborted) return { inputChars, outputChars, turns: turn, aborted: true };
      const callId = mintCallId();
      if (!call.tool || call.input === undefined) {
        const message = !call.tool ? 'Model emitted a <tool> block without a name' : `Model emitted invalid tool JSON: ${call.parseError ?? 'parse error'}`;
        console.log(`\n${c.red('✗')} ${c.dim(message)}`);
        followUps.push(`<tool_result tool="${call.tool || 'unknown'}" id="${callId}">ERROR bad_tool_block: ${message}</tool_result>`);
        continue;
      }
      console.log(`\n${c.cyan('◌')} ${c.bold(call.tool)} ${c.dim(JSON.stringify(call.input).slice(0, 200))}`);
      const outcome = await executeToolCall(registry, { tool: call.tool, input: call.input, permissions, callId });
      if (outcome.outcome === 'needs_approval') {
        const decision = await askApproval(outcome.tool, outcome.description);
        if (decision === null) return { inputChars, outputChars, turns: turn, aborted: true };
        if (decision === 'deny') {
          const message = `Denied by user: ${outcome.tool}`;
          console.log(`${c.red('✗')} denied`);
          await store
            .append(sessionId, { role: 'tool', content: JSON.stringify({ callId, ok: false, code: 'denied', message }), timestamp: new Date().toISOString(), toolCallId: callId, toolName: outcome.tool })
            .catch(() => {});
          followUps.push(`<tool_result tool="${outcome.tool}" id="${callId}">ERROR denied: ${message}</tool_result>`);
        } else {
          if (decision === 'always') {
            const allow = [...(permissions?.allow ?? [])];
            if (!allow.includes(outcome.tool)) {
              allow.push(outcome.tool);
              await saveGlobal({ permissions: { allow, deny: permissions?.deny ?? [], defaultMode: permissions?.defaultMode ?? 'auto' } }).catch(() => {});
              console.log(c.gray('  remembered: always allow ' + outcome.tool));
            }
          }
          const ran = await runApprovedCall(registry, { tool: outcome.tool, input: call.input, callId });
          if (ran.outcome === 'ok') {
            console.log(`${c.green('✓')} ${c.dim(JSON.stringify(ran.result).slice(0, 300))}`);
            await store
              .append(sessionId, { role: 'tool', content: JSON.stringify({ callId, ok: true, result: ran.result }), timestamp: new Date().toISOString(), toolCallId: callId, toolName: outcome.tool })
              .catch(() => {});
            followUps.push(`<tool_result tool="${outcome.tool}" id="${callId}">${JSON.stringify(ran.result)}</tool_result>`);
          } else {
            console.log(`${c.red('✗')} ${ran.code}: ${ran.message}`);
            await store
              .append(sessionId, { role: 'tool', content: JSON.stringify({ callId, ok: false, code: ran.code, message: ran.message }), timestamp: new Date().toISOString(), toolCallId: callId, toolName: outcome.tool })
              .catch(() => {});
            followUps.push(`<tool_result tool="${outcome.tool}" id="${callId}">ERROR ${ran.code}: ${ran.message}</tool_result>`);
          }
        }
      } else if (outcome.outcome === 'denied') {
        const message = `Denied by permissions: ${outcome.tool}`;
        console.log(`${c.red('✗')} denied by permissions`);
        await store
          .append(sessionId, { role: 'tool', content: JSON.stringify({ callId, ok: false, code: 'denied', message }), timestamp: new Date().toISOString(), toolCallId: callId, toolName: outcome.tool })
          .catch(() => {});
        followUps.push(`<tool_result tool="${outcome.tool}" id="${callId}">ERROR denied: ${message}</tool_result>`);
      } else if (outcome.outcome === 'ok') {
        console.log(`${c.green('✓')} ${c.dim(JSON.stringify(outcome.result).slice(0, 300))}`);
        await store
          .append(sessionId, { role: 'tool', content: JSON.stringify({ callId, ok: true, result: outcome.result }), timestamp: new Date().toISOString(), toolCallId: callId, toolName: call.tool })
          .catch(() => {});
        followUps.push(`<tool_result tool="${call.tool}" id="${callId}">${JSON.stringify(outcome.result)}</tool_result>`);
      } else {
        console.log(`${c.red('✗')} ${outcome.code}: ${outcome.message}`);
        await store
          .append(sessionId, { role: 'tool', content: JSON.stringify({ callId, ok: false, code: outcome.code, message: outcome.message }), timestamp: new Date().toISOString(), toolCallId: callId, toolName: call.tool })
          .catch(() => {});
        followUps.push(`<tool_result tool="${call.tool}" id="${callId}">ERROR ${outcome.code}: ${outcome.message}</tool_result>`);
      }
    }

    for (const ask of end.asks) {
      if (opts.signal.aborted) return { inputChars, outputChars, turns: turn, aborted: true };
      const answer = await askUser(ask.question || '(the model asked an empty question)', ask.choices);
      if (answer === null) return { inputChars, outputChars, turns: turn, aborted: true };
      followUps.push(`<answer question="${ask.question}">${answer}</answer>`);
    }

    if (followUps.length === 0) {
      const quietTurn = !clean.trim() && end.toolCalls.length === 0 && end.asks.length === 0;
      if (quietTurn && turn < MAX_TURNS && !nudgedQuiet) {
        nudgedQuiet = true;
        const nudge = '<system>You stopped without responding. Continue the user task now: emit the next <tool> block or write the answer.</system>';
        inputChars += nudge.length;
        messages.push({ role: 'user', content: nudge });
        continue;
      }
      process.stdout.write('\n');
      return { inputChars, outputChars, turns: turn, aborted: false };
    }
    const followUp = followUps.join('\n');
    inputChars += followUp.length;
    messages.push({ role: 'user', content: followUp });
  }

  console.log(c.yellow(`\n[paused after ${MAX_TURNS} tool turns with work still queued — say "continue"]`));
  return { inputChars, outputChars, turns: MAX_TURNS, aborted: false };
}

// ── REPL ─────────────────────────────────────────────────────────────────────

function printTuiHelp(): void {
  console.log(`
${c.bold('lokma tui')} — terminal agent chat (same harness as the Web UI)

${c.bold('Slash commands:')}
  /model [id]     show or switch model (e.g. /model openai/gpt-4o)
  /provider       show resolved provider, base URL, key status
  /session        show current session id
  /new            start a fresh session
  /resume <id>    switch to a saved session (same files as Web)
  /list           list sessions for this project
  /usage          session token/cost totals
  /doctor         run the 8 subsystem checks
  /clear          clear the screen
  /help           this help
  /quit           exit (Ctrl+C aborts the running turn, twice exits)

${c.bold('Tips:')} @path/to/file adds file context · write tools ask approval (allow/deny/always)
`);
}

function newSessionId(): string {
  return `tui-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
}

export async function runTui(opts: TuiOpts): Promise<void> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const store = new SessionStore(cwd);
  const cfg = await loadConfig(cwd).catch(() => null);

  let model = canonicalModelId(opts.model?.trim() || cfg?.defaultModel || 'anthropic/claude-sonnet-4-5');
  let upstream: Upstream;
  try {
    upstream = await resolveUpstream(cwd, model);
  } catch (e) {
    console.error(`${c.red('[lokma]')} ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  if (!upstream.apiKey && providerOf(model) !== 'ollama') {
    console.log(c.yellow(`[lokma] no API key for '${providerOf(model)}' — set it via the Web Providers tab, ~/.lokma/credentials.json, or env.`));
  }

  let sessionId = opts.sessionId?.trim() || newSessionId();
  await store.writeMeta(sessionId, { model }).catch(() => {});

  let totalIn = 0;
  let totalOut = 0;

  console.log(`${c.bold('◆ lokma')} ${c.dim(`tui · ${model} · session ${sessionId}`)}`);
  console.log(c.dim('Type /help for commands, /quit to exit. @file adds context.\n'));

  // One-shot (piped/scripted) mode — no readline, approvals auto-deny honestly.
  if (opts.prompt !== undefined) {
    const ctrl = new AbortController();
    const onSigint = (): void => ctrl.abort();
    process.on('SIGINT', onSigint);
    try {
      const result = await runPrompt({ rl: null, cwd, sessionId, model, upstream, store, prompt: opts.prompt, signal: ctrl.signal });
      totalIn += result.inputChars;
      totalOut += result.outputChars;
      const inTok = estimateTokens(totalIn);
      const outTok = estimateTokens(totalOut);
      const { costUsd, priced } = estimateCost(model, inTok, outTok);
      console.log(c.dim(`\n[${inTok} in / ${outTok} out · ${priced ? `$${costUsd.toFixed(4)}` : 'unpriced'}]`));
    } finally {
      process.off('SIGINT', onSigint);
    }
    return;
  }

  if (!process.stdin.isTTY) {
    console.error('[lokma] tui needs an interactive terminal — use `lokma tui -p "..."` for one-shot prompts.');
    process.exit(1);
  }

  const rl: Interface = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let turnCtrl: AbortController | null = null;
  let lastSigint = 0;
  rl.on('SIGINT', () => {
    if (turnCtrl) {
      turnCtrl.abort();
      return;
    }
    const now = Date.now();
    if (now - lastSigint < 1500) {
      console.log(c.dim('\nbye.'));
      rl.close();
      process.exit(0);
    }
    lastSigint = now;
    console.log(c.dim('\n(press Ctrl+C again to exit)'));
    rl.prompt(true);
  });

  const showUsage = (): void => {
    const inTok = estimateTokens(totalIn);
    const outTok = estimateTokens(totalOut);
    const { costUsd, priced } = estimateCost(model, inTok, outTok);
    console.log(c.dim(`session usage: ~${inTok} in / ~${outTok} out · ${priced ? `~$${costUsd.toFixed(4)}` : 'unpriced model'}`));
  };

  for (;;) {
    let line: string | null;
    try {
      line = await rl.question(c.bold('› '));
    } catch {
      break; // closed
    }
    const input = (line ?? '').trim();
    if (!input) continue;

    // ── Slash commands ──
    if (input.startsWith('/')) {
      const [cmd, ...rest] = input.slice(1).split(/\s+/);
      const arg = rest.join(' ').trim();
      switch (cmd) {
        case 'help':
          printTuiHelp();
          continue;
        case 'quit':
        case 'exit':
        case 'q':
          console.log(c.dim('bye.'));
          rl.close();
          return;
        case 'clear':
          console.clear();
          continue;
        case 'model':
          if (!arg) {
            console.log(`  model: ${c.bold(model)}`);
          } else {
            model = canonicalModelId(arg);
            try {
              upstream = await resolveUpstream(cwd, model);
            } catch (e) {
              console.log(`${c.red('[model]')} ${e instanceof Error ? e.message : String(e)}`);
              continue;
            }
            await store.writeMeta(sessionId, { model }).catch(() => {});
            console.log(`  model → ${c.bold(model)}`);
          }
          continue;
        case 'provider': {
          const pid = providerOf(model);
          const key = await resolveApiKey(pid);
          console.log(`  provider: ${c.bold(pid)}`);
          console.log(`  baseUrl:  ${upstream.baseUrl}`);
          console.log(`  key:      ${key ? `set (…${key.slice(-4)})` : c.yellow('missing')}`);
          continue;
        }
        case 'session':
          console.log(`  session: ${sessionId}`);
          continue;
        case 'new':
          sessionId = newSessionId();
          totalIn = 0;
          totalOut = 0;
          await store.writeMeta(sessionId, { model }).catch(() => {});
          console.log(`  new session: ${sessionId}`);
          continue;
        case 'resume': {
          if (!arg) {
            console.log('  usage: /resume <session-id>');
            continue;
          }
          const messages = await store.read(arg).catch(() => []);
          if (messages.length === 0) {
            const meta = await store.readMeta(arg).catch(() => null);
            if (!meta) {
              console.log(`  ${c.red('unknown session:')} ${arg}`);
              continue;
            }
          }
          sessionId = arg;
          totalIn = 0;
          totalOut = 0;
          const meta = await store.readMeta(sessionId).catch(() => null);
          if (meta?.model) {
            model = canonicalModelId(meta.model);
            try {
              upstream = await resolveUpstream(cwd, model);
            } catch {
              // Keep the previous upstream; the run will fail honestly.
            }
          }
          console.log(`  resumed: ${sessionId} (${messages.length} messages)`);
          continue;
        }
        case 'list': {
          const ids = await store.list().catch(() => []);
          if (ids.length === 0) {
            console.log('  no sessions for this project yet');
            continue;
          }
          for (const id of ids.slice(-20)) {
            const mark = id === sessionId ? c.green('* ') : '  ';
            console.log(`${mark}${id}`);
          }
          continue;
        }
        case 'usage':
          showUsage();
          continue;
        case 'doctor': {
          const { runDoctor } = await import('./doctor.js');
          await runDoctor();
          continue;
        }
        case 'config': {
          const live = await loadConfig(cwd).catch(() => null);
          console.log(JSON.stringify({ model, theme: live?.theme, defaultMode: live?.permissions.defaultMode }, null, 2));
          continue;
        }
        default:
          console.log(`  unknown command /${cmd} — try /help`);
          continue;
      }
    }

    // ── Agent turn ──
    turnCtrl = new AbortController();
    try {
      const meta = await store.readMeta(sessionId).catch(() => null);
      if (!meta) await store.writeMeta(sessionId, { model }).catch(() => {});
      else if (!meta.model) await store.writeMeta(sessionId, { model }).catch(() => {});
      else {
        const existing = await store.read(sessionId).catch(() => []);
        if (existing.length === 0) await store.writeMeta(sessionId, { title: input.slice(0, 60) }).catch(() => {});
      }
      const result = await runPrompt({ rl, cwd, sessionId, model, upstream, store, prompt: input, signal: turnCtrl.signal });
      totalIn += result.inputChars;
      totalOut += result.outputChars;
      const inTok = estimateTokens(result.inputChars);
      const outTok = estimateTokens(result.outputChars);
      const { costUsd, priced } = estimateCost(model, inTok, outTok);
      console.log(c.dim(`\n[${inTok} in / ${outTok} out · ${priced ? `$${costUsd.toFixed(4)}` : 'unpriced'} · turn ${result.turns}]`));
      try {
        await new UsageLedger(cwd).record({
          sessionId,
          provider: providerOf(model),
          model,
          inputTokens: inTok,
          outputTokens: outTok,
          costUsd,
          priced,
        });
      } catch {
        // Accounting must never break chat.
      }
    } catch (e) {
      if (e instanceof TurnAborted) console.log(c.yellow('\n[aborted]'));
      else console.log(`\n${c.red('[error]')} ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      turnCtrl = null;
    }
  }

  rl.close();
}
