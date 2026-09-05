import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ensureDir, expandHome, writeAtomic } from '../utils/fs.js';
import { buildStoredZip } from '../utils/zip.js';
import { buildArtifactHtml } from './render.js';
import {
  DESIGN_BRIEF_CAP,
  DESIGN_HTML_CAP,
  DESIGN_LIST_CAP,
  DESIGN_SYSTEMS,
  DESIGN_TYPES,
  DesignError,
  type CritiqueDim,
  type CritiqueResult,
  type CritiqueScore,
  type DesignDetail,
  type DesignGuard,
  type DesignManifest,
  type DesignSummary,
  type DesignSystem,
  type DesignType,
} from './types.js';

/**
 * Design store — the single DRY implementation behind `/api/design/*`.
 * Root: `~/.lokma/design/artifacts/<id>/` (Docs/34 §7):
 * `artifact.json` (manifest) + `artifact.html` (source of truth) +
 * `design.md` (system token snapshot) + `critique.json` (last 5D run).
 * Same store for CLI + web — one loop, like sessions and archify.
 */

/** Design root (global, same for CLI + web). */
export const DESIGN_DIR = '~/.lokma/design/artifacts';

/** Absolute design root on this machine. */
export function designRoot(): string {
  return expandHome(DESIGN_DIR);
}

/**
 * Validate an artifact id (a single path segment — no traversal into root).
 * Throws `bad_id` (shape) — unknown-but-valid ids throw `design_not_found`.
 */
export function assertArtifactId(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(raw)) {
    throw new DesignError('bad_id', 'design id must match [a-z0-9-]{2,64}', 400);
  }
  return raw;
}

function dirOf(id: string): string {
  return join(designRoot(), id);
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'design';
}

function assertType(raw: unknown): DesignType {
  if (!DESIGN_TYPES.includes(raw as DesignType)) {
    throw new DesignError('bad_type', `type must be one of ${DESIGN_TYPES.join('|')}`, 400);
  }
  return raw as DesignType;
}

function assertBrief(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new DesignError('bad_brief', 'brief must be a non-empty string', 400);
  }
  if (raw.length > DESIGN_BRIEF_CAP) {
    throw new DesignError('bad_brief', `brief too long (${DESIGN_BRIEF_CAP} max)`, 400);
  }
  return raw;
}

/** Unknown systems fall back to the default (pane validates strictly). */
function coerceSystem(raw: unknown): DesignSystem {
  return DESIGN_SYSTEMS.includes(raw as DesignSystem) ? (raw as DesignSystem) : 'stripe-linear';
}

function assertHtml(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new DesignError('empty_html', 'html must be a non-empty string', 400);
  }
  if (raw.length > DESIGN_HTML_CAP) {
    throw new DesignError('too_large', `html too large (${DESIGN_HTML_CAP} max)`, 400);
  }
  if (!raw.includes('<') || !raw.includes('>')) {
    throw new DesignError('bad_html', 'html must contain markup', 400);
  }
  return raw;
}

async function readManifest(id: string): Promise<DesignManifest> {
  let raw: string;
  try {
    raw = await readFile(join(dirOf(id), 'artifact.json'), 'utf-8');
  } catch {
    throw new DesignError('design_not_found', `no design: ${id}`, 404);
  }
  try {
    const parsed = JSON.parse(raw) as DesignManifest;
    if (!parsed || typeof parsed.id !== 'string' || parsed.id !== id) throw new Error('bad manifest');
    assertType(parsed.type);
    return parsed;
  } catch (e) {
    if (e instanceof DesignError) throw e;
    throw new DesignError('design_not_found', `no design: ${id}`, 404);
  }
}

async function readHtmlFile(id: string): Promise<string> {
  try {
    return await readFile(join(dirOf(id), 'artifact.html'), 'utf-8');
  } catch {
    throw new DesignError('design_not_found', `no design: ${id}`, 404);
  }
}

async function readCritiqueFile(id: string): Promise<CritiqueResult | null> {
  try {
    const raw = await readFile(join(dirOf(id), 'critique.json'), 'utf-8');
    return JSON.parse(raw) as CritiqueResult;
  } catch {
    return null;
  }
}

/**
 * 5-dimension heuristic critique over the stored HTML (Docs/34 §4.2).
 * Deterministic string checks — scores are structural signals, never LLM
 * grades; the pane footer says so.
 */
