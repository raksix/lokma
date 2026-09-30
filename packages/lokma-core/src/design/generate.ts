/**
 * Design generation — the REAL model path (REQ-177).
 *
 * Before this module `generateArtifact` handed every brief to the
 * deterministic template builder in `render.ts`, so "Generate" produced the
 * same scaffold no matter the brief ("tasarımlar çok kötü" + "model seçimi
 * yok" — two complaints, one root cause). Generation now runs through the
 * shared `@lokma/ai` adapters with the model the caller picked (or the
 * configured default), and the deterministic builder survives only as the
 * EXPLICIT `offline-template` choice — never as a silent fallback.
 *
 * Failure contract: every failure throws a typed `DesignError` the routes
 * map straight to `{ code, message }`. A failed generation fails loudly
 * (REQ-177 §3) — no automatic template fallback.
 */

import { ProviderError, providerOfId, stream as aiStream, type ProviderMessage } from '@lokma/ai';
import type { GlobalConfig } from '@lokma/shared';
import { loadConfig } from '../config/index.js';
import { resolveProviderUpstream } from '../providers/providers.js';
import {
  DESIGN_HTML_CAP,
  DESIGN_SYSTEM_META,
  DesignError,
  type DesignSystem,
  type DesignType,
} from './types.js';

/** Built-in fallback when neither the request nor the config names a model. */
export const DEFAULT_DESIGN_MODEL = 'anthropic/claude-sonnet-4-5';

/**
 * Explicit opt-in to the deterministic template builder in `render.ts`.
 * This is the ONLY way it runs: a deliberate, visible choice — never a
 * silent fallback after a model error (REQ-177 §3).
 */
export const OFFLINE_TEMPLATE_MODEL = 'offline-template';

/**
 * One generation call is bounded — a hung upstream must not wedge the pane.
 * The default model answers a full HTML artifact in ~2 minutes (measured:
 * 114s on the first live run, then >120s on the next), so the budget sits
 * well above that; the production nginx /api/ read timeout (300s) is the
 * outer bound.
 */
export const DESIGN_GENERATION_TIMEOUT_MS = 240_000;

/**
 * Quality contract every generated artifact must satisfy (REQ-177 §4):
 * real content, no placeholder filler, system tokens, responsive, single
 * self-contained file.
 */
export const DESIGN_MODEL_SYSTEM_PROMPT = [
  'You are Lokma Design Studio. Turn the user brief into ONE complete, self-contained HTML document (a design artifact).',
  '',
  'Hard rules — the harness validates the output:',
  '1. Output ONLY the HTML document. No markdown code fences, no commentary before or after.',
  '2. Single file: all CSS inside one inline <style> tag. No external requests — no <link>, no <script src>, no @import, no CDN fonts, no remote images.',
  '3. Real content only: write real headings and real copy from the brief. NO lorem ipsum, NO "placeholder" text, NO empty boxes standing in for content, NO "coming soon" filler.',
  '4. Use the design-system tokens EXACTLY as given (colors, font stack). Build hierarchy with a clear type scale, generous spacing, borders and surfaces.',
  '5. Responsive: the page must hold from 390px to 1440px — fluid widths, no fixed page width, no horizontal scroll.',
  '6. Include at least three real controls (button / link / input) and one finite motion cue (a transition or a finite @keyframes animation).',
  '7. Valid semantic HTML5: <!doctype html>, <html lang> with meta viewport, one <h1>, real <section> elements.',
  '',
  'Start the response with <!doctype html> and end with </html>.',
].join('\n');

/** What a good artifact of each kind looks like (per-type instruction). */
const TYPE_DIRECTIVES: Record<DesignType, string> = {
  prototype:
    'Product screen: nav/header, hero with a clear value proposition, three feature or tier cards, one primary CTA. Density like Stripe/Linear — build visual interest with type, spacing and color, not stock imagery.',
  deck: 'Slide deck as ONE scrollable page: 4-6 slide sections, each a headline plus supporting copy; the first section is the title slide. Print-friendly spacing.',
  mobile:
    'Phone screen mock: a ~390px-wide device frame centered on the page with a real app UI inside (header, content list or cards, bottom action). Real app copy and real states.',
  image:
    'A finished visual composition built purely with CSS/SVG from the brief (gradients, geometry, type). It must look deliberate and complete — never a gray placeholder box.',
  document:
    'Long-form document: title, 2-4 sections with headings and real paragraphs (150+ words total), comfortable reading measure (~65ch).',
  hyperframe:
    'CSS-keyframe storyboard: a stage that plays 3-5 text frames in sequence (finite, looping animation) plus a small timeline strip. Every frame carries real copy from the brief.',
};

export type DesignModelRequest = {
  type: DesignType;
  brief: string;
  system: DesignSystem;
};

/** The user message the model receives — pure, unit-testable (REQ-177). */
export function buildDesignPrompt(req: DesignModelRequest): string {
  const meta = DESIGN_SYSTEM_META[req.system];
  return [
    `Artifact type: ${req.type}`,
    `Brief: ${req.brief}`,
    '',
    `Design system — ${meta.name} (${meta.id}):`,
    `- background ${meta.bg}, surface ${meta.surface}, ink ${meta.ink}, muted ${meta.muted}`,
    `- accent ${meta.accent}, accent-soft ${meta.accentSoft}, line ${meta.line}`,
    `- font stack: ${meta.font}`,
    '',
    'Use these exact token values in the stylesheet.',
    TYPE_DIRECTIVES[req.type],
  ].join('\n');
}

const HTML_START_RE = /<!doctype html|<html[\s>]/i;

