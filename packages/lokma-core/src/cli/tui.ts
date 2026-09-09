import { randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { createInterface, type Interface } from 'node:readline/promises';
import { stream as aiStream, type ProviderMessage } from 'lokma-ai';
import { loadConfig, saveGlobal } from '../config/loader.js';
import { RepoGit } from '../git/git.js';
import { SessionStore } from '../session/store.js';
import { compactSession, compactionStatus, transcriptChars } from '../session/compaction.js';
import type { SessionMessage } from '../session/types.js';
import { ToolRegistry } from '../tools/registry.js';
import { buildBuiltinTools } from '../tools/builtins.js';
import { buildTodoTools } from '../tools/todos.js';
import { buildToolSystemPrompt, createBlockFilter } from '../tools/parse.js';
import { executeToolCall, mintCallId, runApprovedCall } from '../tools/executor.js';
import { describeToolCall } from '../tools/gate.js';
import { estimateCost, estimateTokens } from '../usage/pricing.js';
import { UsageLedger } from '../usage/ledger.js';
import { listThemes } from '../themes/themes.js';
import { resolveInRoot } from '../files/files.js';
import { listProviderViews, providerNeedsKey, resolveProviderUpstream } from '../providers/providers.js';
import { createPaint, type Paint } from './tui-paint.js';
import {
  addCustomProvider,
  getMergedCatalogTui,
  hiddenInput,
  loginFlow,
  logoutFlow,
  removeCustomProvider,
  renderProviderTable,
  resolveChatKey,
  setModelEnabled,
  setProviderEnabled,
  testProvider,
} from './tui-providers.js';

/**
 * Lokma TUI — Claude-Code UX over the real harness loop.
 *
 * Layout mirrors Claude Code (welcome box, `>` prompt, tool cards,
 * numbered permission/question cards, status line) while every color
 * comes from the active Lokma theme (OMP indigo by default — same
 * `chalk` tokens as `themes/*.json`). The agent engine is the shared
 * harness path: `lokma-ai stream()`, core tool registry + gated
 * executor, `<tool>`/`<ask>` blocks, JSONL sessions the Web harness
 * reads. Provider registry, login, and model catalog are the terminal
 * twins of the Web Providers/Models tabs (one core implementation).
 * Zero TUI dependencies — readline + ANSI only (PowerShell/cmd/POSIX).
 * See Docs/10 §slash-commands + Docs/11 §TUI-kimliği.
 */

export type TuiOpts = {
  cwd?: string;
  model?: string;
  sessionId?: string;
  /** One-shot mode: run a single prompt, print the answer, exit. */
  prompt?: string;
};

const VERSION = '0.0.1';
const MAX_TURNS = 15;
const TURN_TIMEOUT_MS = 180_000;
const MAX_CONTEXT_FILES = 5;
const MAX_CONTEXT_BYTES = 20 * 1024;

/** Canonical harness id: adapters strip `provider/`, so `::` becomes `/`. */
export function canonicalModelId(model: string): string {
  return model.replace(/::/g, '/');
}

function providerOf(model: string): string {
  const canon = canonicalModelId(model);
  const slash = canon.indexOf('/');
  return slash >= 0 ? canon.slice(0, slash) : canon;
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
  const mentions = [...prompt.matchAll(/@([^\s@][^\s]*)/g)].map((m) => m[1]).filter((part): part is string => !!part);
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

async function askLine(rl: Interface, prompt: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const answer = signal ? await rl.question(prompt, { signal }) : await rl.question(prompt);
    return answer;
  } catch {
    return null; // aborted (Ctrl+C) or closed
  }
}

/** Numbered pick list (Claude-Code card style) — returns the chosen item or null. */
async function pickNumbered<T>(
  rl: Interface,
  p: Paint,
  title: string,
  items: { label: string; value: T }[],
  signal?: AbortSignal,
): Promise<T | null> {
  console.log(`\n${p.box(items.map((item, i) => `  ${p.info(String(i + 1))}) ${item.label}`), title, p.primary)}`);
  const raw = await askLine(rl, p.muted('  choice (number): '), signal);
  if (raw === null) return null;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 1 || n > items.length) return null;
  return items[n - 1]?.value ?? null;
}

// ── One agent turn-loop for a single user prompt ─────────────────────────────

type Upstream = { provider: 'anthropic' | 'openai'; baseUrl: string; apiKey: string | null };
type LoopResult = { inputChars: number; outputChars: number; turns: number; aborted: boolean };

