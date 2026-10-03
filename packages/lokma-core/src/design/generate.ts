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

import type { ProviderMessage } from '@lokma/ai';
import type { GlobalConfig } from '@lokma/shared';
import { loadConfig } from '../config/index.js';
import { callDesignModel, designErrorFromUpstream } from './model-call.js';
export { DESIGN_GENERATION_TIMEOUT_MS, designErrorFromUpstream } from './model-call.js';
import {
  DESIGN_HTML_CAP,
  DesignError,
  type DesignSystem,
  type DesignType,
} from './types.js';
import { buildBundledResolved, type ResolvedSystem } from './systems.js';
import type { DesignSkillPayload } from './skills.js';
import type { DesignTemplatePayload } from './templates.js';

/** Built-in fallback when neither the request nor the config names a model. */
export const DEFAULT_DESIGN_MODEL = 'anthropic/claude-sonnet-4-5';

/**
 * Explicit opt-in to the deterministic template builder in `render.ts`.
 * This is the ONLY way it runs: a deliberate, visible choice — never a
 * silent fallback after a model error (REQ-177 §3).
 */
export const OFFLINE_TEMPLATE_MODEL = 'offline-template';

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
  /**
   * REQ-192 — the SELECTED design skills, as real SKILL.md bodies. Absent (the
   * common case) keeps every existing probe's prompt byte-identical.
   */
  skills?: DesignSkillPayload[];
  /**
   * REQ-192 — the chosen output SKELETON, as the template's real SKILL.md
   * body. Absent (the common case) keeps every existing probe's prompt
   * byte-identical.
   */
  template?: DesignTemplatePayload;
};

/**
 * REQ-192 — the `<design_skills>` prompt block. This carries the SKILL.md
 * BODIES, not their names: a model given only "brutalist-web" learns nothing,
 * and the whole point of the request ("tasarım skill'i seçilebilsin") is that
 * the instruction actually reaches the generator.
 *
 * Bodies are truncated per skill at a share of the stored-HTML budget so a
 * fat SKILL.md cannot crowd out the brief or the token table, and the marker
 * says so rather than pretending the file was read in full.
 */
const SKILL_BODY_CHAR_CAP = 12_000;

/** Per-skill budget that leaves room for several skills in one prompt. */
const SKILL_TOTAL_CHAR_CAP = 32_000;

/** Pure: render the skill block (empty string when nothing is selected). */
export function buildDesignSkillsPrompt(skills?: DesignSkillPayload[]): string {
  if (!skills || skills.length === 0) return '';
  const parts: string[] = [];
  let used = 0;
  for (const s of skills) {
    const room = Math.max(0, Math.min(SKILL_BODY_CHAR_CAP, SKILL_TOTAL_CHAR_CAP - used));
    const body = room > 0 ? s.content.slice(0, room) : '';
    const truncated = s.content.length > body.length;
    if (!body) continue;
    used += body.length;
    parts.push(
      [
        `<skill name="${s.name}" id="${s.id}">`,
        truncated
          ? `${body}\n[truncated: ${s.content.length - body.length} of ${s.content.length} chars not shown]`
          : body,
        '</skill>',
      ].join('\n'),
    );
  }
  if (parts.length === 0) return '';
  return [
    '<design_skills>',
    ...parts,
    '</design_skills>',
    '',
    'The user explicitly selected the skills above for this artifact. Apply their',
    'instructions to the design. They are authoritative for style, layout and copy.',
  ].join('\n');
}

/**
 * REQ-192 — the `<design_template>` prompt block: the output SKELETON, kept
 * strictly separate from `<design_skills>` (how it looks) and the token table
 * (what it is made of). The template block goes BEFORE the skills so the
 * per-type directive stays the last word, and it carries the real body, not
 * the label — "deck" as a word teaches the model nothing the type directive
 * does not already say, while the template's skeleton does.
 */
const TEMPLATE_BODY_CHAR_CAP = 12_000;

/** Pure: render the template block (empty string when nothing is selected). */
export function buildDesignTemplatePrompt(template?: DesignTemplatePayload): string {
  if (!template || !template.content) return '';
  const body = template.content.slice(0, TEMPLATE_BODY_CHAR_CAP);
  const truncated = template.content.length > body.length;
  return [
    '<design_template>',
    `<template name="${template.label}" id="${template.id}">`,
    truncated
      ? `${body}\n[truncated: ${template.content.length - body.length} of ${template.content.length} chars not shown]`
      : body,
    '</template>',
    '</design_template>',
    '',
    'The user picked the template above. Follow its document STRUCTURE and',
    'section order. Style, palette and copy are governed by the design system',
    'tokens and the selected skills, not by the template.',
  ].join('\n');
}

/**
 * The user message the model receives — pure, unit-testable (REQ-177).
 *
 * REQ-191: `resolved` is optional and defaults to the bundled table, so the
 * existing synchronous unit probes keep their exact prompt while the live path
 * passes the ACTIVATED package's own `tokens.css` (that is how a catalog row
 * reaches the generated HTML). With no tokens the prompt names the system and
 * says the values come from the project DESIGN.md — it never prints
 * `undefined` as a colour.
 */
export function buildDesignPrompt(req: DesignModelRequest, resolved?: ResolvedSystem): string {
  const sys = resolved ?? buildBundledResolved(req.system);
  const head = [
    `Artifact type: ${req.type}`,
    `Brief: ${req.brief}`,
    '',
    `Design system — ${sys.name} (${sys.id}):`,
  ];
  const tokenLines = sys.hasTokens
    ? [sys.tokens, '', 'Use these exact token values in the stylesheet.']
    : [
        'No token table is bundled with this system id — read the values from the',
        'project DESIGN.md if present, otherwise pick a coherent neutral palette yourself.',
      ];
  // REQ-192 — the chosen TEMPLATE sits right after the token table and before
  // the skills: skeleton (what ships) → skills (how it looks) → per-type
  // directive (last word). Empty (the default) contributes nothing, keeping
  // every pre-REQ-192 probe byte-identical.
  const templateBlock = buildDesignTemplatePrompt(req.template);
  const templateLines = templateBlock ? ['', templateBlock, ''] : [];
  const skillsBlock = buildDesignSkillsPrompt(req.skills);
  const skillsLines = skillsBlock ? ['', skillsBlock, ''] : [];
  return [...head, ...tokenLines, ...templateLines, ...skillsLines, TYPE_DIRECTIVES[req.type]].join('\n');
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

/**
 * One-shot generation: resolve the provider upstream, stream the answer,
 * return the extracted HTML document. Persistence (manifest, critique,
 * disk) stays in `store.ts` — this module only talks to the model.
 */
export async function generateDesignHtml(
  req: DesignModelRequest & { model: string },
  resolved?: ResolvedSystem,
): Promise<string> {
  // REQ-190 — the streaming transport now lives in `model-call.ts` so the
  // tweak patcher shares the SAME provider resolution, timeout and error
  // mapping. Nothing about generation's behaviour changes.
  const messages: ProviderMessage[] = [
    { role: 'system', content: DESIGN_MODEL_SYSTEM_PROMPT },
    { role: 'user', content: buildDesignPrompt(req, resolved) },
  ];
  const text = await callDesignModel(req.model, messages);
  return extractHtmlDocument(text);
}
