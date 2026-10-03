import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, normalize, resolve } from 'node:path';
import { sha256Hex } from '../files/files.js';
import { ensureDir, expandHome, fileExists, writeAtomic } from '../utils/fs.js';
import { buildStoredZip } from '../utils/zip.js';
import { OFFLINE_TEMPLATE_MODEL, generateDesignHtml, resolveDesignModel } from './generate.js';
import { buildArtifactHtml } from './render.js';
import {
  DESIGN_BRIEF_CAP,
  DESIGN_HTML_CAP,
  DESIGN_LIST_CAP,
  DESIGN_SYSTEMS,
  DESIGN_TYPES,
  DESIGN_VERSION_CAP,
  DESIGN_VERSION_ORIGINS,
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
  type DesignVersion,
  type DesignVersionOrigin,
} from './types.js';

/**
 * Design store — the single DRY implementation behind `/api/design/*`.
 * Root: `~/.lokma/design/artifacts/<id>/` (Docs/34 §7):
 * `artifact.json` (manifest) + `artifact.html` (source of truth) +
 * `design.md` (system token snapshot) + `critique.json` (last 5D run).
 * REQ-178: every entry point takes an optional project `cwd` — artifacts
 * are then stored under `<cwd>/.lokma/design/artifacts/<id>/` and lists
 * are scoped to that project; no cwd = the global root above.
 * Same store for CLI + web — one loop, like sessions and archify.
 */

/** Design root (global, same for CLI + web). */
export const DESIGN_DIR = '~/.lokma/design/artifacts';

/** Absolute design root on this machine. */
export function designRoot(): string {
  return expandHome(DESIGN_DIR);
}

/** Max length accepted for a project `cwd` argument (parity with the fs routes). */
export const DESIGN_CWD_MAX_LEN = 500;

/**
 * REQ-178 — pure: normalize an optional project `cwd` into an absolute path,
 * or `null` when no project is selected (the global root). Shape-only
 * validation, no filesystem access: relative paths, null bytes and
 * over-long input are `bad_cwd` 400; the result is always a clean absolute
 * path (`..` segments collapse; there is no root to escape).
 */
export function normalizeDesignCwd(cwdRaw: unknown): string | null {
  if (cwdRaw === undefined || cwdRaw === null || cwdRaw === '') return null;
  if (
    typeof cwdRaw !== 'string' ||
    !cwdRaw.trim() ||
    cwdRaw.length > DESIGN_CWD_MAX_LEN ||
    cwdRaw.includes('\0')
  ) {
    throw new DesignError('bad_cwd', 'cwd must be a directory path', 400);
  }
  const expanded = expandHome(cwdRaw.trim());
  if (!isAbsolute(expanded)) {
    throw new DesignError('bad_cwd', 'cwd must be absolute (or ~)', 400);
  }
  return normalize(expanded);
}

/**
 * REQ-178 — normalize + require a real, listable project directory.
 * Missing → 404 `cwd_not_found`; a file (or an unreadable dir) → 400. Used
 * by every read/write path that scopes artifacts to a project.
 */
export async function resolveDesignCwd(cwdRaw: unknown): Promise<string | null> {
  const abs = normalizeDesignCwd(cwdRaw);
  if (abs === null) return null;
  let st;
  try {
    st = await stat(abs);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      throw new DesignError('cwd_not_found', `no such project directory: ${abs}`, 404);
    }
    throw new DesignError('cwd_unusable', `cannot use cwd: ${abs}`, 400);
  }
  if (!st.isDirectory()) {
    throw new DesignError('not_a_directory', `cwd is not a directory: ${abs}`, 400);
  }
  return abs;
}

