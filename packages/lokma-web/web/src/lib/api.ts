/**
 * Typed API client for the Lokma harness server (Fastify).
 * Single HTTP entry point for the web app — all panes go through here (DRY).
 * Real endpoints only: every function calls a live `/api/*` URL, never mock data.
 * Auth: httpOnly cookie (sent via `credentials: include`) + optional Bearer token
 * from `localStorage["lokma-token"]` (`lokma auth <token>` stores it there).
 */

export type ApiErrorShape = { code: string; message: string };

/** Typed fetch error — carries the server `{ code, message }` shape. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

const TOKEN_KEY = 'lokma-token';
const LOGIN_PATH = '/login';

/** Read the stored Bearer token without crashing outside the browser. */
function readToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Bounce to login on 401 (browser only, never loops on the login page itself). */
function redirectToLogin(): void {
  try {
    if (typeof window === 'undefined' || !window.location) return;
    if (window.location.pathname === LOGIN_PATH) return;
    window.location.href = LOGIN_PATH;
  } catch {
    // Non-browser runtimes (tests, SSR probes) skip the redirect.
  }
}

/** Normalize every server failure shape into `{ code, message }`. */
async function toApiError(res: Response, redirect = true): Promise<ApiError> {
  const status = res.status;
  if (status === 401) {
    if (redirect) redirectToLogin();
    return new ApiError('unauthorized', 'Not signed in — redirected to login', 401);
  }
  let code = 'http_error';
  let message = `HTTP ${status}`;
  try {
    const text = await res.text();
    if (text) {
      try {
        const body = JSON.parse(text) as Record<string, unknown>;
        if (typeof body.code === 'string' && typeof body.message === 'string') {
          code = body.code;
          message = body.message;
        } else if (typeof body.error === 'string') {
          // Legacy server shape `{ ok: false, error: "..." }` (Phase 0 routes).
          message = body.error;
          code = typeof body.code === 'string' ? body.code : 'request_failed';
        } else if (typeof body.message === 'string') {
          message = body.message;
        } else {
          message = text.slice(0, 300);
        }
      } catch {
        message = text.slice(0, 300);
      }
    }
  } catch {
    // Keep the default HTTP message when the body is unreadable.
  }
  return new ApiError(code, message, status);
}

/**
 * Core request helper — GET/POST/PATCH/DELETE with auth + 401 handling.
 * Throws ApiError on any non-2xx response. Pass `{ redirect401: false }`
 * for expected-401 probes (e.g. the AuthPane logged-out check) so the
 * global login bounce does not fire.
 */
export async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { redirect401?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const token = readToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers, credentials: 'include' });
  if (!res.ok) throw await toApiError(res, opts.redirect401 !== false);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

async function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

async function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

/** Back-compat thin wrapper — kept for existing callers, now with auth + 401 handling. */
export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init);
}

/**
 * Authenticated fetch for non-JSON payloads (file downloads like usage
 * export). Applies the same cookie + Bearer auth as `request`, throws
 * ApiError on non-2xx. Keeps auth logic DRY — panes never hand-roll it.
 */
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = readToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers, credentials: 'include' });
  if (!res.ok) throw await toApiError(res);
  return res;
}

// ─── Response types (mirror live server route shapes) ───────────────────────

export type HealthRes = { ok: boolean; service: string; version: string };
export type ConfigRes = {
  config: unknown;
  credentials: Record<string, { keySet: boolean; last4: string | null }>;
};
export type ProviderInfo = {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  keySet: boolean;
  last4: string | null;
  priority: number;
  custom: boolean;
};
export type ProvidersRes = { providers: ProviderInfo[] };
export type ProviderTestRes = {
  ok: boolean;
  provider: string;
  modelCount?: number;
  models?: string[];
  latencyMs?: number;
  error?: string;
  note?: string;
};
export type ProviderMutationRes = { ok: boolean; provider: ProviderInfo };
export type CreateProviderBody = { id: string; name: string; baseUrl: string; apiKey?: string; enabled?: boolean };
export type PatchProviderBody = { name?: string; baseUrl?: string; enabled?: boolean; priority?: number; apiKey?: string };
export type ModelInfo = { id: string; label: string; provider: string; enabled: boolean };
export type ModelsRes = { models: ModelInfo[]; count: number; enabledCount: number; cached: boolean };
export type ModelsMutationRes = {
  ok: boolean;
  updated: number;
  models: ModelInfo[];
  count: number;
  enabledCount: number;
};
export type SessionSummary = {
  id: string;
  cwd?: string;
  /** Display title (server derives it from the first user line when never renamed). */
  title?: string;
  /** True when the title was set via rename. */
  renamed?: boolean;
  /** Per-session model from the meta sidecar (null when never set). */
  model?: string | null;
  messageCount?: number;
  /** ISO timestamps for Today/Yesterday/Earlier grouping. */
  createdAt?: string;
  updatedAt?: string;
};
export type SessionsRes = { sessions: SessionSummary[]; count: number };
export type SessionDetail = { id: string; cwd: string; model: string | null; messages: unknown[]; count: number };
export type CreateSessionRes = { ok: boolean; id: string; cwd: string };
export type ForkSessionRes = { ok: boolean; id: string; from: string; copied?: number };
export type PatchSessionRes = { ok: boolean; id: string; model: string; title?: string | null };
export type RenameSessionRes = { ok: boolean; id: string; model: string; title: string | null };
export type DeleteSessionRes = { ok: boolean; id: string };
export type MergeSessionRes = { ok: boolean; id: string; from: string; appended: number };
export type RewindSessionRes = { ok: boolean; id: string; kept: number };
export type SlashCommandInfo = { id: string; name: string; hint: string; usage: string };
export type CommandsRes = { commands: SlashCommandInfo[]; count: number };
export type AgentInfo = { id: string; [k: string]: unknown };
export type AgentCaps = { maxAgents: number; maxConcurrent: number; maxQueue: number };
export type AgentsRes = { agents: AgentInfo[]; count: number; caps: AgentCaps };
export type AgentMutationRes = { ok: boolean; agent: AgentInfo; action?: string; from?: string };
export type DeleteAgentRes = { ok: boolean; id: string };
export type CreateAgentBody = {
  id?: string;
  name: string;
  persona?: string;
  model?: string;
  cwd?: string;
  budgets?: { tokens?: number; usd?: number };
  soul?: string;
  memory?: string;
  /** Lineage tag (`fork:<id>` / `fanout:<stem>` / `ai:<id>`) — server records it. */
  createdBy?: string;
};
export type PatchAgentBody = { name?: string; model?: string; budgets?: { tokens?: number; usd?: number } };
export type AgentDocRes = { ok: boolean; id: string; doc: string; content: string };
export type AgentDocWriteRes = { ok: boolean; id: string; doc: string; bytes: number };
export type SkillInfo = {
  id: string;
  name: string;
  description: string;
  category: string;
  path: string;
  linked_files: string[];
  [k: string]: unknown;
};
/** Per-skill curator counters (`~/.lokma/skills/.usage.json`, Hermes shape). */
export type SkillUsage = {
  use_count: number;
  view_count: number;
  patch_count: number;
  last_used?: string;
};
export type SkillsRes = { skills: SkillInfo[]; count?: number; usage?: Record<string, SkillUsage> };
export type SkillDetailRes = { ok: boolean; skill: SkillInfo; content: string };
export type SkillFileRes = { ok: boolean; path: string; content: string };
export type SkillPatchRes = { ok: boolean; skill: SkillInfo; bytes: number };
export type SkillUseRes = { ok: boolean; id: string };
export type SkillPatchBody = { old_string: string; new_string: string };
export type VaultGraphRes = { nodes: unknown[]; links: unknown[]; count?: number; note?: string };
export type VaultTreeEntry = { name: string; path: string; type: 'dir' | 'note'; children?: VaultTreeEntry[] };
export type VaultTreeRes = { ok: boolean; tree: VaultTreeEntry[] };
export type VaultNoteRes = {
  ok: boolean;
  path: string;
  title: string;
  tags: string[];
  links: string[];
  provenance: string | null;
  size: number;
  mtimeMs: number;
  content: string;
  truncated: boolean;
};
export type VaultIngestBody = { path: string; content: string; provenance?: string };
export type VaultIngestRes = { ok: boolean; path: string; bytes: number; created: boolean };
export type UsageModelRow = {
  model: string;
  family: string;
  runs: number;
  tokens: number;
  costUsd: number;
  share: number;
};
export type UsageDayPoint = { day: string; total: number; byModel: Record<string, number> };
export type UsageSummary = {
  rangeDays: number;
  runs: number;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  costUsd: number;
  avgPerSession: number;
  topModel: string | null;
  byModel: UsageModelRow[];
  series: UsageDayPoint[];
  unpricedTokens: number;
};
export type UsageSummaryRes = { ok: boolean; range: string; summary: UsageSummary };
export type UsageSessionRow = {
  sessionId: string;
  title: string;
  model: string;
  runs: number;
  tokens: number;
  costUsd: number;
  lastActive: string;
};
export type UsageSessionsRes = { ok: boolean; range: string; sessions: UsageSessionRow[]; count: number };
export type UsageRange = '7d' | '30d' | '90d';
export type UsageExportFormat = 'csv' | 'jsonl';

