import { z } from 'zod';
import { ProviderError, providerOfId, stream as aiStream } from '@lokma/ai';
import { saveCredentials } from '../config/credentials.js';
import { loadConfig, saveGlobal } from '../config/loader.js';
import { isValidBaseUrl, isValidProviderId, listProviderViews, resolveProviderUpstream } from '../providers/providers.js';
import type { ToolDefinition } from './registry.js';

/**
 * Providers + Models tool family (REQ-181 wave 3) — the agent manages the
 * same registry the Providers pane lists and probes:
 *
 *  - `provider_add` mirrors the REST route (`POST /api/providers`) exactly:
 *    id-slug + URL validation, duplicate refusal, global-config save and an
 *    optional key stored through the credentials store (0600, never echoed).
 *  - `model_probe` makes ONE real upstream call — resolve provider upstream
 *    (key + base URL), stream a one-word request, stop at the first text
 *    delta — and reports the honest result: latency, time-to-first-token,
 *    the reply sample, or the upstream's own error code. It never fakes a
 *    pass for a dead model.
 */

const ProviderAddInput = z.object({
  /** Provider id slug: lowercase letters, digits, dashes. */
  id: z.string().min(2).max(41),
  name: z.string().min(1).max(80),
  baseUrl: z.string().min(1).max(300),
  /** Optional API key — stored in the credentials store, never echoed back. */
  apiKey: z.string().min(1).max(400).optional(),
  enabled: z.boolean().optional(),
});

const ModelProbeInput = z.object({
  /** Provider-prefixed model id, e.g. `opencode-go/mimo-v2.5`. */
  model: z.string().min(1).max(200),
});

/** One probe call is bounded — a hung upstream must not wedge the tool. */
const MODEL_PROBE_TIMEOUT_MS = 30_000;
/** Reply sample kept from the probe (proof of life, not a full answer). */
const PROBE_REPLY_CAP = 200;

export const PROVIDER_TOOL_NAMES = ['provider_add', 'model_probe'] as const;

export function buildProviderTools(): ToolDefinition[] {
  return [
    {
      name: 'provider_add',
      description:
        'Add a model provider (id, name, base URL, optional API key) to the live registry; the key is stored server-side and never echoed back.',
      inputSchema: ProviderAddInput,
      readOnly: false,
      maxResultSizeChars: 4_000,
      handler: async (input) => {
        const { id, name, baseUrl, apiKey, enabled } = input as z.infer<typeof ProviderAddInput>;
        if (!isValidProviderId(id)) {
          return { ok: false, code: 'bad_id', message: 'id must be a slug: lowercase letters, digits, dashes (2-41 chars)' };
        }
        if (!isValidBaseUrl(baseUrl)) {
          return { ok: false, code: 'bad_url', message: 'baseUrl must be an http(s) URL' };
        }
        const existing = await listProviderViews();
        if (existing.some((p) => p.id === id)) {
          return { ok: false, code: 'duplicate_id', message: `Provider already exists: ${id}` };
        }
        const cfg = await loadConfig(process.cwd());
        const providers = [...(cfg.providers ?? [])];
        providers.push({
          id,
          enabled: enabled ?? true,
          priority: existing.length,
          name: name.trim(),
          baseUrl: baseUrl.replace(/\/$/, ''),
        });
        await saveGlobal({ providers });
        if (typeof apiKey === 'string') await saveCredentials(id, apiKey);
        const providersAfter = await listProviderViews();
        const created = providersAfter.find((p) => p.id === id);
        return { ok: true, provider: created ?? null };
      },
    },
    {
      name: 'model_probe',
      description:
        'Probe one model with a real upstream call (one short prompt, stops at the first streamed token) and report the honest result: latency, time-to-first-token and a reply sample, or the upstream error.',
      inputSchema: ModelProbeInput,
      readOnly: true,
      maxResultSizeChars: 4_000,
      handler: async (input) => {
        const { model } = input as z.infer<typeof ModelProbeInput>;
        const providerId = providerOfId(model, 'anthropic');
        let upstream: { provider: 'anthropic' | 'openai'; baseUrl: string; apiKey: string | null };
        try {
          upstream = await resolveProviderUpstream(providerId);
        } catch (e) {
          const code = (e as Error & { code?: string }).code ?? 'provider_unavailable';
          return { ok: false, code, message: e instanceof Error ? e.message : String(e) };
        }
        const started = Date.now();
        const ctrl = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          ctrl.abort();
        }, MODEL_PROBE_TIMEOUT_MS);
        let text = '';
        let firstTokenMs: number | null = null;
        let sawDone = false;
        let sawDoneError = false;
        try {
          for await (const chunk of aiStream({
            provider: upstream.provider,
            model,
            messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
            apiKey: upstream.apiKey,
            baseUrl: upstream.baseUrl,
            signal: ctrl.signal,
            // Go-style upstreams want a client session id (harmless elsewhere).
            extraHeaders: { 'x-opencode-session': `lokma-model-probe-${Date.now().toString(36)}` },
          })) {
            if (chunk.type === 'text_delta' && chunk.delta) {
              text += chunk.delta;
              if (firstTokenMs === null) firstTokenMs = Date.now() - started;
              break; // Proof collected — stop streaming, do not burn tokens.
            }
            if (chunk.type === 'done') {
              sawDone = true;
              if (chunk.reason === 'error') sawDoneError = true;
              break;
            }
          }
        } catch (e) {
          if (timedOut) {
            return {
              ok: false,
              code: 'timeout',
              message: `Model "${model}" did not answer within ${Math.round(MODEL_PROBE_TIMEOUT_MS / 1000)}s — retry or pick another model.`,
              latencyMs: Date.now() - started,
            };
          }
          if (e instanceof ProviderError) {
            return { ok: false, code: e.code, message: e.message, latencyMs: Date.now() - started };
          }
          throw e;
        } finally {
          clearTimeout(timer);
          // The stream stops at the first token; tear the connection down so
          // nothing keeps reading upstream after the probe answered.
          if (!sawDone) ctrl.abort();
        }
        if (sawDoneError) {
          return { ok: false, code: 'stream_error', message: `Model "${model}" stream ended with an error.`, latencyMs: Date.now() - started };
        }
        if (!text) {
          return {
            ok: true,
            model,
            provider: providerId,
            latencyMs: Date.now() - started,
            firstTokenMs: null,
            reply: '',
            note: 'The upstream completed without text deltas (thinking-only or empty reply).',
          };
        }
        return {
          ok: true,
          model,
          provider: providerId,
          latencyMs: Date.now() - started,
          firstTokenMs,
          reply: text.slice(0, PROBE_REPLY_CAP),
        };
      },
    },
  ];
}