export function critiqueHtml(html: string, system: DesignSystem): CritiqueResult {
  const low = html.toLowerCase();
  const words = (html.replace(/<[^>]*>/g, ' ').match(/[a-zA-Z0-9]+/g) ?? []).length;
  const headings = (low.match(/<h[1-6][\s>]/g) ?? []).length;
  const controls = (low.match(/<(button|a |a>|input|select)[\s>]/g) ?? []).length;
  const hasMotion = /(@keyframes|animation:|transition:)/.test(low);
  const hasTokens = low.includes('#faf9f5') || low.includes('#c96442') || low.includes('#6366f1') || low.includes('#fffbf5');
  void system;

  const rows: { dim: CritiqueDim; score: number; fixes: string[] }[] = [];
  // Visual — inline style block present and sized.
  const styleBytes = (low.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? '').length;
  rows.push({
    dim: 'visual',
    score: styleBytes > 400 ? 9 : styleBytes > 100 ? 7 : 4,
    fixes: styleBytes > 400 ? [] : ['Add an inline <style> block (self-contained, no CDN)'],
  });
  // Interaction — real controls, not a static mock.
  rows.push({
    dim: 'interaction',
    score: controls >= 3 ? 9 : controls >= 1 ? 7 : 4,
    fixes: controls >= 1 ? [] : ['Add buttons/links so the artifact is clickable, not a picture'],
  });
  // Copy — headings + real word count.
  rows.push({
    dim: 'copy',
    score: headings >= 2 && words >= 60 ? 9 : headings >= 1 && words >= 25 ? 7 : 4,
    fixes: headings >= 1 && words >= 25 ? [] : ['Add headings and real copy (25+ words, no lorem)'],
  });
  // Motion — finite keyframe/animation trace.
  rows.push({
    dim: 'motion',
    score: hasMotion ? 8 : 5,
    fixes: hasMotion ? [] : ['Add a finite motion cue (transition or @keyframes, no infinite loops)'],
  });
  // Brand — system tokens baked into the file.
  rows.push({
    dim: 'brand',
    score: hasTokens ? 9 : 5,
    fixes: hasTokens ? [] : ['Apply the DESIGN.md system tokens (bg/accent/line) to the file'],
  });

  const scores: CritiqueScore[] = rows;
  const overall = Math.round(scores.reduce((sum, r) => sum + r.score, 0) / scores.length);
  return { overall, scores };
}

/**
 * DESIGN.md guard — parses the REAL per-project `.lokma/DESIGN.md`
 * (Docs/34 §4.2: 7+ H2 minimum). Never throws on missing files; only on
 * an unusable `cwd` argument.
 */