// ─── Workspace files (real FS behind the FileBrowser pane, W3-9) ────────────

export type GitState = 'M' | 'A' | 'D' | 'R' | '?';
export type FileEntry = {
  name: string;
  /** Workspace-relative `/`-separated path (matches `@mention` syntax). */
  path: string;
  type: 'file' | 'dir';
  size: number;
  mtimeMs: number;
  /** Null = clean (or not a repo) — never faked, straight from git status. */
  git: GitState | null;
};
export type FilesRes = { ok: boolean; path: string; entries: FileEntry[] };
export type FileContentRes = {
  ok: boolean;
  path: string;
  content: string;
  /** sha256 of the FULL file — pass back as `expectedSha` on save. */
  sha: string;
  size: number;
  truncated: boolean;
};
export type FileWriteRes = { ok: boolean; path: string; sha: string; size: number; created: boolean };
export type FileSearchHit = { path: string; type: 'file' | 'dir'; score: number };
export type FileSearchRes = { ok: boolean; q: string; hits: FileSearchHit[] };

// ─── Terminals (live shell processes behind the TerminalPane, W3-10) ──────

export type TerminalStatus = 'running' | 'exited' | 'error';
export type TerminalInfo = {
  id: string;
  shell: string;
  cwd: string;
  pid: number | null;
  agentId: string | null;
  sessionId: string;
  status: TerminalStatus;
  startedAt: string;
  exitCode: number | null;
  signal: string | null;
  cols: number;
  rows: number;
};
export type TerminalsRes = { ok: boolean; terminals: TerminalInfo[]; count: number };
export type TerminalDetailRes = { ok: boolean; terminal: TerminalInfo; tail: string };
export type CreateTerminalBody = { cwd?: string; agentId?: string; sessionId?: string; cols?: number; rows?: number };
export type CreateTerminalRes = { ok: boolean; terminal: TerminalInfo };
export type TerminalInputRes = { ok: boolean; id: string; bytes: number };
export type DeleteTerminalRes = { ok: boolean; id: string; killed: boolean; exitCode: number | null; signal: string | null };

// ─── Browser tabs (per-agent live tabs behind the BrowserPane, W3-12) ───

export type BrowserTab = {
  id: string;
  url: string;
  /** Full navigation history, oldest first (server-owned, real pointer). */
  history: string[];
  /** Index into `history` pointing at `url`. */
  index: number;
  agentId: string | null;
  sessionId: string;
  /** Workspace scope label shown under each tab. */
  cwd: string | null;
  createdAt: string;
  updatedAt: string;
};
export type BrowserTabsRes = { ok: boolean; tabs: BrowserTab[]; count: number };
export type BrowserTabRes = { ok: boolean; tab: BrowserTab };
export type OpenBrowserTabBody = { url?: string; agentId?: string; sessionId?: string; cwd?: string };
export type OpenBrowserTabRes = { ok: boolean; tabId: string; tab: BrowserTab };
export type CloseBrowserTabRes = { ok: boolean; id: string; closed: boolean };

// ─── Setup + doctor (optional stack + init + probes behind the SetupPane, W6-22) ───

export type SetupFeatureView = {
  id: string;
  label: string;
  desc: string;
  docs: string;
  defaultOn: boolean;
  enabled: boolean;
};
export type SetupRes = { features: SetupFeatureView[]; applied: Record<string, boolean>; count: number };
export type SetupSaveRes = { ok: boolean; applied: Record<string, boolean> };
export type SetupInitBody = { cwd?: string };
export type SetupInitRes = { ok: boolean; created: string[]; existed: string[] };
export type DoctorCheckView = { name: string; ok: boolean; latencyMs: number; detail: string };
export type DoctorRes = { checks: DoctorCheckView[]; passed: number; total: number };

// ─── Archify diagrams (typed IR → validated HTML/SVG behind the ArchifyPane, W5-17) ───

