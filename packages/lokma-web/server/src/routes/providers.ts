import type { FastifyInstance } from 'fastify';
import {
  getMaskedCredentials,
  loadConfig,
  loadCredentials,
  removeCredentials,
  saveCredentials,
  saveGlobal,
} from 'lokma-core';

/**
 * Provider routes — registry list + custom provider CRUD + live connection test.
 * Keys are write-only (AES-GCM 0600 on disk); reads only expose keySet/last4.
 * See Docs/22-WEB-FEATURES §providers
 */

export type ProviderView = {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  keySet: boolean;
  last4: string | null;
  priority: number;
  custom: boolean;
};

/** Built-in display metadata — base URLs mirror the concept SettingsPane. */
const BUILTINS: Record<string, { name: string; baseUrl: string; needsKey: boolean }> = {
  anthropic: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com', needsKey: true },
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', needsKey: true },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', needsKey: true },
  google: { name: 'Google', baseUrl: 'https://generativelanguage.googleapis.com', needsKey: true },
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true },
  ollama: { name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', needsKey: false },
};

const BUILTIN_ORDER = ['anthropic', 'openai', 'deepseek', 'google', 'openrouter', 'ollama'];

/** Conventional env names per provider (file credentials win over env). */
const ENV_KEYS: Record<string, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  google: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
};

const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const PROBE_TIMEOUT_MS = 10_000;

/** Slug check shared with the web dialog (kept in sync, see web validation.ts). */
export function isValidProviderId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

export function isValidBaseUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 500) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Merge built-ins + config overrides/custom entries into one priority-sorted view. */
export async function listProviderViews(): Promise<ProviderView[]> {
  const cfg = await loadConfig(process.cwd());
  const creds = await getMaskedCredentials();
  const overrides = new Map((cfg.providers ?? []).map((p) => [p.id, p]));
  const views: ProviderView[] = [];

  for (let i = 0; i < BUILTIN_ORDER.length; i += 1) {
    const id = BUILTIN_ORDER[i];
    const builtin = BUILTINS[id];
    const override = overrides.get(id);
    views.push({
      id,
      name: override?.name ?? builtin.name,
      baseUrl: override?.baseUrl ?? builtin.baseUrl,
      enabled: override?.enabled ?? true,
      keySet: creds[id]?.keySet ?? false,
      last4: creds[id]?.last4 ?? null,
      priority: override?.priority ?? i,
      custom: false,
    });
  }

  for (const entry of cfg.providers ?? []) {
    if (BUILTINS[entry.id]) continue;
    views.push({
      id: entry.id,
      name: entry.name ?? entry.id,
      baseUrl: entry.baseUrl ?? '',
      enabled: entry.enabled ?? true,
      keySet: creds[entry.id]?.keySet ?? false,
      last4: creds[entry.id]?.last4 ?? null,
      priority: entry.priority ?? BUILTIN_ORDER.length,
      custom: true,
    });
  }

  views.sort((a, b) => a.priority - b.priority);
  return views;
}

/** Resolve the raw key for probing (file creds first, then conventional env vars). */
export async function resolveApiKey(id: string): Promise<string | null> {
  const creds = await loadCredentials();
  const fileKey = (creds.providers[id] as { apiKey?: string } | undefined)?.apiKey;
  if (fileKey) return fileKey;
  for (const envName of ENV_KEYS[id] ?? []) {
    const envKey = process.env[envName];
    if (envKey) return envKey;
  }
  return null;
}

/**
 * Wire-level upstream for a harness provider id — the single place that maps
 * ids to real adapters (DRY: WS chat + cron-runner share it).
 * `anthropic` rides the Anthropic adapter; every OpenAI-compatible id
 * (openai/deepseek/openrouter/ollama/any custom entry with a baseUrl) rides
 * the OpenAI adapter with that id's configured base URL (built-in default or
 * `PATCH /api/providers/:id` override). Anything else throws — the caller
 * surfaces it as an honest `error` frame, never mock output.
 */
export async function resolveProviderUpstream(
  id: string,
): Promise<{ provider: 'anthropic' | 'openai'; baseUrl: string; apiKey: string | null }> {
  const views = await listProviderViews();
  const view = views.find((v) => v.id === id);
  const apiKey = await resolveApiKey(id);
  if (id === 'anthropic') {
    return { provider: 'anthropic', baseUrl: view?.baseUrl ?? BUILTINS.anthropic.baseUrl, apiKey };
  }
  if (id === 'openai' || id === 'deepseek' || id === 'openrouter' || id === 'ollama' || (view && view.baseUrl)) {
    return { provider: 'openai', baseUrl: view?.baseUrl ?? BUILTINS.openai.baseUrl, apiKey };
  }
  const err = new Error(
    `Provider "${id}" is not wired for chat yet (wired: anthropic, openai, deepseek, openrouter, ollama, custom OpenAI-compatible) — configure it in Settings → Providers.`,
  );
  (err as Error & { code?: string }).code = 'provider_not_wired';
  throw err;
}

