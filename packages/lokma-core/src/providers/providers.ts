import { getMaskedCredentials, loadConfig, loadCredentials } from '../config/index.js';

/**
 * Provider registry — the single implementation behind the Web
 * (`GET /api/providers`, WS chat upstream, cron-runner) and the terminal
 * TUI (`/providers`, `/login`, `/model`). Moved here from
 * `packages/lokma-web/server/src/routes/providers.ts` so both surfaces
 * share one view of providers, keys, and live probes (DRY).
 * Keys are write-only (AES-GCM 0600 on disk); reads only expose
 * keySet/last4. See Docs/22-WEB-FEATURES §providers.
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
export const BUILTINS: Record<string, { name: string; baseUrl: string; needsKey: boolean }> = {
  anthropic: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com', needsKey: true },
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', needsKey: true },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', needsKey: true },
  google: { name: 'Google', baseUrl: 'https://generativelanguage.googleapis.com', needsKey: true },
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true },
  ollama: { name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', needsKey: false },
};

export const BUILTIN_ORDER = ['anthropic', 'openai', 'deepseek', 'google', 'openrouter', 'ollama'];

/** Conventional env names per provider (file credentials win over env). */
export const ENV_KEYS: Record<string, string[]> = {
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
 * ids to real adapters (DRY: WS chat + cron-runner + TUI share it).
 * `anthropic` rides the Anthropic adapter; every OpenAI-compatible id
 * (openai/deepseek/openrouter/ollama/any custom entry with a baseUrl) rides
 * the OpenAI adapter with that id's configured base URL (built-in default or
 * config override). Anything else throws — the caller surfaces it as an
 * honest error, never mock output.
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

/**
 * Live connection check against the provider's real models endpoint.
 * `opts.timeoutMs` bounds one probe (default 10s); `opts.maxIds` caps the
 * returned id list (default 20 — the test toast only shows a sample, while
 * the catalog merge passes a high cap so no model is dropped).
 */
export async function probeProvider(
  view: ProviderView,
  apiKey: string | null,
  opts?: { timeoutMs?: number; maxIds?: number },
): Promise<{ ok: boolean; modelCount?: number; models?: string[]; latencyMs: number; error?: string }> {
  const started = Date.now();
  const timeoutMs = opts?.timeoutMs ?? PROBE_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
    return { ok: true, modelCount: ids.length, models: ids.slice(0, opts?.maxIds ?? 20), latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - started;
    const reason =
      e instanceof Error && e.name === 'AbortError'
        ? `timed out after ${timeoutMs / 1000}s`
        : e instanceof Error
          ? e.message
          : 'probe failed';
    return { ok: false, latencyMs, error: reason.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

/** True when the provider id needs a stored key for live calls (REQ-030 merge). */
export function providerNeedsKey(id: string): boolean {
  return BUILTINS[id]?.needsKey ?? true;
}
