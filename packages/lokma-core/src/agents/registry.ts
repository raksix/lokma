import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { AgentSchema, PersonaSchema, type Agent, type AgentState } from 'lokma-shared';

/**
 * Agent registry — durable entities under ~/.lokma/agents/<id>/.
 * Each agent owns config.json (+ SOUL.md + MEMORY.md + IDENTITY.json).
 * The registry is the Hub's source of truth; live runs/queue drain land
 * with the orchestration wave (W4-14) — until then states are registry
 * writes (pause/resume/kill) with guarded transitions, never invented.
 * See Docs/30-AGENT-SYSTEM §2, §5, §12
 */

/** Registry caps (Docs/30 §5) — the server 429s past maxAgents. */
export const AGENT_MAX_AGENTS = 20;
export const AGENT_MAX_CONCURRENT = 5;
export const AGENT_MAX_QUEUE = 20;

/** Max SOUL.md / MEMORY.md bytes accepted (abuse guard, mirrors file caps). */
export const AGENT_DOC_CAP = 256 * 1024;

/** Typed error — routes map `code`/`status` straight into `{ code, message }`. */
export class AgentError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
    this.status = status;
  }
}

const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function agentDir(id: string): string {
  return join(homedir(), '.lokma', 'agents', id);
}

function assertAgentId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !AGENT_ID_PATTERN.test(id)) {
    throw new AgentError('bad_agent_id', 'Invalid agent id (1-64 chars, letters/digits/_/-)', 400);
  }
}

/** Slug a display name into an id stem (`Reviewer 2` -> `reviewer-2`). */
export function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'agent';
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

function assertName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) {
    throw new AgentError('bad_name', 'name must be 1-40 chars', 400);
  }
}

function assertModel(model: unknown): asserts model is string {
  if (typeof model !== 'string' || !model.trim() || model.trim().length > 200) {
    throw new AgentError('bad_model', 'model must be a non-empty string (e.g. anthropic/claude-4-sonnet)', 400);
  }
}

/** Cwd must be an existing directory when given (same rule as terminal spawn). */
async function assertCwd(cwd: unknown): Promise<void> {
  if (cwd === undefined) return;
  if (typeof cwd !== 'string' || !cwd.trim()) {
    throw new AgentError('bad_cwd', 'cwd must be an existing directory path', 400);
  }
  try {
    const st = await stat(cwd);
    if (!st.isDirectory()) throw new AgentError('bad_cwd', 'cwd is not a directory', 400);
  } catch (e) {
    if (e instanceof AgentError) throw e;
    throw new AgentError('bad_cwd', 'cwd does not exist', 400);
  }
}

export type AgentBudgetsInput = { tokens?: unknown; usd?: unknown };

/**
 * Validate a budgets object, returning ONLY the provided keys (partial).
 * Callers merge over stored/default values themselves — this keeps PATCH
 * from clobbering untouched keys with defaults.
 */
function assertBudgets(budgets: unknown): { tokens?: number; usd?: number } | undefined {
  if (budgets === undefined) return undefined;
  if (typeof budgets !== 'object' || budgets === null || Array.isArray(budgets)) {
    throw new AgentError('bad_budgets', 'budgets must be { tokens?, usd? }', 400);
  }
  const { tokens, usd } = budgets as AgentBudgetsInput;
  const out: { tokens?: number; usd?: number } = {};
  if (tokens !== undefined) {
    if (typeof tokens !== 'number' || !Number.isInteger(tokens) || tokens <= 0 || tokens > 100_000_000) {
      throw new AgentError('bad_budgets', 'budgets.tokens must be a positive int (<= 100M)', 400);
    }
    out.tokens = tokens;
  }
  if (usd !== undefined) {
    if (typeof usd !== 'number' || !(usd > 0) || usd > 100_000) {
      throw new AgentError('bad_budgets', 'budgets.usd must be a positive number (<= 100000)', 400);
    }
    out.usd = usd;
  }
  return out;
}

function assertDocContent(content: unknown): asserts content is string {
  if (typeof content !== 'string') {
    throw new AgentError('bad_content', 'content must be a string', 400);
  }
  if (Buffer.byteLength(content, 'utf-8') > AGENT_DOC_CAP) {
    throw new AgentError('too_large', `content must be under ${AGENT_DOC_CAP} bytes`, 400);
  }
}

async function saveAgent(agent: Agent): Promise<void> {
  await writeFile(join(agentDir(agent.id), 'config.json'), JSON.stringify(agent, null, 2), 'utf-8');
}

export type CreateAgentOpts = {
  /** Optional explicit id (must match the id pattern, must be unused). */
  id?: string;
  name: string;
  persona?: string;
  model?: string;
  cwd?: string;
  budgets?: AgentBudgetsInput;
  soul?: string;
  memory?: string;
  createdBy?: string;
};

