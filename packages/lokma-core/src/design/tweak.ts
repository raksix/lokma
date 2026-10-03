/**
 * REQ-190 — the TWEAK path: edit a generated artifact in place.
 *
 * Before this module the only way to change a design was to write a new
 * brief and regenerate from scratch (`POST /api/design/generate`), which
 * produces a NEW artifact id: the list grew and the old design looked
 * "lost". OpenDesign's own position is the opposite — a tweak is a short
 * change question answered by a PATCHED version of the current document
 * (Docs/raw/38 §2.4). This module implements that, and every produced body
 * lands in the artifact's own `versions[]` ledger (slice 1), so the edit is
 * reversible and the artifact list never grows.
 *
 * Token contract (REQ-190 §4): the CURRENT html does not travel whole when it
 * is large. The document is split into a head shell plus H2 sections; the
 * model receives a compact TARGET INDEX (heading + preview + byte count) and
 * writes back ONLY the sections it changed, each wrapped in a marker block.
 * The rest of the file is spliced byte-for-byte from disk. A small document
 * fits the prompt budget and travels whole, in which case the model answers
 * with one complete document (reusing the generation extractor).
 *
 * Failure contract: a patch that names an unknown section, leaves a marker
 * unterminated, changes nothing, or overflows the HTML cap throws a typed
 * `DesignError` — the current version is left untouched. No partial write,
 * no silent "looks fine" degradation (REQ-183).
 */

import { extractHtmlDocument, OFFLINE_TEMPLATE_MODEL, resolveDesignModel } from './generate.js';
import { callDesignModel } from './model-call.js';
import {
  DESIGN_HTML_CAP,
  DesignError,
  type DesignSystem,
  type DesignType,
} from './types.js';
import { buildBundledResolved, resolveSystemTokens, type ResolvedSystem } from './systems.js';

/**
 * Prompt budget for the CURRENT document. Under this size the whole html
 * travels (best fidelity — the model rewrites the document it can see); over
 * it, the model gets a target index and patches single sections.
 */
export const DESIGN_TWEAK_PROMPT_CAP = 24_000;

/** Per-section preview handed to the model in patch mode. */
export const DESIGN_TWEAK_PREVIEW_CHARS = 1_200;

/** Max chars accepted in a tweak sentence (a question, not a brief). */
export const DESIGN_TWEAK_NOTE_CAP = 600;

/** Max chars of a single section's replacement body. */
export const DESIGN_TWEAK_SECTION_CAP = 120_000;

/** Target index 0 is always the document head (doctype, head, styles). */
export const DESIGN_TWEAK_HEAD_TARGET = 0;

export type DesignSection = {
  /** 0 = the head shell, 1..n = the H2 sections in document order. */
  n: number;
  /** Text of the section's H2 (empty for the head). */
  heading: string;
  /** Byte offsets into the ORIGINAL html — splicing uses these verbatim. */
  start: number;
  end: number;
  html: string;
};

const H2_RE = /<h2\b[^>]*>[\s\S]*?<\/h2\s*>/gi;
const TAG_RE = /<[^>]*>/g;