/** Live connection check against the provider's real models endpoint. */
async function probeProvider(
  view: ProviderView,
  apiKey: string | null,
): Promise<{ ok: boolean; modelCount?: number; models?: string[]; latencyMs: number; error?: string }> {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const base = view.baseUrl.replace(/\/$/, '');
    let url: string;
    const headers: Record<string, string> = {};
    if (view.id === 'anthropic') {
      url = `${base}/v1/models`;
      headers['x-api-key'] = apiKey ?? '';
      headers['anthropic-version'] = '2023-06-01';
    } else if (view.id === 'google') {
      url = `${base}/v1beta/models?key=${encodeURIComponent(apiKey ?? '')}`;
    } else {
      url = `${base}/models`;
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    }
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      let host = view.baseUrl;
      try {
        host = new URL(url).host;
      } catch {
        // Keep the raw base URL when parsing fails.
      }
      return { ok: false, latencyMs, error: `HTTP ${res.status} from ${host}` };
    }
    const body = (await res.json()) as { data?: { id: string }[]; models?: { name: string }[] };
    const ids = Array.isArray(body.data)
      ? body.data.map((m) => m.id).filter((x): x is string => typeof x === 'string')
      : Array.isArray(body.models)
        ? body.models.map((m) => m.name).filter((x): x is string => typeof x === 'string')
        : [];
    return { ok: true, modelCount: ids.length, models: ids.slice(0, 20), latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - started;
    const reason =
      e instanceof Error && e.name === 'AbortError'
        ? `timed out after ${PROBE_TIMEOUT_MS / 1000}s`
        : e instanceof Error
          ? e.message
          : 'probe failed';
    return { ok: false, latencyMs, error: reason.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

export async function providerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/providers', async () => {
    const providers = await listProviderViews();
    return { providers };
  });

  app.post('/api/providers', async (req, reply) => {
    const body = (req.body ?? {}) as { id?: unknown; name?: unknown; baseUrl?: unknown; apiKey?: unknown; enabled?: unknown };
    if (!isValidProviderId(body.id)) {
      return reply.code(400).send({ ok: false, code: 'bad_id', message: 'id must be a slug: lowercase letters, digits, dashes (2-41 chars)' });
    }
    if (typeof body.name !== 'string' || body.name.trim().length === 0 || body.name.length > 80) {
      return reply.code(400).send({ ok: false, code: 'bad_name', message: 'name is required (1-80 chars)' });
    }
    if (!isValidBaseUrl(body.baseUrl)) {
      return reply.code(400).send({ ok: false, code: 'bad_url', message: 'baseUrl must be an http(s) URL' });
    }
    if (body.apiKey !== undefined && (typeof body.apiKey !== 'string' || body.apiKey.length === 0)) {
      return reply.code(400).send({ ok: false, code: 'bad_key', message: 'apiKey must be a non-empty string when provided' });
    }
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
      return reply.code(400).send({ ok: false, code: 'bad_enabled', message: 'enabled must be a boolean' });
    }

    const existing = await listProviderViews();
    if (existing.some((p) => p.id === body.id)) {
      return reply.code(409).send({ ok: false, code: 'duplicate_id', message: `Provider already exists: ${body.id}` });
    }

    const cfg = await loadConfig(process.cwd());
    const providers = [...(cfg.providers ?? [])];
    providers.push({
      id: body.id,
      enabled: body.enabled ?? true,
      priority: existing.length,
      name: body.name.trim(),
      baseUrl: (body.baseUrl as string).replace(/\/$/, ''),
    });
    await saveGlobal({ providers });
    if (typeof body.apiKey === 'string') await saveCredentials(body.id, body.apiKey);

    const providersAfter = await listProviderViews();
    const created = providersAfter.find((p) => p.id === body.id);
    return reply.code(201).send({ ok: true, provider: created });
  });

  app.patch('/api/providers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await listProviderViews();
    if (!existing.some((p) => p.id === id)) {
      return reply.code(404).send({ ok: false, code: 'not_found', message: `Unknown provider: ${id}` });
    }
    const body = (req.body ?? {}) as {
      name?: unknown;
      baseUrl?: unknown;
      enabled?: unknown;
      priority?: unknown;
      apiKey?: unknown;
    };
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length === 0 || body.name.length > 80)) {
      return reply.code(400).send({ ok: false, code: 'bad_name', message: 'name must be 1-80 chars' });
    }
    if (body.baseUrl !== undefined && !isValidBaseUrl(body.baseUrl)) {
      return reply.code(400).send({ ok: false, code: 'bad_url', message: 'baseUrl must be an http(s) URL' });
    }
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
      return reply.code(400).send({ ok: false, code: 'bad_enabled', message: 'enabled must be a boolean' });
    }
    if (body.priority !== undefined && (typeof body.priority !== 'number' || !Number.isInteger(body.priority) || body.priority < 0)) {
      return reply.code(400).send({ ok: false, code: 'bad_priority', message: 'priority must be a non-negative integer' });
    }
    if (body.apiKey !== undefined && (typeof body.apiKey !== 'string' || body.apiKey.length === 0)) {
      return reply.code(400).send({ ok: false, code: 'bad_key', message: 'apiKey must be a non-empty string when provided' });
    }
    if (
      body.name === undefined &&
      body.baseUrl === undefined &&
      body.enabled === undefined &&
      body.priority === undefined &&
      body.apiKey === undefined
    ) {
      return reply.code(400).send({ ok: false, code: 'empty_patch', message: 'Nothing to update' });
    }

    const cfg = await loadConfig(process.cwd());
    const providers = [...(cfg.providers ?? [])];
    const idx = providers.findIndex((p) => p.id === id);
    const current: { id: string; enabled?: boolean; priority?: number; name?: string; baseUrl?: string } =
      idx >= 0 ? { ...providers[idx] } : { id };
    if (typeof body.name === 'string') current.name = body.name.trim();
    if (typeof body.baseUrl === 'string') current.baseUrl = body.baseUrl.replace(/\/$/, '');
    if (typeof body.enabled === 'boolean') current.enabled = body.enabled;
    if (typeof body.priority === 'number') current.priority = body.priority;
    if (idx >= 0) providers[idx] = current as (typeof providers)[number];
    else {
      if (current.enabled === undefined) current.enabled = true;
      if (current.priority === undefined) {
        const views = await listProviderViews();
        const found = views.find((p) => p.id === id);
        current.priority = found?.priority ?? views.length;
      }
      providers.push(current as (typeof providers)[number]);
    }
    await saveGlobal({ providers });
    if (typeof body.apiKey === 'string') await saveCredentials(id, body.apiKey);

    const providersAfter = await listProviderViews();
    return { ok: true, provider: providersAfter.find((p) => p.id === id) };
  });

  app.delete('/api/providers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (BUILTINS[id]) {
      return reply.code(400).send({ ok: false, code: 'cannot_delete_builtin', message: `Built-in provider cannot be deleted (disable it instead): ${id}` });
    }
    const cfg = await loadConfig(process.cwd());
    const providers = [...(cfg.providers ?? [])];
    if (!providers.some((p) => p.id === id)) {
      return reply.code(404).send({ ok: false, code: 'not_found', message: `Unknown provider: ${id}` });
    }
    await saveGlobal({ providers: providers.filter((p) => p.id !== id) });
    await removeCredentials(id);
    return { ok: true, id };
  });

  app.post('/api/providers/reorder', async (req, reply) => {
    const body = (req.body ?? {}) as { order?: unknown };
    const current = await listProviderViews();
    const currentIds = new Set(current.map((p) => p.id));
    if (
      !Array.isArray(body.order) ||
      body.order.length !== current.length ||
      new Set(body.order).size !== current.length ||
      !(body.order as unknown[]).every((id) => typeof id === 'string' && currentIds.has(id))
    ) {
      return reply
        .code(400)
        .send({ ok: false, code: 'bad_order', message: 'order must list every known provider id exactly once' });
    }
    const order = body.order as string[];
    const cfg = await loadConfig(process.cwd());
    const providers = [...(cfg.providers ?? [])];
    const byId = new Map(providers.map((p) => [p.id, p]));
    // Persist every provider (built-ins gain an override entry) so order survives restarts.
    const next = order.map((id, priority) => ({ ...(byId.get(id) ?? { id, enabled: true }), priority }));
    await saveGlobal({ providers: next as (typeof providers)[number][] });
    return { ok: true, providers: await listProviderViews() };
  });

  app.post('/api/providers/:id/test', async (req, reply) => {
    const { id } = req.params as { id: string };
    const views = await listProviderViews();
    const view = views.find((p) => p.id === id);
    if (!view) {
      return reply.code(404).send({ ok: false, code: 'not_found', message: `Unknown provider: ${id}` });
    }
    if (!view.enabled) {
      return reply.code(400).send({ ok: false, code: 'provider_disabled', message: `Provider is disabled: ${id}` });
    }
    const needsKey = BUILTINS[id]?.needsKey ?? true;
    const apiKey = await resolveApiKey(id);
    if (needsKey && !apiKey) {
      return { ok: false, provider: id, error: 'No API key stored — add a key first' };
    }
    const result = await probeProvider(view, apiKey);
    return { provider: id, ...result };
  });
}
