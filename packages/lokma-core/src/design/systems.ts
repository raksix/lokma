/**
 * Design system catalog (REQ-191) — the directory-backed brand system store
 * behind `GET /api/design/systems`, `POST /api/design/systems` (install) and
 * `POST /api/design/systems/:id/use`.
 *
 * Today `GET /api/design/systems` answers a hardcoded `DESIGN_SYSTEM_META`
 * table (4 bundled cards). This module reads the REAL catalog from
 * `~/.lokma/design/systems/<id>/manifest.json` (Docs/34 §5.1 package
 * contract: `manifest.json` + `DESIGN.md` + `tokens.css`), keeps the bundled
 * table as an always-present fallback so the picker never goes empty, and
 * exposes install/activate so a selected system's tokens actually reach
 * generation.
 *
 * Design rules (measured, not assumed):
 * - A BROKEN package must never break the catalog. `parseSystemManifest`
 *   returns a discriminated result; the scan records the failure on the row
 *   (`status: 'invalid'` + `problem`) and keeps going.
 * - The bundled cards are a FALLBACK, not a hardcoded answer: the response
 *   always carries `source: 'catalog' | 'bundled'` so the client never
 *   claims a catalog that is not there.
 * - No second SSRF guard. Install reuses `assertInstallUrl` from the
 *   browser engine's guard family via the same shape the skill marketplace
 *   uses (`isPrivateHost`), because a fetch to a user-supplied URL is the
 *   same risk — but the marketplace copy is module-private, so the shared
 *   predicate is exported here and the marketplace keeps its own copy
 *   (no cross-module refactor in a single slice; the DRY merge is tracked).
 */

import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rm, stat, writeFile, cp } from 'node:fs/promises';
import { join, resolve as resolvePath, basename } from 'node:path';
import { promisify } from 'node:util';
import { expandHome } from '../utils/fs.js';
import {
  DESIGN_SYSTEM_META,
  DesignError,
  type DesignSystem,
  type DesignSystemMeta,
} from './types.js';
import { resolveDesignCwd } from './store.js';

const execFileAsync = promisify(execFile);

/** Catalog root (global, same shape as `DESIGN_DIR`). */
export const DESIGN_SYSTEMS_DIR = '~/.lokma/design/systems';

/** Per-file byte cap while reading a package manifest (a manifest is small). */
export const SYSTEM_MANIFEST_CAP = 64 * 1024;
/** `DESIGN.md` / `tokens.css` byte cap on activation (a guard reads 512KB). */
export const SYSTEM_ASSET_CAP = 512 * 1024;
/** Max packages listed (the picker renders rows, not a virtual list). */
export const SYSTEM_LIST_CAP = 300;
/** Accepted `source` length for install (a URL or an absolute local path). */
export const SYSTEM_SOURCE_CAP = 500;
/** git clone timeout — an install that hangs is worse than one that fails. */
const CLONE_TIMEOUT_MS = 60_000;

/** Directory id charset — also the filename jail for install and activate. */
const SYSTEM_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Taxonomy headings from the OpenDesign catalog README (Docs/34 §5). */
export const SYSTEM_CATEGORIES = [
  'Starter',
  'AI / LLM',
  'Developer Tools',
  'Productivity',
  'Fintech',
  'E-commerce',
  'Media',
  'Automotive',
  'Other',
] as const;
export type SystemCategory = (typeof SYSTEM_CATEGORIES)[number];

/**
 * A catalog row. `id`/`label`/`category`/`description` drive the grouped
 * picker; `origin` is the honesty channel — a bundled row is never
 * presented as an installed package.
 */
export type DesignSystemRow = {
  id: string;
  label: string;
  category: SystemCategory;
  description: string;
  /** Where the row came from: an installed package, or the bundled fallback. */
  origin: 'catalog' | 'bundled';
  /** Package files, relative to the package dir (bundled rows carry none). */
  files: string[];
  /** Set when the package was found but is unusable — the row still lists. */
  status: 'ok' | 'invalid';
  /** Human reason for `status: 'invalid'`; absent for a healthy package. */
  problem?: string;
};