export type ArchifyNode = { id: string; label: string; kind?: string };
export type ArchifyEdge = { from: string; to: string; label?: string };
export type ArchifyIR = {
  type: string;
  preset: string;
  theme: string;
  title: string;
  nodes: ArchifyNode[];
  edges: ArchifyEdge[];
  trace?: string[];
};
export type ArchifyReceiptRow = { gate: string; status: 'pass' | 'fail'; msg: string };
export type ArchifyGateError = { gate: string; message: string };
export type DiagramSummary = {
  id: string;
  type: string;
  preset: string;
  theme: string;
  title: string;
  nodeCount: number;
  edgeCount: number;
  updatedAt: string;
};
export type DiagramsRes = { items: DiagramSummary[]; count: number };
export type DiagramDetailRes = { ok: boolean; id: string; ir: ArchifyIR; receipt: ArchifyReceiptRow[]; html: string };
export type GenerateDiagramBody = { type: string; prompt: string; preset?: string; theme?: string };
export type GenerateDiagramRes = { ok: boolean; id: string; ir: ArchifyIR };
export type ValidateDiagramRes = { ok: boolean; errors: ArchifyGateError[]; receipt: ArchifyReceiptRow[] };
export type SaveDiagramRes = { ok: boolean; id: string; receipt: ArchifyReceiptRow[] };
export type DiagramDiff = { added: string[]; removed: string[]; changed: string[]; rerouted: string[] };
export type DiagramDeltaRes = { ok: boolean; diff: DiagramDiff; deltaHtml: string };
export type ArchifyGuideRes = { ok: boolean; id: string; starter: string };
export type ArchifyExportFormat = 'svg' | 'html' | 'json' | 'card';

// ─── Design Studio (6 artifact types over bundled systems + DESIGN.md guard, W5-18) ───

export type DesignManifest = {
  id: string;
  type: string;
  brief: string;
  system: string;
  createdAt: string;
  updatedAt: string;
};
export type DesignSummary = DesignManifest & { bytes: number; overall: number | null };
export type DesignsRes = { items: DesignSummary[]; count: number };
export type CritiqueScore = { dim: string; score: number; fixes: string[] };
export type CritiqueResult = { overall: number; scores: CritiqueScore[] };
export type DesignDetailRes = { ok: boolean; id: string; manifest: DesignManifest; html: string; critique: CritiqueResult | null };
export type GenerateDesignBody = { type: string; brief: string; system?: string };
export type GenerateDesignRes = { ok: boolean; id: string; manifest: DesignManifest; critique: CritiqueResult };
export type SaveDesignRes = { ok: boolean; id: string; manifest: DesignManifest; critique: CritiqueResult };
export type CritiqueDesignRes = { ok: boolean; id: string; critique: CritiqueResult };
export type DesignSystemMeta = {
  id: string;
  name: string;
  preset: string;
  tokens: string;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  accentSoft: string;
  line: string;
  font: string;
};
export type DesignSystemsRes = { ok: boolean; systems: DesignSystemMeta[] };
export type DesignGuard = {
  cwd: string;
  present: boolean;
  h2Count: number;
  sections: string[];
  ok: boolean;
  message: string;
};
export type DesignGuardRes = { ok: boolean; guard: DesignGuard };
export type DesignExportFormat = 'html' | 'zip' | 'json';

// ─── Testing Lab (Plan→Run→Classify→Report over live handlers, W5-19) ───

export type TestClassification = 'contract' | 'env' | 'fragility';
export type TestResult = {
  name: string;
  kind: 'http' | 'shannon';
  status: 'pass' | 'fail';
  ms: number;
  detail: string;
  classification?: TestClassification;
};
export type ShannonFinding = { pattern: string; location: string };
export type TestReport = {
  id: string;
  plan: string;
  createdAt: string;
  durationMs: number;
  tests: TestResult[];
  pass: number;
  fail: number;
  /** Rerun-history diffing is a follow-up — always 0, never invented. */
  flaky: number;
  shannon: string;
  shannonFindings: ShannonFinding[];
};
export type TestPlanDoc = {
  id: string;
  plan: string;
  targets: string[];
  includeShannon: boolean;
  createdAt: string;
};
export type TestSummary = {
  id: string;
  plan: string;
  tests: number;
  pass: number;
  fail: number;
  flaky: number;
  dur: string;
  shannon: string;
  createdAt: string;
};
export type TestsRes = { items: TestSummary[]; count: number };
export type RunTestBody = { plan: string; targets?: string[]; includeShannon?: boolean; timeoutMs?: number };
export type RunTestRes = { ok: boolean; id: string; report: TestReport };
export type TestDetailRes = { ok: boolean; plan: TestPlanDoc | null; report: TestReport };

// ─── Repo git (real status/log/commit/push behind the GitPane, W3-11) ─────

export type GitFileChange = { path: string; staged: string | null; worktree: string | null };
export type GitStatusRes =
  | {
      ok: boolean;
      repo: true;
      cwd: string;
      branch: string;
      upstream: string | null;
      ahead: number;
      behind: number;
      files: GitFileChange[];
      counts: { changed: number; staged: number; unstaged: number };
      worktrees: string[];
    }
  | { ok: boolean; repo: false; cwd: string };
export type GitLogEntry = { hash: string; short: string; message: string; author: string; date: string };
export type GitLogRes = { ok: boolean; branch: string; commits: GitLogEntry[] };
export type GitCommitRes = { ok: boolean; hash: string; short: string; message: string };
export type GitPushRes = { ok: boolean; pushed: boolean; output: string };
export type GitGcRes = { ok: boolean; pruned: boolean };
export type GitLockRow = { path: string; owner: string; leaseUntil: number };
export type GitLocksRes = { ok: boolean; cwd: string; locks: GitLockRow[]; count: number; expired: number };
export type AgentLockInfo = {
  path: string;
  owner: string;
  acquiredAt: number;
  leaseUntil: number;
  mode: string;
  reason?: string;
};
export type AgentLocksRes = {
  ok: boolean;
  agentId: string;
  agent: unknown;
  locks: AgentLockInfo[];
  expired: number;
  worktrees: string[];
};

// ─── Bots (shareable bot.json packages + run-as-agent, W5-20) ───

export type BotSource = 'bundled' | 'global' | 'project';
export type BotVisibility = 'private' | 'shared' | 'public';
export type BotMemoryScope = 'bot' | 'project' | 'user' | 'isolated';
export type BotBudgets = { maxTokens: number; maxUsd: number; maxTurns: number };
export type Bot = {
  id: string;
  name: string;
  avatar?: string;
  description: string;
  systemPrompt: string;
  model: string;
  fallback: string[];
  tools: string[];
  skills: string[];
  mcpServers: string[];
  knowledgeFiles: string[];
  memoryScope: BotMemoryScope;
  budgets: BotBudgets;
  visibility: BotVisibility;
  version: string;
  createdFrom?: string;
  tags: string[];
  author?: string;
  createdAt?: string;
  featured: boolean;
  source: BotSource;
};
export type BotsRes = { bots: Bot[]; count: number };
export type BotDetailRes = { ok: boolean; bot: Bot };
export type CreateBotBody = {
  id?: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  model?: string;
  fallback?: string[];
  tools?: string[];
  skills?: string[];
  mcpServers?: string[];
  knowledgeFiles?: string[];
  memoryScope?: BotMemoryScope;
  budgets?: Partial<BotBudgets>;
  visibility?: BotVisibility;
  version?: string;
  createdFrom?: string;
  tags?: string[];
  author?: string;
};
export type PatchBotBody = Partial<
  Pick<
    Bot,
    | 'name'
    | 'avatar'
    | 'description'
    | 'systemPrompt'
    | 'model'
    | 'fallback'
    | 'tools'
    | 'skills'
    | 'mcpServers'
    | 'knowledgeFiles'
    | 'memoryScope'
    | 'visibility'
    | 'version'
    | 'tags'
    | 'author'
  >
