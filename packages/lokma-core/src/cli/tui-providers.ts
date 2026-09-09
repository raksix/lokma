import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { Interface } from 'node:readline/promises';
import { applyModelFlags, getCatalog, invalidateCatalog, type CatalogModel } from 'lokma-ai';
import {
  isValidBaseUrl,
  isValidProviderId,
  listProviderViews,
  probeProvider,
  providerNeedsKey,
  resolveApiKey,
  type ProviderView,
} from '../providers/providers.js';
import { loadConfig, saveGlobal } from '../config/loader.js';
import { loadCredentials, removeCredentials, saveCredentials } from '../config/credentials.js';
import type { Paint } from './tui-paint.js';

/**
 * TUI provider management + login — the terminal twin of the Web Providers
 * tab and Models tab (`GET /api/providers`, `POST /api/models/refresh`).
 * Same core registry (`../providers/`), same live probes, same 0600
 * credential store. `/login` verifies a pasted key against the provider's
 * real `/models` endpoint before saving (never stores a dead key);
 * `/logout` removes it. OAuth device flow (RFC 8628) runs only with
 * user-supplied endpoints in `~/.lokma/oauth.json` — no third-party
 * client IDs are embedded, so unwired providers say so honestly.
 * OAuth access tokens ride chat only on OpenAI-compatible (Bearer)
 * providers; Anthropic uses `x-api-key` and stays key-only.
 * See Docs/22 §providers + Docs/26 §credentials.
 */

const exec = promisify(execFile);

export type { ProviderView };

// ── Table ────────────────────────────────────────────────────────────────────