/** Raw `manifest.json` shape, all fields optional but id required. */
export type SystemManifest = {
  id?: unknown;
  name?: unknown;
  label?: unknown;
  description?: unknown;
  category?: unknown;
  version?: unknown;
  tokens?: unknown;
};

/** Result of parsing a manifest: a row, or the reason it is unusable. */
export type ManifestParseResult =
  | { ok: true; manifest: SystemManifest; id: string; label: string; category: SystemCategory; description: string }
  | { ok: false; reason: string };

/** Absolute catalog root on this machine. */
export function systemsRoot(): string {
  return expandHome(DESIGN_SYSTEMS_DIR);
}

/**
 * Resolve the catalog root. `rootOverride` exists for the unit probe, which
 * must never write the real `~/.lokma/design/systems` — `os.homedir()` is
 * CACHED by the runtime, so overriding `process.env.HOME` inside a test is
 * NOT enough (measured: `homedir()` keeps returning the boot value). Tests
 * therefore inject a tmp root explicitly instead of pretending HOME works.
 */
function rootOf(rootOverride?: string): string {
  return rootOverride ? resolvePath(rootOverride) : systemsRoot();
}

/**
 * REQ-191 — pure: map a free-text category onto the taxonomy, so an
 * unknown heading lands in `Other` instead of inventing a group the picker
 * has no ordering for.
 */
export function normalizeSystemCategory(raw: unknown): SystemCategory {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!text) return 'Other';
  const flat = text.replace(/[_\-/]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const cat of SYSTEM_CATEGORIES) {
    if (cat.toLowerCase() === flat) return cat;
  }
  // Common synonyms from the OpenDesign taxonomy, matched on a prefix so
  // "AI & LLM" / "ai llm" / "AI" all land on the same group.
  if (/^ai\b|^llm\b|^ai /.test(flat)) return 'AI / LLM';
  if (/^dev/.test(flat)) return 'Developer Tools';
  if (/^product/.test(flat)) return 'Productivity';
  if (/^fin|^fintech|^bank|^pay/.test(flat)) return 'Fintech';
  if (/^e ?-?commerce|^shop|^commerce/.test(flat)) return 'E-commerce';
  if (/^media|^entertain/.test(flat)) return 'Media';
  if (/^auto|^car|^vehicle/.test(flat)) return 'Automotive';
  return 'Other';
}

/**
 * REQ-191 — pure: validate one `manifest.json` body. A package without a
 * usable `id` cannot be listed, jailed or activated, so it is rejected here
 * rather than half-listed. Missing label/description/category are DEFAULTS,
 * not errors: the picker needs a row, and the taxonomy has an `Other` bucket.
 */
export function parseSystemManifest(raw: unknown): ManifestParseResult {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'manifest.json is not a JSON object' };
  }
  const m = raw as SystemManifest;
  const idRaw = typeof m.id === 'string' ? m.id.trim().toLowerCase() : '';
  if (!idRaw) return { ok: false, reason: 'manifest.json has no "id"' };
  if (!SYSTEM_ID_PATTERN.test(idRaw)) {
    return { ok: false, reason: `manifest id "${idRaw}" is not a valid package id` };
  }
  const label = (typeof m.name === 'string' && m.name.trim()) || (typeof m.label === 'string' && m.label.trim()) || idRaw;
  const description = typeof m.description === 'string' ? m.description.trim().slice(0, 240) : '';
  return {
    ok: true,
    manifest: m,
    id: idRaw,
    label: label.slice(0, 80),
    category: normalizeSystemCategory(m.category),
    description,
  };
}

/**
 * REQ-191 — pure: does this row come from the catalog or from the bundled
 * fallback table? Bundled rows keep their OWN tokens (the generate path
 * reads `DESIGN_SYSTEM_META[req.system]`), so a bundled id must NOT be
 * claimed as an installed package.
 */