export async function createAgent(opts: CreateAgentOpts): Promise<Agent> {
  assertName(opts.name);
  const name = opts.name.trim();
  const persona = PersonaSchema.safeParse(opts.persona ?? 'builder');
  if (!persona.success) {
    throw new AgentError('bad_persona', 'persona must be reviewer|planner|tester|researcher|builder|custodian|custom', 400);
  }
  const model = (opts.model ?? 'anthropic/claude-4-sonnet').trim();
  assertModel(model);
  await assertCwd(opts.cwd);
  const budgets = assertBudgets(opts.budgets);
  if (opts.soul !== undefined) assertDocContent(opts.soul);
  if (opts.memory !== undefined) assertDocContent(opts.memory);
  const createdBy =
    typeof opts.createdBy === 'string' && opts.createdBy.trim()
      ? opts.createdBy.trim().slice(0, 120)
      : 'human';

  const existing = await listAgents();
  if (existing.length >= AGENT_MAX_AGENTS) {
    throw new AgentError('agent_limit', `Agent registry is full (max ${AGENT_MAX_AGENTS})`, 429);
  }

  let id: string;
  if (opts.id !== undefined) {
    assertAgentId(opts.id);
    if (await getAgent(opts.id)) {
      throw new AgentError('agent_exists', `Agent '${opts.id}' already exists`, 409);
    }
    id = opts.id;
  } else {
    // Generated ids are unique by construction (slug + random suffix, retried).
    id = `${slugifyName(name)}-${randomSuffix()}`;
    for (let i = 0; i < 5 && (await getAgent(id)); i += 1) {
      id = `${slugifyName(name)}-${randomSuffix()}`;
    }
    if (await getAgent(id)) {
      throw new AgentError('agent_exists', 'Generated agent id collided — retry', 409);
    }
  }

  const dir = agentDir(id);
  await mkdir(dir, { recursive: true });
  await mkdir(join(dir, 'sessions'), { recursive: true });

  const agent = AgentSchema.parse({
    id,
    name,
    persona: persona.data,
    model,
    provider: model.split('/')[0] ?? 'anthropic',
    state: 'idle',
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    budgets: { tokens: 500_000, usd: 10, ...budgets },
    createdBy,
    createdAt: new Date().toISOString(),
  });

  await saveAgent(agent);
  const soul = opts.soul ?? `# SOUL — ${agent.name}\n\nPersona: ${agent.persona}\nModel: ${agent.model}\n`;
  await writeFile(join(dir, 'SOUL.md'), soul, 'utf-8');
  await writeFile(join(dir, 'MEMORY.md'), opts.memory ?? '', 'utf-8');
  await writeFile(
    join(dir, 'IDENTITY.json'),
    JSON.stringify({ id, name: agent.name, createdAt: agent.createdAt, createdBy }, null, 2),
    'utf-8',
  );
  return agent;
}