> & { budgets?: Partial<BotBudgets> };
export type BotMutationRes = { ok: boolean; bot: Bot; from?: string; visibility?: BotVisibility };
export type ForkBotBody = { as?: string };
export type PublishBotBody = { visibility: BotVisibility };
export type RunBotBody = { task: string; cwd?: string };
export type RunBotRes = {
  ok: boolean;
  agentId: string;
  agent: { id: string; [k: string]: unknown };
  sessionId: string;
};

// Auth + users + projects — RBAC matrix + visibility (W6-21, Docs/36).
// Roles mirror `lokma-shared` (admin/member/viewer); the server enforces
// every gate, the pane only mirrors the matrix for gating buttons.
export type AuthRole = 'admin' | 'member' | 'viewer';
export type UserStatus = 'active' | 'invited' | 'disabled';
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
  status: UserStatus;
  permissions: string[];
  createdAt: string;
  lastActiveAt: string | null;
};
export type ProjectVisibility = 'private' | 'public';
export type AuthProject = {
  id: string;
  name: string;
  cwd: string;
  visibility: ProjectVisibility;
  ownerId: string;
  createdAt: string;
};
export type ProjectMember = {
  projectId: string;
  userId: string;
  role: 'member' | 'viewer';
  permissions: string[];
  addedAt: string;
  addedBy: string;
};
export type AuthSettings = {
  projectCreation: 'admin-only' | 'members' | 'open';
  projectVisibilityDefault: ProjectVisibility;
  inviteExpiryDays: number;
  sessionRetentionDays: number | null;
};
export type AuthSessionRes = { ok: boolean; user: AuthUser; token: string };
export type AuthMeRes = { ok: boolean; user: AuthUser };
export type AuthSettingsRes = { ok: boolean; settings: AuthSettings; bootstrapped: boolean };
export type UsersRes = { users: AuthUser[]; count: number };
export type InviteRes = { ok: boolean; user: AuthUser; inviteLink: string };
export type ResetPasswordRes = { ok: boolean; user: AuthUser; tempPassword: string };
export type ProjectsRes = { projects: AuthProject[] };
export type ProjectDetailRes = { ok: boolean; project: AuthProject; members: ProjectMember[] };
export type ProjectMutationRes = { ok: boolean; project: AuthProject };
export type MembersRes = { members: ProjectMember[] };
export type MemberMutationRes = { ok: boolean; member: ProjectMember };

// ─── Plugins (kernel registry + hot toggle + add-from-URL, W6-23) ───

export type PluginSource = 'bundled' | 'url';
export type PluginCategory = 'core' | 'diagram' | 'tool' | 'skill';
export type Plugin = {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: PluginCategory;
  source: PluginSource;
  installed: true;
  enabled: boolean;
  routes: string[];
  endpoints: string[];
  url?: string;
};
export type PluginsRes = { plugins: Plugin[]; count: number };
export type PluginDetailRes = { ok: boolean; plugin: Plugin };
export type PluginMutationRes = { ok: boolean; plugin: Plugin };

// ─── Observability (agent trace timeline + frozen share snapshots, W6-24) ───

export type TraceEventKind =
  | 'agent_created'
  | 'spawned'
  | 'agent_state'
  | 'soul_write'
  | 'memory_write'
  | 'lock_acquired';
export type TraceEventView = { ts: string; kind: TraceEventKind; label: string; detail?: string };
export type TraceLockView = {
  path: string;
  acquiredAt: string;
  leaseUntil: string;
  live: boolean;
  reason?: string;
};
export type TraceDocView = { exists: boolean; bytes: number; mtime: string | null };
/** `GET /api/agents/:id/trace` — the server spreads the trace at top level. */
export type AgentTraceRes = {
  agent: AgentInfo;
  events: TraceEventView[];
  locks: TraceLockView[];
  docs: { soul: TraceDocView; memory: TraceDocView };
  worktree: string | null;
  generatedAt: string;
};
export type ShareKind = 'agent' | 'session';
export type ShareSummaryView = {
  token: string;
  kind: ShareKind;
  refId: string;
  title: string;
  createdAt: string;
  /** Trace events (agent shares) or transcript rows (session shares). */
  size: number;
};
export type SharesRes = { shares: ShareSummaryView[]; count: number };
export type ShareCreateRes = { ok: boolean; token: string; url: string };
/** Transcript row as the Replay view renders it (narrowed from `unknown`). */
export type ReplayMessage = {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
  toolName?: string;
};
export type ShareSessionSnapshot = {
  id: string;
  cwd: string;
  model: string | null;
  title: string;
  messages: ReplayMessage[];
  count: number;
};
export type ShareDetailRes = {
  share: {
    token: string;
    kind: ShareKind;
    refId: string;
    title: string;
    createdAt: string;
    snapshot: unknown;
  };
};

// Cron + approvals — per-agent jobs + WS decision history (W6-25, Docs/30
// §5 + §6). Schedules are server-validated 5-field cron; `nextRunAt` is
// computed server-side (null when disabled); `lastRunAt` stays null until
// the agent runner wave fires jobs. Decisions fill as real WS answers arrive.
export type CronJobView = {
  id: string;
  agentId: string;
  schedule: string;
  task: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
};
export type CronListRes = { jobs: CronJobView[]; count: number };
export type AgentCronRes = { jobs: CronJobView[]; count: number; agentId: string };
export type CronCreateBody = { schedule: string; task: string; enabled?: boolean };
export type CronPatchBody = { schedule?: string; task?: string; enabled?: boolean };
export type CronMutateRes = { ok: boolean; job: CronJobView };
export type ApprovalDecisionView = {
  id: string;
  at: string;
  source: 'ws' | 'manual';
  sessionId: string;
  kind: 'permission' | 'question';
  requestId: string;
  decision?: 'allow' | 'deny' | 'always';
  answer?: string;
};
export type ApprovalsRes = { decisions: ApprovalDecisionView[]; count: number };

// ─── One function per endpoint group ────────────────────────────────────────

