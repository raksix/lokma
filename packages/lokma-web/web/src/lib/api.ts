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

async function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

/** Back-compat thin wrapper — kept for existing callers, now with auth + 401 handling. */
export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init);
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
export type ModelInfo = { id: string; label: string; provider: string };
export type ModelsRes = { models: ModelInfo[]; count: number; cached: boolean };
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
export type AgentsRes = { agents: AgentInfo[] };
export type SkillInfo = { id: string; [k: string]: unknown };
export type SkillsRes = { skills: SkillInfo[] };
export type VaultGraphRes = { nodes: unknown[]; links: unknown[]; note?: string };

// ─── One function per endpoint group ────────────────────────────────────────

export const api = {
  // Health + config
  health: () => get<HealthRes>('/api/health'),
  getConfig: () => get<ConfigRes>('/api/config'),
  config: () => get<ConfigRes>('/api/config'),
  patchConfig: (patchBody: Record<string, unknown>) =>
    patch<{ ok: boolean; patched: string[] }>('/api/config', patchBody),

  // Providers + models — full CRUD lands with the W2 Providers tab (server real).
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

  // Agents + skills (read-only on the server today; mutations land in W4)
  listAgents: () => get<AgentsRes>('/api/agents'),
  getAgent: (id: string) => get<AgentInfo>(`/api/agents/${encodeURIComponent(id)}`),
  listSkills: () => get<SkillsRes>('/api/skills'),
  getSkill: (id: string) => get<SkillInfo>(`/api/skills/${encodeURIComponent(id)}`),

  // Vault (real graph lands in W4; the client already hits the real URL)
  getVaultGraph: (query?: string) =>
    get<VaultGraphRes>(query ? `/api/vault/graph?q=${encodeURIComponent(query)}` : '/api/vault/graph'),
};