function bundledRow(id: DesignSystem, meta: DesignSystemMeta): DesignSystemRow {
  return {
    id,
    label: meta.name,
    category: 'Starter',
    description: `${meta.tokens} · preset ${meta.preset}`,
    origin: 'bundled',
    files: [],
    status: 'ok',
  };
}

/**
 * REQ-191 — read one installed package dir. A missing `DESIGN.md` or
 * `tokens.css` does not hide the row (the manifest is the contract entry
 * point) but is reported in `files` so the client can be honest about what
 * activation would copy.
 */
async function readPackage(dir: string, id: string): Promise<DesignSystemRow | null> {
  let raw: string;
  try {
    const st = await stat(join(dir, 'manifest.json'));
    if (!st.isFile()) return null;
    if (st.size > SYSTEM_MANIFEST_CAP) {
      return {
        id,
        label: id,
        category: 'Other',
        description: '',
        origin: 'catalog',
        files: [],
        status: 'invalid',
        problem: `manifest.json too large (>${SYSTEM_MANIFEST_CAP} bytes)`,
      };
    }
    raw = await readFile(join(dir, 'manifest.json'), 'utf-8');
  } catch {
    return null;
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return {
      id,
      label: id,
      description: '',
      category: 'Other',
      origin: 'catalog',
      files: [],
      status: 'invalid',
      problem: 'manifest.json is not valid JSON',
    };
  }
  const parsed = parseSystemManifest(parsedJson);
  if (!parsed.ok) {
    return {
      id,
      label: id,
      description: '',
      category: 'Other',
      origin: 'catalog',
      files: [],
      status: 'invalid',
      problem: parsed.reason,
    };
  }
  // The DIRECTORY name is the jail; a manifest that renames itself must not
  // be able to write outside its own package dir on activation.
  const files: string[] = [];
  for (const f of ['DESIGN.md', 'tokens.css', 'design-tokens.json', 'tailwind-v4.css', 'USAGE.md']) {
    try {
      const s = await stat(join(dir, f));
      if (s.isFile()) files.push(f);
    } catch {
      // absent — not an error, the manifest is the entry point
    }
  }
  return {
    id,
    label: parsed.label,
    category: parsed.category,
    description: parsed.description,
    origin: 'catalog',
    files,
    status: 'ok',
  };
}

/**
 * REQ-191 — the catalog. Installed packages first (real catalog), bundled
 * cards appended as a fallback ONLY when the directory yields nothing, so a
 * fresh install shows the real 151-package taxonomy and a bare install shows
 * today's 4 cards instead of an empty picker.
 *
 * A package dir that cannot be read is skipped silently (it is not a
 * package at all); a package dir that reads but is invalid is listed with
 * `status: 'invalid'`.
 */
export async function listDesignSystems(rootOverride?: string): Promise<{
  systems: DesignSystemRow[];
  count: number;
  source: 'catalog' | 'bundled';
  root: string;
  categories: readonly SystemCategory[];
}> {
  const root = rootOf(rootOverride);
  const rows: DesignSystemRow[] = [];
  let names: string[] = [];
  try {
    names = await readdir(root);
  } catch {
    names = [];
  }
  for (const name of names.sort()) {
    if (rows.length >= SYSTEM_LIST_CAP) break;
    if (name.startsWith('.') || !SYSTEM_ID_PATTERN.test(name)) continue;
    const row = await readPackage(join(root, name), name);
    if (row) rows.push(row);
  }
  const source: 'catalog' | 'bundled' = rows.length > 0 ? 'catalog' : 'bundled';
  if (source === 'bundled') {
    for (const meta of Object.values(DESIGN_SYSTEM_META)) {
      rows.push(bundledRow(meta.id, meta));
    }
  }
  return { systems: rows, count: rows.length, source, root, categories: SYSTEM_CATEGORIES };
}