export const api = {
  // Health + config
  health: () => get<HealthRes>('/api/health'),
  getConfig: () => get<ConfigRes>('/api/config'),
  config: () => get<ConfigRes>('/api/config'),
  patchConfig: (patchBody: Record<string, unknown>) =>
    patch<{ ok: boolean; patched: string[] }>('/api/config', patchBody),

  // Providers + models — CRUD + enable/disable are live server endpoints (W2).
  listProviders: () => get<ProvidersRes>('/api/providers'),
  providers: () => get<ProvidersRes>('/api/providers'),
  createProvider: (body: CreateProviderBody) => post<ProviderMutationRes>('/api/providers', body),
  patchProvider: (id: string, body: PatchProviderBody) =>
    patch<ProviderMutationRes>(`/api/providers/${encodeURIComponent(id)}`, body),
  deleteProvider: (id: string) => del<{ ok: boolean; id: string }>(`/api/providers/${encodeURIComponent(id)}`),
  reorderProviders: (order: string[]) =>
    post<{ ok: boolean; providers: ProviderInfo[] }>('/api/providers/reorder', { order }),
  testProvider: (id: string) => post<ProviderTestRes>(`/api/providers/${encodeURIComponent(id)}/test`),
  listModels: () => get<ModelsRes>('/api/models'),
  models: () => get<ModelsRes>('/api/models'),
  /** Enable/disable one model — server persists the flag to ~/.lokma/config.json. */
  setModelEnabled: (id: string, enabled: boolean) =>
    patch<ModelsMutationRes>('/api/models', { id, enabled }),
  /** Bulk enable/disable — one PATCH for Allow All / Disable All. */
  setModelsBulk: (models: Record<string, boolean>) =>
    patch<ModelsMutationRes>('/api/models', { models }),

  // Sessions — fork/patch/rewind are live server endpoints (W1 chat core).
  listSessions: (cwd?: string) =>
    get<SessionsRes>(cwd ? `/api/sessions?cwd=${encodeURIComponent(cwd)}` : '/api/sessions'),
  sessions: () => get<SessionsRes>('/api/sessions'),
  getSession: (id: string) => get<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`),
  createSession: (body?: { cwd?: string; model?: string }) => post<CreateSessionRes>('/api/sessions', body ?? {}),
  forkSession: (id: string) => post<ForkSessionRes>(`/api/sessions/${encodeURIComponent(id)}/fork`),
  patchSession: (id: string, body: { model: string }) =>
    patch<PatchSessionRes>(`/api/sessions/${encodeURIComponent(id)}`, body),
  renameSession: (id: string, title: string) =>
    patch<RenameSessionRes>(`/api/sessions/${encodeURIComponent(id)}`, { title }),
  deleteSession: (id: string) => del<DeleteSessionRes>(`/api/sessions/${encodeURIComponent(id)}`),
  mergeSessions: (intoId: string, fromId: string) =>
    post<MergeSessionRes>(`/api/sessions/${encodeURIComponent(intoId)}/merge`, { from: fromId }),
  rewindSession: (id: string, keepMessages: number) =>
    post<RewindSessionRes>(`/api/sessions/${encodeURIComponent(id)}/rewind`, { keepMessages }),

  // Slash commands — server-owned registry behind the Composer `/` palette.
  listCommands: () => get<CommandsRes>('/api/commands'),

  // Agents — full registry CRUD + lifecycle (W4-13). The server owns
  // caps/queue/locks (429 when full); this store mirrors them for the HUD.
  listAgents: () => get<AgentsRes>('/api/agents'),
  getAgent: (id: string) => get<AgentInfo>(`/api/agents/${encodeURIComponent(id)}`),
  createAgent: (body: CreateAgentBody) => post<AgentMutationRes>('/api/agents', body),
  patchAgent: (id: string, body: PatchAgentBody) =>
    patch<AgentMutationRes>(`/api/agents/${encodeURIComponent(id)}`, body),
  deleteAgent: (id: string) => del<DeleteAgentRes>(`/api/agents/${encodeURIComponent(id)}`),
  /** Lifecycle move: pause | resume | kill (409 on illegal transitions). */
  moveAgent: (id: string, action: 'pause' | 'resume' | 'kill') =>
    post<AgentMutationRes>(`/api/agents/${encodeURIComponent(id)}/${action}`, {}),
  /** Copy the agent dir into a fresh id (state idle, same SOUL/MEMORY). */
  copyAgent: (id: string, action: 'fork' | 'clone') =>
    post<AgentMutationRes>(`/api/agents/${encodeURIComponent(id)}/${action}`, {}),
  /** Read the real SOUL.md / MEMORY.md file (`doc` = 'soul' | 'memory'). */
  getAgentDoc: (id: string, doc: 'soul' | 'memory') =>
    get<AgentDocRes>(`/api/agents/${encodeURIComponent(id)}/${doc}`),
  /** Persist SOUL.md / MEMORY.md (real file write under the agent dir). */
  saveAgentDoc: (id: string, doc: 'soul' | 'memory', content: string) =>
    put<AgentDocWriteRes>(`/api/agents/${encodeURIComponent(id)}/${doc}`, { content }),
  listSkills: () => get<SkillsRes>('/api/skills'),
  /** skill_view parity — full SKILL.md body + linked_files (records a view). */
  getSkill: (id: string) => get<SkillDetailRes>(`/api/skills/${encodeURIComponent(id)}`),
  /** Single reference load (progressive disclosure, jailed to the skill dir). */
  getSkillFile: (id: string, path: string) =>
    get<SkillFileRes>(`/api/skills/${encodeURIComponent(id)}/file?path=${encodeURIComponent(path)}`),
  /** Curator patch — exact old_string → new_string (single-occurrence guard). */
  patchSkill: (id: string, body: SkillPatchBody) =>
    patch<SkillPatchRes>(`/api/skills/${encodeURIComponent(id)}`, body),
  /** Record a use event (web parity of the agent loop's use event). */
  recordSkillUse: (id: string) => post<SkillUseRes>(`/api/skills/${encodeURIComponent(id)}/use`, {}),

  // Vault — live file graph + note reads + ingest (W4-15).
  getVaultGraph: (query?: string, opts?: { folder?: string; depth?: number }) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (opts?.folder) params.set('folder', opts.folder);
    if (opts?.depth !== undefined) params.set('depth', String(opts.depth));
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return get<VaultGraphRes>(`/api/vault/graph${suffix}`);
  },
  /** Nested dir/note tree for the vault folder browser. */
  getVaultTree: (folder?: string) =>
    get<VaultTreeRes>(folder ? `/api/vault/tree?folder=${encodeURIComponent(folder)}` : '/api/vault/tree'),
  /** Full note read (wikilink click → pane). */
  getVaultNote: (path: string) => get<VaultNoteRes>(`/api/vault/note?path=${encodeURIComponent(path)}`),
  /** Ingest a `.md` note (`provenance` = the ingesting agent id). */
  ingestVaultNote: (body: VaultIngestBody) => post<VaultIngestRes>('/api/vault/ingest', body),

  // Usage — real token/cost accounting (W2-7). The ledger fills from WS runs.
  getUsageSummary: (range: UsageRange = '7d', cwd?: string) =>
    get<UsageSummaryRes>(
      cwd
        ? `/api/usage/summary?range=${range}&cwd=${encodeURIComponent(cwd)}`
        : `/api/usage/summary?range=${range}`,
    ),
  getUsageSessions: (range: UsageRange = '7d', cwd?: string) =>
    get<UsageSessionsRes>(
      cwd
        ? `/api/usage/sessions?range=${range}&cwd=${encodeURIComponent(cwd)}`
        : `/api/usage/sessions?range=${range}`,
    ),
  /** Export download path — fetch it as a blob (keeps Bearer auth), not a plain link. */
  usageExportUrl: (format: UsageExportFormat, range: UsageRange = '7d') =>
    `/api/usage/export?format=${format}&range=${range}`,
  /** Real file download — blob + server filename, auth via `authedFetch`. */
  downloadUsageExport: async (
    format: UsageExportFormat,
    range: UsageRange = '7d',
  ): Promise<{ filename: string; blob: Blob }> => {
    const fallback = `lokma-usage-${range}.${format}`;
    const res = await authedFetch(`/api/usage/export?format=${format}&range=${range}`);
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="([^"]+)"/);
    return { filename: match?.[1] ?? fallback, blob };
  },

  // Workspace files — real FS behind the FileBrowser pane (W3-9).
  listFiles: (cwd: string, path = '.') =>
    get<FilesRes>(`/api/files?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}`),
  readWorkspaceFile: (cwd: string, path: string) =>
    get<FileContentRes>(`/api/files/read?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}`),
  searchWorkspaceFiles: (cwd: string, q: string, max = 50) =>
    get<FileSearchRes>(
      `/api/files/search?cwd=${encodeURIComponent(cwd)}&q=${encodeURIComponent(q)}&max=${max}`,
    ),
  /** Save with the `expectedSha` lost-update guard (409 `stale_file` on conflict). */
  writeWorkspaceFile: (cwd: string, path: string, content: string, expectedSha?: string) =>
    post<FileWriteRes>('/api/files/write', {
      cwd,
      path,
      content,
      ...(expectedSha ? { expectedSha } : {}),
    }),

  // Terminals — live shells (W3-10). Bytes flow over WS `terminal/*` frames;
  // REST only spawns/lists/inspects/kills.
  listTerminals: () => get<TerminalsRes>('/api/terminal'),
  createTerminal: (body: CreateTerminalBody) => post<CreateTerminalRes>('/api/terminal', body),
  getTerminal: (id: string) => get<TerminalDetailRes>(`/api/terminal/${encodeURIComponent(id)}`),
  /** Non-WS stdin path (CLI parity + probes) — the pane sends over WS. */
  sendTerminalInput: (id: string, data: string) =>
    post<TerminalInputRes>(`/api/terminal/${encodeURIComponent(id)}/input`, { data }),
  deleteTerminal: (id: string) => del<DeleteTerminalRes>(`/api/terminal/${encodeURIComponent(id)}`),

  // Repo git — real status/log/commit/push (W3-11). All calls scope to the
  // session cwd, like the file endpoints.
  getGitStatus: (cwd?: string) =>
    get<GitStatusRes>(cwd ? `/api/git/status?cwd=${encodeURIComponent(cwd)}` : '/api/git/status'),
  getGitLog: (cwd?: string, max = 20) =>
    get<GitLogRes>(
      cwd
        ? `/api/git/log?cwd=${encodeURIComponent(cwd)}&max=${max}`
        : `/api/git/log?max=${max}`,
    ),
  /** Stage-all + commit (server returns the new hash). */
  commitGit: (message: string, cwd?: string) =>
    post<GitCommitRes>('/api/git/commit', { message, ...(cwd ? { cwd } : {}) }),
  pushGit: (cwd?: string) => post<GitPushRes>('/api/git/push', cwd ? { cwd } : {}),
  /** Worktree prune (the pane GC button). */
  gcGit: (cwd?: string) => post<GitGcRes>('/api/git/gc', cwd ? { cwd } : {}),
  /** Live locks under the repo (rows + banner). */
  getGitLocks: (cwd?: string) =>
    get<GitLocksRes>(cwd ? `/api/git/locks?cwd=${encodeURIComponent(cwd)}` : '/api/git/locks'),
  /** Per-agent 3-layer safety state (plan §W3-11, reused by W4 AgentHub). */
  getAgentLocks: (id: string, cwd?: string) =>
    get<AgentLocksRes>(
      cwd
        ? `/api/agents/${encodeURIComponent(id)}/locks?cwd=${encodeURIComponent(cwd)}`
        : `/api/agents/${encodeURIComponent(id)}/locks`,
    ),

  // Browser tabs — per-agent live tabs (W3-12). The server owns tabs +
  // history; pages render live in the client iframe (no page bytes on REST).
  listBrowserTabs: (sessionId?: string) =>
    get<BrowserTabsRes>(
      sessionId ? `/api/browser?sessionId=${encodeURIComponent(sessionId)}` : '/api/browser',
    ),
  openBrowserTab: (body: OpenBrowserTabBody) => post<OpenBrowserTabRes>('/api/browser/open', body),
  getBrowserTab: (id: string) => get<BrowserTabRes>(`/api/browser/${encodeURIComponent(id)}`),
  /** Address-bar go — pushes real history (drops forward entries). */
  navigateBrowserTab: (id: string, url: string) =>
    post<BrowserTabRes>(`/api/browser/${encodeURIComponent(id)}/navigate`, { url }),
  backBrowserTab: (id: string) => post<BrowserTabRes>(`/api/browser/${encodeURIComponent(id)}/back`, {}),
  forwardBrowserTab: (id: string) =>
    post<BrowserTabRes>(`/api/browser/${encodeURIComponent(id)}/forward`, {}),
  /** Server touch — the client re-sets the frame (see BrowserPane reload key). */
  reloadBrowserTab: (id: string) =>
    post<BrowserTabRes>(`/api/browser/${encodeURIComponent(id)}/reload`, {}),
  closeBrowserTab: (id: string) =>
    del<CloseBrowserTabRes>(`/api/browser/${encodeURIComponent(id)}`),

  // Archify diagrams — typed IR → validated HTML/SVG (W5-17). The server
  // owns validation + rendering; the pane edits IR and downloads artifacts.
  listDiagrams: () => get<DiagramsRes>('/api/archify/list'),
  generateDiagram: (body: GenerateDiagramBody) => post<GenerateDiagramRes>('/api/archify/generate', body),
  /** 5-gate check without saving (the pane receipt preview). */
  validateDiagram: (ir: ArchifyIR) => post<ValidateDiagramRes>('/api/archify/validate', { ir }),
  getDiagram: (id: string) => get<DiagramDetailRes>(`/api/archify/${encodeURIComponent(id)}`),
  /** Persist an edited IR — server validates + rebuilds viewer/exports. */
  saveDiagram: (id: string, ir: ArchifyIR) =>
    request<SaveDiagramRes>(`/api/archify/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ ir }),
    }),
  /** Before/Delta/After against another diagram (writes delta.html). */
  compareDiagrams: (id: string, baseId: string) =>
    post<DiagramDeltaRes>(`/api/archify/${encodeURIComponent(id)}/delta`, { baseId }),
  /** Starter chain for a topic (fills the generate prompt, editable). */
  getArchifyGuide: (id: string, topic?: string) =>
    get<ArchifyGuideRes>(
      topic
        ? `/api/archify/${encodeURIComponent(id)}/guide?topic=${encodeURIComponent(topic)}`
        : `/api/archify/${encodeURIComponent(id)}/guide`,
    ),
  /** Stable viewer URL (deep-link hashes work on a real URL, not srcDoc). */
  archifyViewUrl: (id: string) => `/api/archify/${encodeURIComponent(id)}/view`,
  /** Real file download — blob + server filename, auth via `authedFetch`. */
  downloadArchifyExport: async (
    id: string,
    format: ArchifyExportFormat,
  ): Promise<{ filename: string; blob: Blob }> => {
    const fallback = `${id}.${format === 'card' ? 'card.svg' : format}`;
    const res = await authedFetch(`/api/archify/${encodeURIComponent(id)}/export?format=${format}`);
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="([^"]+)"/);
    return { filename: match?.[1] ?? fallback, blob };
  },

  // Design Studio — 6 artifact types over bundled systems (W5-18). The
  // server owns generation + guard + critique + rendering; the pane lists,
  // previews, edits HTML and downloads artifacts.
  listDesigns: () => get<DesignsRes>('/api/design/list'),
  generateDesign: (body: GenerateDesignBody) => post<GenerateDesignRes>('/api/design/generate', body),
  getDesign: (id: string) => get<DesignDetailRes>(`/api/design/${encodeURIComponent(id)}`),
  /** Persist an edited HTML document — server validates + re-critiques. */
  saveDesignHtml: (id: string, html: string) =>
    request<SaveDesignRes>(`/api/design/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ html }),
    }),
  /** Re-run the 5D heuristic critique over the stored HTML. */
  critiqueDesign: (id: string) => post<CritiqueDesignRes>(`/api/design/${encodeURIComponent(id)}/critique`, {}),
  /** 4 bundled system cards (name/preset/tokens for the picker). */
  getDesignSystems: () => get<DesignSystemsRes>('/api/design/systems'),
  /** Real `.lokma/DESIGN.md` guard for the server working dir. */
  getDesignGuard: () => get<DesignGuardRes>('/api/design/guard'),
  /** Stable viewer URL (sandboxed iframe, self-contained HTML, no CDN). */
  designViewUrl: (id: string) => `/api/design/${encodeURIComponent(id)}/view`,
  /** Real file download — blob + server filename, auth via `authedFetch`. */
  downloadDesignExport: async (
    id: string,
    format: DesignExportFormat,
  ): Promise<{ filename: string; blob: Blob }> => {
    const fallback = `${id}.${format}`;
    const res = await authedFetch(`/api/design/${encodeURIComponent(id)}/export?format=${format}`);
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="([^"]+)"/);
    return { filename: match?.[1] ?? fallback, blob };
  },

  // Testing Lab — Plan→Run→Classify→Report (W5-19). The server owns
  // execution (one real GET per target) + classification + junit; the pane
  // lists runs, starts new ones, and downloads the Report-stage XML.
  listTestRuns: () => get<TestsRes>('/api/tests/list'),
  runTestPlan: (body: RunTestBody) => post<RunTestRes>('/api/tests/run', body),
  getTestRun: (id: string) => get<TestDetailRes>(`/api/tests/${encodeURIComponent(id)}`),
  /** Report-stage `junit.xml` — blob + server filename, auth via `authedFetch`. */
  downloadTestJunit: async (id: string): Promise<{ filename: string; blob: Blob }> => {
    const fallback = `${id}.junit.xml`;
    const res = await authedFetch(`/api/tests/${encodeURIComponent(id)}/junit`);
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="([^"]+)"/);
    return { filename: match?.[1] ?? fallback, blob };
  },

  // Bots — shareable bot.json packages (W5-20). The server owns the
  // registry (`~/.lokma/bots/` + bundled lokma-ceo); run spawns a real
  // agent + a real session for playground chat.
  listBots: () => get<BotsRes>('/api/bots'),
  getBot: (id: string) => get<BotDetailRes>(`/api/bots/${encodeURIComponent(id)}`),
  createBot: (body: CreateBotBody) => post<BotMutationRes>('/api/bots', body),
  /** Edit a user bot (bundled templates answer 400 `bundled_readonly`). */
  patchBot: (id: string, body: PatchBotBody) =>
    patch<BotMutationRes>(`/api/bots/${encodeURIComponent(id)}`, body),
  /** Clone into a new private bot (`as` optional — server derives one). */
  forkBot: (id: string, body: ForkBotBody = {}) =>
    post<BotMutationRes>(`/api/bots/${encodeURIComponent(id)}/fork`, body),
  /** Flip gallery visibility (shared/public legs). */
  publishBot: (id: string, body: PublishBotBody) =>
    post<BotMutationRes>(`/api/bots/${encodeURIComponent(id)}/publish`, body),
  /** Spawn a real agent + session from the bot (playground run). */
  runBot: (id: string, body: RunBotBody) =>
    post<RunBotRes>(`/api/bots/${encodeURIComponent(id)}/run`, body),

  // Auth + users + projects — RBAC matrix + visibility (W6-21, Docs/36).
  // Login/register return the token twice: httpOnly cookie (set by the
  // server) + JSON body (stored in `localStorage["lokma-token"]` for the
  // Bearer path the CLI also uses).
  registerFirstAdmin: (body: { email: string; name: string; password: string }) =>
    post<AuthSessionRes>('/api/auth/register', body),
  login: (body: { email: string; password: string }) => post<AuthSessionRes>('/api/auth/login', body),
  logout: () => post<{ ok: boolean }>('/api/auth/logout', {}),
  authMe: () => get<AuthMeRes>('/api/auth/me'),
  /** Logged-out check — 401 expected, never bounces to /login. */
  authMeQuiet: () => request<AuthMeRes>('/api/auth/me', { method: 'GET' }, { redirect401: false }),
  acceptInvite: (body: { token: string; name: string; password: string }) =>
    post<AuthSessionRes>('/api/auth/accept-invite', body),
  /** Instance policy — public read (bootstrapped flag included), admin write. */
  getAuthSettings: () => get<AuthSettingsRes>('/api/auth/settings'),
  patchAuthSettings: (body: Partial<AuthSettings>) =>
    patch<AuthSettingsRes>('/api/auth/settings', body),
  /** Admin user table (403 for member/viewer). */
  listUsers: () => get<UsersRes>('/api/users'),
  inviteUser: (body: { email: string; role?: AuthRole; projectIds?: string[] }) =>
    post<InviteRes>('/api/users/invite', body),
  patchUser: (id: string, body: Record<string, unknown>) =>
    patch<AuthMeRes>(`/api/users/${encodeURIComponent(id)}`, body),
  deleteUser: (id: string) => del<{ ok: boolean; id: string }>(`/api/users/${encodeURIComponent(id)}`),
  resetUserPassword: (id: string) =>
    post<ResetPasswordRes>(`/api/users/${encodeURIComponent(id)}/reset-password`, {}),
  /** Projects — visibility-filtered list; create/delete per RBAC policy. */
  listProjects: () => get<ProjectsRes>('/api/projects'),
  createProject: (body: { name: string; cwd?: string; visibility?: ProjectVisibility }) =>
    post<ProjectMutationRes>('/api/projects', body),
  getProject: (id: string) => get<ProjectDetailRes>(`/api/projects/${encodeURIComponent(id)}`),
  patchProject: (id: string, body: Record<string, unknown>) =>
    patch<ProjectMutationRes>(`/api/projects/${encodeURIComponent(id)}`, body),
  deleteProject: (id: string) => del<{ ok: boolean; id: string }>(`/api/projects/${encodeURIComponent(id)}`),
  /** Project members — invite/add/remove (requires `project:edit`). */
  listMembers: (projectId: string) =>
    get<MembersRes>(`/api/projects/${encodeURIComponent(projectId)}/members`),
  addMember: (projectId: string, body: { userId: string; role?: 'member' | 'viewer' }) =>
    post<MemberMutationRes>(`/api/projects/${encodeURIComponent(projectId)}/members`, body),
  removeMember: (projectId: string, userId: string) =>
    del<{ ok: boolean; id: string }>(
      `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
    ),

  // Setup + doctor — optional stack + init + subsystem probes (W6-22,
  // Docs/32 §8). The server owns the registry, the flags, init and every
  // probe; the pane only renders and persists.
  /** Feature registry + resolved flags (stored flags win over defaults). */
  getSetup: () => get<SetupRes>('/api/setup'),
  /** Persist the checkbox map (unknown ids answer 400 `unknown_feature`). */
  saveSetupFeatures: (features: Record<string, boolean>) =>
    post<SetupSaveRes>('/api/setup', { features }),
  /** Ensure global config + data dirs exist (missing ones are created). */
  initSetup: (body: SetupInitBody = {}) => post<SetupInitRes>('/api/setup/init', body),
  /** 8 subsystem probes (+ SOUL when `agents` is true) — all measured live. */
  getDoctor: (agents = false) => get<DoctorRes>(agents ? '/api/doctor?agents=1' : '/api/doctor'),

  // Plugins — kernel registry + hot toggle + add-from-URL (W6-23, Docs/23).
  // Toggle suspends the plugin's routes server-side (503), no restart.
  /** Bundled manifests (real endpoint lists) + URL-installed records. */
  listPlugins: () => get<PluginsRes>('/api/plugins'),
  /** Manifest detail (same record, re-read live for the Kernel expander). */
  getPlugin: (id: string) => get<PluginDetailRes>(`/api/plugins/${encodeURIComponent(id)}`),
  /** Hot enable/disable (suspends/resumes the plugin's routes instantly). */
  setPluginEnabled: (id: string, enabled: boolean) =>
    patch<PluginMutationRes>(`/api/plugins/${encodeURIComponent(id)}`, { enabled }),
  /** Strict https validation; stored suspended until explicitly enabled. */
  installPlugin: (url: string) => post<PluginMutationRes>('/api/plugins/install', { url }),
  /** URL records only — bundled rows answer 400 `bundled_readonly`. */
  deletePlugin: (id: string) => del<{ ok: boolean; id: string }>(`/api/plugins/${encodeURIComponent(id)}`),

  // Observability — agent trace timeline + frozen share snapshots (W6-24).
  // Trace events are derived from durable state server-side (registry +
  // doc mtimes + locks + lineage); shares freeze the trace/transcript so
  // later edits never rewrite shared history.
  /** Live timeline for one agent (404 `agent_not_found`, 400 `bad_agent_id`). */
  getAgentTrace: (id: string) => get<AgentTraceRes>(`/api/agents/${encodeURIComponent(id)}/trace`),
  /** Share metadata list (no snapshot bytes — loaded per share). */
  listShares: () => get<SharesRes>('/api/share'),
  /** Freeze an agent trace — returns the copyable `/share/agent/<token>` URL. */
  shareAgent: (agentId: string) => post<ShareCreateRes>('/api/share/agent', { agentId }),
  /** Freeze a session transcript — returns `/share/session/<token>`. */
  shareSession: (sessionId: string, cwd?: string) =>
    post<ShareCreateRes>('/api/share/session', cwd ? { sessionId, cwd } : { sessionId }),
  /** Read one frozen snapshot (serves the copy, never re-derives). */
  getShare: (token: string) => get<ShareDetailRes>(`/api/share/${encodeURIComponent(token)}`),
  /** Drop a share (source agent/session untouched). */
  deleteShare: (token: string) => del<{ ok: boolean; token: string }>(`/api/share/${encodeURIComponent(token)}`),

  // Cron + approvals — per-agent jobs + WS decision history (W6-25).
  // Toggle/delete/create hit live routes; the Allow/Deny/Always RULES live
  // in `getConfig`/`patchConfig` permissions (same store the chat card
  // writes — one store, two views); history is read-only and real.
  /** All jobs, newest first (pane header counts + list). */
  listCronJobs: () => get<CronListRes>('/api/cron'),
  /** One agent's jobs (404 `agent_not_found`). */
  listAgentCron: (agentId: string) => get<AgentCronRes>(`/api/agents/${encodeURIComponent(agentId)}/cron`),
  /** Create a job (server mints the id; 400 `bad_schedule`/`bad_task`). */
  createCronJob: (agentId: string, body: CronCreateBody) =>
    post<CronMutateRes>(`/api/agents/${encodeURIComponent(agentId)}/cron`, body),
  /** Edit schedule/task/enabled (empty → 400 `empty_patch`). */
  patchCronJob: (agentId: string, jobId: string, body: CronPatchBody) =>
    patch<CronMutateRes>(`/api/agents/${encodeURIComponent(agentId)}/cron/${encodeURIComponent(jobId)}`, body),
  /** Delete a job (unknown → 404, never silent). */
  deleteCronJob: (agentId: string, jobId: string) =>
    del<{ ok: boolean; id: string }>(`/api/agents/${encodeURIComponent(agentId)}/cron/${encodeURIComponent(jobId)}`),
  /** Newest-first WS decision history (fills as real answers arrive). */
  listApprovals: () => get<ApprovalsRes>('/api/approvals'),
};