async function runPrompt(opts: {
  p: Paint;
  rl: Interface | null;
  cwd: string;
  sessionId: string;
  model: string;
  upstream: Upstream;
  store: SessionStore;
  prompt: string;
  signal: AbortSignal;
}): Promise<LoopResult> {
  const { p, cwd, sessionId, model, upstream, store } = opts;
  const cfg = await loadConfig(cwd).catch(() => null);
  const permissions = cfg?.permissions;

  const registry = new ToolRegistry();
  for (const tool of buildBuiltinTools(cwd)) registry.register(tool);
  for (const tool of buildTodoTools({ sessionId })) registry.register(tool);
  const toolSystem = buildToolSystemPrompt(registry.list().map((t) => ({ name: t.name, description: t.description })));

  const { prefix, files } = await readContextBlocks(cwd, opts.prompt);
  if (files.length > 0) console.log(p.muted(`  context: ${files.join(', ')}`));
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
    if (choices && choices.length > 0) {
      const picked = await pickNumbered(
        opts.rl,
        p,
        question || '(the model asked an empty question)',
        choices.map((ch) => ({ label: ch, value: ch })),
        opts.signal,
      );
      if (picked !== null) return picked;
      const raw = await askLine(opts.rl, p.muted('  answer (free text): '), opts.signal);
      return raw;
    }
    console.log(`\n${p.warn('?')} ${p.bold(question)}`);
    const raw = await askLine(opts.rl, p.muted('  answer: '), opts.signal);
    return raw;
  };

  const askApproval = async (tool: string, description: string): Promise<'allow' | 'deny' | 'always' | null> => {
    if (!opts.rl) return null;
    const picked = await pickNumbered<{ v: 'allow' | 'deny' | 'always' }>(
      opts.rl,
      p,
      `${description}  ${p.muted(`[${tool}]`)}`,
      [
        { label: 'Yes, run it', value: { v: 'allow' } },
        { label: 'Yes, and remember for this tool', value: { v: 'always' } },
        { label: 'No, deny', value: { v: 'deny' } },
      ],
      opts.signal,
    );
    return picked?.v ?? null;
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
    console.log('');
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
            process.stdout.write(p.text(visible));
          }
        } else if (chunk.type === 'thinking_delta') {
          if (chunk.delta) process.stdout.write(p.dim(chunk.delta));
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
        console.log(p.warn('[aborted]'));
        return { inputChars, outputChars: outputChars + clean.length, turns: turn, aborted: true };
      }
      const reason = streamFailed instanceof Error ? streamFailed.message : String(streamFailed);
      console.log(`\n${p.err('[run failed]')} ${reason.slice(0, 300)}`);
      await store
        .append(sessionId, { role: 'assistant', content: `[run failed: ${reason.slice(0, 300)}]`, timestamp: new Date().toISOString() })
        .catch(() => {});
      return { inputChars, outputChars, turns: turn, aborted: false };
    }

    const end = filter.finish();
    if (end.tail) {
      clean += end.tail;
      process.stdout.write(p.text(end.tail));
    }
    if (turn === 1 && !clean.trim() && end.toolCalls.length === 0 && end.asks.length === 0) {
      console.log(`\n${p.err('[run failed]')} model returned an empty response — please retry the prompt`);
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
        console.log(`\n${p.err(`${p.symbols.fail} ${call.tool || 'unknown'}`)} ${p.muted(message)}`);
        followUps.push(`<tool_result tool="${call.tool || 'unknown'}" id="${callId}">ERROR bad_tool_block: ${message}</tool_result>`);
        continue;
      }
      const argPreview = JSON.stringify(call.input);
      console.log(`\n${p.primary(p.symbols.dot)} ${p.bold(call.tool)} ${p.muted(argPreview.length > 160 ? argPreview.slice(0, 160) + '…' : argPreview)}`);
      const outcome = await executeToolCall(registry, { tool: call.tool, input: call.input, permissions, callId });
      if (outcome.outcome === 'needs_approval') {
        const decision = await askApproval(outcome.tool, describeToolCall(outcome.tool, call.input));
        if (decision === null) return { inputChars, outputChars, turns: turn, aborted: true };
        if (decision === 'deny') {
          const message = `Denied by user: ${outcome.tool}`;
          console.log(`  ${p.err(`${p.symbols.fail} denied`)}`);
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
              console.log(p.muted('  remembered: always allow ' + outcome.tool));
            }
          }
          const ran = await runApprovedCall(registry, { tool: outcome.tool, input: call.input, callId });
          if (ran.outcome === 'ok') {
            const preview = JSON.stringify(ran.result);
            console.log(`  ${p.ok(`${p.symbols.ok}`)} ${p.muted(preview.length > 240 ? preview.slice(0, 240) + '…' : preview)}`);
            await store
              .append(sessionId, { role: 'tool', content: JSON.stringify({ callId, ok: true, result: ran.result }), timestamp: new Date().toISOString(), toolCallId: callId, toolName: outcome.tool })
              .catch(() => {});
            followUps.push(`<tool_result tool="${outcome.tool}" id="${callId}">${JSON.stringify(ran.result)}</tool_result>`);
          } else {
            console.log(`  ${p.err(`${p.symbols.fail} ${ran.code}`)} ${p.muted(ran.message.slice(0, 200))}`);
            await store
              .append(sessionId, { role: 'tool', content: JSON.stringify({ callId, ok: false, code: ran.code, message: ran.message }), timestamp: new Date().toISOString(), toolCallId: callId, toolName: outcome.tool })
              .catch(() => {});
            followUps.push(`<tool_result tool="${outcome.tool}" id="${callId}">ERROR ${ran.code}: ${ran.message}</tool_result>`);
          }
        }
      } else if (outcome.outcome === 'denied') {
        const message = `Denied by permissions: ${outcome.tool}`;
        console.log(`  ${p.err(`${p.symbols.fail} denied by permissions`)}`);
        await store
          .append(sessionId, { role: 'tool', content: JSON.stringify({ callId, ok: false, code: 'denied', message }), timestamp: new Date().toISOString(), toolCallId: callId, toolName: outcome.tool })
          .catch(() => {});
        followUps.push(`<tool_result tool="${outcome.tool}" id="${callId}">ERROR denied: ${message}</tool_result>`);
      } else if (outcome.outcome === 'ok') {
        const preview = JSON.stringify(outcome.result);
        console.log(`  ${p.ok(`${p.symbols.ok}`)} ${p.muted(preview.length > 240 ? preview.slice(0, 240) + '…' : preview)}`);
        await store
          .append(sessionId, { role: 'tool', content: JSON.stringify({ callId, ok: true, result: outcome.result }), timestamp: new Date().toISOString(), toolCallId: callId, toolName: call.tool })
          .catch(() => {});
        followUps.push(`<tool_result tool="${call.tool}" id="${callId}">${JSON.stringify(outcome.result)}</tool_result>`);
      } else {
        console.log(`  ${p.err(`${p.symbols.fail} ${outcome.code}`)} ${p.muted(outcome.message.slice(0, 200))}`);
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

  console.log(p.warn(`\n[paused after ${MAX_TURNS} tool turns with work still queued — say "continue"]`));
  return { inputChars, outputChars, turns: MAX_TURNS, aborted: false };
}