export async function readDesignGuard(cwdRaw: unknown): Promise<DesignGuard> {
  let cwd: string;
  if (cwdRaw === undefined || cwdRaw === null || cwdRaw === '') {
    cwd = process.cwd();
  } else if (typeof cwdRaw !== 'string' || !cwdRaw.trim()) {
    throw new DesignError('bad_cwd', 'cwd must be a non-empty string', 400);
  } else {
    cwd = cwdRaw;
  }
  const abs = resolve(expandHome(cwd));
  let text: string;
  try {
    const st = await stat(join(abs, '.lokma', 'DESIGN.md'));
    if (!st.isFile()) throw new Error('not a file');
    text = await readFile(join(abs, '.lokma', 'DESIGN.md'), 'utf-8');
  } catch {
    return { cwd: abs, present: false, h2Count: 0, sections: [], ok: false, message: 'No .lokma/DESIGN.md — using bundled system tokens' };
  }
  if (text.length > DESIGN_HTML_CAP) {
    return { cwd: abs, present: true, h2Count: 0, sections: [], ok: false, message: 'DESIGN.md too large to guard (>512KB)' };
  }
  const sections = text
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.replace(/^##\s+/, '').trim().slice(0, 60))
    .filter((s) => s.length > 0);
  const ok = sections.length >= 7;
  return {
    cwd: abs,
    present: true,
    h2Count: sections.length,
    sections,
    ok,
    message: ok
      ? `${sections.length} sections — brand contract holds`
      : `${sections.length}/7 H2 sections — add ${7 - sections.length} more (Docs/34 §4.2)`,
  };
}

async function persist(id: string, manifest: DesignManifest, html: string, systemNote: string): Promise<CritiqueResult> {
  const critique = critiqueHtml(html, manifest.system);
  const dir = dirOf(id);
  await mkdir(dir, { recursive: true });
  await writeAtomic(join(dir, 'artifact.json'), JSON.stringify(manifest, null, 2));
  await writeAtomic(join(dir, 'artifact.html'), html);
  await writeAtomic(join(dir, 'design.md'), `# DESIGN.md snapshot — ${id}\n\nSystem: ${manifest.system} (${systemNote})\nType: ${manifest.type}\nBrief: ${manifest.brief}\n`);
  await writeAtomic(join(dir, 'critique.json'), JSON.stringify(critique, null, 2));
  return critique;
}

/** Create + persist an artifact from a brief (validates before writing). */
export async function generateArtifact(
  typeRaw: unknown,
  briefRaw: unknown,
  systemRaw: unknown,
): Promise<{ id: string; manifest: DesignManifest; critique: CritiqueResult }> {
  const type = assertType(typeRaw);
  const brief = assertBrief(briefRaw);
  const system = coerceSystem(systemRaw);
  const now = new Date().toISOString();
  const id = `${slugify(brief).slice(0, 32) || 'design'}-${Date.now().toString(36)}`;
  assertArtifactId(id);
  const manifest: DesignManifest = { id, type, brief, system, createdAt: now, updatedAt: now };
  const html = buildArtifactHtml(type, brief, system);
  const critique = await persist(id, manifest, html, 'bundled tokens');
  return { id, manifest, critique };
}

/** Replace an artifact's HTML (the pane's Code tab) — validates, re-critiques. */
export async function updateArtifactHtml(
  idRaw: unknown,
  htmlRaw: unknown,
): Promise<{ id: string; manifest: DesignManifest; critique: CritiqueResult }> {
  const id = assertArtifactId(idRaw);
  const manifest = await readManifest(id); // 404 on unknown before touching disk.
  const html = assertHtml(htmlRaw);
  const next: DesignManifest = { ...manifest, updatedAt: new Date().toISOString() };
  const critique = await persist(id, next, html, 'bundled tokens');
  return { id, manifest: next, critique };
}

/** Full detail: manifest + HTML + last critique. */
export async function getArtifact(idRaw: unknown): Promise<DesignDetail> {
  const id = assertArtifactId(idRaw);
  const manifest = await readManifest(id);
  const html = await readHtmlFile(id);
  const critique = await readCritiqueFile(id);
  return { id, manifest, html, critique };
}

/**
 * Delete an artifact — removes its whole on-disk dir (`artifact.json` +
 * `artifact.html` + `design.md` + `critique.json`). Unknown ids 404 via
 * `readManifest` before anything is touched; bad shapes 400 via
 * `assertArtifactId`. The id is validated to a single path segment so
 * `rm` can never escape the design root.
 */
export async function deleteArtifact(idRaw: unknown): Promise<{ id: string }> {
  const id = assertArtifactId(idRaw);
  await readManifest(id); // 404 on unknown before touching disk.
  await rm(dirOf(id), { recursive: true, force: true });
  return { id };
}

/** Re-run the 5D critique over the stored HTML (persists the result). */
export async function critiqueArtifact(idRaw: unknown): Promise<{ id: string; critique: CritiqueResult }> {
  const id = assertArtifactId(idRaw);
  const manifest = await readManifest(id);
  const html = await readHtmlFile(id);
  const critique = critiqueHtml(html, manifest.system);
  await writeAtomic(join(dirOf(id), 'critique.json'), JSON.stringify(critique, null, 2));
  return { id, critique };
}

/** List artifacts (newest first, capped). Missing/corrupt dirs are skipped. */
export async function listArtifacts(): Promise<{ items: DesignSummary[]; count: number }> {
  await ensureDir(DESIGN_DIR);
  let names: string[];
  try {
    names = await readdir(designRoot());
  } catch {
    return { items: [], count: 0 };
  }
  const items: DesignSummary[] = [];
  for (const name of names.slice(0, DESIGN_LIST_CAP * 2)) {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(name)) continue;
    try {
      const manifest = await readManifest(name);
      const html = await readHtmlFile(name);
      const critique = await readCritiqueFile(name);
      items.push({ ...manifest, bytes: html.length, overall: critique ? critique.overall : null });
    } catch {
      continue;
    }
    if (items.length >= DESIGN_LIST_CAP) break;
  }
  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return { items, count: items.length };
}

/** Export an artifact — real file bytes for formats the server serves. */
export async function exportArtifact(
  idRaw: unknown,
  formatRaw: unknown,
): Promise<{ filename: string; contentType: string; body: string | Buffer }> {
  const id = assertArtifactId(idRaw);
  const manifest = await readManifest(id);
  const html = await readHtmlFile(id);
  const format = typeof formatRaw === 'string' ? formatRaw : '';
  if (format === 'html') {
    return { filename: `${id}.html`, contentType: 'text/html; charset=utf-8', body: html };
  }
  if (format === 'json') {
    const critique = await readCritiqueFile(id);
    return {
      filename: `${id}.json`,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ...manifest, critique }, null, 2),
    };
  }
  if (format === 'zip') {
    let designMd = '';
    try {
      designMd = await readFile(join(dirOf(id), 'design.md'), 'utf-8');
    } catch {
      designMd = '# DESIGN.md snapshot unavailable\n';
    }
    const zip = buildStoredZip([
      { name: 'artifact.html', content: html },
      { name: 'manifest.json', content: JSON.stringify(manifest, null, 2) },
      { name: 'DESIGN.md', content: designMd },
    ]);
    return { filename: `${id}.zip`, contentType: 'application/zip', body: zip };
  }
  if (format === 'pdf' || format === 'pptx' || format === 'mp4') {
    throw new DesignError(
      'needs_toolchain',
      `${format} export needs a binary toolchain (headless Chromium / PptxGenJS / ffmpeg) — follow-up`,
      400,
    );
  }
  throw new DesignError('bad_format', 'format must be one of html|zip|json|png|webm', 400);
}