/** Design root for a resolved cwd (`null` = the global `~/.lokma/design/artifacts`). */
export function designRootOf(cwd: string | null): string {
  return cwd === null ? designRoot() : join(cwd, '.lokma', 'design', 'artifacts');
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

function dirOf(root: string, id: string): string {
  return join(root, id);
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

async function readManifest(root: string, id: string): Promise<DesignManifest> {
  let raw: string;
  try {
    raw = await readFile(join(dirOf(root, id), 'artifact.json'), 'utf-8');
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

async function readHtmlFile(root: string, id: string): Promise<string> {
  try {
    return await readFile(join(dirOf(root, id), 'artifact.html'), 'utf-8');
  } catch {
    throw new DesignError('design_not_found', `no design: ${id}`, 404);
  }
}

async function readCritiqueFile(root: string, id: string): Promise<CritiqueResult | null> {
  try {
    const raw = await readFile(join(dirOf(root, id), 'critique.json'), 'utf-8');
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
  // REQ-178 — same cwd semantics as artifact storage: unset = the server
  // cwd, else the selected project dir. Existence is NOT required (a bare
  // project reports present: false); only the shape is validated.
  const abs = normalizeDesignCwd(cwdRaw) ?? resolve(process.cwd());
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

/**
 * REQ-190 — a retired version's body lives at `versions/<sha8>.html`; the
 * CURRENT body stays in `artifact.html`, so every existing read path keeps
 * working untouched. Content-addressed: the same body archived twice is one
 * file, and a revert is a plain copy back.
 */
export function versionFileOf(root: string, id: string, sha: string): string {
  return join(dirOf(root, id), 'versions', `${sha.slice(0, 8)}.html`);
}

/** Read one version's body — `null` when its file is gone (honest, not empty). */
export async function readVersionHtml(
  root: string,
  id: string,
  sha: string,
): Promise<string | null> {
  try {
    return await readFile(versionFileOf(root, id, sha), 'utf-8');
  } catch {
    return null;
  }
}

/**
 * REQ-190 — the history of an artifact, oldest first. Defensive by shape:
 * a corrupt/absent ledger yields `[]` rather than throwing, because every
 * reader (detail, list, picker) must still work on a pre-REQ-190 artifact.
 */
export function normalizeVersions(raw: unknown): DesignVersion[] {
  if (!Array.isArray(raw)) return [];
  const out: DesignVersion[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Partial<DesignVersion>;
    if (typeof e.sha !== 'string' || !/^[0-9a-f]{64}$/.test(e.sha)) continue;
    out.push({
      n: typeof e.n === 'number' ? e.n : out.length + 1,
      sha: e.sha,
      bytes: typeof e.bytes === 'number' ? e.bytes : 0,
      createdAt: typeof e.createdAt === 'string' ? e.createdAt : '',
      origin: (DESIGN_VERSION_ORIGINS as readonly string[]).includes(e.origin ?? '')
        ? (e.origin as DesignVersionOrigin)
        : 'edit',
      note: typeof e.note === 'string' ? e.note : undefined,
      model: typeof e.model === 'string' ? e.model : undefined,
      overall: typeof e.overall === 'number' ? e.overall : null,
    });
  }
  return out;
}

export type PersistVersionInput = {
  /** What produced the new body — generation, tweak, manual edit, revert. */
  origin: DesignVersionOrigin;
  /** The tweak sentence / manual note (absent for plain generation). */
  note?: string;
  /** Model that produced the body when known. */
  model?: string;
};

async function persist(
  root: string,
  id: string,
  manifest: DesignManifest,
  html: string,
  systemNote: string,
  versionInput: PersistVersionInput,
): Promise<{ manifest: DesignManifest; critique: CritiqueResult }> {
  const critique = critiqueHtml(html, manifest.system);
  const dir = dirOf(root, id);
  const htmlPath = join(dir, 'artifact.html');
  const sha = sha256Hex(html);
  const versions = normalizeVersions(manifest.versions);
  const current = versions[versions.length - 1] ?? null;

  // Archive the body we are about to replace BEFORE writing the new one, so a
  // ledger entry never points at a file that was never written. Verified
  // against its recorded sha — a hand-edited manifest must not archive a
  // mismatched body under the wrong name.
  if (current && current.sha !== sha && (await fileExists(htmlPath))) {
    const retiring = await readFile(htmlPath, 'utf-8');
    if (sha256Hex(retiring) === current.sha) {
      await writeAtomic(versionFileOf(root, id, current.sha), retiring);
    }
  }

  const entry: DesignVersion = {
    n: current ? current.n + 1 : 1,
    sha,
    bytes: html.length,
    createdAt: new Date().toISOString(),
    origin: versionInput.origin,
    note: versionInput.note,
    model: versionInput.model,
    overall: critique.overall,
  };
  const all = [...versions, entry];
  const kept = all.slice(Math.max(0, all.length - DESIGN_VERSION_CAP));
  const liveShas = new Set(kept.map((v) => v.sha));
  const now = new Date().toISOString();
  const next: DesignManifest = { ...manifest, updatedAt: now, versions: kept };

  await mkdir(dir, { recursive: true });
  await writeAtomic(join(dir, 'artifact.json'), JSON.stringify(next, null, 2));
  await writeAtomic(htmlPath, html);
  await writeAtomic(join(dir, 'design.md'), `# DESIGN.md snapshot — ${id}\n\nSystem: ${manifest.system} (${systemNote})\nType: ${manifest.type}\nBrief: ${manifest.brief}\n`);
  await writeAtomic(join(dir, 'critique.json'), JSON.stringify(critique, null, 2));

  // Prune bodies no ledger entry references any more. A sha still referenced
  // (or equal to the current body) keeps its file — content-addressed names
  // make a duplicate-version prune harmless.
  for (const dropped of all.slice(0, all.length - kept.length)) {
    if (liveShas.has(dropped.sha)) continue;
    await rm(versionFileOf(root, id, dropped.sha), { force: true });
  }
  return { manifest: next, critique };
}

/**
 * Create + persist an artifact from a brief (validates before writing).
 *
 * REQ-177: the HTML now comes from a REAL model call (`generate.js`) with
 * the request's model, or the configured default. The deterministic
 * template builder runs only for the explicit `offline-template` choice —
 * a model failure throws, it never silently degrades to a template.
 */
export async function generateArtifact(
  typeRaw: unknown,
  briefRaw: unknown,
  systemRaw: unknown,
  modelRaw?: unknown,
  cwdRaw?: unknown,
): Promise<{ id: string; manifest: DesignManifest; critique: CritiqueResult }> {
  const type = assertType(typeRaw);
  const brief = assertBrief(briefRaw);
  const system = coerceSystem(systemRaw);
  // REQ-178 — the project cwd scopes the storage root AND the layered config
  // read (a project `.lokma/settings.json` can pin the model).
  const cwd = await resolveDesignCwd(cwdRaw);
  const root = designRootOf(cwd);
  const model = await resolveDesignModel(modelRaw, cwd ?? undefined);
  const now = new Date().toISOString();
  const id = `${slugify(brief).slice(0, 32) || 'design'}-${Date.now().toString(36)}`;
  assertArtifactId(id);
  const manifest: DesignManifest = { id, type, brief, system, model, project: cwd ?? undefined, createdAt: now, updatedAt: now };
  const html =
    model === OFFLINE_TEMPLATE_MODEL
      ? buildArtifactHtml(type, brief, system)
      : await generateDesignHtml({ type, brief, system, model });
  const { manifest: stored, critique } = await persist(
    root,
    id,
    manifest,
    html,
    model === OFFLINE_TEMPLATE_MODEL ? 'offline template — no model called' : `generated by ${model}`,
    { origin: 'generate', model },
  );
  return { id, manifest: stored, critique };
}

/**
 * REQ-190 — optimistic lock shared by every mutating write (`tweak`, manual
 * Code-tab edit, revert). `expectedSha` must equal the sha of the CURRENT
 * body; a mismatch is `stale_version` 409, never a silent overwrite (the same
 * contract the workspace file routes use, so one mental model).
 */
async function assertExpectedSha(root: string, id: string, manifest: DesignManifest, expectedSha: unknown): Promise<string> {
  let current = '';
  try {
    current = await readHtmlFile(root, id);
  } catch {
    throw new DesignError('design_not_found', `no design: ${id}`, 404);
  }
  const sha = sha256Hex(current);
  if (typeof expectedSha === 'string' && expectedSha && expectedSha !== sha) {
    void manifest;
    throw new DesignError(
      'stale_version',
      'This artifact changed since you loaded it — reload and re-apply the change.',
      409,
    );
  }
  return sha;
}

/**
 * Replace an artifact's HTML (the pane's Code tab) — validates, re-critiques.
 * REQ-190: appends a `edit` version (and `expectedSha` guards the write).
 */
export async function updateArtifactHtml(
  idRaw: unknown,
  htmlRaw: unknown,
  cwdRaw?: unknown,
  expectedShaRaw?: unknown,
): Promise<{
  id: string;
  manifest: DesignManifest;
  critique: CritiqueResult;
  currentVersion: number;
  /** sha256 of the body just written — the next write's lock token. */
  sha: string;
}> {
  const cwd = await resolveDesignCwd(cwdRaw);
  const root = designRootOf(cwd);
  const id = assertArtifactId(idRaw);
  const manifest = await readManifest(root, id); // 404 on unknown before touching disk.
  await assertExpectedSha(root, id, manifest, expectedShaRaw);
  const html = assertHtml(htmlRaw);
  const { manifest: next, critique } = await persist(root, id, manifest, html, 'manual edit', {
    origin: 'edit',
    note: 'manual code edit',
  });
  const versions = normalizeVersions(next.versions);
  const last = versions[versions.length - 1];
  return {
    id,
    manifest: next,
    critique,
    currentVersion: versions.length,
    sha: last ? last.sha : sha256Hex(html),
  };
}

/**
 * REQ-190 — append a produced body to an artifact's history WITHOUT changing
 * its id (the tweak flow's persistence step). Validation happens in the
 * caller; here the body is asserted and the ledger append + archive is the
 * single write path shared with the manual edit and the revert.
 */
export async function appendArtifactVersion(
  idRaw: unknown,
  htmlRaw: unknown,
  versionInput: PersistVersionInput,
  cwdRaw?: unknown,
  expectedShaRaw?: unknown,
): Promise<{ id: string; manifest: DesignManifest; critique: CritiqueResult; sha: string; currentVersion: number }> {
  const cwd = await resolveDesignCwd(cwdRaw);
  const root = designRootOf(cwd);
  const id = assertArtifactId(idRaw);
  const manifest = await readManifest(root, id);
  await assertExpectedSha(root, id, manifest, expectedShaRaw);
  const html = assertHtml(htmlRaw);
  const { manifest: next, critique } = await persist(root, id, manifest, html, versionInput.note ?? versionInput.origin, versionInput);
  const versions = normalizeVersions(next.versions);
  const last = versions[versions.length - 1];
  return {
    id,
    manifest: next,
    critique,
    sha: last ? last.sha : sha256Hex(html),
    currentVersion: versions.length,
  };
}

/**
 * REQ-190 — the artifact's history (oldest first) plus which entry is current.
 * A pre-REQ-190 artifact reports `[]` with `currentVersion: 0` — honest, so the
 * picker renders an honest "no history yet" state instead of faking v1.
 */
export async function listArtifactVersions(
  idRaw: unknown,
  cwdRaw?: unknown,
): Promise<{ id: string; versions: DesignVersion[]; currentVersion: number; sha: string }> {
  const cwd = await resolveDesignCwd(cwdRaw);
  const root = designRootOf(cwd);
  const id = assertArtifactId(idRaw);
  const manifest = await readManifest(root, id);
  const versions = normalizeVersions(manifest.versions);
  const last = versions[versions.length - 1];
  let sha = '';
  try {
    sha = sha256Hex(await readHtmlFile(root, id));
  } catch {
    sha = last ? last.sha : '';
  }
  return { id, versions, currentVersion: last ? last.n : 0, sha };
}

/**
 * REQ-190 — revert to an earlier version. The archived body is restored as a
 * NEW current body (appended as a `revert` entry) so nothing is destroyed and
 * a redo is just another revert forward. A missing body file is
 * `version_body_missing` 409 — the ledger survives, the current version does
 * not change, so a failed revert never corrupts the artifact.
 */
export async function revertArtifact(
  idRaw: unknown,
  versionRaw: unknown,
  cwdRaw?: unknown,
): Promise<{ id: string; manifest: DesignManifest; critique: CritiqueResult; currentVersion: number; restoredFrom: number }> {
  const cwd = await resolveDesignCwd(cwdRaw);
  const root = designRootOf(cwd);
  const id = assertArtifactId(idRaw);
  const manifest = await readManifest(root, id);
  const versions = normalizeVersions(manifest.versions);
  if (typeof versionRaw !== 'number' || !Number.isInteger(versionRaw)) {
    throw new DesignError('bad_version', 'version must be an integer index', 400);
  }
  const target = versions.find((v) => v.n === versionRaw);
  if (!target) {
    throw new DesignError('version_not_found', `no version ${versionRaw} for design ${id}`, 404);
  }
  const html = await readVersionHtml(root, id, target.sha);
  if (html === null) {
    throw new DesignError(
      'version_body_missing',
      `version ${versionRaw} of ${id} has no stored body — the artifact is unchanged`,
      409,
    );
  }
  const label = versions.find((v) => v.n === target.n);
  const { manifest: next, critique } = await persist(
    root,
    id,
    manifest,
    html,
    `revert to v${versionRaw}`,
    { origin: 'revert', note: `reverted to v${versionRaw}`, model: label?.model },
  );
  const after = normalizeVersions(next.versions);
  return {
    id,
    manifest: next,
    critique,
    currentVersion: after.length ? after[after.length - 1].n : 0,
    restoredFrom: target.n,
  };
}

/** Full detail: manifest + HTML + last critique + REQ-190 sha/currentVersion. */
export async function getArtifact(idRaw: unknown, cwdRaw?: unknown): Promise<DesignDetail> {
  const cwd = await resolveDesignCwd(cwdRaw);
  const root = designRootOf(cwd);
  const id = assertArtifactId(idRaw);
  const manifest = await readManifest(root, id);
  const html = await readHtmlFile(root, id);
  const critique = await readCritiqueFile(root, id);
  const versions = normalizeVersions(manifest.versions);
  const last = versions[versions.length - 1];
  return {
    id,
    manifest,
    html,
    critique,
    sha: sha256Hex(html),
    currentVersion: last ? last.n : 0,
  };
}

/**
 * Delete an artifact — removes its whole on-disk dir (`artifact.json` +
 * `artifact.html` + `design.md` + `critique.json`). Unknown ids 404 via
 * `readManifest` before anything is touched; bad shapes 400 via
 * `assertArtifactId`. The id is validated to a single path segment so
 * `rm` can never escape the design root.
 */
export async function deleteArtifact(idRaw: unknown, cwdRaw?: unknown): Promise<{ id: string }> {
  const cwd = await resolveDesignCwd(cwdRaw);
  const root = designRootOf(cwd);
  const id = assertArtifactId(idRaw);
  await readManifest(root, id); // 404 on unknown before touching disk.
  await rm(dirOf(root, id), { recursive: true, force: true });
  return { id };
}

/** Re-run the 5D critique over the stored HTML (persists the result). */
export async function critiqueArtifact(idRaw: unknown, cwdRaw?: unknown): Promise<{ id: string; critique: CritiqueResult }> {
  const cwd = await resolveDesignCwd(cwdRaw);
  const root = designRootOf(cwd);
  const id = assertArtifactId(idRaw);
  const manifest = await readManifest(root, id);
  const html = await readHtmlFile(root, id);
  const critique = critiqueHtml(html, manifest.system);
  await writeAtomic(join(dirOf(root, id), 'critique.json'), JSON.stringify(critique, null, 2));
  return { id, critique };
}

/**
 * List artifacts (newest first, capped) — REQ-178: scoped to the selected
 * project `cwd` when given, else the global root. Missing/corrupt dirs are
 * skipped; `project`/`root` echo the resolved scope back to the caller.
 */
export async function listArtifacts(
  cwdRaw?: unknown,
): Promise<{ items: DesignSummary[]; count: number; project: string | null; root: string }> {
  const cwd = await resolveDesignCwd(cwdRaw);
  const root = designRootOf(cwd);
  await ensureDir(root);
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return { items: [], count: 0, project: cwd, root };
  }
  const items: DesignSummary[] = [];
  for (const name of names.slice(0, DESIGN_LIST_CAP * 2)) {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(name)) continue;
    try {
      const manifest = await readManifest(root, name);
      const html = await readHtmlFile(root, name);
      const critique = await readCritiqueFile(root, name);
      // REQ-190 — the ledger array stays off the list (lean rows); the pane
      // fetches the history for the SELECTED artifact only.
      const { versions, ...lean } = manifest;
      const last = versions ? versions[versions.length - 1] : undefined;
      items.push({
        ...lean,
        bytes: html.length,
        overall: critique ? critique.overall : null,
        versionCount: normalizeVersions(versions).length,
        currentVersion: last ? last.n : 0,
      });
    } catch {
      continue;
    }
    if (items.length >= DESIGN_LIST_CAP) break;
  }
  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return { items, count: items.length, project: cwd, root };
}

/** Export an artifact — real file bytes for formats the server serves. */
export async function exportArtifact(
  idRaw: unknown,
  formatRaw: unknown,
  cwdRaw?: unknown,
): Promise<{ filename: string; contentType: string; body: string | Buffer }> {
  const cwd = await resolveDesignCwd(cwdRaw);
  const root = designRootOf(cwd);
  const id = assertArtifactId(idRaw);
  const manifest = await readManifest(root, id);
  const html = await readHtmlFile(root, id);
  const format = typeof formatRaw === 'string' ? formatRaw : '';
  if (format === 'html') {
    return { filename: `${id}.html`, contentType: 'text/html; charset=utf-8', body: html };
  }
  if (format === 'json') {
    const critique = await readCritiqueFile(root, id);
    return {
      filename: `${id}.json`,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ ...manifest, critique }, null, 2),
    };
  }
  if (format === 'zip') {
    let designMd = '';
    try {
      designMd = await readFile(join(dirOf(root, id), 'design.md'), 'utf-8');
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
