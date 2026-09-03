import { cp, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { BotSchema, type Agent, type Bot } from 'lokma-shared';
import { createAgent, slugifyName } from '../agents/registry.js';
import { SessionStore } from '../session/index.js';
import { writeAtomic } from '../utils/fs.js';
import { BUNDLED_BOTS } from './bundled.js';

/**
 * Bot registry — shareable specialist packages (`bot.json`, Docs/35).
 * Global root `~/.lokma/bots/<id>/bot.json`, project overlay
 * `<cwd>/.lokma/bots/<id>/bot.json` (project shadows global, global
 * shadows bundled on id collision), plus the read-only bundled
 * `lokma-ceo` template. Same store for CLI + web — one loop, like
 * sessions/agents. Running a bot spawns a REAL agent (createdBy
 * `bot:<id>`, SOUL = systemPrompt) plus a REAL session the pane can
 * open — never a fake run row.
 * See Docs/35-BOTS-lokma-bots.md §3, §4, §7.
 */

/** Global bot root (same for CLI + web). */
export const BOTS_DIR = '~/.lokma/bots';
/** Max bot dirs scanned per root (the pane renders rows, not a list). */
export const BOT_LIST_CAP = 200;
/** Max bytes of one knowledge file copied on fork. */
export const BOT_KNOWLEDGE_CAP = 512 * 1024;
/** Max task chars accepted by `runBotAsAgent()`. */
export const BOT_TASK_CAP = 2000;

const BOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** Typed error — routes map `code`/`status` straight into `{ code, message }`. */
export class BotError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'BotError';
    this.code = code;
    this.status = status;
  }
}

function globalRoot(): string {
  return join(homedir(), '.lokma', 'bots');
}

function projectRoot(cwd: string): string {
  return join(cwd, '.lokma', 'bots');
}

function botDir(id: string): string {
  return join(globalRoot(), id);
}

export function assertBotId(raw: unknown): string {
  if (typeof raw !== 'string' || !BOT_ID_PATTERN.test(raw)) {
    throw new BotError('bad_bot_id', 'Invalid bot id (1-64 chars, letters/digits/_/-)', 400);
  }
  return raw;
}

function assertName(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 60) {
    throw new BotError('bad_name', 'name must be 1-60 chars', 400);
  }
  return raw.trim();
}

function assertDescription(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 500) {
    throw new BotError('bad_description', 'description must be 1-500 chars', 400);
  }
  return raw.trim();
}

function assertSystemPrompt(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 20_000) {
    throw new BotError('bad_prompt', 'systemPrompt must be 1-20000 chars', 400);
  }
  return raw;
}

function assertModel(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 200) {
    throw new BotError('bad_model', 'model must be a non-empty string (e.g. anthropic/claude-opus-4)', 400);
  }
  return raw.trim();
}

const LIST_FIELDS: Array<{ key: string; maxItems: number; maxLen: number; code: string }> = [
  { key: 'fallback', maxItems: 10, maxLen: 200, code: 'bad_fallback' },
  { key: 'tools', maxItems: 50, maxLen: 100, code: 'bad_tools' },
  { key: 'skills', maxItems: 50, maxLen: 100, code: 'bad_skills' },
  { key: 'mcpServers', maxItems: 20, maxLen: 100, code: 'bad_mcp' },
  { key: 'knowledgeFiles', maxItems: 50, maxLen: 300, code: 'bad_knowledge' },
  { key: 'tags', maxItems: 20, maxLen: 60, code: 'bad_tags' },
];

function assertStringList(raw: unknown, maxItems: number, maxLen: number, code: string): string[] {
  if (!Array.isArray(raw) || raw.length > maxItems) {
    throw new BotError(code, `must be an array of at most ${maxItems} strings`, 400);
  }
  for (const item of raw) {
    if (typeof item !== 'string' || !item || item.length > maxLen) {
      throw new BotError(code, `each entry must be 1-${maxLen} chars`, 400);
    }
  }
  return raw as string[];
}