/** SSRF predicate — the shape `browser-engine.ts` and `marketplace.ts` use. */
function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase().replace(/\.$/, '');
  if (lower === 'localhost' || lower === '::1' || lower === '[::1]') return true;
  if (/^127\./.test(lower) || lower === '0.0.0.0') return true;
  if (/^10\./.test(lower) || /^192\.168\./.test(lower)) return true;
  const m172 = lower.match(/^172\.(\d+)\./);
  if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return true;
  // Link-local + CGNAT — a private-network pivot through a public name.
  if (/^169\.254\./.test(lower)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(lower)) return true;
  return false;
}

/**
 * REQ-191 — validate an install source. A local ABSOLUTE path is allowed
 * (the CLI's documented `add <path>` case, e.g. a package you just wrote);
 * an http(s) URL must be https and must not target a private/loopback/
 * link-local host. Credentials in the URL are refused.
 */
export function assertInstallSource(raw: unknown): { kind: 'path'; path: string } | { kind: 'url'; url: string } {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > SYSTEM_SOURCE_CAP) {
    throw new DesignError('bad_source', `source must be a non-empty path or https URL (max ${SYSTEM_SOURCE_CAP} chars)`, 400);
  }
  const text = raw.trim();
  if (/^https?:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      throw new DesignError('bad_source', 'source is not a valid URL', 400);
    }
    if (url.protocol !== 'https:') {
      throw new DesignError('bad_source', 'Only https sources are accepted', 400);
    }
    if (url.username || url.password || text.includes('@')) {
      throw new DesignError('bad_source', 'Sources must not carry credentials', 400);
    }
    if (isPrivateHost(url.hostname)) {
      throw new DesignError('bad_source', 'Sources must not target local/private hosts', 400);
    }
    return { kind: 'url', url: text };
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || text.startsWith('..')) {
    // Another scheme (file:, ftp:, ssh:) or a traversal — refuse rather than
    // silently treat it as a local path.
    throw new DesignError('bad_source', 'Only an absolute local path or an https URL is accepted', 400);
  }
  return { kind: 'path', path: resolvePath(expandHome(text)) };
}

/**
 * REQ-191 — derive the package id from a local path (last meaningful
 * segment, cleaned). Mirrors `slugFromSkillUrl` so a directory named
 * `stripe-design-system` installs as `stripe-design-system`.
 */
export function systemIdFromSource(source: string): string {
  const name = basename(source.replace(/[/\\]+$/, '')).toLowerCase();
  const cleaned = name
    .replace(/\.(git|tgz|tar\.gz|zip)$/i, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 64);
  if (!SYSTEM_ID_PATTERN.test(cleaned)) {
    throw new DesignError('bad_source', `Cannot derive a package id from "${name}"`, 400);
  }
  return cleaned;
}

/**
 * REQ-191 — install a design system package into
 * `~/.lokma/design/systems/<id>/`.
 *
 * A local path is copied with a size budget; an https URL is cloned
 * shallowly. Either way the package must carry a parseable `manifest.json`
 * or the install ROLLS BACK (an unusable directory would show up as an
 * `invalid` row forever). An existing id answers 409.
 */
