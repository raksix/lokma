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
async function toApiError(res: Response): Promise<ApiError> {
  const status = res.status;
  if (status === 401) {
    redirectToLogin();
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
 * Throws ApiError on any non-2xx response.
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = readToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers, credentials: 'include' });
  if (!res.ok) throw await toApiError(res);
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
};