function assertMemoryScope(raw: unknown): Bot['memoryScope'] {
  if (raw !== 'bot' && raw !== 'project' && raw !== 'user' && raw !== 'isolated') {
    throw new BotError('bad_memory_scope', 'memoryScope must be bot|project|user|isolated', 400);
  }
  return raw;
}

function assertVisibility(raw: unknown): Bot['visibility'] {
  if (raw !== 'private' && raw !== 'shared' && raw !== 'public') {
    throw new BotError('bad_visibility', 'visibility must be private|shared|public', 400);
  }
  return raw;
}

function assertVersion(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > 32) {
    throw new BotError('bad_version', 'version must be 1-32 chars', 400);
  }
  return raw.trim();
}

function assertTask(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.trim().length > BOT_TASK_CAP) {
    throw new BotError('bad_task', `task must be 1-${BOT_TASK_CAP} chars`, 400);
  }
  return raw.trim();
}

export type BotBudgetsInput = { maxTokens?: unknown; maxUsd?: unknown; maxTurns?: unknown };

/**
 * Validate a budgets object, returning ONLY the provided keys (partial).
 * Callers merge over stored/default values — PATCH never clobbers
 * untouched keys (same contract as agents `assertBudgets`).
 */
function assertBudgets(budgets: unknown): Partial<Bot['budgets']> | undefined {
  if (budgets === undefined) return undefined;
  if (typeof budgets !== 'object' || budgets === null || Array.isArray(budgets)) {
    throw new BotError('bad_budgets', 'budgets must be { maxTokens?, maxUsd?, maxTurns? }', 400);
  }
  const { maxTokens, maxUsd, maxTurns } = budgets as BotBudgetsInput;
  const out: Partial<Bot['budgets']> = {};
  if (maxTokens !== undefined) {
    if (typeof maxTokens !== 'number' || !Number.isInteger(maxTokens) || maxTokens <= 0 || maxTokens > 100_000_000) {
      throw new BotError('bad_budgets', 'budgets.maxTokens must be a positive int (<= 100M)', 400);
    }
    out.maxTokens = maxTokens;
  }
  if (maxUsd !== undefined) {
    if (typeof maxUsd !== 'number' || !(maxUsd > 0) || maxUsd > 100_000) {
      throw new BotError('bad_budgets', 'budgets.maxUsd must be a positive number (<= 100000)', 400);
    }
    out.maxUsd = maxUsd;
  }
  if (maxTurns !== undefined) {
    if (typeof maxTurns !== 'number' || !Number.isInteger(maxTurns) || maxTurns <= 0 || maxTurns > 1000) {
      throw new BotError('bad_budgets', 'budgets.maxTurns must be a positive int (<= 1000)', 400);
    }
    out.maxTurns = maxTurns;
  }
  return out;
}

/** Parse one bot dir — null when missing/corrupt (lists skip, never crash). */
async function readBotDir(dir: string, source: Bot['source']): Promise<Bot | null> {
  try {
    const raw = await readFile(join(dir, 'bot.json'), 'utf-8');
    const parsed = BotSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return { ...parsed.data, source };
  } catch {
    return null;
  }
}

async function scanRoot(root: string, source: Bot['source'], into: Map<string, Bot>): Promise<void> {
  let entries: Array<{ isDirectory: () => boolean; name: string }>;
  try {
    entries = (await readdir(root, { withFileTypes: true })) as Array<{
      isDirectory: () => boolean;
      name: string;
    }>;
  } catch {
    return;
  }
  let seen = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || seen >= BOT_LIST_CAP) continue;
    seen += 1;
    const bot = await readBotDir(join(root, entry.name), source);
    if (bot && !into.has(bot.id)) into.set(bot.id, bot);
  }
}

/**
 * List every bot: bundled templates + global root + project overlay
 * (when `cwd` is given). Project shadows global, global shadows
 * bundled on id collision. Featured first, then by name.
 */