// ── Slash commands ───────────────────────────────────────────────────────────

type SlashDef = { name: string; hint: string; desc: string; aliases?: string[] };

export const SLASH_COMMANDS: SlashDef[] = [
  { name: '/model', hint: '[id]', desc: 'Show or switch model (live catalog picker)' },
  { name: '/models', hint: '[on|off <id>|refresh]', desc: 'Refresh + enable/disable models' },
  { name: '/providers', hint: '[on|off|test|add|rm …]', desc: 'Multi-provider management (Web Providers twin)' },
  { name: '/login', hint: '[provider]', desc: 'Log in: API key (verified) or OAuth device flow' },
  { name: '/logout', hint: '<provider>', desc: 'Remove stored credential' },
  { name: '/theme', hint: '[id]', desc: 'List or switch theme (omp/claude/midnight/paper)' },
  { name: '/status', hint: '', desc: 'Version, model, account, connection, git' },
  { name: '/cost', hint: '', desc: 'Session token/cost totals', aliases: ['usage'] },
  { name: '/context', hint: '', desc: 'Transcript size vs history window' },
  { name: '/compact', hint: '', desc: 'Compact transcript (hygiene + summary tiers)' },
  { name: '/export', hint: '[file]', desc: 'Export transcript to markdown' },
  { name: '/permissions', hint: '[mode|allow|deny …]', desc: 'Show/edit tool permission rules', aliases: ['allowed-tools'] },
  { name: '/session', hint: '', desc: 'Show current session id' },
  { name: '/new', hint: '', desc: 'Start a fresh session', aliases: ['reset', 'clear'] },
  { name: '/resume', hint: '<id>', desc: 'Switch to a saved session', aliases: ['continue'] },
  { name: '/list', hint: '', desc: 'List sessions for this project' },
  { name: '/doctor', hint: '', desc: 'Run the 8 subsystem checks' },
  { name: '/config', hint: '', desc: 'Show effective config', aliases: ['settings'] },
  { name: '/help', hint: '', desc: 'This help' },
  { name: '/quit', hint: '', desc: 'Exit', aliases: ['exit', 'q'] },
];

/** Every accepted slash spelling (canonical + aliases), without the `/`. */
const KNOWN_SLASH = new Set<string>();
for (const c of SLASH_COMMANDS) {
  KNOWN_SLASH.add(c.name.slice(1));
  for (const a of c.aliases ?? []) KNOWN_SLASH.add(a);
}

/** Fuzzy rank for the `/` palette: prefix > substring > subsequence. */
export function fuzzySlash(frag: string): SlashDef[] {
  const f = frag.toLowerCase();
  const scored: { def: SlashDef; score: number }[] = [];
  for (const def of SLASH_COMMANDS) {
    const name = def.name.slice(1).toLowerCase();
    let score = 0;
    if (name.startsWith(f)) score = 3;
    else if (name.includes(f)) score = 2;
    else {
      let j = 0;
      for (const ch of name) {
        if (ch === f[j]) j++;
        if (j === f.length) break;
      }
      if (j === f.length) score = 1;
    }
    if (score > 0) scored.push({ def, score });
  }
  scored.sort((a, b) => b.score - a.score || a.def.name.localeCompare(b.def.name));
  return scored.map((s) => s.def);
}

function printSlashHelp(p: Paint): void {
  const rows = SLASH_COMMANDS.map((c) => {
    const alias = c.aliases?.length ? p.muted(` (=${c.aliases.map((a) => '/' + a).join(', ')})`) : '';
    return `  ${p.info(c.name.padEnd(13))} ${p.muted(c.hint.padEnd(20))} ${c.desc}${alias}`;
  });
  console.log(`\n${p.box(rows, 'lokma tui — slash commands', p.primary)}`);
  console.log(p.muted('\nTips: type / alone for this palette · Tab completes as you type · @path adds file context.'));
}