function plainText(html: string): string {
  return html
    .replace(TAG_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a document into a head shell + its H2 sections, carrying exact byte
 * offsets so a patch can be spliced back without re-serialising the file.
 * A document without any H2 yields head = the whole document and no sections,
 * which the planner reports honestly (there is nothing to patch selectively).
 */
export function splitDesignSections(html: string): { head: string; sections: DesignSection[] } {
  const marks: { start: number; end: number; heading: string }[] = [];
  H2_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  for (;;) {
    m = H2_RE.exec(html);
    if (!m) break;
    marks.push({
      start: m.index,
      end: m.index + m[0].length,
      heading: plainText(m[0]).replace(/^h2\s*/i, ''),
    });
  }
  const head: DesignSection = {
    n: DESIGN_TWEAK_HEAD_TARGET,
    heading: '',
    start: 0,
    end: marks.length ? marks[0].start : html.length,
    html: marks.length ? html.slice(0, marks[0].start) : html,
  };
  const sections: DesignSection[] = marks.map((mark, i) => ({
    n: i + 1,
    heading: mark.heading,
    start: mark.start,
    end: i + 1 < marks.length ? marks[i + 1].start : html.length,
    html: html.slice(mark.start, i + 1 < marks.length ? marks[i + 1].start : html.length),
  }));
  return { head: head.html, sections };
}

/** One row of the target index handed to the model in patch mode. */
export type TweakTarget = {
  n: number;
  heading: string;
  preview: string;
  /** True when the preview is shorter than the real section body. */
  truncated: boolean;
  bytes: number;
};

export type TweakPlan = {
  /** True when the whole document fits the prompt budget and travels whole. */
  full: boolean;
  targets: TweakTarget[];
  /** Head + sections in splice order — the patch addresses these. */
  addressable: DesignSection[];
  /** Head + sections in DOCUMENT order (head first). */
  ordered: DesignSection[];
};

/**
 * Decide how much of the document the model sees. Small documents travel
 * whole (one rewrite, maximal fidelity); large ones get heading + preview per
 * section so the prompt stays bounded no matter the artifact's size.
 */
export function planTweakTargets(html: string, budget = DESIGN_TWEAK_PROMPT_CAP): TweakPlan {
  const { head, sections } = splitDesignSections(html);
  const all: DesignSection[] = [
    { n: DESIGN_TWEAK_HEAD_TARGET, heading: 'document head (doctype, <head>, <style>, opening <body>)', start: 0, end: sections.length ? sections[0].start : html.length, html: sections.length ? html.slice(0, sections[0].start) : html },
    ...sections,
  ];
  if (html.length <= budget) {
    return { full: true, targets: [], addressable: all, ordered: all };
  }
  const targets = all.map((s) => {
    const preview = plainText(s.html).slice(0, DESIGN_TWEAK_PREVIEW_CHARS);
    return {
      n: s.n,
      heading: s.heading,
      preview,
      truncated: s.html.length > DESIGN_TWEAK_PREVIEW_CHARS,
      bytes: s.html.length,
    };
  });
  return { full: false, targets, addressable: all, ordered: all };
}

/** Assert the tweak sentence: a short change question, never an empty click. */
export function assertTweakNote(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new DesignError('bad_tweak', 'tweak must be a non-empty change sentence', 400);
  }
  const note = raw.trim();
  if (note.length > DESIGN_TWEAK_NOTE_CAP) {
    throw new DesignError('bad_tweak', `tweak too long (${DESIGN_TWEAK_NOTE_CAP} chars max)`, 400);
  }
  return note;
}

/**
 * The patch contract, in prose the model can follow. Marker syntax is an HTML
 * COMMENT so a stray block is inert if it ever leaks into the document, and
 * every block carries its own number on both ends so a truncated answer is
 * detectable instead of silently swallowing the rest of the reply.
 */
export const DESIGN_TWEAK_SYSTEM_PROMPT = [
  'You are patching an EXISTING HTML document. You are NOT writing a new one.',
  '',
  'Return ONLY the parts that change, each wrapped like this:',
  '<!--lokma:section 3-->',
  '...the COMPLETE new body of section 3...',
  '<!--/lokma:section 3-->',
  '',
  'Rules:',
  '- Repeat the block only for sections you actually change. Untouched sections need no block.',
  '- A block contains the WHOLE new body of that section (not a diff, not an ellipsis).',
  '- Section 0 is the document head: styles, tokens, fonts, <body> wrapper.',
  '- Keep the document self-contained: no CDN, no external font, no build step.',
  '- Keep existing ids, classes and copy unless the change asks otherwise.',
  '- NO markdown code fences, NO prose before or after the blocks.',
].join('\n');

/** The user message for the patch call — pure, unit-testable. */
export function buildTweakPrompt(req: {
  plan: TweakPlan;
  html: string;
  note: string;
  system: DesignSystem;
  type: DesignType;
}, resolved?: ResolvedSystem): string {
  const sys = resolved ?? buildBundledResolved(req.system);
  const lines: string[] = [
    `Artifact type: ${req.type}`,
    sys.hasTokens
      ? `Design system — ${sys.name} (${sys.id}). Tokens: ${sys.tokens.replace(/\n\s*/g, ' ')}`
      : `Design system — ${sys.name} (${sys.id}). No bundled token table for this id — keep the document's existing colours.`,
    '',
    `Change request: ${req.note}`,
    '',
  ];
  if (req.plan.full) {
    lines.push(
      'The current document is below. Return the COMPLETE updated document — it is small enough to travel whole.',
      '',
      '--- CURRENT DOCUMENT ---',
      req.html,
      '--- END CURRENT DOCUMENT ---',
    );
    return lines.join('\n');
  }
  lines.push(
    `The current document is ${req.html.length} chars — too large to travel whole.`,
    'Patch only the sections you change, by their number:',
    '',
  );
  for (const t of req.plan.targets) {
    const suffix = t.truncated ? ' (preview, elided)' : '';
    lines.push(`[${t.n}] ${t.heading} — ${t.bytes} bytes${suffix}`, `    ${t.preview}`);
  }
  lines.push('', 'Return the changed section blocks now.');
  return lines.join('\n');
}

const BLOCK_OPEN_RE = /<!--\s*lokma:section\s+(\d+)\s*-->/gi;
const BLOCK_CLOSE_RE = /<!--\s*\/lokma:section\s+(\d+)\s*-->/gi;

/**
 * Parse the model's answer into section replacements keyed by target number.
 * Throws rather than guessing: an unknown target, an unterminated block or a
 * malformed number is a patch that cannot be applied safely.
 */
export function parseTweakedSections(raw: string, known: readonly number[]): Map<number, string> {
  const allowed = new Set(known);
  const out = new Map<number, string>();
  for (let i = 0; i < raw.length; ) {
    BLOCK_OPEN_RE.lastIndex = i;
    const open = BLOCK_OPEN_RE.exec(raw);
    if (!open) break;
    const n = Number(open[1]);
    const bodyStart = open.index + open[0].length;
    BLOCK_CLOSE_RE.lastIndex = bodyStart;
    const close = BLOCK_CLOSE_RE.exec(raw);
    if (!close || Number(close[1]) !== n) {
      throw new DesignError(
        'tweak_bad_patch',
        `The model left section ${n} unterminated — the current version is unchanged. Retry the tweak.`,
        502,
      );
    }
    if (!allowed.has(n)) {
      throw new DesignError(
        'tweak_unknown_target',
        `The model rewrote section ${n}, which does not exist in this artifact — the current version is unchanged.`,
        502,
      );
    }
    const body = raw.slice(bodyStart, close.index);
    if (body.length > DESIGN_TWEAK_SECTION_CAP) {
      throw new DesignError(
        'too_large',
        `Section ${n} came back at ${Math.round(body.length / 1024)}KB — over the per-section cap.`,
        422,
      );
    }
    if (body.trim()) {
      if (out.has(n)) {
        throw new DesignError('tweak_bad_patch', `The model returned section ${n} twice — retry the tweak.`, 502);
      }
      out.set(n, body);
    }
    i = close.index + close[0].length;
  }
  return out;
}

/**
 * Splice replacements back into the ORIGINAL bytes. Untouched sections are
 * copied verbatim (never re-serialised), so a patch cannot silently rewrite
 * markup outside the sections the model claimed to change.
 */
export function applyTweakedSections(
  html: string,
  ordered: readonly DesignSection[],
  replacements: ReadonlyMap<number, string>,
): { html: string; replaced: number[] } {
  const replaced: number[] = [];
  let out = '';
  let cursor = 0;
  for (const section of ordered) {
    const next = replacements.get(section.n);
    if (next === undefined) continue;
    out += html.slice(cursor, section.start) + next;
    cursor = section.end;
    replaced.push(section.n);
  }
  out += html.slice(cursor);
  return { html: out, replaced };
}

export type TweakResult = {
  id: string;
  sha: string;
  currentVersion: number;
  /** Section numbers the model rewrote (patch mode; `[]` in whole-document mode). */
  replaced: number[];
  note: string;
  model: string;
};

/**
 * Run the agent patch and persist it as the NEXT version of the SAME artifact.
 *
 * The lock is applied twice on purpose: `expectedSha` is checked before the
 * model call (a stale pane must not burn a metered generation) and again by
 * `appendArtifactVersion` at write time (a concurrent write in between is a
 * 409, not a lost edit).
 */
export async function runTweak(
  deps: {
    read: () => Promise<{ type: DesignType; system: DesignSystem; html: string; sha: string }>;
    append: (html: string, note: string, model: string) => Promise<{ sha: string; currentVersion: number }>;
  },
  req: { noteRaw: unknown; modelRaw?: unknown; expectedShaRaw?: unknown; budget?: number },
): Promise<TweakResult> {
  const note = assertTweakNote(req.noteRaw);
  const { type, system, html, sha } = await deps.read();

  // Fail fast on a stale pane BEFORE the metered call.
  if (typeof req.expectedShaRaw === 'string' && req.expectedShaRaw && req.expectedShaRaw !== sha) {
    throw new DesignError(
      'stale_version',
      'This artifact changed since you loaded it — reload and re-apply the tweak.',
      409,
    );
  }

  const model = await resolveDesignModel(req.modelRaw);
  if (model === OFFLINE_TEMPLATE_MODEL) {
    throw new DesignError(
      'tweak_no_model',
      'A tweak needs a real model — the offline template can only build a whole new document.',
      400,
    );
  }

  const plan = planTweakTargets(html, req.budget ?? DESIGN_TWEAK_PROMPT_CAP);
  const answer = await callDesignModel(model, [
    { role: 'system', content: DESIGN_TWEAK_SYSTEM_PROMPT },
    {
      role: 'user',
      // REQ-191 — an ACTIVATED package's own tokens reach the patch call, so a
      // tweak cannot quietly repaint an artifact away from its chosen system.
      content: buildTweakPrompt({ plan, html, note, system, type }, await resolveSystemTokens(system)),
    },
  ]);

  let nextHtml: string;
  let replaced: number[] = [];
  if (plan.full) {
    nextHtml = extractHtmlDocument(answer);
  } else {
    const patches = parseTweakedSections(answer, plan.ordered.map((s) => s.n));
    if (patches.size === 0) {
      throw new DesignError(
        'tweak_no_change',
        'The model returned no changed section — the current version is unchanged. Rephrase the tweak.',
        502,
      );
    }
    const spliced = applyTweakedSections(html, plan.ordered, patches);
    nextHtml = spliced.html;
    replaced = spliced.replaced;
  }

  if (nextHtml.length > DESIGN_HTML_CAP) {
    throw new DesignError(
      'too_large',
      `The patched HTML exceeds the ${Math.round(DESIGN_HTML_CAP / 1024)}KB cap — the current version is unchanged.`,
      422,
    );
  }
  if (!nextHtml.includes('<') || !nextHtml.includes('>')) {
    throw new DesignError('bad_html', 'The tweak produced no markup — the current version is unchanged.', 502);
  }

  const stored = await deps.append(nextHtml, note, model);
  return { id: '', sha: stored.sha, currentVersion: stored.currentVersion, replaced, note, model };
}