export async function listBots(cwd?: string): Promise<{ bots: Bot[]; count: number }> {
  const into = new Map<string, Bot>();
  for (const bundled of BUNDLED_BOTS) {
    if (!into.has(bundled.id)) into.set(bundled.id, bundled);
  }
  await scanRoot(globalRoot(), 'global', into);
  if (cwd) await scanRoot(projectRoot(cwd), 'project', into);
  const bots = [...into.values()].sort(
    (a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name),
  );
  return { bots, count: bots.length };
}

/** Find one bot by id (project → global → bundled). Null when absent. */
export async function getBot(id: string, cwd?: string): Promise<Bot | null> {
  assertBotId(id);
  if (cwd) {
    const project = await readBotDir(join(projectRoot(cwd), id), 'project');
    if (project) return project;
  }
  const global = await readBotDir(botDir(id), 'global');
  if (global) return global;
  return BUNDLED_BOTS.find((b) => b.id === id) ?? null;
}

async function requireBot(id: string, cwd?: string): Promise<Bot> {
  const bot = await getBot(id, cwd);
  if (!bot) throw new BotError('bot_not_found', `Bot '${id}' not found`, 404);
  return bot;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

export type CreateBotInput = {
  id?: unknown;
  name: unknown;
  description?: unknown;
  systemPrompt?: unknown;
  model?: unknown;
  fallback?: unknown;
  tools?: unknown;
  skills?: unknown;
  mcpServers?: unknown;
  knowledgeFiles?: unknown;
  memoryScope?: unknown;
  budgets?: unknown;
  visibility?: unknown;
  version?: unknown;
  createdFrom?: unknown;
  tags?: unknown;
  author?: unknown;
};

/** Create a user bot under the global root (409 when the id is taken). */
export async function createBot(input: CreateBotInput): Promise<Bot> {
  const name = assertName(input.name);
  let id: string;
  if (input.id !== undefined) {
    id = assertBotId(input.id);
    if (await getBot(id)) throw new BotError('bot_exists', `Bot '${id}' already exists`, 409);
  } else {
    id = `${slugifyName(name)}-${randomSuffix()}`;
    for (let i = 0; i < 5 && (await getBot(id)); i += 1) {
      id = `${slugifyName(name)}-${randomSuffix()}`;
    }
    if (await getBot(id)) throw new BotError('bot_exists', 'Generated bot id collided — retry', 409);
  }
  const bot = BotSchema.parse({
    id,
    name,
    description:
      input.description !== undefined ? assertDescription(input.description) : `Custom bot: ${name}`,
    systemPrompt:
      input.systemPrompt !== undefined
        ? assertSystemPrompt(input.systemPrompt)
        : `# SOUL — ${name}\n\nCustom bot.\n`,
    model: input.model !== undefined ? assertModel(input.model) : 'anthropic/claude-4-sonnet',
    fallback: input.fallback !== undefined ? assertStringList(input.fallback, 10, 200, 'bad_fallback') : [],
    tools: input.tools !== undefined ? assertStringList(input.tools, 50, 100, 'bad_tools') : [],
    skills: input.skills !== undefined ? assertStringList(input.skills, 50, 100, 'bad_skills') : [],
    mcpServers:
      input.mcpServers !== undefined ? assertStringList(input.mcpServers, 20, 100, 'bad_mcp') : [],
    knowledgeFiles:
      input.knowledgeFiles !== undefined
        ? assertStringList(input.knowledgeFiles, 50, 300, 'bad_knowledge')
        : [],
    memoryScope: input.memoryScope !== undefined ? assertMemoryScope(input.memoryScope) : 'bot',
    budgets: {
      maxTokens: 80_000,
      maxUsd: 2,
      maxTurns: 40,
      ...assertBudgets(input.budgets),
    },
    visibility: input.visibility !== undefined ? assertVisibility(input.visibility) : 'private',
    version: input.version !== undefined ? assertVersion(input.version) : '1.0.0',
    ...(typeof input.createdFrom === 'string' && input.createdFrom
      ? { createdFrom: input.createdFrom.slice(0, 200) }
      : {}),
    tags: input.tags !== undefined ? assertStringList(input.tags, 20, 60, 'bad_tags') : [],
    ...(typeof input.author === 'string' && input.author.trim()
      ? { author: input.author.trim().slice(0, 60) }
      : {}),
    createdAt: new Date().toISOString(),
    featured: false,
    source: 'global',
  });
  await writeAtomic(join(botDir(id), 'bot.json'), JSON.stringify(bot, null, 2));
  return bot;
}

export type BotPatch = {
  name?: unknown;
  avatar?: unknown;
  description?: unknown;
  systemPrompt?: unknown;
  model?: unknown;
  fallback?: unknown;
  tools?: unknown;
  skills?: unknown;
  mcpServers?: unknown;
  knowledgeFiles?: unknown;
  memoryScope?: unknown;
  budgets?: unknown;
  visibility?: unknown;
  version?: unknown;
  tags?: unknown;
  author?: unknown;
};

/** Edit a user bot (bundled templates are read-only — fork to customize). */
export async function patchBot(id: string, patch: BotPatch): Promise<Bot> {
  const bot = await requireBot(assertBotId(id));
  if (bot.source === 'bundled') {
    throw new BotError('bundled_readonly', 'Bundled bots are read-only — fork to customize', 400);
  }
  const touched = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined);
  if (touched.length === 0) throw new BotError('empty_patch', 'Nothing to update', 400);
  const next: Bot = { ...bot };
  if (patch.name !== undefined) next.name = assertName(patch.name);
  if (patch.avatar !== undefined) {
    next.avatar =
      typeof patch.avatar === 'string' && patch.avatar.trim()
        ? patch.avatar.trim().slice(0, 64)
        : undefined;
  }
  if (patch.description !== undefined) next.description = assertDescription(patch.description);
  if (patch.systemPrompt !== undefined) next.systemPrompt = assertSystemPrompt(patch.systemPrompt);
  if (patch.model !== undefined) next.model = assertModel(patch.model);
  for (const { key, maxItems, maxLen, code } of LIST_FIELDS) {
    const value = (patch as Record<string, unknown>)[key];
    if (value !== undefined) {
      (next as unknown as Record<string, string[]>)[key] = assertStringList(value, maxItems, maxLen, code);
    }
  }
  if (patch.memoryScope !== undefined) next.memoryScope = assertMemoryScope(patch.memoryScope);
  if (patch.visibility !== undefined) next.visibility = assertVisibility(patch.visibility);
  if (patch.version !== undefined) next.version = assertVersion(patch.version);
  if (patch.author !== undefined) {
    next.author =
      typeof patch.author === 'string' && patch.author.trim()
        ? patch.author.trim().slice(0, 60)
        : undefined;
  }
  const budgets = assertBudgets(patch.budgets);
  if (budgets) next.budgets = { ...next.budgets, ...budgets };
  // Fail closed — a half-valid patch never reaches disk.
  const saved = BotSchema.parse(next);
  await writeAtomic(join(botDir(id), 'bot.json'), JSON.stringify(saved, null, 2));
  return saved;
}