export async function oauthProviders(): Promise<Set<string>> {
  try {
    const { expandHome } = await import('../utils/fs.js');
    const raw = await readFile(expandHome('~/.lokma/oauth.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { providers?: Record<string, unknown> };
    return new Set(Object.keys(parsed.providers ?? {}));
  } catch {
    return new Set();
  }
}

export async function renderProviderTable(p: Paint): Promise<string> {
  const views = await listProviderViews();
  const oauth = await oauthProviders();
  const creds = await loadCredentials().catch(() => null);
  const lines = views.map((v) => {
    const keyMark = v.keySet ? p.ok(`key …${v.last4 ?? '????'}`) : p.muted('no key');
    const oauthMark = (creds?.providers[v.id] as { oauth?: unknown } | undefined)?.oauth
      ? p.info('oauth')
      : oauth.has(v.id)
        ? p.muted('oauth?')
        : '';
    const state = v.enabled ? p.ok('on ') : p.err('off');
    const id = v.id.padEnd(12);
    return `  ${state} ${p.bold(id)} ${(v.name + (v.custom ? ' (custom)' : '')).padEnd(22)} ${keyMark} ${oauthMark}`;
  });
  return [`${p.bold('providers')} ${p.muted(`(${views.length}) — /login <id> · /logout <id>`)}`, ...lines].join('\n');
}

// ── Mutations (same validation shapes as POST/PATCH/DELETE /api/providers) ──

export async function setProviderEnabled(id: string, enabled: boolean): Promise<ProviderView> {
  const views = await listProviderViews();
  const view = views.find((v) => v.id === id);
  if (!view) throw new Error(`Unknown provider: ${id}`);
  const cfg = await loadConfig(process.cwd());
  const providers = [...(cfg.providers ?? [])];
  const idx = providers.findIndex((entry) => entry.id === id);
  if (idx >= 0) {
    providers[idx] = { ...providers[idx], enabled } as (typeof providers)[number];
  } else {
    providers.push({ id, enabled, priority: view.priority });
  }
  await saveGlobal({ providers });
  const after = await listProviderViews();
  const updated = after.find((v) => v.id === id);
  if (!updated) throw new Error(`Provider vanished after update: ${id}`);
  return updated;
}

export async function addCustomProvider(opts: { id: string; name: string; baseUrl: string; apiKey?: string }): Promise<ProviderView> {
  if (!isValidProviderId(opts.id)) throw new Error('id must be a slug: lowercase letters, digits, dashes (2-41 chars)');
  if (!opts.name.trim() || opts.name.length > 80) throw new Error('name is required (1-80 chars)');
  if (!isValidBaseUrl(opts.baseUrl)) throw new Error('baseUrl must be an http(s) URL');
  const views = await listProviderViews();
  if (views.some((v) => v.id === opts.id)) throw new Error(`Provider already exists: ${opts.id}`);
  const cfg = await loadConfig(process.cwd());
  await saveGlobal({
    providers: [
      ...(cfg.providers ?? []),
      { id: opts.id, enabled: true, priority: views.length, name: opts.name.trim(), baseUrl: opts.baseUrl.replace(/\/$/, '') },
    ],
  });
  if (opts.apiKey) await saveCredentials(opts.id, opts.apiKey);
  const after = await listProviderViews();
  const created = after.find((v) => v.id === opts.id);
  if (!created) throw new Error(`Provider vanished after create: ${opts.id}`);
  return created;
}

export async function removeCustomProvider(id: string): Promise<void> {
  const views = await listProviderViews();
  const view = views.find((v) => v.id === id);
  if (!view) throw new Error(`Unknown provider: ${id}`);
  if (!view.custom) throw new Error(`Built-in provider cannot be deleted (disable it instead): ${id}`);
  const cfg = await loadConfig(process.cwd());
  await saveGlobal({ providers: (cfg.providers ?? []).filter((entry) => entry.id !== id) });
  await removeCredentials(id);
}

export async function testProvider(id: string): Promise<{ ok: boolean; detail: string }> {
  const views = await listProviderViews();
  const view = views.find((v) => v.id === id);
  if (!view) return { ok: false, detail: `Unknown provider: ${id}` };
  if (!view.enabled) return { ok: false, detail: `Provider is disabled: ${id}` };
  const apiKey = await resolveChatKey(id);
  if (!apiKey && providerNeedsKey(id)) return { ok: false, detail: 'No API key stored — /login first' };
  const probed = await probeProvider(view, apiKey);
  if (!probed.ok) return { ok: false, detail: probed.error ?? 'probe failed' };
  const sample = (probed.models ?? []).slice(0, 3).join(', ');
  return { ok: true, detail: `${probed.modelCount ?? 0} models · ${probed.latencyMs}ms${sample ? ` · e.g. ${sample}` : ''}` };
}

// ── Chat key: file apiKey → OAuth token (Bearer providers only) → env ────────

/** OAuth tokens are Bearer credentials — they only ride OpenAI-compatible providers. */
function oauthEligible(providerId: string): boolean {
  return providerId !== 'anthropic' && providerId !== 'google';
}

export async function resolveChatKey(providerId: string): Promise<string | null> {
  const file = await loadCredentials().catch(() => null);
  const entry = file?.providers[providerId] as { apiKey?: string; oauth?: { access_token?: string } | null } | undefined;
  if (entry?.apiKey) return entry.apiKey;
  if (oauthEligible(providerId) && typeof entry?.oauth?.access_token === 'string' && entry.oauth.access_token) {
    return entry.oauth.access_token;
  }
  return resolveApiKey(providerId);
}

// ── Model catalog (static + bounded live probes, mirrors POST /api/models/refresh) ──

const CATALOG_PROBE_TIMEOUT_MS = 6_000;
const CATALOG_PROBE_MAX_IDS = 500;

export async function getMergedCatalogTui(): Promise<CatalogModel[]> {
  const base = await getCatalog();
  const byId = new Map(base.map((m) => [m.id, m]));
  const views = await listProviderViews();
  const outcomes = await Promise.all(
    views
      .filter((v) => v.enabled)
      .map(async (view) => {
        const apiKey = await resolveChatKey(view.id);
        if (!apiKey && providerNeedsKey(view.id)) return null;
        const probed = await probeProvider(view, apiKey, { timeoutMs: CATALOG_PROBE_TIMEOUT_MS, maxIds: CATALOG_PROBE_MAX_IDS });
        if (!probed.ok || !probed.models) return null;
        return { viewId: view.id, ids: probed.models };
      }),
  );
  for (const outcome of outcomes) {
    if (!outcome) continue;
    for (const raw of outcome.ids) {
      const full = raw.includes('/') ? raw : `${outcome.viewId}/${raw}`;
      const short = full.slice(full.lastIndexOf('/') + 1);
      byId.set(full, { id: full, label: short || full, provider: outcome.viewId, enabled: true });
    }
  }
  const cfg = await loadConfig(process.cwd()).catch(() => null);
  return applyModelFlags([...byId.values()], cfg?.models ?? {});
}

export async function setModelEnabled(id: string, enabled: boolean): Promise<void> {
  const catalog = await getMergedCatalogTui();
  if (!catalog.some((m) => m.id === id)) throw new Error(`Unknown model id: ${id}`);
  const cfg = await loadConfig(process.cwd());
  await saveGlobal({ models: { ...(cfg.models ?? {}), [id]: { enabled } } });
  invalidateCatalog();
}

// ── Login / logout ───────────────────────────────────────────────────────────

/** Hidden input (no echo) for pasting keys — best-effort mute, always restored. */
export async function hiddenInput(rl: Interface, prompt: string, signal?: AbortSignal): Promise<string | null> {
  const target = rl as unknown as { _writeToOutput?: (s: string) => void };
  const original = target._writeToOutput;
  try {
    target._writeToOutput = (): void => {
      // Muted — the key never echoes to the scrollback.
    };
    const answer = signal ? await rl.question(prompt, { signal }) : await rl.question(prompt);
    return answer;
  } catch {
    return null;
  } finally {
    if (original) target._writeToOutput = original;
    else delete target._writeToOutput;
    process.stdout.write('\n');
  }
}

export function openBrowser(url: string): void {
  const platform = process.platform;
  const args =
    platform === 'win32' ? ['/c', 'start', '""', url] : platform === 'darwin' ? [url] : [url];
  const cmd = platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'open' : 'xdg-open';
  exec(cmd, args, { timeout: 10_000 }).catch(() => {
    // No browser launcher — the URL is already printed for manual open.
  });
}

type OAuthDeviceConfig = {
  deviceAuthorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  scope?: string;
};

async function readOAuthDeviceConfig(providerId: string): Promise<OAuthDeviceConfig | null> {
  try {
    const { expandHome } = await import('../utils/fs.js');
    const raw = await readFile(expandHome('~/.lokma/oauth.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { providers?: Record<string, OAuthDeviceConfig> };
    const entry = parsed.providers?.[providerId];
    if (!entry || typeof entry.deviceAuthorizationEndpoint !== 'string' || typeof entry.tokenEndpoint !== 'string' || typeof entry.clientId !== 'string') {
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

/**
 * RFC 8628 device authorization grant against user-supplied endpoints.
 * Returns the access token; the caller persists it via `saveOAuthToken`.
 * No embedded third-party client IDs — without `~/.lokma/oauth.json`
 * entries this path honestly reports "not configured".
 */
export async function oauthDeviceFlow(
  rl: Interface,
  p: Paint,
  providerId: string,
  signal?: AbortSignal,
): Promise<string> {
  const conf = await readOAuthDeviceConfig(providerId);
  if (!conf) {
    throw new Error(
      `OAuth is not configured for '${providerId}' — add device endpoints to ~/.lokma/oauth.json or log in with an API key instead.`,
    );
  }
  const deviceRes = await fetch(conf.deviceAuthorizationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: conf.clientId, ...(conf.scope ? { scope: conf.scope } : {}) }),
    signal,
  });
  if (!deviceRes.ok) throw new Error(`OAuth device request failed: HTTP ${deviceRes.status}`);
  const device = (await deviceRes.json()) as {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    verification_uri_complete?: string;
    expires_in?: number;
    interval?: number;
  };
  if (!device.device_code || !device.user_code || !(device.verification_uri_complete ?? device.verification_uri)) {
    throw new Error('OAuth device request returned an unusable response');
  }
  const verifyUrl = device.verification_uri_complete ?? (device.verification_uri as string);
  console.log(`\n  ${p.bold('1.')} Open ${p.info(verifyUrl)}`);
  console.log(`  ${p.bold('2.')} Enter code ${p.bold(device.user_code)}`);
  openBrowser(verifyUrl);
  try {
    await rl.question(p.muted('  Press Enter after approving in the browser…'), { signal });
  } catch {
    throw new Error('OAuth approval aborted');
  }

  const intervalMs = Math.max(5, device.interval ?? 5) * 1000;
  const deadline = Date.now() + Math.min(600, device.expires_in ?? 600) * 1000;
  for (;;) {
    if (Date.now() > deadline) throw new Error('OAuth approval timed out');
    if (signal?.aborted) throw new Error('OAuth approval aborted');
    await new Promise((r) => setTimeout(r, intervalMs));
    const tokenRes = await fetch(conf.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: device.device_code,
        client_id: conf.clientId,
      }),
      signal,
    });
    const token = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (typeof token.access_token === 'string' && token.access_token) return token.access_token;
    if (token.error && token.error !== 'authorization_pending' && token.error !== 'slow_down') {
      throw new Error(`OAuth failed: ${token.error}`);
    }
  }
}

export type LoginResult = { providerId: string; via: 'api_key' | 'oauth'; detail: string };

/**
 * Interactive login: pick provider → pick method → verify live → save 0600.
 * API keys are verified with a real `/models` probe before persisting, so a
 * stored key provably works. Returns the login summary for the status line.
 */
export async function loginFlow(
  rl: Interface,
  p: Paint,
  providerArg: string | undefined,
  signal?: AbortSignal,
): Promise<LoginResult> {
  const views = await listProviderViews();
  let providerId = providerArg?.trim() ?? '';
  if (!providerId || !views.some((v) => v.id === providerId)) {
    console.log(`\n${p.bold('log in to a provider')}`);
    views.forEach((v, i) => {
      const mark = v.keySet ? p.ok(`key …${v.last4 ?? '????'}`) : p.muted('no key');
      console.log(`  ${p.info(String(i + 1))}) ${p.bold(v.id.padEnd(12))} ${v.name.padEnd(22)} ${mark}`);
    });
    const raw = signal ? await rl.question(p.muted('  provider (number or id): '), { signal }).catch(() => null) : await rl.question(p.muted('  provider (number or id): ')).catch(() => null);
    if (raw === null || raw === undefined) throw new Error('login aborted');
    const n = Number(raw.trim());
    const picked = Number.isInteger(n) && n >= 1 && n <= views.length ? views[n - 1] : views.find((v) => v.id === raw.trim());
    if (!picked) throw new Error(`Unknown provider: ${raw.trim()}`);
    providerId = picked.id;
  }
  const view = views.find((v) => v.id === providerId);
  if (!view) throw new Error(`Unknown provider: ${providerId}`);

  const oauthConf = await readOAuthDeviceConfig(providerId);
  const methods = oauthEligible(providerId) && oauthConf ? ['API key', 'OAuth (browser)'] : ['API key'];
  let method = 'API key';
  if (methods.length > 1) {
    console.log(`\n${p.bold(`log in to ${providerId}`)}`);
    methods.forEach((m, i) => console.log(`  ${p.info(String(i + 1))}) ${m}`));
    const raw = await rl.question(p.muted('  method: '), { signal }).catch(() => null);
    if (raw === null || raw === undefined) throw new Error('login aborted');
    const n = Number(raw.trim());
    method = Number.isInteger(n) && n >= 1 && n <= methods.length ? (methods[n - 1] as string) : raw.trim() || 'API key';
  }

  if (method.toLowerCase().startsWith('oauth')) {
    if (!oauthEligible(providerId)) {
      throw new Error(`OAuth tokens cannot ride '${providerId}' (x-api-key scheme) — use an API key.`);
    }
    const token = await oauthDeviceFlow(rl, p, providerId, signal);
    const { saveOAuthToken } = await import('../config/credentials.js');
    await saveOAuthToken(providerId, { access_token: token, obtained_at: new Date().toISOString() });
    const probed = await probeProvider(view, token, { timeoutMs: 10_000, maxIds: 5 });
    return { providerId, via: 'oauth', detail: probed.ok ? `verified · ${probed.modelCount ?? 0} models` : 'saved (probe failed — key may still work for chat)' };
  }

  const key = await hiddenInput(rl, p.muted(`  paste API key for ${providerId}: `), signal);
  if (key === null || !key.trim()) throw new Error('login aborted');
  const candidate = key.trim();
  const probed = await probeProvider(view, candidate, { timeoutMs: 10_000, maxIds: 5 });
  if (!probed.ok) {
    throw new Error(`Key verification failed: ${probed.error ?? 'probe failed'} — key NOT saved.`);
  }
  await saveCredentials(providerId, candidate);
  return { providerId, via: 'api_key', detail: `verified · ${probed.modelCount ?? 0} models · saved 0600` };
}

export async function logoutFlow(providerArg: string | undefined): Promise<string> {
  const views = await listProviderViews();
  const providerId = providerArg?.trim() ?? '';
  if (!providerId || !views.some((v) => v.id === providerId)) {
    throw new Error(`Unknown provider: ${providerId || '(none given)'} — usage: /logout <id>`);
  }
  const { removeOAuthToken } = await import('../config/credentials.js');
  const removedKey = await removeCredentials(providerId);
  const removedOauth = await removeOAuthToken(providerId);
  if (!removedKey && !removedOauth) return `No stored credential for '${providerId}' — nothing to do.`;
  const parts = [];
  if (removedKey) parts.push('API key');
  if (removedOauth) parts.push('OAuth token');
  return `Logged out of '${providerId}' (${parts.join(' + ')} removed).`;
}