/**
 * Pull one complete HTML document out of raw model text — strips markdown
 * fences, leading prose and trailing commentary. Throws `design_empty_output`
 * for an empty answer, `bad_model_output` when no document is present, and
 * `too_large` past the stored-HTML cap.
 */
export function extractHtmlDocument(raw: string): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new DesignError('design_empty_output', 'The model returned no content for this brief.', 502);
  }
  let text = raw.trim();
  const fence = /```[a-zA-Z]*\s*\n([\s\S]*?)```/.exec(text);
  if (fence && fence[1] && HTML_START_RE.test(fence[1])) text = fence[1].trim();
  const start = text.search(HTML_START_RE);
  if (start < 0) {
    throw new DesignError(
      'bad_model_output',
      'The model did not return an HTML document (no <html>) — retry or pick another model.',
      422,
    );
  }
  text = text.slice(start);
  const end = text.lastIndexOf('</html>');
  text = (end >= 0 ? text.slice(0, end + '</html>'.length) : text).trim();
  if (text.length > DESIGN_HTML_CAP) {
    throw new DesignError(
      'too_large',
      `Generated HTML exceeds the ${Math.round(DESIGN_HTML_CAP / 1024)}KB cap — simplify the brief.`,
      422,
    );
  }
  return text;
}

/** Narrow config slice the model chain reads — keeps the picker pure. */
export type ModelConfig = Pick<GlobalConfig, 'defaultModel' | 'models'> | null;

/**
 * Which model a generation uses: the explicit request value wins, then the
 * configured default (unless explicitly disabled), then the built-in id.
 * `anthropic::claude-sonnet-4-5` style ids are canonicalized to `/`.
 */
export function pickDesignModel(modelRaw: unknown, cfg: ModelConfig): string {
  if (typeof modelRaw === 'string' && modelRaw.trim()) return modelRaw.trim().replace(/::/g, '/');
  const rawDefault = cfg?.defaultModel?.trim();
  if (rawDefault && cfg?.models?.[rawDefault]?.enabled !== false) return rawDefault.replace(/::/g, '/');
  return DEFAULT_DESIGN_MODEL;
}

/** Resolve the model for a generation: request → config → built-in. */
export async function resolveDesignModel(modelRaw?: unknown, cwd?: string): Promise<string> {
  if (typeof modelRaw === 'string' && modelRaw.trim()) return pickDesignModel(modelRaw, null);
  const cfg = await loadConfig(cwd ?? process.cwd()).catch(() => null);
  return pickDesignModel(modelRaw, cfg);
}

/** Map an upstream failure onto the honest route-level error (never a template). */
export function designErrorFromUpstream(e: unknown, model: string): DesignError {
  if (e instanceof DesignError) return e;
  if (e instanceof ProviderError) {
    if (e.code === 'missing_api_key') {
      return new DesignError(
        'design_no_api_key',
        `${e.message} Design generation was NOT replaced by a template — fix the credential and retry.`,
        400,
      );
    }
    return new DesignError('design_upstream_error', `Model "${model}" call failed (${e.code}): ${e.message}`, 502);
  }
  if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
    return new DesignError(
      'design_timeout',
      `Model "${model}" did not answer within ${Math.round(DESIGN_GENERATION_TIMEOUT_MS / 1000)}s — retry or pick another model.`,
      504,
    );
  }
  return new DesignError(
    'design_upstream_error',
    `Model "${model}" call failed: ${e instanceof Error ? e.message : String(e)}`,
    502,
  );
}

/**
 * One-shot generation: resolve the provider upstream, stream the answer,
 * return the extracted HTML document. Persistence (manifest, critique,
 * disk) stays in `store.ts` — this module only talks to the model.
 */
export async function generateDesignHtml(req: DesignModelRequest & { model: string }): Promise<string> {
  const providerId = providerOfId(req.model, 'anthropic');
  let upstream: { provider: 'anthropic' | 'openai'; baseUrl: string; apiKey: string | null };
  try {
    upstream = await resolveProviderUpstream(providerId);
  } catch (e) {
    throw new DesignError(
      'design_provider_unavailable',
      e instanceof Error ? e.message : `Provider "${providerId}" is not available.`,
      400,
    );
  }
  const messages: ProviderMessage[] = [
    { role: 'system', content: DESIGN_MODEL_SYSTEM_PROMPT },
    { role: 'user', content: buildDesignPrompt(req) },
  ];
  let text = '';
  // The abort surfaces in adapter-specific shapes (DOMException TimeoutError,
  // a wrapped ProviderError, ...) — track it on the signal itself so a
  // timeout maps to the honest design_timeout regardless of the wrapper.
  const deadline = AbortSignal.timeout(DESIGN_GENERATION_TIMEOUT_MS);
  let timedOut = false;
  deadline.addEventListener(
    'abort',
    () => {
      timedOut = true;
    },
    { once: true },
  );
  try {
    for await (const chunk of aiStream({
      provider: upstream.provider,
      model: req.model,
      messages,
      apiKey: upstream.apiKey,
      baseUrl: upstream.baseUrl,
      signal: deadline,
      // Go-style upstreams want a client session id (harmless elsewhere).
      extraHeaders: { 'x-opencode-session': `lokma-design-${Date.now().toString(36)}` },
    })) {
      if (chunk.type === 'text_delta' && chunk.delta) text += chunk.delta;
    }
  } catch (e) {
    if (timedOut) {
      throw new DesignError(
        'design_timeout',
        'Model "' + req.model + '" did not answer within ' + Math.round(DESIGN_GENERATION_TIMEOUT_MS / 1000) + 's — retry or pick another model.',
        504,
      );
    }
    throw designErrorFromUpstream(e, req.model);
  }
  return extractHtmlDocument(text);
}