/** Resolve a bot's on-disk dir (bundled bots have none — null). */
async function sourceDirOf(bot: Bot, cwd?: string): Promise<string | null> {
  if (bot.source === 'project' && cwd) return join(projectRoot(cwd), bot.id);
  if (bot.source === 'global') return botDir(bot.id);
  return null;
}

/** Copy existing knowledge files into a fork (best-effort — knowledge is optional). */
async function copyKnowledge(srcDir: string, dstDir: string, files: string[]): Promise<void> {
  for (const rel of files) {
    if (typeof rel !== 'string' || !rel || resolve(sep, rel) === rel || rel.split('/').includes('..')) continue;
    const from = join(srcDir, rel);
    if (!from.startsWith(srcDir + sep)) continue;
    try {
      const st = await stat(from);
      if (!st.isFile() || st.size > BOT_KNOWLEDGE_CAP) continue;
      await mkdir(dirname(join(dstDir, rel)), { recursive: true });
      await cp(from, join(dstDir, rel));
    } catch {
      // Missing/unreadable knowledge never blocks a fork.
    }
  }
}

/**
 * Fork any bot (bundled included) into a new private user bot.
 * Copies `bot.json` + existing knowledge files; provenance lands in
 * `createdFrom: bot:<src>` (the Gallery fork chain).
 */