export async function installDesignSystem(
  rawSource: unknown,
  rootOverride?: string,
): Promise<{ id: string; files: string[]; source: string }> {
  const src = assertInstallSource(rawSource);
  const id = systemIdFromSource(src.kind === 'url' ? new URL(src.url).pathname.replace(/\/+$/, '') : src.path);
  const root = rootOf(rootOverride);
  const target = join(root, id);
  try {
    const st = await stat(target);
    if (st) throw new DesignError('system_exists', `Design system '${id}' is already installed`, 409);
  } catch (e) {
    if (e instanceof DesignError) throw e;
    // Missing path — the install proceeds.
  }
  await mkdir(root, { recursive: true });
  if (src.kind === 'path') {
    let st;
    try {
      st = await stat(src.path);
    } catch {
      throw new DesignError('source_not_found', `No such package directory: ${src.path}`, 404);
    }
    if (!st.isDirectory()) {
      throw new DesignError('bad_source', `Source is not a directory: ${src.path}`, 400);
    }
    try {
      await cp(src.path, target, { recursive: true, force: false });
    } catch (e) {
      await rm(target, { recursive: true, force: true });
      throw new DesignError('copy_failed', `Could not copy the package: ${(e as Error).message}`, 400);
    }
  } else {
    try {
      await execFileAsync('git', ['clone', '--depth', '1', src.url, target], {
        timeout: CLONE_TIMEOUT_MS,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
    } catch (e) {
      await rm(target, { recursive: true, force: true });
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        throw new DesignError('git_missing', 'git is not installed on the server', 500);
      }
      throw new DesignError('clone_failed', `git clone failed (${typeof code === 'string' ? code : 'exit'}) — is the source a public repo?`, 400);
    }
  }
  const row = await readPackage(target, id);
  if (!row || row.status !== 'ok') {
    await rm(target, { recursive: true, force: true });
    throw new DesignError('no_manifest', `The package has no usable manifest.json (${row?.problem ?? 'not found'})`, 400);
  }
  return { id, files: row.files, source: typeof rawSource === 'string' ? rawSource : '' };
}

/**
 * REQ-191 — activate a system for a project: copy its `DESIGN.md` +
 * `tokens.css` into `<cwd>/.lokma/`. This is exactly what
 * `GET /api/design/guard` reads (`.lokma/DESIGN.md`), so activation is
 * visible in production without a second reader.
 *
 * The package DIRECTORY is the jail: ids are validated against
 * `SYSTEM_ID_PATTERN` and the resolved path must stay inside the catalog
 * root, so `..` can never escape. A package missing an asset answers 404
 * naming the file — honest, not a silent empty copy.
 */
export async function useDesignSystem(
  idRaw: unknown,
  cwdRaw: unknown,
  rootOverride?: string,
): Promise<{ id: string; cwd: string; copied: string[]; tokens: string | null }> {
  const id = typeof idRaw === 'string' ? idRaw.trim().toLowerCase() : '';
  if (!SYSTEM_ID_PATTERN.test(id)) {
    throw new DesignError('bad_id', `Invalid design system id: ${String(idRaw)}`, 400);
  }
  const cwd = await resolveDesignCwd(cwdRaw ?? process.cwd());
  if (cwd === null) {
    throw new DesignError('bad_cwd', 'A project cwd is required to activate a design system', 400);
  }
  const root = rootOf(rootOverride);
  const pkgDir = resolvePath(join(root, id));
  if (pkgDir !== join(root, id)) {
    throw new DesignError('bad_id', 'Refusing a package path outside the catalog root', 400);
  }
  const row = await readPackage(pkgDir, id);
  if (!row) {
    throw new DesignError('system_not_found', `No installed design system '${id}'`, 404);
  }
  if (row.status !== 'ok') {
    throw new DesignError('system_invalid', `Design system '${id}' is not usable: ${row.problem ?? 'invalid manifest'}`, 400);
  }
  const copied: string[] = [];
  let tokens: string | null = null;
  await mkdir(join(cwd, '.lokma'), { recursive: true });
  for (const file of ['DESIGN.md', 'tokens.css']) {
    let text: string;
    try {
      const st = await stat(join(pkgDir, file));
      if (!st.isFile()) continue;
      if (st.size > SYSTEM_ASSET_CAP) {
        throw new DesignError('system_invalid', `${file} is too large (>${SYSTEM_ASSET_CAP} bytes)`, 400);
      }
      text = await readFile(join(pkgDir, file), 'utf-8');
    } catch (e) {
      if (e instanceof DesignError) throw e;
      continue;
    }
    await writeFile(join(cwd, '.lokma', file), text, 'utf-8');
    copied.push(file);
    if (file === 'tokens.css') tokens = text;
  }
  if (copied.length === 0) {
    throw new DesignError('system_incomplete', `Design system '${id}' carries neither DESIGN.md nor tokens.css`, 400);
  }
  return { id, cwd, copied, tokens };
}