export async function getAgent(id: string): Promise<Agent | null> {
  try {
    const raw = await readFile(join(agentDir(id), 'config.json'), 'utf-8');
    return AgentSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function requireAgent(id: string): Promise<Agent> {
  assertAgentId(id);
  const agent = await getAgent(id);
  if (!agent) throw new AgentError('agent_not_found', `Agent '${id}' not found`, 404);
  return agent;
}

export async function listAgents(): Promise<Agent[]> {
  const base = join(homedir(), '.lokma', 'agents');
  try {
    const entries = await readdir(base, { withFileTypes: true });
    const out: Agent[] = [];
    for (const e of entries as unknown as Array<{ isDirectory: () => boolean; name: string }>) {
      if (!e.isDirectory()) continue;
      const ag = await getAgent(e.name);
      if (ag) out.push(ag);
    }
    return out;
  } catch {
    return [];
  }
}

export async function deleteAgent(id: string): Promise<void> {
  // requireAgent validates the id shape first (no path traversal into rm).
  await requireAgent(id);
  await rm(agentDir(id), { recursive: true, force: true });
}

export type UpdateAgentPatch = {
  name?: unknown;
  model?: unknown;
  budgets?: unknown;
};

/** Edit name/model/budgets (server-side, same validation as create). */
export async function updateAgent(id: string, patch: UpdateAgentPatch): Promise<Agent> {
  const agent = await requireAgent(id);
  const hasName = patch.name !== undefined;
  const hasModel = patch.model !== undefined;
  const hasBudgets = patch.budgets !== undefined;
  if (!hasName && !hasModel && !hasBudgets) {
    throw new AgentError('empty_patch', 'Nothing to update (name/model/budgets)', 400);
  }
  if (hasName) {
    assertName(patch.name);
    agent.name = (patch.name as string).trim();
  }
  if (hasModel) {
    assertModel(patch.model);
    const model = (patch.model as string).trim();
    agent.model = model;
    agent.provider = model.split('/')[0] ?? agent.provider;
  }
  if (hasBudgets) {
    const budgets = assertBudgets(patch.budgets);
    if (budgets) agent.budgets = { ...agent.budgets, ...budgets };
  }
  await saveAgent(agent);
  return agent;
}

/** States that still accept pause/kill (terminal states reject transitions). */
const TERMINAL_STATES: AgentState[] = ['completed', 'failed', 'killed'];

/** Pause a live agent (idle/queued/running -> paused). */
export async function pauseAgent(id: string): Promise<Agent> {
  const agent = await requireAgent(id);
  if (agent.state !== 'idle' && agent.state !== 'queued' && agent.state !== 'running') {
    throw new AgentError(
      'bad_transition',
      `Cannot pause an agent in '${agent.state}' state (pause works from idle/queued/running)`,
      409,
    );
  }
  agent.state = 'paused';
  await saveAgent(agent);
  return agent;
}

/** Resume a paused agent back to the idle pool. */
export async function resumeAgent(id: string): Promise<Agent> {
  const agent = await requireAgent(id);
  if (agent.state !== 'paused') {
    throw new AgentError('bad_transition', `Cannot resume an agent in '${agent.state}' state (only paused agents resume)`, 409);
  }
  agent.state = 'idle';
  await saveAgent(agent);
  return agent;
}

/** Kill a live agent (any non-terminal state -> killed). */
export async function killAgent(id: string): Promise<Agent> {
  const agent = await requireAgent(id);
  if (TERMINAL_STATES.includes(agent.state)) {
    throw new AgentError('terminal_state', `Agent is already '${agent.state}'`, 409);
  }
  agent.state = 'killed';
  await saveAgent(agent);
  return agent;
}

/** Copy one agent dir into a fresh id (config + SOUL + MEMORY preserved). */
async function copyAgentDir(fromId: string, createdBy: string): Promise<Agent> {
  const source = await requireAgent(fromId);
  const existing = await listAgents();
  if (existing.length >= AGENT_MAX_AGENTS) {
    throw new AgentError('agent_limit', `Agent registry is full (max ${AGENT_MAX_AGENTS})`, 429);
  }
  let id = `${slugifyName(source.name)}-${randomSuffix()}`;
  for (let i = 0; i < 5 && (await getAgent(id)); i += 1) {
    id = `${slugifyName(source.name)}-${randomSuffix()}`;
  }
  await cp(agentDir(fromId), agentDir(id), { recursive: true });
  const agent: Agent = {
    ...source,
    id,
    state: 'idle',
    createdBy,
    createdAt: new Date().toISOString(),
  };
  await saveAgent(agent);
  // The copied IDENTITY.json still names the source — rewrite it for the copy.
  await writeFile(
    join(agentDir(id), 'IDENTITY.json'),
    JSON.stringify({ id, name: agent.name, createdAt: agent.createdAt, createdBy }, null, 2),
    'utf-8',
  );
  return agent;
}

/** Fork an agent (new lineage: state idle, createdBy `fork:<id>`). */
export async function forkAgent(id: string): Promise<Agent> {
  return copyAgentDir(id, `fork:${id}`);
}

/** Clone an agent (full copy: state idle, createdBy `clone:<id>`). */
export async function cloneAgent(id: string): Promise<Agent> {
  return copyAgentDir(id, `clone:${id}`);
}

export type AgentDocName = 'SOUL.md' | 'MEMORY.md';

function assertDocName(doc: unknown): asserts doc is AgentDocName {
  if (doc !== 'SOUL.md' && doc !== 'MEMORY.md') {
    throw new AgentError('bad_doc', 'doc must be SOUL.md or MEMORY.md', 400);
  }
}

/** Read an agent's SOUL.md / MEMORY.md (missing file reads as empty). */
export async function readAgentDoc(id: string, doc: AgentDocName): Promise<string> {
  assertDocName(doc);
  await requireAgent(id);
  try {
    return await readFile(join(agentDir(id), doc), 'utf-8');
  } catch {
    return '';
  }
}

/** Persist an agent's SOUL.md / MEMORY.md (validated size, real file write). */
export async function writeAgentDoc(id: string, doc: AgentDocName, content: string): Promise<number> {
  assertDocName(doc);
  assertDocContent(content);
  await requireAgent(id);
  await writeFile(join(agentDir(id), doc), content, 'utf-8');
  return Buffer.byteLength(content, 'utf-8');
}