export async function forkBot(id: string, as?: unknown, cwd?: string): Promise<Bot> {
  const src = await requireBot(assertBotId(id), cwd);
  let target: string;
  if (as !== undefined) {
    target = assertBotId(as);
    if (await getBot(target, cwd)) throw new BotError('bot_exists', `Bot '${target}' already exists`, 409);
  } else {
    target = `${src.id}-fork`;
    if (!BOT_ID_PATTERN.test(target)) target = `fork-${randomSuffix()}`;
    if (await getBot(target, cwd)) target = `${src.id}-fork-${randomSuffix()}`;
    for (let i = 0; i < 5 && (await getBot(target, cwd)); i += 1) {
      target = `${src.id}-fork-${randomSuffix()}`;
    }
    if (await getBot(target, cwd)) throw new BotError('bot_exists', 'Generated bot id collided — retry', 409);
  }
  const forked = BotSchema.parse({
    ...src,
    id: target,
    visibility: 'private',
    createdFrom: `bot:${src.id}`,
    createdAt: new Date().toISOString(),
    featured: false,
    source: 'global',
  });
  const dst = botDir(target);
  await mkdir(dst, { recursive: true });
  await writeAtomic(join(dst, 'bot.json'), JSON.stringify(forked, null, 2));
  const srcDir = await sourceDirOf(src, cwd);
  if (srcDir) await copyKnowledge(srcDir, dst, src.knowledgeFiles);
  return forked;
}

/** Publish a user bot — flips `visibility` (shared/public gallery legs). */
export async function publishBot(id: string, visibility: unknown): Promise<Bot> {
  const bot = await requireBot(assertBotId(id));
  if (bot.source === 'bundled') {
    throw new BotError('bundled_readonly', 'Bundled bots are read-only — fork to customize', 400);
  }
  const next = BotSchema.parse({ ...bot, visibility: assertVisibility(visibility) });
  await writeAtomic(join(botDir(id), 'bot.json'), JSON.stringify(next, null, 2));
  return next;
}

/** Same id scheme as POST /api/sessions (no central helper yet — keep in sync). */
function newSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export type BotRunResult = { agent: Agent; sessionId: string };

/**
 * Run a bot — spawns a REAL agent (SOUL = systemPrompt, budgets mapped,
 * `createdBy: bot:<id>` so the Gallery can count live agents) plus a REAL
 * session the pane opens for playground chat. The agent starts idle: run
 * execution (queued/running) lands with the agent runner, a later wave —
 * the pane says so instead of faking a transcript.
 */
export async function runBotAsAgent(
  id: string,
  task: unknown,
  opts?: { cwd?: string },
): Promise<BotRunResult> {
  const bot = await requireBot(assertBotId(id), opts?.cwd);
  const cleanTask = assertTask(task);
  // Agent names cap at 40 chars (bot names at 60) — slice the runtime copy.
  const agent = await createAgent({
    name: bot.name.slice(0, 40),
    model: bot.model,
    budgets: { tokens: bot.budgets.maxTokens, usd: bot.budgets.maxUsd },
    soul: bot.systemPrompt,
    createdBy: `bot:${bot.id}`,
  });
  const sessionCwd = opts?.cwd ?? process.cwd();
  const store = new SessionStore(sessionCwd);
  const sessionId = newSessionId();
  await store.append(sessionId, {
    role: 'assistant',
    content: `Bot ${bot.id} run started: ${cleanTask.slice(0, 200)}`,
    timestamp: new Date().toISOString(),
  });
  await store.writeMeta(sessionId, { model: bot.model });
  return { agent, sessionId };
}
