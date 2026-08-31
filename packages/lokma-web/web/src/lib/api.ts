/**
 * API helpers — DRY fetch wrappers for REST endpoints.
 * Web and CLI share the same server routes (lokma-shared schemas).
 */

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─── Typed fetchers for Phase 0 routes ───────────────────────────────────

export type HealthRes = { ok: boolean; service: string; version: string };
export type ConfigRes = { config: unknown; credentials: Record<string, { keySet: boolean; last4: string | null }> };
export type ProvidersRes = { providers: { id: string; keySet: boolean; last4: string | null }[] };
export type ModelsRes = { models: { id: string; label: string; provider: string }[] };
export type SessionsRes = { sessions: { id: string }[] };

export const api = {
  health: () => fetchJson<HealthRes>('/api/health'),
  config: () => fetchJson<ConfigRes>('/api/config'),
  providers: () => fetchJson<ProvidersRes>('/api/providers'),
  models: () => fetchJson<ModelsRes>('/api/models'),
  sessions: () => fetchJson<SessionsRes>('/api/sessions'),
};