function newSessionId(): string {
  return `tui-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
}

async function gitSegment(cwd: string): Promise<string> {
  try {
    const st = await new RepoGit(cwd).status();
    if (!st.repo) return '';
    const dirty = st.counts.changed + st.counts.unstaged + st.counts.staged;
    return `${st.branch}${dirty > 0 ? `*${dirty}` : ''}`;
  } catch {
    return '';
  }
}

function shortCwd(cwd: string): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
  if (home && cwd.startsWith(home)) return '~' + cwd.slice(home.length);
  const parts = cwd.split(/[/\\]/).filter(Boolean);
  return parts.length > 3 ? '…/' + parts.slice(-3).join('/') : cwd;
}

/** 5x5 block font for the LOKMA wordmark (OMP π-gate twin, our letters). */
const LOGO_FONT: Record<string, string[]> = {
  L: ['X....', 'X....', 'X....', 'X....', 'XXXXX'],
  O: ['.XXX.', 'X...X', 'X...X', 'X...X', '.XXX.'],
  K: ['X...X', 'X..X.', 'XXX..', 'X..X.', 'X...X'],
  M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'],
  A: ['.XXX.', 'X...X', 'XXXXX', 'X...X', 'X...X'],
};

function logoLines(p: Paint): string[] {
  const block = process.env.LOKMA_ASCII ? '#' : '█';
  const colors = [p.primary, p.info];
  const rows: string[] = [];
  for (let r = 0; r < 5; r++) {
    let row = '';
    'LOKMA'.split('').forEach((ch, i) => {
      const cells = ((LOGO_FONT[ch] ?? [])[r] ?? '').split('').map((c) => (c === 'X' ? block : ' ')).join('');
      row += (colors[i % colors.length] as (s: string) => string)(cells) + ' ';
    });
    rows.push(row);
  }
  return rows;
}

const WELCOME_TIPS = [
  'Add @path to attach file context to your prompt.',
  'Tab completes /commands, @files and model ids.',
  'Ctrl+C aborts the running turn — twice exits.',
  '/compact squeezes the transcript when context runs thin.',
  '/providers test <id> checks a provider connection live.',
  '/models refresh pulls the live model catalog.',
];

/** Visible length (ANSI stripped) for terminal layout math. */
function visLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function padVis(s: string, n: number): string {
  const len = visLen(s);
  return len >= n ? s : s + ' '.repeat(n - len);
}

function truncPlain(s: string, n: number): string {
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s;
}

function ago(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export type WelcomeData = {
  version: string;
  model: string;
  sessionId: string;
  cwdShort: string;
  theme: string;
  views: { id: string; keySet: boolean; last4: string | null }[];
  summaries: { title: string; id: string; updatedAt: string }[];
  hasCredential: boolean;
  columns: number;
};

/**
 * OMP-gate welcome panel (pure render — unit-tested headless).
 * Two columns: LOKMA block wordmark + welcome + model left;
 * tips + recent sessions right; rotating tip + connection line below.
 */
export function renderWelcomePanel(p: Paint, d: WelcomeData): string {
  const out: string[] = [];
  const W = Math.min(100, Math.max(56, d.columns - 2));
  const ascii = !!process.env.LOKMA_ASCII;
  const H = ascii ? '-' : '─';
  const V = ascii ? '|' : '│';
  const TL = ascii ? '+' : '╭';
  const TR = ascii ? '+' : '╮';
  const BL = ascii ? '+' : '╰';
  const BR = ascii ? '+' : '╯';
  const B = p.border;

  if (W < 74) {
    return p.box(
      [
        `${p.bold(`◆ lokma v${d.version}`)}  ${p.muted('terminal harness')}`,
        ``,
        `  model    ${p.primary(d.model)}${d.hasCredential ? '' : p.warn('  (no credential — /login)')}`,
        `  session  ${p.muted(d.sessionId)}`,
        `  cwd      ${p.muted(d.cwdShort)}`,
        ``,
        `  ${p.muted('Type /help for commands · /login to authenticate · /quit to exit.')}`,
      ],
      undefined,
      p.primary,
    );
  }

  const inner = W - 2;
  const leftW = 32;
  const rightW = inner - leftW - 5;
  const title = ` lokma v${d.version} `;
  out.push(B(TL + H + title + H.repeat(Math.max(0, inner - title.length - 2)) + H + TR));

  const left: string[] = [
    '',
    ...logoLines(p),
    '',
    d.summaries.length > 0 ? p.bold('Welcome back!') : p.bold('Welcome!'),
    p.primary(truncPlain(d.model, leftW)),
    p.muted(`${d.summaries.length} session(s) · ${d.theme}`),
  ];
  const bullet = ascii ? '*' : '•';
  const right: string[] = [
    p.info('Tips'),
    `/ for commands`,
    `@ for file context`,
    `Tab to complete`,
    '',
    p.info('Recent sessions'),
    ...d.summaries.slice(0, 4).map((s) => {
      const when = `(${ago(s.updatedAt)})`;
      const title = truncPlain(s.title || s.id, Math.max(8, rightW - bullet.length - 1 - when.length - 1));
      return `${bullet} ${title} ${p.muted(when)}`;
    }),
  ];
  if (d.summaries.length === 0) right.push(p.muted('No sessions yet — say hi below.'));

  const rows = Math.max(left.length, right.length);
  for (let i = 0; i < rows; i++) {
    out.push(`${B(V)} ${padVis(left[i] ?? '', leftW)} ${B(V)} ${padVis(right[i] ?? '', rightW)} ${B(V)}`);
  }
  out.push(B(BL + H.repeat(inner) + BR));

  const tip = !d.hasCredential
    ? `Run /login to authenticate a provider — keys are verified live before saving.`
    : WELCOME_TIPS[Math.floor(Date.now() / 86_400_000) % WELCOME_TIPS.length] ?? '';
  out.push('', `${p.warn('Tip:')} ${p.muted(truncPlain(tip, W))}`);

  const connFull = d.views
    .map((v) => `${v.id} ${v.keySet ? p.ok(`…${v.last4 ?? '????'}`) : p.muted('no key')}`)
    .join(p.muted(' · '));
  if (visLen(connFull) <= W) {
    out.push(`${p.muted('Connected:')} ${connFull}`);
  } else {
    const keyed = d.views.filter((v) => v.keySet).map((v) => `${v.id} (…${v.last4 ?? '????'})`);
    out.push(
      `${p.muted('Connected:')} ${keyed.length ? keyed.join(', ') : 'none'} ${p.muted(`(+${d.views.length - keyed.length} without key)`)}`,
    );
  }
  out.push('');
  return out.join('\n');
}

export async function runTui(opts: TuiOpts): Promise<void> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const store = new SessionStore(cwd);
  let cfg = await loadConfig(cwd).catch(() => null);
  let p = createPaint(cfg?.theme ?? 'omp');

  let model = canonicalModelId(opts.model?.trim() || cfg?.defaultModel || 'anthropic/claude-sonnet-4-5');
  const resolveUpstreamFor = async (modelId: string): Promise<Upstream> => {
    const base = await resolveProviderUpstream(providerOf(modelId));
    const chatKey = await resolveChatKey(providerOf(modelId));
    return { ...base, apiKey: chatKey };
  };
  let upstream: Upstream;
  try {
    upstream = await resolveUpstreamFor(model);
  } catch (e) {
    console.error(`${p.err('[lokma]')} ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  if (!upstream.apiKey && providerNeedsKey(providerOf(model))) {
    console.log(p.warn(`[lokma] no credential for '${providerOf(model)}' — run /login ${providerOf(model)} to authenticate.`));
  }

  let sessionId = opts.sessionId?.trim() || newSessionId();
  await store.writeMeta(sessionId, { model }).catch(() => {});

  let totalIn = 0;
  let totalOut = 0;
  let sessionCache: string[] = await store.list().catch(() => []);
  let modelCache: string[] = [];
  let providerCache: string[] = [];

  const refreshModelCache = async (): Promise<void> => {
    try {
      modelCache = (await getMergedCatalogTui()).filter((m) => m.enabled).map((m) => m.id);
    } catch {
      modelCache = [];
    }
    try {
      providerCache = (await listProviderViews()).map((v) => v.id);
    } catch {
      providerCache = [];
    }
  };
  await refreshModelCache();

  const usageLine = (inChars: number, outChars: number): string => {
    const inTok = estimateTokens(inChars);
    const outTok = estimateTokens(outChars);
    const { costUsd, priced } = estimateCost(model, inTok, outTok);
    return `${inTok} in / ${outTok} out · ${priced ? `$${costUsd.toFixed(4)}` : 'unpriced'}`;
  };

  const statusLine = async (): Promise<void> => {
    const git = await gitSegment(cwd);
    console.log(
      p.status([
        `${p.primary(p.symbols.diamond)} ${p.bold(model)}`,
        p.muted(shortCwd(cwd)),
        git ? p.info(git) : '',
        p.muted(usageLine(totalIn, totalOut)),
      ]),
    );
  };

const showWelcome = async (): Promise<void> => {
  const views = await listProviderViews().catch(() => []);
  const summaries = await store.listSummaries().catch(() => []);
  console.log(
    renderWelcomePanel(p, {
      version: VERSION,
      model,
      sessionId,
      cwdShort: shortCwd(cwd),
      theme: cfg?.theme ?? 'omp',
      views,
      summaries: summaries.map((s) => ({ title: s.title, id: s.id, updatedAt: s.updatedAt })),
      hasCredential: upstream.apiKey !== null,
      columns: process.stdout.columns ?? 80,
    }),
  );
};

  // One-shot (piped/scripted) mode — no readline, approvals auto-deny honestly.
  if (opts.prompt !== undefined) {
    const ctrl = new AbortController();
    const onSigint = (): void => ctrl.abort();
    process.on('SIGINT', onSigint);
    try {
      const result = await runPrompt({ p, rl: null, cwd, sessionId, model, upstream, store, prompt: opts.prompt, signal: ctrl.signal });
      totalIn += result.inputChars;
      totalOut += result.outputChars;
      console.log(p.muted(`\n[${usageLine(totalIn, totalOut)}]`));
    } finally {
      process.off('SIGINT', onSigint);
    }
    return;
  }

  if (!process.stdin.isTTY) {
    console.error('[lokma] tui needs an interactive terminal — use `lokma tui -p "..."` for one-shot prompts.');
    process.exit(1);
  }

  await showWelcome();


  const completeSlash = (line: string): [string[], string] => {
    if (line.startsWith('/')) {
      const spaceAt = line.indexOf(' ');
      if (spaceAt === -1) {
        const frag = line;
        const hits = SLASH_COMMANDS.map((c) => c.name).filter((n) => n.startsWith(frag));
        return [hits, frag];
      }
      const cmd = line.slice(0, spaceAt);
      const frag = line.slice(spaceAt + 1);
      if (cmd === '/model' || cmd === '/models') {
        const pool = [...modelCache, 'on ', 'off ', 'refresh'];
        return [pool.filter((m) => m.startsWith(frag)), frag];
      }
      if (cmd === '/resume') return [sessionCache.filter((s) => s.startsWith(frag)), frag];
      if (cmd === '/theme') return [listThemes().map((t) => t.id).filter((t) => t.startsWith(frag)), frag];
      if (cmd === '/login' || cmd === '/logout') {
        return [providerCache.filter((id) => id.startsWith(frag)), frag];
      }
      if (cmd === '/providers') {
        const pool = ['on ', 'off ', 'test ', 'add ', 'rm ', ...providerCache];
        return [pool.filter((s) => s.startsWith(frag)), frag];
      }
      return [[], frag];
    }
    const atAt = line.lastIndexOf('@');
    if (atAt >= 0) {
      const frag = line.slice(atAt + 1);
      const dirPart = frag.includes('/') ? frag.slice(0, frag.lastIndexOf('/') + 1) : '';
      try {
        const dir = resolve(cwd, dirPart || '.');
        const names = readdirSync(dir, { withFileTypes: true })
          .map((e) => (e.isDirectory() ? e.name + '/' : e.name))
          .filter((n) => n.startsWith(frag.slice(dirPart.length)))
          .map((n) => '@' + dirPart + n);
        return [names, '@' + frag];
      } catch {
        return [[], line];
      }
    }
    return [[], line];
  };

  const rl: Interface = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    completer: completeSlash,
  });
  let turnCtrl: AbortController | null = null;
  let lastSigint = 0;
  rl.on('SIGINT', () => {
    if (turnCtrl) {
      turnCtrl.abort();
      return;
    }
    const now = Date.now();
    if (now - lastSigint < 1500) {
      console.log(p.muted('\nbye.'));
      rl.close();
      process.exit(0);
    }
    lastSigint = now;
    console.log(p.muted('\n(press Ctrl+C again to exit)'));
    rl.prompt(true);
  });

  const recordUsage = async (inChars: number, outChars: number): Promise<void> => {
    try {
      const inTok = estimateTokens(inChars);
      const outTok = estimateTokens(outChars);
      const { costUsd, priced } = estimateCost(model, inTok, outTok);
      await new UsageLedger(cwd).record({ sessionId, provider: providerOf(model), model, inputTokens: inTok, outputTokens: outTok, costUsd, priced });
    } catch {
      // Accounting must never break chat.
    }
  };

  for (;;) {
    let line: string | null;
    try {
      line = await rl.question(p.primary('> '));
    } catch {
      break; // closed
    }
    const input = (line ?? '').trim();
    if (!input) continue;

    // ── Slash commands ──
    if (input.startsWith('/')) {
      const [rawCmd, ...rest] = input.slice(1).split(/\s+/);
      let cmd = (rawCmd ?? '').toLowerCase();
      const arg = rest.join(' ').trim();
      // Bare `/` opens the palette (command discovery, OMP `/` hints).
      if (!cmd) {
        printSlashHelp(p);
        continue;
      }
      // Fuzzy palette for typos/partials (`/lg` → /login, /logout).
      if (!KNOWN_SLASH.has(cmd)) {
        const matches = fuzzySlash(cmd).slice(0, 8);
        if (matches.length === 0) {
          console.log(`  unknown command /${cmd} — try /help`);
          continue;
        }
        const picked = await pickNumbered(
          rl,
          p,
          `/${cmd} — did you mean`,
          matches.map((m) => ({ label: `${m.name} — ${m.desc}`, value: m.name })),
        );
        if (!picked) continue;
        cmd = picked.slice(1);
      }
      try {
        switch (cmd) {
          case 'help':
            printSlashHelp(p);
            continue;
          case 'quit':
          case 'exit':
          case 'q':
            console.log(p.muted('bye.'));
            rl.close();
            return;
          case 'clear':
          case 'reset':
          case 'new': {
            sessionId = newSessionId();
            totalIn = 0;
            totalOut = 0;
            await store.writeMeta(sessionId, { model }).catch(() => {});
            sessionCache = await store.list().catch(() => []);
            console.log(p.muted(`  new session: ${sessionId}`));
            continue;
          }
          case 'model': {
            if (!arg) {
              const enabled = modelCache.filter((m) => m.startsWith(providerOf(model) + '/')).slice(0, 20);
              console.log(`  model: ${p.bold(model)}`);
              if (enabled.length > 0) {
                console.log(p.muted('  enabled for this provider:'));
                enabled.forEach((m, i) => console.log(`    ${p.info(String(i + 1))}) ${m}`));
                console.log(p.muted('  /model <number|id> to switch'));
              } else {
                console.log(p.muted('  (catalog empty — /models refresh to probe providers)'));
              }
              continue;
            }
            const n = Number(arg);
            const picked = Number.isInteger(n) && n >= 1 ? modelCache.filter((m) => m.startsWith(providerOf(model) + '/'))[n - 1] : undefined;
            const next = canonicalModelId(picked ?? arg);
            const nextUpstream = await resolveUpstreamFor(next);
            model = next;
            upstream = nextUpstream;
            await store.writeMeta(sessionId, { model }).catch(() => {});
            console.log(`  model → ${p.bold(model)}${upstream.apiKey ? '' : p.warn('  (no credential — /login)')}`);
            continue;
          }
          case 'models': {
            const parts = arg.split(/\s+/).filter(Boolean);
            if (parts[0] === 'refresh' || parts.length === 0) {
              console.log(p.muted('  refreshing catalog (live probes, ~6s each)…'));
              const { invalidateCatalog } = await import('lokma-ai');
              invalidateCatalog();
              await refreshModelCache();
            }
            if (parts[0] === 'on' || parts[0] === 'off') {
              const id = canonicalModelId(parts.slice(1).join(' '));
              if (!id) {
                console.log('  usage: /models on|off <id>');
                continue;
              }
              await setModelEnabled(id, parts[0] === 'on');
              await refreshModelCache();
              console.log(`  ${id} → ${parts[0] === 'on' ? p.ok('enabled') : p.muted('disabled')}`);
              continue;
            }
            const catalog = await getMergedCatalogTui();
            const mine = catalog.filter((m) => m.provider === providerOf(model));
            console.log(`  ${p.bold('models')} ${p.muted(`(${catalog.length} total, ${catalog.filter((m) => m.enabled).length} enabled)`)}`);
            for (const m of mine.slice(0, 30)) {
              const mark = m.id === model ? p.primary('→ ') : '  ';
              const state = m.enabled ? '' : p.muted(' [off]');
              console.log(`${mark}${m.id}${state}`);
            }
            if (mine.length > 30) console.log(p.muted(`  … +${mine.length - 30} more for this provider`));
            continue;
          }
          case 'providers': {
            const parts = arg.split(/\s+/).filter(Boolean);
            const sub = (parts[0] ?? '').toLowerCase();
            if (!sub) {
              console.log(await renderProviderTable(p));
              continue;
            }
            if ((sub === 'on' || sub === 'off') && parts[1]) {
              const updated = await setProviderEnabled(parts[1], sub === 'on');
              console.log(`  ${updated.id} → ${updated.enabled ? p.ok('enabled') : p.muted('disabled')}`);
              await refreshModelCache();
              continue;
            }
            if (sub === 'test' && parts[1]) {
              console.log(p.muted(`  probing ${parts[1]}…`));
              const res = await testProvider(parts[1]);
              console.log(res.ok ? `  ${p.ok('ok')} ${res.detail}` : `  ${p.err('fail')} ${res.detail}`);
              continue;
            }
            if (sub === 'add') {
              const [id, name, baseUrl] = parts.slice(1);
              if (!id || !name || !baseUrl) {
                console.log('  usage: /providers add <id> <name> <baseUrl>');
                continue;
              }
              const key = await hiddenInput(rl, p.muted('  api key (empty to skip): '));
              const created = await addCustomProvider({ id, name, baseUrl, apiKey: key?.trim() ? key.trim() : undefined });
              console.log(`  ${p.ok('added')} ${created.id} → ${created.baseUrl}`);
              await refreshModelCache();
              continue;
            }
            if ((sub === 'rm' || sub === 'remove') && parts[1]) {
              await removeCustomProvider(parts[1]);
              console.log(`  ${p.muted('removed')} ${parts[1]}`);
              await refreshModelCache();
              continue;
            }
            console.log('  usage: /providers [on|off|test <id> | add <id> <name> <baseUrl> | rm <id>]');
            continue;
          }
          case 'login': {
            const res = await loginFlow(rl, p, arg || undefined);
            upstream = await resolveUpstreamFor(model);
            console.log(`\n  ${p.ok(`${p.symbols.ok} logged in`)} ${p.bold(res.providerId)} ${p.muted(`(${res.via === 'oauth' ? 'OAuth' : 'API key'} · ${res.detail})`)}`);
            continue;
          }
          case 'logout': {
            console.log(`  ${await logoutFlow(arg || undefined)}`);
            upstream = await resolveUpstreamFor(model).catch(() => upstream);
            continue;
          }
          case 'theme': {
            if (!arg) {
              console.log(`  theme: ${p.bold(cfg?.theme ?? 'omp')}`);
              for (const t of listThemes()) console.log(`    ${p.info(t.id)} — ${t.label}`);
              continue;
            }
            const found = listThemes().find((t) => t.id === arg);
            if (!found) {
              console.log(`  unknown theme: ${arg} (${listThemes().map((t) => t.id).join(', ')})`);
              continue;
            }
            await saveGlobal({ theme: found.id as 'omp' | 'claude' | 'midnight' | 'paper' });
            cfg = await loadConfig(cwd).catch(() => cfg);
            p = createPaint(found.id);
            console.log(`  theme → ${p.bold(found.id)} ${p.muted(found.label)}`);
            continue;
          }
          case 'status': {
            const git = await gitSegment(cwd);
            const views = await listProviderViews();
            const view = views.find((v) => v.id === providerOf(model));
            const msgs = await store.read(sessionId).catch(() => []);
            console.log(
              p.box(
                [
                  `lokma v${VERSION} · ${p.bold(model)}`,
                  `provider  ${view ? `${view.name} (${view.enabled ? p.ok('on') : p.err('off')})` : p.err('unknown')} · ${upstream.apiKey ? p.ok('credential set') : p.warn('no credential')}`,
                  `session   ${p.muted(sessionId)} · ${msgs.length} messages`,
                  `cwd       ${p.muted(shortCwd(cwd))}${git ? ` · ${p.info(git)}` : ''}`,
                  `theme     ${cfg?.theme ?? 'omp'} · usage ${usageLine(totalIn, totalOut)}`,
                ],
                'status',
                p.primary,
              ),
            );
            continue;
          }
          case 'cost':
          case 'usage': {
            console.log(p.muted(`  session usage: ~${usageLine(totalIn, totalOut)}`));
            continue;
          }
          case 'context': {
            const msgs = await store.read(sessionId).catch(() => []);
            const chars = transcriptChars(msgs);
            console.log(
              `  transcript: ${msgs.length} messages · ~${chars.toLocaleString()} chars (~${estimateTokens(chars).toLocaleString()} tokens) · window 30 msgs / 48k chars`,
            );
            continue;
          }
          case 'compact': {
            console.log(p.muted('  compacting transcript…'));
            try {
              const before = await compactionStatus(cwd, sessionId);
              const report = await compactSession(cwd, sessionId, { mode: 'full' });
              console.log(
                report.compacted
                  ? `  ${p.ok('compacted')}: ${before.messages} → ${report.afterMessages} msgs · ${before.chars.toLocaleString()} → ${report.afterChars.toLocaleString()} chars`
                  : `  ${p.muted('below thresholds — nothing to compact')}`,
              );
            } catch (e) {
              console.log(`  ${p.err('compact failed:')} ${e instanceof Error ? e.message : String(e)}`);
            }
            continue;
          }
          case 'export': {
            const msgs = await store.read(sessionId).catch(() => []);
            const file = arg || `session-${sessionId}.md`;
            const abs = resolve(cwd, file);
            if (resolveInRoot(resolve(cwd), file) !== abs) {
              console.log(`  ${p.err('refusing path outside workspace')}`);
              continue;
            }
            const md = [`# lokma session ${sessionId}`, ``, `model: ${model} · exported ${new Date().toISOString()}`, ``];
            for (const m of msgs) {
              const who = m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : `tool:${m.toolName ?? '?'}`;
              md.push(`## ${who}`, ``, m.content, ``);
            }
            await writeFile(abs, md.join('\n'), 'utf-8');
            console.log(`  ${p.ok('exported')} ${msgs.length} messages → ${file}`);
            continue;
          }
          case 'permissions':
          case 'allowed-tools': {
            const parts = arg.split(/\s+/).filter(Boolean);
            const live = await loadConfig(cwd).catch(() => null);
            const perms = live?.permissions ?? { allow: [], deny: [], defaultMode: 'auto' as const };
            if (parts.length === 0) {
              console.log(`  mode: ${p.bold(perms.defaultMode)} · allow: [${perms.allow.join(', ') || '—'}] · deny: [${perms.deny.join(', ') || '—'}]`);
              console.log(p.muted('  /permissions mode <auto|manual|plan|acceptEdits|bypass> · allow|deny|unallow|undeny <tool>'));
              continue;
            }
            if (parts[0] === 'mode' && parts[1]) {
              const modes = ['auto', 'manual', 'plan', 'acceptEdits', 'bypass'] as const;
              if (!(modes as readonly string[]).includes(parts[1])) {
                console.log(`  unknown mode: ${parts[1]}`);
                continue;
              }
              await saveGlobal({ permissions: { ...perms, defaultMode: parts[1] as (typeof modes)[number] } });
              console.log(`  defaultMode → ${p.bold(parts[1])}`);
              continue;
            }
            if ((parts[0] === 'allow' || parts[0] === 'deny') && parts[1]) {
              const key = parts[0] as 'allow' | 'deny';
              const list = [...perms[key]];
              if (!list.includes(parts[1])) list.push(parts[1]);
              await saveGlobal({ permissions: { ...perms, [key]: list } });
              console.log(`  ${key} +${parts[1]}`);
              continue;
            }
            if ((parts[0] === 'unallow' || parts[0] === 'undeny') && parts[1]) {
              const key = parts[0] === 'unallow' ? 'allow' : 'deny';
              await saveGlobal({ permissions: { ...perms, [key]: perms[key].filter((t) => t !== parts[1]) } });
              console.log(`  ${key} −${parts[1]}`);
              continue;
            }
            console.log('  usage: /permissions [mode <m> | allow|deny|unallow|undeny <tool>]');
            continue;
          }
          case 'session':
            console.log(`  session: ${sessionId}`);
            continue;
          case 'resume':
          case 'continue': {
            if (!arg) {
              console.log('  usage: /resume <session-id>');
              continue;
            }
            const messages = await store.read(arg).catch(() => []);
            const meta = await store.readMeta(arg).catch(() => null);
            if (messages.length === 0 && !meta) {
              console.log(`  ${p.err('unknown session:')} ${arg}`);
              continue;
            }
            sessionId = arg;
            totalIn = 0;
            totalOut = 0;
            if (meta?.model) {
              model = canonicalModelId(meta.model);
              try {
                upstream = await resolveUpstreamFor(model);
              } catch {
                // Keep the previous upstream; the run will fail honestly.
              }
            }
            console.log(`  resumed: ${sessionId} (${messages.length} messages)`);
            continue;
          }
          case 'list': {
            sessionCache = await store.list().catch(() => []);
            if (sessionCache.length === 0) {
              console.log('  no sessions for this project yet');
              continue;
            }
            for (const id of sessionCache.slice(-20)) {
              const mark = id === sessionId ? p.primary('* ') : '  ';
              console.log(`${mark}${id}`);
            }
            continue;
          }
          case 'doctor': {
            const { runDoctor } = await import('./doctor.js');
            await runDoctor();
            continue;
          }
          case 'config':
          case 'settings': {
            const live = await loadConfig(cwd).catch(() => null);
            console.log(JSON.stringify({ model, theme: live?.theme, defaultMode: live?.permissions.defaultMode }, null, 2));
            continue;
          }
          default:
            printSlashHelp(p);
            continue;
        }
      } catch (e) {
        console.log(`  ${p.err('error:')} ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
    }

    // ── Agent turn ──
    turnCtrl = new AbortController();
    try {
      const meta = await store.readMeta(sessionId).catch(() => null);
      if (!meta || !meta.model) {
        await store.writeMeta(sessionId, { model }).catch(() => {});
      } else {
        const existing = await store.read(sessionId).catch(() => []);
        if (existing.length === 0) await store.writeMeta(sessionId, { title: input.slice(0, 60) }).catch(() => {});
      }
      const result = await runPrompt({ p, rl, cwd, sessionId, model, upstream, store, prompt: input, signal: turnCtrl.signal });
      totalIn += result.inputChars;
      totalOut += result.outputChars;
      await recordUsage(result.inputChars, result.outputChars);
      await statusLine();
    } catch (e) {
      console.log(`\n${p.err('[error]')} ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      turnCtrl = null;
    }
  }

  rl.close();
}
